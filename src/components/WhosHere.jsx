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
//   namesSummary  — render "Kai, Dre and 6 others running" beside the faces
//                   instead of the +N circle. The court sheet uses it; the
//                   Check screen keeps the circle.

import Avatar from './Avatar';

// How many faces before the rest collapse into the +N circle. Five faces plus
// the circle is six 48px circles, which is what fits a 375px screen — see the
// sizing note on .whos-here-row in index.css.
const MAX_FACES = 5;

// How many players get named in the summary line before the rest become
// "and N others". Two, because the line sits beside five faces on a narrow
// sheet and a third name pushes it onto a second row.
const MAX_NAMES = 2;

// The summary variant shows fewer, smaller faces than the Check screen does.
// Five 48px faces leave about 80px for the sentence beside them on a 375px
// sheet, which truncated "kai, dre and 6 others running" to "kai, dre …" —
// the line saying nothing at all. Four 34px faces leave roughly 190px, which
// fits it.
const SUMMARY_FACES = 4;
const SUMMARY_FACE_SIZE = 34;

// "Kai, Dre and 6 others running".
//
// Only RPC-visible players are ever NAMED — `checkins` has already had anyone
// who hid their location removed. Everyone else, whether hidden or simply past
// the name limit, is counted in "and N others". Nobody hidden is named; nobody
// is uncounted.
//
// Not exported — a component file may only export components, so this is
// covered through the rendered row instead.
function runningSummary(checkins, players) {
  const visible = checkins ?? [];
  if (visible.length === 0) return '';

  const firstName = (p) => (p.username ?? 'Player').split('_')[0];
  const named  = visible.slice(0, MAX_NAMES).map(firstName);
  // Guard the subtraction: players and checkins.length come from different
  // sources and can briefly disagree, and "and -1 others" must never happen.
  const others = Math.max(0, (players ?? visible.length) - named.length);

  if (others === 0) {
    const list = named.length === 1
      ? named[0]
      : `${named[0]} and ${named[1]}`;
    return `${list} running`;
  }

  const list = named.join(', ');
  return `${list} and ${others} ${others === 1 ? 'other' : 'others'} running`;
}

export default function WhosHere({
  checkins = [],
  players = 0,
  currentUserId,
  label = 'Playing now',
  onViewProfile,
  namesSummary = false,
}) {
  // Nobody visible — render nothing rather than an empty heading. The caller
  // does not have to guard this itself.
  if (checkins.length === 0) return null;

  const faceLimit = namesSummary ? SUMMARY_FACES : MAX_FACES;
  const faceSize  = namesSummary ? SUMMARY_FACE_SIZE : 48;
  const faces     = checkins.slice(0, faceLimit);

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
              size={faceSize}
            />
          </button>
        ))}

        {/* Two ways of saying who else is here. The sheet has room for names
            beside the faces; the Check screen does not, and keeps the circle. */}
        {namesSummary ? (
          <span className="whos-here-summary">
            {runningSummary(checkins, players)}
          </span>
        ) : notShown > 0 && (
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
