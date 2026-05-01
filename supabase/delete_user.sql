-- LiveHoops delete_user() RPC.
-- Run this manually in the Supabase SQL editor.
--
-- Called by SettingsSheet when the user confirms account deletion.
-- Deletes all of the user's data across every table in the correct order
-- (dependents first, then the profile, then the auth record).

create or replace function public.delete_user()
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

  -- ── 1. Likes ────────────────────────────────────────────────────────────
  -- Remove likes the user placed on other posts
  delete from public.post_likes where user_id = v_uid;
  -- Remove likes other users placed on the user's posts
  delete from public.post_likes
    where post_id in (select id from public.posts where user_id = v_uid);

  -- ── 2. Comments ─────────────────────────────────────────────────────────
  -- Remove comments the user wrote on other posts
  delete from public.comments where user_id = v_uid;
  -- Remove comments others wrote on the user's posts
  delete from public.comments
    where post_id in (select id from public.posts where user_id = v_uid);

  -- ── 3. Court reviews ────────────────────────────────────────────────────
  delete from public.court_reviews where user_id = v_uid;

  -- ── 4. Check-ins ────────────────────────────────────────────────────────
  -- Decrement player_count for any court the user is currently checked into
  update public.courts
    set player_count = greatest(coalesce(player_count, 0) - 1, 0)
    where id in (
      select court_id from public.checkins
      where user_id = v_uid and is_active = true
    );
  delete from public.checkins where user_id = v_uid;

  -- ── 5. Direct messages ──────────────────────────────────────────────────
  delete from public.direct_messages
    where sender_id = v_uid or recipient_id = v_uid;

  -- ── 6. Friendships ──────────────────────────────────────────────────────
  delete from public.friendships
    where requester_id = v_uid or addressee_id = v_uid;

  -- ── 7. Reposts of the user's posts (other users' repost rows) ───────────
  delete from public.posts
    where repost_of_post_id in (select id from public.posts where user_id = v_uid);

  -- ── 8. The user's own posts ──────────────────────────────────────────────
  delete from public.posts where user_id = v_uid;

  -- ── 9. Profile ──────────────────────────────────────────────────────────
  delete from public.profiles where id = v_uid;

  -- ── 10. Auth user (security definer lets us reach auth schema) ──────────
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_user() from public;
grant execute on function public.delete_user() to authenticated;
