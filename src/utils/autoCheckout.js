// src/utils/autoCheckout.js
//
// How long a check-in lasts before it expires on its own.
//
// WHY THIS IS A MODULE WITH TESTS
// The limit is enforced in three places that must agree, and they cannot see
// each other:
//
//   1. this file, used by useCheckIn on the checked-in user's own device
//   2. livehoops_expire_stale_checkins(), a SECURITY DEFINER function
//   3. the pg_cron job that calls it every five minutes
//
// The dangerous part is not the expiry itself — it is the *duration* written
// alongside it. When a session expires, the function records how long it ran
// and adds that to the player's lifetime hours_played. Get the arithmetic
// wrong and nothing throws: rows are written happily, and every expired
// session from then on contributes the wrong number of hours to a stat the
// app displays and the achievements read. It is silent, cumulative, and only
// visible long after the fact.
//
// So the arithmetic lives here, in one named place, with tests pinning it.

// The options offered in Settings. Deliberately a closed set, mirrored by a
// `check (auto_checkout_hours in (1, 2, 3))` constraint in
// supabase/configurable_auto_checkout.sql — an out-of-range value should be
// impossible rather than merely unlikely.
//
// There is no "Never". A session that never expires is exactly the ghost
// player the expiry job was written to prevent: the court's live count stays
// inflated forever and everyone else sees a game that is not happening.
export const AUTO_CHECKOUT_OPTIONS = [1, 2, 3];

// What every existing row already behaves like, and the fallback whenever the
// real value is unknown — profile still loading, column not yet added, or a
// value that somehow escaped the constraint.
//
// Never fall back to "no limit". If this value is ever in doubt, the safe
// direction is to expire the session, not to leave it open.
export const DEFAULT_AUTO_CHECKOUT_HOURS = 3;

/**
 * Coerce a stored value into one of the allowed options.
 *
 * @param {unknown} value
 * @returns {number} one of AUTO_CHECKOUT_OPTIONS
 */
export function normalizeAutoCheckoutHours(value) {
  const hours = Number(value);
  if (!Number.isInteger(hours)) return DEFAULT_AUTO_CHECKOUT_HOURS;
  if (!AUTO_CHECKOUT_OPTIONS.includes(hours)) return DEFAULT_AUTO_CHECKOUT_HOURS;
  return hours;
}

/**
 * The limit for a given profile, in milliseconds — what useCheckIn compares
 * elapsed time against.
 *
 * Accepts a whole profile rather than a number so callers cannot accidentally
 * pass `undefined` from a column that does not exist yet and get NaN, which
 * would compare false against everything and silently disable client-side
 * expiry altogether.
 *
 * @param {object|null|undefined} profile
 * @returns {number} milliseconds
 */
export function autoCheckoutMs(profile) {
  return normalizeAutoCheckoutHours(profile?.auto_checkout_hours) * 60 * 60 * 1000;
}

/**
 * Minutes to record for a session that ran to its limit.
 *
 * This is the number that becomes hours_played. It must match what
 * livehoops_expire_stale_checkins() computes for the same session —
 * `v_duration_minutes := limit_hours * 60` — or the client and the cron job
 * will disagree about how long the same check-in lasted.
 *
 * @param {number} hours
 * @returns {number} minutes
 */
export function expiredDurationMinutes(hours) {
  return normalizeAutoCheckoutHours(hours) * 60;
}

/**
 * Label for the Settings control.
 * @param {number} hours
 * @returns {string}
 */
export function autoCheckoutLabel(hours) {
  return `${normalizeAutoCheckoutHours(hours)}h`;
}

/**
 * Milliseconds left in a session before it expires on its own.
 *
 * This lives here rather than in the screen that displays it for the same
 * reason everything else in this file does: the number has to agree with the
 * limit the server will actually enforce. CheckInScreen used to compute it
 * inline against a hardcoded three hours —
 *
 *     const expiresAt = checkInTime + 3 * 60 * 60 * 1000;
 *
 * — which was right for the default and wrong for everyone else. A player who
 * set 1h in Settings was told they had 2h 47m left while the session ended in
 * 47 minutes. Nothing threw; the screen simply lied.
 *
 * Clamped at zero: a session past its limit has no negative time left, it has
 * none. The expiry job may not have swept it yet.
 *
 * @param {number} checkedInAtMs  Date.getTime() of the check-in
 * @param {object|null} profile   the viewer's profile, for their own limit
 * @param {number} now            injectable clock, for tests
 * @returns {number} milliseconds remaining, never below 0
 */
export function remainingMs(checkedInAtMs, profile, now = Date.now()) {
  if (!Number.isFinite(checkedInAtMs)) return 0;
  return Math.max(0, checkedInAtMs + autoCheckoutMs(profile) - now);
}
