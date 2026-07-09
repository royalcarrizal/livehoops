// Tests for toTimeAgo — the "5m ago / 2h ago / 3d ago" feed timestamps.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toTimeAgo } from '../usePosts';

const NOW = new Date('2026-07-08T12:00:00Z');

describe('toTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for missing input', () => {
    expect(toTimeAgo(null)).toBe('');
    expect(toTimeAgo(undefined)).toBe('');
  });

  it('says "Just now" under a minute', () => {
    expect(toTimeAgo('2026-07-08T11:59:30Z')).toBe('Just now');
  });

  it('shows minutes under an hour', () => {
    expect(toTimeAgo('2026-07-08T11:55:00Z')).toBe('5m ago');
    expect(toTimeAgo('2026-07-08T11:01:00Z')).toBe('59m ago');
  });

  it('shows hours under a day', () => {
    expect(toTimeAgo('2026-07-08T10:00:00Z')).toBe('2h ago');
    expect(toTimeAgo('2026-07-07T12:30:00Z')).toBe('23h ago');
  });

  it('shows days under a week', () => {
    expect(toTimeAgo('2026-07-05T12:00:00Z')).toBe('3d ago');
  });

  it('falls back to a short date for older posts', () => {
    // 10 days back → "Jun 28" style
    expect(toTimeAgo('2026-06-28T12:00:00Z')).toMatch(/Jun 28/);
  });
});
