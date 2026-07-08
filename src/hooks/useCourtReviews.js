// src/hooks/useCourtReviews.js
//
// Manages ratings and reviews for basketball courts.
// Talks to the Supabase 'court_reviews' table.
//
// Returns:
//   reviews       — array of review objects for the currently-open court
//   loading       — true while fetching from Supabase
//   fetchReviews  — loads all reviews for a given court (lazy, called on expand)
//   submitReview  — upserts (insert OR update) the logged-in user's review
//   deleteReview  — removes the logged-in user's own review

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Helper: convert ISO timestamp to relative time string ─────────────────
function toTimeAgo(isoString) {
  if (!isoString) return '';
  const diff    = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(diff / 3_600_000);
  const days    = Math.floor(diff / 86_400_000);
  if (minutes < 1)  return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours   < 24) return `${hours}h ago`;
  if (days    <  7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Helper: fetch reviewer profiles separately and attach as row.profiles ──
// Mirrors attachProfiles in usePosts.js — PostgREST's `profiles(...)` join
// syntax requires a court_reviews→profiles foreign key in the schema cache,
// and when it's missing the WHOLE query fails and reviews never load even
// though the rows are safely stored. Two plain queries can't break that way.
async function attachProfiles(rows) {
  const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
  if (ids.length === 0) return rows;

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', ids);

  if (error) {
    console.error('attachProfiles error:', error);
    return rows; // reviews still render, just with fallback "Player" names
  }

  const profileMap = {};
  (profiles ?? []).forEach(p => { profileMap[p.id] = p; });

  return rows.map(r => ({ ...r, profiles: profileMap[r.user_id] ?? null }));
}

// ── Helper: shape a raw Supabase row into the format the UI expects ────────
function normReview(row, currentUserId) {
  const username = row.profiles?.username ?? 'Player';
  return {
    id:            row.id,
    courtId:       row.court_id,
    userId:        row.user_id,
    username,
    userAvatarUrl: row.profiles?.avatar_url ?? null,
    userInitials:  username.slice(0, 2).toUpperCase(),
    rating:        row.rating,
    content:       row.content ?? '',
    timeAgo:       toTimeAgo(row.created_at),
    createdAt:     row.created_at,
    isOwn:         row.user_id === currentUserId,
  };
}

export function useCourtReviews() {
  const [reviews,    setReviews]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // ── Fetch all reviews for a court ────────────────────────────────────────
  // Called lazily the first time the "Ratings & Reviews" section expands.
  // Fetches review rows, then reviewer profiles separately (see attachProfiles)
  // so we have the reviewer's username + avatar.
  const fetchReviews = useCallback(async (courtId, userId) => {
    if (!courtId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('court_reviews')
      .select('*')
      .eq('court_id', courtId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.error('fetchReviews error:', error);
      setFetchError(true);
      setLoading(false);
      return;
    }

    const rows = await attachProfiles(data ?? []);
    setFetchError(false);
    setReviews(rows.map(row => normReview(row, userId)));
    setLoading(false);
  }, []);

  // ── Submit (create or update) a review ───────────────────────────────────
  // Uses upsert with onConflict: 'court_id,user_id' so the same user can
  // edit their review rather than trying to insert a second one.
  // Applies an optimistic update so the UI feels instant.
  const submitReview = useCallback(async (userId, courtId, rating, content) => {
    if (!userId || !courtId || !rating) return;

    // Optimistic: replace or prepend the user's review immediately
    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id:            tempId,
      courtId,
      userId,
      username:      'You',
      userAvatarUrl: null,
      userInitials:  'YO',
      rating,
      content:       content ?? '',
      timeAgo:       'Just now',
      createdAt:     new Date().toISOString(),
      isOwn:         true,
    };

    setReviews(prev => {
      // Remove the user's existing review (if any) then prepend the new one
      const without = prev.filter(r => r.userId !== userId);
      return [optimistic, ...without];
    });

    const { data, error } = await supabase
      .from('court_reviews')
      .upsert(
        {
          court_id: courtId,
          user_id:  userId,
          rating,
          content:  content?.trim() ?? null,
        },
        { onConflict: 'court_id,user_id' }
      )
      // Return only the raw review row — the reviewer profile is attached
      // separately below so a stale relationship cache can't fail the upsert
      .select('*')
      .single();

    if (error) {
      console.error('submitReview error:', error);
      // Revert optimistic change on failure
      setReviews(prev => prev.filter(r => r.id !== tempId));
      throw error;
    }

    // Swap the temporary placeholder with the real row from Supabase
    const [row] = await attachProfiles([data]);
    const real = normReview(row, userId);
    setReviews(prev => prev.map(r => r.id === tempId ? real : r));
    return real;
  }, []);

  // ── Delete a review ───────────────────────────────────────────────────────
  // Optimistically removes the review from the list, then deletes from DB.
  const deleteReview = useCallback(async (reviewId) => {
    // Remove from UI immediately
    setReviews(prev => prev.filter(r => r.id !== reviewId));

    const { error } = await supabase
      .from('court_reviews')
      .delete()
      .eq('id', reviewId);

    if (error) {
      console.error('deleteReview error:', error);
    }
  }, []);

  return { reviews, loading, fetchError, fetchReviews, submitReview, deleteReview };
}
