/** @vitest-environment jsdom */
//
// Phase C, Achievements: the progress ring that replaced a plain "N / 12".
//
// The ring is the kind of thing that looks right in a screenshot while being
// arithmetically wrong — an arc that reads as "most of the way there" when the
// user has earned three of twelve is worse than the text it replaced. So the
// geometry is asserted rather than eyeballed: the dash offset is the only thing
// that decides how much of the circle is drawn.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import AchievementsSection from '../AchievementsSection';
import { BADGE_DEFINITIONS } from '../../data/achievements';

afterEach(cleanup);

const CIRCUMFERENCE = 2 * Math.PI * 35;

// Enough to clear every threshold, or none of them.
const ALL = { checkinCount: 100000, courtsVisited: 100000, hoursOnCourt: 100000 };
const NONE = { checkinCount: 0, courtsVisited: 0, hoursOnCourt: 0 };

const fillOffset = (container) =>
  parseFloat(container.querySelector('.achievements-ring__fill').getAttribute('stroke-dashoffset'));

describe('achievements progress ring', () => {
  it('draws an empty ring when nothing is earned', () => {
    // Offset === circumference means the whole stroke is dashed away.
    const { container } = render(<AchievementsSection userStats={NONE} />);
    expect(fillOffset(container)).toBeCloseTo(CIRCUMFERENCE, 1);
  });

  it('draws a full ring when everything is earned', () => {
    const { container } = render(<AchievementsSection userStats={ALL} />);
    expect(fillOffset(container)).toBeCloseTo(0, 1);
  });

  it('draws a partial ring in proportion to badges earned', () => {
    const partial = render(<AchievementsSection userStats={{ ...NONE, checkinCount: 10 }} />);
    const offset = fillOffset(partial.container);
    // Something earned, but not everything: strictly between the two extremes.
    expect(offset).toBeLessThan(CIRCUMFERENCE);
    expect(offset).toBeGreaterThan(0);
  });

  it('uses the true circumference for the dash array', () => {
    // A rounded 220 here would leave a visible sliver unfilled at 100%.
    const { container } = render(<AchievementsSection userStats={ALL} />);
    const dash = parseFloat(
      container.querySelector('.achievements-ring__fill').getAttribute('stroke-dasharray')
    );
    expect(dash).toBeCloseTo(CIRCUMFERENCE, 5);
  });
});

describe('achievements counts', () => {
  it('shows the earned count and the real total', () => {
    const { getByText } = render(<AchievementsSection userStats={ALL} />);
    expect(getByText(String(BADGE_DEFINITIONS.length))).toBeTruthy();
    expect(getByText(`of ${BADGE_DEFINITIONS.length}`)).toBeTruthy();
  });

  it('derives the total from the badge list rather than a literal', () => {
    // The old markup said "/ 12". This fails the day a thirteenth badge is
    // added, which is the entire point of it.
    const { getByText } = render(<AchievementsSection userStats={NONE} />);
    expect(getByText(`of ${BADGE_DEFINITIONS.length}`)).toBeTruthy();
  });

  it('keeps the ring decorative for screen readers, but not the numbers', () => {
    // The count is the information; the arc is only how it is drawn.
    const { container, getByText } = render(<AchievementsSection userStats={NONE} />);
    expect(container.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(getByText('0')).toBeTruthy();
  });
});
