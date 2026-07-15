// Tests for friendlyError — translating Supabase auth errors into
// messages a normal person can act on.

import { describe, it, expect } from 'vitest';
import { friendlyError } from '../useAuth';

describe('friendlyError', () => {
  it('translates bad credentials', () => {
    expect(friendlyError('Invalid login credentials'))
      .toBe('Wrong email/username or password. Double-check and try again.');
  });

  it('translates duplicate account', () => {
    expect(friendlyError('User already registered'))
      .toBe('An account with this email already exists. Try logging in instead.');
  });

  it('translates short passwords', () => {
    expect(friendlyError('Password should be at least 6 characters'))
      .toBe('Password must be at least 6 characters.');
  });

  it('translates rate limiting', () => {
    expect(friendlyError('Email rate limit exceeded'))
      .toBe('Too many attempts. Wait a minute and try again.');
  });

  it('translates a failed signup trigger', () => {
    expect(friendlyError('Database error saving new user'))
      .toBe('Could not finish creating your account. Try a different username.');
  });

  it('passes unknown messages through unchanged', () => {
    expect(friendlyError('Some brand new error')).toBe('Some brand new error');
  });
});
