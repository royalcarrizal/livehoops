import { useState, useEffect, lazy, Suspense } from 'react';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import { useProfile } from './hooks/useProfile';
import { useCourts } from './hooks/useCourts';
import { useCheckIn } from './hooks/useCheckIn';
import { useMeetups } from './hooks/useMeetups';
import { supabase } from './lib/supabase';
import BottomNav from './components/BottomNav';
import HomeScreen from './screens/HomeScreen';
import CheckInScreen from './screens/CheckInScreen';
import ProfileScreen from './screens/ProfileScreen';
import FriendsScreen from './screens/FriendsScreen';
import SplashScreen from './screens/SplashScreen';
import AuthScreen from './components/AuthScreen';
import ResetPasswordScreen from './components/ResetPasswordScreen';
import Onboarding from './components/Onboarding';
import SinglePostSheet from './components/SinglePostSheet';

// MapScreen is loaded lazily because it pulls in Mapbox GL (~1.6 MB of
// JavaScript) — by far the heaviest thing in the app. Splitting it into its
// own chunk means Home/feed loads fast, and the map code only downloads the
// first time the user opens the Map tab.
const MapScreen = lazy(() => import('./screens/MapScreen'));

// Shown for the moment it takes the map chunk to download on first open
function MapLoadingFallback() {
  return (
    <div
      className="screen-content"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}
    >
      <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🗺️</div>
        <div style={{ fontSize: 14 }}>Loading map…</div>
      </div>
    </div>
  );
}

export default function App() {
  useTheme(); // applies theme-dark/theme-light class to document.body

  // ── Authentication ──────────────────────────────────────────────────────
  // useAuth checks if anyone is logged in and provides sign-up / sign-in /
  // sign-out functions. 'loading' is true while the initial session check
  // is in progress (we show the splash screen during this time).
  const {
    user,
    loading: authLoading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    passwordRecovery,
    clearPasswordRecovery,
  } = useAuth();

  // ── User Profile ────────────────────────────────────────────────────────
  // Once we know who's logged in (user.id), fetch their profile data from
  // the Supabase profiles table (username, avatar, stats, etc.).
  // refetchProfile is called after checkout so the profile screen shows
  // updated check-in count, hours played, and courts visited.
  const { profile, updateProfile, refetchProfile } = useProfile(user?.id);

  // ── Courts ──────────────────────────────────────────────────────────────
  // Loads all basketball courts from the Supabase courts table.
  // Replaces the old MOCK_PARKS array — courts are now real database rows.
  //
  //   courts            — array of court objects for the map, chips, and lists
  //   updatePlayerCount — instantly adjusts a court's player count in local state
  //   refreshCounts     — re-fetches player_count from DB (called every 60s)
  const { courts, updatePlayerCount, refreshCounts, userPos } = useCourts();

  // ── Check-In ────────────────────────────────────────────────────────────
  // Manages the user's current check-in against Supabase.
  // Persists across page refreshes via localStorage + Supabase verification.
  //
  //   activeCheckIn — { checkinId, courtId, courtName, courtAddress, checkedInAt }
  //                   or null if not checked in anywhere
  //   checkIn       — call with (courtId, userId) to check in
  //   checkOut      — call with (checkinId, courtId, userId) to check out
  const { activeCheckIn, checkIn, checkOut } = useCheckIn(
    user?.id,
    updatePlayerCount,  // called after check-in/out to update court player count instantly
    refetchProfile      // called after checkout to reload profile stats
  );

  // ── Meetups ("runs") ──────────────────────────────────────────────────────
  // Scheduled meetups at courts. upcomingMeetups drives the Home row;
  // meetupsByCourt hydrates each court object (below) so the map marker and
  // court sheets can show scheduled runs.
  const {
    upcomingMeetups,
    meetupsByCourt,
    createMeetup,
    joinMeetup,
    leaveMeetup,
    cancelMeetup,
    fetchAttendees,
  } = useMeetups(user?.id);

  // ── App State ───────────────────────────────────────────────────────────
  const [splashDone,  setSplashDone]  = useState(false);
  // splashDone is set to true by SplashScreen's onComplete callback after its
  // full animation plays (~2.45s intro + 0.56s fade-out). We don't force it
  // true early because SplashScreen already has pointer-events:none, so it
  // never blocks taps on the auth form or the app underneath it.
  const [unreadDMs,   setUnreadDMs]   = useState(0);
  const [onboardingDone, setOnboardingDone] = useState(
    () => localStorage.getItem('lh_onboarded') === 'true'
  );
  const [activeTab, setActiveTab] = useState('home');

  // When non-null, the profile tab shows this user's profile instead of the
  // logged-in user's own profile (visitor mode).
  const [viewedProfile, setViewedProfile] = useState(null);
  // Remember which tab the user came from so the back button returns them there.
  const [prevTab, setPrevTab] = useState('home');

  // ── View another user's profile ─────────────────────────────────────────
  // Fetches the target user's profile from Supabase, then switches to the
  // profile tab in visitor mode. If the target is the logged-in user,
  // just switch to the profile tab normally.
  const handleViewProfile = async (userId) => {
    if (!userId) return;
    if (userId === user?.id) {
      setViewedProfile(null);
      setActiveTab('profile');
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) {
      setPrevTab(activeTab);
      setViewedProfile(data);
      setActiveTab('profile');
    }
  };

  // ── Go back from visitor profile ────────────────────────────────────────
  const handleBackFromProfile = () => {
    setViewedProfile(null);
    setActiveTab(prevTab);
  };

  // ── Notification deep links ──────────────────────────────────────────────
  // When the user taps a push notification, the service worker either:
  //   a) opens the app at /?push=<kind>&postId=…  (app was closed), or
  //   b) posts a {type:'push-click', data} message  (app was already open).
  // Both paths land in `deepLink`, and the dispatch effect below routes to
  // the right screen once the user is logged in.
  const [deepLink, setDeepLink]       = useState(null);
  // { postId, showComments } — non-null renders the SinglePostSheet overlay
  const [viewedPost, setViewedPost]   = useState(null);
  // userId to auto-open a DM thread with on the Friends tab
  const [dmPartnerId, setDmPartnerId] = useState(null);

  useEffect(() => {
    // Path a: cold start via URL params (then clean the URL)
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('push')) {
      setDeepLink({
        kind:       qs.get('push'),
        postId:     qs.get('postId'),
        commentId:  qs.get('commentId'),
        senderId:   qs.get('senderId'),
        accepterId: qs.get('accepterId'),
        courtId:    qs.get('courtId'),
        meetupId:   qs.get('meetupId'),
      });
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Path b: app already open — the service worker messages us directly
    const onSwMessage = (event) => {
      if (event.data?.type === 'push-click' && event.data.data?.kind) {
        setDeepLink(event.data.data);
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onSwMessage);
  }, []);

  useEffect(() => {
    if (!deepLink || !user) return;
    const link = deepLink;
    setDeepLink(null); // consume it — each tap navigates once

    switch (link.kind) {
      case 'dm':
        // Open the sender's thread on the Friends tab
        setDmPartnerId(link.senderId ?? null);
        setActiveTab('friends');
        break;

      case 'friend_request':
        setActiveTab('friends');
        break;

      case 'friend_accept':
        // Show the profile of the person who accepted
        if (link.accepterId) handleViewProfile(link.accepterId);
        else setActiveTab('friends');
        break;

      case 'friend_checkin':
        // Fly the map to the court the friend checked in at (the Map tab
        // already watches lh_focus_court for exactly this)
        if (link.courtId) localStorage.setItem('lh_focus_court', link.courtId);
        setActiveTab('map');
        break;

      case 'meetup_scheduled':
      case 'meetup_reminder':
        // Both meetup pushes carry the courtId — fly the map to that court so
        // the user lands on its sheet (where the run + RSVP controls live).
        if (link.courtId) localStorage.setItem('lh_focus_court', link.courtId);
        setActiveTab('map');
        break;

      case 'post_like':
      case 'post_comment':
      case 'comment_reply':
        if (link.postId) {
          setViewedPost({
            postId: link.postId,
            showComments: link.kind !== 'post_like',
          });
        }
        break;

      case 'comment_like':
        // Payload only carries the comment ID — resolve it to its post
        if (link.commentId) {
          supabase
            .from('comments')
            .select('post_id')
            .eq('id', link.commentId)
            .single()
            .then(({ data }) => {
              if (data?.post_id) {
                setViewedPost({ postId: data.post_id, showComments: true });
              }
            });
        }
        break;

      default:
        break; // 'test' and unknown kinds just open the app
    }
  }, [deepLink, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Location label shown in the HomeScreen header ───────────────────────
  // null until we know the user's real city. Filled in by the effect below
  // as soon as GPS is available (and refreshed on check-in). No more
  // hardcoded Houston default — users outside Houston see their own city,
  // and users without GPS see a neutral "Nearby".
  const [cityLabel, setCityLabel] = useState(null);

  useEffect(() => {
    if (!userPos || cityLabel) return;
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    const url   = `https://api.mapbox.com/geocoding/v5/mapbox.places/${userPos.lng},${userPos.lat}.json?types=place&limit=1&access_token=${token}`;

    fetch(url)
      .then(res => res.json())
      .then(geo => {
        const feature = geo.features?.[0];
        if (!feature) return;
        const city      = feature.text ?? '';
        const regionCtx = feature.context?.find(c => c.id.startsWith('region'));
        const stateCode = regionCtx?.short_code?.replace('US-', '') ?? '';
        const name      = stateCode ? `${city}, ${stateCode}` : city;
        if (name) setCityLabel(name);
      })
      .catch(() => {}); // geocoding is cosmetic — never surface a failure
  }, [userPos, cityLabel]);

  // ── Prevents double-tap on any check-in button ──────────────────────────
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // ── Unified check-in handler ─────────────────────────────────────────────
  // Called from MapScreen, CourtDetailSheet, and CheckInScreen whenever the
  // user taps "Check In" or "Switch Courts".
  //
  // Flow:
  //   1. Save the check-in via the existing Supabase RPC (no change to the RPC)
  //   2. If GPS coords are available, call Mapbox reverse geocoding ONCE to get
  //      the human-readable city label ("Houston, TX")
  //   3. Update the header label and enrich the checkin DB row with lat/lng/location
  //
  // The geocoding call is wrapped in its own try/catch so a network failure
  // never prevents the check-in itself from completing.
  const handleCheckIn = async (courtId) => {
    if (isCheckingIn || !user?.id || !courtId) return;
    setIsCheckingIn(true);
    try {
      // Step 1 — save check-in via existing RPC
      const result = await checkIn(courtId, user.id);

      // Re-fetch counts + checked-in player lists so the user's own avatar
      // shows up on the map/court sheets right away (fire-and-forget)
      refreshCounts();

      // Step 2 — reverse geocode once if the browser gave us GPS coords.
      // Skipped entirely when the user turned off "Show My Location" in
      // Settings — their check-in row then carries no GPS coords or city.
      if (userPos && profile?.show_location !== false) {
        const token = import.meta.env.VITE_MAPBOX_TOKEN;
        const url   = `https://api.mapbox.com/geocoding/v5/mapbox.places/${userPos.lng},${userPos.lat}.json?types=place&limit=1&access_token=${token}`;

        try {
          const geoRes  = await fetch(url);
          const geoData = await geoRes.json();
          const feature = geoData.features?.[0];

          if (feature) {
            const city        = feature.text ?? '';
            const regionCtx   = feature.context?.find(c => c.id.startsWith('region'));
            const stateCode   = regionCtx?.short_code?.replace('US-', '') ?? '';
            const locationName = stateCode ? `${city}, ${stateCode}` : city;

            // Step 3a — update the header label
            if (locationName) setCityLabel(locationName);

            // Step 3b — store lat/lng/location_name on the checkin row
            const checkinId = result?.checkin_id;
            if (checkinId && locationName) {
              await supabase
                .from('checkins')
                .update({
                  latitude:               userPos.lat,
                  longitude:              userPos.lng,
                  readable_location_name: locationName,
                })
                .eq('id', checkinId);
            }
          }
        } catch {
          // Geocoding failed — check-in already saved successfully, continue normally
        }
      }
    } finally {
      setIsCheckingIn(false);
    }
  };

  // ── screenProps ─────────────────────────────────────────────────────────
  // Everything passed down to every screen. We keep the "parks" prop name
  // (instead of renaming to "courts") so all existing screen components
  // keep working without changes to their prop names.
  //
  // onCheckIn       — shim so ParkCard and other components can still call
  //                   onCheckIn(courtId) without knowing the hook's signature
  // ── Unified check-out handler ────────────────────────────────────────────
  // Same idea as handleCheckIn: after the RPC, re-fetch counts + player
  // lists so the user's avatar disappears from the map immediately.
  const handleCheckOut = async (checkinId, courtId, uid) => {
    await checkOut(checkinId, courtId, uid);
    refreshCounts();
  };

  // Hydrate each court with its scheduled runs so the map marker and court
  // sheets can read them off the same `parks` object (mirrors how `checkins`
  // is attached in useCourts). nextMeetup = the soonest run at that court.
  const parksWithMeetups = courts.map(c => {
    const list = meetupsByCourt[c.id] ?? [];
    return { ...c, meetups: list, nextMeetup: list[0] ?? null };
  });

  const screenProps = {
    parks:           parksWithMeetups,
    activeCheckIn,
    checkIn:         handleCheckIn,   // unified handler — does geocoding + RPC
    checkOut:        handleCheckOut,
    onCheckIn:       handleCheckIn,   // shim for screens that call onCheckIn(courtId)
    setActiveTab,
    user,
    profile,
    refreshCounts,
    onViewProfile:   handleViewProfile,
    cityLabel: cityLabel ?? 'Nearby', // real city from GPS/check-in, neutral fallback
    userPos,          // user's GPS position (or null) — MapScreen centers on it
    isCheckingIn,     // true while a check-in is in flight — disables buttons
    // Meetups — the Home-row list plus a bundle of RSVP/host actions the
    // court sheets use. Court-scoped run lists live on each park object above
    // (park.meetups).
    upcomingMeetups,
    meetupActions: {
      onSchedule:     createMeetup,
      onJoin:         joinMeetup,
      onLeave:        leaveMeetup,
      onCancel:       cancelMeetup,
      fetchAttendees,
    },
  };

  const splashOverlay = !splashDone ? (
    <SplashScreen
      ready={!authLoading}
      onComplete={() => setSplashDone(true)}
    />
  ) : null;

  // ── Screen 1: Splash ────────────────────────────────────────────────────
  // The splash screen always shows first (the animated LiveHoops logo).
  // It also shows while we're checking if the user has an existing session.
  if (authLoading) return splashOverlay;

  // ── Screen 1.5: Set New Password ────────────────────────────────────────
  // The user arrived from a password-reset email link. Supabase logged them
  // in with a temporary recovery session — show the Set New Password screen
  // before anything else so they can finish resetting their password.
  if (passwordRecovery) {
    return (
      <>
        <div className={`app-shell${!splashDone ? ' app-shell-enter' : ''}`}>
          <ResetPasswordScreen
            onUpdatePassword={updatePassword}
            onDone={clearPasswordRecovery}
          />
        </div>
        {splashOverlay}
      </>
    );
  }

  // ── Screen 2: Auth ──────────────────────────────────────────────────────
  // If no user is logged in, show the login / sign-up screen.
  // They can't access any part of the app without an account.
  if (!user) {
    return (
      <>
        <div className={`app-shell${!splashDone ? ' app-shell-enter' : ''}`}>
          <AuthScreen
            onSignUp={signUp}
            onSignIn={signIn}
            onResetPassword={resetPassword}
          />
        </div>
        {splashOverlay}
      </>
    );
  }

  // ── Screen 3: Onboarding ───────────────────────────────────────────────────
  // User is logged in but has never completed the onboarding flow.
  // Once they finish, lh_onboarded is set in localStorage so this never shows again.
  if (user && !onboardingDone) {
    return (
      <Onboarding
        user={user}
        profile={profile}
        onComplete={(startScreen) => {
          setOnboardingDone(true);
          setActiveTab(startScreen);
        }}
      />
    );
  }

  // ── Screen 4: Main App ─────────────────────────────────────────────────
  // User is authenticated — show the full app with all screens.
  return (
    <>
      <div className={`app-shell${!splashDone ? ' app-shell-enter' : ''}`}>
        {activeTab === 'home'    && <HomeScreen    {...screenProps} />}
        {activeTab === 'map'     && (
          <Suspense fallback={<MapLoadingFallback />}>
            <MapScreen {...screenProps} />
          </Suspense>
        )}
        {activeTab === 'checkin' && <CheckInScreen  {...screenProps} />}
        {activeTab === 'friends' && (
          <FriendsScreen
            {...screenProps}
            profile={profile}
            onUnreadDMs={setUnreadDMs}
            openDmWith={dmPartnerId}
            onDmOpened={() => setDmPartnerId(null)}
          />
        )}
        {activeTab === 'profile' && (
          <ProfileScreen
            signOut={signOut}
            profile={viewedProfile ?? profile}
            updateProfile={updateProfile}
            user={user}
            onBack={viewedProfile ? handleBackFromProfile : null}
            onViewProfile={handleViewProfile}
          />
        )}

        <BottomNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          checkedIn={!!activeCheckIn}
          unreadDMs={unreadDMs}
        />

        {/* Single-post overlay — opened by notification deep links */}
        {viewedPost && (
          <SinglePostSheet
            postId={viewedPost.postId}
            showComments={viewedPost.showComments}
            currentUser={{
              id:        user?.id,
              username:  profile?.username ?? '',
              avatarUrl: profile?.avatar_url ?? null,
            }}
            onClose={() => setViewedPost(null)}
            onViewProfile={handleViewProfile}
          />
        )}

      </div>
      {splashOverlay}
    </>
  );
}
