// src/screens/MapScreen.jsx
//
// The real interactive map screen powered by Mapbox GL JS.
// Shows all Houston basketball courts as custom orange markers on a live dark map.
//
// How it works:
//   1. Mapbox renders a real dark-themed street map into a <div> element
//   2. We place a custom orange basketball marker at each court's GPS coordinates
//   3. Tapping a marker (or a chip at the bottom) opens a detail sheet
//   4. The geolocate button lets users find themselves on the map
//   5. A search bar filters the chip row below the map

import { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { supabase } from '../lib/supabase';

import 'mapbox-gl/dist/mapbox-gl.css';

// ── Set your Mapbox access token ──────────────────────────────────────────
// Mapbox needs this to know who is loading the map and which account to bill.
// It reads the value from VITE_MAPBOX_TOKEN in your .env file.
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// ── Default map center: downtown Houston, TX ──────────────────────────────
// Mapbox uses [longitude, latitude] order (opposite of Google Maps)
const HOUSTON_CENTER = [-95.3698, 29.7604];

export default function MapScreen({ parks, onCheckIn, activeCheckIn, checkOut, user, isCheckingIn = false }) {
  // ── Refs (don't trigger re-renders when they change) ──────────────────────
  // The div element that Mapbox renders the map canvas into
  const mapContainerRef = useRef(null);
  // The Mapbox Map instance itself
  const mapRef = useRef(null);
  // All marker instances — stored so we can remove them on cleanup
  const markersRef = useRef([]);

  // ── State (these DO trigger re-renders) ───────────────────────────────────
  const [mapLoaded,    setMapLoaded]    = useState(false);
  const [selectedPark, setSelectedPark] = useState(null);
  const [searchQuery,  setSearchQuery]  = useState('');
  // court_id → number of times this user has checked in there
  const [visitMap, setVisitMap] = useState({});

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

    // Create the map and attach it to our container div
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,          // The div to render into
      style: 'mapbox://styles/mapbox/dark-v11',    // Dark map to match the app
      center: HOUSTON_CENTER,                       // Start centered on Houston
      zoom: 11,                                     // Zoom 11 = city-level view
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
    };
  }, []); // Empty array = run once when the component mounts

  // ── Sync court markers whenever court data changes ────────────────────────
  // The map itself is long-lived, but court data can arrive later or change
  // after check-ins. Rebuilding markers keeps live/empty styling accurate.
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    parks.forEach(park => {
      if (park.lng == null || park.lat == null) return;

      const el = createMarkerEl(park, !!visitMap[park.id]);
      el.addEventListener('click', () => setSelectedPark(park));

      // Place the marker at the court's real GPS coordinates
      // Mapbox uses [lng, lat] order — notice longitude comes first
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([park.lng, park.lat])
        .addTo(mapRef.current);

      // Keep a reference so we can clean it up later
      markersRef.current.push(marker);
    });
  }, [mapLoaded, parks, visitMap]);

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

  // ── Filter the chip row by whatever the user typed ────────────────────────
  // No API calls needed — we just filter the local array
  const filteredParks = parks.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="map-screen">

      {/* ── Map area wrapper ───────────────────────────────────────────────── */}
      {/* This wrapper is the positioned ancestor for the search bar and loading
          overlay. The map container itself must stay completely empty — Mapbox
          throws a warning if you put any children inside it. */}
      <div className="map-wrap">

        {/* The map container — MUST be empty. Mapbox owns everything inside here. */}
        <div ref={mapContainerRef} className="mapbox-container" />

        {/* Floating search bar — absolutely positioned over the map */}
        <div className="map-search-bar">
          <input
            type="text"
            placeholder="🔍  Search courts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="map-search-input"
          />
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
            {/* Drag handle row with close button */}
            <div className="map-sheet-top-row">
              <div className="map-sheet-drag-handle" />
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
              {selectedPark.players > 0 ? (
                <span className="map-sheet-live-badge">
                  🟢 {selectedPark.players} live
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
                <span className="map-sheet-meta-item" style={{ color: 'var(--orange)' }}>
                  ★ {Number(selectedPark.avgRating).toFixed(1)} ({selectedPark.reviewCount})
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="map-sheet-buttons">
              {/* Three check-in states:
                  1. Checked in HERE     → green "Checked In ✓" button that checks out
                  2. Checked in ELSEWHERE → orange "Switch Courts" button
                  3. Not checked in       → orange "Check In" button */}
              {activeCheckIn?.courtId === selectedPark.id ? (
                // Already at this court — tap to check out
                <button
                  className="auth-submit-btn"
                  style={{ flex: 1, background: '#22c55e' }}
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
                  className="auth-submit-btn"
                  style={{ flex: 1 }}
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
                  className="auth-submit-btn"
                  style={{ flex: 1 }}
                  onClick={() => {
                    onCheckIn(selectedPark.id);
                    setSelectedPark(null);
                  }}
                  disabled={isCheckingIn}
                >
                  {isCheckingIn ? 'Checking in…' : 'Check In'}
                </button>
              )}

              {/* Opens Apple Maps or Google Maps with the court's coordinates */}
              <a
                className="map-directions-btn"
                href={`https://maps.google.com/?q=${selectedPark.lat},${selectedPark.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Get Directions
              </a>
            </div>
          </div>
        </>
      )}

      {/* ── Scrollable court chips ─────────────────────────────────────────── */}
      {/* Always visible at the bottom. Filtered by the search bar. */}
      <div className="map-courts-sheet">
        <div className="sheet-handle" />
        <div className="sheet-handle-row">
          <span className="section-title" style={{ fontSize: 15 }}>Nearby</span>
          <span className="section-count">{filteredParks.length} courts</span>
        </div>
        <div className="map-court-list">
          {filteredParks.map(park => (
            <div
              key={park.id}
              className={`map-court-chip ${park.players > 0 ? 'has-players' : ''} ${visitMap[park.id] ? 'visited' : ''}`}
              onClick={() => flyToPark(park)}
            >
              <div className="map-court-chip-name">
                {park.name}
                {visitMap[park.id] > 0 && (
                  <span className="map-court-visited-badge">✓ Visited</span>
                )}
              </div>
              <div className="map-court-chip-info">
                {park.players > 0
                  ? `🏀 ${park.players} players · ${park.distance}`
                  : `Empty · ${park.distance}`}
                {park.reviewCount > 0 && (
                  <span style={{ color: 'var(--orange)', marginLeft: 4 }}>
                    · ★ {Number(park.avgRating).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ── Custom marker element factory ─────────────────────────────────────────────
// Builds the DOM element for each court marker.
// Mapbox lets you supply your own HTML instead of using its default pin shape.
//
// The marker is an orange circle when the court is live (has players),
// or a darker circle when it's empty. A green pulsing dot appears on
// top-right to signal "live" status.
function createMarkerEl(park, visited = false) {
  const el = document.createElement('div');
  el.className = [
    'mb-marker',
    park.players > 0 ? 'live' : '',
    visited ? 'visited' : '',
  ].filter(Boolean).join(' ');

  const emoji = document.createElement('span');
  emoji.className = 'mb-marker-emoji';
  emoji.textContent = '🏀';
  el.appendChild(emoji);

  if (park.players > 0) {
    const dot = document.createElement('div');
    dot.className = 'mb-live-dot';
    el.appendChild(dot);
  }

  // Checkmark badge for courts the user has visited
  if (visited) {
    const check = document.createElement('div');
    check.className = 'mb-visited-dot';
    el.appendChild(check);
  }

  return el;
}
