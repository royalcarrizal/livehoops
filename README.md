# 🏀 LiveHoops

**See which basketball courts are live near you.**

LiveHoops is a mobile-first web app for pickup basketball. Open it, see which
courts around the city have players on them *right now*, check in when you
arrive, and connect with the people you hoop with.

## Features

- **Live court map** — real Mapbox map with every court as a marker; live
  player counts, favorites, "visited" badges, ratings, and directions
- **Check-ins** — one tap to go "on the court"; counts update for everyone in
  real time; sessions auto-expire after 3 hours (client- and server-side)
- **Social feed** — post text/photos, tag courts, like, comment, repost;
  Following and Nearby tabs with real-time new-post alerts
- **Friends & DMs** — friend requests, crew list, mutual friends/courts,
  real-time direct messages with unread badges
- **Profiles** — stats (check-ins, hours, courts visited), achievements,
  check-in history, avatar upload
- **Community courts** — users can submit missing courts (with photo); they
  stay hidden until verified
- **PWA** — installable to the home screen, works like a native app

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite, plain CSS ([src/index.css](src/index.css)), lucide-react icons |
| Backend | Supabase — auth, Postgres, Storage, Realtime |
| Map | Mapbox GL JS (+ Mapbox geocoding for city labels) |
| Push (planned) | Firebase Cloud Messaging — scaffolded in [src/firebase.js](src/firebase.js), not yet configured |
| PWA | vite-plugin-pwa (service worker + manifest) |

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Then fill in:
   - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase Dashboard →
     Project Settings → API
   - `VITE_MAPBOX_TOKEN` — https://account.mapbox.com → Access tokens

3. **Set up the database**

   Run the SQL files in [supabase/](supabase/) in the Supabase SQL Editor
   (Dashboard → SQL Editor). They create the RPCs, triggers, and row-level
   security policies the app depends on:

   | File | What it does |
   |---|---|
   | `rls_policies.sql` | Row-level security for the core tables |
   | `atomic_checkins.sql` | Atomic check-in/check-out RPCs (counts + stats) |
   | `auto_expire_checkins.sql` | pg_cron job that closes check-ins older than 3 h (fixes "ghost players") |
   | `privacy_settings.sql` | show_location + profile_visibility columns and privacy-aware friends RPC |
   | `posts_profiles_fk.sql` | foreign key linking posts to profiles (integrity; joins were failing without it) |
   | `push_notifications.sql` | fcm_tokens device registry for push notifications |
   | `comment_likes_and_replies.sql` | comment_likes table + like_count and parent_comment_id on comments |
   | `notification_preferences.sql` | notif_friend_requests + notif_court_checkins columns for push gating |
   | `checkins_rls.sql` | Check-in read policies |
   | `friends_active_checkins_rpc.sql` | "Which friends are on a court now" RPC |
   | `mutual_courts_rpc.sql` | Courts-in-common RPC for visitor profiles |
   | `posts_policies.sql` | Feed post policies |
   | `reposts.sql` | Repost column + uniqueness constraint |
   | `court_favorites.sql` | Court favorites table |
   | `court_submission_policies.sql` | User-submitted courts (unverified until approved) |
   | `triggers.sql` | Like/comment/rating counter triggers |
   | `delete_user.sql` | Delete-account RPC |

   Also enable **Realtime** on the `posts` and `messages` tables
   (Dashboard → Database → Replication).

4. **Run it**

   ```bash
   npm run dev
   ```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build into `dist/` (includes PWA service worker) |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |

## Project structure

```
src/
  App.jsx          — top-level flow: splash → auth → onboarding → tabs
  screens/         — the 5 main tabs (Home, Map, CheckIn, Friends, Profile)
  components/      — reusable UI (sheets, cards, modals, feed post, avatar…)
  hooks/           — all data logic (useAuth, useCheckIn, usePosts, useFriends…)
  lib/supabase.js  — Supabase client
  firebase.js      — FCM scaffolding (config not yet filled in)
  index.css        — all styling + theme tokens (dark theme, orange accent)
supabase/          — SQL to run in the Supabase SQL Editor (see table above)
public/            — icons, manifest assets, firebase-messaging-sw.js
```

## Known gaps

- **Push notifications don't fire yet** — the Firebase config and VAPID key in
  [src/firebase.js](src/firebase.js) / [src/hooks/useNotifications.js](src/hooks/useNotifications.js)
  are empty. Notifications are currently local-device only.
- **Houston-first** — the map centers on Houston and court addresses assume TX.
- Court verification and post reports are handled manually in the Supabase
  dashboard (no admin UI yet).
