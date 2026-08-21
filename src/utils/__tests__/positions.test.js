// Tests for the position selection rules.
//
// These exist because the client and the check constraint in
// supabase/profile_positions.sql have to agree. The constraint rejects unknown
// values, duplicates, and arrays longer than five. A client that can produce
// any of those turns a chip tap into a failed save the user cannot explain.

import { describe, it, expect } from 'vitest';
import {
  POSITIONS,
  togglePosition,
  normalizePositions,
  formatPositions,
} from '../positions';

describe('POSITIONS', () => {
  it('matches the five values the check constraint allows', () => {
    expect(POSITIONS).toEqual(['Guard', 'Wing', 'Forward', 'Center', 'Wherever']);
  });
});

describe('togglePosition', () => {
  it('adds a position that was not selected', () => {
    expect(togglePosition([], 'Guard')).toEqual(['Guard']);
  });

  it('removes one that was', () => {
    expect(togglePosition(['Guard', 'Wing'], 'Guard')).toEqual(['Wing']);
  });

  it('returns canonical order regardless of the order they were tapped', () => {
    // Two players who picked the same positions must read identically.
    const tappedBackwards = togglePosition(togglePosition([], 'Center'), 'Guard');
    const tappedForwards = togglePosition(togglePosition([], 'Guard'), 'Center');
    expect(tappedBackwards).toEqual(['Guard', 'Center']);
    expect(tappedForwards).toEqual(['Guard', 'Center']);
  });

  it('cannot create a duplicate', () => {
    // The constraint rejects ['Guard','Guard'], so this must be unreachable.
    const once = togglePosition([], 'Guard');
    expect(togglePosition(['Guard', 'Guard'], 'Wing')).toEqual(['Guard', 'Wing']);
    expect(once).toEqual(['Guard']);
  });

  it('ignores a value that is not a real position', () => {
    expect(togglePosition([], 'Point Guard')).toEqual([]);
  });

  it('can never exceed the five allowed entries', () => {
    const all = POSITIONS.reduce((acc, p) => togglePosition(acc, p), []);
    expect(all).toEqual(POSITIONS);
    expect(togglePosition(all, 'Guard')).toHaveLength(4);
  });

  it('does not mutate the array it was given', () => {
    const current = ['Guard'];
    togglePosition(current, 'Wing');
    expect(current).toEqual(['Guard']);
  });
});

describe('normalizePositions', () => {
  it('drops unknown values rather than rendering them', () => {
    expect(normalizePositions(['Guard', 'Sweeper'])).toEqual(['Guard']);
  });

  it('collapses duplicates', () => {
    expect(normalizePositions(['Guard', 'Guard'])).toEqual(['Guard']);
  });

  it('re-sorts into canonical order', () => {
    expect(normalizePositions(['Center', 'Guard'])).toEqual(['Guard', 'Center']);
  });

  it('survives null, undefined and a non-array', () => {
    // The column is `not null default '{}'`, but this value is also read for
    // other players' profiles, and rendering is the wrong place to find out
    // an assumption was wrong.
    expect(normalizePositions(null)).toEqual([]);
    expect(normalizePositions(undefined)).toEqual([]);
    expect(normalizePositions('Guard')).toEqual([]);
  });
});

describe('formatPositions', () => {
  it('joins with a middot for the profile header', () => {
    expect(formatPositions(['Guard', 'Wing'])).toBe('Guard · Wing');
  });

  it('returns empty string when nothing is chosen, so the caller can omit it', () => {
    expect(formatPositions([])).toBe('');
    expect(formatPositions(null)).toBe('');
  });
});
