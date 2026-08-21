-- LiveHoops: player bio.
-- Run this manually in the Supabase SQL editor.
--
-- WHY
-- The redesign gives every player a short line about themselves on their
-- profile — "Brooklyn runs, mostly nights" — sitting under the username and
-- above the stat pills. It shows on other players' profiles too, so it is the
-- one place a player gets to say something in their own words before someone
-- decides whether to add them.
--
-- 120 characters, deliberately. Long enough for a sentence with some character
-- in it, short enough that it stays one or two lines on a phone and cannot
-- push the stat pills below the fold. The limit is enforced in three places
-- that agree: the textarea's maxLength, a slice() on change so a paste cannot
-- exceed it, and the check constraint below as the backstop.
--
-- The column is nullable with no default. "No bio set" is a real state,
-- distinct from an empty string, and the profile header omits the element
-- entirely when it is null rather than rendering blank space.
--
-- The app reads profiles with select('*'), so no query changes are needed once
-- this column exists — the same property that made jersey_number cheap.
--
-- SAFETY
-- Additive and reversible. It adds one nullable column; no existing row
-- changes, no existing query changes, and nothing is user-visible until the
-- UI that reads it ships. To undo:
--
--     alter table public.profiles drop column if exists bio;

alter table public.profiles
  add column if not exists bio text;

-- Drop first so re-running this whole file is safe.
alter table public.profiles
  drop constraint if exists profiles_bio_check;

-- `bio is null` stays valid so clearing the bio is allowed. char_length is
-- used rather than length() to count characters, not bytes — an emoji or an
-- accented character must not cost a user two or three of their 120.
alter table public.profiles
  add constraint profiles_bio_check
  check (bio is null or char_length(bio) <= 120);

-- ── Check after running ─────────────────────────────────────────────────────
-- Column exists:
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'profiles' and column_name = 'bio';
--
-- Constraint rejects 121 characters (this should ERROR, which is the point):
--   update public.profiles set bio = repeat('x', 121) where id = auth.uid();
