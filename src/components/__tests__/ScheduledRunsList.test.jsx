/** @vitest-environment jsdom */
//
// ScheduledRunsList — the "Scheduled runs" section on Home's Nearby tab.
//
// The cases worth pinning are the ones real data produces and the mockup does
// not show: a run with no recorded length (every run created before the
// duration column existed), a run further out than the section claims to cover,
// and the host/going badges, which are this app's stand-in for a design that
// assumed an invite system the app has never had.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import ScheduledRunsList from '../ScheduledRunsList';

afterEach(() => { cleanup(); vi.useRealTimers(); });

// Fixed clock so "within the next 7 days" is deterministic.
const NOW = new Date('2026-08-20T12:00:00');
const hoursFromNow = (h) => new Date(NOW.getTime() + h * 3600000).toISOString();

const run = (o = {}) => ({
  id: 'm1',
  courtId: 'c1',
  courtName: 'Rucker Park',
  hostId: 'u-host',
  hostName: 'Kai',
  hostAvatarUrl: null,
  hostInitials: 'KM',
  scheduledAt: hoursFromNow(30),
  durationMinutes: 120,
  attendeeCount: 3,
  viewerJoined: false,
  ...o,
});

const noop = () => {};

const renderList = (meetups, userId = 'u-me') => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  return render(
    <ScheduledRunsList meetups={meetups} userId={userId} setActiveTab={noop} />
  );
};

describe('ScheduledRunsList', () => {
  it('renders nothing at all when there are no runs', () => {
    // Not an empty state — the whole section, heading included, must vanish.
    const { container } = renderList([]);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when every run falls outside the window', () => {
    const { container } = renderList([run({ scheduledAt: hoursFromNow(24 * 9) })]);
    expect(container.innerHTML).toBe('');
  });

  it('lists a run inside the window with its time and length', () => {
    const { container } = renderList([run()]);
    expect(container.querySelector('.scheduled-run-court').textContent).toBe('Rucker Park');
    expect(container.querySelector('.scheduled-run-when').textContent).toContain('·');
    expect(container.querySelector('.scheduled-run-when').textContent).toContain('2h');
  });

  it('drops the separator when a run has no recorded length', () => {
    // Runs created before the duration column existed. A dangling "6:30p ·"
    // is the failure this guards.
    const { container } = renderList([run({ durationMinutes: null })]);
    const when = container.querySelector('.scheduled-run-when').textContent;
    expect(when).not.toContain('·');
    expect(when.trim()).toMatch(/^\d{1,2}:\d{2}[ap]$/);
  });

  it('marks a run you host as Yours', () => {
    const { container } = renderList([run({ hostId: 'u-me' })]);
    expect(container.querySelector('.run-badge--host').textContent).toBe('Yours');
    expect(container.querySelector('.run-badge--going')).toBeNull();
  });

  it('marks a run you joined as Going', () => {
    const { container } = renderList([run({ viewerJoined: true })]);
    expect(container.querySelector('.run-badge--going').textContent).toBe('Going');
  });

  it('prefers Yours over Going on your own run', () => {
    // The host is auto-RSVP'd to their own run, so viewerJoined is always true
    // for them. Without a preference every hosted run would read as merely
    // "Going".
    const { container } = renderList([run({ hostId: 'u-me', viewerJoined: true })]);
    expect(container.querySelector('.run-badge--host')).not.toBeNull();
    expect(container.querySelector('.run-badge--going')).toBeNull();
  });

  it('shows no badge on someone else\'s run you have not joined', () => {
    const { container } = renderList([run()]);
    expect(container.querySelector('.run-badge')).toBeNull();
  });

  it('shows the attendee count', () => {
    const { container } = renderList([run({ attendeeCount: 5 })]);
    expect(container.querySelector('.scheduled-run-going').textContent).toContain('5 going');
  });

  it('survives a logged-out viewer without claiming they host anything', () => {
    const { container } = renderList([run({ hostId: undefined })], undefined);
    expect(container.querySelector('.run-badge--host')).toBeNull();
  });
});
