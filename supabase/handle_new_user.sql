-- LiveHoops: create profile rows server-side when a user signs up.
-- Run this manually in the Supabase SQL editor.
--
-- WHY
-- The app used to insert the profiles row from the client right after
-- supabase.auth.signUp(). That only works while email confirmation is OFF:
-- with confirmation ON, signUp returns a user but NO session, so the
-- insert runs unauthenticated and the profiles_insert_own RLS policy
-- (id = auth.uid(), where auth.uid() is null) rejects it — the account
-- exists but has no profile.
--
-- This trigger creates the profile inside the same transaction that
-- creates the auth user, so it works in both modes and can never race.
-- The app passes the chosen username in the signUp metadata
-- (options.data.username) and it arrives here as raw_user_meta_data.

-- ── 1. Trigger function ─────────────────────────────────────────────────────
-- SECURITY DEFINER because the trigger fires as the auth admin role, and
-- because no user session exists yet when confirmation is enabled.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  -- Username chosen on the sign-up form, passed via signUp metadata.
  -- Fall back to the email prefix so a profile always gets created even
  -- if a future signup path forgets to send the metadata.
  v_username := nullif(trim(new.raw_user_meta_data->>'username'), '');
  if v_username is null then
    v_username := split_part(coalesce(new.email, 'player'), '@', 1);
  end if;

  begin
    insert into public.profiles (id, username)
    values (new.id, v_username)
    -- The app also upserts the profile client-side as a transition
    -- backstop — if that somehow ran first, this must not error.
    on conflict (id) do nothing;
  exception when unique_violation then
    -- A unique index on username exists and the name is taken. The auth
    -- row is already created at this point, so failing here would abort
    -- the whole signup with an opaque "Database error saving new user".
    -- Instead, de-dupe with a short suffix from the user's id — they can
    -- rename in Edit Profile. (The app checks availability before calling
    -- signUp, so this is a rarely-hit backstop, not the main path.)
    insert into public.profiles (id, username)
    values (new.id, v_username || '_' || left(replace(new.id::text, '-', ''), 4))
    on conflict (id) do nothing;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ── 2. Username availability check ──────────────────────────────────────────
-- Called from the sign-up form BEFORE creating the account, so a taken
-- username is caught while it's still easy to pick another (once the auth
-- user exists, there's no clean way to undo it client-side).
--
-- SECURITY DEFINER + grant to anon because the person signing up is not
-- logged in yet, and the profiles select policy only covers authenticated
-- users. Only a boolean leaves this function — no profile data.

create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select not exists (
    select 1
    from   profiles
    where  lower(username) = lower(trim(p_username))
  );
$$;

revoke execute on function public.username_available(text) from public;
grant  execute on function public.username_available(text) to anon, authenticated;
