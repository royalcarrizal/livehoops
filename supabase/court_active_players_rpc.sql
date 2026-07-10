-- LiveHoops: who's checked in at each court, for the map and court sheets.
-- Run this manually in the Supabase SQL editor.
--
-- WHY AN RPC
-- The checkins_select_own RLS policy (correctly) blocks reading other
-- users' check-in rows, so the app can't query this directly. This
-- SECURITY DEFINER function reads them internally and exposes only what
-- the map needs: which court, who (username + avatar), and when.
--
-- PRIVACY RULES (matching the rest of the app)
--   - show_location = false        → never shown to anyone (same switch that
--                                    hides you from the friends "playing now"
--                                    row and check-in pushes)
--   - profile_visibility 'public'  → visible to every logged-in user
--   - 'friends' / 'private'        → visible only to accepted friends
--   - yourself                     → always visible to you, so the feature
--                                    never looks broken from your own phone
--
-- A 3-hour cap mirrors the auto-expiry rule, so a stale row that hasn't
-- been expired yet can't pin someone to a court all day.

create or replace function public.get_court_active_players()
returns table(court_id uuid, user_id uuid, username text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  select  c.court_id,
          c.user_id,
          p.username,
          p.avatar_url
  from    checkins c
  join    profiles p on p.id = c.user_id
  where   c.is_active = true
    and   c.checked_in_at > now() - interval '3 hours'
    and (
          -- always show the caller their own check-in
          c.user_id = auth.uid()
          or (
            p.show_location = true
            and (
              p.profile_visibility = 'public'
              or exists (
                select 1
                from   friendships f
                where  f.status = 'accepted'
                  and ((f.requester_id = auth.uid() and f.addressee_id = c.user_id)
                    or (f.addressee_id = auth.uid() and f.requester_id = c.user_id))
              )
            )
          )
        );
$$;

revoke execute on function public.get_court_active_players() from public;
grant  execute on function public.get_court_active_players() to authenticated;
