-- LiveHoops: allow logging in with a username (not just email).
-- Run this manually in the Supabase SQL editor. Safe to re-run.
--
-- WHY
-- Supabase Auth only accepts email (or phone) for sign-in — never a username.
-- To let people log in with their username, the app resolves username → email
-- BEFORE calling signInWithPassword. That lookup runs while the user is logged
-- out (anon), and the profiles table isn't anon-readable, so it goes through a
-- SECURITY DEFINER function granted to anon (same shape as username_available
-- in handle_new_user.sql). Email lives only in auth.users, never on profiles.
--
-- PRIVACY NOTE
-- get_email_for_username returns a user's email given their username, so it
-- makes username→email enumerable by anonymous callers (usernames are already
-- public via search). We accept this: the alternative — only returning the
-- email when a password matches — turns the function into an un-throttled
-- password-guessing oracle that bypasses gotrue's login rate limiting, which is
-- worse. Password checks still go through the rate-limited signInWithPassword.

-- ── 1. Case-insensitive unique username index ───────────────────────────────
-- Usernames must be unambiguous for login ("Royxl" and "royxl" can't be two
-- different people). This also makes the dedupe comment in handle_new_user.sql
-- actually true.
--
-- If this CREATE fails with a uniqueness error, you have pre-existing
-- duplicate usernames. Find them first with:
--   select lower(username) as name, count(*)
--   from public.profiles
--   group by 1 having count(*) > 1;
-- …then rename the losers (e.g. append a short suffix) and re-run.

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- ── 2. Resolve a username to its account email ──────────────────────────────
-- Returns the email for a given username (case-insensitive), or NULL if no
-- such username exists. Anon-callable because login happens logged-out.

create or replace function public.get_email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.email::text
  from   auth.users u
  join   public.profiles p on p.id = u.id
  where  lower(p.username) = lower(trim(p_username))
  limit  1;
$$;

revoke execute on function public.get_email_for_username(text) from public;
grant  execute on function public.get_email_for_username(text) to anon, authenticated;
