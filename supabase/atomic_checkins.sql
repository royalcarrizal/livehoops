-- LiveHoops atomic check-in/check-out RPCs.
-- Run this manually in the Supabase SQL editor before deploying the matching app code.

create or replace function public.livehoops_check_out(p_checkin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_checkin record;
  v_duration_minutes int;
  v_prior_visits int;
  v_hours_to_add int;
  v_courts_to_add int;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select id, user_id, court_id, checked_in_at
  into v_checkin
  from public.checkins
  where id = p_checkin_id
    and user_id = v_uid
    and is_active = true
  for update;

  if not found then
    return jsonb_build_object(
      'checked_out', false,
      'court_id', null,
      'duration_minutes', null
    );
  end if;

  v_duration_minutes := greatest(
    1,
    floor(extract(epoch from (now() - v_checkin.checked_in_at)) / 60)::int
  );

  update public.checkins
  set
    is_active = false,
    checked_out_at = now(),
    duration_minutes = v_duration_minutes
  where id = v_checkin.id;

  update public.courts
  set player_count = greatest(coalesce(player_count, 0) - 1, 0)
  where id = v_checkin.court_id;

  select count(*)::int
  into v_prior_visits
  from public.checkins
  where user_id = v_uid
    and court_id = v_checkin.court_id
    and is_active = false
    and id <> v_checkin.id;

  v_hours_to_add := round(v_duration_minutes::numeric / 60)::int;
  v_courts_to_add := case when coalesce(v_prior_visits, 0) = 0 then 1 else 0 end;

  update public.profiles
  set
    checkin_count = coalesce(checkin_count, 0) + 1,
    hours_played = coalesce(hours_played, 0) + v_hours_to_add,
    courts_visited = coalesce(courts_visited, 0) + v_courts_to_add
  where id = v_uid;

  return jsonb_build_object(
    'checked_out', true,
    'court_id', v_checkin.court_id,
    'duration_minutes', v_duration_minutes
  );
end;
$$;

create or replace function public.livehoops_check_in(p_court_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_court record;
  v_existing record;
  v_new_checkin record;
  v_checkout_result jsonb;
  v_previous_court_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select id, name, address, city
  into v_court
  from public.courts
  where id = p_court_id
    and verified = true
  for update;

  if not found then
    raise exception 'Court is not available for check-in';
  end if;

  select id, court_id
  into v_existing
  from public.checkins
  where user_id = v_uid
    and is_active = true
  order by checked_in_at desc
  limit 1
  for update;

  if found then
    v_checkout_result := public.livehoops_check_out(v_existing.id);
    v_previous_court_id := nullif(v_checkout_result->>'court_id', '')::uuid;
  end if;

  insert into public.checkins (user_id, court_id, is_active)
  values (v_uid, p_court_id, true)
  returning id, court_id, checked_in_at
  into v_new_checkin;

  update public.courts
  set player_count = coalesce(player_count, 0) + 1
  where id = p_court_id;

  return jsonb_build_object(
    'checkin_id', v_new_checkin.id,
    'court_id', v_new_checkin.court_id,
    'court_name', coalesce(v_court.name, 'Unknown Court'),
    'court_address', concat_ws(', ', v_court.address, v_court.city || ' TX'),
    'checked_in_at', v_new_checkin.checked_in_at,
    'previous_court_id', v_previous_court_id
  );
end;
$$;

revoke execute on function public.livehoops_check_in(uuid) from public;
revoke execute on function public.livehoops_check_out(uuid) from public;

grant execute on function public.livehoops_check_in(uuid) to authenticated;
grant execute on function public.livehoops_check_out(uuid) to authenticated;
