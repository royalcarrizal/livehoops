// Tests for the initials-avatar palette.
//
// Two things are worth protecting here. The first is readability: these are
// filled surfaces with text on them, and the palette they are derived from has
// one documented sub-threshold entry, so "derived from accents" is not on its
// own a guarantee. The second is that green stays out — that exclusion is a
// semantic rule, not a taste call, and it is exactly the kind of thing a later
// "let's add more colours" change would undo without noticing.

import { describe, it, expect } from 'vitest';
import { AVATAR_COLORS, avatarColorFor } from '../avatarColors';
import { ACCENTS, contrastRatio } from '../accents';

// Initials are short, bold and large relative to the circle, so 3:1 (the WCAG
// threshold for large text) is the bar — the same one accents.test.js uses.
const MIN_CONTRAST = 3;

describe('AVATAR_COLORS', () => {
  it('carries every accent except green', () => {
    expect(AVATAR_COLORS.map(c => c.id)).toEqual(
      ACCENTS.map(a => a.id).filter(id => id !== 'green')
    );
  });

  it('excludes green, which is reserved for live/active', () => {
    // A green circle behind someone's initials reads as "at a court right now".
    expect(AVATAR_COLORS.some(c => c.id === 'green')).toBe(false);
  });

  it('is a non-empty list of six-digit hex pairs', () => {
    expect(AVATAR_COLORS.length).toBeGreaterThan(0);
    for (const c of AVATAR_COLORS) {
      expect(c.bg,   `${c.id}.bg`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(c.text, `${c.id}.text`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it.each(AVATAR_COLORS)('$id renders legible initials', ({ id, bg, text }) => {
    // No exemptions here, deliberately. accents.test.js skips orange for filled
    // surfaces to preserve the app's existing button appearance; an avatar is a
    // new surface with no such history, so it has to clear the bar on merit.
    const ratio = contrastRatio(text, bg);
    expect(ratio, `${id} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});

describe('avatarColorFor', () => {
  it('is stable — the same initials always give the same colour', () => {
    expect(avatarColorFor('RC')).toEqual(avatarColorFor('RC'));
  });

  it('always returns a colour from the palette', () => {
    for (const initials of ['', 'A', 'RC', 'ZZ', '??', '🏀', 'abc']) {
      expect(AVATAR_COLORS).toContainEqual(avatarColorFor(initials));
    }
  });

  it('handles a missing argument without throwing', () => {
    // Avatar defaults initials to '?', but callers pass through DB values that
    // can be null, and an avatar must never be the thing that breaks a list.
    expect(() => avatarColorFor()).not.toThrow();
    expect(AVATAR_COLORS).toContainEqual(avatarColorFor());
  });

  it('spreads common initials across more than one colour', () => {
    // Guards against a hash that collapses everything onto one entry — which
    // would pass every other test here while making the palette pointless.
    const seen = new Set(
      ['RC', 'KM', 'DR', 'JT', 'MB', 'AV', 'ZQ'].map(i => avatarColorFor(i).id)
    );
    expect(seen.size).toBeGreaterThan(1);
  });
});
