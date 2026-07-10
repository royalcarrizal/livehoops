-- LiveHoops: enforce feed privacy and DM rules in the database, not just the UI.
-- Run this manually in the Supabase SQL editor. Safe to re-run.
--
-- WHAT THIS FIXES (three holes the app previously papered over in JavaScript)
--
--   1. POSTS — the old posts_select_all policy was `using (true)`, so anyone
--      with the public anon key could read EVERY post through the API, even
--      from users whose Profile Visibility is 'friends' or 'private'. The
--      Nearby feed filtered client-side, which protects nothing. Now the
--      SELECT policy itself enforces visibility.
--
--   2. DMs — any authenticated user could message anyone (the UI only offers
--      messaging friends, but the API didn't care), and the recipient could
--      UPDATE any column of a received message — including rewriting its
--      content. Now: friends-only sends, and recipients can touch only
--      read_at (column-level grant).
--
--   3. MUTUAL FRIENDS — the profile page tried to read the *viewed* user's
--      friendships directly, which friendships_select_own (correctly) blocks,
--      so "mutual friends" was always empty. A SECURITY DEFINER RPC computes
--      the intersection server-side, exposing only people BOTH users are
--      already friends with.

-- ── 1. Helper: is the caller an accepted friend of p_other? ─────────────────
-- SECURITY DEFINER so policies can consult friendships without tripping over
-- that table's own RLS. STABLE so the planner can cache it within a query.

create or replace function public.is_accepted_friend(p_other uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from   friendships f
    where  f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.addressee_id = p_other)
        or (f.addressee_id = auth.uid() and f.requester_id = p_other))
  );
$$;

revoke execute on function public.is_accepted_friend(uuid) from public;
grant  execute on function public.is_accepted_friend(uuid) to authenticated;

-- ── 2. Helper: may the caller see p_author's posts? ─────────────────────────
-- Mirrors the app's visibility semantics exactly:
--   'public'             → everyone
--   'friends' / 'private' → accepted friends only
--   yourself             → always

create or replace function public.can_view_posts_of(p_author uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_author = auth.uid()
    or exists (
         select 1 from profiles p
         where  p.id = p_author
           and  p.profile_visibility = 'public'
       )
    or exists (
         select 1
         from   friendships f
         where  f.status = 'accepted'
           and ((f.requester_id = auth.uid() and f.addressee_id = p_author)
             or (f.addressee_id = auth.uid() and f.requester_id = p_author))
       );
$$;

revoke execute on function public.can_view_posts_of(uuid) from public;
grant  execute on function public.can_view_posts_of(uuid) to authenticated;

-- ── 3. Posts: visibility-aware SELECT policy ────────────────────────────────
-- Replaces posts_select_all (using true). Side effects, all intended:
--   - Nearby feed: hidden posts never leave the database now
--   - Reposts of a post you can't see arrive without their original —
--     the app shows a "post unavailable" placeholder
--   - Deep links to hidden posts show the existing "Post not found" state
--   - Admin moderation is unaffected (its RPCs are SECURITY DEFINER)

drop policy if exists "posts_select_all" on public.posts;
drop policy if exists "posts_select_visible" on public.posts;
create policy "posts_select_visible"
on public.posts for select
to authenticated
using (public.can_view_posts_of(user_id));

-- ── 4. DMs: friends-only sends ──────────────────────────────────────────────

drop policy if exists "dm_insert_own" on public.direct_messages;
create policy "dm_insert_own"
on public.direct_messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.is_accepted_friend(recipient_id)
);

-- ── 5. DMs: recipients may only mark messages read ──────────────────────────
-- RLS can't restrict columns, so this is a column-level grant: authenticated
-- users keep UPDATE on read_at only. Combined with the dm_update_own policy
-- (recipient_id = auth.uid()), a recipient can mark a received message read
-- and nothing else — message content is immutable after sending.

drop policy if exists "dm_update_own" on public.direct_messages;
create policy "dm_update_own"
on public.direct_messages for update
to authenticated
using (recipient_id = auth.uid());

revoke update on public.direct_messages from authenticated;
grant  update (read_at) on public.direct_messages to authenticated;

-- ── 6. Mutual friends RPC ───────────────────────────────────────────────────
-- People both the caller AND p_other_user_id are friends with. Each side can
-- already see those friendships individually, so the intersection leaks
-- nothing new. Called from ProfileScreen's visitor mode.

create or replace function public.get_mutual_friends(p_other_user_id uuid)
returns table(user_id uuid, username text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  with my_friends as (
    select case when requester_id = auth.uid()
                then addressee_id else requester_id end as fid
    from   friendships
    where  status = 'accepted'
      and (requester_id = auth.uid() or addressee_id = auth.uid())
  ),
  their_friends as (
    select case when requester_id = p_other_user_id
                then addressee_id else requester_id end as fid
    from   friendships
    where  status = 'accepted'
      and (requester_id = p_other_user_id or addressee_id = p_other_user_id)
  )
  select p.id, p.username, p.avatar_url
  from   my_friends m
  join   their_friends t on t.fid = m.fid
  join   profiles p      on p.id  = m.fid
  where  m.fid <> auth.uid()
    and  m.fid <> p_other_user_id;
$$;

revoke execute on function public.get_mutual_friends(uuid) from public;
grant  execute on function public.get_mutual_friends(uuid) to authenticated;
