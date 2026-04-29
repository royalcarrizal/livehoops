-- LiveHoops repost support.
-- Run this manually in the Supabase SQL editor before using reposts.

alter table public.posts
add column if not exists repost_of_post_id uuid references public.posts(id) on delete cascade;

create unique index if not exists posts_user_repost_unique
on public.posts(user_id, repost_of_post_id)
where repost_of_post_id is not null;
