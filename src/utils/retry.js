// src/utils/retry.js
//
// Retry a call that can fail transiently.
//
// Written for a specific failure this app actually hits: the blocked-list fetch
// is one of the first authenticated calls after a session is established, and
// at that instant Supabase can reject a perfectly valid token with 401 "JWT
// issued at future" — a brief disagreement between its auth and API layers. The
// identical query succeeds a moment later. See useBlockedUsers.js.
//
// Two design notes, both driven by how Supabase behaves:
//
//   `shouldRetry` rather than catch. supabase-js resolves with `{ data, error }`
//   instead of throwing, so "did this fail?" is a question about the resolved
//   value, not about an exception. Callers pass `r => !!r.error`.
//
//   `sleep` is injectable. It is the only impure part of this module, so taking
//   it as an argument is what lets the tests run instantly and deterministically
//   without fake timers.

/** Real delay. The default; tests pass their own. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exponential backoff: 250ms, 500ms, 1000ms, …
 *
 * No jitter, deliberately. Jitter exists to stop many clients retrying in
 * lockstep, and this runs once per user on their own device — there is no herd
 * to disperse, and leaving it out keeps the delays exactly predictable in tests.
 */
export function delayFor(attempt, baseDelayMs = 250) {
  return baseDelayMs * 2 ** (attempt - 1);
}

/**
 * Call `fn` until it produces a result `shouldRetry` is happy with.
 *
 * Returns the first acceptable result, or the last one if every attempt failed —
 * it does not throw. The caller still has to handle failure, because a retry
 * makes a transient failure unlikely, not impossible; the point is that the
 * caller gets to decide, rather than a single unlucky moment deciding for it.
 *
 * @param fn                    called with the 1-based attempt number
 * @param opts.attempts         total tries, including the first (default 3)
 * @param opts.baseDelayMs      first backoff delay (default 250)
 * @param opts.shouldRetry      (result, attempt) => boolean; default never retries
 * @param opts.sleep            delay function; default the real one
 */
export async function withRetry(fn, {
  attempts = 3,
  baseDelayMs = 250,
  shouldRetry = () => false,
  sleep: sleepFn = sleep,
} = {}) {
  // A caller computing this from config could hand us 0 or NaN; one attempt is
  // the only sane floor, since "retry zero times" still means "call it once".
  const total = Number.isFinite(attempts) && attempts >= 1 ? Math.floor(attempts) : 1;

  let result;
  for (let attempt = 1; attempt <= total; attempt++) {
    result = await fn(attempt);
    if (!shouldRetry(result, attempt)) return result;
    // No point sleeping after the final attempt — nothing follows it.
    if (attempt < total) await sleepFn(delayFor(attempt, baseDelayMs));
  }
  return result;
}
