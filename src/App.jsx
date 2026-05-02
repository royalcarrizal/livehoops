import { useState } from 'react';
import { useTheme } from './hooks/useTheme';
import { useAuth } from './hooks/useAuth';
import { useProfile } from './hooks/useProfile';
import { useCourts } from './hooks/useCourts';
import { useCheckIn } from './hooks/useCheckIn';
import { supabase } from './lib/supabase';
import BottomNav from './components/BottomNav';
import HomeScreen from './screens/HomeScreen';
import MapScreen from './screens/MapScreen';
import CheckInScreen from './screens/CheckInScreen';
import ProfileScreen from './screens/ProfileScreen';
import FriendsScreen from './screens/FriendsScreen';
import SplashScreen from './screens/SplashScreen';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import OfflineBanner from './components/OfflineBanner';
import InstallPrompt from './components/InstallPrompt';
import IOSInstallBanner from './components/IOSInstallBanner';

export default function App() {
  useTheme(); // applies theme-dark/theme-light class to document.body

  // ── Authentication ──────────────────────────────────────────────────────
  // useAuth checks if anyone is logged in and provides sign-up / sign-in /
  // sign-out functions. 'loading' is true while the initial session check
  // is in progress (we show the splash screen during this time).
  const { user, loading: authLoading, signUp, signIn, signOut, resetPassword } = useAuth();

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

  // ── App State ───────────────────────────────────────────────────────────
  const [splashDone,  setSplashDone]  = useState(false);
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

  // ── Location label shown in the HomeScreen header ───────────────────────
  // Starts as the Houston default. Updates to the user's real city the first
  // time they check in (we reverse-geocode once at that moment, not on load).
  const [cityLabel, setCityLabel] = useState('Houston, TX');

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

      // Step 2 — reverse geocode once if the browser gave us GPS coords
      if (userPos) {
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
  const screenProps = {
    parks:           courts,
    activeCheckIn,
    checkIn:         handleCheckIn,   // unified handler — does geocoding + RPC
    checkOut,
    onCheckIn:       handleCheckIn,   // shim for screens that call onCheckIn(courtId)
    setActiveTab,
    user,
    profile,
    refreshCounts,
    onViewProfile:   handleViewProfile,
    cityLabel,        // real city from last check-in (or 'Houston, TX' default)
    isCheckingIn,     // true while a check-in is in flight — disables buttons
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
        <OfflineBanner />

        {activeTab === 'home'    && <HomeScreen    {...screenProps} />}
        {activeTab === 'map'     && <MapScreen      {...screenProps} />}
        {activeTab === 'checkin' && <CheckInScreen  {...screenProps} />}
        {activeTab === 'friends' && (
          <FriendsScreen
            {...screenProps}
            profile={profile}
            onUnreadDMs={setUnreadDMs}
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

        <InstallPrompt />
        <IOSInstallBanner />
      </div>
      {splashOverlay}
    </>
  );
}
