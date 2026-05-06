-- supabase/friends_active_checkins_rpc.sql
--
-- Returns the active check-in for each of a given set of friend user IDs.
-- Used by the useFriends hook so it can show the "Friends playing now" row
-- and the "On the court" status in crew chips.
--
-- Why an RPC? The checkins_select_own RLS policy restricts direct queries to
-- only rows where user_id = auth.uid(), which means we can't read a friend's
-- active check-in from the client. This SECURITY DEFINER function runs with
-- elevated privileges server-side, reads only the columns needed, and returns
-- a safe result set (no timestamps or personal data beyond court name).
--
-- Run once in the Supabase SQL editor or via migrations before deploying.

create or replace function public.get_friends_active_checkins(p_friend_ids uuid[])
returns table(user_id uuid, court_id uuid, court_name text)
language sql
security definer
set search_path = public
stable
as $$
  select  c.user_id,
          c.court_id,
          co.name as court_name
  from    checkins c
  join    courts   co on co.id = c.court_id
  where   c.user_id = any(p_friend_ids)
    and   c.is_active = true;
$$;

revoke execute on function public.get_friends_active_checkins(uuid[]) from public;
grant  execute on function public.get_friends_active_checkins(uuid[]) to authenticated;
