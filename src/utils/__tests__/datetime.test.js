// Tests for formatMeetupTime — the future-facing label for scheduled runs.
// `now` is injected so every case is deterministic.

import { describe, it, expect } from 'vitest';
import { formatMeetupTime, formatRunLength, formatClockShort, formatElapsed, formatJoinMonth } from '../datetime';

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

// ── formatRunLength ─────────────────────────────────────────────────────────
// The label on a run card's second line ("6:30p · 2h"). No clock involved, so
// nothing needs injecting.

describe('formatRunLength', () => {
  it('returns empty string rather than a length for missing/invalid input', () => {
    // Runs created before the duration column existed have no length. They
    // must render without one, not as "NaNm".
    expect(formatRunLength(null)).toBe('');
    expect(formatRunLength(undefined)).toBe('');
    expect(formatRunLength('abc')).toBe('');
    expect(formatRunLength(0)).toBe('');
    expect(formatRunLength(-30)).toBe('');
  });

  it('uses minutes under an hour', () => {
    expect(formatRunLength(15)).toBe('15m');
    expect(formatRunLength(45)).toBe('45m');
  });

  it('uses whole hours when the length divides evenly', () => {
    expect(formatRunLength(60)).toBe('1h');
    expect(formatRunLength(120)).toBe('2h');
    expect(formatRunLength(480)).toBe('8h');
  });

  it('keeps 90 minutes as "90m", not "1h 30m"', () => {
    // The design asks for this explicitly — a 90-minute run is said as
    // "90 minutes", and it is the app's default length.
    expect(formatRunLength(90)).toBe('90m');
    expect(formatRunLength(75)).toBe('75m');
  });

  it('switches to hours-and-minutes past two hours', () => {
    expect(formatRunLength(150)).toBe('2h 30m');
    expect(formatRunLength(200)).toBe('3h 20m');
  });

  it('accepts a numeric string, as Supabase may return', () => {
    expect(formatRunLength('120')).toBe('2h');
  });
});

// ── formatClockShort ────────────────────────────────────────────────────────
// The compact time on a run card, sitting next to its length ("6:30p · 2h").
// Built from local-time components, so the fixtures are local-time strings.

describe('formatClockShort', () => {
  it('returns empty string for missing/invalid input', () => {
    expect(formatClockShort(null)).toBe('');
    expect(formatClockShort('not-a-date')).toBe('');
  });

  it('formats afternoon times with a p suffix', () => {
    expect(formatClockShort('2026-07-17T18:30:00')).toBe('6:30p');
  });

  it('formats morning times with an a suffix', () => {
    expect(formatClockShort('2026-07-18T10:00:00')).toBe('10:00a');
  });

  it('pads minutes', () => {
    expect(formatClockShort('2026-07-18T09:05:00')).toBe('9:05a');
  });

  it('handles both noon and midnight as 12, not 0', () => {
    // The classic off-by-twelve: hours % 12 is 0 for both, which would print
    // "0:00p" and "0:00a".
    expect(formatClockShort('2026-07-18T12:00:00')).toBe('12:00p');
    expect(formatClockShort('2026-07-18T00:00:00')).toBe('12:00a');
  });
});

// ── formatElapsed ───────────────────────────────────────────────────────────
// How long a session has been running. `now` is injected so every case is
// deterministic.

describe('formatElapsed', () => {
  const NOW = 1_700_000_000_000;
  const agoMin = (m) => NOW - m * 60000;

  it('returns empty string for missing or invalid input', () => {
    // A friend who has never checked in has no timestamp at all — the row must
    // render nothing rather than "NaNm".
    expect(formatElapsed(null, NOW)).toBe('');
    expect(formatElapsed(undefined, NOW)).toBe('');
    expect(formatElapsed('not-a-date', NOW)).toBe('');
  });

  it('says "Just now" under a minute', () => {
    expect(formatElapsed(NOW, NOW)).toBe('Just now');
    expect(formatElapsed(agoMin(0.5), NOW)).toBe('Just now');
  });

  it('counts minutes under an hour', () => {
    expect(formatElapsed(agoMin(1), NOW)).toBe('1m');
    expect(formatElapsed(agoMin(40), NOW)).toBe('40m');
    expect(formatElapsed(agoMin(59), NOW)).toBe('59m');
  });

  it('switches to hours and minutes past an hour', () => {
    expect(formatElapsed(agoMin(60), NOW)).toBe('1h');
    expect(formatElapsed(agoMin(72), NOW)).toBe('1h 12m');
    expect(formatElapsed(agoMin(180), NOW)).toBe('3h');
  });

  it('accepts an ISO string, as Supabase returns', () => {
    // The RPC hands back timestamptz, which arrives as a string.
    const iso = new Date(agoMin(40)).toISOString();
    expect(formatElapsed(iso, NOW)).toBe('40m');
  });

  it('returns empty rather than a negative duration for a future timestamp', () => {
    // Clock skew between the device and the server is real, and "-3m" on a
    // crew row would be worse than showing nothing.
    expect(formatElapsed(NOW + 180000, NOW)).toBe('');
  });
});

// ── formatJoinMonth ─────────────────────────────────────────────────────────
// "joined Mar 2024" on the Profile header.

describe('formatJoinMonth', () => {
  it('returns empty string rather than a date for missing input', () => {
    // A profile row without created_at would otherwise render "joined Invalid
    // Date" — the same failure formatElapsed had with a never-checked-in friend.
    expect(formatJoinMonth(null)).toBe('');
    expect(formatJoinMonth(undefined)).toBe('');
    expect(formatJoinMonth('')).toBe('');
  });

  it('returns empty string for an unparseable value', () => {
    expect(formatJoinMonth('not-a-date')).toBe('');
  });

  it('formats a real timestamp as month and year', () => {
    expect(formatJoinMonth('2024-03-18T09:30:00Z')).toBe('Mar 2024');
  });

  it('accepts the timestamptz Supabase actually returns', () => {
    // The shape from profiles.created_at, offset and microseconds included.
    expect(formatJoinMonth('2026-04-12T23:18:13.014123+00:00')).toBe('Apr 2026');
  });

  it('says nothing more precise than the month', () => {
    // Not "12 Apr 2026" — an exact join date is personal data with no upside
    // on a profile, and two people joining the same month should read alike.
    // Exactly "Mon YYYY" and nothing else — which is what rules out a day of
    // the month. (A bare /\d{1,2}/ would not: it matches inside "2026".)
    expect(formatJoinMonth('2026-04-12T23:18:13Z')).toBe('Apr 2026');
    expect(formatJoinMonth('2026-04-12T23:18:13Z')).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
  });
});
