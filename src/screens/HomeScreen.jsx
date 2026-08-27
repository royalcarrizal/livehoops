// src/screens/HomeScreen.jsx
//
// The home screen, in two tabs:
//
//   Following — the social feed: friends currently on a court, a composer, and
//               posts from people you follow, ending in "Your Crew".
//   Nearby    — where to play: every nearby court, and the runs scheduled at
//               them over the next week.
//
// Above both sits the live-court strip, so "somebody is hooping right now" is
// visible whichever tab you are on.
//
// Courts DID once live only on the Map and Check screens. As of the redesign
// they are here too — this screen is now the app's front door for both halves
// of the question "where is there a game?".
//
// The old "Nearby = every post in the world" feed is gone; Nearby now means
// courts. Removing it took usePosts.fetchAllFeed with it, which had no other
// caller.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MapPin, Bell, Search } from 'lucide-react';
import Avatar from '../components/Avatar';
import FeedPost from '../components/FeedPost';
import ActiveFriendsRow from '../components/ActiveFriendsRow';
import LiveCourtStrip from '../components/LiveCourtStrip';
import ScheduledRunsList from '../components/ScheduledRunsList';
import ParkCard from '../components/ParkCard';
import PostComposer from '../components/PostComposer';
import Tabs from '../components/Tabs';
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
import CourtLines from '../components/CourtLines';
import { supabase } from '../lib/supabase';
import { sortByDistance } from '../hooks/useCourts';

// How far out "Nearby" reaches. Unchanged from the radius the old all-posts
// feed used, so the word keeps meaning the same distance it always did.
const NEARBY_RADIUS_MILES = 50;

// Props:
//   setActiveTab — lets this screen switch to another tab (e.g. Friends tab)
//   user         — the logged-in Supabase user object (has .id)
//   profile      — the user's profile row from Supabase (username, avatar_url, etc.)
export default function HomeScreen({ setActiveTab, user, profile, parks, onViewProfile, onCheckIn, activeCheckIn, checkOut, cityLabel = 'Nearby', isCheckingIn = false, upcomingMeetups = [], meetupActions, blockUser, refreshCounts }) {
  const [feedTab, setFeedTab]           = useState('following');
  const [photoUrl, setPhotoUrl]         = useState(null);
  const [showPanel, setShowPanel]       = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [newPostCount, setNewPostCount] = useState(0);

  // Court tapped from a feed post — opens CourtDetailSheet
  const [tappedCourtId, setTappedCourtId] = useState(null);
  const tappedCourt = (parks ?? []).find(p => p.id === tappedCourtId) ?? null;

  // Courts with at least one player on them right now.
  const liveCourtCount = (parks ?? []).filter(p => p.players > 0).length;

  // ── Which courts the Nearby tab lists ─────────────────────────────────────
  // Live courts first, then the rest, each group nearest first. The question
  // the tab answers is "where can I play now", so a court with people on it
  // outranks an empty one that happens to be closer.
  //
  // distanceMi is null when GPS is denied. Those are kept, not filtered out —
  // sortByDistance already sinks them below the courts we can locate, and
  // dropping them would empty the tab entirely for anyone who declined the
  // location prompt.
  const nearbyCourts = useMemo(() => {
    const withinRange = (parks ?? []).filter(p =>
      !Number.isFinite(p.distanceMi) || p.distanceMi <= NEARBY_RADIUS_MILES
    );
    return [
      ...sortByDistance(withinRange.filter(p => p.players > 0)),
      ...sortByDistance(withinRange.filter(p => p.players === 0)),
    ];
  }, [parks]);

  const { toast, showToast } = useToast();

  const {
    unreadCount,
    notifications,
    markAllRead,
    clearAll,     // deletes all notifications server-side (panel's "Clear all")
    permission,   // 'default' | 'granted' | 'denied' — drives the prompt
    enablePush,   // asks the browser, registers the token, remembers the choice
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
    createPost,
    createRepost,
    likePost,
    unlikePost,
    deletePost,
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
  // Pulling down refreshes whichever tab you are on: the feed on Following,
  // the live player counts on Nearby.
  const handleRefresh = useCallback(async () => {
    if (feedTab === 'nearby') {
      await refreshCounts?.();
      return;
    }
    const friendIds = friends.map(f => f.userId);
    await fetchFriendsFeed(user?.id, friendIds);
  }, [feedTab, friends, user, fetchFriendsFeed, refreshCounts]);

  // ── Load more ─────────────────────────────────────────────────────────────
  // Only the Following feed paginates — Nearby lists courts, which arrive in
  // one go from useCourts.
  const handleLoadMore = () => loadMoreFriendsFeed();

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
  // The success toast lives in PostComposer now — it's the only place that
  // knows whether an optional check-in rode along, and two toasts firing in
  // sequence would just overwrite each other.
  const handlePost = async ({ type, content, image_url, court_id, court_name }) => {
    await createPost(user.id, content, type, image_url, court_id, court_name, profile);
  };

  // The like handlers used to patch a second copy of the post held by the
  // all-posts feed. With that feed gone, usePosts owns the only copy.
  const handleLikePost   = (postId, prevLikes) => likePost(postId, user.id, prevLikes);
  const handleUnlikePost = (postId, prevLikes) => unlikePost(postId, user.id, prevLikes);
  const handleRepost     = (postId) => createRepost(postId, user.id);

  // Build the user's real initials and avatar for PostComposer + StoriesRow
  const userInitials  = (profile?.username ?? 'PL').slice(0, 2).toUpperCase();
  const userAvatarUrl = profile?.avatar_url ?? null;

  // True while we're still fetching (show skeletons instead of an empty state)
  const isLoading = feedLoading || friendsLoading;

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
      <div className="screen-header screen-header--court">
        <CourtLines variant="home" />
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
          <MapPin size={13} color="var(--accent)" />
          <span>{cityLabel}</span>
          {/* How many courts have someone on them right now (canvas:63). The
              data is already in hand — `parks` is a prop — so this costs a
              filter, not a fetch. Hidden at zero rather than showing
              "0 courts running", which reads as a broken feed. */}
          {liveCourtCount > 0 && (
            <span className="location-row-live">
              · {liveCourtCount} {liveCourtCount === 1 ? 'court' : 'courts'} running
            </span>
          )}
        </div>
      </div>

      {/* ── Notification opt-in prompt ──────────────────────────────────────── */}
      {/* Only renders when permission hasn't been decided and isn't dismissed. */}
      <NotificationPrompt permission={permission} onEnable={enablePush} />

      {/* ── Live courts ─────────────────────────────────────────────────────── */}
      {/* Above the tabs deliberately: a game happening right now is worth       */}
      {/* seeing whichever tab you are reading. Hidden when nothing is running.  */}
      <LiveCourtStrip parks={parks} setActiveTab={setActiveTab} />

      {/* ── Tab toggle ───────────────────────────────────────────────────────── */}
      <Tabs
        className="tabs--flush"
        value={feedTab}
        onChange={setFeedTab}
        tabs={[
          { value: 'following', label: 'Following' },
          { value: 'nearby',    label: 'Nearby' },
        ]}
      />

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

      {/* ══ FOLLOWING TAB ═══════════════════════════════════════════════════ */}
      {feedTab === 'following' && (
        <>
          {/* Friends currently checked in at a court. Hidden when none are. */}
          <ActiveFriendsRow friends={friends} setActiveTab={setActiveTab} />

          <PostComposer
            onPost={handlePost}
            onToast={showToast}
            userId={user?.id}
            userInitials={userInitials}
            userAvatarUrl={userAvatarUrl}
            courts={parks ?? []}
            activeCheckIn={activeCheckIn}
            onCheckIn={onCheckIn}
            isCheckingIn={isCheckingIn}
          />

          {/* Loading: pulsing skeletons rather than a premature empty state */}
          {isLoading && (
            <div className="feed-skeleton">
              <div className="feed-skeleton-card" />
              <div className="feed-skeleton-card" />
              <div className="feed-skeleton-card" />
            </div>
          )}

          {!isLoading && followingFeed.length === 0 && (
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
                  className="btn btn--primary"
                  style={{ marginTop: 20 }}
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

          {!isLoading && followingFeed.length > 0 && (
            <div className="feed-list">
              {followingFeed.map(post => (
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
                  onBlock={blockUser}
                />
              ))}
            </div>
          )}

          {/* Shown when the last fetched page was full — more posts may exist */}
          {!isLoading && followingFeed.length > 0 && feedHasMore && (
            <button
              className="feed-load-more"
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading…' : 'Load more posts'}
            </button>
          )}
        </>
      )}

      {/* ══ NEARBY TAB ══════════════════════════════════════════════════════ */}
      {feedTab === 'nearby' && (
        <>
          {nearbyCourts.length === 0 ? (
            // No courts within range at all. Distinct from "none are busy" —
            // this means there is nothing to check into, so the useful action
            // is adding a court, not waiting for one to fill up.
            <div className="feed-empty">
              <div style={{ fontSize: 48 }}>📍</div>
              <div className="feed-empty-title">No courts nearby</div>
              <div className="feed-empty-sub">
                Nothing within {NEARBY_RADIUS_MILES} miles yet — know a court that
                is missing?
              </div>
              <button
                className="btn btn--primary"
                style={{ marginTop: 20 }}
                onClick={() => setActiveTab('checkin')}
              >
                Add a Court
              </button>
            </div>
          ) : (
            <div className="park-list">
              {nearbyCourts.map(court => (
                <ParkCard
                  key={court.id}
                  park={court}
                  isCheckedIn={activeCheckIn?.courtId === court.id}
                  onCheckIn={onCheckIn}
                />
              ))}
            </div>
          )}

          {/* Runs scheduled at these courts over the next week. Renders
              nothing when there are none. */}
          <ScheduledRunsList
            meetups={upcomingMeetups}
            userId={user?.id}
            setActiveTab={setActiveTab}
          />
        </>
      )}

      {/* ── Your Crew ────────────────────────────────────────────────────────── */}
      {/* Shows up to 5 accepted friends as tappable chips. Following-only —
          Nearby is about places, and a row of people at the end of it reads as
          a leftover from the other tab. */}
      {feedTab === 'following' && friends.length > 0 && (
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
          onClearAll={clearAll}
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
