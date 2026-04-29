// src/firebase.js
//
// This file sets up the connection to Firebase — the backend service that
// powers push notifications. Think of this as the "login credentials" your
// app uses to talk to Firebase's servers.
//
// Firebase Cloud Messaging (FCM) is the specific Firebase service that handles
// push notifications. When a user checks in, FCM is what delivers the alert
// to their friends' phones.

import { initializeApp } from 'firebase/app';
import { getMessaging } from 'firebase/messaging';

// ─────────────────────────────────────────────────────────────────────────────
// YOUR FIREBASE CONFIG
// ─────────────────────────────────────────────────────────────────────────────
// How to fill these in:
//   1. Go to https://console.firebase.google.com
//   2. Create a project (or open an existing one)
//   3. Click the gear icon → Project Settings
//   4. Scroll to "Your apps" → click "Add app" → choose Web (</>)
//   5. Register your app — Firebase will show you this config object
//   6. Copy each value into the matching field below
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            '', // looks like: AIzaSy...
  authDomain:        '', // looks like: your-project.firebaseapp.com
  projectId:         '', // looks like: your-project-id
  storageBucket:     '', // looks like: your-project.appspot.com
  messagingSenderId: '', // looks like: 123456789012
  appId:             '', // looks like: 1:123456789012:web:abc123...
  measurementId:     '', // looks like: G-XXXXXXXXXX (optional, for Analytics)
};

// Initialize the Firebase app with your config.
// This is like signing in — without valid values above, Firebase features
// (including push notifications) will not work, but the app won't crash.
const app = initializeApp(firebaseConfig);

// Initialize Firebase Cloud Messaging.
// We wrap this in try/catch because getMessaging() can throw in environments
// that don't support it (e.g. Firefox in Private Browsing mode, or some
// browser extensions that block service workers).
// If it fails, 'messaging' will be null and push delivery won't work,
// but local (in-app) notifications will still function normally.
let messaging = null;
try {
  messaging = getMessaging(app);
} catch (err) {
  console.info(
    '[LiveHoops] Firebase Messaging not available in this browser:',
    err.message
  );
}

export { app, messaging };
