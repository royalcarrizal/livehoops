-- LiveHoops: remove the shadow set of RLS policies.
-- Run this manually in the Supabase SQL editor. Safe to re-run.
--
-- ⚠️  RUN THIS BEFORE friendship_integrity.sql. That file tightens the
--     friendships INSERT/UPDATE rules, and until the legacy policies below are
--     gone it cannot work — see why in the next section.
--
-- ── THE PROBLEM: two complete sets of policies, and the loosest one wins ────
--
-- Every table in this app has TWO sets of RLS policies:
--
--   • a set created by hand in the dashboard, with sentence-style names
--     ("Users can send messages", "Anyone can read comments")
--   • the set in this directory, with snake_case names
--     (dm_insert_own, comments_select_visible)
--
-- Postgres combines multiple PERMISSIVE policies for the same command with OR.
-- A row is allowed if ANY of them says yes. So every hardening migration in
-- this directory has been running alongside the very policy it was written to
-- replace, and the weaker rule has governed the whole time. Each file's
-- `drop policy if exists` only ever named its own policy; the dashboard
-- original was never touched.
--
-- This was invisible from the repository. Every file here is correct. You can
-- only see it by querying pg_policies on the live database:
--
--     select tablename, cmd,
--            count(*) filter (where policyname like '% %')     as legacy,
--            count(*) filter (where policyname not like '% %') as tracked
--     from   pg_policies
--     where  schemaname = 'public'
--     group  by tablename, cmd
--     having count(*) filter (where policyname like '% %') > 0
--     order  by tablename, cmd;
--
-- ── WHAT WAS ACTUALLY UNENFORCED ────────────────────────────────────────────
--
--   direct_messages INSERT — "Users can send messages" is (sender_id = uid),
--     nothing more. So ANY user could DM ANY user, and three migrations were
--     doing nothing: friends-only (privacy_enforcement.sql), the block check
--     (block_users.sql) and the 30/minute throttle (rate_limits.sql).
--
--   comments SELECT — "Anyone can read comments" is `true`, so
--     comments_select_visible (block_users.sql) never applied. Comments on
--     friends-only and private posts were readable by anyone logged in.
--
--   friendships INSERT — "Users can send friend requests" is
--     (auth.uid() = requester_id) with no status check, which is the hole
--     friendship_integrity.sql was written to close. Confirmed by hand: a user
--     can insert an already-'accepted' friendship with a stranger.
--
--   friendships UPDATE — "Users can update friendships they received" allows
--     the REQUESTER as well as the addressee, so you can accept your own
--     request. A second, simpler route to the same place.
--
--   courts SELECT — "Anyone can view courts" is `true`, so
--     courts_select_verified never applied and unverified, unmoderated
--     submissions were readable by everyone.
--
-- posts is NOT affected — it has no legacy policy, so posts_select_visible
-- has been the only SELECT rule all along and post privacy held.

begin;

-- ── 1. Widen courts_select_verified FIRST ───────────────────────────────────
-- This has to happen before the legacy `true` policy is dropped, or court
-- submission breaks in a way that looks like a failure but is not one.
--
-- courts_select_verified is `using (verified is true)`. AddCourtSheet inserts a
-- court with verified = false and then calls .select('id').single() on the same
-- request to get the new id. That returning-select is subject to the SELECT
-- policy — so with only the strict rule in place it reads back nothing,
-- .single() errors, and the sheet reports "submit failed" for a court that was
-- in fact saved.
--
-- Letting you see your own pending submission fixes that and is correct on its
-- own terms. It does not put unverified courts on the map: useCourts already
-- filters .eq('verified', true) client-side.
drop policy if exists "courts_select_verified" on public.courts;
create policy "courts_select_verified"
on public.courts for select
to authenticated
using (
  verified is true
  or submitted_by = auth.uid()
);


-- ── 2. Drop the 12 redundant legacy policies ────────────────────────────────
-- Every one of these has a snake_case counterpart that already covers the same
-- operation correctly. Dropping them is what finally lets those rules bind.
--
-- Deliberately NOT dropped, because each is the ONLY policy for its command and
-- removing it would remove the ability entirely:
--   court_reviews DELETE / INSERT / SELECT / UPDATE  (see court_reviews_policies.sql)
--   courts UPDATE                                    (see section 3 below)

drop policy if exists "Users can delete own comments"       on public.comments;
drop policy if exists "Authenticated users can comment"     on public.comments;
drop policy if exists "Anyone can read comments"            on public.comments;

drop policy if exists "Logged in users can submit courts"   on public.courts;
drop policy if exists "Anyone can view courts"              on public.courts;

drop policy if exists "Users can send messages"             on public.direct_messages;
drop policy if exists "Users can view their own messages"   on public.direct_messages;
drop policy if exists "Users can mark messages read"        on public.direct_messages;

drop policy if exists "Users can delete their own friendships"     on public.friendships;
drop policy if exists "Users can send friend requests"             on public.friendships;
drop policy if exists "Users can view their own friendships"       on public.friendships;
drop policy if exists "Users can update friendships they received" on public.friendships;


-- ── 3. courts UPDATE: keep the policy, restrict the columns ─────────────────
-- SEPARATE FINDING, discovered while auditing the above.
--
-- "Users can update their own submitted courts" is (auth.uid() = submitted_by),
-- and it is the only UPDATE policy on courts. RLS cannot restrict columns, and
-- there is no WITH CHECK, so the submitter can update ANY column on their own
-- row — including `verified`. Submit a court, set verified = true, and it is
-- live on everyone's map without ever passing admin moderation.
--
-- The first attempt at this granted UPDATE back on photo_url alone, on the
-- grounds that AddCourtSheet writes it after uploading a court photo. Applying
-- it failed:
--
--     ERROR: 42703: column "photo_url" of relation "courts" does not exist
--
-- Which is a bug of its own, and a bigger one than the grant. AddCourtSheet
-- (line 266) writes photo_url after uploading the image, and normalizeCourt
-- reads row.photo_url — but the column has never existed, so COURT PHOTOS HAVE
-- NEVER WORKED. The photo reaches Storage and the row update fails silently:
-- that call's result is never checked, and `await supabase...update()` resolves
-- with { error } rather than throwing, so the try/catch wrapped around it never
-- fires.
--
-- So there is no column to grant, and the right move is the stronger one:
-- revoke UPDATE on this table from authenticated entirely. No client code path
-- legitimately updates courts — the only one that tried has been failing since
-- it was written. Everything that DOES update courts is unaffected, because it
-- runs as the owner rather than as the caller: admin_review_court() sets
-- verified, the check-in RPCs adjust player_count, and sync_court_rating()
-- maintains the ratings.
--
-- "Users can update their own submitted courts" is left in place but is now
-- inert without the privilege behind it. If court photos are fixed later by
-- adding the column, the feature needs exactly one line back:
--
--     grant update (photo_url) on public.courts to authenticated;
--
-- Adding the column is deliberately NOT done here. It is a schema change to
-- make a broken feature work, which is its own piece of work with its own
-- testing, not something to slip into a security cleanup.
revoke update on public.courts from authenticated;

commit;


-- ── Verifying this after applying it ────────────────────────────────────────
--
-- Run these signed in as a real user. auth.uid() is NULL in the SQL editor's
-- default context, and the editor bypasses RLS as the table owner, so use this
-- harness — the rollback means a test can never leave anything behind:
--
--     begin;
--     select set_config('request.jwt.claims',
--            json_build_object('sub', id, 'role', 'authenticated')::text, true)
--     from public.profiles order by created_at asc limit 1;
--     set local role authenticated;
--
--     -- test statements here
--
--     rollback;
--
-- a) NO LEGACY POLICIES REMAIN except the five deliberate keeps:
--
--      select tablename, cmd, policyname from pg_policies
--      where schemaname = 'public' and policyname like '% %'
--      order by tablename, cmd;
--
--    Expect exactly five rows: court_reviews × 4, and courts UPDATE.
--
-- b) DENIED — a DM to a stranger. This is the big one; it was allowed before:
--
--      insert into public.direct_messages (sender_id, recipient_id, content)
--      values (auth.uid(), '<a-non-friend-uuid>', 'test');
--
--    Expect: rejected.
--
-- c) ALLOWED — a DM to a real friend still works. Run the same insert with a
--    friend's id. Expect: one row. If this fails, messaging is broken and the
--    change must be rolled back.
--
-- d) DENIED — self-approving a court:
--
--      update public.courts set verified = true where submitted_by = auth.uid();
--
--    Expect: "permission denied for column verified".
--
-- e) DENIED — any update to courts as a normal user, not just `verified`:
--
--      update public.courts set name = 'x' where submitted_by = auth.uid();
--
--    Expect: "permission denied for table courts". Nothing in the client
--    legitimately updates this table — see section 3 for why the photo write
--    that looked like it did has never worked.
--
-- f) ALLOWED, in the app — submit a court through Add a Court end to end,
--    with a photo. It must report success, not "Submit failed". This is the
--    case section 1 exists to protect; test it in the app, not in SQL.
--
-- g) ALLOWED, in the app — post a comment, read comments on a friend's post,
--    send a DM to a friend, and open the DM inbox. All four must still work.


-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Restores the legacy policies exactly as they were. Be clear about what that
-- means: it reopens every hole listed at the top, including any-user-to-any-user
-- DMs and the friendships hole.
--
-- begin;
--
-- create policy "Users can delete own comments"   on public.comments for delete to public using (auth.uid() = user_id);
-- create policy "Authenticated users can comment" on public.comments for insert to public with check (auth.uid() = user_id);
-- create policy "Anyone can read comments"        on public.comments for select to public using (true);
--
-- create policy "Logged in users can submit courts" on public.courts for insert to public with check (auth.uid() = submitted_by);
-- create policy "Anyone can view courts"            on public.courts for select to public using (true);
--
-- create policy "Users can send messages"           on public.direct_messages for insert to authenticated with check (sender_id = auth.uid());
-- create policy "Users can view their own messages" on public.direct_messages for select to authenticated using ((sender_id = auth.uid()) or (recipient_id = auth.uid()));
-- create policy "Users can mark messages read"      on public.direct_messages for update to authenticated using (recipient_id = auth.uid());
--
-- create policy "Users can delete their own friendships"     on public.friendships for delete to public using ((auth.uid() = requester_id) or (auth.uid() = addressee_id));
-- create policy "Users can send friend requests"             on public.friendships for insert to public with check (auth.uid() = requester_id);
-- create policy "Users can view their own friendships"       on public.friendships for select to public using ((auth.uid() = requester_id) or (auth.uid() = addressee_id));
-- create policy "Users can update friendships they received" on public.friendships for update to public using ((auth.uid() = addressee_id) or (auth.uid() = requester_id));
--
-- drop policy if exists "courts_select_verified" on public.courts;
-- create policy "courts_select_verified" on public.courts for select to authenticated using (verified is true);
--
-- grant update on public.courts to authenticated;
--
-- commit;
