-- LiveHoops push notifications: device token registry.
-- Run this manually in the Supabase SQL editor.
--
-- Each row is one device/browser that agreed to receive push notifications,
-- identified by its FCM token (think of it as that device's phone number).
-- A user can have several rows (phone + laptop), and the send-push Edge
-- Function looks tokens up here to know where to deliver a notification.

create table if not exists public.fcm_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fast lookup of all of one user's devices (what the Edge Function does)
create index if not exists fcm_tokens_user_id_idx on public.fcm_tokens (user_id);

alter table public.fcm_tokens enable row level security;

-- Users manage only their own device tokens. Nobody can read anyone
-- else's tokens from the client — only the Edge Function (which uses the
-- service role key and bypasses RLS) reads tokens to send pushes.

drop policy if exists "fcm_tokens_select_own" on public.fcm_tokens;
create policy "fcm_tokens_select_own" on public.fcm_tokens
for select to authenticated using (user_id = auth.uid());

drop policy if exists "fcm_tokens_insert_own" on public.fcm_tokens;
create policy "fcm_tokens_insert_own" on public.fcm_tokens
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "fcm_tokens_update_own" on public.fcm_tokens;
create policy "fcm_tokens_update_own" on public.fcm_tokens
for update to authenticated using (user_id = auth.uid());

drop policy if exists "fcm_tokens_delete_own" on public.fcm_tokens;
create policy "fcm_tokens_delete_own" on public.fcm_tokens
for delete to authenticated using (user_id = auth.uid());
