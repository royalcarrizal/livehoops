-- supabase/meetup_duration.sql
--
-- Adds a LENGTH to scheduled runs.
--
-- Until now a run had a start time and nothing else, so the UI could say
-- "Friday 6:30 PM" but never "6:30p · 2h". The redesigned Home screen shows the
-- length on every run card, so it has to be real data rather than a guess.
--
-- Ships three things:
--   1. meetups.duration_minutes   — the column, defaulted and range-checked
--   2. livehoops_create_meetup    — takes the length from the client, re-checks it
--   3. get_upcoming_meetups       — returns it so the cards can render it
--
-- ── Why both functions are DROPPED and not just REPLACED ────────────────────
-- `create or replace function` cannot change a function's signature or its
-- return type. Left as a replace, Postgres would happily create a SECOND
-- four-argument overload of livehoops_create_meetup sitting alongside the new
-- five-argument one, and every call would then be ambiguous — a failure that
-- shows up at runtime in production, not here. Same reasoning for
-- get_upcoming_meetups: adding a column to a `returns table` IS a return-type
-- change. So both are dropped first, deliberately.
--
-- Dropping a function does not touch any data. The meetups rows are untouched.

-- ── 1. The column ───────────────────────────────────────────────────────────
-- 90 minutes is the default because it is the most common pickup session and
-- it is what the app's own scheduling form suggests. Existing rows created
-- before this migration get 90 as well, which is a stated assumption rather
-- than a known fact — those runs never recorded a length.
--
-- The range is 15 minutes to 8 hours. The lower bound stops a typo creating a
-- "1 minute" run; the upper bound stops one creating a week-long one.

alter table public.meetups
  add column if not exists duration_minutes int not null default 90;

alter table public.meetups
  drop constraint if exists meetups_duration_check;

alter table public.meetups
  add constraint meetups_duration_check
  check (duration_minutes between 15 and 480);

-- ── 2. Create a run, now with a length ──────────────────────────────────────
-- Unchanged from the original except for the new parameter and its validation.
-- The length is re-checked here and NOT trusted from the client: the check
-- constraint above would catch a bad value anyway, but it would surface as an
-- opaque constraint-violation error instead of a readable message.

drop function if exists public.livehoops_create_meetup(uuid, timestamptz, text, text);

create or replace function public.livehoops_create_meetup(
  p_court_id         uuid,
  p_scheduled_at     timestamptz,
  p_title            text,
  p_visibility       text,
  p_duration_minutes int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid := auth.uid();
  v_court      record;
  v_meetup     record;
  v_visibility text := coalesce(nullif(trim(p_visibility), ''), 'public');
  -- A null length from the client means "didn't say", not "invalid" — an older
  -- app build that hasn't been updated yet still schedules runs successfully.
  v_duration   int  := coalesce(p_duration_minutes, 90);
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if v_visibility not in ('public', 'friends') then
    raise exception 'Invalid visibility';
  end if;

  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception 'Run must be scheduled in the future';
  end if;

  if v_duration < 15 or v_duration > 480 then
    raise exception 'Run length must be between 15 minutes and 8 hours';
  end if;

  select id, name
  into v_court
  from public.courts
  where id = p_court_id
    and verified = true;

  if not found then
    raise exception 'Court is not available';
  end if;

  insert into public.meetups (court_id, host_id, title, scheduled_at, visibility, duration_minutes)
  values (
    p_court_id,
    v_uid,
    nullif(trim(coalesce(p_title, '')), ''),
    p_scheduled_at,
    v_visibility,
    v_duration
  )
  returning id, court_id, scheduled_at, duration_minutes into v_meetup;

  -- Host is automatically going (never anonymous to themselves).
  insert into public.meetup_rsvps (meetup_id, user_id, anonymous)
  values (v_meetup.id, v_uid, false)
  on conflict (meetup_id, user_id) do nothing;

  return jsonb_build_object(
    'meetup_id',        v_meetup.id,
    'court_id',         v_meetup.court_id,
    'court_name',       coalesce(v_court.name, 'Unknown Court'),
    'scheduled_at',     v_meetup.scheduled_at,
    'duration_minutes', v_meetup.duration_minutes
  );
end;
$$;

-- ── 3. Read upcoming runs, now carrying the length ──────────────────────────
-- Identical to the original query with duration_minutes appended. The
-- visibility rules (public, or yours, or a friend's) are unchanged — this
-- migration must not widen who can see a run.

drop function if exists public.get_upcoming_meetups();

create or replace function public.get_upcoming_meetups()
returns table (
  meetup_id        uuid,
  court_id         uuid,
  court_name       text,
  host_id          uuid,
  host_username    text,
  host_avatar_url  text,
  title            text,
  scheduled_at     timestamptz,
  duration_minutes int,
  visibility       text,
  attendee_count   bigint,
  viewer_joined    boolean,
  viewer_anonymous boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    m.id,
    m.court_id,
    co.name,
    m.host_id,
    hp.username,
    hp.avatar_url,
    m.title,
    m.scheduled_at,
    m.duration_minutes,
    m.visibility,
    (select count(*) from meetup_rsvps r where r.meetup_id = m.id),
    exists (
      select 1 from meetup_rsvps r
      where r.meetup_id = m.id and r.user_id = auth.uid()
    ),
    coalesce((
      select r.anonymous from meetup_rsvps r
      where r.meetup_id = m.id and r.user_id = auth.uid()
    ), false)
  from meetups m
  join courts   co on co.id = m.court_id
  join profiles hp on hp.id = m.host_id
  where m.scheduled_at > now() - interval '1 hour'
    and (
      m.visibility = 'public'
      or m.host_id = auth.uid()
      or public.is_accepted_friend(m.host_id)
    )
  order by m.scheduled_at asc;
$$;

-- ── 4. Permissions ──────────────────────────────────────────────────────────
-- A grant names the function's full argument-type signature, so the grants
-- issued in meetups.sql died with the old four-argument function. Without
-- these lines every logged-in user gets "permission denied for function"
-- the first time they try to schedule a run.

revoke execute on function public.livehoops_create_meetup(uuid, timestamptz, text, text, int) from public;
revoke execute on function public.get_upcoming_meetups()                                      from public;

grant execute on function public.livehoops_create_meetup(uuid, timestamptz, text, text, int) to authenticated;
grant execute on function public.get_upcoming_meetups()                                      to authenticated;

-- ── Verifying this migration after applying it ──────────────────────────────
--
-- a) Exactly ONE version of the create function should exist. If this returns
--    two rows, the drop did not happen and calls will be ambiguous:
--
--      select pg_get_function_identity_arguments(oid)
--      from pg_proc where proname = 'livehoops_create_meetup';
--
--    Expect one row: uuid, timestamp with time zone, text, text, integer
--
-- b) Existing runs kept their data and picked up the default:
--
--      select id, scheduled_at, duration_minutes from public.meetups limit 5;
--
--    Expect duration_minutes = 90 on every pre-existing row.
--
-- c) The range check bites:
--
--      select public.livehoops_create_meetup(
--        '<a-verified-court-id>', now() + interval '1 day', 'test', 'public', 5);
--
--    Expect: ERROR — Run length must be between 15 minutes and 8 hours
--
-- d) A friends-only run belonging to someone who is NOT your friend must still
--    be invisible. Log in as an unrelated user and confirm it is absent from:
--
--      select court_name, scheduled_at, duration_minutes from public.get_upcoming_meetups();
