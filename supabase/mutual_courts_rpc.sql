-- RPC: get_mutual_courts(p_other_user_id uuid)
--
-- Returns the courts that both the calling user and the target user have
-- checked into. Uses SECURITY DEFINER so it can read both users' checkins
-- internally without violating the checkins_select_own RLS policy, but
-- only exposes (court_id, court_name) — no personal checkin data.
--
-- Called from ProfileScreen visitor mode to show "Courts in common".

create or replace function public.get_mutual_courts(p_other_user_id uuid)
returns table(court_id uuid, court_name text)
language sql
security definer
set search_path = public
stable
as $$
  select  c.court_id,
          co.name as court_name
  from    checkins c
  join    courts   co on co.id = c.court_id
  where   c.user_id = auth.uid()
    and   c.court_id in (
            select court_id
            from   checkins
            where  user_id = p_other_user_id
          )
  group by c.court_id, co.name;
$$;

revoke execute on function public.get_mutual_courts(uuid) from public;
grant  execute on function public.get_mutual_courts(uuid) to authenticated;
