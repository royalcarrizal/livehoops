// Tests for the auto check-out limit.
//
// Two properties matter here, and both fail silently rather than loudly.
//
// 1. The fallback must never be "no limit". Whenever the real value is
//    unknown, the safe direction is to expire the session — an unexpired one
//    is the ghost player the whole expiry mechanism exists to prevent.
//
// 2. expiredDurationMinutes() must agree with what the SQL function computes
//    for the same session. That number becomes hours_played. Getting it wrong
//    throws nothing; it just quietly writes bad stats forever.

import { describe, it, expect } from 'vitest';
import {
  AUTO_CHECKOUT_OPTIONS,
  DEFAULT_AUTO_CHECKOUT_HOURS,
  normalizeAutoCheckoutHours,
  autoCheckoutMs,
  expiredDurationMinutes,
  autoCheckoutLabel,
  remainingMs,
} from '../autoCheckout';

const HOUR_MS = 60 * 60 * 1000;

describe('the option set', () => {
  it('matches the check constraint in configurable_auto_checkout.sql', () => {
    expect(AUTO_CHECKOUT_OPTIONS).toEqual([1, 2, 3]);
  });

  it('offers no "never" option', () => {
    // A session that never expires is precisely the ghost player
    // livehoops_expire_stale_checkins() was written to prevent.
    expect(AUTO_CHECKOUT_OPTIONS).not.toContain(0);
    expect(AUTO_CHECKOUT_OPTIONS.every(h => h > 0)).toBe(true);
  });

  it('defaults to the limit every existing row already behaves like', () => {
    expect(DEFAULT_AUTO_CHECKOUT_HOURS).toBe(3);
  });
});

describe('normalizeAutoCheckoutHours', () => {
  it('passes through each allowed value', () => {
    for (const h of AUTO_CHECKOUT_OPTIONS) {
      expect(normalizeAutoCheckoutHours(h)).toBe(h);
    }
  });

  it('falls back rather than trusting anything outside the set', () => {
    expect(normalizeAutoCheckoutHours(0)).toBe(3);
    expect(normalizeAutoCheckoutHours(4)).toBe(3);
    expect(normalizeAutoCheckoutHours(-1)).toBe(3);
    expect(normalizeAutoCheckoutHours(2.5)).toBe(3);
  });

  it('falls back for null, undefined and junk', () => {
    // undefined is the realistic one: the column does not exist yet.
    expect(normalizeAutoCheckoutHours(undefined)).toBe(3);
    expect(normalizeAutoCheckoutHours(null)).toBe(3);
    expect(normalizeAutoCheckoutHours('')).toBe(3);
    expect(normalizeAutoCheckoutHours('abc')).toBe(3);
    expect(normalizeAutoCheckoutHours(NaN)).toBe(3);
    expect(normalizeAutoCheckoutHours(Infinity)).toBe(3);
  });

  it('accepts a numeric string, since Postgres may return one', () => {
    expect(normalizeAutoCheckoutHours('2')).toBe(2);
  });
});

describe('autoCheckoutMs', () => {
  it('converts each option to milliseconds', () => {
    expect(autoCheckoutMs({ auto_checkout_hours: 1 })).toBe(HOUR_MS);
    expect(autoCheckoutMs({ auto_checkout_hours: 2 })).toBe(2 * HOUR_MS);
    expect(autoCheckoutMs({ auto_checkout_hours: 3 })).toBe(3 * HOUR_MS);
  });

  it('returns the 3h default when the column does not exist yet', () => {
    // The pre-migration state: select('*') simply has no such key.
    expect(autoCheckoutMs({ username: 'royxl' })).toBe(3 * HOUR_MS);
  });

  it('returns the 3h default when the profile has not loaded', () => {
    expect(autoCheckoutMs(null)).toBe(3 * HOUR_MS);
    expect(autoCheckoutMs(undefined)).toBe(3 * HOUR_MS);
  });

  it('never returns zero, NaN or Infinity', () => {
    // Zero would expire every session instantly; NaN compares false against
    // everything, silently disabling client-side expiry altogether.
    for (const bad of [null, undefined, NaN, Infinity, 0, -5, 'abc', {}]) {
      const ms = autoCheckoutMs({ auto_checkout_hours: bad });
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThan(0);
    }
  });
});

describe('expiredDurationMinutes', () => {
  it('agrees with the SQL function: limit_hours * 60', () => {
    // This is the number that becomes hours_played. If these drift, the
    // client and the cron job disagree about how long the same session ran.
    expect(expiredDurationMinutes(1)).toBe(60);
    expect(expiredDurationMinutes(2)).toBe(120);
    expect(expiredDurationMinutes(3)).toBe(180);
  });

  it('is not hardcoded to the old 180', () => {
    // The specific regression to guard: the previous function recorded a flat
    // 180 minutes for every expired session regardless of duration.
    expect(expiredDurationMinutes(1)).not.toBe(180);
  });

  it('falls back to the 3h duration for an unknown value', () => {
    expect(expiredDurationMinutes(undefined)).toBe(180);
  });
});

describe('autoCheckoutLabel', () => {
  it('renders the Settings label', () => {
    expect(autoCheckoutLabel(1)).toBe('1h');
    expect(autoCheckoutLabel(3)).toBe('3h');
  });

  it('shows the default rather than a blank for an unknown value', () => {
    expect(autoCheckoutLabel(undefined)).toBe('3h');
  });
});

// ── remainingMs ─────────────────────────────────────────────────────────────
// The countdown the Check screen shows. It used to be computed inline against
// a hardcoded three hours, which was right for the default and wrong for
// everyone who changed the setting — the screen told a 1h player they had
// 2h 47m left while their session ended in 47 minutes.

describe('remainingMs', () => {
  const HOUR = 3600000;
  const NOW = 1_700_000_000_000;

  it('counts down from the profile\'s own limit, not a fixed three hours', () => {
    // Checked in 10 minutes ago. What is left depends entirely on the setting.
    const checkedInAt = NOW - 10 * 60000;
    expect(remainingMs(checkedInAt, { auto_checkout_hours: 1 }, NOW)).toBe(HOUR - 10 * 60000);
    expect(remainingMs(checkedInAt, { auto_checkout_hours: 2 }, NOW)).toBe(2 * HOUR - 10 * 60000);
    expect(remainingMs(checkedInAt, { auto_checkout_hours: 3 }, NOW)).toBe(3 * HOUR - 10 * 60000);
  });

  it('is the bug it replaces: a 1h session is not 3h', () => {
    // The exact case that shipped. 13 minutes into a 1-hour session the old
    // code said 2h 47m; the truth is 47m.
    const checkedInAt = NOW - 13 * 60000;
    const left = remainingMs(checkedInAt, { auto_checkout_hours: 1 }, NOW);
    expect(Math.round(left / 60000)).toBe(47);
    expect(Math.round(left / 60000)).not.toBe(167); // 2h 47m
  });

  it('falls back to the default limit when the profile is unknown', () => {
    // Profile still loading, or the column not yet added.
    const checkedInAt = NOW;
    expect(remainingMs(checkedInAt, null, NOW)).toBe(DEFAULT_AUTO_CHECKOUT_HOURS * HOUR);
    expect(remainingMs(checkedInAt, {}, NOW)).toBe(DEFAULT_AUTO_CHECKOUT_HOURS * HOUR);
  });

  it('clamps an overdue session at zero rather than going negative', () => {
    // The expiry job runs every five minutes, so a session can sit past its
    // limit briefly. "-4m remaining" is not a thing.
    expect(remainingMs(NOW - 5 * HOUR, { auto_checkout_hours: 3 }, NOW)).toBe(0);
  });

  it('returns zero for a missing or invalid check-in time', () => {
    expect(remainingMs(null, { auto_checkout_hours: 3 }, NOW)).toBe(0);
    expect(remainingMs(NaN, { auto_checkout_hours: 3 }, NOW)).toBe(0);
  });

  it('agrees with the limit the server will enforce', () => {
    // remainingMs and expiredDurationMinutes must describe the same session,
    // or the countdown and the recorded hours_played disagree.
    [1, 2, 3].forEach(hours => {
      const total = remainingMs(NOW, { auto_checkout_hours: hours }, NOW);
      expect(total / 60000).toBe(expiredDurationMinutes(hours));
    });
  });
});
