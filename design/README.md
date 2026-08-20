# Design

Source material for the LiveHoops redesign. This folder is reference, not code —
nothing here is imported by the app.

| file | what it is |
|---|---|
| `redesign-spec.md` | **The token and component spec** extracted from the Claude Design canvas. The working reference for the remaining redesign phases. |
| `livehoops-design-brief.md` | The brief written *before* the design existed, describing the app to the design tool. Historical context for why the design came out shaped the way it did. |
| `icon-source.png` | Source art for the app icon. |

## The design canvas

The redesign was authored in Claude Design:

- Project: **Livehoops redesign** (`e7b99089-f301-4f8e-9879-c42f19c158a3`)
- File: `LiveHoops Redesign.dc.html`

It contains three artboards: a tappable 390×844 prototype, a foundations board
(palette, all 8 accents with contrast colours, radius, spacing, type), and a
surfaces board (nav in both states, sheet anatomy, cards under two accents).

Note the project is a **regular** project, not a design-system project, so it does
not appear in design-system listings. Read it by project id directly.

## Status

| phase | state |
|---|---|
| Token layer (neutrals, accents, radius scale) | merged — PR #12 |
| Bottom sheets and overlay surfaces | merged — PR #14 |
| Buttons | not started |
| Cards + bottom nav | not started |
| Forms | not started |
| Features: bio, home court, positions, configurable auto check-out | not started (needs SQL) |

## Known issues found during the redesign, not yet fixed

1. The Sign Up / Log In toggle on the auth screen wraps at phone width — both
   segments compute to 44px because `AuthScreen.jsx` borrows `.feed-tab-btn`,
   whose `flex: 1 1 0%` collapses inside a content-width container.
2. The map sheet's action buttons are mismatched: Check In 63px, Get Directions
   and Post Here 67px, with the latter two wrapping to a second line at 390px.
3. The sheet drag handle sits left-aligned inside `.sheet-handle-row` rather than
   centred when a sheet has a title and close button.

All three predate the redesign.
