// src/components/AddCourtSheet.jsx
//
// A slide-up sheet with a 3-step form for submitting a new basketball court.
// Users can add outdoor parks, indoor gyms, rec centers, or outdoor facilities.
//
// How it works:
//   Step 1 — Pick the court type (4 tappable cards in a 2x2 grid)
//   Step 2 — Fill in court details (name, address, surface, lighting, etc.)
//   Step 3 — Set the location (geolocation or address-based geocoding) + submit
//
// On submit the court is saved to the Supabase `courts` table with
// verified = false. It stays hidden from public court surfaces until an
// admin manually approves it in Supabase.
//
// The sheet uses the same slide-up animation pattern as SettingsSheet —
// it stays in the DOM at all times and slides up/down via CSS transform.

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import Toast from './Toast';

// ── The four court type options shown on Step 1 ──────────────────────────────
// Each object has an emoji icon, a human-readable label, and the value
// that gets stored in the Supabase `court_type` column.
const COURT_TYPES = [
  { emoji: '🏀', label: 'Outdoor Park',      value: 'outdoor_park' },
  { emoji: '🏋️', label: 'Indoor Gym',        value: 'indoor_gym' },
  { emoji: '🏢', label: 'Recreation Center',  value: 'indoor_facility' },
  { emoji: '🌳', label: 'Outdoor Facility',   value: 'outdoor_facility' },
];

// ── Surface options shown as tappable chips on Step 2 ────────────────────────
const SURFACE_OPTIONS = ['Concrete', 'Asphalt', 'Hardwood'];

// ── Lighting options shown as tappable chips on Step 2 ───────────────────────
const LIGHTING_OPTIONS = ['Yes', 'No'];

// ── Number-of-courts options shown as buttons on Step 2 ──────────────────────
const COUNT_OPTIONS = [1, 2, 3, '4+'];

function courtSubmitErrorMessage(error) {
  const message = error?.message ?? '';
  const lower = message.toLowerCase();

  if (lower.includes('row-level security') || lower.includes('violates row-level security')) {
    return 'Court submissions are blocked in Supabase. Check the courts insert policy.';
  }

  if (lower.includes('verified') || lower.includes('submitted_by')) {
    return 'Courts table is missing a required submission column.';
  }

  if (lower.includes('courts_lighting_check') || lower.includes('lighting')) {
    return 'Lighting must be Yes or No. Try selecting lighting again.';
  }

  if (lower.includes('failed to fetch') || lower.includes('address lookup')) {
    return 'Address lookup failed. Check the address and try again.';
  }

  if (message) {
    return `Submit failed: ${message.slice(0, 90)}`;
  }

  return 'Failed to submit — open the browser console for details';
}

export default function AddCourtSheet({ isOpen, onClose, user }) {

  // ── Form state ─────────────────────────────────────────────────────────────
  // step tracks which screen the user is on (1, 2, or 3)
  const [step, setStep]           = useState(1);

  // Step 1: which type of court did the user pick?
  const [courtType, setCourtType] = useState('');

  // Step 2: court details
  const [name, setName]             = useState('');
  const [address, setAddress]       = useState('');
  const [city, setCity]             = useState('Houston');
  const [courtCount, setCourtCount] = useState(1);
  const [surface, setSurface]       = useState('');
  const [lighting, setLighting]     = useState('');

  // Step 3: location
  // locationMode is null until the user chooses GPS or address-based submit.
  const [locationMode, setLocationMode] = useState(null);
  // coords holds { lat, lng } if the user granted geolocation access
  const [coords, setCoords]         = useState(null);
  // true while we're waiting for the browser's geolocation response
  const [locLoading, setLocLoading] = useState(false);
  // true if the browser blocked or denied location access
  const [locDenied, setLocDenied]   = useState(false);

  // true while the Supabase insert is in flight
  const [submitting, setSubmitting] = useState(false);

  // The sheet has its own toast so messages show on top of the overlay
  const { toast, showToast } = useToast();

  // ── Reset all form state when the sheet closes ─────────────────────────────
  // This ensures the form always starts fresh when the user opens it again.
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setCourtType('');
      setName('');
      setAddress('');
      setCity('Houston');
      setCourtCount(1);
      setSurface('');
      setLighting('');
      setLocationMode(null);
      setCoords(null);
      setLocLoading(false);
      setLocDenied(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  // ── Step 1 handler: pick a court type ──────────────────────────────────────
  // When the user taps a type card, we highlight it immediately and then
  // auto-advance to Step 2 after a short 300ms delay so they see the selection.
  const handleTypeSelect = (value) => {
    setCourtType(value);
    setTimeout(() => setStep(2), 300);
  };

  // ── Step 3 handler: request the user's GPS location ────────────────────────
  // Uses the browser's built-in geolocation API. If the user allows it,
  // we store the coordinates. If they deny or the browser blocks it,
  // we set locDenied = true and fall back to geocoding the address later.
  const handleGetLocation = () => {
    setLocationMode('gps');
    setLocLoading(true);
    setLocDenied(false);
    navigator.geolocation.getCurrentPosition(
      // Success callback — the browser gave us coordinates
      (position) => {
        setLocationMode('gps');
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setLocLoading(false);
      },
      // Error callback — user denied or something went wrong
      () => {
        setLocationMode('address');
        setCoords(null);
        setLocDenied(true);
        setLocLoading(false);
      },
      // Options — ask for the best accuracy the device can provide
      { enableHighAccuracy: true }
    );
  };

  const handleUseAddress = () => {
    setLocationMode('address');
    setCoords(null);
    setLocDenied(false);
    setLocLoading(false);
  };

  // ── Submit handler ─────────────────────────────────────────────────────────
  // Called when the user taps "Submit Court" on Step 3.
  // 1. Determine coordinates (geolocation or geocode the address via Mapbox)
  // 2. Insert a pending row into the Supabase `courts` table
  // 3. Close the sheet and show a success toast
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let lat, lng;

      if (locationMode === 'gps' && coords) {
        // The user granted geolocation — use those coordinates directly
        lat = coords.lat;
        lng = coords.lng;
      } else {
        // No geolocation — fall back to the Mapbox geocoding API.
        // We send the street address + city + state and Mapbox returns
        // the best-matching GPS coordinates.
        const query = encodeURIComponent(`${address} ${city} TX`);
        const token = import.meta.env.VITE_MAPBOX_TOKEN;
        if (!token) {
          throw new Error('Address lookup is not configured');
        }

        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${token}&limit=1`
        );

        if (!res.ok) {
          throw new Error('Address lookup failed');
        }

        const data = await res.json();

        // If Mapbox couldn't find anything, show an error and stop
        if (!data.features || data.features.length === 0) {
          showToast('Could not find that address — please check and try again');
          setSubmitting(false);
          return;
        }

        // Mapbox returns coordinates as [longitude, latitude]
        [lng, lat] = data.features[0].center;
      }

      // Insert the new court into the Supabase `courts` table as pending.
      // Public court queries only show verified rows, so this stays hidden
      // until it is manually approved in Supabase.
      const { error } = await supabase
        .from('courts')
        .insert({
          name,
          address,
          city,
          state: 'TX',
          lat,
          lng,
          court_type: courtType,
          surface: surface || 'Other',
          lighting: lighting || 'No',
          courts: courtCount,
          player_count: 0,
          submitted_by: user.id,
          verified: false,
        });

      if (error) throw error;

      // Close the sheet and let the user know it worked
      onClose();
      showToast('Court submitted! It will appear on the map after review 🏀');
    } catch (err) {
      // Something went wrong — show a generic error message
      console.error('Submit court error:', err);
      showToast(courtSubmitErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Can the user advance from Step 2 to Step 3? ───────────────────────────
  // They must fill in the court name, address, and city before proceeding.
  const canAdvance = name.trim() && address.trim() && city.trim();

  return (
    <>
      {/* ── Dark overlay behind the sheet ────────────────────────────────────── */}
      {/* Reuses the same overlay class as SettingsSheet. Tapping it closes.    */}
      <div
        className={`settings-overlay${isOpen ? ' open' : ''}`}
        style={{ zIndex: 299 }}
        onClick={onClose}
      />

      {/* ── The slide-up sheet ───────────────────────────────────────────────── */}
      <div className={`add-court-sheet${isOpen ? ' open' : ''}`}>

        {/* ── Progress indicator: 3 dots ──────────────────────────────────── */}
        {/* The active step's dot is orange and wider (24px vs 8px).          */}
        <div className="add-court-progress">
          {[1, 2, 3].map(n => (
            <div
              key={n}
              className={`add-court-progress-dot${step === n ? ' active' : ''}`}
            />
          ))}
        </div>

        {/* ── Header: title + close button ────────────────────────────────── */}
        <div className="add-court-header">
          <span className="add-court-title">Add a Court</span>
          <button
            className="add-court-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Step content area ────────────────────────────────────────────── */}
        <div className="add-court-body">

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 1 — Court Type Selection                                  */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 1 && (
            <>
              <div className="add-court-step-heading">What kind of court?</div>

              {/* 2x2 grid of court type cards */}
              <div className="add-court-type-grid">
                {COURT_TYPES.map(ct => (
                  <button
                    key={ct.value}
                    className={`add-court-type-card${courtType === ct.value ? ' selected' : ''}`}
                    onClick={() => handleTypeSelect(ct.value)}
                    type="button"
                  >
                    {/* Large emoji icon */}
                    <span className="add-court-type-icon">{ct.emoji}</span>
                    {/* Label below the icon */}
                    <span className="add-court-type-label">{ct.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 2 — Court Details                                         */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 2 && (
            <>
              <div className="add-court-step-heading">Tell us about the court</div>

              {/* Court name — required */}
              <label className="add-court-field-label">Court name *</label>
              <input
                className="add-court-input"
                type="text"
                placeholder="e.g. Westpark Community Courts"
                value={name}
                onChange={e => setName(e.target.value)}
              />

              {/* Street address — required */}
              <label className="add-court-field-label">Address *</label>
              <input
                className="add-court-input"
                type="text"
                placeholder="Street address"
                value={address}
                onChange={e => setAddress(e.target.value)}
              />

              {/* City — pre-filled with "Houston", but editable */}
              <label className="add-court-field-label">City *</label>
              <input
                className="add-court-input"
                type="text"
                placeholder="City"
                value={city}
                onChange={e => setCity(e.target.value)}
              />

              {/* Number of courts — row of 4 tappable buttons */}
              <label className="add-court-field-label">Number of courts</label>
              <div className="add-court-count-row">
                {COUNT_OPTIONS.map(opt => {
                  // "4+" is stored as the number 4 internally
                  const numValue = opt === '4+' ? 4 : opt;
                  return (
                    <button
                      key={opt}
                      className={`add-court-count-btn${courtCount === numValue ? ' selected' : ''}`}
                      onClick={() => setCourtCount(numValue)}
                      type="button"
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {/* Surface type — 3 tappable chips */}
              <label className="add-court-field-label">Surface</label>
              <div className="add-court-chips">
                {SURFACE_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    className={`add-court-chip${surface === opt ? ' selected' : ''}`}
                    onClick={() => setSurface(opt)}
                    type="button"
                  >
                    {opt}
                  </button>
                ))}
              </div>

              {/* Lighting — 2 tappable chips */}
              <label className="add-court-field-label">Lighting</label>
              <div className="add-court-chips">
                {LIGHTING_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    className={`add-court-chip${lighting === opt ? ' selected' : ''}`}
                    onClick={() => setLighting(opt)}
                    type="button"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ════════════════════════════════════════════════════════════════ */}
          {/* STEP 3 — Location + Submit                                     */}
          {/* ════════════════════════════════════════════════════════════════ */}
          {step === 3 && (
            <>
              <div className="add-court-step-heading">Where is it?</div>
              <div className="add-court-step-subtext">
                We'll use your current location or you can search for the address
              </div>

              {/* Option 1: Use the device's GPS */}
              <button
                className="add-court-location-btn"
                onClick={handleGetLocation}
                disabled={locLoading}
                type="button"
                style={{
                  borderColor: locationMode === 'gps' ? 'var(--orange)' : undefined,
                }}
              >
                {locLoading ? 'Getting location...' : '📍 Use my current location'}
              </button>

              {/* Show coordinates after geolocation succeeds */}
              {locationMode === 'gps' && coords && (
                <div className="add-court-location-captured">
                  📍 Location captured
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                  </div>
                </div>
              )}

              {/* Show fallback message if geolocation was denied */}
              {locDenied && locationMode === 'address' && (
                <div className="add-court-location-captured" style={{ color: 'var(--text-secondary)' }}>
                  Location access denied — we'll use your address to find coordinates
                </div>
              )}

              {/* Option 2: Use the address they already entered */}
              <button
                className="add-court-location-btn"
                onClick={handleUseAddress}
                type="button"
                style={{
                  background: locationMode === 'address' ? 'rgba(255, 107, 0, 0.12)' : 'transparent',
                  border: `0.5px solid ${locationMode === 'address' ? 'var(--orange)' : 'var(--separator)'}`,
                }}
              >
                Use address instead
              </button>

              {/* Informational note shown if they pick "Use address instead" */}
              {locationMode === 'address' ? (
                <div className="add-court-location-captured">
                  Address selected
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    We'll find coordinates when you submit.
                  </div>
                </div>
              ) : !coords && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 4 }}>
                  We'll geocode your address automatically when you submit
                </div>
              )}

              {/* Review notice — sets expectations about the verification process */}
              <div className="add-court-note">
                Your submission will be reviewed before appearing on the map for all users
              </div>
            </>
          )}
        </div>

        {/* ── Navigation buttons ──────────────────────────────────────────── */}
        {/* Only shown on Steps 2 and 3 (Step 1 auto-advances on card tap).  */}
        {step > 1 && (
          <div className="add-court-nav">
            {/* Back button — goes to the previous step */}
            <button
              className="add-court-back-btn"
              onClick={() => setStep(s => s - 1)}
              type="button"
            >
              Back
            </button>

            {/* Step 2: "Next" advances to Step 3 */}
            {step === 2 && (
              <button
                className="add-court-next-btn"
                disabled={!canAdvance}
                onClick={() => setStep(3)}
                type="button"
              >
                Next
              </button>
            )}

            {/* Step 3: "Submit Court" saves to Supabase */}
            {step === 3 && (
              <button
                className="add-court-next-btn"
                disabled={submitting}
                onClick={handleSubmit}
                type="button"
              >
                {submitting ? 'Submitting...' : 'Submit Court'}
              </button>
            )}
          </div>
        )}

        {/* Toast notification — renders inside the sheet so it appears above the overlay */}
        <Toast message={toast} />
      </div>
    </>
  );
}
