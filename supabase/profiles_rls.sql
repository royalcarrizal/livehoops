-- LiveHoops RLS policies for the profiles table.
-- Run this manually in the Supabase SQL editor.
--
-- WHY
-- Without RLS, anyone on the internet (no login needed) can read every
-- profile row with the public API key — usernames, avatars, stats, and
-- notification preferences. These policies restrict reads to logged-in
-- users and writes to the row's owner.
--
-- Reads stay open to ALL authenticated users because the app needs other
-- people's profiles everywhere: feed post authors, search, DM threads,
-- friend lists. The Profile Visibility privacy setting is enforced at the
-- app layer on top of this.

alter table public.profiles enable row level security;

-- Any logged-in user can read profiles (needed for feed/search/DMs)
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

-- You can only create YOUR OWN profile row (happens once, at sign-up)
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

-- You can only update your own profile
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid());

-- No delete policy: account deletion goes through the delete_user() RPC,
-- which runs with elevated privileges and cleans up everything properly.
