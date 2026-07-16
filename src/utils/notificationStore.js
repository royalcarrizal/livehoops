// src/utils/notificationStore.js
//
// Supabase-backed notification store. The `notifications` table (see
// supabase/notifications.sql) is the source of truth for the bell panel —
// this file wraps the reads/writes so useNotifications.js and FeedPost.jsx
// don't talk to Supabase directly.
//
// Row shape (see supabase/notifications.sql):
//   { id, user_id, title, body, icon, data, read, created_at }

import { supabase } from '../lib/supabase';

const MAX_FETCHED = 50; // cap the list so the panel doesn't grow forever

// ─── Read ────────────────────────────────────────────────────────────────────

/** Fetches the most recent notifications for a user, newest first. */
export async function fetchNotifications(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_FETCHED);

  if (error) {
    console.error('[LiveHoops] Failed to fetch notifications:', error.message);
    return [];
  }
  return data ?? [];
}

// ─── Live updates ────────────────────────────────────────────────────────────

/**
 * Subscribes to new notifications for a user via Supabase Realtime. Fires
 * onInsert(row) for every INSERT — whether it came from the send-push Edge
 * Function (friend request, DM, comment…) or a client self-insert (liking a
 * post, see insertSelfNotification below). This is what keeps the panel in
 * sync across tabs/devices without a page reload, and is what lets a push
 * that arrived while the app was closed show up once it's reopened.
 *
 * Mirrors the subscribeToMessages pattern in useDirectMessages.js: listen to
 * all INSERTs on the table and filter to this user client-side.
 *
 * Returns a cleanup function to close the channel on unmount.
 */
export function subscribeToNotifications(userId, onInsert) {
  if (!userId) return () => {};

  const channel = supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => {
        if (payload.new.user_id === userId) onInsert(payload.new);
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// ─── Write ───────────────────────────────────────────────────────────────────

/** Marks every unread notification as read for a user. */
export async function markAllRead(userId) {
  if (!userId) return;
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    console.error('[LiveHoops] Failed to mark notifications read:', error.message);
  }
}

/** Deletes all notifications for a user (the panel's "Clear all"). */
export async function clearNotifications(userId) {
  if (!userId) return;
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('[LiveHoops] Failed to clear notifications:', error.message);
  }
}

/**
 * Inserts a notification a user sends to themselves — currently only used
 * for "You liked X's post" (see FeedPost.jsx). Cross-user notifications
 * (friend request, DM, comment…) are written server-side by the send-push
 * Edge Function instead; this only works because of the notifications
 * table's self-insert RLS policy (user_id must equal auth.uid()).
 */
export async function insertSelfNotification(userId, { title, body = '', icon = '🏀', data = {} }) {
  if (!userId || !title) return;
  const { error } = await supabase
    .from('notifications')
    .insert({ user_id: userId, title, body, icon, data });

  if (error) {
    console.error('[LiveHoops] Failed to insert notification:', error.message);
  }
}

// ─── Native browser popup ────────────────────────────────────────────────────

/**
 * Shows a native OS-style notification popup, if the user has granted
 * permission. Used for immediate feedback while the app is foregrounded —
 * the panel/badge itself updates via the Realtime subscription above, not
 * through this function, so this is popup-only with no storage side effect.
 */
export function showNativePopup(title, body = '') {
  // 'Notification' might not exist in very old browsers — the typeof
  // check prevents a crash in those environments.
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  try {
    new Notification(title, {
      body,
      icon: '/favicon.svg', // browser requires a URL, not an emoji
    });
  } catch (err) {
    // Safari on iOS requires a user gesture before showing notifications —
    // if that requirement isn't met, new Notification() throws.
    console.info('[LiveHoops] Native notification could not be shown:', err.message);
  }
}
