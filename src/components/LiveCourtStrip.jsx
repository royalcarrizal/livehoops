// src/components/LiveCourtStrip.jsx
//
// The horizontal row of courts that have players on them right now, sitting
// directly under the Home header and above the feed tabs — so it stays visible
// on both tabs. It answers the one question the app exists to answer: where is
// there a game happening right now?
//
// Renders nothing when no court is live. A row of empty cards reading
// "0 running" states the opposite of what this row is for.
//
// Props:
//   parks        — the courts array (App's `parks` prop)
//   setActiveTab — switch app tabs; tapping a card opens it on the Map

import { sortByDistance } from '../hooks/useCourts';

export default function LiveCourtStrip({ parks = [], setActiveTab }) {
  // Nearest first. sortByDistance already puts unknown distances last, which
  // matters when GPS is denied — every court's distance is null then, and the
  // row simply keeps its original order instead of pretending to be sorted.
  const live = sortByDistance(parks.filter(p => p.players > 0));

  if (live.length === 0) return null;

  // Same cross-tab handoff ActiveFriendsRow uses: MapScreen reads lh_focus_court
  // on load and flies to that court with its sheet open.
  const handleTap = (court) => {
    localStorage.setItem('lh_focus_court', court.id);
    setActiveTab('map');
  };

  return (
    <div className="live-court-strip">
      {live.map((court, index) => (
        <button
          key={court.id}
          type="button"
          className="live-court-card"
          style={{ animationDelay: `${index * 50}ms` }}
          onClick={() => handleTap(court)}
          aria-label={`${court.name}, ${court.players} playing, ${court.distance} away`}
        >
          <div className="live-court-card-status">
            <span className="live-dot" />
            {court.players} running
          </div>

          <div className="live-court-card-name">{court.name}</div>

          {/* "—" when GPS is unavailable. Rendering "— away" reads as broken,
              so the word is dropped along with the number. */}
          <div className="live-court-card-distance">
            {court.distance && court.distance !== '—' ? `${court.distance} away` : 'Distance unknown'}
          </div>
        </button>
      ))}
    </div>
  );
}
