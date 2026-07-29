// src/hooks/useNotifications.js
//
// A React hook that manages the notification system from the UI's perspective.
// It handles three jobs:
//
//   1. PERMISSION — tracks whether the user has granted notification permission
//      and provides requestPermission() to ask them.
//
//   2. FCM TOKEN — after permission is granted, gets a unique device token from
//      Firebase and saves it to localStorage + the fcm_tokens table.
//
//   3. LIVE STATE — the notification list/unread count are backed by the
//      Supabase `notifications` table (see supabase/notifications.sql), not
//      localStorage: we fetch on mount and subscribe to Realtime for new
//      rows. This is what makes the bell panel the same on every device, and
//      what makes a push that arrived while the app was closed still show up
//      once it's reopened (the send-push Edge Function already wrote the row
//      before the FCM message went out).

import { useState, useEffect, useCallback } from 'react';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { messaging } from '../firebase';
import { supabase } from '../lib/supabase';
import {
  fetchNotifications,
  subscribeToNotifications,
  markAllRead as markAllReadInStore,
  clearNotifications as clearNotificationsInStore,
  showNativePopup,
} from '../utils/notificationStore';
import { urlBase64ToUint8Array } from '../lib/push';

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

// Firebase's messaging worker gets its OWN scope so it doesn't collide with the
// Vite/Workbox offline worker that main.jsx registers at '/'. Two service
// workers at the same scope is tolerated on Chrome/Android but makes iOS reject
// the push subscription — getToken() throws "TypeError: Type error" and the
// device never registers. This path is FCM's conventional default scope; the
// worker file still lives at the root URL (/firebase-messaging-sw.js), which is
// allowed to control this sub-scope.
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

// Register (or reuse) the Firebase messaging service worker at its dedicated
// scope, resolving only once it has an ACTIVE worker. iOS throws if getToken()
// asks for a subscription before the worker has finished activating, so we wait
// for the installing/waiting worker to reach 'activated' first.
async function registerMessagingSW() {
  const existing = await navigator.serviceWorker.getRegistration(FCM_SW_SCOPE);
  const registration =
    existing ??
    (await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: FCM_SW_SCOPE,
    }));

  if (registration.active) return registration;

  await new Promise((resolve) => {
    const worker = registration.installing || registration.waiting;
    if (!worker) return resolve();
    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') resolve();
    });
  });

  return registration;
}

// Format a caught error as "Name: message" (e.g. "TypeError: Type error") so
// the diagnostics probe surfaces something identifiable.
const fmtErr = (err) =>
  [err?.name, err?.message].filter(Boolean).join(': ') || String(err);

// ── Push probe (Diagnostics) ────────────────────────────────────────────────
// getToken() is opaque: it (1) asks the browser/Apple for a push subscription,
// then (2) hands it to Firebase's servers. On iOS both surface as the same
// generic "TypeError: Type error", so we run each step ourselves and report
// which one throws. Diagnostic-only: it does NOT touch Supabase or the normal
// registration path, so the working (Android/desktop) path is untouched.
// Returns { sw, subscribe, endpointHost, getToken } — each 'ok' or an error.
async function pushProbeSteps() {
  const result = { sw: '', subscribe: '', endpointHost: '', getToken: '' };

  if (!messaging) { result.sw = 'messaging-unavailable'; return result; }
  if (!FCM_VAPID_KEY) { result.sw = 'vapid-missing'; return result; }

  let registration;
  try {
    registration = await registerMessagingSW();
    result.sw = 'ok';
  } catch (err) {
    result.sw = fmtErr(err);
    return result;
  }

  // Step 1 — the browser/Apple push subscription (the OS side).
  try {
    const sub =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(FCM_VAPID_KEY),
      }));
    result.subscribe = 'ok';
    // Host only — the full endpoint path is credential-like, never shown.
    try { result.endpointHost = new URL(sub.endpoint).host; } catch { /* ignore */ }
  } catch (err) {
    result.subscribe = fmtErr(err);
    return result;
  }

  // Step 2 — Firebase's exchange of that subscription for an FCM token.
  try {
    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    result.getToken = token ? 'ok' : 'no-token';
  } catch (err) {
    result.getToken = fmtErr(err);
  }

  return result;
}

// ── Get this device's push token and register it server-side ────────────────
// The token is like a phone number for this specific browser/device. Saving
// it to the fcm_tokens table (see supabase/push_notifications.sql) is what
// lets the send-push Edge Function deliver notifications to this device when
// OTHER people do things (friend request, DM). localStorage alone isn't
// enough — nobody else can read your localStorage.
// Returns { token, reason } rather than just the token so the Settings
// diagnostics can explain WHY a device failed to register — the whole reason a
// push can reach the bell (server row) but never the phone (no device token).
// `reason` is a stable code for the known bail-outs ('messaging-unavailable',
// 'vapid-missing', 'no-token', 'no-user'), 'ok' on success, or the raw
// getToken / service-worker error string otherwise. pushRegistrationMessage()
// in lib/push.js turns these into human-readable lines.
async function registerPushToken(userId) {
  if (!userId) return { token: null, reason: 'no-user' };
  // messaging is null when Firebase Messaging couldn't initialize in this
  // browser (getMessaging threw — e.g. unsupported/blocked). This is distinct
  // from "Firebase configured" (which only means the API key is present).
  if (!messaging) return { token: null, reason: 'messaging-unavailable' };
  if (!FCM_VAPID_KEY) return { token: null, reason: 'vapid-missing' };

  try {
    // Register the messaging worker at its own scope (see FCM_SW_SCOPE) and
    // wait for it to activate before FCM can route background messages to it.
    const registration = await registerMessagingSW();

    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    if (!token) return { token: null, reason: 'no-token' };

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
      return { token, reason: `db-error: ${error.message}` };
    }

    return { token, reason: 'ok' };
  } catch (err) {
    // Typically: the browser blocks service workers, or getToken fails on
    // iOS. Surface the error NAME + message (e.g. "TypeError: Type error") so
    // diagnostics show something identifiable. Local (in-app) notifications
    // still work fine.
    const reason = fmtErr(err);
    console.info('[LiveHoops] FCM token unavailable:', reason);
    return { token: null, reason };
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
  const [unreadCount, setUnreadCount] = useState(0);

  // The full list shown inside the notification panel
  const [notifications, setNotifications] = useState([]);

  // Whether push is enabled ON THIS DEVICE. Per-device (backed by localStorage),
  // separate from the account-level category prefs (notif_friend_requests, …).
  // This is the single source of truth for the master toggle: it gates the
  // auto-register effect below AND what enable/disablePush persist, so the
  // token state can't drift from what the toggle shows.
  const [pushEnabled, setPushEnabled] = useState(
    () => localStorage.getItem('lh_notif_enabled') !== 'false'
  );

  // This device's FCM token, or null if it never registered. Backed by the
  // same localStorage key registerPushToken writes, so it survives reloads and
  // reflects the real "is this device reachable by a push" state. Exposed for
  // the Settings diagnostics panel — a null token here is exactly why a push
  // can reach the bell (server-side row) but never the phone (no device).
  const [deviceToken, setDeviceToken] = useState(
    () => localStorage.getItem('lh_fcm_token')
  );

  // Reason code from the most recent registration attempt (null until one
  // runs). Surfaced in Settings → Diagnostics via pushRegistrationMessage so a
  // failed device shows WHY (e.g. an iOS getToken error) instead of just "No".
  const [pushReason, setPushReason] = useState(null);

  // Result of the last on-demand push probe (null until one runs). Object of
  // { sw, subscribe, endpointHost, getToken } — see pushProbeSteps above.
  const [pushProbe, setPushProbe] = useState(null);

  // ── Load + subscribe to notifications ──────────────────────────────────────
  // Fetches this user's notification history from Supabase on mount/login,
  // then subscribes to Realtime for live updates. New rows land here whether
  // they came from the send-push Edge Function (friend request, DM,
  // comment…) or a client self-insert (liking a post — see FeedPost.jsx).
  // This is the sync mechanism: the panel reflects the server, not this
  // device, so it's identical across tabs and devices, and a notification
  // that arrived while the app was fully closed is still here once reopened.
  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    let cancelled = false;
    fetchNotifications(userId).then((rows) => {
      if (cancelled) return;
      setNotifications(rows);
      setUnreadCount(rows.filter(n => !n.read).length);
    });

    const unsubscribe = subscribeToNotifications(userId, (row) => {
      setNotifications(prev => [row, ...prev]);
      setUnreadCount(prev => prev + 1);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  // ── FCM foreground message handler ────────────────────────────────────────
  // When a push arrives while the app IS open (foreground), the service
  // worker doesn't display it — show a native popup here for immediate
  // feedback. The panel/badge itself updates via the Realtime subscription
  // above (the send-push Edge Function already wrote the row before sending
  // the FCM message), so this handler has no storage responsibility anymore.
  useEffect(() => {
    // Skip if FCM isn't available (null messaging = empty config or unsupported browser)
    if (!messaging) return;

    // onMessage returns an "unsubscribe" function — we return it so React
    // calls it when the component unmounts, preventing memory leaks.
    const unsubscribe = onMessage(messaging, (payload) => {
      // send-push delivers data-only messages: title/body live in payload.data
      // (payload.notification is kept as a fallback for older payloads)
      const data = payload.data ?? {};
      showNativePopup(
        data.title || payload.notification?.title || 'LiveHoops',
        data.body  || payload.notification?.body  || ''
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
      registerPushToken(userId).then(({ token, reason }) => {
        if (token) setDeviceToken(token);
        setPushReason(reason);
      });
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
      const { token, reason } = await registerPushToken(userId);
      if (token) setDeviceToken(token);
      setPushReason(reason);
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
      setDeviceToken(null);
      localStorage.setItem('lh_notif_enabled', 'false');
    }
    return ok;
  }, [userId]);

  // ── Re-run token registration on demand (Diagnostics) ──────────────────────
  // Fires the same registration path as the auto-effect but returns the
  // { token, reason } so the Settings panel can show exactly what happened —
  // the on-device probe that tells us why a phone isn't getting banners.
  const reregister = useCallback(async () => {
    const result = await registerPushToken(userId);
    setDeviceToken(result.token);
    setPushReason(result.reason);
    return result;
  }, [userId]);

  // ── Run the step-by-step push probe (Diagnostics) ─────────────────────────
  // Localizes an opaque getToken() failure to a single layer (service worker /
  // Apple subscription / Firebase exchange). Diagnostic-only — no Supabase
  // writes, doesn't change deviceToken. Returns the step result too.
  const runPushProbe = useCallback(async () => {
    const result = await pushProbeSteps();
    setPushProbe(result);
    return result;
  }, []);

  // ── Mark every notification as read ─────────────────────────────────────────
  // Optimistic: updates local state immediately (instant badge clear), then
  // fires the Supabase update. Low-stakes if that write is slow/fails — the
  // next fetch on mount will resync, and the failure is already logged from
  // inside markAllReadInStore.
  const markAllRead = useCallback(() => {
    if (!userId) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    markAllReadInStore(userId);
  }, [userId]);

  // ── Clear all notifications ─────────────────────────────────────────────────
  // Deletes this user's notifications server-side (not just on this device),
  // so "Clear all" stays cleared across every device, matching how the list
  // itself is now shared across devices.
  const clearAll = useCallback(() => {
    if (!userId) return;
    setNotifications([]);
    setUnreadCount(0);
    clearNotificationsInStore(userId);
  }, [userId]);

  return {
    permission,       // 'default' | 'granted' | 'denied'
    pushEnabled,      // bool — master toggle state for THIS device
    deviceToken,      // string|null — this device's FCM token (null = unregistered)
    pushReason,       // string|null — reason code from the last registration attempt
    messagingReady: !!messaging,   // bool — Firebase Messaging initialized in this browser
    vapidPresent: !!FCM_VAPID_KEY, // bool — VAPID key present in this build
    reregister,       // async fn — re-run registration on demand; returns { token, reason }
    pushProbe,        // object|null — last step-by-step probe result
    runPushProbe,     // async fn — run the step-by-step probe; returns the result
    unreadCount,      // number — shown on bell badge
    notifications,    // array — shown in the notification panel
    enablePush,       // async fn — turn on: ask + register + persist
    disablePush,      // async fn — turn off: un-register + persist; returns success
    markAllRead,      // fn — clears the unread badge
    clearAll,         // fn — deletes all notifications server-side
  };
}
