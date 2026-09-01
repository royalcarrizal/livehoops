/** @vitest-environment jsdom */
//
// CheckInScreen — the Check tab.
//
// The screen composes three components that each return null when they have
// no data (LiveCourtStrip, ActiveFriendsRow, ScheduledRunsList), which makes
// two failure modes easy to ship and impossible to see in a unit test of any
// one component:
//
//   • an orphan header — a "Live now" label sitting above nothing, because the
//     header was rendered outside the guard that hides the strip;
//   • the empty-then-fill flash — courts and friends both start as [], so a
//     screen that can't tell "nothing is live" from "nothing has loaded" paints
//     the big empty-state hero for a beat and then yanks it away.
//
// Both are pinned below, along with the rule that the way out to the map stays
// reachable in every one of the four content combinations.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import CheckInScreen from '../CheckInScreen';

// usePosts and useFriends both talk to Supabase on mount. The screen's own
// behaviour is what's under test, so both are stubbed; friends are supplied
// per-test through the mock's return value.
const friendsState = { friends: [], loading: false };

vi.mock('../../hooks/usePosts', () => ({
  usePosts: () => ({ createPost: vi.fn() }),
}));

vi.mock('../../hooks/useFriends', () => ({
  useFriends: () => friendsState,
}));

vi.mock('../../hooks/useCourtKing', () => ({
  useCourtKing: () => ({
    kings: { hoursKing: null, checkinsKing: null },
    loading: false,
    fetchKings: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  friendsState.friends = [];
  friendsState.loading = false;
});

const court = (o = {}) => ({
  id: 'c1',
  name: 'Cadman Plaza Courts',
  shortAddress: '1 Cadman Plaza, Brooklyn',
  players: 6,
  distance: '0.3 mi',
  distanceMi: 0.3,
  checkins: [],
  meetups: [],
  ...o,
});

const friend = (o = {}) => ({
  userId: 'u2',
  username: 'marcus',
  initials: 'M',
  avatarUrl: null,
  currentCourt: 'Cadman Plaza Courts',
  currentCourtId: 'c1',
  ...o,
});

const setActiveTab = vi.fn();

const paint = (props = {}) =>
  render(
    <CheckInScreen
      parks={[]}
      courtsLoading={false}
      activeCheckIn={null}
      checkOut={vi.fn()}
      setActiveTab={setActiveTab}
      user={{ id: 'u1' }}
      profile={{ username: 'royal' }}
      refreshCounts={vi.fn()}
      onViewProfile={vi.fn()}
      {...props}
    />,
  );

describe('CheckInScreen — not checked in', () => {
  it('shows the full hero when nothing is live and nobody is out', () => {
    const { container } = paint({ parks: [court({ players: 0 })] });

    expect(container.querySelector('.no-checkin-icon')).not.toBeNull();
    expect(container.querySelector('.no-checkin-state--footer')).toBeNull();
    expect(screen.getByText('Find a Court')).toBeTruthy();
  });

  it('shows live courts and demotes the hero to a footer', () => {
    const { container } = paint({ parks: [court()] });

    expect(container.querySelector('.live-court-card')).not.toBeNull();
    expect(container.querySelector('.active-friends-row')).toBeNull();
    expect(container.querySelector('.no-checkin-icon')).toBeNull();
    expect(container.querySelector('.no-checkin-state--footer')).not.toBeNull();
  });

  it('shows the crew row on its own, labelled for this screen', () => {
    friendsState.friends = [friend()];
    const { container } = paint({ parks: [court({ players: 0 })] });

    expect(container.querySelector('.active-friend-card')).not.toBeNull();
    expect(container.textContent).toContain('Crew out');
    expect(container.textContent).not.toContain('Live now');
    expect(container.querySelector('.no-checkin-icon')).toBeNull();
  });

  it('puts Live now above Crew out when both have something', () => {
    friendsState.friends = [friend()];
    const { container } = paint({ parks: [court()] });

    const strip = container.querySelector('.live-court-strip');
    const crew  = container.querySelector('.active-friends-row');
    expect(strip).not.toBeNull();
    expect(crew).not.toBeNull();

    // Node.DOCUMENT_POSITION_FOLLOWING — crew comes after the strip.
    expect(strip.compareDocumentPosition(crew) & 4).toBeTruthy();
  });

  it('never prints a Live now header with no strip under it', () => {
    // The orphan-header case: a court exists, but nobody is on it.
    const { container } = paint({ parks: [court({ players: 0 })] });
    expect(container.textContent).not.toContain('Live now');
  });

  it('shows a skeleton rather than the hero while data is in flight', () => {
    // The flash guard. Empty + loading must not look like empty + settled.
    friendsState.loading = true;
    const { container } = paint({ parks: [], courtsLoading: true });

    expect(container.querySelector('.feed-skeleton-card')).not.toBeNull();
    expect(container.querySelector('.no-checkin-icon')).toBeNull();
  });

  it('keeps the way out to the map in all four combinations', () => {
    const combos = [
      { parks: [court({ players: 0 })], crew: [] },
      { parks: [court()],               crew: [] },
      { parks: [court({ players: 0 })], crew: [friend()] },
      { parks: [court()],               crew: [friend()] },
    ];

    for (const { parks, crew } of combos) {
      friendsState.friends = crew;
      const { container } = paint({ parks });
      const cta = screen.getByText('Find a Court');
      expect(cta).toBeTruthy();

      setActiveTab.mockClear();
      fireEvent.click(cta);
      expect(setActiveTab).toHaveBeenCalledWith('map');

      cleanup();
      expect(container.innerHTML).toBe('');
    }
  });
});

describe('CheckInScreen — checked in', () => {
  const activeCheckIn = {
    checkinId: 'k1',
    courtId: 'c1',
    courtName: 'Cadman Plaza Courts',
    courtAddress: '1 Cadman Plaza, Brooklyn',
    checkedInAt: new Date().toISOString(),
  };

  it('renders the session card', () => {
    const { container } = paint({ activeCheckIn, parks: [court()] });

    expect(container.querySelector('.active-session-card')).not.toBeNull();
    expect(container.textContent).toContain('Cadman Plaza Courts');
    expect(screen.getByText('Check out')).toBeTruthy();
  });

  it('hides the runs list when this court has none scheduled', () => {
    const { container } = paint({ activeCheckIn, parks: [court({ meetups: [] })] });

    expect(container.querySelector('.scheduled-run-list')).toBeNull();
    expect(container.textContent).not.toContain('Scheduled runs');
  });

  it('lists a run scheduled at this court inside the window', () => {
    const inTwoDays = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
    const { container } = paint({
      activeCheckIn,
      parks: [court({
        meetups: [{
          id: 'm1',
          courtId: 'c1',
          courtName: 'Cadman Plaza Courts',
          hostId: 'u9',
          hostName: 'dre',
          scheduledAt: inTwoDays,
          durationMinutes: 90,
          attendeeCount: 4,
          viewerJoined: false,
        }],
      })],
    });

    expect(container.querySelector('.scheduled-run-list')).not.toBeNull();
  });

  it('survives parks not having loaded yet', () => {
    // checkedInPark is null until courts arrive; the card falls back to the
    // names carried on activeCheckIn itself.
    const { container } = paint({ activeCheckIn, parks: [] });

    expect(container.querySelector('.active-session-card')).not.toBeNull();
    expect(container.textContent).toContain('Cadman Plaza Courts');
  });
});
