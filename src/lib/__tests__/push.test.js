// Tests for the push notification helpers.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase client so sendPush can be exercised without a real backend
// (and without needing env vars to construct the client). Only the
// functions.invoke path push.js uses is stubbed.
const invokeMock = vi.fn();
vi.mock('../supabase', () => ({
  supabase: { functions: { invoke: (...args) => invokeMock(...args) } },
}));

// Imported after the mock is declared (vi.mock is hoisted above imports).
import { preview, sendPush } from '../push';

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

describe('sendPush', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('returns an error without calling the function when args are missing', async () => {
    const result = await sendPush('', '');
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('surfaces the { sent } payload on success', async () => {
    invokeMock.mockResolvedValue({ data: { sent: 1, pruned: 0 }, error: null });
    const result = await sendPush('user-1', 'Hi', 'body', { kind: 'test' });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ sent: 1, pruned: 0 });
  });

  it('coerces the data payload to strings before invoking', async () => {
    invokeMock.mockResolvedValue({ data: { sent: 0 }, error: null });
    await sendPush('user-1', 'Hi', '', { count: 3, kind: 'test' });
    expect(invokeMock).toHaveBeenCalledWith(
      'send-push',
      { body: { user_id: 'user-1', title: 'Hi', body: '', data: { count: '3', kind: 'test' } } },
    );
  });

  it('surfaces a function-level error', async () => {
    invokeMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await sendPush('user-1', 'Hi');
    expect(result.data).toBeNull();
    expect(result.error).toEqual({ message: 'boom' });
  });

  it('resolves (never rejects) to an Error when the invoke throws', async () => {
    invokeMock.mockRejectedValue(new Error('network down'));
    const result = await sendPush('user-1', 'Hi');
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('network down');
  });
});
