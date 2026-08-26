/** @vitest-environment jsdom */
//
// This file exists for one specific reason.
//
// Phase B (#28) shipped the live avatar ring — the green ring marking someone
// as checked in at a court — without ever rendering it against real data. The
// account it was verified on has no friends, so FriendCard never mounted, and
// FriendCard is the only place in the app that passes isCheckedIn to Avatar.
// The ring itself was verified in isolation; the uncovered link was this one
// line:
//
//     isCheckedIn={friend.isActive}
//
// A prop-pass is a boring thing to test until you notice that deleting it
// breaks a user-visible signal and nothing anywhere else would fail.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import FriendCard from '../FriendCard';

afterEach(cleanup);

const friend = (overrides = {}) => ({
  userId: 'u1',
  name: 'Kai',
  initials: 'KM',
  avatarUrl: null,
  isActive: false,
  currentCourt: 'Cadman Plaza',
  ...overrides,
});

/** The gradient on the avatar's ring wrapper, or null when there is no ring. */
const ringGradient = (container) => {
  const avatarOuter = container.querySelector('.friend-card-main > div');
  const first = avatarOuter?.firstElementChild;
  const bg = first?.style?.background ?? '';
  return bg.includes('linear-gradient') ? bg : null;
};

describe('FriendCard', () => {
  it('rings a checked-in friend in green', () => {
    const { container } = render(<FriendCard friend={friend({ isActive: true })} />);
    const bg = ringGradient(container);
    expect(bg).toContain('var(--green)');
    expect(bg).not.toContain('var(--accent)');
  });

  it('leaves a friend who is not checked in unringed', () => {
    const { container } = render(<FriendCard friend={friend({ isActive: false })} />);
    expect(ringGradient(container)).toBeNull();
  });

  it('says where a checked-in friend is', () => {
    const { getByText } = render(
      <FriendCard friend={friend({ isActive: true, currentCourt: 'Rucker Park' })} />
    );
    expect(getByText(/Rucker Park/)).toBeTruthy();
  });

  it('says offline otherwise', () => {
    const { getByText } = render(<FriendCard friend={friend({ isActive: false })} />);
    expect(getByText('Offline')).toBeTruthy();
  });

  it('renders without optional stats rather than crashing on undefined', () => {
    // These come straight from the profiles table and can be null for a new
    // account; the card is a list row and must never be the thing that breaks
    // the list.
    const { getByText } = render(<FriendCard friend={friend()} />);
    expect(getByText(/0 check-ins/)).toBeTruthy();
  });
});
