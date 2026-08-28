// src/screens/CheckInScreen.jsx
//
// Your active session, and nothing else.
//
// This screen used to be two screens wearing one name: the session card, and —
// either side of it — a list of courts to check into. That list is now the
// third copy of the same thing, after Home's Nearby tab and the Map's court
// panel. Finding a court is those screens' job; this one answers "what is
// happening with MY session right now", which nothing else shows.

import { useState, useEffect } from 'react';
import MapPostModal from '../components/MapPostModal';
import WhosHere from '../components/WhosHere';
import CourtLines from '../components/CourtLines';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { usePosts } from '../hooks/usePosts';
import { remainingMs } from '../utils/autoCheckout';
import { formatElapsed } from '../utils/datetime';

// ── Time display helpers ────────────────────────────────────────────────────
// formatElapsed now lives in utils/datetime.js — the Friends screen needs the
// same wording for "At Cadman Plaza · 40m", and two copies of a duration format
// is how "1h 12m" and "1h12m" end up on the same screen.

// How long is left before the session expires on its own: "1h 47m".
//
// The limit comes from the user's own profile via remainingMs. This used to be
// hardcoded to three hours, which was right for the default and wrong for
// anyone who changed the setting — a player on 1h was told they had 2h 47m
// left while the session actually ended in 47 minutes.
function formatRemaining(checkInTime, profile) {
  const msLeft = remainingMs(checkInTime, profile);
  if (msLeft <= 0) return 'Expired';
  const hoursLeft = Math.floor(msLeft / 3600000);
  const minsLeft  = Math.floor((msLeft % 3600000) / 60000);
  if (hoursLeft === 0) return `${minsLeft}m`;
  return minsLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${hoursLeft}h`;
}

export default function CheckInScreen({
  parks,
  activeCheckIn,   // { checkinId, courtId, courtName, courtAddress, checkedInAt } or null
  checkOut,        // function(checkinId, courtId, userId)
  setActiveTab,
  user,
  profile,         // needed for the auto check-out limit — see formatRemaining
  refreshCounts,   // re-fetches player counts from DB
  onViewProfile,
}) {
  // Forces a re-render every minute so the elapsed / remaining timers update
  const [, forceUpdate] = useState(0);

  // Loading state while the checkout Supabase call is in progress
  const [checkingOut, setCheckingOut] = useState(false);

  // The "Post to feed" compose sheet
  const [showPostModal, setShowPostModal] = useState(false);

  const { toast, showToast } = useToast();
  const { createPost } = usePosts();

  // ── Real court data from the parks array ──────────────────────────────────
  // Look up the full court object using the courtId from activeCheckIn, for
  // the live player count and who else is here. Falls back to the values
  // stored on activeCheckIn itself while parks is still loading.
  const checkedInPark = activeCheckIn
    ? parks.find(p => p.id === activeCheckIn.courtId) ?? null
    : null;

  const checkInTime = activeCheckIn
    ? new Date(activeCheckIn.checkedInAt).getTime()
    : null;

  // Re-render every 60 seconds so the timers stay accurate
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Live player count refresh ─────────────────────────────────────────────
  // Every 60 seconds, re-fetch player counts so "Players here" and the faces
  // below stay true as others check in and out around you.
  useEffect(() => {
    if (!refreshCounts) return;
    const id = setInterval(refreshCounts, 60000);
    return () => clearInterval(id);
  }, [refreshCounts]);

  async function handleCheckOut() {
    if (!activeCheckIn || checkingOut) return;
    setCheckingOut(true);
    await checkOut(activeCheckIn.checkinId, activeCheckIn.courtId, user.id);
    setCheckingOut(false);
    showToast(`Great run! Checked out of ${activeCheckIn.courtName} 🏀`);
  }

  // ── Not checked in ────────────────────────────────────────────────────────
  // Deliberately slim. The old version listed courts here, which the Map and
  // Home's Nearby tab both do better — this just points at them.
  if (!activeCheckIn) {
    return (
      <div className="screen-content">
        <div className="screen-header">
          <h1 className="app-title">Live<span>Hoops</span></h1>
        </div>

        <div className="no-checkin-state">
          <CourtLines variant="check" />
          <div className="no-checkin-icon">🏀</div>
          <h2 className="no-checkin-title">Not checked in</h2>
          <p className="no-checkin-subtitle">
            Check in at a court so your crew knows where you&apos;re running.
          </p>
          <button className="btn btn--primary btn--lg" onClick={() => setActiveTab('map')}>
            Find a Court
          </button>
        </div>

        <Toast message={toast} />
      </div>
    );
  }

  // ── Checked in ────────────────────────────────────────────────────────────
  const courtName    = checkedInPark?.name ?? activeCheckIn.courtName;
  const courtAddress = checkedInPark?.shortAddress ?? activeCheckIn.courtAddress;

  return (
    <div className="screen-content">
      <div className="screen-header">
        <h1 className="app-title">Live<span>Hoops</span></h1>
      </div>

      <div className="checkin-screen">
        <div className="active-session-card">
          <div className="session-badge">
            <div className="live-dot" />
            <span className="session-badge-text">Checked in</span>
          </div>

          <div className="session-court-name">{courtName}</div>
          <div className="session-court-address">{courtAddress}</div>

          <div className="session-stats">
            <div className="session-stat">
              <span className="session-stat-value">{checkedInPark?.players ?? 0}</span>
              <span className="session-stat-label">Players here</span>
            </div>

            <div className="session-stat">
              <span className="session-stat-value">{formatElapsed(checkInTime)}</span>
              <span className="session-stat-label">Checked in</span>
            </div>

            {/* Green because it is counting down a live session. The value
                comes from the user's own auto check-out setting. */}
            <div className="session-stat">
              <span className="session-stat-value session-stat-value--live">
                {formatRemaining(checkInTime, profile)}
              </span>
              <span className="session-stat-label">Remaining</span>
            </div>
          </div>

          <div className="session-actions">
            <button
              className="btn btn--secondary btn--grow"
              disabled={checkingOut}
              onClick={handleCheckOut}
            >
              {checkingOut ? 'Checking out…' : 'Check out'}
            </button>
            <button
              className="btn btn--primary btn--grow"
              onClick={() => setShowPostModal(true)}
            >
              Post to feed
            </button>
          </div>
        </div>

        {/* Who else is on this court. Renders nothing when nobody else is
            visible — see WhosHere for how hidden players are counted. */}
        <WhosHere
          checkins={checkedInPark?.checkins ?? []}
          players={checkedInPark?.players ?? 0}
          currentUserId={user?.id}
          label="Who's here"
          onViewProfile={onViewProfile}
        />
      </div>

      {/* ── Post to feed ───────────────────────────────────────────────────── */}
      {/* The same compose sheet the Map uses, pre-tagged to this court. */}
      {showPostModal && (
        <MapPostModal
          court={checkedInPark ?? { id: activeCheckIn.courtId, name: activeCheckIn.courtName }}
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
        />
      )}

      <Toast message={toast} />
    </div>
  );
}
