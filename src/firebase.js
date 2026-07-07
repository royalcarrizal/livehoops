// src/firebase.js
//
// This file sets up the connection to Firebase — the service that powers
// push notifications. Think of this as the "login credentials" your app
// uses to talk to Firebase's servers.
//
// Firebase Cloud Messaging (FCM) is the specific Firebase service that
// handles push notifications: when a friend sends you a DM or a friend
// request, FCM is what delivers the alert to your phone.
//
// The config values come from your .env file (VITE_FIREBASE_*), the same
// pattern as the Supabase and Mapbox keys. Get them from:
//   Firebase Console → Project Settings → General → Your apps → Web app
// These values are public identifiers (they ship in every user's browser),
// but keeping them in .env keeps them out of source control and lets each
// environment (local / Vercel) use its own project if needed.

import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            ?? '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        ?? '',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         ?? '',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             ?? '',
};

// True once the env vars are filled in — everything below no-ops until then,
// so the app runs fine (just without push) before Firebase is configured.
export const firebaseConfigured = !!firebaseConfig.apiKey;

// Initialize Firebase and Messaging. Wrapped in try/catch because
// getMessaging() throws in environments that don't support it (e.g. some
// private-browsing modes or browsers that block service workers). If
// anything fails, 'messaging' stays null and in-app notifications still work.
let app = null;
let messaging = null;

if (firebaseConfigured) {
  try {
    app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);
  } catch (err) {
    console.info(
      '[LiveHoops] Firebase Messaging not available in this browser:',
      err.message
    );
  }
}

export { app, messaging };
