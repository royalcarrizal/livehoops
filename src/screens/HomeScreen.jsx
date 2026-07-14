// src/screens/HomeScreen.jsx
//
// The main home feed screen. Shows:
//   - A horizontal "stories" row of friends' avatars
//   - A text box to write and post status updates
//   - A "Following" tab (posts from friends only) and "Nearby" tab (all posts)
//   - A "Your Crew" section showing accepted friends
//   - A list of nearby basketball courts
//
// Data is now loaded from Supabase using the useFriends and usePosts hooks.
// Mock data is no longer used.

import { useState, useEffect, useCallback } from 'react';
import { MapPin, Bell, Search } from 'lucide-react';
import Avatar from '../components/Avatar';
import FeedPost from '../components/FeedPost';
import ActiveFriendsRow from '../components/ActiveFriendsRow';
import UpcomingMeetupsRow from '../components/UpcomingMeetupsRow';
import PostComposer from '../components/PostComposer';
import PhotoViewer from '../components/PhotoViewer';
import CourtDetailSheet from '../components/CourtDetailSheet';
import DiscoverSheet from '../components/DiscoverSheet';
import Toast from '../components/Toast';
import NotificationPanel from '../components/NotificationPanel';
import NotificationPrompt from '../components/NotificationPrompt';
import { useToast } from '../hooks/useToast';
import { useNotifications } from '../hooks/useNotifications';
import { useFriends } from '../hooks/useFriends';
import { usePosts } from '../hooks/usePosts';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { supabase } from '../lib/supabase';

// Props:
//   setActiveTab — lets this screen switch to another tab (e.g. Friends tab)
//   user         — the logged-in Supabase user object (has .id)
//   profile      — the user's profile row from Supabase (username, avatar_url, etc.)
export default function HomeScreen({ setActiveTab, user, profile, parks, onViewProfile, onCheckIn, activeCheckIn, checkOut, cityLabel = 'Nearby', isCheckingIn = false, upcomingMeetups = [], meetupActions }) {
  const [feedTab, setFeedTab]           = useState('following');
  const [photoUrl, setPhotoUrl]         = useState(null);
  const [showPanel, setShowPanel]       = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [newPostCount, setNewPostCount] = useState(0);

  // Court tapped from a feed post — opens CourtDetailSheet
  const [tappedCourtId, setTappedCourtId] = useState(null);
  const tappedCourt = (parks ?? []).find(p => p.id === tappedCourtId) ?? null;

  // Holds posts for the Nearby tab (fetched separately from the Following feed)
  const [nearbyFeed, setNearbyFeed] = useState([]);
  // Nearby pagination: raw-row offset for the next page + whether more exist
  const [nearbyOffset, setNearbyOffset]           = useState(0);
  const [nearbyHasMore, setNearbyHasMore]         = useState(false);
  const [nearbyLoadingMore, setNearbyLoadingMore] = useState(false);

  const { toast, showToast } = useToast();

  const {
    unreadCount,
    notifications,
    markAllRead,
    permission,        // 'default' | 'granted' | 'denied' — drives the prompt
    requestPermission, // asks the browser AND registers this device's token
  } = useNotifications(user?.id); // userId → registers this device's push token

  // ── Real friends data from Supabase ────────────────────────────────────
  // useFriends fetches accepted friends + pending requests for this user
  const { friends, loading: friendsLoading } = useFriends(user?.id);

  // ── Real posts data from Supabase ──────────────────────────────────────
  // usePosts manages loading and creating posts
  const {
    feed:            followingFeed,
    loading:         feedLoading,
    feedHasMore,
    loadingMore,
    loadMoreFriendsFeed,
    fetchFriendsFeed,
    fetchAllFeed,
    createPost,
    createRepost,
    likePost,
    unlikePost,
    deletePost,
    subscribeToNewPosts,
  } = usePosts();

  // ── Nearby distance filter ────────────────────────────────────────────────
  // "Nearby" now means it: posts tagged with a court more than 50 miles away
  // are dropped. Untagged posts (no location to judge) and posts whose court
  // distance is unknown (GPS denied → parks show "—") are kept, so the tab
  // never goes empty just because location is unavailable.
  const NEARBY_RADIUS_MILES = 50;
  const applyNearbyFilter = useCallback((posts) => {
    return (posts ?? []).filter(post => {
      if (!post.courtId) return true;
      const park = (parks ?? []).find(p => p.id === post.courtId);
      if (!park || !park.distance || park.distance === '—') return true;
      const miles = parseFloat(park.distance.replace('<', ''));
      if (Number.isNaN(miles)) return true;
      return miles <= NEARBY_RADIUS_MILES;
    });
  }, [parks]);

  // ── Load the Following feed when friends list is ready ──────────────────
  // We wait until we know who the friends are, then fetch their posts.
  // This runs again if the friends list changes (e.g. new friend accepted).
  useEffect(() => {
    if (!user?.id) return;
    // Don't run until we know whether the user has friends or not
    if (friendsLoading) return;
    const friendIds = friends.map(f => f.userId);
    fetchFriendsFeed(user.id, friendIds);
  }, [friends, friendsLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load the Nearby feed when the user switches to that tab ────────────
  // friendIds let the feed include friends-only posts from your friends.
  useEffect(() => {
    if (feedTab === 'nearby' && nearbyFeed.length === 0) {
      const friendIds = friends.map(f => f.userId);
      fetchAllFeed(user?.id, friendIds).then(({ posts, rawCount, hasMore }) => {
        setNearbyFeed(applyNearbyFilter(posts));
        setNearbyOffset(rawCount);
        setNearbyHasMore(hasMore);
      });
    }
  }, [feedTab, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time subscription for new posts ────────────────────────────────
  // Listens for INSERT events on the posts table. When a new post arrives
  // from a friend or the logged-in user, increments the newPostCount so the
  // "↑ N new posts" pill appears at the top of the Following feed.
  // The subscription is closed cleanly when the component unmounts or when
  // the friends list changes (a new friend means a new relevant user ID set).
  useEffect(() => {
    if (!user?.id || friendsLoading) return;
    const friendIds = friends.map(f => f.userId);
    const unsubscribe = subscribeToNewPosts(
      user.id,
      friendIds,
      () => setNewPostCount(n => n + 1)
    );
    return unsubscribe;
  }, [friends, friendsLoading, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pull-to-refresh ────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    const friendIds = friends.map(f => f.userId);
    if (feedTab === 'following') {
      await fetchFriendsFeed(user?.id, friendIds);
    } else {
      const { posts, rawCount, hasMore } = await fetchAllFeed(user?.id, friendIds);
      setNearbyFeed(applyNearbyFilter(posts));
      setNearbyOffset(rawCount);
      setNearbyHasMore(hasMore);
    }
  }, [feedTab, friends, user, fetchFriendsFeed, fetchAllFeed, applyNearbyFilter]);

  // ── Load more (both tabs) ─────────────────────────────────────────────────
  const handleLoadMore = async () => {
    if (feedTab === 'following') {
      await loadMoreFriendsFeed();
      return;
    }
    if (nearbyLoadingMore) return;
    setNearbyLoadingMore(true);
    const friendIds = friends.map(f => f.userId);
    const { posts, rawCount, hasMore } = await fetchAllFeed(user?.id, friendIds, nearbyOffset);
    setNearbyOffset(prev => prev + rawCount);
    setNearbyHasMore(hasMore);
    setNearbyFeed(prev => [
      ...prev,
      ...applyNearbyFilter(posts).filter(p => !prev.some(q => q.id === p.id)),
    ]);
    setNearbyLoadingMore(false);
  };

  const { containerRef, pullDistance, refreshing } = usePullToRefresh(handleRefresh);

  // ── Bell button handler ─────────────────────────────────────────────────
  const handleBellClick = () => {
    if (!showPanel) markAllRead();
    setShowPanel(v => !v);
  };

  // ── Post composer handler ───────────────────────────────────────────────
  // Called by PostComposer after it has already uploaded any attached image.
  // image_url is the Supabase Storage public URL, or null for text-only posts.
  // We re-throw on error so PostComposer's catch block can show the error toast.
  const handlePost = async ({ type, content, image_url, court_id, court_name }) => {
    await createPost(user.id, content, type, image_url, court_id, court_name, profile);
    showToast('✅ Posted!');
  };

  const patchNearbyPostLike = (postId, next) => {
    if (!next) return;
    setNearbyFeed(prev => prev.map(post =>
      post.id === postId
        ? { ...post, likes: next.likes, isLiked: next.isLiked }
        : post
    ));
  };

  const handleLikePost = async (postId) => {
    const next = await likePost(postId, user.id);
    patchNearbyPostLike(postId, next);
    return next;
  };

  const handleUnlikePost = async (postId) => {
    const next = await unlikePost(postId, user.id);
    patchNearbyPostLike(postId, next);
    return next;
  };

  const handleRepost = async (postId) => {
    return createRepost(postId, user.id);
  };

  // Build the user's real initials and avatar for PostComposer + StoriesRow
  const userInitials  = (profile?.username ?? 'PL').slice(0, 2).toUpperCase();
  const userAvatarUrl = profile?.avatar_url ?? null;

  // Which posts to render depends on the active tab
  const currentFeed = feedTab === 'following' ? followingFeed : nearbyFeed;

  // True while we're still fetching (show skeletons instead of an empty state)
  const isLoading = feedLoading || (feedTab === 'following' && friendsLoading);

  return (
    <div className="screen-content" ref={containerRef}>

      {/* ── Pull-to-refresh indicator ──────────────────────────────────────── */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="ptr-indicator"
          style={{ height: refreshing ? 52 : pullDistance * 0.6 }}
        >
          <div className={`ptr-spinner${refreshing ? ' spinning' : ''}`}
               style={{ opacity: refreshing ? 1 : pullDistance / 72 }} />
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="screen-header">
        <div className="header-row">
          <h1 className="app-title">Live<span>Hoops</span></h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Search / Discover icon */}
          <button
            className="icon-btn"
            onClick={() => setShowDiscover(true)}
            aria-label="Search players"
          >
            <Search size={18} strokeWidth={2} />
          </button>

          {/* Bell icon — shows unread count badge */}
          <button
            className="icon-btn"
            onClick={handleBellClick}
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
            style={{ position: 'relative' }}
          >
            <Bell size={18} strokeWidth={2} />
            {unreadCount > 0 && (
              <span className="bell-badge">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          </div>
        </div>
        <div className="location-row">
          <MapPin size={13} color="var(--orange)" />
          <span>{cityLabel}</span>
        </div>
      </div>

      {/* ── Notification opt-in prompt ──────────────────────────────────────── */}
      {/* Only renders when permission hasn't been decided and isn't dismissed. */}
      <NotificationPrompt permission={permission} onEnable={requestPermission} />

      {/* ── Active Friends row ──────────────────────────────────────────────── */}
      {/* Shows friends currently checked in at a court. Hidden when none are. */}
      <ActiveFriendsRow friends={friends} setActiveTab={setActiveTab} />

      {/* ── Upcoming Runs row ───────────────────────────────────────────────── */}
      {/* Scheduled meetups at courts. Tapping one flies the Map to that court. */}
      {/* Hidden when there are none. */}
      <UpcomingMeetupsRow meetups={upcomingMeetups} setActiveTab={setActiveTab} />

      {/* ── Post composer ────────────────────────────────────────────────────── */}
      {/* Pass the user's real initials and avatar */}
      <PostComposer
        onPost={handlePost}
        onToast={showToast}
        userId={user?.id}
        userInitials={userInitials}
        userAvatarUrl={userAvatarUrl}
        courts={parks ?? []}
      />

      {/* ── Feed tab toggle ──────────────────────────────────────────────────── */}
      <div className="feed-tab-row">
        <button
          className={`feed-tab-btn${feedTab === 'following' ? ' active' : ''}`}
          onClick={() => setFeedTab('following')}
        >
          Following
        </button>
        <button
          className={`feed-tab-btn${feedTab === 'nearby' ? ' active' : ''}`}
          onClick={() => setFeedTab('nearby')}
        >
          Nearby
        </button>
      </div>

      {/* ── New posts pill ───────────────────────────────────────────────────── */}
      {/* Appears when Supabase Realtime detects a new post from a friend.      */}
      {/* Tapping it re-fetches the feed and resets the counter.                */}
      {newPostCount > 0 && feedTab === 'following' && (
        <button
          className="feed-new-posts-pill"
          onClick={() => {
            const friendIds = friends.map(f => f.userId);
            fetchFriendsFeed(user.id, friendIds);
            setNewPostCount(0);
          }}
        >
          ↑ {newPostCount} new {newPostCount === 1 ? 'post' : 'posts'}
        </button>
      )}

      {/* ── Feed area ────────────────────────────────────────────────────────── */}

      {/* Loading state: show 3 pulsing skeleton cards while data arrives */}
      {isLoading && (
        <div className="feed-skeleton">
          <div className="feed-skeleton-card" />
          <div className="feed-skeleton-card" />
          <div className="feed-skeleton-card" />
        </div>
      )}

      {/* Empty state for Following tab */}
      {!isLoading && feedTab === 'following' && currentFeed.length === 0 && (
        friends.length === 0 ? (
          // No friends yet — onboarding prompt
          <div className="feed-empty">
            <div style={{ fontSize: 48 }}>🏀</div>
            <div className="feed-empty-title">Welcome to LiveHoops!</div>
            <div className="feed-empty-sub">
              Connect with players to see their check-ins and posts here
            </div>
            <div className="feed-empty-steps">
              <div className="feed-empty-step">
                <span className="feed-empty-step-num">1</span>
                <span>Find players by username</span>
              </div>
              <div className="feed-empty-step">
                <span className="feed-empty-step-num">2</span>
                <span>Send a friend request</span>
              </div>
              <div className="feed-empty-step">
                <span className="feed-empty-step-num">3</span>
                <span>See their courts &amp; posts</span>
              </div>
            </div>
            <button
              className="auth-submit-btn"
              style={{ marginTop: 20, maxWidth: 220 }}
              onClick={() => setActiveTab('friends')}
            >
              Find Players
            </button>
          </div>
        ) : (
          // Has friends but they haven't posted yet
          <div className="feed-empty">
            <div style={{ fontSize: 48 }}>🏀</div>
            <div className="feed-empty-title">Nothing posted yet</div>
            <div className="feed-empty-sub">
              Your crew hasn't posted anything — be the first!
            </div>
          </div>
        )
      )}

      {/* Empty state for Nearby tab */}
      {!isLoading && feedTab === 'nearby' && currentFeed.length === 0 && (
        <div className="feed-empty">
          <div style={{ fontSize: 48 }}>🏀</div>
          <div className="feed-empty-title">No posts yet</div>
          <div className="feed-empty-sub">
            Be the first to post something from the court
          </div>
        </div>
      )}

      {/* Actual feed posts — only rendered when not loading and there are posts */}
      {!isLoading && currentFeed.length > 0 && (
        <div className="feed-list">
          {currentFeed.map(post => (
            <FeedPost
              key={post.id}
              post={post}
              onPhotoTap={setPhotoUrl}
              onToast={showToast}
              currentUser={{
                id:        user?.id,
                username:  profile?.username ?? '',
                avatarUrl: profile?.avatar_url ?? null,
              }}
              onViewProfile={onViewProfile}
              onCourtTap={setTappedCourtId}
              onLike={handleLikePost}
              onUnlike={handleUnlikePost}
              onRepost={handleRepost}
              onDelete={deletePost}
              onReport={async (postId) => {
                try {
                  await supabase.from('post_reports').insert({ post_id: postId, reported_by: user.id });
                } catch { /* silent — toast shown by FeedPost */ }
              }}
            />
          ))}
        </div>
      )}

      {/* ── Load more posts ──────────────────────────────────────────────────── */}
      {/* Shown when the last fetched page was full — more posts may exist */}
      {!isLoading && currentFeed.length > 0 &&
        (feedTab === 'following' ? feedHasMore : nearbyHasMore) && (
        <button
          className="feed-load-more"
          onClick={handleLoadMore}
          disabled={feedTab === 'following' ? loadingMore : nearbyLoadingMore}
        >
          {(feedTab === 'following' ? loadingMore : nearbyLoadingMore)
            ? 'Loading…'
            : 'Load more posts'}
        </button>
      )}

      {/* ── Your Crew ────────────────────────────────────────────────────────── */}
      {/* Shows up to 5 accepted friends as tappable chips */}
      {friends.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 8 }}>
            <span className="section-title">Your Crew</span>
            <button className="section-action" onClick={() => setActiveTab('friends')}>
              See all
            </button>
          </div>
          <div className="crew-row">
            {friends.slice(0, 5).map((friend) => (
              <button
                key={friend.userId}
                className="crew-chip"
                onClick={() => onViewProfile?.(friend.userId)}
              >
                <Avatar
                  avatarUrl={friend.avatarUrl}
                  initials={friend.initials}
                  size="small"
                />
                {/* Show just the first "word" of their username */}
                <div className="crew-chip-name">
                  {(friend.username ?? 'Player').split('_')[0]}
                </div>
                <div className={`crew-chip-court${friend.isActive ? ' active' : ' offline'}`}>
                  {friend.isActive ? '🏀 On the court' : 'Offline'}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* 24px gap so the last section doesn't sit flush against the bottom nav bar */}
      <div style={{ height: 24 }} />

      {/* ── Modals & overlays ────────────────────────────────────────────────── */}

      {showDiscover && (
        <DiscoverSheet
          userId={user?.id}
          onClose={() => setShowDiscover(false)}
          onViewProfile={(uid) => { setShowDiscover(false); onViewProfile?.(uid); }}
        />
      )}

      <PhotoViewer url={photoUrl} onClose={() => setPhotoUrl(null)} />

      {tappedCourt && (
        <CourtDetailSheet
          court={tappedCourt}
          onClose={() => setTappedCourtId(null)}
          onCheckIn={onCheckIn}
          activeCheckIn={activeCheckIn}
          checkOut={checkOut}
          user={user}
          isCheckingIn={isCheckingIn}
          onViewProfile={(uid) => { setTappedCourtId(null); onViewProfile?.(uid); }}
          meetupActions={meetupActions}
          onToast={showToast}
        />
      )}

      {showPanel && (
        <NotificationPanel
          notifications={notifications}
          onClose={() => setShowPanel(false)}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
