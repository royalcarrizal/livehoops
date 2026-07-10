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
  // Legacy keys — privacy settings used to live in localStorage before they
  // moved to the profiles table (show_location / profile_visibility).
  // Cleared here so stale values don't linger on devices.
  'lh_show_location',
  'lh_profile_visibility',
];

export function useAuth() {
  // 'user' holds the currently logged-in Supabase user object, or null
  // if nobody is logged in. The user object contains their id, email, etc.
  const [user, setUser] = useState(null);

  // 'loading' is true while we're checking if there's an existing session
  // (e.g. the user refreshed the page but was already logged in).
  // We show the splash screen during this time.
  const [loading, setLoading] = useState(true);

  // True when the user arrived via a password-reset email link.
  // Supabase logs them in with a temporary "recovery" session and fires the
  // PASSWORD_RECOVERY event — App.jsx shows the Set New Password screen
  // instead of the main app until they save a new password (or skip).
  const [passwordRecovery, setPasswordRecovery] = useState(false);

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
      (event, session) => {
        setUser(session?.user ?? null);
        // Fired when the user lands here from a password-reset email link.
        // We flag it so App.jsx can show the Set New Password screen.
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordRecovery(true);
        }
      }
    );

    // ── Cleanup ─────────────────────────────────────────────────────────
    // When this component unmounts (e.g. during hot-reload in development),
    // stop listening for auth changes to prevent memory leaks.
    return () => subscription.unsubscribe();
  }, []); // empty array = run once on mount

  // ── Sign Up ─────────────────────────────────────────────────────────────
  // Creates a brand new account with email + password. The chosen username
  // rides along in the signUp metadata, and the handle_new_user database
  // trigger (supabase/handle_new_user.sql) creates the profiles row
  // server-side, inside the same transaction that creates the auth user.
  //
  // Why not insert the profile from here? That only works while email
  // confirmation is OFF. With confirmation ON, signUp returns a user but
  // no session, so a client-side insert runs unauthenticated and the
  // profiles RLS policy rejects it — account created, profile missing.
  //
  // Returns { error } on failure, or { error: null, needsConfirmation }
  // on success — needsConfirmation is true when Supabase sent a
  // confirmation email and the user must click it before they're logged in.
  const signUp = useCallback(async (email, password, username) => {
    try {
      // Step 1: Check the username is free BEFORE creating the account —
      // once the auth user exists there's no clean way to undo it.
      // If the check itself fails (e.g. the RPC isn't deployed yet), carry
      // on: the handle_new_user trigger de-dupes usernames as a backstop.
      const { data: available, error: checkError } = await supabase
        .rpc('username_available', { p_username: username });

      if (!checkError && available === false) {
        return { error: 'That username is already taken. Try a different one.' };
      }

      // Step 2: Create the account. options.data lands in the new auth
      // user's raw_user_meta_data, where the trigger reads the username.
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });

      if (authError) return { error: friendlyError(authError.message) };

      // With email confirmation ON, signing up with an ALREADY-REGISTERED
      // email doesn't error — Supabase returns an obfuscated fake user with
      // no identities (so attackers can't probe which emails have accounts).
      // Detect that and show the same message the error path would.
      if (data.user && data.user.identities?.length === 0) {
        return { error: 'An account with this email already exists. Try logging in instead.' };
      }

      // Step 3 (transition backstop): if we DO have a session (confirmation
      // off — today's setup), upsert the profile row client-side too. This
      // keeps sign-up working during the window where this code is deployed
      // but handle_new_user.sql hasn't been run yet. Once the trigger
      // exists, the row is already there and ignoreDuplicates makes this a
      // no-op. Safe to delete after the SQL has been applied in production.
      if (data.user && data.session) {
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert(
            { id: data.user.id, username },
            { onConflict: 'id', ignoreDuplicates: true }
          );

        if (profileError) {
          console.error('[LiveHoops] Profile creation error:', profileError.message);
          return { error: 'Account created but profile setup failed. Try logging in.' };
        }
      }

      // No session + a real new user = Supabase emailed a confirmation
      // link. The caller shows a "check your email" notice; clicking the
      // link opens the app logged in (SIGNED_IN fires via onAuthStateChange).
      return { error: null, needsConfirmation: !!data.user && !data.session };
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
  // Sends a password reset email to the given address. The link in the email
  // brings the user back to the app root, where Supabase fires the
  // PASSWORD_RECOVERY event and App.jsx shows the Set New Password screen.
  // (We redirect to the root — not a sub-path — because the app is a
  // single-page app with no routes; a sub-path could 404 on some hosts.)
  const resetPassword = useCallback(async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) return { error: friendlyError(error.message) };
      return { error: null };
    } catch {
      return { error: 'Something went wrong. Please try again.' };
    }
  }, []);

  // ── Update Password ─────────────────────────────────────────────────────
  // Saves a new password for the currently logged-in user. Used by the
  // Set New Password screen after the user clicks a reset email link
  // (they're logged in with a temporary recovery session at that point).
  const updatePassword = useCallback(async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) return { error: friendlyError(error.message) };
      return { error: null };
    } catch {
      return { error: 'Something went wrong. Please try again.' };
    }
  }, []);

  // ── Clear the recovery flag ─────────────────────────────────────────────
  // Called after the new password is saved (or the user skips) so App.jsx
  // returns to the normal app.
  const clearPasswordRecovery = useCallback(() => setPasswordRecovery(false), []);

  return {
    user,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    passwordRecovery,
    clearPasswordRecovery,
  };
}

// ── Helper: Convert Supabase error messages to plain English ──────────────
// Supabase returns technical error messages like "Invalid login credentials".
// This function translates them into friendlier messages.
export function friendlyError(message) {
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
  // Raised when the handle_new_user trigger fails during signUp — the only
  // realistic cause is a username conflict slipping past the availability
  // check, so steer the user toward picking a different name.
  if (lower.includes('database error saving new user'))
    return 'Could not finish creating your account. Try a different username.';
  // Fallback: return the original message if we don't have a translation
  return message;
}
