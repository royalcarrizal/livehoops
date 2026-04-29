// src/hooks/useAuth.js
//
// This custom React hook manages everything about user authentication:
//   - Is anyone currently logged in?
//   - Sign up a new user
//   - Log in an existing user
//   - Log out and clean up
//   - Send a password reset email
//
// It talks to Supabase (our backend) for the actual auth operations, and
// keeps the React UI in sync by tracking the user in React state.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── All localStorage keys used by LiveHoops ──────────────────────────────
// When the user signs out, we clear all of these so the next person who
// logs in on the same device gets a clean slate.
const STORAGE_KEYS_TO_CLEAR = [
  'livehoops_avatar',
  'livehoops_theme',
  'lh_onboarded',
  'lh_fcm_token',
  'lh_notifications',
  'lh_notif_banner_dismissed',
  'lh_install_dismissed',
  'lh_ios_dismissed',
  'lh_notified_requests',
  'lh_active_checkin',
];

export function useAuth() {
  // 'user' holds the currently logged-in Supabase user object, or null
  // if nobody is logged in. The user object contains their id, email, etc.
  const [user, setUser] = useState(null);

  // 'loading' is true while we're checking if there's an existing session
  // (e.g. the user refreshed the page but was already logged in).
  // We show the splash screen during this time.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ── Step 1: Check for an existing session ───────────────────────────
    // When the app first loads, check if the user was already logged in
    // from a previous visit. Supabase stores the session token in the
    // browser automatically, so getSession() retrieves it if it exists.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // ── Step 2: Listen for auth state changes ───────────────────────────
    // onAuthStateChange fires whenever the user logs in, logs out, or
    // their session refreshes. This keeps our React state perfectly in
    // sync with what Supabase knows about the user.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    // ── Cleanup ─────────────────────────────────────────────────────────
    // When this component unmounts (e.g. during hot-reload in development),
    // stop listening for auth changes to prevent memory leaks.
    return () => subscription.unsubscribe();
  }, []); // empty array = run once on mount

  // ── Sign Up ─────────────────────────────────────────────────────────────
  // Creates a brand new account with email + password, then saves their
  // chosen username to the profiles table in the database.
  const signUp = useCallback(async (email, password, username) => {
    try {
      // Step 1: Create the account in Supabase Auth
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) return { error: friendlyError(authError.message) };

      // Step 2: Insert a profile row for this new user.
      // data.user contains the newly created user's ID, which we use
      // as the primary key in the profiles table to link them together.
      if (data.user) {
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,       // links to auth.users
            username: username,       // the display name they chose
          });

        if (profileError) {
          console.error('[LiveHoops] Profile creation error:', profileError.message);
          return { error: 'Account created but profile setup failed. Try logging in.' };
        }
      }

      return { error: null };
    } catch {
      return { error: 'Something went wrong. Please try again.' };
    }
  }, []);

  // ── Sign In ─────────────────────────────────────────────────────────────
  // Logs in an existing user with their email and password.
  const signIn = useCallback(async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) return { error: friendlyError(error.message) };
      return { error: null };
    } catch {
      return { error: 'Something went wrong. Please try again.' };
    }
  }, []);

  // ── Sign Out ────────────────────────────────────────────────────────────
  // Logs the user out and clears all app data from localStorage so the
  // next person who logs in gets a fresh start.
  const signOut = useCallback(async () => {
    // Clear all LiveHoops-specific localStorage data
    STORAGE_KEYS_TO_CLEAR.forEach(key => localStorage.removeItem(key));

    // Tell Supabase to end the session
    await supabase.auth.signOut();
    // onAuthStateChange will fire automatically and set user to null
  }, []);

  // ── Reset Password ──────────────────────────────────────────────────────
  // Sends a password reset email to the given address. Supabase handles
  // the email sending — the user clicks a link and sets a new password.
  const resetPassword = useCallback(async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) return { error: friendlyError(error.message) };
      return { error: null };
    } catch {
      return { error: 'Something went wrong. Please try again.' };
    }
  }, []);

  return { user, loading, signUp, signIn, signOut, resetPassword };
}

// ── Helper: Convert Supabase error messages to plain English ──────────────
// Supabase returns technical error messages like "Invalid login credentials".
// This function translates them into friendlier messages.
function friendlyError(message) {
  const lower = message.toLowerCase();
  if (lower.includes('invalid login credentials'))
    return 'Wrong email or password. Double-check and try again.';
  if (lower.includes('user already registered'))
    return 'An account with this email already exists. Try logging in instead.';
  if (lower.includes('password') && lower.includes('6'))
    return 'Password must be at least 6 characters.';
  if (lower.includes('valid email') || lower.includes('invalid email'))
    return 'Please enter a valid email address.';
  if (lower.includes('rate limit') || lower.includes('too many'))
    return 'Too many attempts. Wait a minute and try again.';
  if (lower.includes('duplicate') || lower.includes('unique'))
    return 'That username is already taken. Try a different one.';
  // Fallback: return the original message if we don't have a translation
  return message;
}
