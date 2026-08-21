// Tests for the bio 120-character rule.
//
// The property that matters is that the client and Postgres agree on what
// "120 characters" means. They count differently by default — JavaScript's
// String.length counts UTF-16 code units, Postgres char_length() counts
// characters — so a bio of 120 emoji would pass a naive client check at 240
// .length and then be rejected by the database constraint. Worse, slicing on
// .length can cut an emoji in half and store a lone surrogate.

import { describe, it, expect } from 'vitest';
import { bioLength, clampBio, normalizeBio, BIO_MAX_LENGTH } from '../bio';

const HOOP = '🏀'; // one character, two UTF-16 code units

describe('bioLength', () => {
  it('counts plain characters', () => {
    expect(bioLength('Brooklyn runs')).toBe(13);
  });

  it('counts an emoji as one character, the way Postgres does', () => {
    expect(HOOP.length).toBe(2);      // what JavaScript thinks
    expect(bioLength(HOOP)).toBe(1);  // what the database will think
  });

  it('treats null, undefined and empty as zero', () => {
    expect(bioLength('')).toBe(0);
    expect(bioLength(null)).toBe(0);
    expect(bioLength(undefined)).toBe(0);
  });
});

describe('clampBio', () => {
  it('leaves a bio at the limit untouched', () => {
    const exact = 'x'.repeat(BIO_MAX_LENGTH);
    expect(clampBio(exact)).toBe(exact);
    expect(bioLength(clampBio(exact))).toBe(BIO_MAX_LENGTH);
  });

  it('cuts an over-long paste down to the limit', () => {
    expect(bioLength(clampBio('x'.repeat(500)))).toBe(BIO_MAX_LENGTH);
  });

  it('never splits an emoji in half', () => {
    // 121 hoops: one over the limit, and every character is a surrogate pair.
    const clamped = clampBio(HOOP.repeat(BIO_MAX_LENGTH + 1));
    expect(bioLength(clamped)).toBe(BIO_MAX_LENGTH);
    // A split surrogate would leave an unpaired code unit behind.
    expect(clamped).toBe(HOOP.repeat(BIO_MAX_LENGTH));
    expect(/[\uD800-\uDFFF]/.test(clamped.replace(/\p{Emoji_Presentation}/gu, ''))).toBe(false);
  });

  it('accepts a bio of 120 emoji, which a .length check would wrongly reject', () => {
    const allHoops = HOOP.repeat(BIO_MAX_LENGTH);
    expect(allHoops.length).toBe(BIO_MAX_LENGTH * 2); // naive count says 240
    expect(clampBio(allHoops)).toBe(allHoops);        // but it is legal
  });

  it('returns empty for falsy input', () => {
    expect(clampBio('')).toBe('');
    expect(clampBio(null)).toBe('');
  });
});

describe('normalizeBio', () => {
  it('stores a real bio trimmed', () => {
    expect(normalizeBio('  Brooklyn runs, mostly nights.  ')).toBe(
      'Brooklyn runs, mostly nights.'
    );
  });

  it('turns blank into null so "not set" is one state, not two', () => {
    expect(normalizeBio('')).toBeNull();
    expect(normalizeBio('   ')).toBeNull();
    expect(normalizeBio('\n\t ')).toBeNull();
    expect(normalizeBio(null)).toBeNull();
  });

  it('still clamps after trimming', () => {
    expect(bioLength(normalizeBio('  ' + 'x'.repeat(500) + '  '))).toBe(BIO_MAX_LENGTH);
  });
});
