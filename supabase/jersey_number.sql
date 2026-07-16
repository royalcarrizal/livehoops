-- LiveHoops: player jersey number ("avatar number").
-- Run this manually in the Supabase SQL editor.
--
-- WHY
-- Players want to show their favorite jersey number (0-99) on their profile
-- and posts, the way a real baller has "their number." This adds one optional
-- column to profiles. It's set in Edit Profile and displayed as "#23" next to
-- the username on the profile screen and feed posts.
--
-- The column is nullable with no default: "no number set" is a real state,
-- distinct from 0 (which is a valid jersey number, e.g. Westbrook). The app
-- reads profiles with select('*'), so no query changes are needed once this
-- column exists.

alter table public.profiles
  add column if not exists jersey_number smallint;

-- Keep values in the valid jersey range (drop first so re-running is safe).
-- `jersey_number is null` is allowed so clearing the number stays valid.
alter table public.profiles
  drop constraint if exists profiles_jersey_number_check;

alter table public.profiles
  add constraint profiles_jersey_number_check
  check (jersey_number is null or (jersey_number >= 0 and jersey_number <= 99));
