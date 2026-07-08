-- LiveHoops: fix doubled like counts + reconcile stale counters.
-- Run this manually in the Supabase SQL editor.
--
-- WHY
-- The posts.like_count trigger is installed TWICE in production (an older
-- trigger name alongside trg_post_like_count), so every like adds 2 and
-- every unlike removes 2 — verified live on 2026-07-07: one like moved
-- like_count from 2 to 4. Comment inserts/deletes were verified to move
-- comment_count by exactly 1, so that trigger is fine, but a few posts
-- carry stale counts from before the triggers were installed (e.g. a post
-- claiming 2 comments while only 1 comment row exists), which makes the
-- feed badge promise comments that never appear when the section opens.
--
-- This file:
--   1. Drops EVERY user trigger on post_likes and comments (safe no matter
--      what the duplicate is called) and recreates the two canonical ones.
--   2. Recomputes like_count and comment_count from the actual rows.

-- ── 1. Reset triggers ─────────────────────────────────────────────────────

-- Make sure the canonical trigger functions exist (same as triggers.sql)
create or replace function public.update_post_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts
      set like_count = coalesce(like_count, 0) + 1
      where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts
      set like_count = greatest(coalesce(like_count, 0) - 1, 0)
      where id = OLD.post_id;
  end if;
  return null;
end;
$$;

create or replace function public.update_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts
      set comment_count = coalesce(comment_count, 0) + 1
      where id = NEW.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts
      set comment_count = greatest(coalesce(comment_count, 0) - 1, 0)
      where id = OLD.post_id;
  end if;
  return null;
end;
$$;

-- Drop every non-internal trigger on the two tables, whatever it's named
do $$
declare
  t record;
begin
  for t in
    select tg.tgname, cls.relname
    from pg_trigger tg
    join pg_class cls     on cls.oid = tg.tgrelid
    join pg_namespace ns  on ns.oid  = cls.relnamespace
    where ns.nspname = 'public'
      and cls.relname in ('post_likes', 'comments')
      and not tg.tgisinternal
  loop
    execute format('drop trigger %I on public.%I', t.tgname, t.relname);
  end loop;
end $$;

create trigger trg_post_like_count
after insert or delete on public.post_likes
for each row execute function public.update_post_like_count();

create trigger trg_post_comment_count
after insert or delete on public.comments
for each row execute function public.update_post_comment_count();

-- ── 2. Reconcile counters with reality ────────────────────────────────────

update public.posts p
set
  like_count = (
    select count(*) from public.post_likes pl where pl.post_id = p.id
  ),
  comment_count = (
    select count(*) from public.comments cm where cm.post_id = p.id
  );
