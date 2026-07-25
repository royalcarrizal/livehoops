// src/lib/push.js
//
// Thin client-side wrapper for triggering a push notification to another user.
// It calls the send-push Supabase Edge Function, which looks up the
// recipient's registered devices and delivers the notification via Firebase.
//
// Design notes:
//   - Fire-and-forget: we never await this in a way that blocks the UI, and
//     it never throws. Sending a DM or friend request must succeed even if
//     the push fails (recipient has no devices, offline, Firebase hiccup…).
//   - The recipient only has device tokens if they granted notification
//     permission, so that permission is the primary on/off gate. Per-type
//     preferences (Friend Request Alerts, Court Goes Live) are stored on the
//     recipient's profile row (see supabase/notification_preferences.sql)
//     and checked via getProfileFlag before sending those specific pushes.

import { supabase } from './supabase';

// Name of the deployed Supabase Edge Function that sends the push.
// Deployed under its actual folder name, "send-push" (supabase/functions/send-push).
// It used to run under "smart-api" (Supabase's default name from an earlier
// deploy) — that function is now stale/unused now that this constant points
// at "send-push", which also persists a notifications row (see supabase/notifications.sql).
const PUSH_FUNCTION = 'send-push';

/**
 * Send a push notification to a user. Safe to call without awaiting.
 *
 * Returns a promise that always resolves (never rejects) to a normalized
 * `{ data, error }` shape, so callers that DO want the outcome (e.g. the
 * Settings "Send Test Notification" diagnostic) can `await` it without a
 * try/catch. `data` is the Edge Function's `{ sent, pruned, reason? }` payload;
 * `error` is set on network/function failure. Fire-and-forget callers can keep
 * ignoring the return entirely — the console.info swallow still happens here.
 *
 * @param {string} userId  — recipient's profile id
 * @param {string} title   — notification title (e.g. "Marcus sent you a message")
 * @param {string} [body]  — notification body (e.g. the message preview)
 * @param {object} [data]  — string→string map for deep-linking (e.g. { kind: 'dm' })
 * @returns {Promise<{ data: object|null, error: Error|null }>}
 */
export function sendPush(userId, title, body = '', data = {}) {
  if (!userId || !title) {
    return Promise.resolve({
      data: null,
      error: new Error('userId and title are required'),
    });
  }

  // Coerce data values to strings — FCM requires the data payload to be
  // entirely string→string.
  const stringData = {};
  for (const [k, v] of Object.entries(data)) stringData[k] = String(v);

  return supabase.functions
    .invoke(PUSH_FUNCTION, {
      body: { user_id: userId, title, body, data: stringData },
    })
    .then(({ data: result, error }) => {
      if (error) {
        console.info('[LiveHoops] Push not sent:', error.message ?? error);
      }
      return { data: result ?? null, error: error ?? null };
    })
    .catch((err) => {
      // Swallow — a failed push is never worth surfacing to the sender, but
      // still hand the outcome back to callers that asked for it.
      console.info('[LiveHoops] Push not sent:', err?.message ?? err);
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    });
}

// Truncate a message/preview so notifications stay short and readable.
export function preview(text, max = 120) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/**
 * Read a boolean preference column from another user's profile row, used to
 * gate notification types that have a Settings toggle (Friend Request
 * Alerts, Court Goes Live Alerts). Fails open to `fallback` on any error —
 * a missing/unreachable preference should never silently swallow a push the
 * user actually wants.
 *
 * @param {string} userId   — whose profile to check
 * @param {string} column   — e.g. 'notif_friend_requests'
 * @param {boolean} fallback — value to use if the row/column can't be read
 */
export async function getProfileFlag(userId, column, fallback = true) {
  if (!userId) return fallback;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(column)
      .eq('id', userId)
      .single();
    if (error || data == null || data[column] == null) return fallback;
    return data[column];
  } catch {
    return fallback;
  }
}
