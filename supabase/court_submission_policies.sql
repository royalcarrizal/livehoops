-- LiveHoops court submission RLS policies.
-- Run this manually in Supabase if court submissions fail with a row-level security error.

alter table public.courts enable row level security;

drop policy if exists "courts_select_verified" on public.courts;
create policy "courts_select_verified"
on public.courts
for select
to authenticated
using (verified is true);

drop policy if exists "courts_insert_own_pending" on public.courts;
create policy "courts_insert_own_pending"
on public.courts
for insert
to authenticated
with check (
  submitted_by = auth.uid()
  and verified is false
);
