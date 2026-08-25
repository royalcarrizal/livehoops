# Design

Source material for the LiveHoops redesign. This folder is reference, not code —
nothing here is imported by the app, and nothing in it reaches the bundle.

| file | what it is |
|---|---|
| `identity-spec.md` | **Start here.** What the redesign still needs: grain, court geometry, the gradient ring, screen composition. Written after the first pass shipped the component system but not the look. |
| `LiveHoops Redesign.dc.html` | The canvas itself, pulled from Claude Design. The prototype source for every screen. |
| `icon-source.png` | Source art for the app icon. |

## The design canvas

- Project: **Livehoops redesign** (`e7b99089-f301-4f8e-9879-c42f19c158a3`)
- File: `LiveHoops Redesign.dc.html`

Read it with the `DesignSync` tool by project id. Note it is a **regular**
project, not a design-system project, so it does **not** appear in
`list_projects` — that method filters to design-system projects only. Use
`get_project` / `list_files` / `get_file` with the id directly.

The project also contains `support.js`, `image-slot.js` and `ios-frame.jsx`
(the design tool's own runtime, not design content) and an `uploads/` folder
with the original brief and four screenshots of the app as it was before.
None of those are checked in here.

### How the canvas is organised

Three artboards:

- **`1a`** — a tappable 390×844 prototype. Thirteen screens, each marked by an
  HTML comment: `<!-- ── HOME ── -->`, `<!-- ── MAP ── -->`, and so on. Grep
  for `<!-- ──` to list them.
- **`1b`** — foundations: palette in both themes, all 8 accents with their
  contrast colours, radius, spacing, type.
- **`1c`** — surfaces: nav in both states, sheet anatomy, cards under two accents.

The `<script type="text/x-dc">` block at the end holds the prototype's state
and the option lists its templates iterate over — that is where values like the
auto check-out options and the accent swatches come from.

> **The spec outranks the canvas** where they disagree. See the rules section
> in `identity-spec.md`; the artboards contain radius drift and a nav height
> measured inside an iOS frame, both of which are wrong for the real app.

## Status

**Component system — done and deployed.**

| phase | PR |
|---|---|
| Token layer (neutrals, 8 accents, radius scale) | #12 |
| Bottom sheets and overlay surfaces | #14 |
| Buttons — one primitive, 51 selectors retired | #16 |
| Cards + bottom nav, 94 radii tokenised | #17 |
| Centred-row collapse audit | #18 |
| Forms — one field primitive, `--border` fixed | #19 |

**Features from the design — done and deployed** (each needed a migration in
`supabase/`): bio (#20), positions (#21), home court (#22), configurable auto
check-out (#23).

**Visual identity — not started.** See `identity-spec.md`. This is the part
that makes the app look like the canvas.

## Bugs the redesign work uncovered

All predated it; all are fixed.

1. Auth Sign Up / Log In toggle collapsed to 52px per segment (#16)
2. Map sheet's three action buttons came out 63/67/67px and wrapped (#16)
3. Court picker's drag handle was never centred (#16)
4. Friend-request Accept button was white on green — 1.9:1 (#16)
5. Profile stat row was 193px wide in a 390px screen (#17)
6. `--border` was never defined — invisible Settings drag handle, no row
   dividers, no group outlines, one near-white input border (#19)
7. Map search was unreadable in light mode — hardcoded dark background (#19)
8. Blocking stopped being enforced after a reload — `blocked_users` returned
   400 on every load and the failure was swallowed (#24)
9. Profile screen crashed on every render — a temporal-dead-zone read (#25)

`no-use-before-define` and `scripts/audit-row-collapse.js` were added to catch
classes 9 and 5 respectively.
