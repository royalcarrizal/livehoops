-- LiveHoops: decide server-side whether one user may notify another.
-- Run this manually in the Supabase SQL editor, AFTER privacy_enforcement.sql
-- and block_users.sql (it uses is_accepted_friend and is_blocked from those).
-- Safe to re-run.
--
-- ⚠️  ORDER MATTERS. Apply this file BEFORE deploying the updated send-push
--     Edge Function. The function calls can_notify() on every push; if it is
--     deployed first, the function does not exist yet, every call is denied,
--     and all push notifications stop until this runs.
--
-- ── SECURITY FIX: send-push would notify anyone, from anyone, with anything ─
--
-- supabase/functions/send-push read user_id, title and body straight out of
-- the request body and never asked who was calling. It then wrote a
-- notifications row with the SERVICE ROLE key and pushed to every device that
-- user owns. Three consequences, all reachable with nothing but a login:
--
--   1. Any user could push arbitrary text to any other user. User ids are not
--      secret inside the app — search returns them, posts carry them — so this
--      was a working impersonation channel, not a theoretical one.
--   2. It bypassed the self-insert-only policy notifications.sql defines. That
--      policy is careful and correct; the Edge Function simply went around it.
--   3. Every notification preference was skipped. notif_friend_requests,
--      notif_court_checkins and notif_meetups were only ever checked in the
--      CLIENT, by getProfileFlag (src/lib/push.js) and the .eq() filters in
--      useCheckIn / useMeetups. A direct API call ignored all of them.
--
-- ── What this function does ─────────────────────────────────────────────────
--
-- It answers one question — "may this caller send this recipient this kind of
-- notification, and does the recipient want it?" — and the Edge Function
-- refuses the push when the answer is no.
--
-- Called with the CALLER'S JWT, not the service role, so auth.uid() inside is
-- the person trying to send. That is the whole design: the sender is taken from
-- the token rather than from a field they control.
--
-- The four guards sit at the top, before the per-kind logic, for the reason
-- friend_activity_rpc.sql sets out about its own two guards: a `kind` added
-- below in six months cannot quietly skip a check it never knew about.
--
-- Preferences move here from the client. The client checks stay (they save a
-- pointless round trip) but they are no longer what enforces anything.
--
-- ── What this does NOT fix ──────────────────────────────────────────────────
-- Stated plainly so nobody reads more into it than is there: title and body are
-- still supplied by the caller. Someone you are genuinely friends with can
-- therefore still send you a push whose text you would not expect. Closing that
-- means composing every notification's wording in the database, which is a
-- larger change to ~10 call sites and is deliberately not in this branch. What
-- this file removes is the ability of a STRANGER to notify you at all.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- The rollback for this half is NOT "drop the function" — do that while the new
-- Edge Function is still deployed and every push in the app starts failing,
-- because it calls can_notify() and fails closed when the call errors.
--
-- To undo: REDEPLOY THE PREVIOUS send-push, and leave this function alone. It
-- is inert unless something calls it, so an unused can_notify costs nothing and
-- keeps the option of re-deploying forward without re-running any SQL. There is
-- a `drop function` line at the bottom of this file for eventual cleanup, with
-- the same ordering warning attached.


-- ── can_notify ──────────────────────────────────────────────────────────────
-- p_post_id / p_comment_id carry the context the like- and comment-shaped
-- kinds need to prove entitlement. The client already sends both in the push
-- payload (see the sendPush calls in usePosts.js and useComments.js), so no
-- client change is required — and they are verified rather than trusted, since
-- an id alone proves nothing until it is joined back to the caller's own row.

begin;

create or replace function public.can_notify(
  p_recipient  uuid,
  p_kind       text,
  p_post_id    uuid default null,
  p_comment_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid   uuid := auth.uid();
  v_wants boolean;
begin
  -- Guard 1 — there has to be a caller. A null auth.uid() means the function
  -- was reached without a user token; nothing is authorised in that state.
  if v_uid is null or p_recipient is null or p_kind is null then
    return false;
  end if;

  -- The one kind addressed to yourself: Settings → Send Test Notification.
  -- Handled before the "not yourself" guard below, because it is the sole
  -- legitimate self-notification in the app.
  if p_kind = 'test' then
    return p_recipient = v_uid;
  end if;

  -- Guard 2 — every other kind describes something you did to someone ELSE.
  if p_recipient = v_uid then
    return false;
  end if;

  -- Guard 3 — a block silences everything, in both directions. is_blocked is
  -- already bidirectional (block_users.sql), so this covers "they blocked me"
  -- as well as "I blocked them".
  if public.is_blocked(v_uid, p_recipient) then
    return false;
  end if;

  -- Guard 4 — does the recipient want this kind of notification? The column
  -- defaults mirror the ones in notification_preferences.sql and what Settings
  -- displays: court check-ins default OFF, the other two default ON.
  --
  -- A missing profile row leaves v_wants null and denies. That is deliberate:
  -- server-side, "I could not find out" must not mean "send it anyway". The
  -- client's getProfileFlag fails the other way, which is fine for saving a
  -- round trip and wrong as an enforcement point.
  select
    case p_kind
      when 'friend_request'   then p.notif_friend_requests
      when 'friend_accept'    then p.notif_friend_requests
      when 'friend_checkin'   then p.notif_court_checkins
      when 'meetup_scheduled' then p.notif_meetups
      else true
    end
  into v_wants
  from public.profiles p
  where p.id = p_recipient;

  if not coalesce(v_wants, false) then
    return false;
  end if;

  -- ── Entitlement: what did the caller actually DO to earn this? ────────────
  -- Anything not listed is denied. Deny-by-default is the point of the final
  -- `else`: a typo'd or invented kind sends nothing.
  return coalesce(
    case p_kind

      -- You messaged them. Mirrors dm_insert_own's friends-only rule, so a
      -- push can never reach someone a DM could not.
      when 'dm' then
        public.is_accepted_friend(p_recipient)

      -- You sent them a request, and it is still outstanding.
      when 'friend_request' then
        exists (
          select 1 from public.friendships f
          where  f.requester_id = v_uid
            and  f.addressee_id = p_recipient
            and  f.status = 'pending'
        )

      -- You accepted theirs, so the friendship now exists.
      when 'friend_accept' then
        public.is_accepted_friend(p_recipient)

      -- You checked in somewhere. The show_location clause moves the privacy
      -- boundary notifyFriendsOfCheckIn (useCheckIn.js) applies in JavaScript
      -- into the database: if you have hidden your location, your friends
      -- cannot see which court you are on, so they are not told about it
      -- either. Same boundary, both places — but only one of them is now
      -- possible to skip.
      when 'friend_checkin' then
        public.is_accepted_friend(p_recipient)
        and exists (
          select 1 from public.profiles me
          where  me.id = v_uid and me.show_location = true
        )

      -- You scheduled a run.
      when 'meetup_scheduled' then
        public.is_accepted_friend(p_recipient)

      -- You liked a post they wrote. The like row is the proof.
      when 'post_like' then
        exists (
          select 1
          from   public.post_likes pl
          join   public.posts po on po.id = pl.post_id
          where  pl.post_id = p_post_id
            and  pl.user_id = v_uid
            and  po.user_id = p_recipient
        )

      -- You commented on a post they wrote.
      when 'post_comment' then
        exists (
          select 1
          from   public.comments c
          join   public.posts po on po.id = c.post_id
          where  c.post_id = p_post_id
            and  c.user_id = v_uid
            and  po.user_id = p_recipient
        )

      -- You replied to a comment they wrote. The payload carries the post id
      -- rather than the parent comment id, so the join walks child → parent.
      when 'comment_reply' then
        exists (
          select 1
          from   public.comments child
          join   public.comments parent on parent.id = child.parent_comment_id
          where  child.post_id = p_post_id
            and  child.user_id = v_uid
            and  parent.user_id = p_recipient
        )

      -- You liked a comment they wrote.
      when 'comment_like' then
        exists (
          select 1
          from   public.comment_likes cl
          join   public.comments c on c.id = cl.comment_id
          where  cl.comment_id = p_comment_id
            and  cl.user_id = v_uid
            and  c.user_id = p_recipient
        )

      else false
    end,
    false
  );
end;
$$;

revoke execute on function public.can_notify(uuid, text, uuid, uuid) from public;
grant  execute on function public.can_notify(uuid, text, uuid, uuid) to authenticated;

commit;


-- ── Verifying this after applying it ────────────────────────────────────────
--
-- The denied cases are why this exists; the ALLOWED cases are what stops the
-- cure being worse than the disease. A matrix that is one clause too tight
-- silently stops real notifications, and nothing anywhere will tell you — the
-- push simply never arrives. Run both halves.
--
-- NOTE: auth.uid() is NULL in the SQL editor's default context, which makes
-- every call below return false for the wrong reason. Run these signed in as a
-- real user, or with an impersonated role.
--
-- a) DENIED — a stranger cannot notify you at all. As user A, with user B
--    someone you are NOT friends with:
--
--      select public.can_notify('<B-uuid>', 'dm');
--
--    Expect: false. Before this migration, send-push would have delivered it.
--
-- b) ALLOWED — a real friend can:
--
--      select public.can_notify('<friend-uuid>', 'dm');
--
--    Expect: true.
--
-- c) DENIED — preferences are now enforced. Set a friend's notif_meetups to
--    false, then:
--
--      select public.can_notify('<friend-uuid>', 'meetup_scheduled');
--
--    Expect: false. Set it back to true and expect true.
--
-- d) DENIED — an unknown kind sends nothing:
--
--      select public.can_notify('<friend-uuid>', 'account_suspended');
--
--    Expect: false.
--
-- e) ALLOWED — the self-test Settings offers:
--
--      select public.can_notify(auth.uid(), 'test');
--
--    Expect: true.
--
-- f) DENIED — a like you never made:
--
--      select public.can_notify('<author-uuid>', 'post_like', '<a-post-you-have-not-liked>');
--
--    Expect: false. Then like it in the app and re-run: true.
--
-- g) ALLOWED, end to end, and the one that catches an over-tight matrix —
--    between two real accounts, perform each of these and confirm the push
--    ACTUALLY ARRIVES on the other device:
--
--      • send a DM
--      • send a friend request, then accept it
--      • comment on their post, and reply to a comment of theirs
--      • like their post, and like their comment
--      • check in at a court (with Show My Location on, and the friend's
--        Court Goes Live Alerts on)
--      • schedule a run
--      • Settings → Send Test Notification
--
--    Do not skip (g). Every case in it passed before this change, and a fix
--    that breaks one of them is a regression the denied cases cannot detect.


-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
-- Read the ordering note before running anything here.
--
-- STEP 1, and usually the only step you need: redeploy the PREVIOUS version of
-- supabase/functions/send-push. That restores the old behaviour immediately —
-- including, to be clear about it, the hole this file closed. can_notify() then
-- sits unused and harms nothing.
--
--     git checkout <commit-before-this-branch> -- supabase/functions/send-push
--     npx supabase functions deploy send-push
--
-- STEP 2, optional cleanup, and ONLY after step 1 has been confirmed live.
-- Dropping this function while the new Edge Function is still deployed makes
-- every can_notify() call error, and the function fails closed — so all push
-- notifications stop. That is the same hazard as applying these in the wrong
-- order, in reverse.
--
-- drop function if exists public.can_notify(uuid, text, uuid, uuid);
--
-- Nothing else needs undoing. This file adds one function and grants execute on
-- it; it alters no table, no policy and no data.
