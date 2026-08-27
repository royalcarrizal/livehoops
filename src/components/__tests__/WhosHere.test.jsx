/** @vitest-environment jsdom */
//
// WhosHere — the row of players currently on a court, shared by the Check
// screen, the Map's court sheet and CourtDetailSheet.
//
// The case worth pinning hardest is the privacy one. `checkins` is filtered by
// the get_court_active_players RPC and omits anyone who hid their location or
// made their profile private; `players` is the raw count and can be higher.
// That gap must be reported, not hidden — otherwise a court showing "8 playing"
// renders five faces and silently loses three people.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import WhosHere from '../WhosHere';

afterEach(cleanup);

const player = (n) => ({
  userId: `u${n}`,
  username: `player_${n}`,
  avatarUrl: null,
  initials: `P${n}`,
});

const players = (count) => Array.from({ length: count }, (_, i) => player(i + 1));

describe('WhosHere', () => {
  it('renders nothing when nobody is visible', () => {
    // Not an empty heading — the caller should not have to guard this.
    const { container } = render(<WhosHere checkins={[]} players={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows a face per player', () => {
    const { container } = render(<WhosHere checkins={players(3)} players={3} />);
    expect(container.querySelectorAll('.whos-here-player').length).toBe(3);
    expect(container.querySelector('.whos-here-more')).toBeNull();
  });

  it('caps at six faces and collapses the rest', () => {
    const { container } = render(<WhosHere checkins={players(9)} players={9} />);
    expect(container.querySelectorAll('.whos-here-player').length).toBe(6);
    expect(container.querySelector('.whos-here-more').textContent).toBe('+3');
  });

  it('counts players who hid themselves rather than dropping them', () => {
    // 8 on the court, 5 visible: the other 3 chose not to be named, but the
    // court's count still has to add up.
    const { container } = render(<WhosHere checkins={players(5)} players={8} />);
    expect(container.querySelector('.whos-here-hidden').textContent).toContain('+3 more playing');
  });

  it('says nothing about hidden players when everyone is visible', () => {
    const { container } = render(<WhosHere checkins={players(4)} players={4} />);
    expect(container.querySelector('.whos-here-hidden')).toBeNull();
  });

  it('never reports a negative hidden count', () => {
    // The two numbers come from different sources and can briefly disagree
    // while counts refresh — "+-2 more playing" must not be a thing.
    const { container } = render(<WhosHere checkins={players(5)} players={3} />);
    expect(container.querySelector('.whos-here-hidden')).toBeNull();
  });

  it('calls the viewer "You" rather than their own username', () => {
    const { container } = render(
      <WhosHere checkins={players(2)} players={2} currentUserId="u1" />
    );
    const names = [...container.querySelectorAll('.whos-here-name')].map(n => n.textContent);
    expect(names).toEqual(['You', 'player']);
  });

  it('shows only the first part of a username', () => {
    const { container } = render(<WhosHere checkins={[player(1)]} players={1} />);
    expect(container.querySelector('.whos-here-name').textContent).toBe('player');
  });

  it('survives a player with no username', () => {
    const { container } = render(
      <WhosHere checkins={[{ userId: 'x', username: null, initials: 'XX' }]} players={1} />
    );
    expect(container.querySelector('.whos-here-name').textContent).toBe('Player');
  });

  it('opens a profile when a player is tapped', () => {
    let opened = null;
    const { container } = render(
      <WhosHere checkins={players(2)} players={2} onViewProfile={(id) => { opened = id; }} />
    );
    fireEvent.click(container.querySelectorAll('.whos-here-player')[1]);
    expect(opened).toBe('u2');
  });

  it('takes a custom label', () => {
    const { container } = render(
      <WhosHere checkins={players(1)} players={1} label="Who's here" />
    );
    expect(container.querySelector('.whos-here-label').textContent).toBe("Who's here");
  });
});
