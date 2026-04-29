// public/firebase-messaging-sw.js
//
// This is a "service worker" — a JavaScript file that runs in the background,
// completely separate from your React app. The browser keeps it alive even
// when your app tab is closed, so it can receive and display push
// notifications on behalf of your app.
//
// Service workers can't use modern "import" syntax — they use importScripts()
// to load libraries from a URL instead. That's why we load Firebase from
// Google's CDN (Content Delivery Network) here.
//
// IMPORTANT: This file lives in the /public folder so it's served at the
// root URL as /firebase-messaging-sw.js — that exact path is required by FCM.

importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.12.0/firebase-messaging-compat.js');

// ─────────────────────────────────────────────────────────────────────────────
// COPY YOUR FIREBASE CONFIG HERE TOO
// ─────────────────────────────────────────────────────────────────────────────
// The service worker is a completely separate file from your React app and
// cannot import from src/firebase.js. You must paste the same config values
// here so the service worker can authenticate with Firebase independently.
// ─────────────────────────────────────────────────────────────────────────────
firebase.initializeApp({
  apiKey:            '',
  authDomain:        '',
  projectId:         '',
  storageBucket:     '',
  messagingSenderId: '',
  appId:             '',
  measurementId:     '',
});

// Get a reference to Firebase Messaging for the service worker context.
// 'self' refers to the service worker itself (it has no 'window' object).
const messaging = firebase.messaging();

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND MESSAGE HANDLER
// ─────────────────────────────────────────────────────────────────────────────
// This function runs when a push notification arrives from Firebase while:
//   - The app tab is closed
//   - The app tab is in the background (user is on a different tab)
//
// When the app IS in the foreground (open and active), onMessage() in
// src/hooks/useNotifications.js handles it instead.
// ─────────────────────────────────────────────────────────────────────────────
messaging.onBackgroundMessage(function (payload) {
  console.log('[LiveHoops SW] Push notification received in background:', payload);

  // Pull the notification content from the payload.
  // If your server sends a "notification" object, these fields are populated.
  // If it sends only "data", you'd read from payload.data instead.
  const title = payload.notification?.title || 'LiveHoops';
  const body  = payload.notification?.body  || '';

  // self.registration is the browser's notification system for this SW.
  // showNotification() creates the actual OS-level notification popup.
  return self.registration.showNotification(title, {
    body,
    icon:  '/favicon.svg',  // the small image shown inside the notification
    badge: '/favicon.svg',  // tiny icon shown in the Android status bar
    tag:   'livehoops-push', // if a notification with this tag already exists,
                              // the new one replaces it instead of stacking
    data:  payload.data,     // pass along any extra data from your server
                              // (e.g. courtId, postId) for deep-linking later
    vibrate: [200, 100, 200], // vibration pattern in ms [vibrate, pause, vibrate]
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION CLICK HANDLER
// ─────────────────────────────────────────────────────────────────────────────
// Runs when the user taps a notification. Here we focus the app tab if it's
// already open, or open a new tab if not.
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close(); // dismiss the notification banner

  event.waitUntil(
    // Look for an existing app tab
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus(); // bring the existing tab to the front
        }
      }
      // No existing tab found — open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
