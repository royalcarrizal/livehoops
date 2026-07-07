-- LiveHoops: link posts to profiles with a real foreign key.
-- Run this manually in the Supabase SQL editor.
--
-- WHY
-- The posts table was created without a foreign key to profiles, so
-- PostgREST refused every `profiles(*)` join with "Could not find a
-- relationship between 'posts' and 'profiles'" — which made ALL feed and
-- profile queries fail silently (posts looked like they disappeared).
--
-- The app code no longer relies on the join (usePosts.js now fetches
-- profiles separately), so this is not required for the app to work —
-- but the FK is still worth having for data integrity: it guarantees
-- every post always belongs to a real profile, and cleans up a user's
-- posts automatically if their profile is ever deleted.

-- Remove any orphan posts whose author profile no longer exists.
-- (Without this, adding the constraint fails if orphans exist. Normally
-- there are none — delete_user() removes a user's posts already.)
delete from public.posts
where user_id not in (select id from public.profiles);

alter table public.posts
  drop constraint if exists posts_user_id_profiles_fkey;

alter table public.posts
  add constraint posts_user_id_profiles_fkey
  foreign key (user_id) references public.profiles(id)
  on delete cascade;

-- Tell PostgREST to refresh its schema cache so it sees the new FK
notify pgrst, 'reload schema';
