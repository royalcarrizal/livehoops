// src/hooks/useCourtKing.js
//
// "King of the Court" — the two top players at a single court:
//   • King of Hours     — most total time on court
//   • King of Check-ins — most check-ins there
//
// Both come from the get_court_king RPC (see supabase/court_king.sql), which
// aggregates completed check-ins server-side (the checkins RLS blocks reading
// other users' rows from the client). Lazy-loaded when a court sheet opens,
// mirroring how useCourtReviews loads on demand.
//
// Returns:
//   kings      — { hoursKing, checkinsKing } — each a king object or null
//   loading    — true while fetching
//   fetchKings — (courtId) => void — loads the two kings for a court

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Helper: format total minutes as a short "time on court" string ──────────
// Under an hour reads as "45m"; otherwise whole hours "12h" (matching how
// profile hours_played is rounded). Exported so the sheets can reuse it.
export function formatHours(totalMinutes) {
  const m = Number(totalMinutes) || 0;
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

// ── Helper: shape a raw king record from the RPC into UI-friendly camelCase ──
// The RPC already joins profiles, so username/avatar/jersey come back inline.
function normKing(raw) {
  if (!raw) return null;
  const username = raw.username ?? 'Player';
  return {
    userId:       raw.user_id,
    username,
    initials:     username.slice(0, 2).toUpperCase(),
    avatarUrl:    raw.avatar_url ?? null,
    jerseyNumber: raw.jersey_number ?? null, // 0 is valid — keep null distinct
    totalMinutes: raw.total_minutes ?? 0,
    totalCheckins: raw.total_checkins ?? 0,
  };
}

export function useCourtKing() {
  const [kings, setKings]     = useState({ hoursKing: null, checkinsKing: null });
  const [loading, setLoading] = useState(false);

  const fetchKings = useCallback(async (courtId) => {
    if (!courtId) return;
    setLoading(true);
    // Clear stale data so a previous court's kings never flash on the new one
    setKings({ hoursKing: null, checkinsKing: null });

    const { data, error } = await supabase.rpc('get_court_king', {
      p_court_id: courtId,
    });

    if (error) {
      // Fail soft — a court sheet must still open if this errors.
      console.error('[LiveHoops] Failed to load court king:', error.message);
      setLoading(false);
      return;
    }

    setKings({
      hoursKing:    normKing(data?.hours_king),
      checkinsKing: normKing(data?.checkins_king),
    });
    setLoading(false);
  }, []);

  return { kings, loading, fetchKings };
}
