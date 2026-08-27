// src/utils/courtGlyph.js
//
// The basketball drawing, in one place.
//
// It is needed on both sides of a React boundary: the Map's court rows render
// it as JSX, while the map pin is plain DOM because Mapbox owns that element
// and React never gets to touch it. Neither can import the other's version, so
// what they share is the geometry — the seam paths below — and a builder for
// the DOM side.
//
// Kept together so the ball on a pin and the ball in a list row stay the same
// ball. Two hand-copied SVGs would drift the first time either is nudged.

export const BALL_VIEWBOX = '0 0 24 24';

// The ball's outline.
export const BALL_CIRCLE = { cx: 12, cy: 12, r: 9 };

// The four seams: one vertical, one horizontal, and the two curved sides.
export const BALL_SEAMS =
  'M12 3v18M3 12h18M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8';

// ── createBallSvg(size, strokeWidth) ────────────────────────────────────────
// The DOM version, for the map pin. Strokes use currentColor so the caller
// controls the colour in CSS — the ball is dark on a live green pill and muted
// on an empty grey one, and neither is baked in here.
//
// SVG elements need createElementNS; createElement('svg') produces an HTML
// element that renders as nothing at all.
export function createBallSvg(size = 13, strokeWidth = 1.8) {
  const NS = 'http://www.w3.org/2000/svg';

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', BALL_VIEWBOX);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(strokeWidth));
  svg.setAttribute('aria-hidden', 'true');

  const circle = document.createElementNS(NS, 'circle');
  circle.setAttribute('cx', String(BALL_CIRCLE.cx));
  circle.setAttribute('cy', String(BALL_CIRCLE.cy));
  circle.setAttribute('r', String(BALL_CIRCLE.r));
  svg.appendChild(circle);

  const seams = document.createElementNS(NS, 'path');
  seams.setAttribute('d', BALL_SEAMS);
  svg.appendChild(seams);

  return svg;
}
