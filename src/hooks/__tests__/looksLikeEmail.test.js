// Tests for looksLikeEmail — decides whether a login identifier is an email
// (sign in directly) or a username (resolve to an email first).

import { describe, it, expect } from 'vitest';
import { looksLikeEmail } from '../useAuth';

describe('looksLikeEmail', () => {
  it('treats anything with an @ as an email', () => {
    expect(looksLikeEmail('royal@example.com')).toBe(true);
    expect(looksLikeEmail('a@b.co')).toBe(true);
  });

  it('treats a plain handle as a username', () => {
    expect(looksLikeEmail('royxl')).toBe(false);
    expect(looksLikeEmail('marcus_w')).toBe(false);
    expect(looksLikeEmail('Royxl23')).toBe(false);
  });

  it('handles empty and non-string input safely', () => {
    expect(looksLikeEmail('')).toBe(false);
    expect(looksLikeEmail(null)).toBe(false);
    expect(looksLikeEmail(undefined)).toBe(false);
  });
});
