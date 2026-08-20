# LiveHoops redesign — token and component spec

Extracted from the **Livehoops redesign** Claude Design canvas. This is the working
reference for implementation. Values marked ✅ are already live on `main`.

Design direction, in the canvas's own words: *"textured dark, court geometry as
layout, modernized ember orange."* Neutrals deliberately move off pure black and
pure white onto a slightly warm ramp so court photography and the accent both sit
on it without vibrating.

## Neutrals ✅

The design reused the app's existing token names, which is why adopting it was
close to a substitution rather than a rewrite.

| token | dark | light |
|---|---|---|
| `--bg` | `#0B0B0E` | `#F5F4F2` |
| `--bg-card` | `#15161A` | `#FFFFFF` |
| `--bg-elevated` | `#1D1F24` | `#ECEBE8` |
| `--bg-nav` | `#0D0E12` | `#FBFAF9` |
| `--text-primary` | `#F4F4F6` | `#15161A` |
| `--text-secondary` | `#9A9BA4` | `#5F6068` |
| `--text-tertiary` | `#5A5C66` | `#9A9BA4` |
| `--separator` | `#1B1D23` | `#E4E2DE` |
| `--separator-strong` | `#343842` | `#C8C6C1` |
| live/active (`--green`) | `#2FE08A` | `#12A566` |

Green is reserved for live/active in every accent, so the accent never means
"live" and the two can never collide.

## The eight accents ✅

Dark mode. `on` is the text colour for FILLED accent surfaces — a deep tint of the
accent itself rather than flat white or black. Every one clears WCAG 3:1, including
orange, which previously needed an exemption at 2.86:1 on white.

| accent | hex | on | contrast |
|---|---|---|---|
| Orange (default, brand) | `#FF6A2C` | `#150B05` | 6.79 |
| Blue | `#4C8DFF` | `#04102B` | 5.89 |
| Yellow | `#F2C230` | `#1F1804` | 10.53 |
| Red | `#FF5A52` | `#2A0705` | 6.04 |
| Purple | `#A182F5` | `#150A2E` | 6.30 |
| Green | `#3ED27F` | `#052014` | 8.77 |
| Brown | `#C08457` | `#20120A` | 5.80 |
| Grey | `#A6A8B2` | `#14151A` | 7.70 |

The design specifies **dark-mode accents only**. Light-mode variants were kept from
the existing palette — they were re-checked against the new `#F5F4F2` background and
all still clear 3:1 (3.43–7.72). Light-mode orange remains at 2.60 and keeps its
documented exemption in `src/utils/accents.js`.

`darkBright` values for the seven non-orange accents were derived by lightening 28%
toward white; that factor reproduces the design's own orange bright (`#FF8B57`)
exactly.

## Geometry ✅

Radius scale: `--radius-xs` 6 · `--radius-sm` 10 · `--radius-md` 16 ·
`--radius-lg` 26 · `--radius-full` 999.

Spacing is a 4pt grid.

> **Follow the stated scale, not the mockup's literals.** The artboards also contain
> 9, 12, 14, 15 and 18px radii. That is mockup drift. Eliminating exactly that kind
> of sprawl — one conceptual button shipping at 12px, 14px and 20px — is why the
> token exists.

## Type

**System stack, kept.** No custom font, so no bundling and no reflow risk.

| role | size / weight | use |
|---|---|---|
| Display | 25 / 700 | wordmark, screen titles |
| Stat | 22 / 700, **tabular** | stat numbers — always tabular |
| Title | 16 / 600 | card names |
| Body | 14.5 / 400 | post text, sheet copy |
| Secondary | 12.5 / 400 | addresses, meta |
| Label | 11 / 600, +0.9 tracking | section labels |

## Bottom sheet ✅

26px top corners · 1px top border · opaque card ground · max-height 88svh ·
`translateY(102%)` slide-in · drag handle 36×4px at 2px radius.

**No backdrop blur, deliberately** — a blurred scrim makes sheet text fight the map
underneath. Verified in the running app: `backdrop-filter: none` over the live
Mapbox canvas, fully legible.

Note the `--bg` / `--bg-card` split is load-bearing and must be preserved:
full-height sheets use `--bg` *specifically* so their inner `.settings-group` cards
(`--bg-card`) stay visible. Making every sheet `--bg-card` makes those groups vanish.

## Bottom nav — not yet implemented

96px tall in the canvas, `rgba(13,14,18,.92)` with `backdrop-filter: blur(22px)`,
1px top border, 23px icons, `600 10px` labels, 4px active dot, active tab at 2.5
stroke weight.

The **centre Check tab** is a filled 58×42px pill at 15px radius with an accent
glow, its icon in the accent-contrast colour. It is the only filled surface in the
nav and the one thing that changes colour with session state.

> Two deviations to apply: keep `--nav-height: calc(80px + var(--safe-bottom))`
> rather than a flat 96px — the canvas measures inside an iOS mockup frame where the
> home indicator is part of the artboard, so 96px would double-count the safe-area
> inset on a real device. And keep the existing `lucide-react` icons rather than the
> canvas's hand-drawn SVG paths; they are close in spirit and swapping adds bespoke
> icon markup for a marginal gain.

## Features the design implies that do not exist yet

None of these exist in the app or in the `profiles` columns the app queries. Each
needs a migration in `supabase/`, following the `jersey_number.sql` pattern.

| feature | note |
|---|---|
| Profile bio | design shows a 120-character counter |
| Home court | references `courts(id)`; reuse `CourtPickerSheet` rather than building a second picker |
| Player positions | shown as a row of selectable chips |
| Configurable auto check-out | **highest risk — see below** |

### Why configurable auto check-out is not a small change

The 3-hour limit is currently enforced in three places that must agree:

1. `MAX_CHECKIN_MS` in `src/hooks/useCheckIn.js` — client-side, runs only when that
   user next opens the app
2. `livehoops_expire_stale_checkins()` in `supabase/auto_expire_checkins.sql` — a
   `SECURITY DEFINER` function with a hardcoded `interval '3 hours'`
3. A pg_cron job calling that function every 5 minutes

That SQL file carries an explicit warning that the limit must match the client
constant. Making it per-user means rewriting the server function to join `profiles`
and expire against each user's own setting.

Because the function is `SECURITY DEFINER`, AGENTS.md treats it as security-
sensitive: caller authorization must be reviewed and both allowed and denied cases
tested. A mistake produces "ghost players" — the exact bug that function exists to
prevent. Do it last, alone, and verify against staging first. Offering fixed options
(3h / 6h / 12h) is materially safer than a free-form value.
