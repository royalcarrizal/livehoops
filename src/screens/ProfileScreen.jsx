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
import { Settings, X, ChevronLeft, Map, UserX, ChevronDown, MapPin } from 'lucide-react';
import { useFriends } from '../hooks/useFriends';
import AchievementsSection from '../components/AchievementsSection';
import Avatar from '../components/Avatar';
import FeedPost from '../components/FeedPost';
import PhotoViewer from '../components/PhotoViewer';
import Toast from '../components/Toast';
import { BIO_MAX_LENGTH, bioLength, clampBio, normalizeBio } from '../utils/bio';
import { profileHasColumn, pickSupportedUpdates } from '../utils/profileSchema';
import { POSITIONS, togglePosition, normalizePositions, formatPositions } from '../utils/positions';
import CourtPickerSheet from '../components/CourtPickerSheet';
import SettingsSheet from '../components/SettingsSheet';
import BlockUserConfirm from '../components/BlockUserConfirm';
import { useToast } from '../hooks/useToast';
import { usePosts } from '../hooks/usePosts';
import { useStorage } from '../hooks/useStorage';
import CourtLines from '../components/CourtLines';
import Tabs from '../components/Tabs';
import { supabase } from '../lib/supabase';

// Props:
//   signOut       — logs the user out (from useAuth in App.jsx)
//   profile       — the Supabase profile row being viewed (username, avatar_url, stats)
//                   This is the VIEWED user's profile — may or may not be the logged-in user.
//   updateProfile — async function to update profile fields in Supabase (owner only)
//   user          — the logged-in Supabase user object (has .id, .email)
//   onNavigateTab — switches the APP to another tab (home/map/etc); used by
//                   the Check-ins tab's "Map" button to jump to a past court.
//                   Named distinctly from the local activeTab/setActiveTab
//                   state below, which only toggles this screen's Posts vs.
//                   Check-ins view.
export default function ProfileScreen({ signOut, profile, updateProfile, user, onBack, onViewProfile, onNavigateTab, blockedIds, blockedUsers, blockUser, unblockUser, blockedLoadFailed, refreshBlocked, courts = [] }) {
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
    // Jersey number: 0 is valid and falsy, so keep null distinct from a set 0.
    jerseyNumber:  profile?.jersey_number ?? null,
    // Bio: null means "not set" and the header omits the line entirely rather
    // than rendering an empty gap. An all-whitespace bio counts as not set.
    bio:           profile?.bio?.trim() || null,
    // Normalised on read as well as write — this row is also another player's
    // profile, and rendering is the wrong place to discover bad data.
    positions:     normalizePositions(profile?.positions),
    // Resolved against the loaded court list rather than stored denormalised,
    // so a court that gets renamed reads correctly everywhere at once.
    homeCourt:     profile?.home_court_id
      ? courts.find(c => c.id === profile.home_court_id) ?? null
      : null,
  };

  // Whether supabase/profile_bio.sql has been applied yet. Migrations here are
  // run by hand, so the deployed app can be ahead of the database. Rather than
  // show a field that would silently fail to save, the bio UI stays dormant
  // until the column actually exists. See utils/profileSchema.js.
  const bioEnabled = profileHasColumn(profile, 'bio');
  const positionsEnabled = profileHasColumn(profile, 'positions');
  const homeCourtEnabled = profileHasColumn(profile, 'home_court_id');

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
  const [editJersey, setEditJersey]             = useState('');
  const [editBio, setEditBio]                   = useState('');
  const [editPositions, setEditPositions]       = useState([]);
  const [editHomeCourtId, setEditHomeCourtId]   = useState(null);
  const [showCourtPicker, setShowCourtPicker]   = useState(false);

  // The court currently chosen in the *editor*, which is not necessarily the
  // saved one — resolved from the same list the picker offers.
  //
  // This has to sit BELOW the useState above, not up with the other derived
  // values. `const` is hoisted but not initialised, so reading it earlier in
  // the function body threw "Cannot access 'editHomeCourtId' before
  // initialization" on every render and took the whole screen down.
  const selectedHomeCourt = editHomeCourtId
    ? courts.find(c => c.id === editHomeCourtId) ?? null
    : null;

  // True while the Save button is processing
  const [saving, setSaving]                     = useState(false);

  // Toast hook — shows a brief message pill at the bottom
  const { toast, showToast } = useToast();

  // Posts hook — gives us feed loading + real per-user like handlers
  const { fetchUserPosts, createRepost, likePost, unlikePost, deletePost } = usePosts();

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
  const isBlocked = !isOwner && !!viewedUserId && !!blockedIds?.has(viewedUserId);

  // Block/unblock confirmation dialog + toast, shared with the other two
  // block entry points (FeedPost options sheet, DMThread header) via
  // BlockUserConfirm.
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const handleBlock = async () => {
    try {
      await blockUser?.(viewedUserId);
      setShowBlockConfirm(false);
      showToast(`Blocked ${displayUser.name}`);
    } catch {
      showToast('Failed to block — try again');
    }
  };
  const handleUnblock = async () => {
    try {
      await unblockUser?.(viewedUserId);
      showToast(`Unblocked ${displayUser.name}`);
    } catch {
      showToast('Failed to unblock — try again');
    }
  };

  // ── Profile visibility gate ───────────────────────────────────────────────
  // Respects the viewed user's Profile Visibility privacy setting:
  //   'public'  — everyone sees posts, stats, achievements, mutuals
  //   'friends' — only their friends (and themselves) see that content
  //   'private' — same as friends, plus they're hidden from search
  // When locked, visitors see only the avatar, username, and an Add Friend
  // button — posts, stats, and mutuals are replaced by a locked message.
  const viewedVisibility = profile?.profile_visibility ?? 'public';
  const canViewContentBase =
    isOwner || viewedVisibility === 'public' || alreadyFriends;
  // A block overrides visibility entirely — even a public profile is locked
  // once you've blocked its owner.
  const canViewContent = canViewContentBase && !isBlocked;

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
    // Skip when the viewed profile is locked to us (friends-only/private) —
    // mutual courts reveal where someone plays, which is what they've hidden.
    if (isOwner || !profile?.id || !user?.id || !canViewContent) return;

    async function loadMutuals() {
      // Both lists are computed server-side by SECURITY DEFINER RPCs
      // (supabase/mutual_courts_rpc.sql + privacy_enforcement.sql) because
      // RLS correctly blocks reading the other user's checkins/friendships
      // directly. Reading the viewed user's friendships from the client used
      // to return only OUR shared row, so mutual friends was always empty.
      const [friendsRes, courtsRes] = await Promise.all([
        supabase.rpc('get_mutual_friends', { p_other_user_id: profile.id }),
        supabase.rpc('get_mutual_courts',  { p_other_user_id: profile.id }),
      ]);

      setMutualFriends(
        (friendsRes.data ?? []).map(r => ({
          userId:    r.user_id,
          username:  r.username ?? 'Player',
          avatarUrl: r.avatar_url ?? null,
          initials:  (r.username ?? 'PL').slice(0, 2).toUpperCase(),
        }))
      );

      setMutualCourts(
        (courtsRes.data ?? []).map(r => ({ id: r.court_id, name: r.court_name }))
      );
    }

    loadMutuals();
  }, [profile?.id, isOwner, canViewContent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check-in history state ────────────────────────────────────────────────
  // Loaded from Supabase when the user taps the "Check-ins" tab.
  const [checkInHistory, setCheckInHistory]     = useState([]);
  const [historyLoading, setHistoryLoading]     = useState(false);

  // ── Fetch the viewed user's posts when the screen loads ───────────────────
  // We use profile?.id (the viewed user), NOT user.id (the logged-in user),
  // so visiting someone else's profile shows their posts, not the viewer's.
  useEffect(() => {
    // Don't fetch posts for a profile that's locked to us — the locked
    // state below is rendered instead of the posts list.
    if (!profile?.id || !canViewContent) return;
    setPostsLoading(true);
    fetchUserPosts(profile.id, user?.id).then(posts => {
      setUserPosts(posts);
      setPostsLoading(false);
    });
  }, [profile?.id, canViewContent]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchUserPostLike = (postId, next) => {
    if (!next) return;
    setUserPosts(prev => prev.map(post =>
      post.id === postId
        ? { ...post, likes: next.likes, isLiked: next.isLiked }
        : post
    ));
  };

  const handleLikePost = async (postId, prevLikes) => {
    const next = await likePost(postId, user.id, prevLikes);
    patchUserPostLike(postId, next);
    return next;
  };

  const handleUnlikePost = async (postId, prevLikes) => {
    const next = await unlikePost(postId, user.id, prevLikes);
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
        .select('id, court_id, checked_in_at, duration_minutes, courts(name)')
        .eq('user_id', profile.id)
        .eq('is_active', false)
        .order('checked_in_at', { ascending: false })
        .limit(20);

      if (data) setCheckInHistory(data);
      setHistoryLoading(false);
    }

    loadHistory();
  }, [activeTab, profile?.id]);

  // ── "Map" button on a check-in row ────────────────────────────────────────
  // Same handoff every other "jump to this court" feature uses (friend
  // check-ins, scheduled runs): stash the court id, switch to the Map tab,
  // which flies the camera there and opens its detail sheet on load.
  const handleViewOnMap = (courtId) => {
    if (!courtId) return;
    localStorage.setItem('lh_focus_court', courtId);
    onNavigateTab?.('map');
  };

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
    // The raw value, not displayUser.favoriteCourt — that falls back to the
    // literal string 'None yet', which saving unchanged would then store.
    setEditFavCourt(profile?.favorite_court ?? '');
    // 0 is a valid number, so check != null rather than truthiness
    setEditJersey(profile?.jersey_number != null ? String(profile.jersey_number) : '');
    setEditBio(profile?.bio ?? '');
    setEditPositions(normalizePositions(profile?.positions));
    setEditHomeCourtId(profile?.home_court_id ?? null);
    setShowEditProfile(true);
  };

  // ── Save profile changes (owner only) ─────────────────────────────────────
  // Sends updated fields to Supabase via the updateProfile prop.
  // Guard: username must be at least 2 characters — an empty or single-character
  // username would break search and make the user appear as "Player" everywhere.
  const handleSaveProfile = async () => {
    const trimmedUsername = editUsername.trim();
    if (trimmedUsername.length < 2) {
      showToast('❌ Username must be at least 2 characters');
      return;
    }

    // Jersey number: blank clears it (null); otherwise must be an integer 0-99.
    const trimmedJersey = editJersey.trim();
    let jerseyNumber = null;
    if (trimmedJersey !== '') {
      // Reject anything that isn't purely digits (e.g. "2a", "-1", "1.5")
      if (!/^\d{1,2}$/.test(trimmedJersey)) {
        showToast('❌ Jersey number must be 0–99');
        return;
      }
      jerseyNumber = parseInt(trimmedJersey, 10);
    }

    // Blank clears back to null so "not set" stays one state; see utils/bio.js
    // for why the clamp counts characters rather than String.length.
    const bio = normalizeBio(editBio);

    // Drop any column the table does not have yet. Migrations here are run by
    // hand, so deployed code can outrun the database — and PostgREST rejects an
    // update naming an unknown column outright, which would fail the username
    // and jersey number too, not just the bio. See utils/profileSchema.js.
    setSaving(true);
    const { error } = await updateProfile(pickSupportedUpdates(profile, {
      username:       trimmedUsername,
      favorite_court: editFavCourt.trim(),
      jersey_number:  jerseyNumber,
      bio,
      positions:      normalizePositions(editPositions),
      home_court_id:  editHomeCourtId,
    }));
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
        <CourtLines variant="profile" />

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

        {/* Large centered avatar (80px), wearing the identity ring */}
        <div className="profile-avatar-wrap">
          <Avatar
            avatarUrl={avatarUrl}
            initials={displayUser.initials}
            size="large"
            identityRing
          />
        </div>

        {/* Username — large bold text, with optional jersey number.
            0 is a valid number, so guard on != null, not truthiness. */}
        <div className="profile-username">
          {displayUser.name}
          {displayUser.jerseyNumber != null && (
            <span className="jersey-number">#{displayUser.jerseyNumber}</span>
          )}
        </div>

        {/* Bio — the one place a player describes themselves in their own
            words. Omitted entirely when unset so the header gains no dead
            space, and gated behind canViewContent like the stats: it is
            user-authored content, and a profile locked to friends-only should
            not leak it to strangers. */}
        {canViewContent && displayUser.bio && (
          <p className="profile-bio">{displayUser.bio}</p>
        )}

        {/* Positions — factual rather than user-authored, so unlike the bio it
            is not gated on canViewContent: "plays Guard" is the kind of thing
            a locked profile still shows, the same way the username does.
            Omitted when nothing is chosen so there is no stray separator. */}
        {displayUser.positions.length > 0 && (
          <p className="profile-positions">{formatPositions(displayUser.positions)}</p>
        )}

        {/* Home court — tappable through to the court itself, which is the
            whole reason this is a reference and not a string. Like positions
            it is factual, so it is not gated on canViewContent. */}
        {displayUser.homeCourt && (
          <button
            type="button"
            className="profile-home-court"
            onClick={() => onNavigateTab?.('map')}
          >
            <MapPin size={12} strokeWidth={2.2} />
            {displayUser.homeCourt.name}
          </button>
        )}

        {/* 3 stat pills showing the user's key numbers.
            Hidden when the profile is locked to us (friends-only/private). */}
        {canViewContent && (
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
        )}

        {/* Two action buttons side by side — replaced with a single Unblock
            button when you've blocked this person, since Achievements/Add
            Friend/etc. don't make sense for a profile you can't see anyway. */}
        <div className="profile-action-row">
          {isBlocked ? (
            <button className="btn btn--primary btn--grow" onClick={handleUnblock}>
              Unblock
            </button>
          ) : (
            <>
              {/* Achievements — derived from stats, so hidden on locked profiles.
                  Filled, per the design: on your own profile Achievements is the
                  thing worth tapping, and Edit Profile is the quieter utility. */}
              {canViewContent && (
                <button
                  className="btn btn--primary btn--grow"
                  onClick={() => setShowAchievements(true)}
                >
                  Achievements
                </button>
              )}

              {/* Edit Profile — owner only. Visitors see friend status button instead. */}
              {isOwner ? (
                <button
                  className="btn btn--secondary btn--grow"
                  onClick={openEditProfile}
                >
                  Edit Profile
                </button>
              ) : alreadyFriends ? (
                <button className="btn btn--secondary btn--grow" disabled>
                  Friends ✓
                </button>
              ) : requestPending ? (
                <button className="btn btn--secondary btn--grow" disabled>
                  Pending
                </button>
              ) : (
                <button className="btn btn--primary btn--grow" onClick={handleAddFriend}>
                  Add Friend
                </button>
              )}
            </>
          )}
        </div>

        {/* Small, de-emphasized Block control — visitor mode only */}
        {!isOwner && !isBlocked && (
          <button
            className="profile-block-link"
            onClick={() => setShowBlockConfirm(true)}
            aria-label={`Block ${displayUser.name}`}
          >
            <UserX size={13} strokeWidth={2} />
            Block
          </button>
        )}
      </div>

      {/* ── Locked profile state — blocked, or friends-only/private ─────────── */}
      {!canViewContent && (
        <div className="feed-empty" style={{ marginTop: 8 }}>
          <div style={{ fontSize: 48 }}>{isBlocked ? '🚫' : '🔒'}</div>
          <div className="feed-empty-title">
            {isBlocked
              ? `You've blocked ${displayUser.name}`
              : `This profile is ${viewedVisibility === 'private' ? 'private' : 'friends only'}`}
          </div>
          <div className="feed-empty-sub">
            {isBlocked
              ? 'Unblock them above to see their posts and stats again'
              : requestPending
                ? 'Your friend request is pending'
                : 'Add them as a friend to see their posts and stats'}
          </div>
        </div>
      )}

      {showBlockConfirm && (
        <BlockUserConfirm
          username={displayUser.name}
          onConfirm={handleBlock}
          onCancel={() => setShowBlockConfirm(false)}
        />
      )}

      {/* ── Mutual friends + courts — visitor mode only ─────────────────────── */}
      {canViewContent && !isOwner && (mutualFriends.length > 0 || mutualCourts.length > 0) && (
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
      {/* Check-ins tab is only shown to the profile owner — check-in history   */}
      {/* is personal data (reveals where/when you go) and the checkins RLS     */}
      {/* policy blocks reading another user's rows anyway.                     */}
      {canViewContent && (
        <Tabs
          value={activeTab}
          onChange={setActiveTab}
          tabs={[
            { value: 'posts', label: 'Posts' },
            // Check-ins is owner-only: it reveals where and when you go, and
            // the checkins RLS policy blocks reading another user's rows anyway.
            ...(isOwner ? [{ value: 'checkins', label: 'Check-ins' }] : []),
          ]}
        />
      )}

      {/* ── Posts tab content ────────────────────────────────────────────────── */}
      {canViewContent && activeTab === 'posts' && (
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
                  onDelete={async (postId) => {
                    await deletePost(postId);
                    setUserPosts(prev => prev.filter(p => p.id !== postId));
                  }}
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
        </div>
      )}

      {/* ── Check-ins tab content ────────────────────────────────────────────── */}
      {/* Shows real past check-in sessions loaded from the checkins table.    */}
      {/* Each row shows the court name, date, and how long the session lasted. */}
      {canViewContent && activeTab === 'checkins' && (
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
                <div className="checkin-history-info">
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

                {/* Jump to this court on the Map tab */}
                {item.court_id && (
                  <button
                    className="btn btn--soft btn--sm btn--pill"
                    onClick={() => handleViewOnMap(item.court_id)}
                    aria-label={`View ${item.courts?.name ?? 'court'} on the map`}
                  >
                    <Map size={13} strokeWidth={2} />
                    Map
                  </button>
                )}
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
        <CourtLines variant="achievements" />
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
                  identityRing
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
                  color: avatarUploading ? 'var(--text-secondary)' : 'var(--accent)',
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

            {/* These four used to carry the same nine inline style properties
                each — the same duplication the forms phase removed from the
                class-based inputs. They were missed then because they were
                inline rather than classed. .field owns the chrome now. */}

            {/* Username input */}
            <div className="edit-field-row">
              <label className="edit-field-label" htmlFor="edit-username">Username</label>
              <input
                id="edit-username"
                className="field"
                type="text"
                value={editUsername}
                onChange={e => setEditUsername(e.target.value)}
              />
            </div>

            {/* Jersey Number input (0–99, optional) */}
            <div className="edit-field-row">
              <label className="edit-field-label" htmlFor="edit-jersey">Jersey Number</label>
              <input
                id="edit-jersey"
                className="field"
                type="text"
                inputMode="numeric"
                maxLength={2}
                value={editJersey}
                onChange={e => setEditJersey(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 23"
              />
            </div>

            {/* Bio (optional, 120 characters). Hidden until the migration has
                been applied — see bioEnabled above. */}
            {bioEnabled && (
            <div className="edit-field-row">
              <label className="edit-field-label" htmlFor="edit-bio">Bio</label>
              <textarea
                id="edit-bio"
                className="field"
                rows={3}
                maxLength={BIO_MAX_LENGTH * 2}
                value={editBio}
                /* clampBio counts characters rather than String.length, so a
                   pasted 500-character bio is cut to exactly what the database
                   will accept, and an emoji is never split in half. */
                onChange={e => setEditBio(clampBio(e.target.value))}
                placeholder="Brooklyn runs, mostly nights."
              />
              <div className="field__counter" aria-live="polite">
                {bioLength(editBio)}/{BIO_MAX_LENGTH}
              </div>
            </div>
            )}

            {/* Positions — multi-select chips. Reuses the button primitive
                rather than adding chip CSS: soft when chosen, secondary when
                not. Hidden until the migration has been applied. */}
            {positionsEnabled && (
            <div className="edit-field-row">
              <span className="edit-field-label" id="edit-positions-label">Positions</span>
              <div className="position-chips" role="group" aria-labelledby="edit-positions-label">
                {POSITIONS.map(position => {
                  const selected = editPositions.includes(position);
                  return (
                    <button
                      key={position}
                      type="button"
                      aria-pressed={selected}
                      className={`btn btn--sm btn--pill ${selected ? 'btn--soft' : 'btn--secondary'}`}
                      onClick={() => setEditPositions(togglePosition(editPositions, position))}
                    >
                      {position}
                    </button>
                  );
                })}
              </div>
            </div>
            )}

            {/* Home court. Once the migration has run this is a real
                reference to a row in `courts`, which is what makes it a link
                on the profile rather than a string. Until then the old
                free-text field stands in, so this window never leaves the
                form without a court field at all. */}
            {homeCourtEnabled ? (
              <div className="edit-field-row edit-field-row--last">
                <span className="edit-field-label" id="edit-home-court-label">Home court</span>
                <button
                  type="button"
                  className="field home-court-select"
                  aria-labelledby="edit-home-court-label"
                  onClick={() => setShowCourtPicker(true)}
                >
                  <span className={selectedHomeCourt ? '' : 'home-court-select__placeholder'}>
                    {selectedHomeCourt ? selectedHomeCourt.name : 'Choose a court'}
                  </span>
                  <ChevronDown size={16} strokeWidth={2.4} />
                </button>
                {selectedHomeCourt && (
                  <button
                    type="button"
                    className="home-court-clear"
                    onClick={() => setEditHomeCourtId(null)}
                  >
                    Clear
                  </button>
                )}
              </div>
            ) : (
              <div className="edit-field-row edit-field-row--last">
                <label className="edit-field-label" htmlFor="edit-fav-court">Favorite Court</label>
                <input
                  id="edit-fav-court"
                  className="field"
                  type="text"
                  value={editFavCourt}
                  onChange={e => setEditFavCourt(e.target.value)}
                  placeholder="e.g. Rucker Park"
                />
              </div>
            )}

            {/* Save / Cancel buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn--secondary btn--grow"
                onClick={() => setShowEditProfile(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn--primary btn--grow"
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
          {/* profile + updateProfile power the real privacy settings
              (show_location, profile_visibility) saved to Supabase */}
          <SettingsSheet
            isOpen={showSettings}
            onClose={() => setShowSettings(false)}
            user={user}
            signOut={signOut}
            onEditProfile={openEditProfile}
            profile={profile}
            updateProfile={updateProfile}
            blockedUsers={blockedUsers}
            unblockUser={unblockUser}
            blockedLoadFailed={blockedLoadFailed}
            refreshBlocked={refreshBlocked}
          />
        </>
      )}

      {/* Home-court picker. Reuses the post composer's court sheet rather
          than being a second picker — same list, same search, same rows —
          with nearest-first ordering, which is the useful order when the
          question is "where do you usually hoop". */}
      {showCourtPicker && (
        <CourtPickerSheet
          courts={courts}
          selected={selectedHomeCourt}
          title="Home court"
          subtitle="Nearest to you first"
          sortByDistance
          onSelect={court => setEditHomeCourtId(court.id)}
          onClose={() => setShowCourtPicker(false)}
        />
      )}

      {/* Full-screen photo viewer — available to all viewers */}
      <PhotoViewer url={photoUrl} onClose={() => setPhotoUrl(null)} />

      {/* Toast notification pill — auto-dismisses after 2.5 seconds */}
      <Toast message={toast} />
    </div>
  );
}
