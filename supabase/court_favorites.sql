-- supabase/court_favorites.sql
-- Run this manually in the Supabase SQL editor.
--
-- Creates the court_favorites junction table so users can bookmark courts.
-- Favorited courts are surfaced first in the Map tab's chip list.

-- ── Table ─────────────────────────────────────────────────────────────────────
create table if not exists public.court_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  court_id   uuid not null references public.courts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, court_id)
);

-- Index on court_id for admin queries (e.g. "how many users favorited this court")
create index if not exists court_favorites_court_id_idx
  on public.court_favorites(court_id);

-- ── Row Level Security ─────────────────────────────────────────────────────────
alter table public.court_favorites enable row level security;

-- Users can read only their own favorites
create policy "court_favorites_select_own"
  on public.court_favorites for select
  to authenticated
  using (user_id = auth.uid());

-- Users can insert only rows they own
create policy "court_favorites_insert_own"
  on public.court_favorites for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can delete only their own favorites
create policy "court_favorites_delete_own"
  on public.court_favorites for delete
  to authenticated
  using (user_id = auth.uid());
