/** @vitest-environment jsdom */
//
// FriendCard — one row in "Your crew".
//
// The row's whole job is the status line, and it has three states that come
// from two nullable timestamps. The one worth guarding hardest is the third:
// lastCheckinAt is null for anyone who has never checked in anywhere, and
// feeding null to a date formatter is how a row ends up reading
// "Last run Invalid Date ago".

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import FriendCard from '../FriendCard';

afterEach(() => { cleanup(); vi.useRealTimers(); });

const NOW = new Date('2026-09-01T12:00:00Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000).toISOString();
const daysAgo    = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

const friend = (o = {}) => ({
  userId: 'u1',
  name: 'Kai',
  initials: 'KM',
  avatarUrl: null,
  jerseyNumber: 11,
  isActive: false,
  currentCourt: '',
  activeSince: null,
  lastCheckinAt: null,
  ...o,
});

const noop = () => {};

const row = (f) => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const r = render(<FriendCard friend={f} onViewProfile={noop} onMessage={noop} />);
  return r.container;
};

const status = (c) => c.querySelector('.friend-row-status').textContent;

describe('FriendCard status line', () => {
  it('shows the court and how long they have been there', () => {
    const c = row(friend({ isActive: true, currentCourt: 'Cadman Plaza', activeSince: minutesAgo(40) }));
    expect(status(c)).toBe('At Cadman Plaza · 40m');
    expect(c.querySelector('.friend-row-status').classList.contains('is-live')).toBe(true);
  });

  it('drops the duration rather than the court when the start time is missing', () => {
    // Being out is known from the court id; the timestamp is a separate column
    // and could be absent. "At Cadman Plaza · " must not happen.
    const c = row(friend({ isActive: true, currentCourt: 'Cadman Plaza', activeSince: null }));
    expect(status(c)).toBe('At Cadman Plaza');
  });

  it('says something sensible when out at an unnamed court', () => {
    const c = row(friend({ isActive: true, currentCourt: '', activeSince: minutesAgo(10) }));
    expect(status(c)).toBe('On a court · 10m');
  });

  it('shows the last run when they are not out', () => {
    const c = row(friend({ isActive: false, lastCheckinAt: daysAgo(2) }));
    expect(status(c)).toMatch(/^Last run /);
    expect(c.querySelector('.friend-row-status').classList.contains('is-live')).toBe(false);
  });

  it('says "No runs yet" for someone who has never checked in', () => {
    // NOT "Last run Invalid Date ago" — lastCheckinAt is null for a brand new
    // friend, which is a completely ordinary state.
    const c = row(friend({ isActive: false, lastCheckinAt: null }));
    expect(status(c)).toBe('No runs yet');
    expect(status(c)).not.toMatch(/Invalid|NaN|null/);
  });

  it('never claims someone is live just because they played before', () => {
    // isActive is the only thing that means "out right now". A recent last run
    // must not light the row green.
    const c = row(friend({ isActive: false, lastCheckinAt: minutesAgo(5) }));
    expect(c.querySelector('.friend-row-status').classList.contains('is-live')).toBe(false);
  });
});

describe('FriendCard content', () => {
  it('shows the jersey number beside the name', () => {
    const c = row(friend({ jerseyNumber: 11 }));
    expect(c.querySelector('.friend-row-jersey').textContent).toBe('#11');
  });

  it('omits the jersey when they have not set one', () => {
    expect(row(friend({ jerseyNumber: null })).querySelector('.friend-row-jersey')).toBeNull();
  });

  it('keeps jersey number zero, which is a real shirt number', () => {
    // A truthiness check here would hide it — 0 is a legitimate number.
    expect(row(friend({ jerseyNumber: 0 })).querySelector('.friend-row-jersey').textContent).toBe('#0');
  });

  it('rings the avatar green only when they are out', () => {
    // Avatar draws the live ring as an inline gradient, so this looks for the
    // green tokens the way Avatar's own test does. Green because the ring means
    // the same thing here as it does on the court sheets.
    const ringOf = (c) =>
      [...c.querySelectorAll('*')].map(el => el.style?.background ?? '').join(' ');

    const out = row(friend({ isActive: true, currentCourt: 'X', activeSince: minutesAgo(5) }));
    expect(ringOf(out)).toContain('var(--green)');
    cleanup();

    const home = row(friend({ isActive: false, lastCheckinAt: daysAgo(1) }));
    expect(ringOf(home)).not.toContain('var(--green-deep)');
  });
});

describe('FriendCard actions', () => {
  it('opens the profile when the row is tapped', () => {
    let opened = null;
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const { container } = render(
      <FriendCard friend={friend()} onViewProfile={(id) => { opened = id; }} onMessage={noop} />
    );
    fireEvent.click(container.querySelector('.friend-row-main'));
    expect(opened).toBe('u1');
  });

  it('messages without also opening the profile', () => {
    // The two buttons are siblings, not nested — tapping message must not
    // bubble into the row's own handler.
    let opened = null; let messaged = null;
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const { container } = render(
      <FriendCard
        friend={friend()}
        onViewProfile={(id) => { opened = id; }}
        onMessage={(f) => { messaged = f.userId; }}
      />
    );
    fireEvent.click(container.querySelector('.friend-row-message'));
    expect(messaged).toBe('u1');
    expect(opened).toBeNull();
  });
});
