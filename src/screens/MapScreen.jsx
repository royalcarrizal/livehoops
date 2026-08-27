// src/screens/MapScreen.jsx
//
// The real interactive map screen powered by Mapbox GL JS.
// Shows all Houston basketball courts as custom orange markers on a live dark map.
//
// How it works:
//   1. Mapbox renders a real dark-themed street map into a <div> element
//   2. We place a pill marker at each court's GPS coordinates — green with a
//      player count when anyone is on it, muted grey when nobody is
//   3. Tapping a marker (or a row at the bottom) opens a detail sheet
//   4. A locate button recenters the map on the user
//   5. A search bar filters the court list below the map, nearest first

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { supabase } from '../lib/supabase';
import { usePosts } from '../hooks/usePosts';
import { useCourtFavorites } from '../hooks/useCourtFavorites';
import MapPostModal from '../components/MapPostModal';
import CourtMeetups from '../components/CourtMeetups';
import CourtRoyalty from '../components/CourtRoyalty';
import Toast from '../components/Toast';
import WhosHere from '../components/WhosHere';
import { useToast } from '../hooks/useToast';
import { useCourtKing } from '../hooks/useCourtKing';
import { formatMeetupTime } from '../utils/datetime';
import MapCourtGround from '../components/MapCourtGround';
import CourtListRow from '../components/CourtListRow';
import AddCourtSheet from '../components/AddCourtSheet';
import { createMarkerEl } from '../utils/mapMarker';
import { sortByDistance } from '../hooks/useCourts';
import { Search, LocateFixed } from 'lucide-react';

import 'mapbox-gl/dist/mapbox-gl.css';

// ── Set your Mapbox access token ──────────────────────────────────────────
// Mapbox needs this to know who is loading the map and which account to bill.
// It reads the value from VITE_MAPBOX_TOKEN in your .env file.
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// ── Fallback map center: downtown Houston, TX ──────────────────────────────
// Only used when the user's GPS position isn't available yet (userPos null).
// Mapbox uses [longitude, latitude] order (opposite of Google Maps)
const FALLBACK_CENTER = [-95.3698, 29.7604];

export default function MapScreen({ parks, onCheckIn, activeCheckIn, checkOut, user, profile, isCheckingIn = false, userPos = null, onViewProfile, meetupActions }) {
  // ── Refs (don't trigger re-renders when they change) ──────────────────────
  // The div element that Mapbox renders the map canvas into
  const mapContainerRef = useRef(null);
  // The Mapbox Map instance itself
  const mapRef = useRef(null);
  // All marker instances — stored so we can remove them on cleanup
  const markersRef = useRef([]);
  // Mapbox's GeolocateControl. Its own button is hidden in CSS — it is kept for
  // the blue user dot and the location tracking, and driven by our own button.
  const geolocateRef = useRef(null);

  // ── State (these DO trigger re-renders) ───────────────────────────────────
  const [mapLoaded,       setMapLoaded]       = useState(false);
  const [selectedPark,    setSelectedPark]    = useState(null);
  const [searchQuery,     setSearchQuery]     = useState('');
  const [showPostModal,   setShowPostModal]   = useState(false);
  const [visitMap,        setVisitMap]        = useState({});
  const [showAddCourt,    setShowAddCourt]    = useState(false);

  const { createPost } = usePosts();
  const { toast, showToast } = useToast();
  const { favoriteIds, toggleFavorite } = useCourtFavorites(user?.id);
  const { kings, fetchKings } = useCourtKing();

  // ── Fetch this user's check-in history ───────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('checkins')
      .select('court_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const map = {};
        (data ?? []).forEach(c => {
          if (c.court_id) map[c.court_id] = (map[c.court_id] || 0) + 1;
        });
        setVisitMap(map);
      });
  }, [user?.id]);

  // ── Load the two "kings" whenever a court sheet opens ─────────────────────
  // Lazy: only the opened court is aggregated, never the whole list.
  useEffect(() => {
    if (selectedPark?.id) fetchKings(selectedPark.id);
  }, [selectedPark?.id, fetchKings]);

  // ── Fly the map camera to a specific court ────────────────────────────────
  // Called when the user taps a chip at the bottom or selects a court
  const flyToPark = useCallback((park) => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [park.lng, park.lat],
      zoom: 15,       // Zoom in close enough to see the court
      pitch: 30,
      duration: 1200, // Smooth 1.2-second fly animation
    });
    setSelectedPark(park);
  }, []);

  // ── Initialize the Mapbox map ─────────────────────────────────────────────
  useEffect(() => {
    // Don't create a second map if one already exists
    if (mapRef.current) return;

    // In development, React's StrictMode runs every effect twice —
    // it mounts, immediately unmounts (running the cleanup), then remounts.
    // The cleanup calls map.remove() which should clear Mapbox's canvas, but
    // Mapbox GL v3 can leave behind orphaned internal divs on the container.
    // Clearing the container here ensures we always start with a clean slate
    // so the second initialization doesn't render on top of leftover elements.
    if (mapContainerRef.current) {
      mapContainerRef.current.innerHTML = '';
    }

    // Create the map and attach it to our container div.
    // Center on the user's real position when we already have it (GPS came
    // back before the Map tab opened); otherwise fall back to Houston until
    // the geolocate control fires.
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,          // The div to render into
      style: 'mapbox://styles/mapbox/dark-v11',    // Dark map to match the app
      center: userPos ? [userPos.lng, userPos.lat] : FALLBACK_CENTER,
      zoom: userPos ? 12.5 : 11,                    // closer when it's their real area
      pitch: 30,                                    // Slight 3D tilt for depth
    });

    // Save the map instance so other functions can use it
    mapRef.current = map;

    // ── Geolocate control ─────────────────────────────────────────────────
    // This adds the arrow button (top-right) that centers the map on your location
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,   // Keep centering as you move
      showUserHeading: true,     // Show the direction you're facing
    });
    map.addControl(geolocate, 'top-right');
    geolocateRef.current = geolocate;

    // ── Wait for map tiles to load before placing markers ─────────────────
    map.on('load', () => {
      // Tell Mapbox to recalculate the canvas dimensions now that React has
      // finished laying out the DOM. Without this, the canvas can end up with
      // zero width/height if the container wasn't fully sized when the Map
      // constructor ran (common during React's StrictMode double-invoke cycle).
      map.resize();

      // Auto-trigger location once the map is ready
      geolocate.trigger();

      // Hide the loading screen now that the map is ready
      setMapLoaded(true);
    });

    // ── Cleanup ───────────────────────────────────────────────────────────
    // When the user switches tabs, React unmounts this component.
    // We destroy the map and all markers to free up memory.
    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      geolocateRef.current = null;
    };
    // userPos is intentionally omitted: the map is created ONCE on mount and
    // must not be torn down/rebuilt when GPS arrives later — the geolocate
    // control recenters the existing map instead.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync court markers whenever court data changes ────────────────────────
  // The map itself is long-lived, but court data can arrive later or change
  // after check-ins. Rebuilding markers keeps live/empty styling accurate.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    parks.forEach(park => {
      if (park.lng == null || park.lat == null) return;

      const el = createMarkerEl(park);
      el.addEventListener('click', () => setSelectedPark(park));

      // Place the marker at the court's real GPS coordinates
      // Mapbox uses [lng, lat] order — notice longitude comes first
      //
      // anchor 'bottom', not 'center': the pin hangs a stem below the pill and
      // the stem's tip is what points at the coordinate. At 'center' every
      // court would sit half a marker north of where it actually is.
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([park.lng, park.lat])
        .addTo(mapRef.current);

      // Keep a reference so we can clean it up later
      markersRef.current.push(marker);
    });
    // visitMap and favoriteIds are deliberately NOT dependencies any more: the
    // pin shows live players and nothing else, so a favourite toggle no longer
    // tears down and rebuilds every marker on the map.
  }, [mapLoaded, parks]);

  // ── Handle navigation from the Active Friends row ────────────────────────
  // When a user taps a friend's card on the Home screen, that court's ID is
  // saved to localStorage under 'lh_focus_court'. When this screen loads and
  // the map finishes drawing, we read that value, fly the camera to the court,
  // and open its detail sheet automatically. Then we clear the key so it
  // doesn't fire again the next time the Map tab is opened.
  useEffect(() => {
    // Wait until Mapbox has finished loading all map tiles before flying
    if (!mapLoaded) return;

    const courtId = localStorage.getItem('lh_focus_court');
    if (!courtId) return;

    // Find the matching court in the parks list and fly to it.
    // If parks haven't arrived yet, leave the key in localStorage —
    // the effect re-runs when parks updates and we'll find it on the next pass.
    const park = parks.find(p => p.id === courtId);
    if (!park) return;

    // Only clear once we've confirmed the court exists
    localStorage.removeItem('lh_focus_court');
    // flyToPark moves the camera AND opens the bottom detail sheet
    flyToPark(park);
  }, [flyToPark, mapLoaded, parks]);

  // ── Filter the court list by whatever the user typed ──────────────────────
  // No API calls needed — we just filter the local array.
  //
  // Then sort it by distance, which the panel's header has always claimed and
  // the code has never done: it used to sort favourites to the top, over a
  // `parks` array that arrives ordered by created_at. sortByDistance also sinks
  // courts with an unknown distance to the bottom, so a denied location prompt
  // leaves the list in a sane order rather than a misleading one.
  const filteredParks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const matching = query
      ? parks.filter(p => p.name.toLowerCase().includes(query))
      : parks;
    return sortByDistance(matching);
  }, [parks, searchQuery]);

  // selectedPark is a snapshot from when the marker was tapped — look up the
  // live court object so the player count and checked-in avatars in the
  // sheet stay fresh as counts refresh while it's open.
  const livePark = selectedPark
    ? (parks.find(p => p.id === selectedPark.id) ?? selectedPark)
    : null;

  return (
    <div className="map-screen">

      {/* ── Map area wrapper ───────────────────────────────────────────────── */}
      {/* This wrapper is the positioned ancestor for the search bar and loading
          overlay. The map container itself must stay completely empty — Mapbox
          throws a warning if you put any children inside it. */}
      <div className="map-wrap">

        {/* The map container — MUST be empty. Mapbox owns everything inside here. */}
        <div ref={mapContainerRef} className="mapbox-container" />

        {/* Floating search row — absolutely positioned over the map */}
        <div className="map-search-bar">
          <div className="map-search-row">
            <div className="map-search-field">
              {/* A real icon, not an emoji baked into the placeholder — that
                  version shifted with the text and vanished the moment the
                  user typed. */}
              <Search size={18} strokeWidth={2} className="map-search-icon" />
              <input
                type="text"
                placeholder="Search courts near you"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="field field--sm map-search-input"
              />
            </div>

            {/* Recenter. Mapbox's GeolocateControl still does the work — it
                owns the blue user dot and the tracking — but its default
                button is hidden in CSS so this one can carry the design. */}
            <button
              type="button"
              className="map-locate-btn"
              onClick={() => geolocateRef.current?.trigger()}
              aria-label="Center map on my location"
            >
              <LocateFixed size={20} strokeWidth={2} />
            </button>
          </div>
          {/* Dropdown results — shown while the user is typing so results
              appear above the keyboard instead of in the hidden bottom panel */}
          {searchQuery.trim().length > 0 && (
            <div className="map-search-dropdown">
              {filteredParks.length === 0 ? (
                <div className="map-search-no-results">No courts found</div>
              ) : (
                filteredParks.map(park => (
                  <button
                    key={park.id}
                    className="map-search-result-row"
                    onClick={() => {
                      flyToPark(park);
                      setSearchQuery('');
                    }}
                  >
                    <span className="map-search-result-name">{park.name}</span>
                    <span className="map-search-result-sub">
                      {park.players > 0 ? `🏀 ${park.players} playing` : 'Empty'} · {park.distance}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Loading overlay — absolutely positioned over the map until it's ready */}
        {!mapLoaded && (
          <div className="map-loading">
            <MapCourtGround />
            <div className="map-loading-emoji">🏀</div>
            <div className="map-loading-title">Live<span>Hoops</span></div>
            <div className="map-loading-text">Loading map...</div>
          </div>
        )}
      </div>

      {/* ── Court detail bottom sheet ──────────────────────────────────────── */}
      {/* Slides up when a marker or chip is tapped. Tap outside to close. */}
      {selectedPark && (
        <>
          {/* Semi-transparent backdrop — tapping it closes the sheet */}
          <div
            className="map-sheet-overlay"
            onClick={() => setSelectedPark(null)}
          />

          {/* The sliding sheet with court details */}
          <div className="map-bottom-sheet">
            {/* Drag handle row with favorite + close buttons */}
            <div className="map-sheet-top-row">
              <div className="map-sheet-drag-handle" />
              <button
                className={`map-sheet-favorite${favoriteIds.has(selectedPark.id) ? ' is-favorited' : ''}`}
                onClick={() => toggleFavorite(selectedPark.id)}
                aria-label={favoriteIds.has(selectedPark.id) ? 'Remove from favorites' : 'Add to favorites'}
              >
                ♥
              </button>
              <button
                className="map-sheet-close"
                onClick={() => setSelectedPark(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Court name */}
            <div className="map-sheet-name">{selectedPark.name}</div>

            {/* Address */}
            <div className="map-sheet-address">{selectedPark.shortAddress}</div>

            {/* Visited badge */}
            {visitMap[selectedPark.id] > 0 && (
              <div className="map-sheet-visited">
                ✓ You've played here {visitMap[selectedPark.id]} {visitMap[selectedPark.id] === 1 ? 'time' : 'times'}
              </div>
            )}

            {/* Info pills: live status + court details */}
            <div className="map-sheet-meta">
              {livePark.players > 0 ? (
                <span className="map-sheet-live-badge">
                  🟢 {livePark.players} live
                </span>
              ) : (
                <span className="map-sheet-empty-badge">Empty</span>
              )}
              <span className="map-sheet-meta-item">
                {selectedPark.courts} {selectedPark.courts === 1 ? 'court' : 'courts'}
              </span>
              <span className="map-sheet-meta-item">{selectedPark.surface}</span>
              <span className="map-sheet-meta-item">
                {selectedPark.lighting ? '💡 Lit' : 'No lights'}
              </span>
              {selectedPark.reviewCount > 0 && (
                <span className="map-sheet-meta-item" style={{ color: 'var(--accent)' }}>
                  ★ {Number(selectedPark.avgRating).toFixed(1)} ({selectedPark.reviewCount})
                </span>
              )}
              {livePark.nextMeetup && (
                <span className="map-sheet-meetup-badge">
                  📅 Run {formatMeetupTime(livePark.nextMeetup.scheduledAt)}
                </span>
              )}
            </div>

            {/* ── Who's here — checked-in players (privacy-filtered) ────────── */}
            {/* Only players who allow it appear (show_location + visibility,   */}
            {/* enforced by the get_court_active_players RPC). The count badge  */}
            {/* above can be higher — those extras are players who've hidden    */}
            {/* themselves, so we note them anonymously.                        */}
            <WhosHere
              checkins={livePark.checkins}
              players={livePark.players}
              currentUserId={user?.id}
              onViewProfile={onViewProfile}
            />

            {/* ── King of the Court — the two reigning per-court leaders ────── */}
            <CourtRoyalty
              kings={kings}
              currentUserId={user?.id}
              onViewProfile={onViewProfile}
            />

            {/* Action buttons */}
            {/* The primary action takes its own full-width row, and the two
                secondary actions share the row below. Previously all three
                shared one row, which could not fit: "Get Directions" alone
                needs ~131px and an even third of a 390px sheet is ~110px, so
                the row wrapped and the buttons came out mismatched. */}
            <div className="map-sheet-buttons">
              {/* Three check-in states:
                  1. Checked in HERE     → green "Checked In ✓" button that checks out
                  2. Checked in ELSEWHERE → orange "Switch Courts" button
                  3. Not checked in       → orange "Check In" button */}
              {activeCheckIn?.courtId === selectedPark.id ? (
                // Already at this court — tap to check out
                <button
                  className="btn btn--live-filled btn--block"
                  onClick={async () => {
                    await checkOut(activeCheckIn.checkinId, selectedPark.id, user?.id);
                    setSelectedPark(null);
                  }}
                >
                  Checked In ✓ (Check Out)
                </button>
              ) : activeCheckIn ? (
                // Checked in at a different court — swap
                <button
                  className="btn btn--primary btn--block"
                  onClick={() => {
                    onCheckIn(selectedPark.id);
                    setSelectedPark(null);
                  }}
                  disabled={isCheckingIn}
                >
                  {isCheckingIn ? 'Checking in…' : 'Switch Courts'}
                </button>
              ) : (
                // Not checked in anywhere
                <button
                  className="btn btn--primary btn--block"
                  onClick={() => {
                    onCheckIn(selectedPark.id);
                    setSelectedPark(null);
                  }}
                  disabled={isCheckingIn}
                >
                  {isCheckingIn ? 'Checking in…' : 'Check In'}
                </button>
              )}

              <div className="map-sheet-buttons-row">
                <a
                  className="btn btn--secondary btn--grow"
                  href={`https://maps.google.com/?q=${selectedPark.lat},${selectedPark.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get Directions
                </a>

                {/* Post tagged to this court */}
                <button
                  className="btn btn--secondary btn--grow"
                  onClick={() => setShowPostModal(true)}
                >
                  ✏️ Post Here
                </button>
              </div>
            </div>

            {/* ── Upcoming runs (scheduled meetups) ─────────────────────────── */}
            {meetupActions && (
              <CourtMeetups
                court={{ id: selectedPark.id, name: selectedPark.name }}
                meetups={livePark.meetups ?? []}
                user={user}
                onSchedule={meetupActions.onSchedule}
                onJoin={meetupActions.onJoin}
                onLeave={meetupActions.onLeave}
                onCancel={meetupActions.onCancel}
                fetchAttendees={meetupActions.fetchAttendees}
                onViewProfile={onViewProfile}
                onToast={showToast}
              />
            )}
          </div>
        </>
      )}

      {/* ── Court list ─────────────────────────────────────────────────────── */}
      {/* Always visible at the bottom. Filtered by the search bar, nearest
          first. The header's two halves say what the list IS and how it is
          ordered — the order half used to be a claim the code did not honour. */}
      <div className="map-courts-sheet">
        <div className="sheet-handle" />
        <div className="sheet-handle-row">
          <span className="map-courts-title">
            {filteredParks.length} {filteredParks.length === 1 ? 'court' : 'courts'} nearby
          </span>
          <span className="section-count">Sorted by distance</span>
        </div>
        <div className="map-court-list">
          {filteredParks.length === 0 ? (
            <div className="map-court-list-empty">
              {searchQuery.trim()
                ? `No courts matching "${searchQuery.trim()}"`
                : 'No courts yet'}
            </div>
          ) : (
            filteredParks.map(park => (
              <CourtListRow
                key={park.id}
                court={park}
                onClick={() => flyToPark(park)}
              />
            ))
          )}

          {/* Adding a court used to live on the Check screen, which was the
              only route to it in the whole app. It belongs here: you add a
              court you know the location of, and this is where someone who
              scrolled the list without finding theirs ends up. */}
          <button
            type="button"
            className="map-add-court"
            onClick={() => setShowAddCourt(true)}
          >
            Know a court that&apos;s missing? Add it →
          </button>
        </div>
      </div>

      {/* ── Add a Court sheet ───────────────────────────────────────────────── */}
      {/* Always in the DOM so the CSS slide transition animates; visibility is
          controlled by the .open class. */}
      <AddCourtSheet
        isOpen={showAddCourt}
        onClose={() => setShowAddCourt(false)}
        user={user}
      />

      {/* ── Post from map modal ───────────────────────────────────────────── */}
      {showPostModal && selectedPark && (
        <MapPostModal
          // Full court object (not just id + name) so the check-in offer can
          // read distanceMi and arm itself when the user is actually here.
          court={livePark}
          currentUser={{
            id:        user?.id,
            username:  profile?.username ?? 'Player',
            avatarUrl: profile?.avatar_url ?? null,
          }}
          onPost={async (data) => {
            await createPost(
              user.id,
              data.content,
              data.type,
              data.image_url,
              data.court_id,
              data.court_name,
              profile,
            );
          }}
          // This screen's toast, not the modal's own — the modal's lives inside
          // its portal and would be torn down before the message could be read.
          onToast={showToast}
          onClose={() => setShowPostModal(false)}
          activeCheckIn={activeCheckIn}
          onCheckIn={onCheckIn}
          isCheckingIn={isCheckingIn}
        />
      )}

      <Toast message={toast} />

    </div>
  );
}
