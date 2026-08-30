-- LiveHoops: per-user auto check-out limit.
-- Run this manually in the Supabase SQL editor.
--
-- ⚠️  READ THIS BEFORE RUNNING. Unlike the bio/positions/home-court
--     migrations, this one is NOT purely additive. It replaces a
--     SECURITY DEFINER function that pg_cron executes every five minutes
--     against live check-ins. Read the whole file first.
--
-- WHY
-- Every session currently expires after exactly 3 hours. Some people hoop for
-- an hour and forget to check out; the court then shows them as live for two
-- more hours. Letting a player pick their own limit fixes that at the source.
--
-- WHY THERE IS NO "NEVER" OPTION
-- The design mocked up 1h / 2h / 3h / Never. "Never" is omitted deliberately:
-- a session that never expires is precisely the ghost player this function was
-- written to prevent. The court's live count stays inflated indefinitely and
-- everyone else sees a game that is not happening.
--
-- WHAT MAKES THIS RISKY
-- The old function hardcoded "3 hours" in THREE separate places inside one
-- loop, and the third is the dangerous one:
--
--   1. the WHERE clause          — which sessions are stale
--   2. checked_out_at backdating — when the session actually ended
--   3. v_duration_minutes := 180 — HOW LONG IT RAN
--
-- (3) is added to the player's lifetime hours_played. Change (1) and (2) to be
-- per-user but leave (3) at 180 and nothing errors — every expired 1-hour
-- session just quietly credits 3 hours forever, to a stat the profile displays
-- and the achievements read. Silent, cumulative, and invisible until long
-- after the fact.
--
-- THIS FILE DOES BOTH HALVES, ON PURPOSE
-- The column and the function are in one file so they cannot be applied
-- separately. A column without the new function means a player picks 1h and
-- the server keeps expiring them at 3h.
--
-- ROLLBACK
-- The bottom of this file contains the original 3-hour function verbatim.
-- Running that block restores the previous behaviour immediately; the column
-- can stay (it simply stops being read) or be dropped separately.

begin;

-- ── 1. The column ───────────────────────────────────────────────────────────
-- `not null default 3` means every existing row keeps today's behaviour with
-- no backfill, and there is no "unset" state to reason about.

alter table public.profiles
  add column if not exists auto_checkout_hours smallint not null default 3;

alter table public.profiles
  drop constraint if exists profiles_auto_checkout_hours_check;

-- A closed set rather than a range. The UI offers exactly these three, and an
-- out-of-range value should be impossible rather than merely unlikely.
alter table public.profiles
  add constraint profiles_auto_checkout_hours_check
  check (auto_checkout_hours in (1, 2, 3));

-- ── 2. The expiry function, per-user ────────────────────────────────────────
-- Same name, so the existing pg_cron job picks this up automatically with no
-- rescheduling needed.

create or replace function public.livehoops_expire_stale_checkins()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkin record;
  v_expired_count int := 0;
  v_limit_hours int;
  v_duration_minutes int;
  v_prior_visits int;
  v_prior_minutes int;
  v_hours_to_add int;
  v_courts_to_add int;
begin
  for v_checkin in
    select
      c.id, c.user_id, c.court_id, c.checked_in_at,
      -- LEFT JOIN, not INNER. A check-in whose profile row is gone (account
      -- deleted, row removed by hand) must still expire. An inner join would
      -- silently skip it and leave that player on the court forever — the
      -- exact bug this function exists to prevent, reintroduced through the
      -- side door. coalesce gives orphans the default limit.
      coalesce(p.auto_checkout_hours, 3)::int as limit_hours
    from public.checkins c
    left join public.profiles p on p.id = c.user_id
    where c.is_active = true
      and c.checked_in_at
            < now() - (coalesce(p.auto_checkout_hours, 3)::int * interval '1 hour')
    -- OF c: lock only the check-in row. Without the OF clause this would also
    -- try to lock the joined profile, which is both unnecessary and not
    -- permitted on the nullable side of an outer join.
    for update of c skip locked
  loop
    v_limit_hours := v_checkin.limit_hours;

    -- The session is capped at the player's own limit, so record exactly that
    -- many minutes. This is the line that used to be a flat 180.
    v_duration_minutes := v_limit_hours * 60;

    update public.checkins
    set
      is_active = false,
      -- Backdated to when the session actually expired, not when this job
      -- happened to run.
      checked_out_at = v_checkin.checked_in_at + (v_limit_hours * interval '1 hour'),
      duration_minutes = v_duration_minutes
    where id = v_checkin.id;

    update public.courts
    set player_count = greatest(coalesce(player_count, 0) - 1, 0)
    where id = v_checkin.court_id;

    -- Same stats logic as livehoops_check_out(): count prior completed visits
    -- to know whether this court is a first visit (courts_visited +1).
    select count(*)::int
    into v_prior_visits
    from public.checkins
    where user_id = v_checkin.user_id
      and court_id = v_checkin.court_id
      and is_active = false
      and id <> v_checkin.id;

    -- Lifetime completed minutes, excluding the session just expired above.
    select coalesce(sum(duration_minutes), 0)::int
    into v_prior_minutes
    from public.checkins
    where user_id = v_checkin.user_id
      and is_active = false
      and id <> v_checkin.id;

    -- The MARGINAL hours this session adds to the player's true total, which
    -- must match what livehoops_check_out() computes for the same session —
    -- these two functions close the same kind of session by different routes
    -- and cannot disagree about how long it lasted.
    --
    -- Was round(v_duration_minutes / 60) per session, which discarded each
    -- session's remainder in isolation. Here that was the more visible half of
    -- the bug: an expired session is always a whole number of hours (the
    -- player's own limit), so it rounded cleanly and looked right — while every
    -- manual check-out beside it was quietly losing minutes.
    v_hours_to_add :=
        round((v_prior_minutes + v_duration_minutes)::numeric / 60)::int
      - round(v_prior_minutes::numeric / 60)::int;

    v_courts_to_add := case when coalesce(v_prior_visits, 0) = 0 then 1 else 0 end;

    -- No-ops harmlessly when the profile row is gone, which is what we want.
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

-- ── 3. Re-assert the grants ─────────────────────────────────────────────────
-- create or replace resets privileges to the default, which is EXECUTE for
-- PUBLIC. Leaving these out would make a SECURITY DEFINER function callable by
-- any logged-in user — letting anyone force-expire every check-in in the app.
-- These lines are not boilerplate; re-run them every time this function
-- changes.

revoke execute on function public.livehoops_expire_stale_checkins() from public;
revoke execute on function public.livehoops_expire_stale_checkins() from anon;
revoke execute on function public.livehoops_expire_stale_checkins() from authenticated;

commit;

-- ── Verify after running ────────────────────────────────────────────────────
--
-- a) The grants actually stuck. This should return NO rows for anon or
--    authenticated — if it returns any, stop and re-run the revokes:
--
--      select grantee, privilege_type
--      from information_schema.role_routine_grants
--      where routine_name = 'livehoops_expire_stale_checkins';
--
-- b) The duration maths. This is the check that matters most, because getting
--    it wrong throws nothing. On a throwaway account, set a 1-hour limit,
--    create a check-in backdated 70 minutes, run the function, and confirm
--    duration_minutes is 60 — NOT 180:
--
--      update public.profiles set auto_checkout_hours = 1 where id = '<test-user>';
--      insert into public.checkins (user_id, court_id, checked_in_at, is_active)
--      values ('<test-user>', '<court>', now() - interval '70 minutes', true);
--      select public.livehoops_expire_stale_checkins();
--      select duration_minutes, checked_out_at from public.checkins
--        where user_id = '<test-user>' order by checked_in_at desc limit 1;
--
--    Expect duration_minutes = 60, and checked_out_at ≈ checked_in_at + 1 hour.
--
-- c) A 3-hour user is untouched at 70 minutes — same setup with
--    auto_checkout_hours = 3 should leave is_active = true.
--
-- d) The cron job still points at this function:
--      select jobname, schedule, command from cron.job;
--
--
-- ── ROLLBACK: the original 3-hour function, verbatim ────────────────────────
-- Run this block to restore the previous behaviour.
--
-- ⚠️  THIS BLOCK NOW GOES BACK TWO CHANGES, NOT ONE. It was written to undo the
--     per-user limits, and it still does that. But the function above has since
--     also been corrected to add MARGINAL hours rather than rounding each
--     session in isolation, and this block predates that fix — running it
--     restores the per-session rounding along with the flat 3-hour expiry.
--
--     If you only want to undo the hours change, edit the one line in the live
--     function instead (see the ROLLBACK note in supabase/atomic_checkins.sql,
--     which carries the matching expression and must be reverted in the same
--     pass — the two paths cannot disagree about how long a session lasted).
--
-- create or replace function public.livehoops_expire_stale_checkins()
-- returns integer
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_checkin record;
--   v_expired_count int := 0;
--   v_duration_minutes int;
--   v_prior_visits int;
--   v_hours_to_add int;
--   v_courts_to_add int;
-- begin
--   for v_checkin in
--     select id, user_id, court_id, checked_in_at
--     from public.checkins
--     where is_active = true
--       and checked_in_at < now() - interval '3 hours'
--     for update skip locked
--   loop
--     v_duration_minutes := 180;
--     update public.checkins
--     set is_active = false,
--         checked_out_at = v_checkin.checked_in_at + interval '3 hours',
--         duration_minutes = v_duration_minutes
--     where id = v_checkin.id;
--     update public.courts
--     set player_count = greatest(coalesce(player_count, 0) - 1, 0)
--     where id = v_checkin.court_id;
--     select count(*)::int into v_prior_visits
--     from public.checkins
--     where user_id = v_checkin.user_id and court_id = v_checkin.court_id
--       and is_active = false and id <> v_checkin.id;
--     v_hours_to_add := round(v_duration_minutes::numeric / 60)::int;
--     v_courts_to_add := case when coalesce(v_prior_visits, 0) = 0 then 1 else 0 end;
--     update public.profiles
--     set checkin_count = coalesce(checkin_count, 0) + 1,
--         hours_played = coalesce(hours_played, 0) + v_hours_to_add,
--         courts_visited = coalesce(courts_visited, 0) + v_courts_to_add
--     where id = v_checkin.user_id;
--     v_expired_count := v_expired_count + 1;
--   end loop;
--   return v_expired_count;
-- end;
-- $$;
--
-- revoke execute on function public.livehoops_expire_stale_checkins() from public;
-- revoke execute on function public.livehoops_expire_stale_checkins() from anon;
-- revoke execute on function public.livehoops_expire_stale_checkins() from authenticated;
