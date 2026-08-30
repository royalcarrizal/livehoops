-- LiveHoops: the friendships table.
-- Run this manually in the Supabase SQL editor. Safe to re-run (create table
-- if not exists is a no-op against the live database, which already has it).
--
-- ⚠️  THIS DEFINITION IS RECONSTRUCTED, NOT DUMPED. Read the next section
--     before trusting it.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- friendships is one of the most security-relevant tables in the app —
-- is_accepted_friend() reads it, and DM permission, post visibility and live
-- location all hang off that one function. Its RLS policies are in
-- rls_policies.sql, block_users.sql and friendship_integrity.sql.
--
-- The table itself was never in Git. It was created in the Supabase dashboard,
-- which AGENTS.md forbids ("Do not make dashboard-only schema or policy changes
-- that are absent from Git") for exactly the reason it caused trouble here:
-- when reviewing the insert policy, there was no way to tell from the
-- repository whether a CHECK constraint on `status` already existed. The answer
-- mattered — it was the difference between a serious hole and a non-issue — and
-- it could only be found by querying production.
--
-- ── HOW TO REPLACE THIS WITH THE REAL THING ─────────────────────────────────
-- The columns below are inferred from how the application uses the table
-- (src/hooks/useFriends.js) and from the columns every policy and RPC in
-- supabase/ references. Types, defaults and indexes are the conventional ones
-- used by the other tables in this directory — they are a best reconstruction,
-- not a record of what is actually deployed.
--
-- To make this file authoritative, dump the live definition and paste it over
-- the block below:
--
--     select column_name, data_type, is_nullable, column_default
--     from   information_schema.columns
--     where  table_schema = 'public' and table_name = 'friendships'
--     order  by ordinal_position;
--
--     select conname, pg_get_constraintdef(oid)
--     from   pg_constraint
--     where  conrelid = 'public.friendships'::regclass;
--
--     select indexname, indexdef
--     from   pg_indexes
--     where  schemaname = 'public' and tablename = 'friendships';
--
-- Until that is done, treat this as documentation with a known gap rather than
-- as a definition you could rebuild the database from.


-- ── Table ───────────────────────────────────────────────────────────────────
-- Column usage, all verifiable in the client:
--   id            — fetchFriends / fetchPendingRequests select it as friendshipId,
--                   and accept / decline / removeFriend address rows by it
--   requester_id  — sendFriendRequest sets it to the caller
--   addressee_id  — the person being asked
--   status        — 'pending' | 'accepted' | 'declined'; the check constraint
--                   enforcing that set lives in friendship_integrity.sql, which
--                   is also where it is explained

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending',
  created_at   timestamptz not null default now()
);

-- Both directions are queried constantly: fetchFriends ORs across the two
-- columns, fetchPendingRequests filters on addressee_id, fetchSentRequests on
-- requester_id, and is_accepted_friend() checks both orderings on every post
-- read.
create index if not exists friendships_requester_idx on public.friendships(requester_id);
create index if not exists friendships_addressee_idx on public.friendships(addressee_id);


-- ── A gap worth knowing about, deliberately NOT changed here ────────────────
-- There is no unique constraint on the (requester_id, addressee_id) pair, in
-- either direction. sendFriendRequest (src/hooks/useFriends.js) compensates by
-- SELECTing for an existing row before inserting — a check-then-act that two
-- taps in quick succession can race past, leaving duplicate rows.
--
-- Adding the constraint is the real fix, but it is a behaviour change beyond
-- this branch's scope: it needs a de-duplication pass over existing rows first,
-- and the client needs to handle 23505 the way createRepost already does. Noted
-- here so it is recorded rather than rediscovered.
