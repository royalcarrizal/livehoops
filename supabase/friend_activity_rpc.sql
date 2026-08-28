-- supabase/friend_activity_rpc.sql
--
-- Everything the Friends screen needs to say about one friend's court activity,
-- in a single round trip:
--
--   • which court they are on right now, if any        → "At Cadman Plaza"
--   • when that session started                        → "· 40m"
--   • when they last played                            → "Last run 2d ago"
--
-- ── Why a NEW function rather than extending the old one ────────────────────
-- get_friends_active_checkins returns a row only for people currently checked
-- in. "Last run" is needed precisely for the people who are NOT — so extending
-- it would mean returning rows for everyone from a function whose name promises
-- active check-ins. This returns one row per friend, active or not, and says so
-- in its name.
--
-- The old function is deliberately NOT dropped. This is a PWA: users have the
-- previous JavaScript bundle cached and will keep calling it after we deploy.
-- It becomes unused by our code and is a candidate for a later cleanup, once
-- traffic to it has actually stopped.
--
-- ── Authorization ───────────────────────────────────────────────────────────
-- SECURITY DEFINER, because checkins_select_own restricts direct reads to your
-- own rows. Having bypassed that policy, this function re-implements the
-- authorization the policy was providing — BOTH guards, from the start:
--
--   1. is_accepted_friend(...)  you may only see people you are friends with.
--      The old function shipped without this and leaked every user's live
--      court to any authenticated caller; see
--      supabase/friend_checkin_authorization.sql.
--
--   2. show_location            "Show My Location" off means friends see you as
--      offline. Applies to the last-run timestamp too, not just the live one —
--      a precise history of when someone plays is the same class of information
--      as where they are right now.
--
-- Both are enforced in one place, at the top, rather than per-column, so a
-- future column cannot be added below and quietly skip them.

drop function if exists public.get_friends_activity(uuid[]);

create or replace function public.get_friends_activity(p_friend_ids uuid[])
returns table (
  user_id           uuid,
  active_court_id   uuid,
  active_court_name text,
  active_since      timestamptz,
  last_checkin_at   timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with visible as (
    -- The people the caller is actually allowed to know anything about.
    -- Everything below joins through this, so neither guard can be bypassed
    -- by a later addition to the select list.
    select p.id
    from   profiles p
    where  p.id = any(p_friend_ids)
      and  p.show_location = true
      and  public.is_accepted_friend(p.id)
  )
  select
    v.id,
    live.court_id,
    co.name,
    live.checked_in_at,
    -- Their most recent session, live or finished. coalesce so someone who is
    -- on a court right now reports that session rather than the one before it.
    (
      select max(c2.checked_in_at)
      from   checkins c2
      where  c2.user_id = v.id
    )
  from visible v
  -- At most one active check-in per user, but LATERAL + limit 1 keeps this
  -- honest if that ever stops being true, instead of duplicating the friend.
  left join lateral (
    select c.court_id, c.checked_in_at
    from   checkins c
    where  c.user_id = v.id
      and  c.is_active = true
    order  by c.checked_in_at desc
    limit  1
  ) live on true
  left join courts co on co.id = live.court_id;
$$;

revoke execute on function public.get_friends_activity(uuid[]) from public;
grant  execute on function public.get_friends_activity(uuid[]) to authenticated;

-- ── Verifying this after applying it ────────────────────────────────────────
--
-- a) ALLOWED — a friend you have appears, with a last_checkin_at if they have
--    ever played:
--
--      select * from public.get_friends_activity(array['<friend-uuid>']::uuid[]);
--
--    Expect one row. active_court_name is null when they are not out.
--
-- b) DENIED — a NON-friend returns nothing at all, not even a null row:
--
--      select * from public.get_friends_activity(array['<stranger-uuid>']::uuid[]);
--
--    Expect ZERO rows. This is the guard the old function was missing.
--
-- c) DENIED — a friend with show_location = false returns nothing either,
--    including their last-run history.
--
-- As with the other friend RPCs: auth.uid() is null in the SQL editor's default
-- context, which makes is_accepted_friend false and every call return zero rows.
-- Run these signed in, or (a) will look like a regression that is not real.
