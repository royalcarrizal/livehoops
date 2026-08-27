/** @vitest-environment jsdom */
//
// createMarkerEl — the court pin on the map.
//
// Worth pinning: an empty court must show no number (a "0" reads as a broken
// live count), and none of the six signals the old marker stacked on itself
// may come back by accident.

import { describe, it, expect } from 'vitest';
import { createMarkerEl } from '../mapMarker';

const park = (o = {}) => ({
  id: 'c1',
  name: 'Cadman Plaza Courts',
  players: 0,
  checkins: [],
  nextMeetup: null,
  ...o,
});

describe('createMarkerEl', () => {
  it('marks a court with players as live and shows the count', () => {
    const el = createMarkerEl(park({ players: 8 }));
    expect(el.classList.contains('is-live')).toBe(true);
    expect(el.querySelector('.mb-pin-count').textContent).toBe('8');
  });

  it('shows no number at all on an empty court', () => {
    // Not "0" — a zero in a live-count pill reads as a broken counter.
    const el = createMarkerEl(park({ players: 0 }));
    expect(el.classList.contains('is-live')).toBe(false);
    expect(el.querySelector('.mb-pin-count')).toBeNull();
  });

  it('keeps the full pill on empty courts, not a shrunken dot', () => {
    // Checking into an empty court is how a run starts, so it has to stay an
    // easy tap target.
    const el = createMarkerEl(park({ players: 0 }));
    expect(el.querySelector('.mb-pin-bubble')).not.toBeNull();
    expect(el.querySelector('.mb-pin-stem')).not.toBeNull();
  });

  it('always hangs a stem, which the bottom anchor depends on', () => {
    // If this ever stops rendering, `anchor: bottom` in MapScreen silently
    // misplaces every court on the map.
    expect(createMarkerEl(park({ players: 3 })).querySelector('.mb-pin-stem')).not.toBeNull();
  });

  it('carries a basketball, live or not', () => {
    // The ball is what says "court"; colour is what says "busy". Both pins
    // need it, so neither reads as a generic map dot.
    [0, 6].forEach(players => {
      const el = createMarkerEl(park({ players }));
      const svg = el.querySelector('.mb-pin-ball svg');
      expect(svg, `players=${players}`).not.toBeNull();
      // Real SVG, not an HTML element named "svg" — see createBallSvg.
      expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
      expect(svg.querySelector('circle')).not.toBeNull();
      expect(svg.querySelector('path')).not.toBeNull();
    });
  });

  it('no longer carries the plain dot the ball replaced', () => {
    expect(createMarkerEl(park({ players: 4 })).querySelector('.mb-pin-dot')).toBeNull();
  });

  it('leaves the ball colour to CSS', () => {
    // currentColor is how the ball goes dark on a live green pill and muted on
    // an empty grey one. Baking a colour in here would break both.
    const svg = createMarkerEl(park({ players: 4 })).querySelector('.mb-pin-ball svg');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
  });

  it('carries none of the signals the old marker stacked on itself', () => {
    const el = createMarkerEl(park({
      players: 4,
      checkins: [{ id: 'a', initials: 'KM', avatarUrl: null }],
      nextMeetup: { id: 'm1', scheduledAt: new Date().toISOString() },
    }));
    // The ball is drawn SVG now, not the emoji this marker used to render.
    expect(el.textContent).not.toContain('🏀');
    expect(el.querySelector('.mb-marker-avatars')).toBeNull();
    expect(el.querySelector('.mb-fav-star')).toBeNull();
    expect(el.querySelector('.mb-visited-dot')).toBeNull();
    expect(el.querySelector('.mb-meetup-dot')).toBeNull();
  });

  it('describes itself for screen readers', () => {
    expect(createMarkerEl(park({ players: 5 })).getAttribute('aria-label'))
      .toBe('Cadman Plaza Courts, 5 playing now');
    expect(createMarkerEl(park()).getAttribute('aria-label'))
      .toBe('Cadman Plaza Courts, nobody here');
  });

  it('survives a court with no name or player count', () => {
    const el = createMarkerEl({});
    expect(el.getAttribute('aria-label')).toBe('Court, nobody here');
  });
});
