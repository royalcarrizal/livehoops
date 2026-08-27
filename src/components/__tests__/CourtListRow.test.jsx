/** @vitest-environment jsdom */
//
// CourtListRow — one court in the Map screen's bottom panel.
//
// The case that matters most is a denied location prompt. normalizeCourt writes
// an em dash into `distance` then, and that string is truthy — the exact shape
// that produced a dangling "Houston · " on every Home card.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import CourtListRow from '../CourtListRow';

afterEach(cleanup);

const court = (o = {}) => ({
  id: 'c1',
  name: 'Cadman Plaza Courts',
  distance: '0.3 mi',
  distanceMi: 0.3,
  courts: 4,
  lighting: true,
  players: 0,
  ...o,
});

const noop = () => {};
const facts = (c) =>
  render(<CourtListRow court={c} onClick={noop} />)
    .container.querySelector('.map-court-row-facts')?.textContent ?? null;

describe('CourtListRow facts line', () => {
  it('reads distance, courts and lights', () => {
    expect(facts(court())).toBe('0.3 mi · 4 courts · lights');
  });

  it('drops the distance when location was denied, with no dangling separator', () => {
    expect(facts(court({ distance: '—', distanceMi: null }))).toBe('4 courts · lights');
  });

  it('drops lights when the court has none', () => {
    expect(facts(court({ lighting: false }))).toBe('0.3 mi · 4 courts');
  });

  it('singularises a one-court park', () => {
    expect(facts(court({ courts: 1, lighting: false }))).toBe('0.3 mi · 1 court');
  });

  it('says "courts", not "hoops"', () => {
    // The design says hoops; the data is AddCourtSheet's "Number of courts".
    // Home settled this the same way and the two screens must not disagree.
    expect(facts(court())).not.toMatch(/hoop/i);
  });

  it('drops the line entirely when nothing can be stated', () => {
    // Rather than leaving an empty row that pushes the name off-centre.
    const { container } = render(
      <CourtListRow court={court({ distance: '—', courts: 0, lighting: false })} onClick={noop} />
    );
    expect(container.querySelector('.map-court-row-facts')).toBeNull();
    expect(container.querySelector('.map-court-row-name').textContent).toBe('Cadman Plaza Courts');
  });
});

describe('CourtListRow live pill', () => {
  it('shows the count when players are there', () => {
    const { container } = render(<CourtListRow court={court({ players: 8 })} onClick={noop} />);
    expect(container.querySelector('.map-court-row-live').textContent).toBe('8 live');
  });

  it('shows no pill on an empty court', () => {
    const { container } = render(<CourtListRow court={court()} onClick={noop} />);
    expect(container.querySelector('.map-court-row-live')).toBeNull();
  });
});

describe('CourtListRow behaviour', () => {
  it('calls onClick when tapped', () => {
    let tapped = 0;
    const { container } = render(<CourtListRow court={court()} onClick={() => { tapped += 1; }} />);
    fireEvent.click(container.querySelector('.map-court-row'));
    expect(tapped).toBe(1);
  });

  it('describes itself for screen readers', () => {
    const { container } = render(<CourtListRow court={court({ players: 5 })} onClick={noop} />);
    expect(container.querySelector('.map-court-row').getAttribute('aria-label'))
      .toBe('Cadman Plaza Courts, 5 playing now');
  });
});
