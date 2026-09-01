// Tests for the two pieces of repost-count arithmetic that are easy to get
// wrong and invisible when you do.
//
// effectiveRepostCount guards the repost-of-a-repost trap: a repost row's own
// repost_count is structurally always 0, so a card that shows its own number
// prints "0" beside a button that reposts something with fifty.
//
// bumpRepostCount guards the optimistic update. Branch 2 will call it with -1
// to undo a repost, which is why the clamp is tested now rather than when
// somebody first sees "-1 reposts" on screen.

import { describe, it, expect } from 'vitest';
import { effectiveRepostCount, bumpRepostCount } from '../usePosts';

describe('effectiveRepostCount', () => {
  it('uses a normal post’s own count', () => {
    expect(effectiveRepostCount({ id: 'p1', repost_count: 7 }, null)).toBe(7);
  });

  it('uses the ORIGINAL’s count on a repost', () => {
    // The repost's own count is 0 and always will be — nothing can point at it.
    const repost   = { id: 'r1', repost_of_post_id: 'p1', repost_count: 0 };
    const original = { id: 'p1', repost_count: 12 };
    expect(effectiveRepostCount(repost, original)).toBe(12);
  });

  it('falls back to 0 when the original could not be loaded', () => {
    // attachOriginalPosts returns null for a deleted or unreadable original;
    // the card still renders, showing 0 rather than undefined.
    const repost = { id: 'r1', repost_of_post_id: 'p1', repost_count: 0 };
    expect(effectiveRepostCount(repost, null)).toBe(0);
  });

  it('falls back to 0 when the column is missing', () => {
    // The state of the world before repost_count.sql is applied, and after the
    // rollback block in it is run.
    expect(effectiveRepostCount({ id: 'p1' }, null)).toBe(0);
  });

  it('survives a missing row', () => {
    expect(effectiveRepostCount(null, null)).toBe(0);
  });
});

describe('bumpRepostCount', () => {
  const original = { id: 'p1', reposts: 4 };
  const repostOfIt = { id: 'r1', repostOfPostId: 'p1', reposts: 4 };
  const unrelated = { id: 'p2', reposts: 9 };

  it('moves the original’s count', () => {
    expect(bumpRepostCount(original, 'p1', +1).reposts).toBe(5);
  });

  it('moves a repost of that original too', () => {
    // Both cards display the same number, so both have to move together or
    // the feed contradicts itself on screen.
    expect(bumpRepostCount(repostOfIt, 'p1', +1).reposts).toBe(5);
  });

  it('leaves other posts strictly alone', () => {
    // Identity, not just equality — an unchanged object lets React skip the
    // re-render for every other card in the feed.
    expect(bumpRepostCount(unrelated, 'p1', +1)).toBe(unrelated);
  });

  it('decrements for the undo path', () => {
    expect(bumpRepostCount(original, 'p1', -1).reposts).toBe(3);
  });

  it('never goes below zero', () => {
    const zero = { id: 'p1', reposts: 0 };
    expect(bumpRepostCount(zero, 'p1', -1).reposts).toBe(0);
  });

  it('treats a missing count as zero', () => {
    expect(bumpRepostCount({ id: 'p1' }, 'p1', +1).reposts).toBe(1);
  });

  it('does not mutate the post it was given', () => {
    const post = { id: 'p1', reposts: 4 };
    bumpRepostCount(post, 'p1', +1);
    expect(post.reposts).toBe(4);
  });

  it('is a no-op without a target id', () => {
    expect(bumpRepostCount(original, null, +1)).toBe(original);
  });
});
