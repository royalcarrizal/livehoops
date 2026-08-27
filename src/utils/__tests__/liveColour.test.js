// Guards rule 4 at the stylesheet level: green means live/active and nothing
// else, and nothing draws "live" in the brand colour.
//
// This exists because the rule has now been broken in four separate places by
// four separate changes — the avatar's check-in ring (#28), ParkCard's "Live"
// badge (#34), the two active-friend dots, and the map, where "visited" wore
// green while "live" wore the accent and a comment cheerfully explained that
// "orange takes priority". Every one of those passed review and a green test
// suite. A rule nothing enforces is a rule that erodes.
//
// It reads index.css as text rather than rendering anything. That is crude, but
// it is the only level at which the question "does any live indicator use the
// accent?" can actually be asked.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../index.css'),
  'utf8'
);

/** The declarations inside a rule, given its exact selector line. */
function ruleBody(selector) {
  const i = CSS.indexOf(`\n${selector} {`);
  if (i === -1) return null;
  return CSS.slice(i, CSS.indexOf('}', i));
}

// Every selector that asserts something is live or active right now.
const LIVE_SELECTORS = [
  '.live-badge',
  '.live-dot',
  '.live-text',
  '.mb-pin.is-live .mb-pin-bubble',
  '.mb-pin.is-live .mb-pin-stem',
  '.map-court-row-live',
  '.session-badge-text',
  '.session-stat-value--live',
  '.active-friend-live-dot',
  '.active-friends-live-dot-header',
];

describe('rule 4 — green means live/active', () => {
  it.each(LIVE_SELECTORS)('%s exists', (sel) => {
    expect(ruleBody(sel), `${sel} not found — rename it here too`).not.toBeNull();
  });

  it.each(LIVE_SELECTORS)('%s does not draw "live" in the accent', (sel) => {
    const body = ruleBody(sel);
    expect(body).not.toBeNull();
    expect(body, `${sel} uses the accent for a live signal`).not.toMatch(/var\(--accent/);
  });

  it.each(LIVE_SELECTORS)('%s uses the green token', (sel) => {
    const body = ruleBody(sel);
    expect(body).not.toBeNull();
    // .live-text and friends may inherit rather than restate, so accept either
    // an explicit green token or no colour of its own at all.
    const hasGreen = /var\(--green/.test(body);
    const hasOwnColour = /(?:^|[\s;])(?:color|background|background-color|border-color):/.test(body);
    expect(hasGreen || !hasOwnColour, `${sel} sets a colour that is not green`).toBe(true);
  });
});

describe('the pre-redesign iOS green is gone', () => {
  it('no #30D158 remains in the stylesheet', () => {
    // Superseded by var(--green) (#2FE08A dark / #12A566 light). It was still
    // hardcoded nine times after #28 claimed to have removed the last of them.
    expect(CSS).not.toMatch(/#30D158/i);
  });

  it('no rgba() spelling of it remains either', () => {
    // The same colour wearing a different hat, which is how it survived the
    // first sweep for the hex.
    expect(CSS).not.toMatch(/rgba\(\s*48\s*,\s*209\s*,\s*88/);
  });
});

describe('visited is not a live signal', () => {
  // The map marker used to carry "visited" alongside "live", and the risk was a
  // single marker saying two things in one colour. The redesigned pin carries
  // the live count and nothing else, so that collision is now structurally
  // impossible — but the visited signal still exists, in the court detail
  // sheet, and the rule follows it there.
  it('the visited badge in the court sheet does not use green', () => {
    const body = ruleBody('.map-sheet-visited');
    expect(body).not.toBeNull();
    expect(body).not.toMatch(/var\(--green/);
  });

  it('the map pin carries no visited state at all', () => {
    // If a visited variant ever comes back to the pin, it must not be green,
    // and this test should grow a case rather than be deleted.
    expect(CSS).not.toMatch(/\.mb-pin[^{]*\.visited/);
  });
});
