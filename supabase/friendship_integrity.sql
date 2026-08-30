-- LiveHoops: make a friendship require both people to agree.
-- Run this manually in the Supabase SQL editor, AFTER block_users.sql (this
-- file redefines friendships_insert_own again, on top of the block check that
-- file added — the same layering rate_limits.sql does for dm_insert_own).
-- Safe to re-run.
--
-- ── SECURITY FIX: anyone could declare themselves your friend ───────────────
--
-- The insert policy (rls_policies.sql, then block_users.sql) checked only that
-- you were the requester:
--
--     with check (requester_id = auth.uid() and not is_blocked(...))
--
-- Nothing forced the new row to be a REQUEST. So any logged-in user could post
-- a row saying `requester_id = me, addressee_id = you, status = 'accepted'`
-- straight through the public API — no request sent, nothing for you to accept,
-- no way for you to notice.
--
-- That one row was enough, because is_accepted_friend() is the hinge every
-- other privacy guard in this database hangs on. With it in place an attacker
-- could:
--
--   • DM you                     — dm_insert_own (rate_limits.sql) passes
--   • read your 'friends'/'private' posts and their comments
--                                — can_view_posts_of (block_users.sql) passes
--   • see which court you are standing on RIGHT NOW, and when you last played
--                                — get_friends_activity (friend_activity_rpc.sql)
--
-- That last one is the same class of leak friend_checkin_authorization.sql was
-- written to close. The guard it added was correct; this is simply a second
-- door into the same room, and the reason it stayed open is that the guard
-- trusts the friendships table to mean what it says.
--
-- There was a second, narrower path too. The update policy had a USING clause
-- and no WITH CHECK, and no column restriction — so the addressee of any row
-- could rewrite requester_id to point at a stranger and accept it.
--
-- ── The fix: three overlapping layers ───────────────────────────────────────
--
--   1. CHECK constraints — the backstop. True regardless of which policy is
--      in force, so a future policy edit cannot reopen this by itself.
--   2. INSERT policy — a new friendship must be a pending request to someone
--      other than yourself.
--   3. UPDATE column grant — the addressee decides the status and touches
--      nothing else. RLS cannot compare a new row against the old one, so a
--      WITH CHECK alone cannot pin requester_id; a column-level grant can.
--      This is exactly the mechanism privacy_enforcement.sql already uses to
--      make direct_messages content immutable while still letting a recipient
--      set read_at.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- The bottom of this file contains the previous policies verbatim. Running that
-- block restores the old behaviour immediately — including, to be clear about
-- it, the hole. The constraints can stay (they are true of every row the app
-- writes) or be dropped separately.
--
-- ── The app needs no changes ────────────────────────────────────────────────
-- Verified against the client before writing this:
--   sendFriendRequest    (useFriends.js) already inserts status: 'pending'
--   acceptFriendRequest  (useFriends.js) updates status alone → 'accepted'
--   declineFriendRequest (useFriends.js) updates status alone → 'declined'
-- The .select('requester_id') riding along on the accept is a SELECT, a
-- separate privilege, still allowed by friendships_select_own.


-- ── 0. Before you run this: check for rows the constraints would reject ─────
-- Run these two SELECTs FIRST. If either returns anything unexpected, the
-- ALTER TABLE below will fail — which is the constraint doing its job, and a
-- signal that the hole has already been used or that some other path is
-- writing rows the app never writes.
--
--     select requester_id = addressee_id as self_row, status, count(*)
--     from   public.friendships
--     group  by 1, 2;
--
--     select * from public.friendships where requester_id = addressee_id;
--
-- Expect: only 'pending' / 'accepted' / 'declined', and zero self_row = true.


-- Wrapped in a transaction, the way configurable_auto_checkout.sql is and for
-- the same reason: the constraints and the policies must not apply separately.
-- Constraints without the new INSERT policy would let a hostile row through and
-- then reject it at the constraint — noisy but survivable. Policies without the
-- constraints removes the backstop. If any statement below fails (most likely
-- the ALTER TABLEs, on pre-existing rows the constraints reject) NOTHING is
-- applied and the database is exactly as it was.

begin;

-- ── 1. Constraints ──────────────────────────────────────────────────────────
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each is wrapped in a guard
-- on pg_constraint to keep this file re-runnable like every other file here.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'friendships_status_check'
  ) then
    alter table public.friendships
      add constraint friendships_status_check
      check (status in ('pending', 'accepted', 'declined'));
  end if;
end $$;

-- You cannot befriend yourself. Beyond being meaningless, a self-row was the
-- cheapest way to manufacture a row you were the addressee of, and therefore
-- allowed to update — see the second attack path in the header.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'friendships_not_self'
  ) then
    alter table public.friendships
      add constraint friendships_not_self
      check (requester_id <> addressee_id);
  end if;
end $$;


-- ── 2. INSERT: a new friendship is a REQUEST, and nothing else ──────────────
-- Keeps the not-blocked check block_users.sql added; adds the two clauses that
-- close the hole. status = 'pending' is the line that matters.

drop policy if exists "friendships_insert_own" on public.friendships;
create policy "friendships_insert_own"
on public.friendships for insert
to authenticated
with check (
  requester_id = auth.uid()
  and addressee_id <> auth.uid()
  and status = 'pending'
  and not public.is_blocked(auth.uid(), addressee_id)
);


-- ── 3. UPDATE: the addressee answers the request, and changes nothing else ──
-- The policy says WHO may update (the addressee) and WHAT the row may become
-- (answered, never reverted to pending — a request cannot be un-answered by
-- the person who answered it).

drop policy if exists "friendships_update_own" on public.friendships;
create policy "friendships_update_own"
on public.friendships for update
to authenticated
using (addressee_id = auth.uid())
with check (
  addressee_id = auth.uid()
  and status in ('accepted', 'declined')
);

-- The column grant says WHICH COLUMNS may change. This is the part the policy
-- above cannot express: RLS has no access to the pre-update row, so nothing in
-- a WITH CHECK can stop `set requester_id = '<a stranger>'`. Revoking UPDATE
-- and granting it back on one column can.
revoke update on public.friendships from authenticated;
grant  update (status) on public.friendships to authenticated;

commit;


-- ── Verifying this after applying it ────────────────────────────────────────
--
-- Testing only the denied cases proves half of a security fix: a change that
-- silently stops real friend requests from working is worse than the hole it
-- closed, and would look like success in a test suite that only tries attacks.
-- Run all six.
--
-- NOTE, and this trips people up every time: auth.uid() is NULL in the SQL
-- editor's default context, which makes every one of these fail for the wrong
-- reason. Run them signed in as a real user, or with an impersonated role.
--
-- a) DENIED — the hole itself. As any logged-in user:
--
--      insert into public.friendships (requester_id, addressee_id, status)
--      values (auth.uid(), '<stranger-uuid>', 'accepted');
--
--    Expect: rejected. Before this migration it succeeded, and that row alone
--    handed over DMs, private posts and live location.
--
-- b) DENIED — the self-row trick that manufactured an updatable row:
--
--      insert into public.friendships (requester_id, addressee_id, status)
--      values (auth.uid(), auth.uid(), 'pending');
--
--    Expect: rejected by friendships_not_self.
--
-- c) ALLOWED — a normal friend request still works:
--
--      insert into public.friendships (requester_id, addressee_id, status)
--      values (auth.uid(), '<stranger-uuid>', 'pending');
--
--    Expect: one row. If this fails, the fix has broken the feature and must
--    not ship.
--
-- d) ALLOWED — as the ADDRESSEE of that row, answer it:
--
--      update public.friendships set status = 'accepted' where id = '<row-id>';
--
--    Expect: one row updated. Repeat with 'declined' on another row.
--
-- e) DENIED — as the addressee, try to rewrite who sent it:
--
--      update public.friendships set requester_id = '<someone-else>'
--      where id = '<row-id>';
--
--    Expect: rejected — "permission denied for column requester_id".
--
-- f) ALLOWED — the whole flow in the app: send a request from one account,
--    see it arrive on the other, accept it, confirm both sides now see each
--    other in Your Crew, then decline a second request. All four steps must
--    behave exactly as before.


-- ── ROLLBACK: the previous policies, verbatim ───────────────────────────────
-- Run this block to restore the behaviour that was in place before this file.
--
-- Be clear about what that means: it reopens the hole described at the top.
-- Anyone could again insert an already-accepted friendship with anyone, and
-- with it take DMs, friends-only posts and live location. Only run this if the
-- new policies have broken something worse, and treat it as temporary.
--
-- The constraints are deliberately NOT dropped here. They are true of every row
-- the app has ever written, so leaving them costs nothing and keeps the
-- backstop in place even while the policies are relaxed. To drop them anyway:
--
--   alter table public.friendships drop constraint friendships_status_check;
--   alter table public.friendships drop constraint friendships_not_self;
--
-- begin;
--
-- -- The insert policy as block_users.sql left it.
-- drop policy if exists "friendships_insert_own" on public.friendships;
-- create policy "friendships_insert_own"
-- on public.friendships for insert
-- to authenticated
-- with check (
--   requester_id = auth.uid()
--   and not public.is_blocked(auth.uid(), addressee_id)
-- );
--
-- -- The update policy as rls_policies.sql left it: no WITH CHECK.
-- drop policy if exists "friendships_update_own" on public.friendships;
-- create policy "friendships_update_own"
-- on public.friendships for update
-- to authenticated
-- using (addressee_id = auth.uid());
--
-- -- And UPDATE back on every column, not just status.
-- grant update on public.friendships to authenticated;
--
-- commit;
