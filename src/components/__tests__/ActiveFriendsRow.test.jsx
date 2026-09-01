/** @vitest-environment jsdom */
//
// ActiveFriendsRow — the row of friends who are on a court right now.
//
// Two things are worth pinning. First, the header text is now a prop, because
// the Check tab says "Crew out" where Home says "Friends playing now" — a
// default that silently stopped applying would change Home's copy without
// anyone noticing. Second, and more important: "out right now" must not be
// confused with "has played before". useFriends returns lastCheckinAt for
// every friend who has ever checked in, and filtering on it would fill this
// row with people who are at work.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ActiveFriendsRow from '../ActiveFriendsRow';

afterEach(cleanup);

const friend = (o = {}) => ({
  userId: 'u1',
  username: 'marcus',
  initials: 'M',
  avatarUrl: null,
  currentCourt: 'Cadman Plaza Courts',
  currentCourtId: 'c1',
  ...o,
});

const noop = () => {};

const row = (friends, props = {}) =>
  render(<ActiveFriendsRow friends={friends} setActiveTab={noop} {...props} />);

describe('ActiveFriendsRow', () => {
  it('defaults to Home’s wording', () => {
    const { container } = row([friend()]);
    expect(container.textContent).toContain('Friends playing now');
  });

  it('takes a label override for the Check tab', () => {
    const { container } = row([friend()], { label: 'Crew out' });
    expect(container.textContent).toContain('Crew out');
    expect(container.textContent).not.toContain('Friends playing now');
  });

  it('renders nothing when nobody is out', () => {
    const { container } = row([
      friend({ currentCourt: null, currentCourtId: null }),
    ]);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when there are no friends at all', () => {
    expect(row([]).container.innerHTML).toBe('');
  });

  it('ignores a friend who only played earlier', () => {
    // lastCheckinAt says "has ever checked in", not "is on a court". A friend
    // carrying only that must not appear — see the data note in the component.
    const { container } = row([
      friend({
        currentCourt: null,
        currentCourtId: null,
        lastCheckinAt: '2026-08-30T18:00:00Z',
      }),
    ]);
    expect(container.innerHTML).toBe('');
  });

  it('counts a friend located only by checkedInParkId', () => {
    // The other half of the predicate — some callers supply the park id
    // without a court name.
    const { container } = row([
      friend({ currentCourt: null, currentCourtId: null, checkedInParkId: 'c9' }),
    ]);
    expect(container.querySelectorAll('.active-friend-card')).toHaveLength(1);
  });
});
