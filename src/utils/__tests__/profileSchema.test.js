// Tests for profileSchema — the guard that lets deployed code outrun an
// unapplied migration without breaking.
//
// The property under test is the blast radius. PostgREST rejects an update
// naming an unknown column outright rather than ignoring it, so sending `bio`
// before supabase/profile_bio.sql has been run fails the whole request — the
// username and jersey number go down with it. These tests pin the rule that
// unknown columns are dropped and known ones always survive.

import { describe, it, expect } from 'vitest';
import { profileHasColumn, pickSupportedUpdates } from '../profileSchema';

// What select('*') returns before profile_bio.sql has been applied.
const beforeMigration = {
  id: 'user-1',
  username: 'royxl',
  favorite_court: 'Cadman Plaza',
  jersey_number: 7,
};

// ...and after. Note bio is null, not absent — an applied migration with no
// value set still puts the key on the row, which is what makes `in` reliable.
const afterMigration = { ...beforeMigration, bio: null };

describe('profileHasColumn', () => {
  it('is false before the migration and true after', () => {
    expect(profileHasColumn(beforeMigration, 'bio')).toBe(false);
    expect(profileHasColumn(afterMigration, 'bio')).toBe(true);
  });

  it('sees a column whose value is null', () => {
    // The distinction that matters: null value, present key.
    expect(afterMigration.bio).toBeNull();
    expect(profileHasColumn(afterMigration, 'bio')).toBe(true);
  });

  it('treats an unloaded profile as "not yet", not as "yes"', () => {
    expect(profileHasColumn(null, 'bio')).toBe(false);
    expect(profileHasColumn(undefined, 'bio')).toBe(false);
  });

  it('finds columns that have always existed', () => {
    expect(profileHasColumn(beforeMigration, 'username')).toBe(true);
  });
});

describe('pickSupportedUpdates', () => {
  it('drops a column the table does not have yet', () => {
    const updates = { username: 'royxl', jersey_number: 7, bio: 'Brooklyn runs' };
    expect(pickSupportedUpdates(beforeMigration, updates)).toEqual({
      username: 'royxl',
      jersey_number: 7,
    });
  });

  it('keeps that column once the migration has run', () => {
    const updates = { username: 'royxl', jersey_number: 7, bio: 'Brooklyn runs' };
    expect(pickSupportedUpdates(afterMigration, updates)).toEqual(updates);
  });

  it('never drops the fields that were always there', () => {
    // The regression this guard exists to prevent: one unapplied migration
    // taking the whole form down with it.
    const updates = { username: 'newname', favorite_court: 'X', jersey_number: 3, bio: 'hi' };
    const result = pickSupportedUpdates(beforeMigration, updates);
    expect(result.username).toBe('newname');
    expect(result.favorite_court).toBe('X');
    expect(result.jersey_number).toBe(3);
    expect('bio' in result).toBe(false);
  });

  it('passes updates through untouched when the profile has not loaded', () => {
    const updates = { username: 'royxl', bio: 'hi' };
    expect(pickSupportedUpdates(null, updates)).toEqual(updates);
  });

  it('does not mutate the caller object', () => {
    const updates = { username: 'royxl', bio: 'hi' };
    pickSupportedUpdates(beforeMigration, updates);
    expect(updates).toEqual({ username: 'royxl', bio: 'hi' });
  });

  it('keeps a null value rather than treating it as absent', () => {
    // Clearing a bio sends null; that must still reach the database.
    const result = pickSupportedUpdates(afterMigration, { bio: null });
    expect(result).toEqual({ bio: null });
  });
});
