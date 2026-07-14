// src/components/UpcomingMeetupsRow.jsx
//
// Horizontal "Upcoming Runs" row at the top of the Home feed, showing meetups
// scheduled at courts. Mirrors ActiveFriendsRow: renders nothing when the list
// is empty, and tapping a card saves the court id to localStorage and switches
// to the Map tab (which flies to that court on load).
//
// Props:
//   meetups      — array from useMeetups.upcomingMeetups
//   setActiveTab — switch app tabs (we call setActiveTab('map'))

import Avatar from './Avatar';
import { formatMeetupTime } from '../utils/datetime';

export default function UpcomingMeetupsRow({ meetups = [], setActiveTab }) {
  if (meetups.length === 0) return null;

  // Same cross-tab handoff ActiveFriendsRow uses: MapScreen watches
  // lh_focus_court on load and flies to that court + opens its sheet.
  const handleTap = (meetup) => {
    if (meetup.courtId) {
      localStorage.setItem('lh_focus_court', meetup.courtId);
    }
    setActiveTab('map');
  };

  return (
    <div className="active-friends-row">
      <div className="active-friends-header">
        <span className="meetup-cal-icon">📅</span>
        Upcoming runs
      </div>

      <div className="active-friends-scroll">
        {meetups.map((meetup, index) => (
          <button
            key={meetup.id}
            className="meetup-card"
            style={{ animationDelay: `${index * 50}ms` }}
            onClick={() => handleTap(meetup)}
            aria-label={`Run at ${meetup.courtName}, ${formatMeetupTime(meetup.scheduledAt)}`}
            type="button"
          >
            {/* Host avatar with a small calendar badge */}
            <div className="meetup-card-avatar-wrap">
              <Avatar
                avatarUrl={meetup.hostAvatarUrl}
                initials={meetup.hostInitials}
                size={36}
              />
              <div className="meetup-card-badge">📅</div>
            </div>

            {/* When — the headline of the card */}
            <div className="meetup-card-time">{formatMeetupTime(meetup.scheduledAt)}</div>

            {/* Court name */}
            <div className="meetup-card-court">{meetup.courtName}</div>

            {/* Going count */}
            <div className="meetup-card-going">
              {meetup.attendeeCount} going
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
