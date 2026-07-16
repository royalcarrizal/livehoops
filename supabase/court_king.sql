-- LiveHoops: "King of the Court" per-court leaderboard.
-- Run this manually in the Supabase SQL editor.
--
-- WHY AN RPC
-- The checkins_select_own RLS policy (correctly) blocks reading other users'
-- check-in rows, so the app can't aggregate them directly. This SECURITY
-- DEFINER function reads them internally and returns only the two "kings"
-- for one court: the player with the most total time on court, and the
-- player with the most check-ins there.
--
-- FULLY PUBLIC (by product decision)
-- Unlike get_court_active_players, this intentionally does NOT apply the
-- show_location / profile_visibility privacy gate. The King of the Court is a
-- court-wide public title: every player with completed check-ins is eligible,
-- and the same two kings are shown to every viewer.
--
-- DATA SOURCE
-- No new table is needed — a completed visit is already an is_active = false
-- row in checkins carrying court_id + duration_minutes. We aggregate those.
-- (Caveat: cron auto-expiry hardcodes duration_minutes = 180 for abandoned
-- 3h sessions, so "total minutes" is approximate for those — fine for a
-- leaderboard.)

create or replace function public.get_court_king(p_court_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with totals as (
    -- One row per player: their cumulative stats at THIS court.
    select c.user_id,
           sum(coalesce(c.duration_minutes, 0))::int as total_minutes,
           count(*)::int                             as total_checkins
    from   checkins c
    where  c.court_id = p_court_id
      and  c.is_active = false
    group by c.user_id
  ),
  hours_king as (
    -- Most time on court; ties broken by check-ins, then user_id (stable).
    select t.user_id, t.total_minutes, t.total_checkins,
           p.username, p.avatar_url, p.jersey_number
    from   totals t
    join   profiles p on p.id = t.user_id
    order by t.total_minutes desc, t.total_checkins desc, t.user_id
    limit 1
  ),
  checkins_king as (
    -- Most check-ins; ties broken by minutes, then user_id (stable).
    select t.user_id, t.total_minutes, t.total_checkins,
           p.username, p.avatar_url, p.jersey_number
    from   totals t
    join   profiles p on p.id = t.user_id
    order by t.total_checkins desc, t.total_minutes desc, t.user_id
    limit 1
  )
  select jsonb_build_object(
    'hours_king',    (select to_jsonb(h) from hours_king h),
    'checkins_king', (select to_jsonb(c) from checkins_king c)
  );
$$;

revoke execute on function public.get_court_king(uuid) from public;
grant  execute on function public.get_court_king(uuid) to authenticated;
