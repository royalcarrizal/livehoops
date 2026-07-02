-- LiveHoops real privacy settings.
-- Run this manually in the Supabase SQL editor BEFORE deploying the matching
-- app code (the app reads/writes these columns).
--
-- WHAT THIS ADDS
-- The Settings sheet previously had "Show My Location" and "Profile
-- Visibility" switches that only saved to the device and were never read
-- by anything. This migration gives them real backing:
--
--   profiles.show_location       — when false, friends can NOT see which
--                                  court you're checked in at, and the app
--                                  stops saving GPS coords on your check-ins.
--                                  (You still count toward a court's player
--                                  count — that number is anonymous.)
--
--   profiles.profile_visibility  — 'public'  everyone sees your profile,
--                                             posts, and stats
--                                  'friends' searchable, but only friends
--                                             see your posts/stats
--                                  'private' hidden from search AND only
--                                             friends see your posts/stats

-- ── 1. New columns on profiles ─────────────────────────────────────────────

alter table public.profiles
  add column if not exists show_location boolean not null default true;

alter table public.profiles
  add column if not exists profile_visibility text not null default 'public';

-- Guard against bad values (drop first so re-running this file is safe)
alter table public.profiles
  drop constraint if exists profiles_visibility_check;

alter table public.profiles
  add constraint profiles_visibility_check
  check (profile_visibility in ('public', 'friends', 'private'));

-- ── 2. Respect show_location in the friends "playing now" RPC ──────────────
-- Same function as friends_active_checkins_rpc.sql, plus a join on profiles
-- that hides the check-in of anyone who turned "Show My Location" off.
-- Their friends will see them as offline; the court's player count is
-- unaffected (it's an anonymous counter).

create or replace function public.get_friends_active_checkins(p_friend_ids uuid[])
returns table(user_id uuid, court_id uuid, court_name text)
language sql
security definer
set search_path = public
stable
as $$
  select  c.user_id,
          c.court_id,
          co.name as court_name
  from    checkins c
  join    courts   co on co.id = c.court_id
  join    profiles p  on p.id  = c.user_id
  where   c.user_id = any(p_friend_ids)
    and   c.is_active = true
    and   p.show_location = true;
$$;

revoke execute on function public.get_friends_active_checkins(uuid[]) from public;
grant  execute on function public.get_friends_active_checkins(uuid[]) to authenticated;
