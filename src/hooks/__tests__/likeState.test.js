// Tests for deriveLikeState — the arithmetic that lets a like/unlike skip the
// two follow-up reads it used to make just to learn a count it already knew.
//
// The thing worth guarding here is the null cases: returning null is what tells
// likePost/unlikePost to fall back to a real read. Guessing wrong there would
// leave a visibly incorrect like count on screen.

import { describe, it, expect } from 'vitest';
import { deriveLikeState } from '../usePosts';

describe('deriveLikeState', () => {
  describe('liking', () => {
    it('adds one and marks the post liked', () => {
      expect(deriveLikeState(true, 4, false)).toEqual({ likes: 5, isLiked: true });
    });

    it('works from zero', () => {
      expect(deriveLikeState(true, 0, false)).toEqual({ likes: 1, isLiked: true });
    });
  });

  describe('unliking', () => {
    it('subtracts one and marks the post unliked', () => {
      expect(deriveLikeState(false, 4, false)).toEqual({ likes: 3, isLiked: false });
    });

    it('never goes below zero', () => {
      // Defensive: if our count was already 0 but a row was somehow removed,
      // a naive prevLikes - 1 would render "-1 likes".
      expect(deriveLikeState(false, 0, false)).toEqual({ likes: 0, isLiked: false });
    });
  });

  describe('refuses to guess', () => {
    it('returns null when the write reported drift', () => {
      // Duplicate like (23505) / unlike that removed nothing — our local count
      // disagreed with the database, so it must be re-read, not adjusted.
      expect(deriveLikeState(true, 4, true)).toBeNull();
      expect(deriveLikeState(false, 4, true)).toBeNull();
    });

    it('returns null when the caller gave no previous count', () => {
      expect(deriveLikeState(true, undefined, false)).toBeNull();
      expect(deriveLikeState(true, null, false)).toBeNull();
    });

    it('returns null when the previous count is not a usable number', () => {
      // A stringified count would otherwise concatenate: '4' + 1 === '41'.
      expect(deriveLikeState(true, '4', false)).toBeNull();
      // NaN passes a `typeof x === 'number'` check, so it needs Number.isFinite
      // to avoid rendering "NaN likes".
      expect(deriveLikeState(true, NaN, false)).toBeNull();
      expect(deriveLikeState(true, Infinity, false)).toBeNull();
    });
  });
});
