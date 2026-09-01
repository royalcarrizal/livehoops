// src/screens/CheckInScreen.jsx
//
// What is happening right now — with your session, and with the courts and
// people around you.
//
// THE RULE THIS SCREEN STILL KEEPS
// This screen used to carry a scrollable list of every court to check into.
// That was the third copy of the same thing, after Home's Nearby tab and the
// Map's court panel, and it is not coming back. Browsing courts is those
// screens' job.
//
// WHAT IT SHOWS INSTEAD
// Live-only, self-hiding context. The courts with a game on *right now*
// (LiveCourtStrip) and the friends who are out *right now* (ActiveFriendsRow).
// Neither is browsable, sortable or complete, and both render nothing at all
// when nothing is happening — at which point the screen falls back to the
// plain "Not checked in" hero it has always had.
//
// So: if you are tempted to add a `.park-list` here, read the paragraph above
// this one. A strip of what is live is not a court list.

import { useState, useEffect } from 'react';
import MapPostModal from '../components/MapPostModal';
import WhosHere from '../components/WhosHere';
import CourtLines from '../components/CourtLines';
import LiveCourtStrip from '../components/LiveCourtStrip';
import ActiveFriendsRow from '../components/ActiveFriendsRow';
import ScheduledRunsList from '../components/ScheduledRunsList';
import CourtRoyalty from '../components/CourtRoyalty';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { usePosts } from '../hooks/usePosts';
import { useFriends } from '../hooks/useFriends';
import { useCourtKing } from '../hooks/useCourtKing';
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
  courtsLoading,   // true while courts are still in flight — see hasContent below
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

  // Friends are fetched here rather than passed down from App, matching the
  // other four call sites (Home, Friends, Profile, Discover). Lifting the hook
  // into App would dedupe the request, but it would also stop Home refetching
  // on tab-back — which is how accepting a friend request currently shows up
  // there. That trade belongs in its own change, not this one.
  const { friends, loading: friendsLoading } = useFriends(user?.id);

  // Per-court leaderboard for the court you are standing on. The hook takes no
  // argument; you call fetchKings(courtId). See the effect below.
  const { kings, loading: kingsLoading, fetchKings } = useCourtKing();

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

  // ── King of the Court, for the court you are on ───────────────────────────
  // Keyed on the court id so switching courts mid-session refetches. fetchKings
  // clears its own state first, so the previous court's kings never linger.
  const activeCourtId = activeCheckIn?.courtId ?? null;
  useEffect(() => {
    if (activeCourtId) fetchKings(activeCourtId);
  }, [activeCourtId, fetchKings]);

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
  if (!activeCheckIn) {
    // LiveCourtStrip and ActiveFriendsRow both return null when they have
    // nothing, so the screen cannot ask them after the fact whether they
    // rendered — it has to know first, to decide between the hero and the
    // demoted footer, and to keep each section header from orphaning above
    // nothing. Hence these two filters, which deliberately mirror the ones
    // inside those components. Two one-line predicates is a better trade than
    // threading an onEmpty callback through shared components, and they can't
    // be exported from the component files (react-refresh: components only).
    const liveCourts = (parks ?? []).filter(p => p.players > 0);
    const crewOut    = (friends ?? []).filter(f => f.currentCourt || f.checkedInParkId);
    const hasContent = liveCourts.length > 0 || crewOut.length > 0;

    // Courts and friends both start as [] while loading, so "nothing is live"
    // and "nothing has arrived yet" look identical from here. Painting the
    // 56px hero during that gap and then swapping it for content is worse than
    // the old screen, where the hero was the final answer. Skeleton instead.
    const settling = (courtsLoading || friendsLoading) && !hasContent;

    return (
      <div className="screen-content">
        <div className="screen-header">
          <h1 className="app-title">Live<span>Hoops</span></h1>
        </div>

        {/* The status this screen uniquely answers. It survives the hero being
            demoted below — losing it would make the Check tab the only screen
            that doesn't say whether you're checked in. */}
        {(hasContent || settling) && (
          <div className="section-header">
            <span className="section-title">Not checked in</span>
          </div>
        )}

        {settling && (
          <div className="feed-skeleton">
            <div className="feed-skeleton-card" />
          </div>
        )}

        {/* Live now — LiveCourtStrip brings no header of its own, so the header
            and the strip share one guard and can never come apart. */}
        {liveCourts.length > 0 && (
          <>
            <div className="section-header section-header--eyebrow">
              <span className="section-eyebrow">Live now</span>
              <span className="section-count">
                {liveCourts.length} {liveCourts.length === 1 ? 'court' : 'courts'}
              </span>
            </div>
            <LiveCourtStrip parks={parks} setActiveTab={setActiveTab} />
          </>
        )}

        {/* Crew out — this one DOES render its own header, so it takes the
            label as a prop. Do not wrap it in a section header too. */}
        {crewOut.length > 0 && (
          <ActiveFriendsRow
            friends={friends}
            setActiveTab={setActiveTab}
            label="Crew out"
          />
        )}

        {/* Hero when there is nothing above it to look at, footer when there
            is. The way out to the map has to stay reachable either way, but
            above live content it would invert the read order and push the
            answer off a 390px screen. */}
        <div className={`no-checkin-state${hasContent || settling ? ' no-checkin-state--footer' : ''}`}>
          {!hasContent && !settling && (
            <>
              <CourtLines variant="check" />
              <div className="no-checkin-icon">🏀</div>
              <h2 className="no-checkin-title">Not checked in</h2>
            </>
          )}
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

        {/* Who owns this court. Held back until the fetch settles — CourtRoyalty
            renders its "No king yet" nudge whenever kings are empty, which is
            also what they look like mid-flight, so rendering early would flash
            "no king" on a court that has one. Inside .checkin-screen because
            .court-king has no gutter of its own. */}
        {!kingsLoading && (
          <CourtRoyalty
            kings={kings}
            currentUserId={user?.id}
            onViewProfile={onViewProfile}
          />
        )}
      </div>

      {/* Runs scheduled at THIS court over the next week. Self-hiding, and it
          brings its own header. A sibling of .checkin-screen rather than a
          child: .scheduled-run-list carries its own 16px gutter and would sit
          at 36px inside the screen's 20px one. */}
      <ScheduledRunsList
        meetups={checkedInPark?.meetups ?? []}
        userId={user?.id}
        setActiveTab={setActiveTab}
      />

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
