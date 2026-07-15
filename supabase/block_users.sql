-- LiveHoops: block users.
-- Run this manually in the Supabase SQL editor. Safe to re-run.
--
-- WHAT THIS ADDS
-- A user can block another user. Blocking is bidirectional in effect: once
-- either side has blocked the other, they stop seeing each other's posts and
-- comments, can't DM each other, and can't send/receive a friend request.
-- Blocking also ends any existing friendship — a clean break, not a half-block.
--
-- This wires into visibility/messaging rules already added in
-- privacy_enforcement.sql (can_view_posts_of, is_accepted_friend, and the
-- friends-only dm_insert_own policy), so run that file first if you haven't.

-- ── 1. Table ─────────────────────────────────────────────────────────────────
-- Shape mirrors court_favorites.sql: a simple owner-scoped junction table.

create table if not exists public.blocked_users (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

create index if not exists blocked_users_blocked_id_idx
  on public.blocked_users(blocked_id);

alter table public.blocked_users enable row level security;

drop policy if exists "blocked_users_select_own" on public.blocked_users;
create policy "blocked_users_select_own"
  on public.blocked_users for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists "blocked_users_insert_own" on public.blocked_users;
create policy "blocked_users_insert_own"
  on public.blocked_users for insert
  to authenticated
  with check (blocker_id = auth.uid());

-- Unblocking is a plain delete under this policy — no RPC needed, mirrors
-- how court_favorites toggles work client-side.
drop policy if exists "blocked_users_delete_own" on public.blocked_users;
create policy "blocked_users_delete_own"
  on public.blocked_users for delete
  to authenticated
  using (blocker_id = auth.uid());

-- ── 2. is_blocked helper ─────────────────────────────────────────────────────
-- Bidirectional: true if EITHER side has blocked the other. Every enforcement
-- point below calls this once, the same way privacy_enforcement.sql's
-- is_accepted_friend is reused across policies.

create or replace function public.is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from blocked_users
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

revoke execute on function public.is_blocked(uuid, uuid) from public;
grant  execute on function public.is_blocked(uuid, uuid) to authenticated;

-- ── 3. Hide a blocked user's posts (and yours from them) ────────────────────
-- Redefines can_view_posts_of from privacy_enforcement.sql, adding the block
-- check on top of the existing public/friends visibility rules. Every query
-- that already goes through posts_select_visible picks this up automatically.

create or replace function public.can_view_posts_of(p_author uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    p_author = auth.uid()  -- you can always see your own posts
    or (
      not public.is_blocked(auth.uid(), p_author)
      and (
        exists (
          select 1 from profiles p
          where  p.id = p_author
            and  p.profile_visibility = 'public'
        )
        or exists (
          select 1
          from   friendships f
          where  f.status = 'accepted'
            and ((f.requester_id = auth.uid() and f.addressee_id = p_author)
              or (f.addressee_id = auth.uid() and f.requester_id = p_author))
        )
      )
    );
$$;

revoke execute on function public.can_view_posts_of(uuid) from public;
grant  execute on function public.can_view_posts_of(uuid) to authenticated;

-- ── 4. Comments: gate by the parent post's visibility ────────────────────────
-- comments_select_all (rls_policies.sql) is `using (true)` — comments have
-- always ignored post visibility entirely, blocked or not. This closes that
-- gap as part of making a block actually hide someone.

drop policy if exists "comments_select_all" on public.comments;
drop policy if exists "comments_select_visible" on public.comments;
create policy "comments_select_visible"
on public.comments for select
to authenticated
using (
  exists (
    select 1 from posts po
    where po.id = comments.post_id
      and public.can_view_posts_of(po.user_id)
  )
);

-- ── 5. DMs: a block stops new messages immediately, both directions ─────────
-- Redefines dm_insert_own from privacy_enforcement.sql, ANDing in the block
-- check alongside the existing friends-only requirement.

drop policy if exists "dm_insert_own" on public.direct_messages;
create policy "dm_insert_own"
on public.direct_messages for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.is_accepted_friend(recipient_id)
  and not public.is_blocked(auth.uid(), recipient_id)
);

-- ── 6. Friend requests: a blocked pair can't re-friend each other ───────────

drop policy if exists "friendships_insert_own" on public.friendships;
create policy "friendships_insert_own"
on public.friendships for insert
to authenticated
with check (
  requester_id = auth.uid()
  and not public.is_blocked(auth.uid(), addressee_id)
);

-- ── 7. Block a user (RPC — handles the "clean break" side effects) ──────────
-- Inserting into blocked_users is enough for the RLS above to take effect
-- immediately, but a block should also end any existing friendship and clear
-- any pending request between the two — otherwise you'd have a blocked
-- "friend" still counted in mutual-friends lists.

create or replace function public.livehoops_block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_target = v_uid then
    raise exception 'You cannot block yourself';
  end if;

  insert into public.blocked_users (blocker_id, blocked_id)
  values (v_uid, p_target)
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.friendships
  where (requester_id = v_uid and addressee_id = p_target)
     or (requester_id = p_target and addressee_id = v_uid);
end;
$$;

revoke execute on function public.livehoops_block_user(uuid) from public;
grant  execute on function public.livehoops_block_user(uuid) to authenticated;
