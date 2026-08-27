// Tests for the court helpers: distance math, distance formatting,
// lighting normalization, and the DB-row → UI-shape transforms.

import { describe, it, expect } from 'vitest';
import { haversine, formatMiles, normalizeLighting, normalizeCourt, groupPlayersByCourt, sortByDistance, hasRealDistance } from '../useCourts';

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversine(29.76, -95.36, 29.76, -95.36)).toBe(0);
  });

  it('computes Houston → Dallas at roughly 225 miles', () => {
    const miles = haversine(29.7604, -95.3698, 32.7767, -96.7970);
    expect(miles).toBeGreaterThan(215);
    expect(miles).toBeLessThan(235);
  });
});

describe('formatMiles', () => {
  it('shows "< 0.1 mi" for very close distances', () => {
    expect(formatMiles(0.05)).toBe('< 0.1 mi');
  });

  it('rounds to one decimal', () => {
    expect(formatMiles(1.44)).toBe('1.4 mi');
    expect(formatMiles(12.35)).toBe('12.3 mi');
  });
});

describe('normalizeLighting', () => {
  it('passes booleans through', () => {
    expect(normalizeLighting(true)).toBe(true);
    expect(normalizeLighting(false)).toBe(false);
  });

  it('understands string variants', () => {
    expect(normalizeLighting('Yes')).toBe(true);
    expect(normalizeLighting('lit')).toBe(true);
    expect(normalizeLighting('no')).toBe(false);
  });

  it('defaults to false for null/undefined', () => {
    expect(normalizeLighting(null)).toBe(false);
    expect(normalizeLighting(undefined)).toBe(false);
  });
});

describe('normalizeCourt', () => {
  const row = {
    id: 'court-1',
    name: 'Wortham Park',
    address: '123 Main St',
    city: 'Houston',
    courts: 2,
    player_count: 5,
    surface: 'Concrete',
    lighting: 'Yes',
    lat: 29.76,
    lng: -95.36,
  };

  it('maps DB columns to the UI shape', () => {
    const court = normalizeCourt(row);
    expect(court.id).toBe('court-1');
    expect(court.players).toBe(5);
    expect(court.courts).toBe(2);
    expect(court.lighting).toBe(true);
  });

  it('does not hardcode a state into the address', () => {
    // Regression: addresses used to always end in " TX"
    expect(normalizeCourt(row).shortAddress).toBe('123 Main St, Houston');
  });

  it('shows "—" distance without GPS and a real distance with it', () => {
    expect(normalizeCourt(row).distance).toBe('—');
    const near = normalizeCourt(row, { lat: 29.76, lng: -95.36 });
    expect(near.distance).toBe('< 0.1 mi');
  });

  it('carries a raw distanceMi alongside the display string', () => {
    // The string is for showing; distanceMi is for comparing. checkInOffer
    // relies on this being null (not 0, not NaN) when GPS is unavailable —
    // otherwise "unknown distance" would read as "standing right here".
    expect(normalizeCourt(row).distanceMi).toBeNull();

    const near = normalizeCourt(row, { lat: 29.76, lng: -95.36 });
    expect(near.distanceMi).toBeCloseTo(0, 5);

    const dallas = normalizeCourt(row, { lat: 32.7767, lng: -96.7970 });
    expect(dallas.distanceMi).toBeGreaterThan(215);
    expect(dallas.distanceMi).toBeLessThan(235);
  });

  it('returns a null distance for a court with no coordinates', () => {
    const noCoords = normalizeCourt({ ...row, lat: null, lng: null }, { lat: 29.76, lng: -95.36 });
    expect(noCoords.distanceMi).toBeNull();
    expect(noCoords.distance).toBe('—');
  });

  it('defaults missing counts safely', () => {
    const sparse = normalizeCourt({ ...row, player_count: null, courts: null });
    expect(sparse.players).toBe(0);
    expect(sparse.courts).toBe(1);
  });
});

describe('groupPlayersByCourt', () => {
  const rows = [
    { court_id: 'court-1', user_id: 'u1', username: 'marcus_w', avatar_url: 'https://x/a.jpg' },
    { court_id: 'court-1', user_id: 'u2', username: null,       avatar_url: null },
    { court_id: 'court-2', user_id: 'u3', username: 'jo',       avatar_url: null },
  ];

  it('groups RPC rows by court id', () => {
    const byCourt = groupPlayersByCourt(rows);
    expect(byCourt['court-1']).toHaveLength(2);
    expect(byCourt['court-2']).toHaveLength(1);
  });

  it('shapes players for the Avatar component', () => {
    const player = groupPlayersByCourt(rows)['court-1'][0];
    expect(player).toEqual({
      id:        'u1',       // AvatarStack keys on ci.id
      userId:    'u1',
      username:  'marcus_w',
      avatarUrl: 'https://x/a.jpg',
      initials:  'MA',
    });
  });

  it('falls back to "Player" for missing usernames', () => {
    const anon = groupPlayersByCourt(rows)['court-1'][1];
    expect(anon.username).toBe('Player');
    expect(anon.initials).toBe('PL');
    expect(anon.avatarUrl).toBeNull();
  });

  it('returns an empty object for empty or missing input', () => {
    expect(groupPlayersByCourt([])).toEqual({});
    expect(groupPlayersByCourt(null)).toEqual({});
  });
});

describe('sortByDistance', () => {
  const near = { id: 'a', distanceMi: 0.3 };
  const far = { id: 'b', distanceMi: 4.2 };
  const unknown = { id: 'c', distanceMi: null };

  it('puts the closest court first', () => {
    expect(sortByDistance([far, near]).map(c => c.id)).toEqual(['a', 'b']);
  });

  it('sorts courts with no known distance LAST, not first', () => {
    // The case that matters. distanceMi is null when GPS is unavailable or
    // denied — if those floated to the top, a list labelled "nearest first"
    // would bury the courts we can actually locate.
    expect(sortByDistance([unknown, far, near]).map(c => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('handles every distance being unknown', () => {
    const all = [{ id: 'a', distanceMi: null }, { id: 'b', distanceMi: null }];
    expect(sortByDistance(all).map(c => c.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the array it was given', () => {
    const input = [far, near];
    sortByDistance(input);
    expect(input.map(c => c.id)).toEqual(['b', 'a']);
  });

  it('treats 0 miles as a real distance, not as missing', () => {
    // 0 is falsy; a truthiness check here would sort "you are standing on it"
    // to the bottom.
    const here = { id: 'here', distanceMi: 0 };
    expect(sortByDistance([far, here]).map(c => c.id)).toEqual(['here', 'b']);
  });
});

// ── hasRealDistance ─────────────────────────────────────────────────────────
// normalizeCourt writes '—' into `distance` when GPS is unavailable, and that
// string is truthy. A plain `court.distance && …` therefore renders a dangling
// separator — which is exactly what shipped on the Home court cards and was
// caught only by loading the screen with the location prompt refused.

describe('hasRealDistance', () => {
  it('accepts a real formatted distance', () => {
    expect(hasRealDistance('0.3 mi')).toBe(true);
    expect(hasRealDistance('< 0.1 mi')).toBe(true);
    expect(hasRealDistance('12.4 mi')).toBe(true);
  });

  it('rejects the em-dash placeholder normalizeCourt writes', () => {
    expect(hasRealDistance('—')).toBe(false);
  });

  it('rejects missing values', () => {
    expect(hasRealDistance(null)).toBe(false);
    expect(hasRealDistance(undefined)).toBe(false);
    expect(hasRealDistance('')).toBe(false);
  });

  it('agrees with what normalizeCourt actually produces', () => {
    // The guard and the code that writes the placeholder must not drift apart,
    // so this asserts against the real output rather than a literal.
    const row = { id: 'c1', name: 'X', address: 'A', city: 'B', lat: 29.7, lng: -95.3 };
    expect(hasRealDistance(normalizeCourt(row, null).distance)).toBe(false);
    expect(hasRealDistance(normalizeCourt(row, { lat: 29.8, lng: -95.4 }).distance)).toBe(true);
  });
});
