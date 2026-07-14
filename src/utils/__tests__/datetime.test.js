// Tests for formatMeetupTime — the future-facing label for scheduled runs.
// `now` is injected so every case is deterministic.

import { describe, it, expect } from 'vitest';
import { formatMeetupTime } from '../datetime';

// Fixed reference point: Wed Jul 15 2026, 2:00 PM local time.
const NOW = new Date('2026-07-15T14:00:00');

// Build an ISO string a given number of minutes after NOW.
const inMinutes = (m) => new Date(NOW.getTime() + m * 60000).toISOString();

describe('formatMeetupTime', () => {
  it('returns empty string for missing/invalid input', () => {
    expect(formatMeetupTime(null, NOW)).toBe('');
    expect(formatMeetupTime('not-a-date', NOW)).toBe('');
  });

  it('shows "Now" for a run that already started', () => {
    expect(formatMeetupTime(inMinutes(-5), NOW)).toBe('Now');
    expect(formatMeetupTime(inMinutes(0), NOW)).toBe('Now');
  });

  it('counts down when under an hour away', () => {
    expect(formatMeetupTime(inMinutes(1), NOW)).toBe('in 1 min');
    expect(formatMeetupTime(inMinutes(45), NOW)).toBe('in 45 min');
  });

  it('labels later-today runs with a clock time', () => {
    const label = formatMeetupTime(inMinutes(180), NOW); // 5:00 PM same day
    expect(label).toBe('Today 5:00 PM');
  });

  it('labels tomorrow', () => {
    const label = formatMeetupTime('2026-07-16T18:00:00', NOW);
    expect(label).toBe('Tomorrow 6:00 PM');
  });

  it('uses the weekday name within the next week', () => {
    // Sat Jul 18 2026
    const label = formatMeetupTime('2026-07-18T18:00:00', NOW);
    expect(label).toBe('Sat 6:00 PM');
  });

  it('uses a dated label further out', () => {
    // Wed Jul 29 2026 — more than 7 days away
    const label = formatMeetupTime('2026-07-29T18:00:00', NOW);
    expect(label).toBe('Jul 29 · 6:00 PM');
  });
});
