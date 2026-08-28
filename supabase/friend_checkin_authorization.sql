-- supabase/friend_checkin_authorization.sql
--
-- SECURITY FIX: make get_friends_active_checkins actually check friendship.
--
-- ── The problem ─────────────────────────────────────────────────────────────
-- The checkins table has an RLS policy (checkins_select_own) that restricts
-- direct reads to your own rows — you are not supposed to be able to see where
-- other people are checked in.
--
-- get_friends_active_checkins is SECURITY DEFINER, which means it deliberately
-- runs with elevated privileges and bypasses that policy. That is the correct
-- mechanism: the app genuinely needs to show you where your FRIENDS are.
--
-- But having bypassed the policy, the function never re-implemented the
-- authorization the policy was providing. It accepts an arbitrary array of
-- user IDs and returns the live court for every one of them:
--
--     where c.user_id = any(p_friend_ids) and c.is_active = true
--
-- The parameter is NAMED p_friend_ids. Nothing checked that they were friends.
-- Any authenticated user could call it with any user ID and learn which court
-- that person was standing on, in real time. User IDs are not secret inside the
-- app — profile search returns them, and posts carry them — so this was
-- reachable, not merely theoretical.
--
-- For an app whose entire purpose is telling people where you are, that is the
-- sensitive kind of data to leak.
--
-- ── What was already right ──────────────────────────────────────────────────
-- privacy_settings.sql had already added the show_location join, so anyone who
-- turned "Show My Location" off was protected. That guard is kept exactly as
-- it was. This file adds the guard that was missing: friendship.
--
-- ── The fix ─────────────────────────────────────────────────────────────────
-- One predicate, using the is_accepted_friend() helper that already exists in
-- privacy_enforcement.sql and is used the same way by get_upcoming_meetups.
-- It is STABLE, so the planner evaluates it once per candidate row rather than
-- repeatedly.
--
-- Nothing else changes: same name, same signature, same returned columns. The
-- currently deployed app keeps working untouched, because it only ever passes
-- the IDs of your actual friends — and those still come back.
--
-- `create or replace` is safe here precisely BECAUSE the signature and return
-- type are identical. (Contrast supabase/meetup_duration.sql, which had to drop
-- first because it was adding a parameter and a returned column.)

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
    -- Unchanged, from privacy_settings.sql: "Show My Location" off means
    -- friends see you as offline. The court's player count is unaffected —
    -- that number is anonymous.
    and   p.show_location = true
    -- THE FIX: you may only see the check-in of someone you are actually
    -- friends with. Without this, the SECURITY DEFINER above hands out every
    -- user's live location to anyone who asks.
    and   public.is_accepted_friend(c.user_id);
$$;

revoke execute on function public.get_friends_active_checkins(uuid[]) from public;
grant  execute on function public.get_friends_active_checkins(uuid[]) to authenticated;

-- ── Verifying this fix after applying it ────────────────────────────────────
--
-- Testing only the allowed case proves half of a security fix. Both matter.
--
-- a) ALLOWED — a real friend who is checked in is still visible.
--    As a logged-in user with an accepted friend who is currently checked in:
--
--      select * from public.get_friends_active_checkins(array['<friend-uuid>']::uuid[]);
--
--    Expect: one row, with their court. If this is empty, the fix has broken
--    the feature and must not ship.
--
-- b) DENIED — a NON-friend who is checked in is no longer visible.
--    Same call, with the id of someone you are not friends with who IS
--    currently checked in:
--
--      select * from public.get_friends_active_checkins(array['<stranger-uuid>']::uuid[]);
--
--    Expect: ZERO rows. Before this migration, that call returned their court.
--    This is the case the fix exists for — testing (a) alone proves nothing.
--
-- c) UNCHANGED — "Show My Location" off still hides you from your own friends.
--    Set a friend's profiles.show_location = false and repeat (a).
--    Expect: zero rows.
--
-- Note on running these in the Supabase SQL editor: auth.uid() is null there
-- unless you impersonate a user, and a null auth.uid() makes is_accepted_friend
-- return false — so every call returns zero rows and (a) would look like a
-- regression that is not real. Run these as a signed-in user (from the app, or
-- with an impersonated role), not as the editor's default service context.
