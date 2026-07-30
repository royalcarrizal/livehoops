import { describe, expect, it, vi } from 'vitest';
import {
  buildCheckInSharePayload,
  buildCheckInShareUrl,
  getSafeCheckInShareRedirect,
  getSharedCourtDestination,
  normalizePublicAppUrl,
  parseCheckInSharePath,
  shareCheckInLink,
} from '../checkInShare';

const TOKEN = '123e4567-e89b-42d3-a456-426614174000';

describe('check-in share routes', () => {
  it('parses canonical routes and one trailing slash', () => {
    expect(parseCheckInSharePath(`/check-ins/${TOKEN}`)).toEqual({ token: TOKEN, invalid: false });
    expect(parseCheckInSharePath(`/check-ins/${TOKEN}/`)).toEqual({ token: TOKEN, invalid: false });
  });

  it('rejects malformed tokens and extra path segments as share routes', () => {
    expect(parseCheckInSharePath('/check-ins')).toEqual({ token: null, invalid: true });
    expect(parseCheckInSharePath('/check-ins/')).toEqual({ token: null, invalid: true });
    expect(parseCheckInSharePath('/check-ins/not-a-token')).toEqual({ token: null, invalid: true });
    expect(parseCheckInSharePath(`/check-ins/${TOKEN}/extra`)).toEqual({ token: null, invalid: true });
    expect(parseCheckInSharePath('/profile')).toBeNull();
  });

  it('builds a canonical link and requires a production origin', () => {
    expect(buildCheckInShareUrl(TOKEN, {
      configuredUrl: 'https://livehoops.example',
      runtimeOrigin: 'http://localhost:5173',
      isProduction: true,
    })).toBe(`https://livehoops.example/check-ins/${TOKEN}`);

    expect(() => normalizePublicAppUrl({
      runtimeOrigin: 'http://localhost:5173',
      isProduction: true,
    })).toThrow('not configured');
  });

  it('rejects configured URLs with paths or unsafe auth redirects', () => {
    expect(() => normalizePublicAppUrl({ configuredUrl: 'https://livehoops.example/app' })).toThrow('origin');
    expect(getSafeCheckInShareRedirect(
      `https://evil.example/check-ins/${TOKEN}`,
      'https://livehoops.example',
    )).toBeNull();
    expect(getSafeCheckInShareRedirect(
      `https://livehoops.example/check-ins/${TOKEN}?next=evil`,
      'https://livehoops.example',
    )).toBeNull();
    expect(getSafeCheckInShareRedirect(
      `https://livehoops.example/check-ins/${TOKEN}`,
      'https://livehoops.example',
    )).toBe(`https://livehoops.example/check-ins/${TOKEN}`);
  });
});

describe('check-in sharing behavior', () => {
  const payload = buildCheckInSharePayload('Wortham Park', `https://livehoops.example/check-ins/${TOKEN}`);

  it('builds the approved share copy', () => {
    expect(payload).toEqual({
      title: 'Join me on LiveHoops',
      text: 'I’m checked in at Wortham Park — find the run on LiveHoops.',
      url: `https://livehoops.example/check-ins/${TOKEN}`,
    });
  });

  it('uses native share when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeClipboard = vi.fn();
    await expect(shareCheckInLink({ payload, share, writeClipboard })).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith(payload);
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it('treats native cancellation silently', async () => {
    const error = new Error('cancelled');
    error.name = 'AbortError';
    const writeClipboard = vi.fn();
    await expect(shareCheckInLink({
      payload,
      share: vi.fn().mockRejectedValue(error),
      writeClipboard,
    })).resolves.toBe('cancelled');
    expect(writeClipboard).not.toHaveBeenCalled();
  });

  it('falls back to clipboard and then manual copy', async () => {
    const writeClipboard = vi.fn().mockResolvedValue(undefined);
    await expect(shareCheckInLink({ payload, writeClipboard })).resolves.toBe('copied');
    expect(writeClipboard).toHaveBeenCalledWith(payload.url);

    await expect(shareCheckInLink({
      payload,
      share: vi.fn().mockRejectedValue(new Error('failed')),
      writeClipboard: vi.fn().mockRejectedValue(new Error('denied')),
    })).resolves.toBe('manual');
  });

  it('only returns destinations for valid live or ended shares', () => {
    expect(getSharedCourtDestination({ state: 'live', court_id: 'court-1' })).toBe('court-1');
    expect(getSharedCourtDestination({ state: 'ended', court_id: 'court-2' })).toBe('court-2');
    expect(getSharedCourtDestination({ state: 'unavailable', court_id: 'court-3' })).toBeNull();
  });
});
