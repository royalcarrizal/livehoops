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

import { useState, useEffect } from 'react';
import { MapPin, Bell } from 'lucide-react';
import Avatar from '../components/Avatar';
import FeedPost from '../components/FeedPost';
import ActiveFriendsRow from '../components/ActiveFriendsRow';
import PostComposer from '../components/PostComposer';
import PhotoViewer from '../components/PhotoViewer';
import CourtDetailSheet from '../components/CourtDetailSheet';
import Toast from '../components/Toast';
import NotificationPanel from '../components/NotificationPanel';
import { useToast } from '../hooks/useToast';
import { useNotifications } from '../hooks/useNotifications';
import { useFriends } from '../hooks/useFriends';
import { usePosts } from '../hooks/usePosts';

// Props:
//   setActiveTab — lets this screen switch to another tab (e.g. Friends tab)
//   user         — the logged-in Supabase user object (has .id)
//   profile      — the user's profile row from Supabase (username, avatar_url, etc.)
export default function HomeScreen({ setActiveTab, user, profile, parks, onViewProfile, onCheckIn, activeCheckIn, checkOut, cityLabel = 'Houston, TX' }) {
  const [feedTab, setFeedTab]       = useState('following');
  const [photoUrl, setPhotoUrl]     = useState(null);
  const [showPanel, setShowPanel]   = useState(false);
  const [newPostCount, setNewPostCount] = useState(0);

  // Court tapped from a feed post — opens CourtDetailSheet
  const [tappedCourtId, setTappedCourtId] = useState(null);
  const tappedCourt = (parks ?? []).find(p => p.id === tappedCourtId) ?? null;

  // Holds posts for the Nearby tab (fetched separately from the Following feed)
  const [nearbyFeed, setNearbyFeed] = useState([]);

  const { toast, showToast } = useToast();

  const {
    unreadCount,
    notifications,
    markAllRead,
  } = useNotifications();

  // ── Real friends data from Supabase ────────────────────────────────────
  // useFriends fetches accepted friends + pending requests for this user
  const { friends, loading: friendsLoading } = useFriends(user?.id);

  // ── Real posts data from Supabase ──────────────────────────────────────
  // usePosts manages loading and creating posts
  const {
    feed:            followingFeed,
    loading:         feedLoading,
    fetchFriendsFeed,
    fetchAllFeed,
    createPost,
    createRepost,
    likePost,
    unlikePost,
    subscribeToNewPosts,
  } = usePosts();

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
  useEffect(() => {
    if (feedTab === 'nearby' && nearbyFeed.length === 0) {
      fetchAllFeed(user?.id).then(posts => setNearbyFeed(posts ?? []));
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
    await createPost(user.id, content, type, image_url, court_id, court_name);
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
    <div className="screen-content">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="screen-header">
        <div className="header-row">
          <h1 className="app-title">Live<span>Hoops</span></h1>

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
        <div className="location-row">
          <MapPin size={13} color="var(--orange)" />
          <span>{cityLabel}</span>
        </div>
      </div>

      {/* ── Active Friends row ──────────────────────────────────────────────── */}
      {/* Shows friends currently checked in at a court. Hidden when none are. */}
      <ActiveFriendsRow friends={friends} setActiveTab={setActiveTab} />

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

      {/* Empty state for Following tab: shown when loaded but no posts found */}
      {!isLoading && feedTab === 'following' && currentFeed.length === 0 && (
        <div className="feed-empty">
          <div style={{ fontSize: 48 }}>🏀</div>
          <div className="feed-empty-title">Your feed is empty</div>
          <div className="feed-empty-sub">
            Add friends to see their check-ins and posts here
          </div>
          {/* Takes the user directly to the Friends tab */}
          <button
            className="auth-submit-btn"
            style={{ marginTop: 16, maxWidth: 200 }}
            onClick={() => setActiveTab('friends')}
          >
            Find Friends
          </button>
        </div>
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
            />
          ))}
        </div>
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
                onClick={() => setActiveTab('friends')}
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
      <PhotoViewer url={photoUrl} onClose={() => setPhotoUrl(null)} />

      {tappedCourt && (
        <CourtDetailSheet
          court={tappedCourt}
          onClose={() => setTappedCourtId(null)}
          onCheckIn={onCheckIn}
          activeCheckIn={activeCheckIn}
          checkOut={checkOut}
          user={user}
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
