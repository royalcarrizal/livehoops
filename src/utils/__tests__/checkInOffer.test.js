// Tests for checkInOffer — the rule that decides whether tagging a court in a
// post also offers to check the user in, and whether that offer starts armed.
//
// The case that matters most is the negative one: an unintended check-in
// inflates a court's live player count and pings the user's friends, so
// "don't arm this unless we're sure" is the property under test.

import { describe, it, expect } from 'vitest';
import {
  checkInOffer,
  checkInOfferLabel,
  NEARBY_CHECKIN_RADIUS_MI,
} from '../checkInOffer';

const court     = { id: 'court-1', name: 'Wortham Park', distanceMi: 0.05 };
const farCourt  = { ...court, distanceMi: 12 };
const elsewhere = { courtId: 'court-2', courtName: 'Emancipation Park' };
const here      = { courtId: 'court-1', courtName: 'Wortham Park' };

describe('checkInOffer', () => {
  it('offers nothing when no court is tagged', () => {
    expect(checkInOffer(null, null)).toBeNull();
    expect(checkInOffer(undefined, null)).toBeNull();
    expect(checkInOffer({ name: 'no id' }, null)).toBeNull();
  });

  describe('not checked in anywhere', () => {
    it('offers a plain check-in', () => {
      expect(checkInOffer(court, null).kind).toBe('checkin');
    });

    it('arms itself when the user is at the court', () => {
      expect(checkInOffer(court, null)).toMatchObject({ nearby: true, defaultOn: true });
    });

    it('stays off when the user is far away', () => {
      // Tagging a court to ask about it must not check you into it.
      expect(checkInOffer(farCourt, null)).toMatchObject({ nearby: false, defaultOn: false });
    });

    it('treats the radius as inclusive', () => {
      const edge = { ...court, distanceMi: NEARBY_CHECKIN_RADIUS_MI };
      expect(checkInOffer(edge, null).nearby).toBe(true);
    });
  });

  describe('checked in somewhere else', () => {
    it('offers to switch rather than a second check-in', () => {
      expect(checkInOffer(court, elsewhere).kind).toBe('switch');
    });

    it('still respects the nearby rule', () => {
      expect(checkInOffer(court,    elsewhere).defaultOn).toBe(true);
      expect(checkInOffer(farCourt, elsewhere).defaultOn).toBe(false);
    });
  });

  describe('already checked in at this court', () => {
    it('reports it without offering anything to do', () => {
      expect(checkInOffer(court, here)).toMatchObject({ kind: 'already', defaultOn: false });
    });

    it('never arms, even standing right there', () => {
      // There is nothing to perform — arming it would re-check-in on every post.
      expect(checkInOffer({ ...court, distanceMi: 0 }, here).defaultOn).toBe(false);
    });
  });

  describe('refuses to guess without a trustworthy distance', () => {
    it('stays off when location was denied (distanceMi null)', () => {
      const unknown = { ...court, distanceMi: null };
      expect(checkInOffer(unknown, null)).toMatchObject({ kind: 'checkin', defaultOn: false });
    });

    it('stays off for NaN, which passes a typeof number check', () => {
      expect(checkInOffer({ ...court, distanceMi: NaN }, null).defaultOn).toBe(false);
    });

    it('stays off when distanceMi is missing entirely', () => {
      expect(checkInOffer({ id: 'c', name: 'C' }, null).defaultOn).toBe(false);
    });

    it('stays off for a stringified distance', () => {
      expect(checkInOffer({ ...court, distanceMi: '0.05' }, null).defaultOn).toBe(false);
    });
  });
});

describe('checkInOfferLabel', () => {
  it('describes each offer kind', () => {
    expect(checkInOfferLabel(checkInOffer(court, null),      'Wortham Park')).toBe('Check in at Wortham Park');
    expect(checkInOfferLabel(checkInOffer(court, elsewhere), 'Wortham Park')).toBe('Switch your check-in to Wortham Park');
    expect(checkInOfferLabel(checkInOffer(court, here),      'Wortham Park')).toBe("You're checked in at Wortham Park");
  });

  it('returns an empty string when there is no offer', () => {
    expect(checkInOfferLabel(null, 'Wortham Park')).toBe('');
  });
});
