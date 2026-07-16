const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCheckInShareToken(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

// Returns null for ordinary app paths. A path beginning with /check-ins/ is
// treated as a share route even when malformed so the app can show a neutral
// unavailable-link page instead of accidentally falling through to auth/home.
export function parseCheckInSharePath(pathname) {
  if (typeof pathname !== 'string') {
    return null;
  }

  if (pathname === '/check-ins') return { token: null, invalid: true };
  if (!pathname.startsWith('/check-ins/')) return null;

  const match = pathname.match(/^\/check-ins\/([^/]+)\/?$/);
  if (!match) return { token: null, invalid: true };

  let candidate;
  try {
    candidate = decodeURIComponent(match[1]);
  } catch {
    return { token: null, invalid: true };
  }

  return isCheckInShareToken(candidate)
    ? { token: candidate.toLowerCase(), invalid: false }
    : { token: null, invalid: true };
}

export function normalizePublicAppUrl({ configuredUrl, runtimeOrigin, isProduction = false } = {}) {
  const configured = configuredUrl?.trim();
  const candidate = configured || (!isProduction ? runtimeOrigin : '');

  if (!candidate) {
    throw new Error('LiveHoops sharing is not configured yet.');
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('The configured LiveHoops app URL is invalid.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('The configured LiveHoops app URL must use HTTP or HTTPS.');
  }

  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('The configured LiveHoops app URL must be an origin without a path.');
  }

  return parsed.origin;
}

export function buildCheckInShareUrl(token, options = {}) {
  if (!isCheckInShareToken(token)) {
    throw new Error('Cannot create a link for an invalid share token.');
  }

  const origin = normalizePublicAppUrl(options);
  return `${origin}/check-ins/${token.toLowerCase()}`;
}

export function buildCheckInSharePayload(courtName, url) {
  const safeCourtName = courtName?.trim() || 'a court';
  return {
    title: 'Join me on LiveHoops',
    text: `I’m checked in at ${safeCourtName} — find the run on LiveHoops.`,
    url,
  };
}

// The auth redirect is never accepted from a query parameter. App.jsx builds
// it from the current path, and this final check enforces a same-origin,
// well-formed share URL before it reaches Supabase Auth.
export function getSafeCheckInShareRedirect(candidate, expectedOrigin) {
  if (!candidate || !expectedOrigin) return null;

  try {
    const parsed = new URL(candidate);
    const expected = new URL(expectedOrigin);
    const route = parseCheckInSharePath(parsed.pathname);

    if (
      parsed.origin !== expected.origin ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !route ||
      route.invalid
    ) {
      return null;
    }

    return `${parsed.origin}/check-ins/${route.token}`;
  } catch {
    return null;
  }
}

// Browser APIs are passed in so this stays testable in the project's Node-only
// Vitest environment. A cancelled native share is intentionally silent.
export async function shareCheckInLink({ payload, share, writeClipboard }) {
  if (typeof share === 'function') {
    try {
      await share(payload);
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }

  if (typeof writeClipboard === 'function') {
    try {
      await writeClipboard(payload.url);
      return 'copied';
    } catch {
      // The caller will reveal a selectable read-only URL.
    }
  }

  return 'manual';
}

export function getSharedCourtDestination(sharedCheckIn) {
  if (!['live', 'ended'].includes(sharedCheckIn?.state)) return null;
  return sharedCheckIn.court_id || null;
}
