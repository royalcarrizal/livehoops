// src/hooks/useComments.js
//
// Manages fetching and posting comments for a single post.
// Each FeedPost component that opens its comment section gets its own
// instance of this hook — comments are scoped per post.
//
// Returns:
//   comments              — array of comment objects for the current post
//   loading               — true while fetching from Supabase
//   submitting            — true while a new comment is being posted
//   fetchComments(postId) — load all comments for a post
//   addComment(postId, userId, content) — post a new comment
//   deleteComment(commentId)            — remove a comment (own only, enforced by RLS)

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Helper: convert an ISO timestamp to a human-readable relative time ────
function toTimeAgo(isoString) {
  if (!isoString) return '';
  const diff    = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(diff / 3_600_000);
  const days    = Math.floor(diff / 86_400_000);
  if (minutes < 1)  return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours   < 24) return `${hours}h ago`;
  if (days    < 7)  return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Helper: fetch author profiles separately and attach as row.profiles ───
// Mirrors attachProfiles in usePosts.js — PostgREST's `profiles(...)` join
// syntax requires a comments→profiles foreign key in the schema cache, and
// when it's missing the WHOLE query fails and comments never load even
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
    return rows; // comments still render, just with fallback "Player" names
  }

  const profileMap = {};
  (profiles ?? []).forEach(p => { profileMap[p.id] = p; });

  return rows.map(r => ({ ...r, profiles: profileMap[r.user_id] ?? null }));
}

// ── Helper: shape a raw Supabase row into the comment format FeedPost uses ─
function normComment(row) {
  const username = row.profiles?.username ?? 'Player';
  return {
    id:        row.id,
    userId:    row.user_id,
    username,
    // Two-letter fallback for Avatar component
    initials:  username.slice(0, 2).toUpperCase(),
    avatarUrl: row.profiles?.avatar_url ?? null,
    content:   row.content,
    timeAgo:   toTimeAgo(row.created_at),
  };
}

export function useComments() {
  // The array of comment objects for whichever post is currently open
  const [comments,   setComments]   = useState([]);

  // True while the initial comment list is loading
  const [loading,    setLoading]    = useState(false);

  // True while a new comment is being written to Supabase
  const [submitting, setSubmitting] = useState(false);

  // True when the last fetchComments call failed
  const [fetchError, setFetchError] = useState(false);

  // ── Fetch all comments for a post ───────────────────────────────────────
  // Fetches the comment rows, then the author profiles separately (see
  // attachProfiles) so each comment carries the author's username and
  // avatar URL. Comments are shown oldest-first.
  const fetchComments = useCallback(async (postId) => {
    if (!postId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('fetchComments error:', error);
      setFetchError(true);
      setLoading(false);
      return;
    }

    const rows = await attachProfiles(data ?? []);
    setFetchError(false);
    setComments(rows.map(normComment));
    setLoading(false);
  }, []);

  // ── Post a new comment ──────────────────────────────────────────────────
  // Inserts the row, then appends the returned data to local state so
  // the comment appears instantly without a second fetch.
  const addComment = useCallback(async (postId, userId, content) => {
    if (!postId || !userId || !content?.trim()) return null;
    setSubmitting(true);

    const { data, error } = await supabase
      .from('comments')
      .insert({ post_id: postId, user_id: userId, content: content.trim() })
      // Return only the raw comment row — the author profile is attached
      // separately below so a stale relationship cache can't fail the insert
      .select('*')
      .single();

    if (error) {
      setSubmitting(false);
      console.error('addComment error:', error);
      throw error;
    }

    const [row] = await attachProfiles([data]);
    setSubmitting(false);

    const newComment = normComment(row);
    setComments(prev => [...prev, newComment]);
    return newComment;
  }, []);

  // ── Delete a comment ────────────────────────────────────────────────────
  // Supabase RLS ensures only the comment author can delete their own comment.
  // We remove it from local state immediately for instant feedback.
  const deleteComment = useCallback(async (commentId) => {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      console.error('deleteComment error:', error);
      throw error;
    }

    setComments(prev => prev.filter(c => c.id !== commentId));
  }, []);

  return { comments, loading, submitting, fetchError, fetchComments, addComment, deleteComment };
}
