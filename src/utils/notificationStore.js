// src/utils/notificationStore.js
//
// This file is a simple "store" — a set of functions for reading and writing
// notification data to localStorage. It doesn't use React, so any file in
// the app can import and call these functions directly without needing to
// be inside a React component or hook.
//
// Notifications are stored as a JSON array in localStorage under the key
// 'lh_notifications'. Each notification object looks like:
//   {
//     id:        'notif_1234567890_abc12',  — unique ID
//     title:     'Jordan checked in at Rucker 🏀',
//     body:      'Your crew can see where you are',
//     icon:      '🏀',                      — emoji shown in the panel
//     timestamp: 1712345678901,             — Unix ms timestamp
//     read:      false,                     — false = shows unread badge
//   }

const STORAGE_KEY = 'lh_notifications';
const MAX_STORED  = 50; // cap the list so localStorage doesn't grow forever

// ─── Read ────────────────────────────────────────────────────────────────────

/** Returns the full array of stored notifications (newest first). */
export function getStoredNotifications() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    // JSON.parse fails if the stored value is corrupted — return empty list
    return [];
  }
}

/** Returns the number of notifications the user hasn't seen yet. */
export function getUnreadCount() {
  return getStoredNotifications().filter(n => !n.read).length;
}

// ─── Write ───────────────────────────────────────────────────────────────────

/**
 * Prepends a notification object to the stored list.
 * After saving, dispatches the custom 'livehoops:notification' DOM event so
 * any React component listening (via useNotifications) can re-render with
 * the updated list and unread count.
 */
export function addStoredNotification(notification) {
  const existing = getStoredNotifications();
  // Prepend the new notification and trim the list to MAX_STORED
  const updated  = [notification, ...existing].slice(0, MAX_STORED);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  // Tell React components that the list changed
  window.dispatchEvent(new CustomEvent('livehoops:notification'));
}

/** Marks every notification as read (clears the unread badge). */
export function markAllRead() {
  const updated = getStoredNotifications().map(n => ({ ...n, read: true }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent('livehoops:notification'));
}

/** Deletes all notifications from storage. */
export function clearNotifications() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('livehoops:notification'));
}

// ─── Send ────────────────────────────────────────────────────────────────────

/**
 * The main function you call from anywhere in the app to fire a notification.
 *
 * It does two things:
 *   1. Saves the notification to localStorage so it appears in the in-app panel.
 *   2. Shows a native browser notification popup (only if the user has
 *      already granted permission — otherwise it's silently skipped).
 *
 * Usage:
 *   import { sendLocalNotification } from '../utils/notificationStore';
 *   sendLocalNotification('Jordan checked in 🏀', 'At Rucker Park', '🏀');
 */
export function sendLocalNotification(title, body = '', icon = '🏀') {
  // Build the notification object
  const notification = {
    // Unique ID: timestamp + short random string to prevent collisions
    id:        `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    body,
    icon,
    timestamp: Date.now(),
    read:      false,
  };

  // 1. Save to localStorage + trigger UI update
  addStoredNotification(notification);

  // 2. Show a native browser popup if the user has allowed it.
  //    'Notification' might not exist in very old browsers — the typeof
  //    check prevents a crash in those environments.
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
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
}
