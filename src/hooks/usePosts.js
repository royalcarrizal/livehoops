// src/hooks/usePosts.js
//
// This hook manages loading and creating posts for the home feed.
// It talks to the Supabase 'posts' table and joins with 'profiles'
// so each post carries the poster's username and avatar.
//
// Likes are tracked in Supabase's post_likes table so they follow the user
// across devices and cannot be duplicated for the same post.
//
// Returns:
//   feed              — array of post objects in FeedPost component format
//   loading           — true while feed is loading from Supabase
//   fetchFriendsFeed  — loads posts from you + your accepted friends
//   fetchAllFeed      — loads all posts (used for the Nearby tab)
//   createPost        — saves a new post to Supabase
//   createRepost      — reposts another post to the current user's feed
//   likePost          — increments like count and marks as liked
//   unlikePost        — decrements like count and unmarks liked

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Helper: convert an ISO timestamp to a human-readable relative time ────
// e.g. "2024-03-15T10:30:00Z" → "5m ago", "2h ago", "3d ago"
function toTimeAgo(isoString) {
  if (!isoString) return '';

  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(diff / 3_600_000);
  const days    = Math.floor(diff / 86_400_000);

  if (minutes < 1)  return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours   < 24) return `${hours}h ago`;
  if (days    < 7)  return `${days}d ago`;

  // For older posts, show the actual date like "Mar 15"
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Helper: shape a raw Supabase row into the format FeedPost expects ─────
// The FeedPost component expects a specific shape — this function handles
// that translation so we don't repeat it everywhere.
function normPost(row, likedIds) {
  const username = row.profiles?.username ?? 'Player';
  const original = row.repost_of_post_id ? row.original_post : null;
  const originalUsername = original?.profiles?.username ?? 'Player';

  return {
    id:           row.id,
    userId:       row.user_id,
    // Display name shown in the post header
    userName:     username,
    // Two-letter abbreviation for the avatar fallback (e.g. "MA" for "marcus")
    userInitials: username.slice(0, 2).toUpperCase(),
    userAvatarUrl: row.profiles?.avatar_url ?? null,
    // Post type: 'status', 'checkin', 'photo', 'video'
    type:         row.type ?? 'status',
    courtName:    row.court_name ?? null,
    courtId:      row.court_id ?? null,
    // Human-readable time like "5m ago"
    timeAgo:      toTimeAgo(row.created_at),
    content:      row.content ?? '',
    // Use the real image URL from Supabase Storage if the post has a photo.
    // image_url is the full HTTPS URL stored in the posts table.
    // mediaType tells FeedPost what kind of media it is so it can render correctly.
    mediaUrl:     row.image_url ?? null,
    mediaType:    row.image_url ? 'image' : null,
    likes:        row.like_count ?? 0,
    // comment_count is kept in sync by a Supabase trigger — no extra fetch needed
    comments:     row.comment_count ?? 0,
    // Check if the current user has already liked this post
    isLiked:      likedIds.has(row.id),
    repostOfPostId: row.repost_of_post_id ?? null,
    originalPost: original ? {
      id:           original.id,
      userId:       original.user_id,
      userName:     originalUsername,
      userInitials: originalUsername.slice(0, 2).toUpperCase(),
      userAvatarUrl: original.profiles?.avatar_url ?? null,
      type:         original.type ?? 'status',
      courtName:    original.court_name ?? null,
      courtId:      original.court_id ?? null,
      timeAgo:      toTimeAgo(original.created_at),
      content:      original.content ?? '',
      mediaUrl:     original.image_url ?? null,
      mediaType:    original.image_url ? 'image' : null,
    } : null,
  };
}

const POST_SELECT = `
  *,
  profiles(*),
  original_post:repost_of_post_id(
    *,
    profiles(*)
  )
`;

async function fetchLikedIds(userId, postIds) {
  if (!userId || !postIds?.length) return new Set();

  const { data, error } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds);

  if (error) {
    console.error('fetchLikedIds error:', error);
    return new Set();
  }

  return new Set((data ?? []).map(row => row.post_id));
}

async function fetchPostLikeState(postId, userId) {
  const { data: postRow, error: postError } = await supabase
    .from('posts')
    .select('like_count')
    .eq('id', postId)
    .single();

  if (postError) throw postError;

  const { data: likedRow, error: likedError } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();

  if (likedError) throw likedError;

  return {
    likes: postRow?.like_count ?? 0,
    isLiked: !!likedRow,
  };
}

export function usePosts() {
  // The array of posts shown in the feed
  const [feed, setFeed] = useState([]);

  // True while fetching from Supabase
  const [loading, setLoading] = useState(false);

  // ── Fetch the Following feed ────────────────────────────────────────────
  // Shows posts from you AND your accepted friends.
  const fetchFriendsFeed = useCallback(async (userId, friendIds) => {
    // If userId is missing, nothing to fetch
    if (!userId) return;

    setLoading(true);

    // The feed includes your own posts plus all your friends' posts
    const allIds = [userId, ...(friendIds ?? [])];

    // Query posts and join the profiles table to get username + avatar
    // The "profiles(*)" syntax tells Supabase to fetch the related profile row
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      // Only include posts from you and your friends
      .in('user_id', allIds)
      // Newest first
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('fetchFriendsFeed error:', error);
      setLoading(false);
      return;
    }

    // Load which posts the current user has liked
    const likedIds = await fetchLikedIds(userId, (data ?? []).map(row => row.id));

    // Transform every database row into the shape FeedPost expects
    setFeed((data ?? []).map(row => normPost(row, likedIds)));
    setLoading(false);
  }, []);

  // ── Fetch the Nearby (all posts) feed ──────────────────────────────────
  // Shows every post regardless of friendship — used for the Nearby tab.
  // Returns the result so the caller can store it in a separate state variable.
  const fetchAllFeed = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('fetchAllFeed error:', error);
      return [];
    }

    const likedIds = await fetchLikedIds(userId, (data ?? []).map(row => row.id));
    return (data ?? []).map(row => normPost(row, likedIds));
  }, []);

  // ── Fetch posts by a specific user (for profile pages) ──────────────────
  // Returns the posts array directly (doesn't set the shared feed state)
  // so the caller can store them in their own local state.
  const fetchUserPosts = useCallback(async (profileUserId, viewerUserId = profileUserId) => {
    if (!profileUserId) return [];

    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('user_id', profileUserId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('fetchUserPosts error:', error);
      return [];
    }

    const likedIds = await fetchLikedIds(viewerUserId, (data ?? []).map(row => row.id));
    return (data ?? []).map(row => normPost(row, likedIds));
  }, []);

  // ── Create a new post ───────────────────────────────────────────────────
  // Saves the post to Supabase and immediately prepends it to the feed
  // so the user sees it right away (optimistic update).
  //
  // Parameters:
  //   userId   — the logged-in user's Supabase UUID
  //   content  — the text of the post (may be empty string for photo-only posts)
  //   type     — 'status' | 'photo' | 'checkin' | 'video'
  //   imageUrl — full HTTPS URL of an uploaded photo, or null for text-only posts
  const createPost = useCallback(async (userId, content, type = 'status', imageUrl = null, courtId = null, courtName = null) => {
    // Require at least text, an image, or a tagged court
    if (!userId || (!content?.trim() && !imageUrl && !courtId)) return;

    const row = {
      user_id:    userId,
      content:    content?.trim() ?? '',
      type,
      like_count: 0,
    };
    if (imageUrl)   row.image_url   = imageUrl;
    if (courtId)    row.court_id    = courtId;
    if (courtName)  row.court_name  = courtName;

    // Insert the new row into the posts table
    const { data, error } = await supabase
      .from('posts')
      .insert(row)
      // Return the newly created row so we can add it to the feed
      .select(POST_SELECT)
      .single();

    if (error) {
      console.error('createPost error:', error);
      throw error; // Let the caller show an error message
    }

    // Add the new post to the top of the feed immediately
    const likedIds = new Set();
    const newPost  = normPost(data, likedIds);
    setFeed(prev => [newPost, ...prev]);

    return newPost;
  }, []);

  // ── Repost ──────────────────────────────────────────────────────────────
  // Creates a lightweight post owned by this user that points to the original.
  const createRepost = useCallback(async (postId, userId) => {
    if (!postId || !userId) return null;

    const { data, error } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        type: 'repost',
        content: '',
        like_count: 0,
        repost_of_post_id: postId,
      })
      .select(POST_SELECT)
      .single();

    // 23505 = unique violation from posts_user_repost_unique.
    if (error?.code === '23505') {
      return { alreadyReposted: true };
    }

    if (error) {
      console.error('createRepost error:', error);
      throw error;
    }

    const newPost = normPost(data, new Set());
    setFeed(prev => [newPost, ...prev]);
    return { post: newPost };
  }, []);

  // ── Like a post ─────────────────────────────────────────────────────────
  // Inserts a per-user like row. A DB trigger updates posts.like_count.
  const likePost = useCallback(async (postId, userId) => {
    if (!postId || !userId) return null;

    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: userId });

    // 23505 = unique violation. Treat it as already liked.
    if (error && error.code !== '23505') throw error;

    const next = await fetchPostLikeState(postId, userId);

    setFeed(prev => prev.map(p =>
      p.id === postId ? { ...p, likes: next.likes, isLiked: next.isLiked } : p
    ));

    return next;
  }, []);

  // ── Unlike a post ───────────────────────────────────────────────────────
  // Deletes the per-user like row. A DB trigger updates posts.like_count.
  const unlikePost = useCallback(async (postId, userId) => {
    if (!postId || !userId) return null;

    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);

    if (error) throw error;

    const next = await fetchPostLikeState(postId, userId);

    setFeed(prev => prev.map(p =>
      p.id === postId ? { ...p, likes: next.likes, isLiked: next.isLiked } : p
    ));

    return next;
  }, []);

  return {
    feed,
    loading,
    fetchFriendsFeed,
    fetchAllFeed,
    fetchUserPosts,
    createPost,
    createRepost,
    likePost,
    unlikePost,
  };
}
