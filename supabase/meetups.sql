-- LiveHoops: scheduled meetups ("runs") at courts.
-- Run this manually in the Supabase SQL editor. Safe to re-run.
--
-- WHAT THIS ADDS
-- A user can schedule a run at a court for a future time. Other users discover
-- it (Home "Upcoming Runs" row, map marker badge, court sheet), RSVP to it, and
-- get notified. Mirrors the check-in architecture: atomic plpgsql mutations,
-- SECURITY DEFINER cross-user reads, and the show_location/visibility/friendship
-- privacy model already used by get_court_active_players.
--
-- PRIVACY
--   meetups.visibility is chosen per run by the host:
--     'public'  — every logged-in user can see it
--     'friends' — only the host's accepted friends (and the host) can see it
--   RSVPs can be anonymous: an anonymous joiner is shown to everyone else
--   (including the host) as "Baller" with no avatar and no leaked identity,
--   but still counts toward the "going" total. You always see your own RSVP.

-- ── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.meetups (
  id            uuid primary key default gen_random_uuid(),
  court_id      uuid not null references public.courts(id)  on delete cascade,
  host_id       uuid not null references auth.users(id)     on delete cascade,
  title         text,
  scheduled_at  timestamptz not null,
  visibility    text not null default 'public',
  reminder_sent boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint meetups_visibility_check check (visibility in ('public', 'friends'))
);

create index if not exists meetups_court_id_idx     on public.meetups(court_id);
create index if not exists meetups_scheduled_at_idx on public.meetups(scheduled_at);

create table if not exists public.meetup_rsvps (
  meetup_id  uuid not null references public.meetups(id) on delete cascade,
  user_id    uuid not null references auth.users(id)     on delete cascade,
  anonymous  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);

-- ── Row Level Security ──────────────────────────────────────────────────────
-- meetups: hosts manage their own rows directly; every cross-user read goes
-- through the SECURITY DEFINER functions below (which enforce visibility), and
-- creation/cancellation go through the DEFINER RPCs (which bypass RLS). So the
-- base table only needs owner-scoped select/delete as defense in depth.

alter table public.meetups enable row level security;

drop policy if exists "meetups_select_own" on public.meetups;
create policy "meetups_select_own"
  on public.meetups for select
  to authenticated
  using (host_id = auth.uid());

drop policy if exists "meetups_delete_own" on public.meetups;
create policy "meetups_delete_own"
  on public.meetups for delete
  to authenticated
  using (host_id = auth.uid());

-- meetup_rsvps: join/leave/toggle-anonymity happen as direct table ops from the
-- client (like court_favorites), so real owner-scoped policies are required.
-- Reading OTHER users' RSVPs (the attendee list) goes through the DEFINER
-- function, which masks anonymous joiners.

alter table public.meetup_rsvps enable row level security;

drop policy if exists "meetup_rsvps_select_own" on public.meetup_rsvps;
create policy "meetup_rsvps_select_own"
  on public.meetup_rsvps for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "meetup_rsvps_insert_own" on public.meetup_rsvps;
create policy "meetup_rsvps_insert_own"
  on public.meetup_rsvps for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "meetup_rsvps_update_own" on public.meetup_rsvps;
create policy "meetup_rsvps_update_own"
  on public.meetup_rsvps for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "meetup_rsvps_delete_own" on public.meetup_rsvps;
create policy "meetup_rsvps_delete_own"
  on public.meetup_rsvps for delete
  to authenticated
  using (user_id = auth.uid());

-- ── Mutation: create a meetup ───────────────────────────────────────────────
-- Validates the court + time + visibility, inserts the meetup, and auto-RSVPs
-- the host (so they count as "1 going" and appear in the attendee list).

create or replace function public.livehoops_create_meetup(
  p_court_id     uuid,
  p_scheduled_at timestamptz,
  p_title        text,
  p_visibility   text
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

  select id, name
  into v_court
  from public.courts
  where id = p_court_id
    and verified = true;

  if not found then
    raise exception 'Court is not available';
  end if;

  insert into public.meetups (court_id, host_id, title, scheduled_at, visibility)
  values (
    p_court_id,
    v_uid,
    nullif(trim(coalesce(p_title, '')), ''),
    p_scheduled_at,
    v_visibility
  )
  returning id, court_id, scheduled_at into v_meetup;

  -- Host is automatically going (never anonymous to themselves).
  insert into public.meetup_rsvps (meetup_id, user_id, anonymous)
  values (v_meetup.id, v_uid, false)
  on conflict (meetup_id, user_id) do nothing;

  return jsonb_build_object(
    'meetup_id',    v_meetup.id,
    'court_id',     v_meetup.court_id,
    'court_name',   coalesce(v_court.name, 'Unknown Court'),
    'scheduled_at', v_meetup.scheduled_at
  );
end;
$$;

-- ── Mutation: cancel a meetup (host only) ───────────────────────────────────
-- Deleting the meetup cascades to its RSVPs.

create or replace function public.livehoops_cancel_meetup(p_meetup_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_meetup record;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select id, host_id, court_id
  into v_meetup
  from public.meetups
  where id = p_meetup_id;

  if not found then
    return jsonb_build_object('canceled', false, 'court_id', null);
  end if;

  if v_meetup.host_id <> v_uid then
    raise exception 'Only the host can cancel this run';
  end if;

  delete from public.meetups where id = p_meetup_id;

  return jsonb_build_object('canceled', true, 'court_id', v_meetup.court_id);
end;
$$;

-- ── Read: upcoming visible meetups (Home row + map badges) ───────────────────
-- Every meetup the caller may see, starting from 1 hour ago (grace so a run
-- that just started still shows). SECURITY DEFINER because the base-table
-- select policy is host-only; visibility is enforced here instead.

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

-- ── Read: attendee list for one meetup (masks anonymous joiners) ─────────────
-- Anonymous RSVPs (other than your own) come back as "Baller" with no id/avatar
-- so their identity never leaks — but they're still a row, so the count matches.

create or replace function public.get_meetup_attendees(p_meetup_id uuid)
returns table (
  user_id    uuid,
  username   text,
  avatar_url text,
  anonymous  boolean,
  is_host    boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    case when r.anonymous and r.user_id <> auth.uid() then null
         else r.user_id end,
    case when r.anonymous and r.user_id <> auth.uid() then 'Baller'
         else p.username end,
    case when r.anonymous and r.user_id <> auth.uid() then null
         else p.avatar_url end,
    r.anonymous,
    (r.user_id = m.host_id)
  from meetup_rsvps r
  join meetups  m on m.id = r.meetup_id
  join profiles p on p.id = r.user_id
  where r.meetup_id = p_meetup_id
    and (
      m.visibility = 'public'
      or m.host_id = auth.uid()
      or public.is_accepted_friend(m.host_id)
    )
  order by (r.user_id = m.host_id) desc, r.created_at asc;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke execute on function public.livehoops_create_meetup(uuid, timestamptz, text, text) from public;
revoke execute on function public.livehoops_cancel_meetup(uuid)                            from public;
revoke execute on function public.get_upcoming_meetups()                                   from public;
revoke execute on function public.get_meetup_attendees(uuid)                               from public;

grant execute on function public.livehoops_create_meetup(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.livehoops_cancel_meetup(uuid)                            to authenticated;
grant execute on function public.get_upcoming_meetups()                                   to authenticated;
grant execute on function public.get_meetup_attendees(uuid)                               to authenticated;
