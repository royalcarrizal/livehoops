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
import { getToken, onMessage } from 'firebase/messaging';
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
  // If the user already granted permission on a previous visit, re-register
  // the token on app load: FCM tokens can rotate, and this also re-links the
  // device if a different account logs in on it.
  useEffect(() => {
    if (permission === 'granted' && userId) {
      registerPushToken(userId);
    }
  }, [permission, userId]);

  // ── Request permission + get FCM token ────────────────────────────────────
  const requestPermission = useCallback(async () => {
    // Can't request notifications in very old browsers
    if (typeof Notification === 'undefined') return 'denied';

    // This opens the browser's "Allow notifications?" popup.
    // After the user responds, the Promise resolves with their answer.
    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      await registerPushToken(userId);
    }

    return result;
  }, [userId]);

  return {
    permission,       // 'default' | 'granted' | 'denied'
    unreadCount,      // number — shown on bell badge
    notifications,    // array — shown in the notification panel
    requestPermission, // async fn — call when "Enable" button is clicked
    markAllRead,      // fn — clears the unread badge
  };
}
