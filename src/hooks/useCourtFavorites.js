// src/hooks/useCourtFavorites.js
//
// Manages a user's favorited courts.
// Returns a Set of favorited court IDs (O(1) lookup) and a toggleFavorite
// function that optimistically updates local state before persisting to Supabase.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useCourtFavorites(userId) {
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [loading,     setLoading]     = useState(false);

  // ── Initial fetch ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) { setFavoriteIds(new Set()); return; }

    let cancelled = false;
    setLoading(true);

    supabase
      .from('court_favorites')
      .select('court_id')
      .eq('user_id', userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setFavoriteIds(new Set(data.map(r => r.court_id)));
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId]);

  // ── Toggle a favorite ──────────────────────────────────────────────────────
  // Optimistically updates local state then syncs to Supabase.
  // Reverts if the DB call fails.
  const toggleFavorite = useCallback(async (courtId) => {
    if (!userId || !courtId) return;

    const wasFavorited = favoriteIds.has(courtId);

    setFavoriteIds(prev => {
      const next = new Set(prev);
      wasFavorited ? next.delete(courtId) : next.add(courtId);
      return next;
    });

    const { error } = wasFavorited
      ? await supabase
          .from('court_favorites')
          .delete()
          .eq('user_id', userId)
          .eq('court_id', courtId)
      : await supabase
          .from('court_favorites')
          .insert({ user_id: userId, court_id: courtId });

    if (error) {
      setFavoriteIds(prev => {
        const reverted = new Set(prev);
        wasFavorited ? reverted.add(courtId) : reverted.delete(courtId);
        return reverted;
      });
    }
  }, [userId, favoriteIds]);

  return { favoriteIds, toggleFavorite, loading };
}
