// src/utils/mapMarker.js
//
// Builds the DOM element for a court marker on the map.
//
// Mapbox owns this element, so it is plain DOM rather than React — Mapbox
// mounts it itself and React never gets to reconcile it. It lives in its own
// module rather than inside MapScreen.jsx so it can be unit tested without
// standing up mapbox-gl.
//
// The pin carries a basketball and, when anyone is playing, a count. Colour is
// what says whether a game is on: green when it is, muted grey when it is not.
// The ball is the same drawing the court list rows use — see utils/courtGlyph.js.
// It used to carry six at once — a basketball emoji, a live dot, up to two
// player avatars plus a "+N", a favourite star, a visited checkmark and a
// scheduled-run badge — stacked on a 44px circle. All of those are still
// reachable; they live in the court's detail sheet, one tap away, where there
// is room to read them.

import { createBallSvg } from './courtGlyph';

// ── createMarkerEl(park) ────────────────────────────────────────────────────
// Returns the marker element for one court.
//
//   live  → green pill, a basketball and the player count
//   empty → the same pill in muted grey, a basketball and NO number
//
// Empty courts deliberately keep the full pill shape rather than shrinking to a
// dot: they need to stay an easy tap target, because checking into an empty
// court is how a run starts.
//
// IMPORTANT: the element hangs a stem below the pill, so the caller must place
// it with Mapbox's `anchor: 'bottom'`. At the default 'center' every court
// would sit half a marker away from its real coordinates.
export function createMarkerEl(park) {
  const players = park?.players ?? 0;
  const isLive  = players > 0;

  const el = document.createElement('div');
  el.className = `mb-pin${isLive ? ' is-live' : ''}`;

  const bubble = document.createElement('div');
  bubble.className = 'mb-pin-bubble';

  // The ball replaces the plain dot this pin used to carry. It is deliberately
  // NOT animated: a dot can pulse and read as a heartbeat, but a basketball
  // scaling in and out reads as a rendering glitch. Green and the count already
  // say the court is live.
  const ball = document.createElement('span');
  ball.className = 'mb-pin-ball';
  ball.appendChild(createBallSvg(13, 1.8));
  bubble.appendChild(ball);

  // The count is the whole point of the pill, so an empty court shows no
  // number at all rather than a "0" — which reads as a broken live count.
  if (isLive) {
    const count = document.createElement('span');
    count.className = 'mb-pin-count';
    count.textContent = String(players);
    bubble.appendChild(count);
  }

  el.appendChild(bubble);

  // The stem that points at the actual coordinate.
  const stem = document.createElement('div');
  stem.className = 'mb-pin-stem';
  el.appendChild(stem);

  // Screen readers get the fact the pill conveys visually.
  el.setAttribute('role', 'button');
  el.setAttribute(
    'aria-label',
    isLive
      ? `${park?.name ?? 'Court'}, ${players} playing now`
      : `${park?.name ?? 'Court'}, nobody here`,
  );

  return el;
}
