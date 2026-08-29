/** @vitest-environment jsdom */
//
// CourtDetailSheet — THE court sheet, opened from the Home feed and from the
// Map. It used to be two implementations; MapScreen carried its own near-copy
// and the two drifted until each had features the other lacked.
//
// So the case this file exists for is the one that duplication caused: the four
// Map-only features must render when their props are supplied and be ABSENT
// when they are not — not broken, not half-rendered. Home passes none of them.
//
// The Supabase-backed hooks are mocked; what is under test is the sheet's own
// conditional rendering, not the network.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';

vi.mock('../../hooks/useCourtReviews', () => ({
  useCourtReviews: () => ({
    reviews: [], loading: false, fetchError: false,
    fetchReviews: vi.fn(), submitReview: vi.fn(), deleteReview: vi.fn(),
  }),
}));

vi.mock('../../hooks/useCourtKing', () => ({
  useCourtKing: () => ({
    kings: { hoursKing: null, checkinsKing: null },
    loading: false,
    fetchKings: vi.fn(),
  }),
}));

import CourtDetailSheet from '../CourtDetailSheet';

afterEach(cleanup);

const court = (o = {}) => ({
  id: 'c1',
  name: 'Cadman Plaza Courts',
  shortAddress: 'Cadman Plaza W, Brooklyn',
  distance: '0.3 mi',
  distanceMi: 0.3,
  courts: 4,
  lighting: true,
  surface: 'Asphalt',
  players: 8,
  avgRating: 4.6,
  reviewCount: 38,
  photoUrl: null,
  lat: 40.69,
  lng: -73.99,
  checkins: [],
  nextMeetup: null,
  ...o,
});

const base = {
  onClose: () => {},
  onCheckIn: () => {},
  activeCheckIn: null,
  checkOut: () => {},
  user: { id: 'me' },
  isCheckingIn: false,
};

const sheet = (props = {}, c = court()) =>
  render(<CourtDetailSheet court={c} {...base} {...props} />).container;

describe('CourtDetailSheet — the Map-only features', () => {
  it('renders all four when the Map supplies them', () => {
    const container = sheet({
      isFavorite: true,
      onToggleFavorite: () => {},
      visitCount: 3,
      onPostToFeed: () => {},
    });
    expect(container.querySelector('.map-sheet-favorite')).not.toBeNull();
    expect(container.querySelector('.map-sheet-visited').textContent).toContain('3 times');
    expect(container.querySelector('.map-sheet-secondary-action')).not.toBeNull();
  });

  it('omits all four when Home does not', () => {
    // The whole point of unifying: absent, not broken.
    const container = sheet();
    expect(container.querySelector('.map-sheet-favorite')).toBeNull();
    expect(container.querySelector('.map-sheet-visited')).toBeNull();
    expect(container.querySelector('.map-sheet-secondary-action')).toBeNull();
  });

  it('shows the next-run badge from the court itself, needing no prop', () => {
    // App attaches nextMeetup to every court, so both screens get this free.
    const withRun = sheet({}, court({
      nextMeetup: { id: 'm1', scheduledAt: new Date(Date.now() + 864e5).toISOString() },
    }));
    expect(withRun.querySelector('.map-sheet-meetup-badge')).not.toBeNull();
    cleanup();
    expect(sheet().querySelector('.map-sheet-meetup-badge')).toBeNull();
  });

  it('calls back when the heart and post button are tapped', () => {
    let faved = 0; let posted = 0;
    const container = sheet({
      onToggleFavorite: () => { faved += 1; },
      onPostToFeed: () => { posted += 1; },
    });
    fireEvent.click(container.querySelector('.map-sheet-favorite'));
    fireEvent.click(container.querySelector('.map-sheet-secondary-action'));
    expect(faved).toBe(1);
    expect(posted).toBe(1);
  });

  it('gives both screens the reviews section', () => {
    // Which the Map's old copy never had — you could not read a court review
    // from the map at all.
    const container = sheet();
    expect(container.querySelector('.reviews-section-header')).not.toBeNull();
    expect(container.querySelector('.reviews-section-title').textContent)
      .toContain('Ratings & Reviews');
  });
});

describe('CourtDetailSheet — the live marker and photo', () => {
  it('shows the LIVE pill with the count when players are there', () => {
    expect(sheet().querySelector('.court-detail-live').textContent).toContain('LIVE · 8');
  });

  it('hides the pill on an empty court but keeps the photo block', () => {
    // The block always renders — it is what the pill sits on.
    const container = sheet({}, court({ players: 0 }));
    expect(container.querySelector('.court-detail-live')).toBeNull();
    expect(container.querySelector('.court-detail-photo')).not.toBeNull();
  });

  it('falls back to an empty block when the court has no photo', () => {
    const container = sheet();
    expect(container.querySelector('.court-detail-photo-empty')).not.toBeNull();
    expect(container.querySelector('.court-detail-photo-img')).toBeNull();
  });
});

describe('CourtDetailSheet — the facts line and chips', () => {
  it('puts address and distance on one line', () => {
    expect(sheet().querySelector('.map-sheet-address').textContent)
      .toBe('Cadman Plaza W, Brooklyn · 0.3 mi');
  });

  it('drops the distance when location was denied, with no dangling separator', () => {
    // normalizeCourt writes the em dash, which is truthy — the trap that left
    // "Houston · " on the Home cards and the Map rows.
    const container = sheet({}, court({ distance: '—', distanceMi: null }));
    expect(container.querySelector('.map-sheet-address').textContent)
      .toBe('Cadman Plaza W, Brooklyn');
  });

  it('shows rating, courts, lights and surface', () => {
    const chips = [...sheet().querySelectorAll('.map-sheet-meta-item')].map(c => c.textContent);
    expect(chips.some(t => t.includes('4.6') && t.includes('38'))).toBe(true);
    expect(chips.some(t => t.includes('4 courts'))).toBe(true);
    expect(chips.some(t => t.includes('Lights'))).toBe(true);
    expect(chips.some(t => t.includes('Asphalt'))).toBe(true);
  });

  it('says "courts", not "hoops"', () => {
    // The design says hoops; the data is AddCourtSheet's "Number of courts".
    // Home and the Map both say courts, and this sheet must not disagree.
    expect(sheet().textContent).not.toMatch(/hoop/i);
  });

  it('omits every chip it cannot state', () => {
    const container = sheet({}, court({
      reviewCount: 0, avgRating: 0, lighting: false, surface: 'Unknown', courts: 1,
    }));
    const chips = [...container.querySelectorAll('.map-sheet-meta-item')].map(c => c.textContent);
    expect(chips).toEqual(['1 court']);
  });
});
