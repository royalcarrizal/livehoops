-- LiveHoops: rate limit posts and direct messages.
-- Run this manually in the Supabase SQL editor, AFTER block_users.sql (this
-- file redefines dm_insert_own again, on top of the block check it added).
-- Safe to re-run.
--
-- WHY
-- Neither posts nor direct_messages had any limit on how fast a single user
-- could insert rows. That's an open door for a spam bot to flood the public
-- Nearby feed, or blast DMs at a lot of strangers in a burst. This adds a
-- simple count-based throttle directly to each table's insert policy — no new
-- table, no new RPC, no change needed to createPost/sendMessage on the client.
--
-- THRESHOLDS (tune here, nowhere else)
--   Posts:            10 per rolling 10 minutes
--   Direct messages:  30 per rolling 1 minute
-- Both are generous enough that no real person composing posts or chatting
-- should ever hit them, but tight enough to stop an automated flood.

-- ── Posts ────────────────────────────────────────────────────────────────────

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
on public.posts
for insert
to authenticated
with check (
  user_id = auth.uid()
  and (
    select count(*) from public.posts
    where user_id = auth.uid()
      and created_at > now() - interval '10 minutes'
  ) < 10
);

-- ── Direct messages ──────────────────────────────────────────────────────────
-- Keeps the friends-only + not-blocked checks block_users.sql added, and ANDs
-- in the throttle.

drop policy if exists "dm_insert_own" on public.direct_messages;
create policy "dm_insert_own"
on public.direct_messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.is_accepted_friend(recipient_id)
  and not public.is_blocked(auth.uid(), recipient_id)
  and (
    select count(*) from public.direct_messages
    where sender_id = auth.uid()
      and created_at > now() - interval '1 minute'
  ) < 30
);
