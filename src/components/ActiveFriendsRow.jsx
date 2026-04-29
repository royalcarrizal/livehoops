// src/components/ActiveFriendsRow.jsx
//
// The horizontal row that appears at the top of the home feed when one or more
// friends are currently checked in at a basketball court.
//
// If NO friends are checked in, this component renders nothing at all — no
// empty space, no placeholder. It simply disappears.
//
// Each checked-in friend appears as a small card showing:
//   • Their avatar with an orange pulsing live dot
//   • A 📍 map pin icon
//   • The court name (up to 2 lines)
//   • Their username (1 line, truncated)
//
// Tapping a card saves the court ID to localStorage and switches to the Map
// tab, which will then fly to that court automatically.
//
// Data note:
//   A friend is considered "checked in" if their object has a non-null
//   `currentCourt` or `checkedInParkId` field. Right now the useFriends hook
//   returns basic profile info only — check-in status will be added once a
//   Supabase check-in system (e.g. a `checkins` table) is built.
//   In the future this will query Supabase for real-time check-in status.

import Avatar from './Avatar';

// Props:
//   friends      — array of friend objects from the useFriends hook.
//                  Each friend: { userId, username, avatarUrl, initials,
//                                 currentCourt?, currentCourtId?,
//                                 checkedInParkId? }
//   setActiveTab — function that switches the app to a different tab.
//                  We call setActiveTab('map') when a card is tapped.
export default function ActiveFriendsRow({ friends = [], setActiveTab }) {

  // ── Filter to only friends who are currently at a court ──────────────────
  // A friend counts as "checked in" if they have a currentCourt name or a
  // checkedInParkId that is not null / undefined.
  // This list will be empty until real check-in data is added to Supabase.
  const activeFriends = friends.filter(
    f => f.currentCourt || f.checkedInParkId
  );

  // ── If nobody is checked in, render nothing ──────────────────────────────
  // Returning null means no DOM element is created at all — no gap, no border,
  // no empty row. The home feed looks exactly as if this component isn't there.
  if (activeFriends.length === 0) return null;

  // ── Handle tapping a friend card ─────────────────────────────────────────
  // We store the court ID in localStorage before switching tabs because
  // React unmounts this screen when the Map tab opens. localStorage is the
  // simplest way to pass a "fly to this court" instruction across tab changes.
  const handleCardTap = (friend) => {
    // Save the court ID so MapScreen knows where to fly on load
    const courtId = friend.currentCourtId ?? friend.checkedInParkId;
    if (courtId) {
      localStorage.setItem('lh_focus_court', courtId);
    }
    // Navigate to the Map tab
    setActiveTab('map');
  };

  return (
    <div className="active-friends-row">

      {/* ── Section header ─────────────────────────────────────────────────── */}
      {/* Small label above the scrollable row. Only visible when row is shown. */}
      <div className="active-friends-header">
        {/* Orange pulsing dot — uses the existing `pulse` keyframe from index.css */}
        <span className="active-friends-live-dot-header" />
        Friends playing now
      </div>

      {/* ── Horizontally scrollable cards ────────────────────────────────────── */}
      <div className="active-friends-scroll">
        {activeFriends.map((friend, index) => (
          <button
            key={friend.userId ?? friend.id}
            className="active-friend-card"
            // Each card starts invisible and slides in from the right.
            // animationDelay staggers the cards: card 0 starts at 0ms,
            // card 1 at 50ms, card 2 at 100ms, and so on.
            style={{ animationDelay: `${index * 50}ms` }}
            onClick={() => handleCardTap(friend)}
            aria-label={`${friend.username ?? friend.name} is at ${friend.currentCourt}`}
            type="button"
          >
            {/* ── Avatar with live indicator dot ──────────────────────────── */}
            <div className="active-friend-avatar-wrap">
              {/* The friend's profile picture (or initials fallback) */}
              <Avatar
                avatarUrl={friend.avatarUrl}
                initials={friend.initials}
                size={36}
              />
              {/* Small orange pulsing dot in the bottom-right corner of the avatar */}
              <div className="active-friend-live-dot" />
            </div>

            {/* ── Map pin icon ─────────────────────────────────────────────── */}
            {/* Unicode 📍 at 14px — simple, no extra imports needed */}
            <div className="active-friend-pin">📍</div>

            {/* ── Court name ───────────────────────────────────────────────── */}
            {/* Shows up to 2 lines. If the name is too long it fades to "…" */}
            <div className="active-friend-court">
              {friend.currentCourt}
            </div>

            {/* ── Username ─────────────────────────────────────────────────── */}
            {/* Single line. Truncates with ellipsis if too long. */}
            <div className="active-friend-name">
              {friend.username ?? friend.name}
            </div>
          </button>
        ))}
      </div>

    </div>
  );
}
