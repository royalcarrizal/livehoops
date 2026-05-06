// src/screens/ProfileScreen.jsx
//
// The user's public-facing profile page. Redesigned to look like a social
// profile rather than a settings page.
//
// This screen supports two viewing modes:
//   - Owner view  (profile.id === user.id): shows gear icon, Edit Profile, Change Photo
//   - Visitor view (profile.id !== user.id): shows Add Friend instead of Edit Profile;
//                                            gear icon, Edit Profile, and file upload are hidden
//
// Layout (top to bottom):
//   1. Profile header — large avatar, username, 3 stat pills, action buttons
//   2. Tab row — "Posts" and "Check-ins" tabs
//   3. Feed area — viewed user's posts (from Supabase) or check-in stub
//   4. Achievements panel — slides up from bottom when tapped
//   5. Edit Profile sheet — owner only, slides up with form fields
//   6. Settings sheet     — owner only, full settings slide-up

import { useState, useRef, useEffect } from 'react';
import { Settings, X, ChevronLeft } from 'lucide-react';
import { useFriends } from '../hooks/useFriends';
import AchievementsSection from '../components/AchievementsSection';
import Avatar from '../components/Avatar';
import FeedPost from '../components/FeedPost';
import PhotoViewer from '../components/PhotoViewer';
import Toast from '../components/Toast';
import SettingsSheet from '../components/SettingsSheet';
import { useToast } from '../hooks/useToast';
import { usePosts } from '../hooks/usePosts';
import { useStorage } from '../hooks/useStorage';
import { supabase } from '../lib/supabase';

// Props:
//   signOut       — logs the user out (from useAuth in App.jsx)
//   profile       — the Supabase profile row being viewed (username, avatar_url, stats)
//                   This is the VIEWED user's profile — may or may not be the logged-in user.
//   updateProfile — async function to update profile fields in Supabase (owner only)
//   user          — the logged-in Supabase user object (has .id, .email)
export default function ProfileScreen({ signOut, profile, updateProfile, user, onBack, onViewProfile }) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  // Hidden file input — triggered when the owner taps "Change Photo"
  const fileInputRef = useRef(null);

  // ── Build display data from the Supabase profile ──────────────────────────
  // Fill in defaults for any fields that are still null or loading.
  const displayUser = {
    name:          profile?.username      || 'Player',
    initials:      (profile?.username     || 'P').slice(0, 2).toUpperCase(),
    avatarUrl:     profile?.avatar_url    || null,
    checkinCount:  profile?.checkin_count  ?? 0,
    courtsVisited: profile?.courts_visited ?? 0,
    hoursOnCourt:  profile?.hours_played   ?? 0,
    favoriteCourt: profile?.favorite_court || 'None yet',
  };

  // ── Derive ownership ───────────────────────────────────────────────────────
  // profile.id is the UUID of whoever's profile is being shown.
  // user.id is the UUID of whoever is currently logged in.
  // If they match, show owner-only controls (gear, Edit Profile, Change Photo).
  const isOwner = !!profile?.id && profile.id === user?.id;

  // ── State ─────────────────────────────────────────────────────────────────

  // Avatar URL: for the owner, check localStorage first (instant offline), then Supabase.
  // For visitors viewing someone else's profile, always use the profile's avatar_url.
  const [avatarUrl, setAvatarUrl] = useState(
    () => isOwner
      ? (localStorage.getItem('livehoops_avatar') || displayUser.avatarUrl)
      : displayUser.avatarUrl
  );

  // Reset avatarUrl when the profile being viewed changes (e.g. navigating between players)
  useEffect(() => {
    setAvatarUrl(
      isOwner
        ? (localStorage.getItem('livehoops_avatar') || (profile?.avatar_url ?? null))
        : (profile?.avatar_url ?? null)
    );
  }, [profile?.id, profile?.avatar_url, isOwner]);

  // Which feed tab is selected — "posts" or "checkins"
  const [activeTab, setActiveTab]               = useState('posts');

  // Controls whether the achievements slide-up panel is visible
  const [showAchievements, setShowAchievements] = useState(false);

  // Controls whether the edit profile slide-up sheet is visible (owner only)
  const [showEditProfile, setShowEditProfile]   = useState(false);

  // Controls whether the full Settings sheet is open (owner only)
  const [showSettings, setShowSettings]         = useState(false);

  // The viewed user's posts fetched from Supabase
  const [userPosts, setUserPosts]               = useState([]);

  // True while posts are loading (show skeleton cards)
  const [postsLoading, setPostsLoading]         = useState(true);

  // Photo URL for the full-screen photo viewer overlay
  const [photoUrl, setPhotoUrl]                 = useState(null);

  // Edit modal form fields — pre-filled when the modal opens (owner only)
  const [editUsername, setEditUsername]         = useState('');
  const [editFavCourt, setEditFavCourt]         = useState('');

  // True while the Save button is processing
  const [saving, setSaving]                     = useState(false);

  // Toast hook — shows a brief message pill at the bottom
  const { toast, showToast } = useToast();

  // Posts hook — gives us feed loading + real per-user like handlers
  const { fetchUserPosts, createRepost, likePost, unlikePost } = usePosts();

  // Storage hook — gives us uploadAvatar to save photos to Supabase Storage
  const { uploadAvatar } = useStorage();

  // ── Friend status for visitor mode ────────────────────────────────────────
  // Used to show the correct Add Friend / Pending / Friends button state
  // when viewing someone else's profile.
  const {
    friends:      myFriends,
    sentRequests: mySentRequests,
    sendFriendRequest,
  } = useFriends(user?.id);

  const viewedUserId = profile?.id;
  const alreadyFriends = myFriends.some(f => f.userId === viewedUserId);
  const requestPending = mySentRequests.includes(viewedUserId);

  const handleAddFriend = async () => {
    await sendFriendRequest(viewedUserId);
    showToast('Friend request sent!');
  };

  // True while an avatar photo is uploading — shows a spinner over the avatar
  const [avatarUploading, setAvatarUploading] = useState(false);

  // ── Mutual friends + courts (visitor mode only) ───────────────────────────
  const [mutualFriends, setMutualFriends] = useState([]);
  const [mutualCourts,  setMutualCourts]  = useState([]);

  useEffect(() => {
    if (isOwner || !profile?.id || !user?.id) return;

    async function loadMutuals() {
      // Viewed user's accepted friendships
      const { data: viewedFriendships } = await supabase
        .from('friendships')
        .select('requester_id, addressee_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${profile.id},addressee_id.eq.${profile.id}`);

      const viewedFriendIds = new Set(
        (viewedFriendships ?? []).map(f =>
          f.requester_id === profile.id ? f.addressee_id : f.requester_id
        )
      );

      // Intersect with logged-in user's already-loaded friends list
      setMutualFriends(myFriends.filter(f => viewedFriendIds.has(f.userId)));

      // Courts both users have checked into — computed server-side via
      // SECURITY DEFINER RPC so the checkins RLS policy isn't violated.
      const { data: mutualData } = await supabase
        .rpc('get_mutual_courts', { p_other_user_id: profile.id });

      setMutualCourts(
        (mutualData ?? []).map(r => ({ id: r.court_id, name: r.court_name }))
      );
    }

    loadMutuals();
  }, [profile?.id, isOwner, myFriends]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check-in history state ────────────────────────────────────────────────
  // Loaded from Supabase when the user taps the "Check-ins" tab.
  const [checkInHistory, setCheckInHistory]     = useState([]);
  const [historyLoading, setHistoryLoading]     = useState(false);

  // ── Fetch the viewed user's posts when the screen loads ───────────────────
  // We use profile?.id (the viewed user), NOT user.id (the logged-in user),
  // so visiting someone else's profile shows their posts, not the viewer's.
  useEffect(() => {
    if (!profile?.id) return;
    setPostsLoading(true);
    fetchUserPosts(profile.id, user?.id).then(posts => {
      setUserPosts(posts);
      setPostsLoading(false);
    });
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchUserPostLike = (postId, next) => {
    if (!next) return;
    setUserPosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, likes: next.likes, isLiked: next.isLiked }
        : post
    ));
  };

  const handleLikePost = async (postId) => {
    const next = await likePost(postId, user.id);
    patchUserPostLike(postId, next);
    return next;
  };

  const handleUnlikePost = async (postId) => {
    const next = await unlikePost(postId, user.id);
    patchUserPostLike(postId, next);
    return next;
  };

  const handleRepost = async (postId) => {
    const result = await createRepost(postId, user.id);
    if (result?.post && isOwner) {
      setUserPosts(prev => [result.post, ...prev]);
    }
    return result;
  };

  // ── Fetch check-in history when the check-ins tab is opened ──────────────
  // We only load this data on demand (when the tab is visible) to avoid
  // an unnecessary Supabase query every time the profile screen opens.
  // The query joins with the courts table to get the court name for each session.
  useEffect(() => {
    if (activeTab !== 'checkins' || !profile?.id) return;

    async function loadHistory() {
      setHistoryLoading(true);
      const { data } = await supabase
        .from('checkins')
        .select('id, checked_in_at, duration_minutes, courts(name)')
        .eq('user_id', profile.id)
        .eq('is_active', false)
        .order('checked_in_at', { ascending: false })
        .limit(20);

      if (data) setCheckInHistory(data);
      setHistoryLoading(false);
    }

    loadHistory();
  }, [activeTab, profile?.id]);

  // ── Avatar upload handler (owner only) ───────────────────────────────────
  // When the owner picks a photo from the file picker:
  //   1. Validate: reject files over 10 MB or wrong type
  //   2. Show a loading spinner over the avatar circle
  //   3. Compress + upload to Supabase Storage (avatars bucket)
  //   4. Save the returned public URL to Supabase profiles table
  //   5. Update local React state so the new photo appears immediately
  //   6. Save URL to localStorage so it loads instantly on next visit
  //   7. Show a success or error toast
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    // Reset the input so the user can pick the same file again later if needed
    e.target.value = '';
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image too large — please choose a file under 10MB');
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('Please choose a JPEG, PNG, or WebP image');
      return;
    }

    setAvatarUploading(true);

    try {
      const publicUrl = await uploadAvatar(file, user.id);
      await updateProfile({ avatar_url: publicUrl });
      setAvatarUrl(publicUrl);
      localStorage.setItem('livehoops_avatar', publicUrl);
      showToast('✅ Profile photo updated');
    } catch (err) {
      console.error('[LiveHoops] Avatar upload failed:', err);
      showToast('❌ Failed to upload photo — try again');
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── Open the Edit Profile sheet (owner only) ──────────────────────────────
  // Pre-fills the form fields with the current profile values
  const openEditProfile = () => {
    setEditUsername(displayUser.name);
    setEditFavCourt(displayUser.favoriteCourt);
    setShowEditProfile(true);
  };

  // ── Save profile changes (owner only) ─────────────────────────────────────
  // Sends updated fields to Supabase via the updateProfile prop
  const handleSaveProfile = async () => {
    setSaving(true);
    const { error } = await updateProfile({
      username:       editUsername.trim(),
      favorite_court: editFavCourt.trim(),
    });
    setSaving(false);
    if (error) {
      showToast('❌ Failed to save');
    } else {
      showToast('✅ Profile updated!');
      setShowEditProfile(false);
    }
  };

  return (
    <div className="screen-content">

      {/* ── Profile Header ──────────────────────────────────────────────────── */}
      {/* Centered column: avatar → username → stat pills → action buttons */}
      <div className="profile-header">

        {/* Back button — only shown in visitor mode */}
        {onBack && (
          <button
            className="profile-back-btn"
            onClick={onBack}
            aria-label="Go back"
          >
            <ChevronLeft size={22} strokeWidth={2.5} />
            <span>Back</span>
          </button>
        )}

        {/* Gear icon — only visible to the profile owner */}
        {isOwner && (
          <button
            className="gear-btn"
            onClick={() => setShowSettings(true)}
            aria-label="Settings"
          >
            <Settings size={20} strokeWidth={2} />
          </button>
        )}

        {/* Large centered avatar (80px) */}
        <div className="profile-avatar-wrap">
          <Avatar
            avatarUrl={avatarUrl}
            initials={displayUser.initials}
            size="large"
          />
        </div>

        {/* Username — large bold text */}
        <div className="profile-username">{displayUser.name}</div>

        {/* 3 stat pills showing the user's key numbers */}
        <div className="profile-stats-row">
          <div className="profile-stat-pill">
            <div className="profile-stat-value">{displayUser.checkinCount}</div>
            <div className="profile-stat-label">Check-ins</div>
          </div>
          <div className="profile-stat-pill">
            <div className="profile-stat-value">{displayUser.courtsVisited}</div>
            <div className="profile-stat-label">Courts</div>
          </div>
          <div className="profile-stat-pill">
            <div className="profile-stat-value">{displayUser.hoursOnCourt}h</div>
            <div className="profile-stat-label">Hours</div>
          </div>
        </div>

        {/* Two action buttons side by side */}
        <div className="profile-action-row">
          {/* Achievements — shown to everyone */}
          <button
            className="profile-action-btn outlined"
            onClick={() => setShowAchievements(true)}
          >
            Achievements
          </button>

          {/* Edit Profile — owner only. Visitors see friend status button instead. */}
          {isOwner ? (
            <button
              className="profile-action-btn filled"
              onClick={openEditProfile}
            >
              Edit Profile
            </button>
          ) : alreadyFriends ? (
            <button className="profile-action-btn filled" disabled>
              Friends ✓
            </button>
          ) : requestPending ? (
            <button className="profile-action-btn filled" disabled style={{ opacity: 0.6 }}>
              Pending
            </button>
          ) : (
            <button className="profile-action-btn filled" onClick={handleAddFriend}>
              Add Friend
            </button>
          )}
        </div>
      </div>

      {/* ── Mutual friends + courts — visitor mode only ─────────────────────── */}
      {!isOwner && (mutualFriends.length > 0 || mutualCourts.length > 0) && (
        <div className="mutual-section">

          {mutualFriends.length > 0 && (
            <div className="mutual-block">
              <div className="mutual-label">
                {mutualFriends.length} mutual {mutualFriends.length === 1 ? 'friend' : 'friends'}
              </div>
              <div className="mutual-avatars">
                {mutualFriends.slice(0, 5).map(f => (
                  <Avatar key={f.userId} avatarUrl={f.avatarUrl} initials={f.initials} size="small" />
                ))}
                {mutualFriends.length > 5 && (
                  <div className="mutual-overflow">+{mutualFriends.length - 5}</div>
                )}
              </div>
            </div>
          )}

          {mutualCourts.length > 0 && (
            <div className="mutual-block">
              <div className="mutual-label">
                {mutualCourts.length} court{mutualCourts.length !== 1 ? 's' : ''} in common
              </div>
              <div className="mutual-courts-list">
                {mutualCourts.slice(0, 3).map(court => (
                  <span key={court.id} className="mutual-court-chip">🏀 {court.name}</span>
                ))}
                {mutualCourts.length > 3 && (
                  <span className="mutual-court-chip">+{mutualCourts.length - 3} more</span>
                )}
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Tab row: Posts | Check-ins ──────────────────────────────────────── */}
      <div className="profile-tabs">
        <button
          className={`profile-tab${activeTab === 'posts' ? ' active' : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          Posts
        </button>
        <button
          className={`profile-tab${activeTab === 'checkins' ? ' active' : ''}`}
          onClick={() => setActiveTab('checkins')}
        >
          Check-ins
        </button>
      </div>

      {/* ── Posts tab content ────────────────────────────────────────────────── */}
      {activeTab === 'posts' && (
        <div className="profile-posts">

          {/* Loading state: 2 pulsing skeleton cards */}
          {postsLoading && (
            <div className="feed-skeleton">
              <div className="feed-skeleton-card" />
              <div className="feed-skeleton-card" />
            </div>
          )}

          {/* Empty state: no posts yet */}
          {!postsLoading && userPosts.length === 0 && (
            <div className="feed-empty">
              <div style={{ fontSize: 48 }}>🏀</div>
              <div className="feed-empty-title">No posts yet</div>
              <div className="feed-empty-sub">
                {isOwner ? 'Your posts will appear here' : 'No posts yet'}
              </div>
            </div>
          )}

          {/* Actual posts — rendered with the FeedPost component */}
          {!postsLoading && userPosts.length > 0 && (
            <div className="feed-list">
              {userPosts.map(post => (
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
                  onLike={handleLikePost}
                  onUnlike={handleUnlikePost}
                  onRepost={handleRepost}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Check-ins tab content ────────────────────────────────────────────── */}
      {/* Shows real past check-in sessions loaded from the checkins table.    */}
      {/* Each row shows the court name, date, and how long the session lasted. */}
      {activeTab === 'checkins' && (
        <div className="profile-posts">
          {historyLoading ? (
            // Same pulsing skeleton cards used on the feed while loading
            [1, 2, 3].map(i => <div key={i} className="feed-skeleton-card" />)
          ) : checkInHistory.length === 0 ? (
            // Empty state — first time or no completed check-ins yet
            <div className="feed-empty">
              <div style={{ fontSize: 48 }}>🏀</div>
              <div className="feed-empty-title">No check-ins yet</div>
              <div className="feed-empty-sub">
                {isOwner ? 'Find a court and get started' : 'No check-ins yet'}
              </div>
            </div>
          ) : (
            // Real check-in rows from Supabase
            checkInHistory.map(item => (
              <div key={item.id} className="checkin-history-row">
                {/* Court name from the courts table join */}
                <div className="checkin-history-court">
                  {item.courts?.name ?? 'Unknown Court'}
                </div>
                {/* Date + duration (e.g. "Apr 21 · 45 min") */}
                <div className="checkin-history-meta">
                  {new Date(item.checked_in_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                  {item.duration_minutes ? ` · ${item.duration_minutes} min` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Bottom spacer so content doesn't sit flush against the nav bar */}
      <div style={{ height: 24 }} />

      {/* ── Shared overlay for achievements + edit profile sheets ────────────── */}
      {/* Fades in when either sheet opens. Tapping it dismisses both. */}
      <div
        className={`achievements-overlay${showAchievements || showEditProfile ? ' open' : ''}`}
        onClick={() => { setShowAchievements(false); setShowEditProfile(false); }}
      />

      {/* ── Achievements slide-up panel — visible to everyone ────────────────── */}
      <div className={`achievements-sheet${showAchievements ? ' open' : ''}`}>
        <div className="achievements-sheet-header">
          <span>Achievements</span>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, display: 'flex' }}
            onClick={() => setShowAchievements(false)}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} />
          </button>
        </div>
        <AchievementsSection userStats={displayUser} />
      </div>

      {/* ── Owner-only UI: Edit Profile sheet, file input, Settings sheet ──────── */}
      {/* None of this is rendered at all when viewing someone else's profile.     */}
      {isOwner && (
        <>
          {/* Edit Profile slide-up sheet */}
          <div className={`edit-profile-sheet${showEditProfile ? ' open' : ''}`}>

            {/* Header row: title + close button */}
            <div className="achievements-sheet-header" style={{ padding: '0 0 16px' }}>
              <span>Edit Profile</span>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, display: 'flex' }}
                onClick={() => setShowEditProfile(false)}
                aria-label="Close"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            {/* Avatar section — shows current photo with a spinner and Change Photo button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <Avatar
                  avatarUrl={avatarUrl}
                  initials={displayUser.initials}
                  size="large"
                  cameraOverlay={!avatarUploading}
                />
                {/* Spinner overlay — only visible while a photo is uploading */}
                {avatarUploading && (
                  <div className="avatar-upload-loading">
                    <div className="avatar-upload-spinner" />
                  </div>
                )}
              </div>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: avatarUploading ? 'var(--text-secondary)' : 'var(--orange)',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: avatarUploading ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
                onClick={() => !avatarUploading && fileInputRef.current?.click()}
                disabled={avatarUploading}
              >
                {avatarUploading ? 'Uploading…' : 'Change Photo'}
              </button>
            </div>

            {/* Username input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Username
              </label>
              <input
                type="text"
                value={editUsername}
                onChange={e => setEditUsername(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--separator-strong)',
                  borderRadius: 10,
                  color: 'var(--text-primary)',
                  fontSize: 15,
                  fontFamily: 'var(--font)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Favorite Court input */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Favorite Court
              </label>
              <input
                type="text"
                value={editFavCourt}
                onChange={e => setEditFavCourt(e.target.value)}
                placeholder="e.g. Rucker Park"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--separator-strong)',
                  borderRadius: 10,
                  color: 'var(--text-primary)',
                  fontSize: 15,
                  fontFamily: 'var(--font)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Save / Cancel buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="profile-action-btn filled"
                onClick={() => setShowEditProfile(false)}
              >
                Cancel
              </button>
              <button
                className="auth-submit-btn"
                style={{ flex: 1, opacity: saving ? 0.6 : 1 }}
                onClick={handleSaveProfile}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Hidden file input — triggered by the "Change Photo" button above */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {/* Settings slide-up sheet */}
          <SettingsSheet
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            user={user}
            signOut={signOut}
            onEditProfile={openEditProfile}
          />
        </>
      )}

      {/* Full-screen photo viewer — available to all viewers */}
      <PhotoViewer url={photoUrl} onClose={() => setPhotoUrl(null)} />

      {/* Toast notification pill — auto-dismisses after 2.5 seconds */}
      <Toast message={toast} />
    </div>
  );
}
