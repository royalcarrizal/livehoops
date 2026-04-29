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
import {
  getStoredNotifications,
  getUnreadCount,
  markAllRead,
  sendLocalNotification,
} from '../utils/notificationStore';

// ─────────────────────────────────────────────────────────────────────────────
// YOUR VAPID KEY
// ─────────────────────────────────────────────────────────────────────────────
// VAPID = "Voluntary Application Server Identification"
// It's like a password that proves to the browser that push messages
// actually come from your Firebase project, not a random server.
//
// How to get it:
//   1. Firebase Console → Project Settings → Cloud Messaging tab
//   2. Under "Web Push certificates" → click "Generate key pair"
//   3. Copy the long Base64 string that appears and paste it below
// ─────────────────────────────────────────────────────────────────────────────
const FCM_VAPID_KEY = ''; // paste your VAPID key here

export function useNotifications() {
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
      console.log('[LiveHoops] Foreground push received:', payload);
      sendLocalNotification(
        payload.notification?.title || 'LiveHoops',
        payload.notification?.body  || '',
        '🏀'
      );
    });
    return unsubscribe;
  }, []); // empty deps — set up once on mount

  // ── Request permission + get FCM token ────────────────────────────────────
  const requestPermission = useCallback(async () => {
    // Can't request notifications in very old browsers
    if (typeof Notification === 'undefined') return 'denied';

    // This opens the browser's "Allow notifications?" popup.
    // After the user responds, the Promise resolves with their answer.
    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === 'granted' && messaging) {
      try {
        // Register the service worker first. The browser needs it installed
        // before FCM can route background messages to it.
        const registration = await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js'
        );

        // getToken asks Firebase for a unique push token for this device/browser.
        // Think of it like a phone number for this specific browser instance.
        const token = await getToken(messaging, {
          vapidKey: FCM_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (token) {
          // In a real app you'd POST this token to your server so it can
          // send pushes to this user. For now we just save it locally.
          localStorage.setItem('lh_fcm_token', token);
          console.log('[LiveHoops] FCM token saved. Share this with your server:', token);
        }
      } catch (err) {
        // This typically happens when:
        //   - The Firebase config in firebase.js is still empty
        //   - The VAPID key above is still empty
        //   - The user is on a browser that blocks service workers
        // Local (in-app) notifications will still work fine.
        console.info('[LiveHoops] FCM token unavailable (config not filled in yet?):', err.message);
      }
    }

    return result;
  }, []);

  return {
    permission,       // 'default' | 'granted' | 'denied'
    unreadCount,      // number — shown on bell badge
    notifications,    // array — shown in the notification panel
    requestPermission, // async fn — call when "Enable" button is clicked
    markAllRead,      // fn — clears the unread badge
  };
}
