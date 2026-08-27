/** @vitest-environment jsdom */
//
// LiveCourtStrip — the row of courts with players on them, above Home's tabs.
//
// The case that matters most is a denied location prompt. Every court's
// distanceMi is null then, and the row must still render its courts rather than
// vanishing or printing "— away".

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import LiveCourtStrip from '../LiveCourtStrip';

afterEach(cleanup);

const court = (o = {}) => ({
  id: 'c1',
  name: 'Cadman Plaza Courts',
  players: 8,
  distance: '0.3 mi',
  distanceMi: 0.3,
  ...o,
});

const noop = () => {};

const strip = (parks) =>
  render(<LiveCourtStrip parks={parks} setActiveTab={noop} />);

describe('LiveCourtStrip', () => {
  it('renders nothing when no court has players', () => {
    // A row of "0 running" cards states the opposite of what this row is for.
    const { container } = strip([court({ players: 0 })]);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when there are no courts at all', () => {
    expect(strip([]).container.innerHTML).toBe('');
  });

  it('lists only the courts that have players', () => {
    const { container } = strip([
      court({ id: 'a', name: 'Busy', players: 4 }),
      court({ id: 'b', name: 'Empty', players: 0 }),
    ]);
    const names = [...container.querySelectorAll('.live-court-card-name')].map(n => n.textContent);
    expect(names).toEqual(['Busy']);
  });

  it('orders courts nearest first', () => {
    const { container } = strip([
      court({ id: 'far',  name: 'Far',  distanceMi: 4.2, distance: '4.2 mi' }),
      court({ id: 'near', name: 'Near', distanceMi: 0.4, distance: '0.4 mi' }),
    ]);
    const names = [...container.querySelectorAll('.live-court-card-name')].map(n => n.textContent);
    expect(names).toEqual(['Near', 'Far']);
  });

  it('shows the running count and the distance', () => {
    const { container } = strip([court({ players: 12 })]);
    expect(container.querySelector('.live-court-card-status').textContent).toContain('12 running');
    expect(container.querySelector('.live-court-card-distance').textContent).toBe('0.3 mi away');
  });

  it('still lists courts when location was denied', () => {
    // distance is the literal em dash and distanceMi is null in that state.
    // "— away" reads as broken, so the card says so plainly instead.
    const { container } = strip([court({ distance: '—', distanceMi: null })]);
    expect(container.querySelectorAll('.live-court-card').length).toBe(1);
    expect(container.querySelector('.live-court-card-distance').textContent).toBe('Distance unknown');
  });
});
