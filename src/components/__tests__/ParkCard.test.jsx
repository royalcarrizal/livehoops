/** @vitest-environment jsdom */
//
// ParkCard (Phase C, Check screen).
//
// The rule worth pinning here is rule 4: green means live/active and nothing
// else. This card's "Live" badge was drawn in var(--accent) — a badge that
// literally reads "Live" rendered in the brand colour, which is the exact thing
// the rule exists to prevent. It is the same class of bug the avatar's check-in
// ring had before #28, found in a different component.
//
// The other thing worth pinning is that the live marker has somewhere to live
// whether or not the court has a photo. The canvas always has one; most real
// courts do not.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ParkCard from '../ParkCard';

afterEach(cleanup);

const park = (o = {}) => ({
  id: 'c1',
  name: 'Cadman Plaza Courts',
  shortAddress: 'Cadman Plaza W',
  distance: '0.3 mi',
  courts: 4,
  surface: 'Asphalt',
  players: 0,
  checkins: [],
  reviewCount: 0,
  avgRating: 0,
  photoUrl: null,
  ...o,
});

const noop = () => {};

describe('ParkCard live marker', () => {
  it('shows no live badge when the court is empty', () => {
    const { container } = render(<ParkCard park={park()} isCheckedIn={false} onCheckIn={noop} />);
    expect(container.querySelector('.live-badge')).toBeNull();
  });

  it('shows the live badge when players are there', () => {
    const { container } = render(
      <ParkCard park={park({ players: 6 })} isCheckedIn={false} onCheckIn={noop} />
    );
    expect(container.querySelector('.live-badge')).not.toBeNull();
  });

  it('lays the badge over the photo when there is one', () => {
    const { container } = render(
      <ParkCard park={park({ players: 6, photoUrl: 'x.png' })} isCheckedIn={false} onCheckIn={noop} />
    );
    expect(container.querySelector('.park-card-media .park-card-overlay')).not.toBeNull();
    // and not also inline, which would render it twice
    expect(container.querySelectorAll('.live-badge').length).toBe(1);
  });

  it('keeps the badge inline when there is no photo', () => {
    // Most real courts have no photo. The marker must not vanish with it.
    const { container } = render(
      <ParkCard park={park({ players: 6, photoUrl: null })} isCheckedIn={false} onCheckIn={noop} />
    );
    expect(container.querySelector('.park-card-media')).toBeNull();
    expect(container.querySelector('.park-name-row .live-badge')).not.toBeNull();
  });
});

describe('ParkCard content', () => {
  it('puts address and distance on one line', () => {
    const { container } = render(<ParkCard park={park()} isCheckedIn={false} onCheckIn={noop} />);
    const addr = container.querySelector('.park-address').textContent;
    expect(addr).toContain('Cadman Plaza W');
    expect(addr).toContain('0.3 mi');
  });

  it('survives a court with no distance', () => {
    // distance is '—' or missing when GPS is denied; the separator must not be
    // left dangling.
    const { container } = render(
      <ParkCard park={park({ distance: null })} isCheckedIn={false} onCheckIn={noop} />
    );
    expect(container.querySelector('.park-distance')).toBeNull();
    expect(container.querySelector('.park-address').textContent.trim()).toBe('Cadman Plaza W');
  });

  it('renders court count and surface as chips', () => {
    const { container } = render(<ParkCard park={park()} isCheckedIn={false} onCheckIn={noop} />);
    const chips = [...container.querySelectorAll('.park-chip')].map(c => c.textContent);
    expect(chips.some(t => t.includes('4 courts'))).toBe(true);
    expect(chips.some(t => t.includes('Asphalt'))).toBe(true);
  });

  it('singularises a one-court park', () => {
    const { container } = render(
      <ParkCard park={park({ courts: 1 })} isCheckedIn={false} onCheckIn={noop} />
    );
    const chips = [...container.querySelectorAll('.park-chip')].map(c => c.textContent);
    expect(chips.some(t => t.includes('1 court') && !t.includes('courts'))).toBe(true);
  });

  it('shows a rating chip only once anyone has reviewed', () => {
    const none = render(<ParkCard park={park()} isCheckedIn={false} onCheckIn={noop} />);
    expect(none.container.querySelector('.park-chip--rating')).toBeNull();
    cleanup();
    const some = render(
      <ParkCard park={park({ reviewCount: 12, avgRating: 4.6 })} isCheckedIn={false} onCheckIn={noop} />
    );
    expect(some.container.querySelector('.park-chip--rating').textContent).toContain('4.6');
  });

  it('keeps the avatar stack the canvas omits', () => {
    // The mockup has no equivalent. That is it being thinner than the app, not
    // a cue to delete who is actually on the court.
    const { container } = render(
      <ParkCard
        park={park({ players: 2, checkins: [{ id: 'a', initials: 'KM' }, { id: 'b', initials: 'DR' }] })}
        isCheckedIn={false}
        onCheckIn={noop}
      />
    );
    expect(container.querySelector('.park-card-bottom')).not.toBeNull();
    expect(container.querySelector('.player-count-badge').textContent).toContain('2');
  });

  it('says so when nobody is there', () => {
    const { getByText } = render(<ParkCard park={park()} isCheckedIn={false} onCheckIn={noop} />);
    expect(getByText(/Be the first/)).toBeTruthy();
  });
});
