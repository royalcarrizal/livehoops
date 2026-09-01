-- LiveHoops: posts.repost_count — how many times a post has been reposted.
-- Run this manually in the Supabase SQL editor. Safe to re-run.
--
-- WHY
-- The feed shows a like count and a comment count beside their icons and
-- nothing beside the repost icon, because nothing counts reposts. This adds
-- the counter, maintained the same way the other two are: a denormalised
-- column on posts kept current by a trigger, so the feed query stays one read.
--
-- WHAT MAKES THIS ONE DIFFERENT
-- post_likes and comments are their own tables, so their triggers live on one
-- table and update another. A repost is not its own row type — it IS a post,
-- carrying repost_of_post_id (see reposts.sql). So this trigger fires on posts
-- and updates posts.
--
-- That is safe, and the reason is worth stating because it looks alarming:
-- the trigger is AFTER INSERT OR DELETE, and the statement it runs is an
-- UPDATE. An UPDATE does not fire an INSERT or DELETE trigger, so there is no
-- recursion. If anyone ever adds UPDATE to the trigger's event list, that
-- stops being true — a repost row's repost_of_post_id is never edited in
-- practice, so do not add it.
--
-- ON DELETE CASCADE
-- reposts.sql declares repost_of_post_id REFERENCES posts(id) ON DELETE
-- CASCADE. Deleting an original therefore deletes every repost of it, and this
-- trigger fires once per cascaded row, each trying to decrement a row that is
-- being deleted in the same transaction. Those UPDATEs match zero rows and are
-- harmless — but the count is deliberately clamped at zero anyway, so even a
-- surprising interleaving cannot render "-1 reposts".
--
-- A LESSON FROM fix_count_triggers.sql
-- The like trigger was once installed twice in production under two names, so
-- every like counted as two. This file drops the trigger by name before
-- creating it, and the backfill at the end recomputes from actual rows — so
-- re-running this file corrects a drifted count rather than compounding it.

begin;

-- ── 1. The column ───────────────────────────────────────────────────────────

alter table public.posts
  add column if not exists repost_count integer not null default 0;

-- ── 2. The trigger function ─────────────────────────────────────────────────
-- Only rows that ARE reposts move a counter. An ordinary post being written or
-- deleted has repost_of_post_id null and must not touch anything.

create or replace function public.update_post_repost_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' and NEW.repost_of_post_id is not null then
    update public.posts
      set repost_count = coalesce(repost_count, 0) + 1
      where id = NEW.repost_of_post_id;

  elsif TG_OP = 'DELETE' and OLD.repost_of_post_id is not null then
    -- greatest(...,0) for the same reason the like trigger has it: a counter
    -- that can print a negative number is worse than one that is slightly
    -- stale, and the backfill below can always repair staleness.
    update public.posts
      set repost_count = greatest(coalesce(repost_count, 0) - 1, 0)
      where id = OLD.repost_of_post_id;
  end if;

  return null;
end;
$$;

-- ── 3. The trigger ──────────────────────────────────────────────────────────
-- Dropped by name first: see the note about the doubled like counter above.

drop trigger if exists trg_post_repost_count on public.posts;
create trigger trg_post_repost_count
after insert or delete on public.posts
for each row execute function public.update_post_repost_count();

-- ── 4. Backfill ─────────────────────────────────────────────────────────────
-- Reposts already exist in the table; without this every one of them would
-- show 0 until somebody reposted again. Recomputed from the rows themselves,
-- so this is also the repair step if a count ever drifts.

update public.posts p
   set repost_count = coalesce(c.n, 0)
  from (
    select repost_of_post_id as id, count(*)::int as n
      from public.posts
     where repost_of_post_id is not null
     group by repost_of_post_id
  ) c
 where p.id = c.id
   and p.repost_count is distinct from c.n;

-- Posts nobody has reposted, whose count is somehow not zero.
update public.posts p
   set repost_count = 0
 where p.repost_count <> 0
   and not exists (
     select 1 from public.posts r where r.repost_of_post_id = p.id
   );

commit;


-- ── VERIFY ──────────────────────────────────────────────────────────────────
-- Run after committing. Both should return zero rows.
--
--   -- Any post whose stored count disagrees with reality:
--   select p.id, p.repost_count,
--          (select count(*) from public.posts r where r.repost_of_post_id = p.id) as actual
--     from public.posts p
--    where p.repost_count is distinct from
--          (select count(*) from public.posts r where r.repost_of_post_id = p.id);
--
--   -- Exactly one repost trigger should exist on posts:
--   select tgname from pg_trigger
--    where tgrelid = 'public.posts'::regclass
--      and not tgisinternal
--      and tgname like '%repost%';


-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Run this block to undo everything above. The app tolerates it on its own:
-- the feed reads posts with `select *`, so a dropped column simply stops
-- arriving, and normPost reads `row.repost_count ?? 0` — every post renders 0
-- reposts instead of erroring. No client rollback is required, though the
-- count in the UI becomes a row of zeroes until one ships.
--
--   begin;
--   drop trigger if exists trg_post_repost_count on public.posts;
--   drop function if exists public.update_post_repost_count();
--   alter table public.posts drop column if exists repost_count;
--   commit;
