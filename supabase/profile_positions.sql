-- LiveHoops: player positions.
-- Run this manually in the Supabase SQL editor.
--
-- WHY
-- The redesign shows a row of selectable chips on Edit Profile — Guard, Wing,
-- Forward, Center, Wherever — and the chosen ones read back on the profile.
-- Pickup basketball is not rigid about positions, which is why "Wherever" is
-- one of the options rather than a cop-out: for a lot of players it is the
-- honest answer, and leaving it out would push them into claiming a position
-- they do not play.
--
-- Multiple choices are allowed on purpose. A combo guard is a real thing, and
-- forcing one pick would make the field less true rather than more tidy.
--
-- WHY AN ARRAY AND NOT A JOIN TABLE
-- Five fixed values, no attributes of their own, never queried independently,
-- and the app already reads the whole profile row with select('*'). A join
-- table would add a query and a migration's worth of ceremony to store what
-- amounts to five checkboxes.
--
-- The tradeoff is that Postgres will not police an array's contents for you,
-- so the check constraint below has to do it explicitly. An unconstrained
-- text[] accepts literally anything, including a typo'd 'Guardd' or a
-- thousand-element array from a malicious client.
--
-- SAFETY
-- Additive and reversible. Existing rows get the default empty array, which
-- the UI renders as "no positions chosen" — the same as it renders a brand
-- new profile. Nothing is user-visible until the UI that reads it ships.
-- To undo:
--
--     alter table public.profiles drop column if exists positions;

alter table public.profiles
  add column if not exists positions text[] not null default '{}';

-- Drop first so re-running this whole file is safe.
alter table public.profiles
  drop constraint if exists profiles_positions_check;

-- Three separate things are being enforced here, and all three matter:
--
--   1. every element is one of the five known positions. <@ tests that the
--      left array is contained by the right one, so a typo or an injected
--      value fails rather than being stored and rendered later.
--   2. at most 5 entries. There are only five options, so anything longer
--      means duplicates or junk. coalesce() is needed because array_length
--      returns null for an empty array, not 0, and null fails a check.
--   3. no duplicates — the cardinality of the array must match the count of
--      its distinct elements. Without this, ['Guard','Guard'] passes 1 and 2
--      and then renders as "Guard · Guard".
alter table public.profiles
  add constraint profiles_positions_check
  check (
    positions <@ array['Guard', 'Wing', 'Forward', 'Center', 'Wherever']::text[]
    and coalesce(array_length(positions, 1), 0) <= 5
    and coalesce(array_length(positions, 1), 0)
        = (select count(distinct p) from unnest(positions) as p)
  );

-- ── Check after running ─────────────────────────────────────────────────────
-- Column exists and defaults to an empty array:
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles'
--     and column_name = 'positions';
--
-- Each of these should ERROR, which is the point:
--   update public.profiles set positions = array['Point Guard'] where id = auth.uid();
--   update public.profiles set positions = array['Guard','Guard'] where id = auth.uid();
--
-- ...and this should succeed:
--   update public.profiles set positions = array['Guard','Wing'] where id = auth.uid();
