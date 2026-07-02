-- LiveHoops server-side auto-expiry for stale check-ins.
-- Run this manually in the Supabase SQL editor.
--
-- THE PROBLEM THIS SOLVES
-- The 3-hour auto-checkout in useCheckIn.js only runs on the checked-in
-- user's own device, the next time THEY open the app. If someone checks in
-- and never comes back, they stay "on the court" forever and the court's
-- player count is permanently inflated ("ghost players").
--
-- THE FIX
-- A database function that closes every check-in older than 3 hours —
-- updating the court's player count and the player's profile stats exactly
-- the way livehoops_check_out() does — plus a pg_cron job that runs it
-- every 5 minutes, server-side, whether or not anyone has the app open.
--
-- The 3-hour limit must match MAX_CHECKIN_MS in src/hooks/useCheckIn.js.

create or replace function public.livehoops_expire_stale_checkins()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkin record;
  v_expired_count int := 0;
  v_duration_minutes int;
  v_prior_visits int;
  v_hours_to_add int;
  v_courts_to_add int;
begin
  for v_checkin in
    select id, user_id, court_id, checked_in_at
    from public.checkins
    where is_active = true
      and checked_in_at < now() - interval '3 hours'
    -- skip locked: if a row is mid-checkout in another transaction
    -- (e.g. the user tapped Check Out at the same moment), leave it alone
    for update skip locked
  loop
    -- The session is capped at 3 hours, so record exactly 180 minutes and
    -- backdate checked_out_at to when the session actually expired
    -- (check-in time + 3 hours), not when this cleanup job happened to run.
    v_duration_minutes := 180;

    update public.checkins
    set
      is_active = false,
      checked_out_at = v_checkin.checked_in_at + interval '3 hours',
      duration_minutes = v_duration_minutes
    where id = v_checkin.id;

    update public.courts
    set player_count = greatest(coalesce(player_count, 0) - 1, 0)
    where id = v_checkin.court_id;

    -- Same stats logic as livehoops_check_out(): count prior completed
    -- visits to know whether this court is a first visit (courts_visited +1)
    select count(*)::int
    into v_prior_visits
    from public.checkins
    where user_id = v_checkin.user_id
      and court_id = v_checkin.court_id
      and is_active = false
      and id <> v_checkin.id;

    v_hours_to_add := round(v_duration_minutes::numeric / 60)::int; -- always 3
    v_courts_to_add := case when coalesce(v_prior_visits, 0) = 0 then 1 else 0 end;

    update public.profiles
    set
      checkin_count = coalesce(checkin_count, 0) + 1,
      hours_played = coalesce(hours_played, 0) + v_hours_to_add,
      courts_visited = coalesce(courts_visited, 0) + v_courts_to_add
    where id = v_checkin.user_id;

    v_expired_count := v_expired_count + 1;
  end loop;

  return v_expired_count;
end;
$$;

-- Only the scheduled job should run this — never app users from the client.
revoke execute on function public.livehoops_expire_stale_checkins() from public;
revoke execute on function public.livehoops_expire_stale_checkins() from anon;
revoke execute on function public.livehoops_expire_stale_checkins() from authenticated;

-- ── Schedule it with pg_cron ────────────────────────────────────────────────
-- pg_cron is Supabase's built-in job scheduler (Dashboard → Database →
-- Extensions shows it as "pg_cron"). This runs the cleanup every 5 minutes.
-- Scheduling a job with an existing name replaces it, so re-running this
-- whole file is safe.

create extension if not exists pg_cron;

select cron.schedule(
  'livehoops-expire-checkins',   -- job name (visible in the cron.job table)
  '*/5 * * * *',                 -- every 5 minutes
  'select public.livehoops_expire_stale_checkins()'
);

-- ── Useful checks after running this file ──────────────────────────────────
-- See the scheduled job:      select * from cron.job;
-- See recent runs + results:  select * from cron.job_run_details
--                             order by start_time desc limit 10;
-- Run the cleanup once now:   select public.livehoops_expire_stale_checkins();
