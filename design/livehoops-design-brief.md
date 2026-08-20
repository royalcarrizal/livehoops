# LiveHoops — Design Brief

Written *before* the redesign existed, to describe the app accurately to a design
tool. Kept because its inventory of the app's real surfaces is useful reference in
its own right, and because it explains why the resulting design came out shaped the
way it did.

Everything below was read out of the codebase, not described from memory. Class
names in `code` are the real ones in `src/index.css`.

## What the app is

A mobile-first PWA for pickup basketball: find a court on a map, **check in** so
others can see a game is running, see who else is there, follow friends, post to a
feed, schedule meetups, DM.

Register is **street basketball, not corporate fitness**. Check-in sessions expire
after 3 hours.

### Brand

- **Wordmark**: "Live" white + "Hoops" orange, tight and heavy.
- **Tagline**: "FIND YOUR RUN" (splash), "Find your run." (auth).
- **Logo**: a basketball inside a **map-pin outline** with an elliptical orbit ring,
  drawn as a glowing orange line on near-black. It fuses "basketball" and "location"
  into one mark — exactly what the product does.

## Form factor — hard constraints

- **Design at 390px.** The shell caps at `--app-width: 480px`. A phone app that
  tolerates big screens, not a responsive web app.
- **Bottom nav is 80px + safe-area inset** (`--nav-height`).
- **Safe areas are load-bearing** — `--safe-top` / `--safe-bottom` come from
  `env(safe-area-inset-*)`.
- **Touch only.** No hover-dependent affordances.

### Do not design

No data tables, desktop dialogs, sidebars, top nav bars, breadcrumbs, or
multi-column layouts. The default design-system vocabulary is wrong for this app.

## Navigation

5-tab bottom nav (`.bottom-nav`, `.nav-tab`), icons from **lucide-react**:

| tab | icon | note |
|---|---|---|
| Home | `Home` | feed |
| Map | `Map` | |
| **Check** | `Plus` | **centre, visually special.** Label becomes "Active" in green when checked in |
| Friends | `Users` | unread dot for DMs |
| Profile | `User` | |

## The five overlay archetypes

The single most important thing to get right — a generic "dialog" covers none of
them well.

| archetype | count | pattern |
|---|---|---|
| **Bottom sheet** | 9 | `fixed; bottom: 0`, slides up, drag handle. The signature surface. |
| **Full-screen overlay** | 4 | `inset: 0`, opaque `--bg`, slides/fades. `.single-post-overlay`, `.discover-overlay` |
| **Dropdown panel** | 1 | `.notif-panel`, drops from header |
| **Centred modal** | 1 | `.modal-overlay` + `.add-friend-modal`, 340px max |
| **Docked map panel** | 1 | `.map-courts-sheet`, pinned to map bottom, 220px |

The 9 bottom sheets: `.settings-sheet`, `.map-bottom-sheet`, `.legal-sheet`,
`.add-court-sheet`, `.court-picker-sheet`, `.achievements-sheet`,
`.feed-options-sheet`, `.map-post-sheet`, `.edit-profile-sheet`.

Note `DiscoverSheet` and `AdminSheet` are named "sheet" but are **not** bottom
sheets — they are full-screen overlays.

## Screens

- **Home** — header with bell badge, location row, feed tabs, "new posts" pill,
  skeleton loading, empty state with numbered onboarding steps, feed list, crew row.
  Pull-to-refresh.
- **Map** — full-bleed Mapbox canvas with UI floating over it, search with dropdown,
  docked court-chip panel, court-detail sheet.
- **Check In** — two states: an `.active-session-card` with pulsing live dot and
  three stats (players / elapsed / remaining), or an empty state with 🏀, primary
  "Find a Court" and secondary "+ Add a Court".
- **Friends** — crew summary with live dot, friend request cards, DM thread rows,
  add-friend modal.
- **Profile** — avatar, username, **jersey number**, stat pills, filled/outlined
  action buttons, mutual friends and courts, posts and check-in history tabs.
- **Splash** — animated logo (line-draw, fill sweep, orbit) over a perspective grid.

## Recurring components

`.park-card` (photo, live badge with pulsing dot, player count) · `.feed-post`
(author, jersey, media with play overlay, nested comments) · `.friend-card` ·
avatar with presence ring and stacks · `.post-composer` · `.toast-pill` ·
`.settings-row` grouped into `.settings-group` · badge tiles, chips, search bars,
star ratings, DM bubbles, map markers.

## The constraint most likely to be missed

**LiveHoops ships 2 themes × 8 user-selectable accents** — `.theme-dark` /
`.theme-light`, and orange (default, brand), blue, yellow, red, purple, green,
brown, grey, each defined for both bands. 16 combinations.

Each accent declares an RGB triple; the variants derive from it:

```css
--accent:        rgb(var(--accent-rgb));
--accent-dim:    rgb(var(--accent-rgb) / 0.15);
--accent-border: rgb(var(--accent-rgb) / 0.3);
--accent-contrast: /* text on FILLED accent surfaces */
```

Any neutral palette must work behind **all eight accents in both themes**. A design
built around one signature colour silently breaks a shipped feature. Every filled
accent surface needs a readable contrast colour that is **not assumed to be white**.

## The Map screen's special problem

Map UI floats over a live Mapbox canvas showing arbitrary imagery. Contrast that
works on a flat `--bg` does not hold over satellite tiles or bright streets. The app
keeps custom `--map-bg` and `--map-road` tokens for this.
