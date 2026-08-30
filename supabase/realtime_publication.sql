-- LiveHoops: the Realtime publication membership the app depends on.
-- Run this manually in the Supabase SQL editor. Safe to re-run.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- Three features subscribe to Postgres changes:
--
--   notifications     → subscribeToNotifications (src/utils/notificationStore.js)
--                       keeps the bell panel in sync across devices
--   posts             → subscribeToNewPosts      (src/hooks/usePosts.js)
--                       drives the "↑ N new posts" pill on the Home feed
--   direct_messages   → subscribeToMessages      (src/hooks/useDirectMessages.js)
--                       bumps the unread badge and refreshes the DM inbox live
--
-- A table only emits those events if it is a member of the supabase_realtime
-- publication. notifications.sql adds `notifications`. Nothing in this
-- repository ever added the other two.
--
-- So one of two things is true, and the query below tells you which:
--
--   • they were added by hand in the Supabase dashboard — in which case they
--     work, but the app cannot be rebuilt from Git, which AGENTS.md forbids;
--   • they were never added — in which case those two subscriptions have been
--     silently dead the whole time. Nothing errors when this is the case. The
--     channel opens, subscribes successfully, and simply never fires.
--
-- Either way this file is the fix: it makes the membership explicit and
-- reproducible.
--
-- ── IS THIS A PRIVACY RISK? No ──────────────────────────────────────────────
-- Worth stating, because "broadcast every insert" sounds alarming. Realtime
-- applies each subscriber's RLS to postgres_changes events, and both tables
-- have RLS enabled — posts via posts_select_visible (privacy_enforcement.sql,
-- then block_users.sql) and direct_messages via dm_select_own (rls_policies.sql).
-- A user is only sent rows they could already have SELECTed. The client-side
-- id filters in both hooks are a convenience, not the boundary.


-- ── Check what is published today (run this first) ──────────────────────────
--
--     select tablename
--     from   pg_publication_tables
--     where  pubname = 'supabase_realtime' and schemaname = 'public'
--     order  by tablename;
--
-- Expect to see `notifications`. Whether `posts` and `direct_messages` appear
-- is the question this file exists to settle.


-- ── Add the two missing tables ──────────────────────────────────────────────
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a member, so
-- each is guarded — keeping this file re-runnable like every other file here.
--
-- In a transaction, like the other migrations here, so a failure on the second
-- table cannot leave the first half applied.

begin;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where  pubname = 'supabase_realtime'
      and  schemaname = 'public'
      and  tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where  pubname = 'supabase_realtime'
      and  schemaname = 'public'
      and  tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;

-- notifications is added by notifications.sql. Repeated here under the same
-- guard so this one file states the complete picture, and so re-running it
-- cannot fail if the files are applied in an unexpected order.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where  pubname = 'supabase_realtime'
      and  schemaname = 'public'
      and  tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

commit;


-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Only meaningful if `posts` and `direct_messages` were NOT published before —
-- if they already were, this file changed nothing and there is nothing to undo.
--
-- Removing them restores the previous state, in which the new-posts pill and
-- the live DM badge do not update without a refresh. Nothing breaks; two
-- features simply go quiet again.
--
-- Leave `notifications` alone — notifications.sql published it, and the bell
-- panel's cross-device sync depends on it.
--
-- begin;
-- alter publication supabase_realtime drop table public.posts;
-- alter publication supabase_realtime drop table public.direct_messages;
-- commit;


-- ── Verifying this after applying it ────────────────────────────────────────
--
-- a) Re-run the membership query above. Expect all three tables.
--
-- b) The two features this was supposed to be powering, with two accounts:
--
--    • Home feed — leave account A on the Home tab. From account B (a friend),
--      publish a post. Expect the "↑ 1 new post" pill to appear on A WITHOUT a
--      refresh. If it was never published before, this is a feature switching
--      on for the first time rather than a regression being fixed.
--
--    • DMs — leave account A on the Friends tab. Send A a message from B.
--      Expect the Messages tab's unread badge to increment on its own, and the
--      thread preview to update.
--
-- c) Confirm the RLS boundary still holds: from account A, subscribed to
--    direct_messages, have two OTHER accounts message each other. A must
--    receive nothing.
