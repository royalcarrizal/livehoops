// vite.config.js
//
// Vite is the tool that builds your React app into plain HTML, CSS, and
// JavaScript that browsers can understand. This config file tells Vite
// how to build your project and which plugins to use.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    // The React plugin lets Vite understand JSX (the HTML-like syntax in .jsx files)
    react(),

    // ── PWA Plugin ─────────────────────────────────────────────────────────
    // VitePWA automatically generates two things:
    //   1. A "manifest" file — tells the phone your app's name, icon, and colors
    //   2. A "service worker" — a background script that caches files so the
    //      app loads even with no internet connection
    VitePWA({
      // 'autoUpdate' means: when you deploy a new version, the service worker
      // silently updates itself in the background. Users get new code on
      // their next visit without needing to manually refresh.
      registerType: 'autoUpdate',

      // These are the file types the service worker will cache locally on
      // the user's device. Caching means the app loads fast (or even offline)
      // because the browser reads from the device instead of the network.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // The Firebase service worker we created earlier also lives at the
        // root, so we tell Workbox not to try to precache it (it manages
        // itself separately).
        navigateFallbackDenylist: [/firebase-messaging-sw\.js/],

        // Mapbox GL JS is a large library (~2.2 MB). The default limit is 2 MB,
        // so we raise it to 3 MB to let the service worker precache the full bundle.
        // This means the map works even when the user is offline.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },

      // These files from /public will be included in the precache list
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon-512.png'],

      // ── Web App Manifest ────────────────────────────────────────────────
      // The manifest is a JSON file that tells the phone's OS about your app.
      // When someone taps "Add to Home Screen", the OS reads this file to
      // know what name and icon to use, and how to launch the app.
      manifest: {
        name: 'LiveHoops',
        short_name: 'LiveHoops', // shown under the icon on the home screen
        description: 'See which basketball courts are live near you',

        // 'standalone' removes the browser address bar so the app looks and
        // feels like a native app installed from the App Store / Play Store
        display: 'standalone',

        // The page that opens when someone taps your home screen icon
        start_url: '/',
        scope: '/',

        // Prevents the app from rotating sideways on tablets
        orientation: 'portrait',

        // theme_color tints the phone's status bar and task switcher
        theme_color: '#FF6B00',

        // background_color is shown while the app is loading (the "splash screen"
        // the OS generates before your React app has painted anything)
        background_color: '#000000',

        // Icons are what appear on the home screen and in the app switcher.
        // You need multiple sizes because different devices use different sizes.
        // The 'src' paths are relative to your /public folder.
        icons: [
          { src: '/icon-512.png', sizes: '72x72',   type: 'image/png' },
          { src: '/icon-512.png', sizes: '96x96',   type: 'image/png' },
          { src: '/icon-512.png', sizes: '128x128', type: 'image/png' },
          { src: '/icon-512.png', sizes: '144x144', type: 'image/png' },
          { src: '/icon-512.png', sizes: '152x152', type: 'image/png' },
          { src: '/icon-512.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '384x384', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            // 'maskable' icons are used on Android devices that apply a shaped
            // mask (circle, rounded square, etc.) to your icon. The icon needs
            // extra padding around the edges so nothing gets clipped.
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
