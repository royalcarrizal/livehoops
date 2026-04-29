// src/screens/CheckInScreen.jsx
//
// Shows the user's current check-in session (if active) or a list of
// courts to check in to. Uses real Supabase data via the useCheckIn hook
// passed down from App.jsx — no more hardcoded timers or mock state.

import { useState, useEffect } from 'react';
import ParkCard from '../components/ParkCard';
import AddCourtSheet from '../components/AddCourtSheet';
import { useToast } from '../hooks/useToast';
import Toast from '../components/Toast';

// ── Time display helpers ────────────────────────────────────────────────────
// These take a Unix timestamp (milliseconds) and return a human-friendly
// string. They're called every minute so the timer stays up to date.

function formatElapsed(checkInTime) {
  // checkInTime is Date.getTime() — milliseconds since epoch
  const minutes = Math.floor((Date.now() - checkInTime) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins  = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatTimeLeft(checkInTime) {
  // Sessions expire after 3 hours — show how much time is left
  const expiresAt = checkInTime + 3 * 60 * 60 * 1000;
  const msLeft    = expiresAt - Date.now();
  if (msLeft <= 0) return 'Expired';
  const hoursLeft = Math.floor(msLeft / 3600000);
  const minsLeft  = Math.floor((msLeft % 3600000) / 60000);
  return `${hoursLeft}h ${minsLeft}m left`;
}

export default function CheckInScreen({
  parks,
  activeCheckIn,   // { checkinId, courtId, courtName, courtAddress, checkedInAt } or null
  checkIn,         // function(courtId, userId)
  checkOut,        // function(checkinId, courtId, userId)
  setActiveTab,
  user,
  refreshCounts,   // re-fetches player counts from DB
}) {
  // Forces a re-render every minute so the elapsed / remaining timers update
  const [, forceUpdate] = useState(0);

  // Controls whether the "Add a Court" slide-up sheet is visible
  const [showAddCourt, setShowAddCourt] = useState(false);

  // Loading state while the checkout Supabase call is in progress
  const [checkingOut, setCheckingOut] = useState(false);

  // Toast for the checkout success message
  const { toast, showToast } = useToast();

  // ── Real court data from the parks array ──────────────────────────────────
  // Look up the full court object using the courtId from activeCheckIn.
  // We need this for the live player count (which changes as others check in)
  // and the address. Fall back to the values stored in activeCheckIn itself
  // in case the parks array hasn't loaded yet.
  const checkedInPark = activeCheckIn
    ? parks.find(p => p.id === activeCheckIn.courtId) ?? null
    : null;

  // Convert the ISO timestamp string from Supabase to milliseconds
  const checkInTime = activeCheckIn
    ? new Date(activeCheckIn.checkedInAt).getTime()
    : null;

  // Re-render every 60 seconds so the timers stay accurate
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Live player count refresh ─────────────────────────────────────────────
  // Every 60 seconds, re-fetch player_count for all courts from Supabase
  // so the "Active Courts" list shows real numbers as other users check in/out.
  useEffect(() => {
    if (!refreshCounts) return;
    const id = setInterval(refreshCounts, 60000);
    return () => clearInterval(id);
  }, [refreshCounts]);

  // ── Handle check-out button press ─────────────────────────────────────────
  async function handleCheckOut() {
    if (!activeCheckIn || checkingOut) return;
    setCheckingOut(true);
    await checkOut(activeCheckIn.checkinId, activeCheckIn.courtId, user.id);
    setCheckingOut(false);
    showToast(`Great run! Checked out of ${activeCheckIn.courtName} 🏀`);
  }

  return (
    <div className="screen-content">
      <div className="screen-header">
        <h1 className="app-title">Live<span>Hoops</span></h1>
      </div>

      <div className="checkin-screen">
        {activeCheckIn ? (
          <>
            {/* ── Active session card ──────────────────────────────────────── */}
            {/* Shown when the user is currently checked in somewhere.         */}
            {/* All values are real: court name from Supabase, live timer.     */}
            <div className="active-session-card">
              <div className="session-badge">
                <div className="live-dot" style={{ width: 7, height: 7 }} />
                <span className="session-badge-text">Active Session</span>
              </div>

              {/* Real court name from Supabase */}
              <div className="session-court-name">
                {checkedInPark?.name ?? activeCheckIn.courtName}
              </div>

              {/* Real court address */}
              <div className="session-court-address">
                {checkedInPark?.shortAddress ?? activeCheckIn.courtAddress}
              </div>

              <div className="session-stats">
                {/* Live player count from the courts table */}
                <div className="session-stat">
                  <span className="session-stat-value">{checkedInPark?.players ?? 0}</span>
                  <span className="session-stat-label">players here</span>
                </div>

                {/* Real elapsed time calculated from the Supabase timestamp */}
                <div className="session-stat">
                  <span className="session-stat-value">{formatElapsed(checkInTime)}</span>
                  <span className="session-stat-label">checked in</span>
                </div>

                {/* Countdown to the 3-hour auto-expire */}
                <div className="session-stat">
                  <span className="session-stat-value" style={{ fontSize: 16 }}>
                    {formatTimeLeft(checkInTime)}
                  </span>
                  <span className="session-stat-label">remaining</span>
                </div>
              </div>

              {/* Check Out button — shows "Checking out..." while the Supabase update runs */}
              <button
                className="btn-checkout"
                disabled={checkingOut}
                onClick={handleCheckOut}
              >
                {checkingOut ? 'Checking out...' : 'Check Out'}
              </button>

              {/* Small link to open the Add a Court sheet */}
              <div className="add-court-link" onClick={() => setShowAddCourt(true)}>
                Know a court that's missing? Add it →
              </div>
            </div>

            {/* ── Other nearby courts ───────────────────────────────────────── */}
            <div className="section-header" style={{ paddingLeft: 0, paddingRight: 0 }}>
              <span className="section-title">Other Nearby Courts</span>
            </div>
            <div className="park-list" style={{ padding: 0, gap: 8 }}>
              {parks.filter(p => p.id !== activeCheckIn.courtId).slice(0, 3).map(park => (
                <ParkCard
                  key={park.id}
                  park={park}
                  isCheckedIn={false}
                  onCheckIn={(courtId) => checkIn(courtId, user?.id)}
                />
              ))}
            </div>
          </>
        ) : (
          // ── Not checked in state ─────────────────────────────────────────────
          <div className="no-checkin-state">
            <div className="no-checkin-icon">🏀</div>
            <h2 className="no-checkin-title">Not checked in</h2>
            <p className="no-checkin-subtitle">
              Find a court near you and let others know you're running.
            </p>
            <button className="btn-primary" onClick={() => setActiveTab('home')}>
              Find a Court
            </button>

            {/* Button to open the Add a Court slide-up sheet */}
            <button className="btn-add-court" onClick={() => setShowAddCourt(true)}>
              + Add a Court
            </button>

            {/* ── Active Courts list ─────────────────────────────────────────── */}
            {/* Only shows courts with at least one player right now.            */}
            {/* Player counts come from useCourts (real DB data), refreshed      */}
            {/* every 60 seconds by the setInterval above.                       */}
            <div style={{ marginTop: 32, textAlign: 'left' }}>
              <div className="section-header" style={{ paddingLeft: 0, paddingRight: 0 }}>
                <span className="section-title">Active Courts</span>
              </div>
              <div className="park-list" style={{ padding: 0, gap: 8 }}>
                {parks.filter(p => p.players > 0).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                    No courts are active right now.
                  </p>
                ) : (
                  parks.filter(p => p.players > 0).map(park => (
                    <ParkCard
                      key={park.id}
                      park={park}
                      isCheckedIn={false}
                      onCheckIn={(courtId) => checkIn(courtId, user?.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 16 }} />

      {/* ── Add a Court sheet ──────────────────────────────────────────────── */}
      {/* Slides up from the bottom. Always in the DOM so the CSS transition   */}
      {/* animates properly — visibility is controlled by the .open class.     */}
      <AddCourtSheet
        isOpen={showAddCourt}
        onClose={() => setShowAddCourt(false)}
        user={user}
      />

      {/* Checkout success toast */}
      <Toast message={toast} />
    </div>
  );
}
