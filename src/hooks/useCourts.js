// src/hooks/useCourts.js
//
// This hook loads all basketball courts from the Supabase "courts" table
// and keeps them in local state so every screen can display real data.
//
// It replaces the old MOCK_PARKS array that was hardcoded in App.jsx.
// Now courts come from the database. Only verified courts are shown publicly,
// and player counts are updated by the check-in system.
//
// Usage:
//   const { courts, loading, updatePlayerCount, refreshCounts } = useCourts();

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

// ── Haversine formula ─────────────────────────────────────────────────────────
// Calculates the straight-line distance in miles between two lat/lng points.
// Named after the haversine trigonometric function used in the calculation.
function haversine(lat1, lng1, lat2, lng2) {
  const R    = 3958.8; // Earth's radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ── Format a distance in miles to a readable string ──────────────────────────
// e.g. 0.08 → "< 0.1 mi"   1.4 → "1.4 mi"   12.3 → "12.3 mi"
function formatMiles(miles) {
  if (miles < 0.1) return '< 0.1 mi';
  return `${miles.toFixed(1)} mi`;
}

function normalizeLighting(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['yes', 'true', 'lit'].includes(value.toLowerCase());
  }
  return false;
}

// ── Transform a raw Supabase row into the "park" shape ───────────────────────
// Every component in the app expects courts to look like this object.
// We convert the database column names (snake_case) to the shape the
// UI components were built with.
// userPos is optional — if provided, distance is calculated; otherwise "—".
function normalizeCourt(row, userPos = null) {
  const distance =
    userPos && row.lat && row.lng
      ? formatMiles(haversine(userPos.lat, userPos.lng, row.lat, row.lng))
      : '—';

  return {
    id:           row.id,
    name:         row.name,
    // Combine address + city into a single display string
    shortAddress: `${row.address}, ${row.city} TX`,
    courts:       row.courts    ?? 1,
    // player_count from the DB becomes "players" in the UI
    players:      row.player_count ?? 0,
    surface:      row.surface   ?? 'Unknown',
    lighting:     normalizeLighting(row.lighting),
    lat:          row.lat,
    lng:          row.lng,
    distance,
    // Denormalized rating data kept in sync by the sync_court_rating DB trigger
    avgRating:   row.avg_rating   ?? null,  // null = no reviews yet
    reviewCount: row.review_count ?? 0,
    // Per-court check-in avatars are future work
    checkins:     [],
  };
}

export function useCourts() {
  // The list of courts shown on the map and in court lists
  const [courts, setCourts] = useState([]);

  // True while the first load is in progress
  const [loading, setLoading] = useState(true);

  // The user's GPS position — null until the browser grants location access
  const [userPos, setUserPos] = useState(null);
  const userPosRef = useRef(null);

  // ── Request GPS on mount ──────────────────────────────────────────────────
  // We ask once when the hook mounts. If the user denies permission, distances
  // silently stay as "—" — no error is shown. If they grant it, setUserPos
  // triggers the effect below to fill in real distances.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        const nextPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        userPosRef.current = nextPos;
        setUserPos(nextPos);
      },
      ()  => {} // permission denied or unavailable — distances stay as "—"
    );
  }, []);

  // ── Recompute distances whenever the user's position becomes available ────
  // Courts may already be loaded by the time GPS comes back, so we patch
  // the distance field on each court object without re-fetching from Supabase.
  useEffect(() => {
    if (!userPos) return;
    setCourts(prev => prev.map(court => ({
      ...court,
      distance:
        court.lat && court.lng
          ? formatMiles(haversine(userPos.lat, userPos.lng, court.lat, court.lng))
          : '—',
    })));
  }, [userPos]);

  // ── Fetch all courts from Supabase ────────────────────────────────────────
  // Called on mount. Returns courts ordered by when they were added
  // (newest first so recently added courts appear at the top).
  const fetchCourts = useCallback(async () => {
    const { data, error } = await supabase
      .from('courts')
      .select('*')
      .eq('verified', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[LiveHoops] Error loading courts:', error.message);
    } else if (data) {
      // Pass current userPos so distances are calculated immediately if GPS
      // already came back before the courts finished loading
      setCourts(data.map(row => normalizeCourt(row, userPosRef.current)));
    }

    setLoading(false);
  }, []);

  // Run fetchCourts once when the hook first mounts
  useEffect(() => {
    fetchCourts();
  }, [fetchCourts]);

  // ── Instantly update a court's player count in local state ────────────────
  // Called right after a check-in or check-out so the UI updates immediately,
  // without waiting for the next 60-second refresh from the database.
  //
  // delta is +1 when someone checks in, -1 when they check out.
  const updatePlayerCount = useCallback((courtId, delta) => {
    setCourts(prev => prev.map(court =>
      court.id === courtId
        ? { ...court, players: Math.max(0, court.players + delta) }
        : court
    ));
  }, []);

  // ── Re-fetch only player counts from the database ─────────────────────────
  // Called every 60 seconds by CheckInScreen to stay in sync with
  // other users checking in and out around the city.
  // We only update player counts, not the full court objects, to avoid
  // unnecessary re-renders in the map and court lists.
  const refreshCounts = useCallback(async () => {
    const { data, error } = await supabase
      .from('courts')
      .select('id, player_count')
      .eq('verified', true);

    if (error || !data) return;

    // Build a quick lookup map: { courtId: playerCount }
    const countMap = {};
    data.forEach(row => { countMap[row.id] = row.player_count ?? 0; });

    // Update each court's player count if it changed
    setCourts(prev => prev.map(court =>
      countMap[court.id] !== undefined
        ? { ...court, players: countMap[court.id] }
        : court
    ));
  }, []);

  return { courts, loading, updatePlayerCount, refreshCounts, userPos };
}
