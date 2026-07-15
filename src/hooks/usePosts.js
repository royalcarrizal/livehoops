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

import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { sendPush, preview } from '../lib/push';

// How many posts each feed page fetches. "Load more" pulls the next page.
const PAGE_SIZE = 30;

// ── Notify a post's author that someone liked it ──────────────────────────
// Fire-and-forget: looks up the post (for its author + a content preview)
// and the liker's username, then pushes. Never notifies you about your own
// like. Failures are swallowed — a missing post/profile just means no push.
async function notifyPostLike(postId, likerId) {
  try {
    const { data: post } = await supabase
      .from('posts')
      .select('user_id, content, court_name')
      .eq('id', postId)
      .single();

    if (!post || post.user_id === likerId) return;

    const { data: liker } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', likerId)
      .single();

    const likerName = liker?.username ?? 'Someone';
    const body = post.content ? preview(post.content) : (post.court_name ? `at ${post.court_name}` : '');

    sendPush(post.user_id, `${likerName} liked your post`, body, { kind: 'post_like', postId, likerId });
  } catch (err) {
    console.info('[LiveHoops] notifyPostLike skipped:', err?.message ?? err);
  }
}

// ── Helper: convert an ISO timestamp to a human-readable relative time ────
// e.g. "2024-03-15T10:30:00Z" → "5m ago", "2h ago", "3d ago"
export function toTimeAgo(isoString) {
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

// Simple select — no joins at all.
// Both the author profile AND repost originals are fetched separately below
// (attachProfiles / attachOriginalPosts) instead of using PostgREST's
// `profiles(*)` join syntax. The join syntax requires a foreign key between
// posts and profiles to exist in the database schema cache — and when it
// doesn't (as happened in production), EVERY feed/profile query fails
// silently and the app looks empty even though the posts are safely stored.
// Two plain queries are slightly slower but can never break that way.
const POST_SELECT = `*`;

// Fetch the author profile for each post and attach it as row.profiles,
// mirroring the shape the old join produced so normPost needs no changes.
// Also covers the authors of any attached original_post (reposts).
async function attachProfiles(rows) {
  // Collect every unique author ID we need a profile for
  const ids = new Set();
  rows.forEach(r => {
    if (r.user_id) ids.add(r.user_id);
    if (r.original_post?.user_id) ids.add(r.original_post.user_id);
  });
  if (ids.size === 0) return rows;

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .in('id', [...ids]);

  if (error) {
    console.error('attachProfiles error:', error);
    return rows; // posts still render, just with fallback "Player" names
  }

  const profileMap = {};
  (profiles ?? []).forEach(p => { profileMap[p.id] = p; });

  return rows.map(r => ({
    ...r,
    profiles: profileMap[r.user_id] ?? null,
    original_post: r.original_post
      ? { ...r.original_post, profiles: profileMap[r.original_post.user_id] ?? null }
      : r.original_post,
  }));
}

// Fetch the original posts for any reposts in the list, then attach them.
// This avoids the self-referential FK join which fails when PostgREST's
// schema cache hasn't been reloaded after reposts.sql was run.
async function attachOriginalPosts(rows) {
  const repostIds = rows
    .filter(r => r.repost_of_post_id)
    .map(r => r.repost_of_post_id);

  if (repostIds.length === 0) return rows;

  const { data: originals } = await supabase
    .from('posts')
    .select('*')
    .in('id', repostIds);

  const originalsMap = {};
  (originals ?? []).forEach(o => { originalsMap[o.id] = o; });

  return rows.map(r => ({
    ...r,
    original_post: r.repost_of_post_id ? (originalsMap[r.repost_of_post_id] ?? null) : null,
  }));
}

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

  // ── Pagination state for the Following feed ─────────────────────────────
  // feedHasMore  — true when the last page came back full (more may exist)
  // loadingMore  — true while a "Load more" fetch is in flight
  // followingQueryRef remembers the last query's params + how many RAW rows
  // we've consumed, so loadMoreFriendsFeed can fetch the next page.
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const followingQueryRef = useRef({ userId: null, allIds: [], rawCount: 0 });

  // ── Fetch the Following feed ────────────────────────────────────────────
  // Shows posts from you AND your accepted friends.
  const fetchFriendsFeed = useCallback(async (userId, friendIds) => {
    // If userId is missing, nothing to fetch
    if (!userId) return;

    setLoading(true);

    // The feed includes your own posts plus all your friends' posts
    const allIds = [userId, ...(friendIds ?? [])];

    // Query posts, then fetch author profiles separately (see attachProfiles)
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      // Only include posts from you and your friends
      .in('user_id', allIds)
      // Newest first
      .order('created_at', { ascending: false })
      .range(0, PAGE_SIZE - 1);

    if (error) {
      console.error('fetchFriendsFeed error:', error);
      setLoading(false);
      return;
    }

    // Remember the query so "Load more" can fetch the next page
    followingQueryRef.current = { userId, allIds, rawCount: (data ?? []).length };
    setFeedHasMore((data ?? []).length === PAGE_SIZE);

    let rows = await attachOriginalPosts(data ?? []);
    rows = await attachProfiles(rows);
    const likedIds = await fetchLikedIds(userId, rows.map(r => r.id));
    setFeed(rows.map(row => normPost(row, likedIds)));
    setLoading(false);
  }, []);

  // ── Load the next page of the Following feed ─────────────────────────────
  // Appends to the existing feed. Uses the raw row count as the cursor so
  // pages line up even after optimistic posts were prepended locally.
  const loadMoreFriendsFeed = useCallback(async () => {
    const { userId, allIds, rawCount } = followingQueryRef.current;
    if (!userId) return;
    setLoadingMore(true);

    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .in('user_id', allIds)
      .order('created_at', { ascending: false })
      .range(rawCount, rawCount + PAGE_SIZE - 1);

    if (error) {
      console.error('loadMoreFriendsFeed error:', error);
      setLoadingMore(false);
      return;
    }

    followingQueryRef.current.rawCount += (data ?? []).length;
    setFeedHasMore((data ?? []).length === PAGE_SIZE);

    let rows = await attachOriginalPosts(data ?? []);
    rows = await attachProfiles(rows);
    const likedIds = await fetchLikedIds(userId, rows.map(r => r.id));
    const newPosts = rows.map(row => normPost(row, likedIds));

    // Dedupe: a post created optimistically (or arriving between pages)
    // could already be in the list
    setFeed(prev => [...prev, ...newPosts.filter(p => !prev.some(q => q.id === p.id))]);
    setLoadingMore(false);
  }, []);

  // ── Fetch the Nearby (all posts) feed ──────────────────────────────────
  // Shows posts from everyone — used for the Nearby tab.
  //
  // Returns { posts, rawCount, hasMore }:
  //   posts    — normalized posts (after privacy filtering)
  //   rawCount — how many RAW rows this page consumed; the caller adds this
  //              to its offset for the next page (filtering can drop rows,
  //              so posts.length alone would skip data)
  //   hasMore  — the page came back full, so another page may exist
  //
  // Privacy: posts by users whose Profile Visibility is 'friends' or
  // 'private' only appear to their friends (friendIds) and to themselves.
  // The real enforcement is the posts_select_visible RLS policy
  // (supabase/privacy_enforcement.sql) — hidden posts never leave the
  // database. The client-side filter below is kept as defense in depth.
  const fetchAllFeed = useCallback(async (userId, friendIds = [], offset = 0) => {
    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('fetchAllFeed error:', error);
      return { posts: [], rawCount: 0, hasMore: false };
    }

    const rawCount = (data ?? []).length;
    const hasMore  = rawCount === PAGE_SIZE;

    // Attach author profiles first — the privacy filter below needs to read
    // each author's profile_visibility, which comes from the profiles table.
    let rows = await attachOriginalPosts(data ?? []);
    rows = await attachProfiles(rows);

    // Drop posts from non-public authors the viewer isn't friends with
    const friendSet = new Set(friendIds ?? []);
    rows = rows.filter(row => {
      const visibility = row.profiles?.profile_visibility ?? 'public';
      if (visibility === 'public') return true;
      return row.user_id === userId || friendSet.has(row.user_id);
    });

    const likedIds = await fetchLikedIds(userId, rows.map(r => r.id));
    return { posts: rows.map(row => normPost(row, likedIds)), rawCount, hasMore };
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

    let rows = await attachOriginalPosts(data ?? []);
    rows = await attachProfiles(rows);
    const likedIds = await fetchLikedIds(viewerUserId, rows.map(r => r.id));
    return rows.map(row => normPost(row, likedIds));
  }, []);

  // ── Fetch one post by ID ────────────────────────────────────────────────
  // Used by the notification deep-link flow ("X commented on your post" →
  // open that exact post). Returns a normalized post or null if it's gone.
  const fetchPostById = useCallback(async (postId, viewerUserId) => {
    if (!postId) return null;

    const { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('id', postId)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('fetchPostById error:', error);
      return null;
    }

    let rows = await attachOriginalPosts([data]);
    rows = await attachProfiles(rows);
    const likedIds = await fetchLikedIds(viewerUserId, [data.id]);
    return normPost(rows[0], likedIds);
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
  const createPost = useCallback(async (userId, content, type = 'status', imageUrl = null, courtId = null, courtName = null, authorProfile = null) => {
    // Require at least text, an image, or a tagged court
    if (!userId || (!content?.trim() && !imageUrl && !courtId)) return;

    const row = {
      user_id: userId,
      content: content?.trim() ?? '',
      type,
    };
    if (imageUrl)   row.image_url   = imageUrl;
    if (courtId)    row.court_id    = courtId;
    if (courtName)  row.court_name  = courtName;

    // Insert the new row into the posts table
    const { data, error } = await supabase
      .from('posts')
      .insert(row)
      // Return only the raw post row. Joined selects can fail independently
      // from the insert if Supabase relationship metadata is stale.
      .select('*')
      .single();

    if (error) {
      console.error('createPost error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        postType: type,
        hasImage: !!imageUrl,
        hasCourt: !!courtId,
      });
      // supabase/rate_limits.sql throttles posting via the insert policy's
      // WITH CHECK — a tripped throttle surfaces as a generic RLS violation,
      // not a distinct error code. Translate it to something a person can
      // act on; callers show err.message when err.friendly is set, and fall
      // back to their own generic copy otherwise (this errors on other,
      // unrelated causes too — ownership mismatch, etc.).
      if (error.message?.toLowerCase().includes('row-level security')) {
        const friendly = new Error("You're posting too fast — try again in a few minutes.");
        friendly.friendly = true;
        throw friendly;
      }
      throw error; // Let the caller show an error message
    }

    // Add the new post to the top of the feed immediately
    const likedIds = new Set();
    const newPost  = normPost({
      ...data,
      profiles: authorProfile,
    }, likedIds);
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
        repost_of_post_id: postId,
      })
      .select('*')
      .single();

    // 23505 = unique violation from posts_user_repost_unique.
    if (error?.code === '23505') {
      return { alreadyReposted: true };
    }

    if (error) {
      console.error('createRepost error:', error);
      throw error;
    }

    let [enriched] = await attachOriginalPosts([data]);
    [enriched] = await attachProfiles([enriched]);
    const newPost = normPost(enriched, new Set());
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

    // Only notify on a genuinely new like, not a repeat/already-liked call
    if (!error) notifyPostLike(postId, userId);

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

  // ── Delete a post ──────────────────────────────────────────────────────
  // Removes the post row from Supabase. The posts_delete_own RLS policy
  // ensures only the post owner can delete their own rows.
  const deletePost = useCallback(async (postId) => {
    if (!postId) return;
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);
    if (error) throw error;
    // Optimistically remove from local feed state
    setFeed(prev => prev.filter(p => p.id !== postId));
  }, []);

  // ── Subscribe to new posts in real time ────────────────────────────────
  // Opens a Supabase Realtime channel that fires whenever a new row is
  // inserted into the posts table. Calls onNewPost() if the post is from
  // the logged-in user or one of their friends.
  //
  // Returns a cleanup function — call it to close the channel (e.g. on unmount).
  //
  // Requires Realtime to be enabled on the posts table in the Supabase dashboard:
  //   Database → Replication → posts → toggle ON
  const subscribeToNewPosts = useCallback((userId, friendIds, onNewPost) => {
    if (!userId) return () => {};

    // Build a Set of user IDs whose posts we care about
    const relevantIds = new Set([userId, ...(friendIds ?? [])]);

    const channel = supabase
      .channel('feed-new-posts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'posts' },
        (payload) => {
          // Only notify for posts from the user or their friends
          if (relevantIds.has(payload.new.user_id)) {
            onNewPost(payload.new);
          }
        }
      )
      .subscribe();

    // Return cleanup so HomeScreen can close the channel on unmount
    return () => supabase.removeChannel(channel);
  }, []);

  return {
    feed,
    loading,
    feedHasMore,
    loadingMore,
    loadMoreFriendsFeed,
    fetchFriendsFeed,
    fetchAllFeed,
    fetchUserPosts,
    fetchPostById,
    createPost,
    createRepost,
    likePost,
    unlikePost,
    deletePost,
    subscribeToNewPosts,
  };
}
