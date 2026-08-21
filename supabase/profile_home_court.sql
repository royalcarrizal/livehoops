-- LiveHoops: home court.
-- Run this manually in the Supabase SQL editor.
--
-- WHY
-- The app already has `favorite_court`, but it is free text: a player types
-- "Cadman" or "cadman plaza" or "the park by my house" and the app can do
-- nothing with it except print it back. The redesign's Home Court is a real
-- reference to a row in `courts`, which makes it a link — tap it and you are
-- looking at that court, its live player count, and who is there now.
--
-- That is the whole point of the change. A string cannot do any of that.
--
-- WHY favorite_court IS KEPT
-- This migration backfills home_court_id by matching the old text against
-- court names, and the app stops reading favorite_court once the UI ships.
-- The column stays anyway: the match below is best-effort, and anything that
-- did not match is a player's own words about where they hoop. Dropping it
-- would throw that away to save a few bytes. It can be removed later, once
-- the backfill has been eyeballed and the new field has real use.
--
-- SAFETY
-- Additive and reversible. The new column is nullable, the backfill only
-- fills rows it can match confidently and never overwrites a value, and no
-- existing column changes. To undo:
--
--     alter table public.profiles drop column if exists home_court_id;

alter table public.profiles
  add column if not exists home_court_id uuid;

-- Drop first so re-running this whole file is safe.
alter table public.profiles
  drop constraint if exists profiles_home_court_id_fkey;

-- `on delete set null` is the important part. Courts get removed — a bad
-- submission gets rejected by moderation, a duplicate gets merged. Without
-- this, deleting one court would fail against every profile pointing at it
-- (or, with cascade, would delete the profiles themselves). Set null means
-- the player simply has no home court again, which is the correct outcome.
alter table public.profiles
  add constraint profiles_home_court_id_fkey
  foreign key (home_court_id) references public.courts(id) on delete set null;

-- Index it: the app looks up a profile's court by id on every profile render.
create index if not exists profiles_home_court_id_idx
  on public.profiles (home_court_id);

-- ── Backfill from the old free-text column ──────────────────────────────────
-- Best-effort and deliberately conservative. Case- and whitespace-insensitive
-- exact match only — no fuzzy matching, because guessing wrong here silently
-- tells a player their home court is somewhere they have never been.
--
-- Two guards:
--   `p.home_court_id is null`  never overwrite a value already set
--   the `not exists` clause    skip any name that matches more than one court,
--                              since there is no way to know which was meant
--
-- Preview what this will do BEFORE running it:
--
--   select p.id, p.favorite_court, c.name
--   from public.profiles p
--   join public.courts c
--     on lower(trim(c.name)) = lower(trim(p.favorite_court))
--   where p.favorite_court is not null and trim(p.favorite_court) <> '';

update public.profiles p
set home_court_id = c.id
from public.courts c
where p.home_court_id is null
  and p.favorite_court is not null
  and trim(p.favorite_court) <> ''
  and lower(trim(c.name)) = lower(trim(p.favorite_court))
  and not exists (
    select 1 from public.courts c2
    where lower(trim(c2.name)) = lower(trim(p.favorite_court))
      and c2.id <> c.id
  );

-- ── Check after running ─────────────────────────────────────────────────────
-- How many profiles got a home court out of the backfill:
--   select count(*) filter (where home_court_id is not null) as matched,
--          count(*) filter (where home_court_id is null
--                             and coalesce(trim(favorite_court), '') <> '') as unmatched
--   from public.profiles;
--
-- The unmatched ones still have their original text in favorite_court; they
-- simply pick a home court from the picker next time they edit their profile.
