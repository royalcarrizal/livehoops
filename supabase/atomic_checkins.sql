-- LiveHoops atomic check-in/check-out RPCs.
-- Run this manually in the Supabase SQL editor before deploying the matching app code.
-- Safe to re-run: both functions are `create or replace` with unchanged
-- signatures, and the grants are re-asserted at the bottom.
--
-- Two corrections live in here, both explained at the line they affect:
--   • the returned court_address no longer appends a hardcoded " TX"
--   • hours_played now accumulates the MARGINAL hours a session adds, instead
--     of rounding each session in isolation and losing every remainder
-- Neither changes a signature or a column, so no client change is needed and
-- cached PWA bundles keep working. See the verification notes at the bottom.
--
-- ROLLBACK
-- The bottom of this file contains the two previous expressions verbatim.
-- There is no staging project, so that block is the undo button.

begin;

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
  v_prior_minutes int;
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

  -- Every completed session this player has, at ANY court, excluding the one
  -- just closed above. Same exclusion as v_prior_visits, different row set:
  -- that one is per-court (for courts_visited), this one is lifetime.
  select coalesce(sum(duration_minutes), 0)::int
  into v_prior_minutes
  from public.checkins
  where user_id = v_uid
    and is_active = false
    and id <> v_checkin.id;

  -- The hours this session ADDS to the player's true running total — not the
  -- rounded value of the session on its own.
  --
  -- This line used to be `round(v_duration_minutes / 60)`, applied per session,
  -- which threw away every session's remainder independently: ten 20-minute
  -- runs added ZERO hours, while a single 45-minute run added a whole one.
  -- Nothing errored. The number was simply wrong, and grew wronger the more
  -- someone played — the silent, cumulative failure mode utils/autoCheckout.js
  -- warns about at length for the sibling arithmetic in this same function.
  --
  -- Taking the difference between the total before and after is what makes it
  -- correct going forward WITHOUT rewriting history: whatever hours_played
  -- already holds is preserved exactly, so no existing profile is touched and
  -- nobody's number drops. From here on it tracks real time played.
  --
  -- livehoops_expire_stale_checkins() computes this identically, and must keep
  -- doing so — the two paths close the same sessions and cannot disagree about
  -- how long they lasted.
  v_hours_to_add :=
      round((v_prior_minutes + v_duration_minutes)::numeric / 60)::int
    - round(v_prior_minutes::numeric / 60)::int;

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
    -- Address and city, and no hardcoded state. normalizeCourt
    -- (src/hooks/useCourts.js) deliberately dropped the state for the reason
    -- its comment gives — "courts can exist outside Texas" — and builds
    -- `${address}, ${city}`. This string has to match it exactly, because it
    -- is the fallback CheckInScreen shows while the courts list is still
    -- loading; when they disagree the address visibly rewrites itself under
    -- the user a second after check-in. A court in Brooklyn read
    -- "Cadman Plaza, Brooklyn TX" until the real data arrived.
    'court_address', concat_ws(', ', v_court.address, v_court.city),
    'checked_in_at', v_new_checkin.checked_in_at,
    'previous_court_id', v_previous_court_id
  );
end;
$$;

revoke execute on function public.livehoops_check_in(uuid) from public;
revoke execute on function public.livehoops_check_out(uuid) from public;

grant execute on function public.livehoops_check_in(uuid) to authenticated;
grant execute on function public.livehoops_check_out(uuid) to authenticated;

commit;


-- ── Verifying this after applying it ────────────────────────────────────────
--
-- Both changes are the quiet kind: nothing throws either way, so the only way
-- to know they worked is to look at the values.
--
-- a) THE ADDRESS — check in at a court whose city is not in Texas.
--
--      select (public.livehoops_check_in('<court-uuid>'))->>'court_address';
--
--    Expect "<street>, <city>" with no " TX". In the app, the Check screen's
--    address must also stay identical when the courts list finishes loading —
--    that flicker was the visible symptom.
--
-- b) THE HOURS, short sessions — the case that used to add nothing at all.
--    Note a player's current total first:
--
--      select hours_played from public.profiles where id = '<user-uuid>';
--
--    Then complete three roughly 20-minute check-ins as that player. Expect
--    the total to rise by 1 across the three (60 minutes crossed once), where
--    before it rose by 0. Sessions do not have to be at the same court.
--
-- c) THE HOURS, existing totals — the starting value from (b) must be
--    unchanged by applying this file itself. Nothing here rewrites history:
--    apply it, re-run the select, expect the same number as before.
--
-- d) THE HOURS, both paths agree — let a session run past the player's auto
--    check-out limit so the pg_cron job closes it instead
--    (supabase/configurable_auto_checkout.sql). It must add the same marginal
--    hours a manual check-out would for the same duration. If these two ever
--    disagree, a player's total depends on HOW their session ended, which is
--    exactly the class of silent, cumulative error utils/autoCheckout.js was
--    written to prevent.
--
-- e) NOTHING ELSE MOVED — check in, switch courts, check out. Confirm
--    player_count still rises and falls correctly, checkin_count increments by
--    one per completed session, and courts_visited only increments the first
--    time you play somewhere.


-- ── ROLLBACK: the two previous expressions, verbatim ────────────────────────
-- Both changes live inside function bodies, so rolling back means editing two
-- lines and re-running the file rather than executing a block. Restore these,
-- then re-run this whole file (grants included — they are at the bottom).
--
-- In livehoops_check_in, the returned address:
--
--   'court_address', concat_ws(', ', v_court.address, v_court.city || ' TX'),
--
-- In livehoops_check_out, the hours added:
--
--   v_hours_to_add := round(v_duration_minutes::numeric / 60)::int;
--
-- The v_prior_minutes declaration and its SELECT can stay — an unused variable
-- is harmless — or be removed with it.
--
-- The matching line in supabase/configurable_auto_checkout.sql must be reverted
-- IN THE SAME PASS. Leaving one path on marginal hours and the other on
-- per-session rounding means a player's lifetime total depends on whether they
-- checked out by hand or let the session expire, which is a worse state than
-- either version on its own.
--
-- Nothing needs undoing in the data: neither change rewrote a single existing
-- row, so a rollback restores the old arithmetic without leaving anything
-- inconsistent behind it.
