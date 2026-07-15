// src/hooks/useNotifications.js
//
// A React hook that manages the notification system from the UI's perspective.
// It handles three jobs:
//
//   1. PERMISSION — tracks whether the user has granted notification permission
//      and provides requestPermission() to ask them.
//
//   2. FCM TOKEN — after permission is granted, gets a unique device token from
//      Firebase and saves it to localStorage. In a real app you'd send this
//      token to your server so it can deliver pushes to this specific device.
//
//   3. LIVE STATE — subscribes to localStorage changes (via the custom
//      'livehoops:notification' event) so the bell badge and panel always
//      reflect the current unread count without needing a page refresh.

import { useState, useEffect, useCallback } from 'react';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { messaging } from '../firebase';
import { supabase } from '../lib/supabase';
import {
  getStoredNotifications,
  getUnreadCount,
  markAllRead,
  sendLocalNotification,
} from '../utils/notificationStore';

// ─────────────────────────────────────────────────────────────────────────────
// VAPID KEY (from .env)
// ─────────────────────────────────────────────────────────────────────────────
// VAPID = "Voluntary Application Server Identification"
// It's like a password that proves to the browser that push messages
// actually come from your Firebase project, not a random server.
//
// How to get it:
//   1. Firebase Console → Project Settings → Cloud Messaging tab
//   2. Under "Web Push certificates" → click "Generate key pair"
//   3. Put the long Base64 string in .env as VITE_FIREBASE_VAPID_KEY
// ─────────────────────────────────────────────────────────────────────────────
const FCM_VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '';

// ── Get this device's push token and register it server-side ────────────────
// The token is like a phone number for this specific browser/device. Saving
// it to the fcm_tokens table (see supabase/push_notifications.sql) is what
// lets the send-push Edge Function deliver notifications to this device when
// OTHER people do things (friend request, DM). localStorage alone isn't
// enough — nobody else can read your localStorage.
async function registerPushToken(userId) {
  if (!messaging || !FCM_VAPID_KEY || !userId) return null;

  try {
    // The service worker must be registered before FCM can route
    // background messages to it.
    const registration = await navigator.serviceWorker.register(
      '/firebase-messaging-sw.js'
    );

    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) return null;

    localStorage.setItem('lh_fcm_token', token);

    // Upsert keyed on the token itself: if this device's token already
    // exists (e.g. re-login), just refresh its owner + timestamp instead
    // of creating duplicates.
    const { error } = await supabase
      .from('fcm_tokens')
      .upsert(
        { user_id: userId, token, updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      );

    if (error) {
      console.error('[LiveHoops] Failed to save push token:', error.message);
    }

    return token;
  } catch (err) {
    // Typically: Firebase env vars not set yet, or the browser blocks
    // service workers. Local (in-app) notifications still work fine.
    console.info('[LiveHoops] FCM token unavailable:', err.message);
    return null;
  }
}

// ── Un-register this device's push token ────────────────────────────────────
// The counterpart to registerPushToken: the ONLY thing that actually stops
// pushes reaching this device. Deleting the fcm_tokens row is load-bearing
// (the send-push Edge Function fans out to whatever tokens are in that table,
// nothing else), so we report success/failure based on that delete. The
// Firebase-level deleteToken() is best-effort hygiene — even if it fails, a
// token that's no longer in our table can never receive one of our pushes.
//
// Returns true when the device is confirmed un-registered (or there was
// nothing to remove), false when the DB delete failed and pushes may continue.
async function unregisterPushToken(userId) {
  const token = localStorage.getItem('lh_fcm_token');

  // No cached token → nothing registered from this device. Treat as success.
  if (!token) return true;

  // Delete the DB row first — this is what stops pushes. RLS
  // (fcm_tokens_delete_own) already scopes deletes to the caller; the extra
  // user_id filter is belt-and-suspenders.
  const { error } = await supabase
    .from('fcm_tokens')
    .delete()
    .eq('token', token)
    .eq('user_id', userId);

  if (error) {
    console.error('[LiveHoops] Failed to remove push token:', error.message);
    return false;
  }

  // Invalidate at the Firebase level too, so the SW stops holding a live
  // token. Best-effort — a failure here doesn't matter for delivery.
  if (messaging) {
    try { await deleteToken(messaging); } catch { /* already gone */ }
  }
  localStorage.removeItem('lh_fcm_token');
  return true;
}

export function useNotifications(userId) {
  // Notification.permission is a browser built-in:
  //   'default'  = the user hasn't been asked yet
  //   'granted'  = the user said yes
  //   'denied'   = the user said no (we can't ask again)
  const [permission, setPermission] = useState(() => {
    if (typeof Notification === 'undefined') return 'denied'; // old browser
    return Notification.permission;
  });

  // The number shown on the bell badge
  const [unreadCount, setUnreadCount] = useState(() => getUnreadCount());

  // The full list shown inside the notification panel
  const [notifications, setNotifications] = useState(() => getStoredNotifications());

  // Whether push is enabled ON THIS DEVICE. Per-device (backed by localStorage),
  // separate from the account-level category prefs (notif_friend_requests, …).
  // This is the single source of truth for the master toggle: it gates the
  // auto-register effect below AND what enable/disablePush persist, so the
  // token state can't drift from what the toggle shows.
  const [pushEnabled, setPushEnabled] = useState(
    () => localStorage.getItem('lh_notif_enabled') !== 'false'
  );

  // ── Subscribe to store changes ─────────────────────────────────────────────
  // notificationStore dispatches 'livehoops:notification' whenever the list
  // changes. We listen here so React re-renders the badge and panel.
  useEffect(() => {
    const handleStoreUpdate = () => {
      setUnreadCount(getUnreadCount());
      setNotifications(getStoredNotifications());
    };
    window.addEventListener('livehoops:notification', handleStoreUpdate);
    // Cleanup: remove the listener when this component unmounts
    return () => window.removeEventListener('livehoops:notification', handleStoreUpdate);
  }, []);

  // ── FCM foreground message handler ────────────────────────────────────────
  // When a push arrives while the app IS open (foreground), the service
  // worker doesn't display it — we handle it here instead, passing it
  // through sendLocalNotification so it appears in the panel.
  useEffect(() => {
    // Skip if FCM isn't available (null messaging = empty config or unsupported browser)
    if (!messaging) return;

    // onMessage returns an "unsubscribe" function — we return it so React
    // calls it when the component unmounts, preventing memory leaks.
    const unsubscribe = onMessage(messaging, (payload) => {
      // send-push delivers data-only messages: title/body live in payload.data
      // (payload.notification is kept as a fallback for older payloads)
      const data = payload.data ?? {};
      sendLocalNotification(
        data.title || payload.notification?.title || 'LiveHoops',
        data.body  || payload.notification?.body  || '',
        '🏀'
      );
    });
    return unsubscribe;
  }, []); // empty deps — set up once on mount

  // ── Keep this device registered for pushes ────────────────────────────────
  // If the user granted permission AND hasn't turned the master toggle off,
  // re-register on app load: FCM tokens can rotate, and this also re-links the
  // device if a different account logs in on it. The `pushEnabled` guard is
  // what stops a turned-off device from silently re-registering on reload —
  // without it, deleting the token would just come back on the next load.
  useEffect(() => {
    if (permission === 'granted' && userId && pushEnabled) {
      registerPushToken(userId);
    }
  }, [permission, userId, pushEnabled]);

  // ── Enable push on this device ─────────────────────────────────────────────
  // Asks the browser (if needed), registers the token, and remembers the
  // choice. Returns the resulting permission so callers can message a block.
  const enablePush = useCallback(async () => {
    // Can't request notifications in very old browsers
    if (typeof Notification === 'undefined') return 'denied';

    // Opens the browser's "Allow notifications?" popup; resolves with the answer.
    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      await registerPushToken(userId);
      setPushEnabled(true);
      localStorage.setItem('lh_notif_enabled', 'true');
    }

    return result;
  }, [userId]);

  // ── Disable push on this device ────────────────────────────────────────────
  // Really removes the token (so pushes actually stop), and only flips the
  // remembered state when that succeeded — so the toggle can never show "off"
  // while pushes keep arriving. Returns success so the UI can surface a
  // failure instead of lying.
  const disablePush = useCallback(async () => {
    const ok = await unregisterPushToken(userId);
    if (ok) {
      setPushEnabled(false);
      localStorage.setItem('lh_notif_enabled', 'false');
    }
    return ok;
  }, [userId]);

  return {
    permission,       // 'default' | 'granted' | 'denied'
    pushEnabled,      // bool — master toggle state for THIS device
    unreadCount,      // number — shown on bell badge
    notifications,    // array — shown in the notification panel
    enablePush,       // async fn — turn on: ask + register + persist
    disablePush,      // async fn — turn off: un-register + persist; returns success
    markAllRead,      // fn — clears the unread badge
  };
}
