/** @vitest-environment jsdom */
//
// ParkCard — the app's one court card, shared by Home's Nearby tab and Check.
//
// Two rules are pinned here.
//
// Rule 4: green means live/active and nothing else. This card's "Live" badge
// was once drawn in var(--accent) — a badge that literally reads "Live" in the
// brand colour, the exact thing the rule exists to prevent.
//
// And: the card must survive the states real data actually produces. Most
// courts have no photo, many have no reviews, and every court's distance is
// unknown when the user denies the location prompt.

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
  lighting: false,
  players: 0,
  checkins: [],
  reviewCount: 0,
  avgRating: 0,
  photoUrl: null,
  ...o,
});

const noop = () => {};

describe('ParkCard live markers', () => {
  it('shows no live badge when the court is empty', () => {
    const { container } = render(<ParkCard park={park()} isCheckedIn={false} onCheckIn={noop} />);
    expect(container.querySelector('.live-badge')).toBeNull();
    expect(container.querySelector('.park-card-running')).toBeNull();
  });

  it('shows the live badge and the running count when players are there', () => {
    const { container } = render(
      <ParkCard park={park({ players: 8 })} isCheckedIn={false} onCheckIn={noop} />
    );
    expect(container.querySelector('.live-badge')).not.toBeNull();
    expect(container.querySelector('.park-card-running').textContent).toContain('8 running');
  });

  it('renders the markers exactly once, photo or not', () => {
    // They used to move between the photo overlay and the name row depending
    // on whether a photo existed, which is how a card can end up showing two.
    const withPhoto = render(
      <ParkCard park={park({ players: 6, photoUrl: 'x.png' })} isCheckedIn={false} onCheckIn={noop} />
    );
    expect(withPhoto.container.querySelectorAll('.live-badge').length).toBe(1);
    cleanup();

    const without = render(
      <ParkCard park={park({ players: 6, photoUrl: null })} isCheckedIn={false} onCheckIn={noop} />
    );
    expect(without.container.querySelectorAll('.live-badge').length).toBe(1);
  });
});

describe('ParkCard photo block', () => {
  it('shows the photo when the court has one', () => {
    const { container } = render(
      <ParkCard park={park({ photoUrl: 'x.png' })} isCheckedIn={false} onCheckIn={noop} />
    );
    expect(container.querySelector('.park-card-photo')).not.toBeNull();
    expect(container.querySelector('.park-card-media-empty')).toBeNull();
  });

  it('falls back to an empty block when it has none', () => {
    // Most real courts have no photo, and the live markers sit on this block —
    // so it must exist either way.
    const { container } = render(<ParkCard park={park()} isCheckedIn={false} onCheckIn={noop} />);
    expect(container.querySelector('.park-card-media')).not.toBeNull();
    expect(container.querySelector('.park-card-photo')).toBeNull();
    expect(container.querySelector('.park-card-media-empty')).not.toBeNull();
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

  it('drops the distance when location was denied', () => {
    // normalizeCourt writes the em dash, not null, when GPS is unavailable —
    // and that string is truthy. Without an explicit check every card in the
    // list reads "Simsbrook Dr, Houston · " with nothing after the separator.
    const { container } = render(
      <ParkCard park={park({ distance: '—', distanceMi: null })} isCheckedIn={false} onCheckIn={noop} />
    );
    expect(container.querySelector('.park-distance')).toBeNull();
    expect(container.querySelector('.park-address').textContent.trim()).toBe('Cadman Plaza W');
  });

  it('renders the court count as a chip', () => {
    const { container } = render(<ParkCard park={park()} isCheckedIn={false} onCheckIn={noop} />);
    const chips = [...container.querySelectorAll('.park-chip')].map(c => c.textContent);
    expect(chips.some(t => t.includes('4 courts'))).toBe(true);
  });

  it('says "courts", not "hoops"', () => {
    // The design says "4 hoops", but this number is what AddCourtSheet collects
    // under "Number of courts". Labelling it hoops would make the card state
    // something the data does not say.
    const { container } = render(<ParkCard park={park()} isCheckedIn={false} onCheckIn={noop} />);
    expect(container.textContent).not.toMatch(/hoop/i);
  });

  it('singularises a one-court park', () => {
    const { container } = render(
      <ParkCard park={park({ courts: 1 })} isCheckedIn={false} onCheckIn={noop} />
    );
    const chips = [...container.querySelectorAll('.park-chip')].map(c => c.textContent);
    expect(chips.some(t => t.includes('1 court') && !t.includes('courts'))).toBe(true);
  });

  it('shows a Lights chip only when the court has lights', () => {
    const dark = render(<ParkCard park={park({ lighting: false })} isCheckedIn={false} onCheckIn={noop} />);
    expect(dark.container.textContent).not.toContain('Lights');
    cleanup();
    const lit = render(<ParkCard park={park({ lighting: true })} isCheckedIn={false} onCheckIn={noop} />);
    expect(lit.container.textContent).toContain('Lights');
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

  it('reflects whether you are already checked in here', () => {
    const out = render(<ParkCard park={park()} isCheckedIn={false} onCheckIn={noop} />);
    expect(out.container.querySelector('.park-chip-action').textContent).toContain('Check in');
    cleanup();
    const inside = render(<ParkCard park={park()} isCheckedIn onCheckIn={noop} />);
    expect(inside.container.querySelector('.park-chip-action').textContent).toContain('Checked In');
  });
});
