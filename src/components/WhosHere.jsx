// src/components/WhosHere.jsx
//
// The row of players currently checked in at a court.
//
// This markup existed twice — copied between MapScreen's court sheet and
// CourtDetailSheet — before the Check screen needed it a third time. One
// component now serves all three.
//
// The player list is privacy-filtered: `checkins` comes from the
// get_court_active_players RPC, which omits anyone who has hidden their
// location or made their profile private. `players` is the raw count from the
// courts table and can therefore be HIGHER. That difference is not a bug to
// paper over — it is reported honestly as "+N more playing", so the court's
// count adds up without naming anyone who chose not to be named.
//
// Props:
//   checkins      — [{ userId, username, avatarUrl, initials }]
//   players       — the court's total player count (may exceed checkins.length)
//   currentUserId — so the viewer reads as "You" rather than their own username
//   label         — section heading; defaults to the court-sheet wording
//   onViewProfile — tapping a player opens their profile

import Avatar from './Avatar';

// How many faces before the rest collapse into a "+N" pill.
const MAX_FACES = 6;

export default function WhosHere({
  checkins = [],
  players = 0,
  currentUserId,
  label = 'Playing now',
  onViewProfile,
}) {
  // Nobody visible — render nothing rather than an empty heading. The caller
  // does not have to guard this itself.
  if (checkins.length === 0) return null;

  const hidden = players - checkins.length;

  return (
    <div className="whos-here">
      <div className="whos-here-label">{label}</div>
      <div className="whos-here-row">
        {checkins.slice(0, MAX_FACES).map(player => (
          <button
            key={player.userId}
            type="button"
            className="whos-here-player"
            onClick={() => onViewProfile?.(player.userId)}
            aria-label={`View ${player.username}'s profile`}
          >
            <Avatar
              avatarUrl={player.avatarUrl}
              initials={player.initials}
              size={34}
            />
            <span className="whos-here-name">
              {player.userId === currentUserId
                ? 'You'
                : (player.username ?? 'Player').split('_')[0]}
            </span>
          </button>
        ))}
        {checkins.length > MAX_FACES && (
          <span className="whos-here-more">+{checkins.length - MAX_FACES}</span>
        )}
      </div>
      {hidden > 0 && (
        <div className="whos-here-hidden">
          +{hidden} more playing
        </div>
      )}
    </div>
  );
}
