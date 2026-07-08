-- LiveHoops: comment likes + replies.
-- Run this manually in the Supabase SQL editor.
--
-- Adds two things to the existing comments system:
--   1. Likes on comments — a comment_likes table (one row per user per
--      comment) plus a like_count column kept in sync by a trigger, exactly
--      like posts/post_likes.
--   2. Replies — a self-referencing parent_comment_id column. A reply is a
--      normal comment row that points at the comment it answers. The app
--      threads them one level deep (replies group under a top-level comment).

-- ── 1. Likes ────────────────────────────────────────────────────────────────

create table if not exists public.comment_likes (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- one like per user per comment
  unique (comment_id, user_id)
);

create index if not exists comment_likes_comment_id_idx
  on public.comment_likes (comment_id);

alter table public.comments
  add column if not exists like_count int not null default 0;

-- Keep comments.like_count in sync with comment_likes rows
create or replace function public.update_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.comments
      set like_count = coalesce(like_count, 0) + 1
      where id = NEW.comment_id;
  elsif TG_OP = 'DELETE' then
    update public.comments
      set like_count = greatest(coalesce(like_count, 0) - 1, 0)
      where id = OLD.comment_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_comment_like_count on public.comment_likes;
create trigger trg_comment_like_count
after insert or delete on public.comment_likes
for each row execute function public.update_comment_like_count();

-- Row-level security: anyone signed in can see like counts; users manage
-- only their own like rows.
alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select_all" on public.comment_likes;
create policy "comment_likes_select_all" on public.comment_likes
for select to authenticated using (true);

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own" on public.comment_likes
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own" on public.comment_likes
for delete to authenticated using (user_id = auth.uid());

-- ── 2. Replies ───────────────────────────────────────────────────────────────
-- A reply is a comment whose parent_comment_id points at another comment.
-- on delete cascade means deleting a parent comment also removes its replies.

alter table public.comments
  add column if not exists parent_comment_id uuid
  references public.comments(id) on delete cascade;

create index if not exists comments_parent_comment_id_idx
  on public.comments (parent_comment_id);
