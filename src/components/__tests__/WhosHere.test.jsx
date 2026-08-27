/** @vitest-environment jsdom */
//
// WhosHere — the row of players currently on a court, shared by the Check
// screen, the Map's court sheet and CourtDetailSheet.
//
// The thing worth pinning hardest is the +N arithmetic. A player can be missing
// from the row for two unrelated reasons — there are more of them than the row
// shows faces for, or they hid themselves via privacy settings (the
// get_court_active_players RPC omits them, while the court's player count still
// includes them). Both now collapse into one circle, and the row must reconcile
// with the "Players here" stat above it either way.

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

const faces = (c) => c.querySelectorAll('.whos-here-player').length;
const more  = (c) => c.querySelector('.whos-here-more')?.textContent ?? null;

describe('WhosHere', () => {
  it('renders nothing when nobody is visible', () => {
    // Not an empty heading — the caller should not have to guard this.
    const { container } = render(<WhosHere checkins={[]} players={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows a face per player when they all fit', () => {
    const { container } = render(<WhosHere checkins={players(3)} players={3} />);
    expect(faces(container)).toBe(3);
    expect(more(container)).toBeNull();
  });

  it('shows no name under the faces', () => {
    // The design is bare circles; the name lives in the aria-label instead.
    const { container } = render(<WhosHere checkins={players(3)} players={3} />);
    expect(container.querySelector('.whos-here-name')).toBeNull();
  });
});

describe('WhosHere +N arithmetic', () => {
  it('counts overflow when more players are visible than fit', () => {
    // 9 visible, 5 faces → +4.
    const { container } = render(<WhosHere checkins={players(9)} players={9} />);
    expect(faces(container)).toBe(5);
    expect(more(container)).toBe('+4');
  });

  it('counts players who hid themselves', () => {
    // 8 on the court but only 5 visible: the other 3 chose not to be named.
    // They are still counted, so the court's number adds up.
    const { container } = render(<WhosHere checkins={players(5)} players={8} />);
    expect(faces(container)).toBe(5);
    expect(more(container)).toBe('+3');
  });

  it('reaches the same +N by either route', () => {
    // 8 players / 5 visible (3 hidden) and 8 players / 8 visible (3 overflow)
    // are different situations that both leave 3 people unpictured.
    const hidden   = render(<WhosHere checkins={players(5)} players={8} />);
    expect(more(hidden.container)).toBe('+3');
    cleanup();
    const overflow = render(<WhosHere checkins={players(8)} players={8} />);
    expect(more(overflow.container)).toBe('+3');
  });

  it('always reconciles with the court player count', () => {
    // faces + N must equal the number shown as "Players here", whatever the
    // mix of overflow and hidden players.
    [[3, 3], [5, 8], [9, 9], [6, 11], [1, 1]].forEach(([visible, total]) => {
      const { container } = render(
        <WhosHere checkins={players(visible)} players={total} />
      );
      const shown = faces(container);
      const extra = Number((more(container) ?? '+0').slice(1));
      expect(shown + extra, `${visible} visible of ${total}`).toBe(total);
      cleanup();
    });
  });

  it('never shows a negative count', () => {
    // The two numbers come from different sources and refresh independently,
    // so they can briefly disagree. "+-2" must not be a thing.
    const { container } = render(<WhosHere checkins={players(5)} players={3} />);
    expect(more(container)).toBeNull();
  });
});

describe('WhosHere behaviour', () => {
  it('opens a profile when a face is tapped', () => {
    let opened = null;
    const { container } = render(
      <WhosHere checkins={players(2)} players={2} onViewProfile={(id) => { opened = id; }} />
    );
    fireEvent.click(container.querySelectorAll('.whos-here-player')[1]);
    expect(opened).toBe('u2');
  });

  it('names each player for screen readers, and the viewer as themselves', () => {
    const { container } = render(
      <WhosHere checkins={players(2)} players={2} currentUserId="u1" />
    );
    const labels = [...container.querySelectorAll('.whos-here-player')]
      .map(b => b.getAttribute('aria-label'));
    expect(labels).toEqual(['View your profile', "View player_2's profile"]);
  });

  it('says how many more are playing, for anyone not looking at a circle', () => {
    // The privacy nuance survives here rather than being dropped with the
    // "+N more playing" line the circle replaced.
    const { container } = render(<WhosHere checkins={players(5)} players={8} />);
    expect(container.querySelector('.whos-here-more').getAttribute('aria-label'))
      .toBe('3 more playing');
  });

  it('survives a player with no username', () => {
    const { container } = render(
      <WhosHere checkins={[{ userId: 'x', username: null, initials: 'XX' }]} players={1} />
    );
    expect(container.querySelector('.whos-here-player').getAttribute('aria-label'))
      .toBe("View this player's profile");
  });

  it('takes a custom label', () => {
    const { container } = render(
      <WhosHere checkins={players(1)} players={1} label="Who's here" />
    );
    expect(container.querySelector('.whos-here-label').textContent).toBe("Who's here");
  });
});
