// src/components/CourtLines.jsx
//
// "Court geometry as layout" — the second clause of the redesign's stated
// direction, and the single most identity-defining element in it.
//
// Thin line work suggesting the arcs and keys of a basketball court, drawn at
// very low opacity behind a screen's header content and positioned so it runs
// off the edge of the screen. The bleed is deliberate: an arc that fits inside
// the frame reads as a decal, one that runs off the edge reads as a court you
// are standing on.
//
// One component rather than five inline SVGs so the stroke and opacity rules
// live in one place. The paths below are transcribed exactly from the design
// canvas (design/LiveHoops Redesign.dc.html) — the line numbers in each
// variant point at the source block.
//
// Colour: the canvas hardcodes #FF6A2C, but the app ships eight user-selectable
// accents and an orange arc under a blue app reads as a bug. So the SVG strokes
// with `currentColor` and .court-lines sets `color: var(--accent)`, which makes
// the geometry follow whichever accent the user picked.

const VARIANTS = {
  // Home feed header — canvas line 51. Two nested arcs and a lane line,
  // bleeding off the right edge.
  home: {
    viewBox: '0 0 390 200',
    paths: [
      { d: 'M300 -20 A 118 118 0 0 1 300 220', opacity: 0.22 },
      { d: 'M300 20 A 78 78 0 0 1 300 180',    opacity: 0.12 },
      { d: 'M240 0 V 200',                     opacity: 0.1  },
    ],
  },

  // Check-in "not checked in" empty state — canvas line 298. A centre circle
  // behind the basketball mark, with the half-court line through it.
  check: {
    viewBox: '0 0 390 300',
    paths: [
      { d: 'M195 12 m -104 0 a 104 104 0 1 0 208 0 a 104 104 0 1 0 -208 0', opacity: 0.1  },
      { d: 'M120 150 h150',                                                 opacity: 0.12 },
    ],
  },

  // Profile header — canvas line 416. The key and its free-throw arc, centred
  // behind the avatar. The canvas's third path is stroke-opacity="0", an
  // invisible artboard leftover, and is deliberately not carried over.
  profile: {
    viewBox: '0 0 390 260',
    paths: [
      { d: 'M75 -20 h240 v150 H75 z',        opacity: 0.1  },
      { d: 'M135 130 a 60 60 0 0 0 120 0',   opacity: 0.14 },
    ],
  },

  // Achievements sheet — canvas line 812. Same right-edge bleed as home, one
  // arc tighter.
  achievements: {
    viewBox: '0 0 390 220',
    paths: [
      { d: 'M300 -20 A 118 118 0 0 1 300 220', opacity: 0.2  },
      { d: 'M300 24 A 74 74 0 0 1 300 176',    opacity: 0.11 },
    ],
  },
};

/**
 * CourtLines — decorative court-geometry overlay.
 *
 * Purely decorative, so it is aria-hidden and non-focusable: it carries no
 * information a screen reader needs and should never take tab focus.
 *
 * The host element must be `position: relative; overflow: hidden` — the SVG is
 * absolutely positioned and is meant to be clipped, not to widen the page.
 *
 * Props:
 *   variant {'home'|'check'|'profile'|'achievements'}
 */
export default function CourtLines({ variant }) {
  const config = VARIANTS[variant];
  if (!config) return null;

  return (
    <svg
      className={`court-lines court-lines--${variant}`}
      viewBox={config.viewBox}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      {config.paths.map(({ d, opacity }) => (
        <path key={d} d={d} strokeOpacity={opacity} />
      ))}
    </svg>
  );
}
