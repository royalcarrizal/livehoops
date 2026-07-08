-- RLS policies for the checkins table
-- Ensures users can only read/write their own check-in rows.
-- Without these, any authenticated user could query any other
-- user's full location history (courts visited + timestamps).
--
-- Safe to re-run: each policy is dropped before being recreated.

alter table public.checkins enable row level security;

drop policy if exists "checkins_select_own" on public.checkins;
create policy "checkins_select_own"
  on public.checkins for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "checkins_insert_own" on public.checkins;
create policy "checkins_insert_own"
  on public.checkins for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "checkins_update_own" on public.checkins;
create policy "checkins_update_own"
  on public.checkins for update
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "checkins_delete_own" on public.checkins;
create policy "checkins_delete_own"
  on public.checkins for delete
  to authenticated
  using (user_id = auth.uid());
