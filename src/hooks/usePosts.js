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

// Shared empty Set for normPost's repostedIds default. Declared above normPost
// because a const in the temporal dead zone is a runtime error, not a warning,
// the moment a caller omits the argument.
const EMPTY_SET = new Set();

// ── Helper: shape a raw Supabase row into the format FeedPost expects ─────
// The FeedPost component expects a specific shape — this function handles
// that translation so we don't repeat it everywhere.
function normPost(row, likedIds, repostedIds = EMPTY_SET) {
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
    // Jersey number (0 is valid, so ?? null keeps a set 0 distinct from unset)
    userJersey:   row.profiles?.jersey_number ?? null,
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
    // repost_count is kept in sync the same way (supabase/repost_count.sql).
    // See effectiveRepostCount for why a repost shows the original's number.
    reposts:      effectiveRepostCount(row, original),
    // Has the viewer reposted the post this card acts on? Keyed on the target,
    // so an original and every repost of it answer identically.
    isReposted:   repostedIds.has(repostTargetId(row)),
    // Check if the current user has already liked this post
    isLiked:      likedIds.has(row.id),
    repostOfPostId: row.repost_of_post_id ?? null,
    originalPost: original ? {
      id:           original.id,
      userId:       original.user_id,
      userName:     originalUsername,
      userInitials: originalUsername.slice(0, 2).toUpperCase(),
      userAvatarUrl: original.profiles?.avatar_url ?? null,
      userJersey:   original.profiles?.jersey_number ?? null,
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

// ── Which of these posts has the viewer already reposted? ──────────────────
// The repost analogue of fetchLikedIds, and it works the same way: one batched
// query, a Set, no per-card lookups.
//
// The difference is what goes in and what comes out. It takes ORIGINAL ids
// (repostTargetId of each row, not the row ids), because that is what a repost
// points at and what the unique index is keyed on. It returns the originals
// the viewer has reposted — so both an original and any repost of it look
// themselves up under the same key and cannot disagree.
async function fetchRepostedIds(userId, targetIds) {
  const ids = [...new Set((targetIds ?? []).filter(Boolean))];
  if (!userId || ids.length === 0) return new Set();

  const { data, error } = await supabase
    .from('posts')
    .select('repost_of_post_id')
    .eq('user_id', userId)
    .in('repost_of_post_id', ids);

  if (error) {
    // Fail soft, exactly as fetchLikedIds does. A feed that renders with every
    // repost icon un-filled is worth more than no feed at all.
    console.error('fetchRepostedIds error:', error);
    return new Set();
  }

  return new Set((data ?? []).map(row => row.repost_of_post_id));
}

// ── Derive a post's like state without asking the server ───────────────────
// After a like/unlike write succeeds, the resulting count is just the count we
// were already showing, plus or minus one — the write succeeding IS the
// confirmation. posts.like_count is maintained by a DB trigger, so the
// authoritative value stays correct for the next fetch either way.
//
// Returns null when we must NOT guess and the caller has to read the real
// state instead:
//   - drifted: the write told us our local view was wrong (a duplicate like,
//     or an unlike that removed nothing), so prevLikes can't be trusted
//   - prevLikes isn't a usable number: the caller didn't tell us what it was
//     showing. Number.isFinite (not typeof) so NaN falls back to a read rather
//     than rendering "NaN likes".
// ── Which post a repost action actually targets ────────────────────────────
// Always the original. handleRepost has sent `repostOfPostId ?? id` since
// reposts shipped, and posts_user_repost_unique is keyed on that column, so a
// repost of a repost is not a thing that can exist.
//
// Everything the button displays has to agree with that: the count
// (effectiveRepostCount), and whether YOU have reposted it. Reposting a post
// and then finding its repost still showing an un-reposted icon would be the
// same object contradicting itself in one scroll.
export function repostTargetId(row) {
  return row?.repost_of_post_id ?? row?.id ?? null;
}

// ── Which repost count a card should show ──────────────────────────────────
// Reposting is always aimed at the ORIGINAL: handleRepost sends
// `repostOfPostId ?? id`, and posts_user_repost_unique is keyed on that, so
// there is no such thing as a repost of a repost — you get a second repost of
// the same original, or a unique violation.
//
// The number on screen has to follow the same rule. A repost row's own
// repost_count is structurally always 0 (nothing can ever point at it), so
// showing it would print "0 reposts" on a post with fifty, right next to a
// button that reposts the thing with fifty. Show the original's count instead.
//
// Exported for its test; the trap is invisible until you look at a repost.
export function effectiveRepostCount(row, original) {
  if (row?.repost_of_post_id) return original?.repost_count ?? 0;
  return row?.repost_count ?? 0;
}

// ── Move one card's repost count, if it is a card about this original ──────
// "About this original" is true of the original post itself AND of every
// repost pointing at it, because they all display the same number. Anything
// else is returned untouched, by identity, so React skips re-rendering it.
//
// Clamped at zero for the same reason the SQL trigger is: branch 2 will call
// this with -1 to undo a repost, and a feed that can print "-1" is worse than
// one that is briefly stale.
export function bumpRepostCount(post, originalId, delta) {
  if (!post || !originalId) return post;
  const isAboutOriginal = post.id === originalId || post.repostOfPostId === originalId;
  if (!isAboutOriginal) return post;
  return { ...post, reposts: Math.max(0, (post.reposts ?? 0) + delta) };
}

// ── Flip one card's "you reposted this" flag, if it is about this original ──
// The companion to bumpRepostCount, with the same membership rule: the
// original and every repost of it. They share one answer, so they flip
// together — otherwise reposting a post leaves its repost, two cards down the
// feed, still showing an un-filled icon for the very thing you just reposted.
//
// Returns the post untouched by identity when nothing changes, so React can
// skip the re-render.
export function markReposted(post, originalId, value) {
  if (!post || !originalId) return post;
  const isAboutOriginal = post.id === originalId || post.repostOfPostId === originalId;
  if (!isAboutOriginal || post.isReposted === value) return post;
  return { ...post, isReposted: value };
}

export function deriveLikeState(isLiking, prevLikes, drifted) {
  if (drifted || !Number.isFinite(prevLikes)) return null;
  return isLiking
    ? { likes: prevLikes + 1,               isLiked: true  }
    : { likes: Math.max(0, prevLikes - 1),  isLiked: false };
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

    // fetchLikedIds only needs the post IDs, and we already have those from the
    // query above — it never depended on the repost/profile hydration. Running
    // the two branches together instead of end-to-end drops a round trip from
    // every feed load. (Neither attach* adds or removes rows, so the IDs are
    // the same either way.)
    const [rows, likedIds, repostedIds] = await Promise.all([
      attachOriginalPosts(data ?? []).then(attachProfiles),
      fetchLikedIds(userId, (data ?? []).map(r => r.id)),
      fetchRepostedIds(userId, (data ?? []).map(repostTargetId)),
    ]);
    setFeed(rows.map(row => normPost(row, likedIds, repostedIds)));
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

    const [rows, likedIds, repostedIds] = await Promise.all([
      attachOriginalPosts(data ?? []).then(attachProfiles),
      fetchLikedIds(userId, (data ?? []).map(r => r.id)),
      fetchRepostedIds(userId, (data ?? []).map(repostTargetId)),
    ]);
    const newPosts = rows.map(row => normPost(row, likedIds, repostedIds));

    // Dedupe: a post created optimistically (or arriving between pages)
    // could already be in the list
    setFeed(prev => [...prev, ...newPosts.filter(p => !prev.some(q => q.id === p.id))]);
    setLoadingMore(false);
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

    const [rows, likedIds, repostedIds] = await Promise.all([
      attachOriginalPosts(data ?? []).then(attachProfiles),
      fetchLikedIds(viewerUserId, (data ?? []).map(r => r.id)),
      fetchRepostedIds(viewerUserId, (data ?? []).map(repostTargetId)),
    ]);
    return rows.map(row => normPost(row, likedIds, repostedIds));
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

    const [rows, likedIds, repostedIds] = await Promise.all([
      attachOriginalPosts([data]).then(attachProfiles),
      fetchLikedIds(viewerUserId, [data.id]),
      fetchRepostedIds(viewerUserId, [repostTargetId(data)]),
    ]);
    return normPost(rows[0], likedIds, repostedIds);
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
    // You have, by definition, just reposted this — so the new card comes back
    // already marked, rather than waiting for the next fetch to notice.
    const newPost = normPost(enriched, EMPTY_SET, new Set([postId]));

    // The write succeeding IS the confirmation that the count went up, the
    // same argument deriveLikeState makes. The trigger has already moved the
    // authoritative value; this just stops the feed showing yesterday's number
    // until the next fetch.
    //
    // Every card aimed at this original moves together — the original itself,
    // and any repost of it already in the feed, since they all display the
    // original's count. The new repost is built from a row fetched before the
    // trigger fired, so it needs the bump too.
    setFeed(prev => [
      bumpRepostCount(newPost, postId, +1),
      ...prev.map(p => markReposted(bumpRepostCount(p, postId, +1), postId, true)),
    ]);
    return { post: newPost };
  }, []);

  // ── Undo a repost ───────────────────────────────────────────────────────
  // Deletes the repost row this user made of `postId`. posts_delete_own
  // already permits it, so no new policy is needed, and the repost_count
  // trigger's DELETE branch walks the number back down on its own.
  //
  // Worth being explicit about what this removes: a repost is a real post, so
  // undoing one deletes a post — along with any likes or comments it collected
  // while it stood. That is the same thing "Delete Post" does to a repost
  // today; this is a second door to it, not a new behaviour.
  const undoRepost = useCallback(async (postId, userId) => {
    if (!postId || !userId) return null;

    // Returns the deleted rows, so an empty array means there was nothing to
    // undo — someone else's device got there first, or our isReposted was
    // stale. Either way the end state is the one the user wanted.
    const { data, error } = await supabase
      .from('posts')
      .delete()
      .eq('user_id', userId)
      .eq('repost_of_post_id', postId)
      .select('id');

    if (error) {
      console.error('undoRepost error:', error);
      throw error;
    }

    const removedIds = new Set((data ?? []).map(r => r.id));

    setFeed(prev => prev
      // The repost itself leaves the feed.
      .filter(p => !removedIds.has(p.id))
      // Everything still pointing at this original loses one, and stops
      // claiming you reposted it.
      .map(p => markReposted(bumpRepostCount(p, postId, -1), postId, false)));

    return { removed: removedIds.size };
  }, []);

  // ── Like a post ─────────────────────────────────────────────────────────
  // Inserts a per-user like row. A DB trigger updates posts.like_count.
  //
  // prevLikes is the count the caller was displaying before the tap. When it's
  // supplied we derive the new state arithmetically instead of asking the
  // server what it already told us — the insert succeeding IS the confirmation
  // that the count went up by one, and the trigger keeps the authoritative
  // value in sync for the next fetch. Only genuine state drift (the rare 23505
  // below) needs a real read.
  const likePost = useCallback(async (postId, userId, prevLikes) => {
    if (!postId || !userId) return null;

    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: postId, user_id: userId });

    // 23505 = unique violation. Treat it as already liked.
    if (error && error.code !== '23505') throw error;

    // Only notify on a genuinely new like, not a repeat/already-liked call
    if (!error) notifyPostLike(postId, userId);

    // A 23505 means our local "not liked" disagreed with the database, so the
    // count we're holding can't be trusted — deriveLikeState returns null and
    // we fall back to a real read.
    const next = deriveLikeState(true, prevLikes, !!error)
      ?? await fetchPostLikeState(postId, userId);

    setFeed(prev => prev.map(p =>
      p.id === postId ? { ...p, likes: next.likes, isLiked: next.isLiked } : p
    ));

    return next;
  }, []);

  // ── Unlike a post ───────────────────────────────────────────────────────
  // Deletes the per-user like row. A DB trigger updates posts.like_count.
  // Mirrors likePost: the delete reporting a removed row is confirmation
  // enough that the count dropped by one. `.select()` rides along on the same
  // request (no extra round trip) and tells us whether a row was actually
  // there — if it wasn't, our count was already wrong, so we resync.
  const unlikePost = useCallback(async (postId, userId, prevLikes) => {
    if (!postId || !userId) return null;

    const { data: removed, error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)
      .select('post_id');

    if (error) throw error;

    const next = deriveLikeState(false, prevLikes, !removed?.length)
      ?? await fetchPostLikeState(postId, userId);

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
    fetchUserPosts,
    fetchPostById,
    createPost,
    createRepost,
    undoRepost,
    likePost,
    unlikePost,
    deletePost,
    subscribeToNewPosts,
  };
}
