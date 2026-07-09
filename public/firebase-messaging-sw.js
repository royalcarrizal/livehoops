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
const firebaseConfig = {
  apiKey:            'AIzaSyBMXMawK3J5wYDUg7WAWvhLiPRAiPLK16U',
  authDomain:        'livehoops-29dda.firebaseapp.com',
  projectId:         'livehoops-29dda',
  storageBucket:     'livehoops-29dda.firebasestorage.app',
  messagingSenderId: '833499267448',
  appId:             '1:833499267448:web:09969c8e0654982ac5488d',
  measurementId:     'G-08HQRWSF6N',
};

// Guard: until the config above is filled in, initializing Firebase Messaging
// throws and floods the console with errors on every device. While the config
// is empty we skip setup entirely so the service worker loads cleanly and
// simply does nothing. Once you paste real values in, push handling activates.
if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);

  // Get a reference to Firebase Messaging for the service worker context.
  // 'self' refers to the service worker itself (it has no 'window' object).
  const messaging = firebase.messaging();

  // ───────────────────────────────────────────────────────────────────────────
  // BACKGROUND MESSAGE HANDLER
  // ───────────────────────────────────────────────────────────────────────────
  // This function runs when a push notification arrives from Firebase while:
  //   - The app tab is closed
  //   - The app tab is in the background (user is on a different tab)
  //
  // When the app IS in the foreground (open and active), onMessage() in
  // src/hooks/useNotifications.js handles it instead.
  // ───────────────────────────────────────────────────────────────────────────
  messaging.onBackgroundMessage(function (payload) {
  // The send-push function sends DATA-ONLY messages: title and body travel
  // inside payload.data along with the deep-link fields (kind, postId,
  // senderId, courtId…). We build the notification ourselves so the data
  // stays attached and the click handler below can open the right screen.
  const data  = payload.data ?? {};
  const title = data.title || payload.notification?.title || 'LiveHoops';
  const body  = data.body  || payload.notification?.body  || '';

  // self.registration is the browser's notification system for this SW.
  // showNotification() creates the actual OS-level notification popup.
  return self.registration.showNotification(title, {
    body,
    icon:  '/favicon.svg',  // the small image shown inside the notification
    badge: '/favicon.svg',  // tiny icon shown in the Android status bar
    tag:   'livehoops-push', // if a notification with this tag already exists,
                              // the new one replaces it instead of stacking
    data,                    // deep-link payload, read back on tap below
    vibrate: [200, 100, 200], // vibration pattern in ms [vibrate, pause, vibrate]
  });
  });
} // end: firebaseConfig.apiKey guard

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION CLICK HANDLER
// ─────────────────────────────────────────────────────────────────────────────
// Runs when the user taps a notification. Here we focus the app tab if it's
// already open, or open a new tab if not.
// ─────────────────────────────────────────────────────────────────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close(); // dismiss the notification banner

  // The deep-link payload we attached in showNotification() above.
  // e.g. { kind: 'post_comment', postId: '…' } or { kind: 'dm', senderId: '…' }
  const data = event.notification.data || {};

  // Build a URL like /?push=dm&senderId=abc — used when we have to open a
  // brand new tab/window. App.jsx reads these params on startup and
  // navigates to the right screen.
  const params = new URLSearchParams();
  if (data.kind) params.set('push', data.kind);
  ['postId', 'commentId', 'senderId', 'accepterId', 'courtId', 'userId'].forEach((key) => {
    if (data[key]) params.set(key, data[key]);
  });
  const targetUrl = params.toString() ? `/?${params.toString()}` : '/';

  event.waitUntil(
    // Look for an existing app tab
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          // App already open — focus it and hand it the deep link directly
          // (a postMessage the app listens for), no reload needed.
          client.focus();
          client.postMessage({ type: 'push-click', data });
          return;
        }
      }
      // No existing tab found — open a new one at the deep-link URL
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
