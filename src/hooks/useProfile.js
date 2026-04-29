// src/hooks/useProfile.js
//
// This hook fetches and updates the current user's profile data from the
// Supabase "profiles" table. The profiles table stores things like the
// user's username, avatar, and stats — anything specific to their account
// that isn't part of the basic auth (email/password).
//
// Usage:
//   const { profile, loading, updateProfile, refetchProfile } = useProfile(user.id);
//   // profile.username, profile.avatar_url, profile.checkin_count, etc.
//   // updateProfile({ avatar_url: 'https://...' }) to save changes
//   // refetchProfile() to reload stats after a checkout updates them

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useProfile(userId) {
  // The profile object from the database, or null if not loaded yet
  const [profile, setProfile] = useState(null);

  // True while we're fetching the profile from Supabase
  const [loading, setLoading] = useState(true);

  // ── Fetch the user's profile from the database ────────────────────────────
  // Extracted into a named useCallback so it can be:
  //   1. Called automatically on mount (via the useEffect below)
  //   2. Called manually after checkout updates profile stats,
  //      so the Profile screen shows the fresh numbers right away
  //
  // .from('profiles') tells Supabase which table to query
  // .select('*') means "give me all columns"
  // .eq('id', userId) means "where the id column equals this user's id"
  // .single() means "I expect exactly one row back" (since id is unique)
  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[LiveHoops] Error loading profile:', error.message);
    } else {
      setProfile(data);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    // If there's no userId (user is logged out), reset to empty state
    if (!userId) {
      setProfile(null);
      setLoading(false);
      return;
    }

    fetchProfile();
  }, [userId, fetchProfile]); // Re-fetch when the userId changes (login/logout)

  // ── Update Profile ────────────────────────────────────────────────────────
  // Saves changes to the user's profile in the database.
  // Call it like: updateProfile({ avatar_url: 'https://...' })
  // You can pass any subset of profile columns — only those fields
  // will be updated; the rest stay the same.
  const updateProfile = useCallback(async (updates) => {
    if (!userId) return { error: 'Not logged in' };

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()     // return the updated row
      .single();

    if (error) {
      console.error('[LiveHoops] Profile update error:', error.message);
      return { error: error.message };
    }

    // Update the local state so the UI reflects the change immediately
    // without needing to re-fetch from the database
    setProfile(data);
    return { error: null };
  }, [userId]);

  return { profile, loading, updateProfile, refetchProfile: fetchProfile };
}
