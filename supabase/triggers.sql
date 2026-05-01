-- LiveHoops database triggers.
-- Run this manually in the Supabase SQL editor.
--
-- These triggers keep denormalized counters in sync automatically:
--   posts.like_count      — updated when post_likes rows are inserted/deleted
--   posts.comment_count   — updated when comments rows are inserted/deleted
--   courts.avg_rating     — recalculated when court_reviews change
--   courts.review_count   — recalculated when court_reviews change

-- ── post_likes → posts.like_count ────────────────────────────────────────────

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

drop trigger if exists trg_post_like_count on public.post_likes;
create trigger trg_post_like_count
after insert or delete on public.post_likes
for each row execute function public.update_post_like_count();

-- ── comments → posts.comment_count ───────────────────────────────────────────

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

drop trigger if exists trg_post_comment_count on public.comments;
create trigger trg_post_comment_count
after insert or delete on public.comments
for each row execute function public.update_post_comment_count();

-- ── court_reviews → courts.avg_rating + courts.review_count ──────────────────

create or replace function public.update_court_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_court_id uuid;
begin
  -- Determine which court was affected
  v_court_id := coalesce(NEW.court_id, OLD.court_id);

  update public.courts
    set
      review_count = (
        select count(*)
        from public.court_reviews
        where court_id = v_court_id
      ),
      avg_rating = (
        select coalesce(avg(rating), 0)
        from public.court_reviews
        where court_id = v_court_id
      )
    where id = v_court_id;

  return null;
end;
$$;

drop trigger if exists trg_court_rating on public.court_reviews;
create trigger trg_court_rating
after insert or update or delete on public.court_reviews
for each row execute function public.update_court_rating();
