// Tests for the court helpers: distance math, distance formatting,
// lighting normalization, and the DB-row → UI-shape transform.

import { describe, it, expect } from 'vitest';
import { haversine, formatMiles, normalizeLighting, normalizeCourt } from '../useCourts';

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

  it('defaults missing counts safely', () => {
    const sparse = normalizeCourt({ ...row, player_count: null, courts: null });
    expect(sparse.players).toBe(0);
    expect(sparse.courts).toBe(1);
  });
});
