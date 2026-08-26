/** @vitest-environment jsdom */
//
// The repo's first component tests.
//
// Everything else here is a pure-utility test, which is why a fully green suite
// has twice said nothing useful: once when Profile crashed on every render
// (#25), and again when a CSS change moved the gear button out of the header
// (Phase A). Both were caught by loading the app by hand. These tests exist so
// that Avatar's ring behaviour, at least, is not in that category.
//
// jsdom keeps inline styles verbatim, including unresolved custom properties —
// so `var(--accent)` survives into `style.background` and can be asserted. That
// matters: it is the difference between "a ring is drawn" and "the ring follows
// the user's accent", and the second is the actual design decision.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import Avatar from '../Avatar';
import { AVATAR_COLORS } from '../../utils/avatarColors';

// RTL only auto-cleans when vitest globals are enabled, and this repo imports
// its test functions explicitly. Without this, mounted trees accumulate and
// container queries start matching a previous test's DOM.
afterEach(cleanup);

/** The gradient on the ring wrapper, or null when the avatar has no ring. */
const ringGradient = (container) => {
  const first = container.firstElementChild.firstElementChild;
  const bg = first?.style?.background ?? '';
  return bg.includes('linear-gradient') ? bg : null;
};

describe('Avatar rings', () => {
  it('draws no ring by default', () => {
    const { container } = render(<Avatar initials="RC" />);
    expect(ringGradient(container)).toBeNull();
  });

  it('draws the identity ring from the accent to green', () => {
    // Hardcoding #FF6A2C here would have been the canvas-faithful choice and is
    // exactly what this asserts against: the ring has to track whatever accent
    // the user picked, or it reads as a bug on the seven non-orange ones.
    const { container } = render(<Avatar initials="RC" size="large" identityRing />);
    const bg = ringGradient(container);
    expect(bg).toContain('var(--accent)');
    expect(bg).toContain('var(--green)');
  });

  it('draws the live ring in green only, never the accent', () => {
    // The live ring states a fact about a person — that they are at a court.
    // Green means live/active and nothing else, so an accent in this gradient
    // would let "checked in" be drawn in the brand colour.
    const { container } = render(<Avatar initials="DR" isCheckedIn />);
    const bg = ringGradient(container);
    expect(bg).toContain('var(--green)');
    expect(bg).toContain('var(--green-deep)');
    expect(bg).not.toContain('var(--accent)');
  });

  it('prefers the identity ring when both are set', () => {
    // Your own profile already states your check-in status elsewhere on the
    // screen, so the ring there is free to be decorative rather than repeat it.
    const { container } = render(<Avatar initials="RC" identityRing isCheckedIn />);
    expect(ringGradient(container)).toContain('var(--accent)');
  });
});

describe('Avatar layout', () => {
  it('keeps its footprint at the requested size when ringed', () => {
    // This is the property that lets a ring be added anywhere without moving
    // the layout around it: the wrapper is padded and border-box, so the face
    // is inset rather than the avatar growing.
    const ringed = render(<Avatar initials="RC" size={80} identityRing />);
    const outer = ringed.container.firstElementChild;
    const ring = outer.firstElementChild;

    expect(outer.style.width).toBe('80px');
    expect(outer.style.height).toBe('80px');
    expect(ring.style.padding).toBe('3px');
    expect(ring.style.boxSizing).toBe('border-box');
  });

  it('gives an unringed avatar the same footprint as a ringed one', () => {
    const a = render(<Avatar initials="RC" size={48} />).container.firstElementChild;
    cleanup();
    const b = render(<Avatar initials="RC" size={48} isCheckedIn />).container.firstElementChild;
    expect(a.style.width).toBe(b.style.width);
    expect(a.style.height).toBe(b.style.height);
  });

  it('scales the live ring down on small avatars', () => {
    // A flat 2px on a 24px comment avatar reads as a collar, not a ring.
    const big   = render(<Avatar initials="DR" size={80} isCheckedIn />);
    const bigPad = big.container.firstElementChild.firstElementChild.style.padding;
    cleanup();
    const small = render(<Avatar initials="DR" size={24} isCheckedIn />);
    const smallPad = small.container.firstElementChild.firstElementChild.style.padding;

    expect(parseFloat(bigPad)).toBeGreaterThan(parseFloat(smallPad));
  });
});

describe('Avatar content', () => {
  it('renders the photo when there is one', () => {
    const { container } = render(<Avatar avatarUrl="https://example.test/a.png" initials="RC" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example.test/a.png');
  });

  it('falls back to initials on a colour from the palette', () => {
    const { container, getByText } = render(<Avatar initials="RC" />);
    expect(getByText('RC')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
  });

  it('gives the same initials the same colour every time', () => {
    // A person's avatar colour is how you recognise them in a list; it must not
    // shuffle between renders.
    const first  = render(<Avatar initials="ZQ" />).container.firstElementChild.firstElementChild.style.background;
    cleanup();
    const second = render(<Avatar initials="ZQ" />).container.firstElementChild.firstElementChild.style.background;
    expect(first).toBe(second);
    expect(AVATAR_COLORS.length).toBeGreaterThan(0);
  });
});
