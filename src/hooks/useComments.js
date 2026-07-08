// src/hooks/useComments.js
//
// Manages fetching and posting comments for a single post, including
// comment likes and one-level-deep replies.
// Each FeedPost component that opens its comment section gets its own
// instance of this hook — comments are scoped per post.
//
// Comment shape (threaded): top-level comments each carry a `replies` array.
//   { id, userId, username, initials, avatarUrl, content, timeAgo,
//     likeCount, isLiked, parentId, replies: [ …same shape… ] }
//
// Returns:
//   comments               — threaded array (top-level comments with replies)
//   loading, submitting, fetchError
//   fetchComments(postId, userId)
//   addComment(postId, userId, content, parentCommentId?)
//   deleteComment(commentId)
//   likeComment(commentId, userId) / unlikeComment(commentId, userId)

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { sendPush, preview } from '../lib/push';

// ── Notify whoever should hear about a new top-level comment or reply ─────
// Top-level comment → notify the post's author.
// Reply             → notify the parent comment's author (one level deep,
//                     matching the app's threading — not the post author).
// Never notifies you about your own comment/reply. Fire-and-forget.
async function notifyComment({ postId, parentCommentId, commenterId, commenterName, content }) {
  try {
    let recipientId;
    if (parentCommentId) {
      const { data: parent } = await supabase
        .from('comments')
        .select('user_id')
        .eq('id', parentCommentId)
        .single();
      recipientId = parent?.user_id;
    } else {
      const { data: post } = await supabase
        .from('posts')
        .select('user_id')
        .eq('id', postId)
        .single();
      recipientId = post?.user_id;
    }

    if (!recipientId || recipientId === commenterId) return;

    const title = parentCommentId
      ? `${commenterName} replied to your comment`
      : `${commenterName} commented on your post`;

    sendPush(recipientId, title, preview(content), {
      kind: parentCommentId ? 'comment_reply' : 'post_comment',
      postId,
    });
  } catch (err) {
    console.info('[LiveHoops] notifyComment skipped:', err?.message ?? err);
  }
}

// ── Notify a comment's author that someone liked it ────────────────────────
async function notifyCommentLike(commentId, likerId) {
  try {
    const { data: comment } = await supabase
      .from('comments')
      .select('user_id, content')
      .eq('id', commentId)
      .single();

    if (!comment || comment.user_id === likerId) return;

    const { data: liker } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', likerId)
      .single();

    sendPush(
      comment.user_id,
      `${liker?.username ?? 'Someone'} liked your comment`,
      preview(comment.content),
      { kind: 'comment_like', commentId },
    );
  } catch (err) {
    console.info('[LiveHoops] notifyCommentLike skipped:', err?.message ?? err);
  }
}

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
function normComment(row, likedSet) {
  const username = row.profiles?.username ?? 'Player';
  return {
    id:        row.id,
    userId:    row.user_id,
    username,
    initials:  username.slice(0, 2).toUpperCase(),
    avatarUrl: row.profiles?.avatar_url ?? null,
    content:   row.content,
    timeAgo:   toTimeAgo(row.created_at),
    likeCount: row.like_count ?? 0,
    isLiked:   likedSet?.has(row.id) ?? false,
    parentId:  row.parent_comment_id ?? null,
    replies:   [],
  };
}

// ── Helper: apply an update to a comment anywhere in the tree ─────────────
// Looks at top-level comments and their replies, returning a new array with
// the matching comment updated. `update` is a function (comment) => patch,
// so callers can compute values from the current state (e.g. likeCount + 1).
function patchInTree(list, commentId, update) {
  return list.map(c => {
    if (c.id === commentId) return { ...c, ...update(c) };
    if (c.replies?.length) {
      return {
        ...c,
        replies: c.replies.map(r => (r.id === commentId ? { ...r, ...update(r) } : r)),
      };
    }
    return c;
  });
}

export function useComments() {
  const [comments,   setComments]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  // ── Fetch all comments for a post ───────────────────────────────────────
  // Loads every comment row (top-level + replies), the current user's likes,
  // then threads replies under their parents. Oldest-first within each level.
  const fetchComments = useCallback(async (postId, userId) => {
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

    // Which of these comments has the current user liked?
    let likedSet = new Set();
    if (userId && rows.length > 0) {
      const { data: likes } = await supabase
        .from('comment_likes')
        .select('comment_id')
        .eq('user_id', userId)
        .in('comment_id', rows.map(r => r.id));
      likedSet = new Set((likes ?? []).map(l => l.comment_id));
    }

    // Thread: build top-level list, nest replies under their parent.
    const normed = rows.map(r => normComment(r, likedSet));
    const byId = {};
    normed.forEach(c => { byId[c.id] = c; });

    const topLevel = [];
    normed.forEach(c => {
      if (c.parentId && byId[c.parentId]) {
        byId[c.parentId].replies.push(c);
      } else {
        topLevel.push(c);
      }
    });

    setFetchError(false);
    setComments(topLevel);
    setLoading(false);
  }, []);

  // ── Post a new comment or reply ─────────────────────────────────────────
  // parentCommentId null → top-level comment; set → reply under that comment.
  const addComment = useCallback(async (postId, userId, content, parentCommentId = null) => {
    if (!postId || !userId || !content?.trim()) return null;
    setSubmitting(true);

    // Only reference parent_comment_id when it's actually a reply, so a plain
    // top-level comment still inserts cleanly even if the replies migration
    // (comment_likes_and_replies.sql) hasn't been run yet.
    const insertRow = { post_id: postId, user_id: userId, content: content.trim() };
    if (parentCommentId) insertRow.parent_comment_id = parentCommentId;

    const { data, error } = await supabase
      .from('comments')
      .insert(insertRow)
      .select('*')
      .single();

    if (error) {
      setSubmitting(false);
      console.error('addComment error:', error);
      throw error;
    }

    const [row] = await attachProfiles([data]);
    setSubmitting(false);

    const newComment = normComment(row, new Set());

    // Notify the post author (top-level) or the parent comment's author
    // (reply). row.profiles.username is already fetched above — no extra
    // query needed for the commenter's own name.
    notifyComment({
      postId,
      parentCommentId,
      commenterId:   userId,
      commenterName: row.profiles?.username ?? 'Someone',
      content:       newComment.content,
    });

    if (parentCommentId) {
      // Append under the parent's replies
      setComments(prev => prev.map(c =>
        c.id === parentCommentId
          ? { ...c, replies: [...c.replies, newComment] }
          : c
      ));
    } else {
      setComments(prev => [...prev, newComment]);
    }

    return newComment;
  }, []);

  // ── Delete a comment (own only, enforced by RLS) ────────────────────────
  // Deleting a top-level comment cascades its replies in the DB; we mirror
  // that locally by dropping the comment (and any nested replies) from state.
  const deleteComment = useCallback(async (commentId) => {
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      console.error('deleteComment error:', error);
      throw error;
    }

    setComments(prev => prev
      .filter(c => c.id !== commentId) // drop if it's a top-level comment
      .map(c => ({
        ...c,
        replies: c.replies.filter(r => r.id !== commentId), // or a reply
      }))
    );
  }, []);

  // ── Like a comment ──────────────────────────────────────────────────────
  // Optimistic: flip isLiked and bump the count immediately, then persist.
  // Guard against double-likes so the count can't drift if tapped twice fast.
  const likeComment = useCallback(async (commentId, userId) => {
    if (!commentId || !userId) return;

    setComments(prev => patchInTree(prev, commentId, c =>
      c.isLiked ? {} : { isLiked: true, likeCount: c.likeCount + 1 }
    ));

    const { error } = await supabase
      .from('comment_likes')
      .insert({ comment_id: commentId, user_id: userId });

    // 23505 = already liked (unique violation) — treat as success
    if (error && error.code !== '23505') {
      console.error('likeComment error:', error);
      // Roll back the optimistic bump
      setComments(prev => patchInTree(prev, commentId, c =>
        ({ isLiked: false, likeCount: Math.max(0, c.likeCount - 1) })
      ));
      return;
    }

    // Only notify on a genuinely new like, not a repeat/already-liked call
    if (!error) notifyCommentLike(commentId, userId);
  }, []);

  // ── Unlike a comment ────────────────────────────────────────────────────
  const unlikeComment = useCallback(async (commentId, userId) => {
    if (!commentId || !userId) return;

    setComments(prev => patchInTree(prev, commentId, c =>
      !c.isLiked ? {} : { isLiked: false, likeCount: Math.max(0, c.likeCount - 1) }
    ));

    const { error } = await supabase
      .from('comment_likes')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId);

    if (error) {
      console.error('unlikeComment error:', error);
      setComments(prev => patchInTree(prev, commentId, c =>
        ({ isLiked: true, likeCount: c.likeCount + 1 })
      ));
    }
  }, []);

  return {
    comments,
    loading,
    submitting,
    fetchError,
    fetchComments,
    addComment,
    deleteComment,
    likeComment,
    unlikeComment,
  };
}
