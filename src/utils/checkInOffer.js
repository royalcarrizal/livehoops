// src/utils/checkInOffer.js
//
// Decides whether — and how — to offer a check-in alongside a post.
//
// Tagging a court in a post used to be purely cosmetic: the post was saved with
// type 'checkin' but nothing put the user on the map. This is the rule that
// turns the tag into a real offer.
//
// It lives here, apart from the components, for one reason: checking in has
// consequences that are hard to take back. It bumps the court's live player
// count — the number the whole app is built on — and pushes a notification to
// every friend who opted into court alerts. A check-in nobody meant to make is
// the failure that matters, so the rule deciding when to pre-arm the toggle is
// worth testing directly rather than through a rendered component.

// How close the user has to be for the offer to arm itself. 0.2 mi ≈ 320 m —
// comfortably outside typical phone GPS error, tight enough that it means
// "at this court" rather than "in this neighbourhood".
export const NEARBY_CHECKIN_RADIUS_MI = 0.2;

/**
 * @param {object|null} court         — the tagged court (needs id + distanceMi)
 * @param {object|null} activeCheckIn — the user's current check-in, or null
 * @param {number} [radiusMi]         — override for the nearby threshold
 * @returns {null | { kind: 'checkin'|'switch'|'already', nearby: boolean, defaultOn: boolean }}
 *
 *   null       — no court tagged, nothing to offer
 *   'checkin'  — not checked in anywhere; offer a plain check-in
 *   'switch'   — checked in at a DIFFERENT court; offer to move. The
 *                livehoops_check_in RPC closes the old check-in and opens the
 *                new one in a single atomic step, so this is one tap, not two.
 *   'already'  — already checked in at this very court; show a confirmation,
 *                not an offer. Never armed, since there's nothing to do.
 *
 *   nearby     — GPS puts the user inside the radius
 *   defaultOn  — whether the toggle should start switched on
 */
export function checkInOffer(court, activeCheckIn, radiusMi = NEARBY_CHECKIN_RADIUS_MI) {
  if (!court?.id) return null;

  // Number.isFinite, not `typeof === 'number'`: distanceMi is null when the
  // user denied location access, and NaN would sneak past a typeof check. Both
  // must read as "not nearby" — an unknown distance is never permission to
  // arm a check-in on someone's behalf.
  const nearby = Number.isFinite(court.distanceMi) && court.distanceMi <= radiusMi;

  if (activeCheckIn?.courtId === court.id) {
    return { kind: 'already', nearby, defaultOn: false };
  }

  return {
    kind: activeCheckIn ? 'switch' : 'checkin',
    nearby,
    defaultOn: nearby,
  };
}

/**
 * The label shown next to the toggle. Kept beside the rule it describes so the
 * wording can't drift out of sync with the state it's describing.
 */
export function checkInOfferLabel(offer, courtName) {
  if (!offer) return '';
  switch (offer.kind) {
    case 'already': return `You're checked in at ${courtName}`;
    case 'switch':  return `Switch your check-in to ${courtName}`;
    default:        return `Check in at ${courtName}`;
  }
}
