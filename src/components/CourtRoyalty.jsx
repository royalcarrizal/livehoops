// src/components/CourtRoyalty.jsx
//
// "Court Royalty" block shown in a court's detail sheet — the two reigning
// kings of that court:
//   👑 King of Hours     — most total time on court
//   👑 King of Check-ins — most check-ins there
//
// Purely presentational. Data comes from useCourtKing (see the hook); this
// just renders it, reusing the same avatar + tap-to-open-profile pattern as
// the "Playing now" row. Used by both the Map tab's inline sheet
// (MapScreen.jsx) and the reusable CourtDetailSheet.jsx.
//
// Props:
//   kings         — { hoursKing, checkinsKing } from useCourtKing
//   currentUserId — logged-in user's id (to label their own row "You")
//   onViewProfile — (userId) => void — opens a king's profile

import Avatar from './Avatar';
import { formatHours } from '../hooks/useCourtKing';

// One king row: crown + title, avatar, name (+ jersey), and their stat.
function KingRow({ title, crown, king, stat, currentUserId, onViewProfile }) {
  const isYou = king.userId === currentUserId;
  return (
    <button
      className="court-king-row"
      onClick={() => onViewProfile?.(king.userId)}
      aria-label={`View ${king.username}'s profile`}
    >
      <span className="court-king-crown">{crown}</span>
      <Avatar
        avatarUrl={king.avatarUrl}
        initials={king.initials}
        size={34}
      />
      <div className="court-king-info">
        <div className="court-king-title">{title}</div>
        <div className="court-king-name">
          {isYou ? 'You' : king.username.split('_')[0]}
          {king.jerseyNumber != null && (
            <span className="jersey-number">#{king.jerseyNumber}</span>
          )}
        </div>
      </div>
      <span className="court-king-stat">{stat}</span>
    </button>
  );
}

export default function CourtRoyalty({ kings, currentUserId, onViewProfile }) {
  const { hoursKing, checkinsKing } = kings ?? {};

  return (
    <div className="court-king">
      <div className="court-king-label">Court Royalty</div>

      {!hoursKing && !checkinsKing ? (
        // No completed check-ins here yet — nudge the user to be first.
        <div className="court-king-empty">
          👑 No king yet — check in to claim the throne
        </div>
      ) : (
        <>
          {hoursKing && (
            <KingRow
              title="King of Hours"
              crown="👑"
              king={hoursKing}
              stat={formatHours(hoursKing.totalMinutes)}
              currentUserId={currentUserId}
              onViewProfile={onViewProfile}
            />
          )}
          {checkinsKing && (
            <KingRow
              title="King of Check-ins"
              crown="👑"
              king={checkinsKing}
              stat={`${checkinsKing.totalCheckins} ${checkinsKing.totalCheckins === 1 ? 'check-in' : 'check-ins'}`}
              currentUserId={currentUserId}
              onViewProfile={onViewProfile}
            />
          )}
        </>
      )}
    </div>
  );
}
