// Tests for the retry helper.
//
// The behaviour worth pinning is the awkward half: that an exhausted retry
// returns the last failure rather than throwing or returning undefined, that
// nothing sleeps after the final attempt, and that a non-retryable result stops
// immediately. Those are the parts a well-meaning refactor gets wrong.
//
// Every test injects its own `sleep`, so these run in microseconds and assert
// the delays directly instead of waiting for them.

import { describe, it, expect, vi } from 'vitest';
import { withRetry, delayFor, sleep } from '../retry';

// Records what it was asked to wait for, without waiting.
const spySleep = () => {
  const calls = [];
  const fn = async (ms) => { calls.push(ms); };
  fn.calls = calls;
  return fn;
};

const failure = { data: null, error: { message: 'JWT issued at future' } };
const success = { data: [], error: null };
const retryOnError = (r) => !!r.error;

describe('delayFor', () => {
  it('doubles each attempt from the base delay', () => {
    expect(delayFor(1)).toBe(250);
    expect(delayFor(2)).toBe(500);
    expect(delayFor(3)).toBe(1000);
  });

  it('honours a custom base', () => {
    expect(delayFor(1, 10)).toBe(10);
    expect(delayFor(3, 10)).toBe(40);
  });
});

describe('withRetry', () => {
  it('calls once and returns when the first attempt succeeds', async () => {
    const fn = vi.fn().mockResolvedValue(success);
    const s = spySleep();
    const result = await withRetry(fn, { shouldRetry: retryOnError, sleep: s });
    expect(result).toBe(success);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.calls).toEqual([]);
  });

  it('retries past a transient failure and returns the eventual success', async () => {
    // The real scenario: first call loses the startup race, second one wins.
    const fn = vi.fn()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce(success);
    const s = spySleep();
    const result = await withRetry(fn, { shouldRetry: retryOnError, sleep: s });
    expect(result).toBe(success);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(s.calls).toEqual([250]);
  });

  it('returns the last failure when every attempt fails', async () => {
    // Explicitly NOT throwing, and explicitly not undefined — the caller needs
    // the error in hand to decide what to show.
    const fn = vi.fn().mockResolvedValue(failure);
    const s = spySleep();
    const result = await withRetry(fn, { shouldRetry: retryOnError, sleep: s });
    expect(result).toBe(failure);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not sleep after the final attempt', async () => {
    // Three attempts means two gaps. A trailing sleep would delay the caller's
    // failure handling for no reason at all.
    const fn = vi.fn().mockResolvedValue(failure);
    const s = spySleep();
    await withRetry(fn, { shouldRetry: retryOnError, sleep: s });
    expect(s.calls).toEqual([250, 500]);
  });

  it('never retries when shouldRetry is omitted', async () => {
    const fn = vi.fn().mockResolvedValue(failure);
    const s = spySleep();
    const result = await withRetry(fn, { sleep: s });
    expect(result).toBe(failure);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects a custom attempt count and base delay', async () => {
    const fn = vi.fn().mockResolvedValue(failure);
    const s = spySleep();
    await withRetry(fn, { attempts: 4, baseDelayMs: 10, shouldRetry: retryOnError, sleep: s });
    expect(fn).toHaveBeenCalledTimes(4);
    expect(s.calls).toEqual([10, 20, 40]);
  });

  it('passes the attempt number to fn', async () => {
    const seen = [];
    const fn = vi.fn(async (attempt) => { seen.push(attempt); return failure; });
    await withRetry(fn, { shouldRetry: retryOnError, sleep: spySleep() });
    expect(seen).toEqual([1, 2, 3]);
  });

  it('still calls fn once when handed a nonsense attempt count', async () => {
    // A caller computing attempts from config can produce 0 or NaN; "retry zero
    // times" still has to mean "call it once", not "never call it".
    for (const attempts of [0, -1, NaN, undefined]) {
      const fn = vi.fn().mockResolvedValue(failure);
      await withRetry(fn, { attempts, shouldRetry: retryOnError, sleep: spySleep() });
      expect(fn, `attempts=${attempts}`).toHaveBeenCalledTimes(attempts === undefined ? 3 : 1);
    }
  });

  it('exports a real sleep that actually waits', async () => {
    const t0 = Date.now();
    await sleep(15);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(10);
  });
});
