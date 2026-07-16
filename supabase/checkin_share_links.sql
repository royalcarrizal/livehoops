-- LiveHoops shareable check-in links.
--
-- Apply this file to staging before deploying the matching client code. The
-- public bearer token exposes only the deliberately small projection returned
-- by get_shared_checkin(); the underlying checkins, profiles, and courts tables
-- keep their existing RLS policies.

create table if not exists public.checkin_share_links (
  token       uuid primary key default gen_random_uuid(),
  checkin_id  uuid not null references public.checkins(id) on delete cascade,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days'),
  revoked_at  timestamptz,
  constraint checkin_share_links_valid_expiry check (expires_at > created_at),
  constraint checkin_share_links_valid_revocation check (
    revoked_at is null or revoked_at >= created_at
  )
);

-- A revoked link is never reactivated. Sharing the same still-active check-in
-- again after revocation creates a fresh token, leaving the old URL dead.
create unique index if not exists checkin_share_links_one_open_per_checkin
  on public.checkin_share_links (checkin_id)
  where revoked_at is null;

create index if not exists checkin_share_links_owner_idx
  on public.checkin_share_links (owner_id, created_at desc);

alter table public.checkin_share_links enable row level security;

-- Supabase grants broad table privileges in public by default. Keep this table
-- private and expose it only through the narrowly scoped functions below.
revoke all on table public.checkin_share_links from public, anon, authenticated;

comment on table public.checkin_share_links is
  'Opaque, revocable bearer links for check-ins. Direct client reads are forbidden.';

-- Create or reuse the public token for one of the caller's live check-ins.
create or replace function public.create_checkin_share(p_checkin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_token      uuid;
  v_expires_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Lock the owned check-in while validating it so checkout/switch cannot race
  -- link creation. show_location is checked here as well as during every read.
  perform 1
  from public.checkins c
  join public.profiles p on p.id = c.user_id
  join public.courts co on co.id = c.court_id
  where c.id = p_checkin_id
    and c.user_id = v_uid
    and c.is_active is true
    and c.checked_in_at > now() - interval '3 hours'
    and p.show_location is true
    and co.verified is true
  for update of c, p;

  if not found then
    raise exception 'Check-in is not shareable' using errcode = 'P0001';
  end if;

  -- Defensive cleanup for a manually shortened expiry. A normal share cannot
  -- expire while its three-hour check-in is still active.
  update public.checkin_share_links
  set revoked_at = now()
  where checkin_id = p_checkin_id
    and owner_id = v_uid
    and revoked_at is null
    and expires_at <= now();

  insert into public.checkin_share_links (checkin_id, owner_id)
  values (p_checkin_id, v_uid)
  on conflict (checkin_id) where revoked_at is null
  do update set owner_id = excluded.owner_id
  returning token, expires_at into v_token, v_expires_at;

  return jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires_at
  );
end;
$$;

-- Resolve a bearer token for the public invite page. Invalid, revoked,
-- expired, deleted, or location-hidden links all return the same neutral shape
-- so callers cannot distinguish why a URL is unavailable.
create or replace function public.get_shared_checkin(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_row record;
  v_is_live boolean;
begin
  select
    s.expires_at,
    c.court_id,
    c.checked_in_at,
    c.checked_out_at,
    c.is_active,
    co.name as court_name,
    case when p.profile_visibility = 'public' then p.username end as player_name,
    case when p.profile_visibility = 'public' then p.avatar_url end as avatar_url
  into v_row
  from public.checkin_share_links s
  join public.checkins c on c.id = s.checkin_id and c.user_id = s.owner_id
  join public.profiles p on p.id = s.owner_id
  join public.courts co on co.id = c.court_id
  where s.token = p_token
    and s.revoked_at is null
    and s.expires_at > now()
    and p.show_location is true
    and co.verified is true;

  if not found then
    return jsonb_build_object('state', 'unavailable');
  end if;

  v_is_live := v_row.is_active is true
    and v_row.checked_in_at > now() - interval '3 hours';

  return jsonb_build_object(
    'state', case when v_is_live then 'live' else 'ended' end,
    'court_id', v_row.court_id,
    'court_name', v_row.court_name,
    'checked_in_at', v_row.checked_in_at,
    'ended_at', case
      when v_is_live then null
      else coalesce(v_row.checked_out_at, v_row.checked_in_at + interval '3 hours')
    end,
    'player_name', v_row.player_name,
    'avatar_url', v_row.avatar_url,
    'expires_at', v_row.expires_at
  );
end;
$$;

-- Owner-only management projection used by Profile -> Check-ins. It contains
-- the check-in ID solely so the owner can match a link to their own history.
create or replace function public.list_my_checkin_shares()
returns table(
  token uuid,
  checkin_id uuid,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select s.token, s.checkin_id, s.created_at, s.expires_at
  from public.checkin_share_links s
  where auth.uid() is not null
    and s.owner_id = auth.uid()
    and s.revoked_at is null
    and s.expires_at > now()
  order by s.created_at desc;
$$;

create or replace function public.revoke_checkin_share(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.checkin_share_links
  set revoked_at = now()
  where token = p_token
    and owner_id = v_uid
    and revoked_at is null;

  return found;
end;
$$;

-- Hiding location permanently kills every outstanding bearer URL. Turning the
-- setting back on never resurrects an old link; a new active share gets a new
-- token instead.
create or replace function public.revoke_checkin_shares_when_location_hidden()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.checkin_share_links
  set revoked_at = now()
  where owner_id = new.id
    and revoked_at is null;

  return new;
end;
$$;

drop trigger if exists profiles_revoke_checkin_shares_on_location_hidden
  on public.profiles;

create trigger profiles_revoke_checkin_shares_on_location_hidden
after update of show_location on public.profiles
for each row
when (old.show_location is distinct from new.show_location and new.show_location is false)
execute function public.revoke_checkin_shares_when_location_hidden();

-- Backstop for a partial rollout or safe re-run where a hidden profile already
-- had an outstanding token before the trigger existed.
update public.checkin_share_links s
set revoked_at = now()
from public.profiles p
where p.id = s.owner_id
  and p.show_location is false
  and s.revoked_at is null;

-- Functions are executable by PUBLIC unless explicitly revoked.
revoke all on function public.create_checkin_share(uuid) from public, anon, authenticated;
revoke all on function public.get_shared_checkin(uuid) from public, anon, authenticated;
revoke all on function public.list_my_checkin_shares() from public, anon, authenticated;
revoke all on function public.revoke_checkin_share(uuid) from public, anon, authenticated;
revoke all on function public.revoke_checkin_shares_when_location_hidden()
  from public, anon, authenticated;

grant execute on function public.create_checkin_share(uuid) to authenticated;
grant execute on function public.get_shared_checkin(uuid) to anon, authenticated;
grant execute on function public.list_my_checkin_shares() to authenticated;
grant execute on function public.revoke_checkin_share(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Staging verification checklist (run with representative owner/non-owner and
-- anonymous JWTs before production):
--   1. Direct SELECT on checkin_share_links is denied.
--   2. Only the owner can create/revoke; hidden or stale check-ins are refused.
--   3. Repeated creation reuses a token; revoke + reshare produces a new token.
--   4. Public resolution never returns address, coordinates, email, IDs for the
--      owner/check-in, settings, player counts, or unrelated history.
--   5. Checkout/switch returns an ended recap; expiry/privacy-off returns only
--      {"state":"unavailable"}.
