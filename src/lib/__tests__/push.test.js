// Tests for the push notification text helper.

import { describe, it, expect } from 'vitest';
import { preview } from '../push';

describe('preview', () => {
  it('returns empty string for missing text', () => {
    expect(preview(null)).toBe('');
    expect(preview('')).toBe('');
  });

  it('leaves short text unchanged', () => {
    expect(preview('Good run today')).toBe('Good run today');
  });

  it('truncates long text with an ellipsis at the max length', () => {
    const long = 'a'.repeat(200);
    const out = preview(long, 120);
    expect(out.length).toBe(120);
    expect(out.endsWith('…')).toBe(true);
  });

  it('does not truncate text exactly at the limit', () => {
    const exact = 'b'.repeat(120);
    expect(preview(exact, 120)).toBe(exact);
  });
});
