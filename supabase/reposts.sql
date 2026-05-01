-- LiveHoops repost support.
-- Run this manually in the Supabase SQL editor before using reposts.

alter table public.posts
add column if not exists repost_of_post_id uuid references public.posts(id) on delete cascade;

create unique index if not exists posts_user_repost_unique
on public.posts(user_id, repost_of_post_id)
where repost_of_post_id is not null;

-- Ensure the type column allows 'repost' (defensive — drops and recreates if a
-- stricter check constraint exists that would block repost inserts).
alter table public.posts
  drop constraint if exists posts_type_check;

alter table public.posts
  add constraint posts_type_check
  check (type in ('status', 'photo', 'checkin', 'video', 'repost'));
