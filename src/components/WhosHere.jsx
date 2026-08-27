// src/components/WhosHere.jsx
//
// The row of players currently checked in at a court.
//
// This markup existed twice — copied between MapScreen's court sheet and
// CourtDetailSheet — before the Check screen needed it a third time. One
// component now serves all three.
//
// ── The +N circle ───────────────────────────────────────────────────────────
// A player can be missing from this row for two unrelated reasons:
//
//   1. there are more of them than the row shows faces for, or
//   2. they hid themselves — `checkins` comes from the get_court_active_players
//      RPC, which omits anyone with their location off or their profile private,
//      while `players` is the raw count from the courts table
//
// Those used to be rendered separately: a "+N" pill for the first and a
// "+N more playing" line for the second. They are now one circle, counting
// everyone not pictured whatever the reason.
//
// That is the design, and it is also better arithmetic: faces + N always equals
// the court's player count, so the row reconciles with the "Players here" stat
// sitting above it. The privacy nuance survives in the aria-label rather than
// being dropped — nobody hidden is named, but nobody is silently uncounted
// either.
//
// Props:
//   checkins      — [{ userId, username, avatarUrl, initials }]
//   players       — the court's total player count (may exceed checkins.length)
//   currentUserId — so the viewer's own face can be labelled "You"
//   label         — section heading; defaults to the court-sheet wording
//   onViewProfile — tapping a player opens their profile

import Avatar from './Avatar';

// How many faces before the rest collapse into the +N circle. Five faces plus
// the circle is six 48px circles, which is what fits a 375px screen — see the
// sizing note on .whos-here-row in index.css.
const MAX_FACES = 5;

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

  const faces = checkins.slice(0, MAX_FACES);

  // Everyone not pictured: the overflow and the hidden players, together.
  // Math.max guards the case where the two numbers disagree for a moment —
  // they come from different sources and refresh independently, and "+-2" must
  // never be a thing.
  const notShown = Math.max(0, players - faces.length);

  return (
    <div className="whos-here">
      <div className="whos-here-label">{label}</div>
      <div className="whos-here-row">
        {faces.map(player => (
          <button
            key={player.userId}
            type="button"
            className="whos-here-player"
            onClick={() => onViewProfile?.(player.userId)}
            aria-label={
              player.userId === currentUserId
                ? 'View your profile'
                : `View ${player.username ?? 'this player'}'s profile`
            }
          >
            <Avatar
              avatarUrl={player.avatarUrl}
              initials={player.initials}
              size={48}
            />
          </button>
        ))}

        {notShown > 0 && (
          <span
            className="whos-here-more"
            aria-label={`${notShown} more playing`}
          >
            +{notShown}
          </span>
        )}
      </div>
    </div>
  );
}
