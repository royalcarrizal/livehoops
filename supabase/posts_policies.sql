-- LiveHoops posts RLS policies.
-- Run this manually in the Supabase SQL editor.

alter table public.posts enable row level security;

-- The SELECT policy moved to privacy_enforcement.sql (posts_select_visible),
-- which enforces Profile Visibility server-side. It is intentionally NOT
-- recreated here, so re-running this file can't reopen the old
-- read-everything hole (posts_select_all / using true).

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
on public.posts
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
on public.posts
for update
to authenticated
using (user_id = auth.uid());

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own"
on public.posts
for delete
to authenticated
using (user_id = auth.uid());
