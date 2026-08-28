// src/components/FriendCard.jsx
//
// One row in "Your crew": a face, who they are, what they are doing, and a way
// to message them.
//
// The design trades the old card's stat line (check-ins / courts / hours) for
// the thing that actually changes — where they are right now, and how long they
// have been there. The stats are still on their profile, one tap away; a row
// you scan to decide who to text does not need lifetime totals.

import { MessageCircle } from 'lucide-react';
import Avatar from './Avatar';
import { formatElapsed } from '../utils/datetime';
import { toTimeAgo } from '../hooks/usePosts';

// What this friend is up to, as one line.
//
//   out now        → "At Cadman Plaza · 40m"   (green)
//   played before  → "Last run 2d ago"          (muted)
//   never played   → "No runs yet"              (muted)
//
// The last case is the one worth being careful about: lastCheckinAt is null for
// anyone who has never checked in anywhere, and feeding null to a date
// formatter is how a row ends up reading "Last run Invalid Date ago".
//
// Not exported — a component file may only export components, so this is
// covered through the rendered row instead.
function friendStatus(friend) {
  if (friend.isActive) {
    const at  = friend.currentCourt ? `At ${friend.currentCourt}` : 'On a court';
    const dur = formatElapsed(friend.activeSince);
    return { text: dur ? `${at} · ${dur}` : at, isLive: true };
  }

  if (friend.lastCheckinAt) {
    return { text: `Last run ${toTimeAgo(friend.lastCheckinAt)}`, isLive: false };
  }

  return { text: 'No runs yet', isLive: false };
}

export default function FriendCard({ friend, onViewProfile, onMessage }) {
  const status = friendStatus(friend);

  return (
    <div className="friend-row">
      {/* Tapping the row opens the profile. The message button sits outside it
          so the two tap targets never nest. */}
      <button
        className="friend-row-main"
        onClick={() => onViewProfile?.(friend.userId)}
        aria-label={`View ${friend.name}'s profile`}
      >
        {/* isCheckedIn draws the green live ring — the same one used on the
            court sheets, so "ringed" means the same thing everywhere. */}
        <Avatar
          avatarUrl={friend.avatarUrl}
          initials={friend.initials}
          size={48}
          isCheckedIn={friend.isActive}
        />

        <div className="friend-row-body">
          <div className="friend-row-name">
            {friend.name}
            {friend.jerseyNumber != null && (
              <span className="friend-row-jersey">#{friend.jerseyNumber}</span>
            )}
          </div>
          <div className={`friend-row-status${status.isLive ? ' is-live' : ''}`}>
            {status.text}
          </div>
        </div>
      </button>

      <button
        className="friend-row-message"
        onClick={() => onMessage?.(friend)}
        aria-label={`Message ${friend.name}`}
      >
        <MessageCircle size={18} strokeWidth={2} />
      </button>
    </div>
  );
}
