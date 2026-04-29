// src/hooks/useCheckIn.js
//
// This hook manages everything related to checking in and out of
// basketball courts. It talks directly to the Supabase database so
// that check-ins persist when you close and re-open the app.
//
// How it works end to end:
//   1. On app load, we check localStorage for a saved check-in.
//      If one exists, we verify it's still active in Supabase.
//      If it's older than 3 hours, we auto check out.
//   2. checkIn(courtId, userId) calls a Supabase RPC that atomically creates
//      the check-in and updates court player counts.
//   3. checkOut() calls a Supabase RPC that atomically closes the check-in,
//      updates player counts, and updates profile stats.
//
// Usage (in App.jsx):
//   const { activeCheckIn, loading, checkIn, checkOut } = useCheckIn(
//     user?.id,
//     updatePlayerCount,  // callback to update court player count instantly
//     refetchProfile      // callback to reload profile stats after checkout
//   );

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Key used to save the active check-in in localStorage
const STORAGE_KEY = 'lh_active_checkin';

// How long a check-in lasts before auto-expiring (3 hours in milliseconds)
const MAX_CHECKIN_MS = 3 * 60 * 60 * 1000;

export function useCheckIn(userId, onPlayerCountChange, onProfileRefetch) {
  // The user's current active check-in, or null if not checked in anywhere.
  // Shape: { checkinId, courtId, courtName, courtAddress, checkedInAt }
  //   checkinId   — the UUID of the row in the checkins table
  //   courtId     — the UUID of the court they're at
  //   courtName   — the court's display name (e.g. "Wortham Park")
  //   courtAddress — the court's short address
  //   checkedInAt — ISO timestamp string from Supabase
  const [activeCheckIn, setActiveCheckIn] = useState(null);

  // True while we're verifying the saved check-in with Supabase on startup
  const [loading, setLoading] = useState(true);

  // ── Internal: check out a specific check-in row ────────────────────────────
  // We define this before checkOut so that the startup effect can call it
  // for the auto-expire case (check-in older than 3 hours).
  //
  const performCheckOut = useCallback(async (checkinId) => {
    const { data, error } = await supabase.rpc('livehoops_check_out', {
      p_checkin_id: checkinId,
    });

    if (error) {
      console.error('[LiveHoops] Check-out failed:', error.message);
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;

    // ── Clear local state and localStorage ──────────────────────────────────
    localStorage.removeItem(STORAGE_KEY);
    setActiveCheckIn(null);

    // Tell App.jsx to update the court card's player count immediately
    if (result?.court_id && onPlayerCountChange) {
      onPlayerCountChange(result.court_id, -1);
    }

    // Tell App.jsx to reload the profile so the stats screen reflects the new numbers
    if (onProfileRefetch) onProfileRefetch();

    return result;
  }, [onPlayerCountChange, onProfileRefetch]);

  // ── On mount: restore check-in from localStorage ───────────────────────────
  // When the app loads, we check if there's a saved check-in. If there is,
  // we verify it's still active in Supabase (in case it was checked out on
  // another device, or a server-side expiry happened).
  useEffect(() => {
    // Only run this once we know who's logged in
    if (!userId) {
      setLoading(false);
      return;
    }

    async function restoreCheckIn() {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (!stored) {
        // No saved check-in — also verify in DB in case of edge cases
        setLoading(false);
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(stored);
      } catch {
        // Corrupted localStorage value — clear it
        localStorage.removeItem(STORAGE_KEY);
        setLoading(false);
        return;
      }

      // Ask Supabase: is this check-in still active?
      const { data } = await supabase
        .from('checkins')
        .select('id, user_id, court_id, checked_in_at, courts(name, address, city)')
        .eq('id', parsed.checkinId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (!data) {
        // The check-in was already closed, belongs to another user, or was removed
        localStorage.removeItem(STORAGE_KEY);
        setLoading(false);
        return;
      }

      // Check if the session has been running for more than 3 hours
      const checkedInMs = new Date(data.checked_in_at).getTime();
      const elapsed     = Date.now() - checkedInMs;

      if (elapsed >= MAX_CHECKIN_MS) {
        // Auto-expire: check them out silently
        try {
          await performCheckOut(data.id);
        } catch {
          localStorage.removeItem(STORAGE_KEY);
          setActiveCheckIn(null);
        }
        setLoading(false);
        return;
      }

      // Check-in is valid — restore it to state
      setActiveCheckIn({
        checkinId:    data.id,
        courtId:      data.court_id,
        courtName:    data.courts?.name    ?? parsed.courtName    ?? 'Unknown Court',
        courtAddress: data.courts
          ? `${data.courts.address}, ${data.courts.city} TX`
          : parsed.courtAddress ?? '',
        checkedInAt:  data.checked_in_at,
      });

      setLoading(false);
    }

    restoreCheckIn();
  }, [userId, performCheckOut]);

  // ── checkIn ───────────────────────────────────────────────────────────────
  // Call this when the user taps "Check In" on a court.
  // If they're already checked in somewhere else, the RPC checks them out
  // and updates both affected court counts atomically.
  const checkIn = useCallback(async (courtId, uid) => {
    if (!uid) return;

    const { data, error } = await supabase.rpc('livehoops_check_in', {
      p_court_id: courtId,
    });

    if (error || !data) {
      console.error('[LiveHoops] Check-in failed:', error?.message);
      return null;
    }

    const result = Array.isArray(data) ? data[0] : data;

    const checkin = {
      checkinId:    result.checkin_id,
      courtId:      result.court_id,
      courtName:    result.court_name ?? 'Unknown Court',
      courtAddress: result.court_address ?? '',
      checkedInAt:  result.checked_in_at,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkin));
    setActiveCheckIn(checkin);

    // Update affected court cards immediately in the UI. The RPC already did
    // the authoritative database writes atomically.
    if (result.previous_court_id && onPlayerCountChange) {
      onPlayerCountChange(result.previous_court_id, -1);
    }
    if (result.court_id && onPlayerCountChange) {
      onPlayerCountChange(result.court_id, +1);
    }

    if (result.previous_court_id && onProfileRefetch) onProfileRefetch();

    return result;
  }, [onPlayerCountChange, onProfileRefetch]);

  // ── checkOut ──────────────────────────────────────────────────────────────
  // Call this when the user taps "Check Out".
  // We use the checkinId and courtId from activeCheckIn, so callers
  // don't need to pass them — just call checkOut() with no arguments,
  // or pass specific values to check out a particular row.
  const checkOut = useCallback(async (checkinId, courtId, uid) => {
    void courtId;
    void uid;

    const id = checkinId ?? activeCheckIn?.checkinId;

    if (!id) return;

    await performCheckOut(id);
  }, [activeCheckIn, performCheckOut]);

  // ── getCheckInHistory ─────────────────────────────────────────────────────
  // Fetches the user's past (completed) check-ins from Supabase.
  // Used by ProfileScreen to show the check-ins history tab.
  // Returns an array of objects, newest first.
  const getCheckInHistory = useCallback(async (uid) => {
    const { data, error } = await supabase
      .from('checkins')
      .select('id, checked_in_at, duration_minutes, courts(name)')
      .eq('user_id', uid)
      .eq('is_active', false)
      .order('checked_in_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('[LiveHoops] Error fetching check-in history:', error.message);
      return [];
    }

    return (data ?? []).map(row => ({
      id:              row.id,
      courtName:       row.courts?.name ?? 'Unknown Court',
      checkedInAt:     row.checked_in_at,
      durationMinutes: row.duration_minutes,
    }));
  }, []);

  return { activeCheckIn, loading, checkIn, checkOut, getCheckInHistory };
}
