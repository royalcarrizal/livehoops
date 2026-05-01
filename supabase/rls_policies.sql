-- LiveHoops RLS policies for direct_messages, comments, post_likes, friendships.
-- Run this manually in the Supabase SQL editor.

-- ── direct_messages ───────────────────────────────────────────────────────────
alter table public.direct_messages enable row level security;

drop policy if exists "dm_select_own" on public.direct_messages;
create policy "dm_select_own"
on public.direct_messages for select
to authenticated
using (sender_id = auth.uid() or recipient_id = auth.uid());

drop policy if exists "dm_insert_own" on public.direct_messages;
create policy "dm_insert_own"
on public.direct_messages for insert
to authenticated
with check (sender_id = auth.uid());

drop policy if exists "dm_update_own" on public.direct_messages;
create policy "dm_update_own"
on public.direct_messages for update
to authenticated
using (recipient_id = auth.uid());

drop policy if exists "dm_delete_own" on public.direct_messages;
create policy "dm_delete_own"
on public.direct_messages for delete
to authenticated
using (sender_id = auth.uid());

-- ── comments ──────────────────────────────────────────────────────────────────
alter table public.comments enable row level security;

drop policy if exists "comments_select_all" on public.comments;
create policy "comments_select_all"
on public.comments for select
to authenticated
using (true);

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own"
on public.comments for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own"
on public.comments for delete
to authenticated
using (user_id = auth.uid());

-- ── post_likes ────────────────────────────────────────────────────────────────
alter table public.post_likes enable row level security;

drop policy if exists "post_likes_select_all" on public.post_likes;
create policy "post_likes_select_all"
on public.post_likes for select
to authenticated
using (true);

drop policy if exists "post_likes_insert_own" on public.post_likes;
create policy "post_likes_insert_own"
on public.post_likes for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "post_likes_delete_own" on public.post_likes;
create policy "post_likes_delete_own"
on public.post_likes for delete
to authenticated
using (user_id = auth.uid());

-- ── friendships ───────────────────────────────────────────────────────────────
alter table public.friendships enable row level security;

drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own"
on public.friendships for select
to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());

drop policy if exists "friendships_insert_own" on public.friendships;
create policy "friendships_insert_own"
on public.friendships for insert
to authenticated
with check (requester_id = auth.uid());

drop policy if exists "friendships_update_own" on public.friendships;
create policy "friendships_update_own"
on public.friendships for update
to authenticated
using (addressee_id = auth.uid());

drop policy if exists "friendships_delete_own" on public.friendships;
create policy "friendships_delete_own"
on public.friendships for delete
to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());
