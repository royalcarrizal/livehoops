-- LiveHoops in-app notifications: durable, server-synced notification log.
-- Run this manually in the Supabase SQL editor.
--
-- Each row is one notification event for one user (friend request, DM,
-- comment, like, meetup, check-in…). This is the source of truth for the
-- bell panel — it's what makes a push delivered while the app was closed
-- still show up later, and what makes the panel the same on every device.
--
-- Writes come from two places:
--   1. The send-push Edge Function (supabase/functions/send-push), using the
--      service-role key, inserts a row for the recipient right alongside
--      sending the actual FCM push. This covers every cross-user event.
--   2. The client, for the one purely-local "you liked a post" self-notice
--      (see src/components/FeedPost.jsx) — gated by the self-insert policy
--      below so a user can only ever insert notifications for themselves.

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text default '',
  icon       text default '🏀',
  data       jsonb default '{}',
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- Fast lookup of one user's notifications, newest first (what the panel does)
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Users read/update/delete only their own rows (mirrors fcm_tokens policies)

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
for select to authenticated using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
for update to authenticated using (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
for delete to authenticated using (user_id = auth.uid());

-- Self-insert only. Cross-user notifications (friend request, DM, comment...)
-- are written by the send-push Edge Function using the service-role key,
-- which bypasses RLS entirely — so this policy only ever needs to allow a
-- user to write a notification addressed to themselves.
drop policy if exists "notifications_insert_own" on public.notifications;
create policy "notifications_insert_own" on public.notifications
for insert to authenticated with check (user_id = auth.uid());

-- Enable Realtime so the bell panel can subscribe to new rows live, the same
-- way usePosts.js / useDirectMessages.js already subscribe to posts /
-- direct_messages.
alter publication supabase_realtime add table public.notifications;
