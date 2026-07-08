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
//     preferences (Friend Request Alerts, etc.) will be enforced here once
//     those settings move from localStorage into the database.

import { supabase } from './supabase';

/**
 * Send a push notification to a user. Safe to call without awaiting.
 *
 * @param {string} userId  — recipient's profile id
 * @param {string} title   — notification title (e.g. "Marcus sent you a message")
 * @param {string} [body]  — notification body (e.g. the message preview)
 * @param {object} [data]  — string→string map for deep-linking (e.g. { kind: 'dm' })
 */
export function sendPush(userId, title, body = '', data = {}) {
  if (!userId || !title) return;

  // Coerce data values to strings — FCM requires the data payload to be
  // entirely string→string.
  const stringData = {};
  for (const [k, v] of Object.entries(data)) stringData[k] = String(v);

  supabase.functions
    .invoke('send-push', {
      body: { user_id: userId, title, body, data: stringData },
    })
    .catch((err) => {
      // Swallow — a failed push is never worth surfacing to the sender.
      console.info('[LiveHoops] Push not sent:', err?.message ?? err);
    });
}

// Truncate a message/preview so notifications stay short and readable.
export function preview(text, max = 120) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}
