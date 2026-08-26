/** @vitest-environment jsdom */
//
// The shared tab control (Phase C, C1).
//
// Two things are worth pinning. The selected-state class, because the underline
// is the entire visual signal and a typo in the modifier would silently leave
// every tab looking unselected. And the badge, because the markup it replaces
// referenced a class — `tab-unread-pill` — that had no CSS anywhere in the
// project, so the unread count had been rendering as bare text.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import Tabs from '../Tabs';

afterEach(cleanup);

const TABS = [
  { value: 'following', label: 'Following' },
  { value: 'nearby', label: 'Nearby' },
];

describe('Tabs', () => {
  it('renders every tab', () => {
    const { getByText } = render(<Tabs tabs={TABS} value="following" onChange={() => {}} />);
    expect(getByText('Following')).toBeTruthy();
    expect(getByText('Nearby')).toBeTruthy();
  });

  it('marks only the selected tab', () => {
    const { getByText } = render(<Tabs tabs={TABS} value="nearby" onChange={() => {}} />);
    expect(getByText('Nearby').className).toContain('is-selected');
    expect(getByText('Following').className).not.toContain('is-selected');
  });

  it('reports the value that was clicked', () => {
    const onChange = vi.fn();
    const { getByText } = render(<Tabs tabs={TABS} value="following" onChange={onChange} />);
    fireEvent.click(getByText('Nearby'));
    expect(onChange).toHaveBeenCalledWith('nearby');
  });

  it('does not re-announce a click on the already-selected tab as a change', () => {
    // It still fires — the control is uncontrolled about this on purpose, and
    // the screens all setState to the same value. Pinned so a later "optimise"
    // that swallows it is a deliberate choice rather than a surprise.
    const onChange = vi.fn();
    const { getByText } = render(<Tabs tabs={TABS} value="following" onChange={onChange} />);
    fireEvent.click(getByText('Following'));
    expect(onChange).toHaveBeenCalledWith('following');
  });
});

describe('Tabs badge', () => {
  it('renders a badge when one is given', () => {
    const { getByText } = render(
      <Tabs value="a" onChange={() => {}}
            tabs={[{ value: 'a', label: 'Friends' }, { value: 'b', label: 'Messages', badge: '9+' }]} />
    );
    const badge = getByText('9+');
    expect(badge).toBeTruthy();
    // The class the old markup used had no styles behind it at all.
    expect(badge.className).toBe('tabs__badge');
  });

  it('renders no badge when there is nothing to show', () => {
    const { container } = render(
      <Tabs value="a" onChange={() => {}}
            tabs={[{ value: 'a', label: 'Friends' }, { value: 'b', label: 'Messages' }]} />
    );
    expect(container.querySelector('.tabs__badge')).toBeNull();
  });

  it('renders a zero badge only if explicitly passed, not for undefined', () => {
    // Friends passes undefined at zero rather than 0, so "0 unread" shows
    // nothing. Guards the `!= null` check against becoming a truthiness test,
    // which would also swallow a legitimate 0 someone might pass later.
    const { container: withZero } = render(
      <Tabs value="a" onChange={() => {}} tabs={[{ value: 'a', label: 'A', badge: 0 }]} />
    );
    expect(withZero.querySelector('.tabs__badge').textContent).toBe('0');
    cleanup();
    const { container: withUndef } = render(
      <Tabs value="a" onChange={() => {}} tabs={[{ value: 'a', label: 'A', badge: undefined }]} />
    );
    expect(withUndef.querySelector('.tabs__badge')).toBeNull();
  });
});
