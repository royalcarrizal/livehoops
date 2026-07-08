-- LiveHoops: notification preference columns.
-- Run this manually in the Supabase SQL editor.
--
-- WHY
-- "Friend Request Alerts" and "Court Goes Live Alerts" in Settings used to
-- save only to the toggling user's own localStorage. That's fine for a
-- preference that only affects your own device — but it's useless for
-- gating notifications about OTHER people's actions (e.g. should we push
-- user B when user A sends them a friend request?), because user A's
-- browser has no way to read user B's localStorage.
--
-- Moving these to the profiles table lets the person triggering an event
-- check the recipient's preference before sending a push.

alter table public.profiles
  add column if not exists notif_friend_requests boolean not null default true;

alter table public.profiles
  add column if not exists notif_court_checkins boolean not null default false;
