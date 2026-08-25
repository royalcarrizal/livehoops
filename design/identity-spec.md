# LiveHoops — the visual identity layer

**Read this if the app has the redesign's colours but doesn't look like the
mockup.** That gap is real and this file is the fix.

Source: the **Livehoops redesign** Claude Design project
(`e7b99089-f301-4f8e-9879-c42f19c158a3`), file `LiveHoops Redesign.dc.html`,
checked in beside this one. It is a *regular* project, not a design-system
project, so it will not appear in `list_projects` — read it by project id.

---

## What went wrong the first time

The design states its own direction in one line:

> **"textured dark, court geometry as layout, modernized ember orange."**

The first pass (PRs #12, #14, #16–#19) delivered the third clause and skipped
the first two. It rebuilt the **component system** — tokens, one button
primitive, one field primitive, the nav, the radius scale — which was worth
doing on its own terms and fixed nine shipped bugs. But a component system is
not a look. The result is an app with the right colours and the wrong
atmosphere.

Concretely, as of this writing `src/` contains **zero** occurrences of:

| element | in the canvas | in the app |
|---|---|---|
| Court-geometry line overlays | 5 blocks across 6 screens | none |
| Grain / noise texture | global overlay | none |
| Gradient avatar ring | profile + edit + check | none |
| Painted court grid on the map | full-bleed 390×844 | none |

Those four are what make the mockup read as the mockup.

**So: do not re-do the component work.** Tokens, `.btn`, `.field`,
`.segmented`, the nav geometry and the radius scale are already correct and
already merged. This spec is only the layer on top.

---

## Phase A — the two global textures

These two are the highest ratio of visual change to code changed. Do them
first and reassess before touching individual screens; they may get you most
of the way there on their own.

### A1. Grain

One fixed overlay above everything, below interaction. From the canvas
(the `showGrain` block):

```
position: fixed; inset: 0;
z-index: 70;
pointer-events: none;
opacity: 0.05;
mix-blend-mode: overlay;
background-image: <inline SVG, feTurbulence type="fractalNoise"
                   baseFrequency="0.9" numOctaves="3">
```

Notes for implementation:

- `pointer-events: none` is load-bearing — without it this swallows every tap
  in the app.
- `mix-blend-mode: overlay` at 5% is what makes it read as texture rather than
  as dirt. Do not raise the opacity to "make it visible"; if it is visible as
  grain, it is too strong.
- Light theme needs its own treatment. `overlay` at 5% over `#F5F4F2` is
  nearly invisible and may be better dropped entirely — check before assuming.
- The canvas exposes this as a toggle (`showGrain`). Consider a
  `prefers-reduced-transparency` or settings escape hatch rather than hardcoding.

### A2. Court geometry

Thin `#FF6A2C` line work, very low opacity, positioned to bleed off the edge
of the screen. This is the "court geometry as layout" clause and it is the
single most identity-defining element in the design.

Shared characteristics across all five instances: `fill="none"`,
`stroke="#FF6A2C"`, `stroke-width="1"`, wrapper `opacity` 0.45–0.5, individual
paths at `stroke-opacity` 0.1–0.22, `position: absolute`, and always inside a
container with `overflow: hidden` so it clips.

Per-screen, read the exact paths out of the canvas rather than eyeballing:

| screen | canvas line | viewBox | placement | opacity |
|---|---|---|---|---|
| Home | ~51 | `0 0 390 200` | `top:28px; right:-90px` 340×200 | .5 |
| Check | ~298 | `0 0 390 300` | centred, `top:0` 390×300 | .5 |
| Profile | ~416 | `0 0 390 260` | centred, `top:34px` 390×260 | .45 |
| Achievements | ~812 | `0 0 390 220` | `top:20px; right:-110px` 340×220 | .5 |
| Map | ~186 | `0 0 390 844` | full-bleed, see A3 | n/a |

The negative `right` values are deliberate — the arcs run off the edge, which
is what makes it read as a court you are standing on rather than a decal.

Suggested implementation: one `<CourtLines variant="home|check|profile|…" />`
component rather than five inline SVGs, so the opacity and stroke rules live in
one place.

### A3. The map's painted court

The Map screen's backdrop is not the same treatment — it is a full-bleed
painted court: `#0F1116` ground, two `#131A16` court rectangles, then two
stroke passes (`#1B1E25` at 9px, `#171A20` at 4px) forming the grid. Canvas
line ~186.

This one interacts with Mapbox. Decide deliberately whether it replaces the
map tiles, sits behind them, or only shows in the loading state — the canvas
is a mockup and does not have a real map under it.

---

## Phase B — the gradient avatar ring

`linear-gradient(140deg, #FF6A2C, #2FE08A)` as a 3px ring around the avatar,
on Profile, Edit Profile and Check.

Implementation is a padded wrapper, not a border: outer div carries the
gradient background and `padding: 3px`, inner div is `border-radius: 999px;
overflow: hidden` and holds the image.

Worth noting the ring runs brand orange → live green, which ties the two
reserved colours together. Keep both ends; a single-colour ring loses the point.

---

## Phase C — screen composition

Only after A and B. Go screen by screen against the artboard, one PR each.
The canvas marks every screen with an HTML comment (`<!-- ── HOME ── -->`),
so diff each one against its live counterpart.

Rough size of each screen in the canvas, as a proxy for how much composition
work is involved:

```
BOTTOM NAV 512   ACHIEVEMENTS 132   HOME 136   SETTINGS 101
SCHEDULE A RUN 98   CHECK 89   EDIT PROFILE 85   PROFILE 80
FRIENDS 77   MAP 64   COURT SHEET 42   HOME COURT PICKER 32   TOAST 7
```

(Bottom nav is large because the artboard repeats it per state; the nav itself
is already implemented and correct.)

---

## Rules carried over from the first pass

These were established while implementing #12–#19 and still hold:

1. **Follow the stated scale, not the mockup's literals.** The artboards
   contain 9, 12, 14, 15 and 18px radii alongside the five-step scale they
   define. That drift is what the tokens exist to eliminate.
2. **Keep `--nav-height: calc(80px + var(--safe-bottom))`.** The canvas
   measures 96px inside an iOS frame where the home indicator is part of the
   artboard; a flat 96px double-counts the inset on a real device.
3. **Keep `lucide-react` icons** rather than the canvas's hand-drawn SVG paths.
4. **Green means live/active and nothing else**, in every accent.
5. **Do not touch the `@media (pointer: coarse)` 16px input rule.** It is what
   stops iOS zooming on focus and never zooming back.
6. **Watch `align-items: center` on a flex column.** It makes every child
   shrink-to-fit and has silently broken two rows already. Run
   `scripts/audit-row-collapse.js` on any screen that gains one.

## What the canvas is not

It is a mockup, and it is wrong in places:

- It offers a "Never" auto check-out option. That is a ghost player by design
  and was deliberately not built.
- Its radii drift, per rule 1.
- It has no real map, no real data, and no loading, empty, error, offline or
  permission-denied states. Those all exist in the app and must survive.
