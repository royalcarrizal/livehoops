// src/components/CourtMeetups.jsx
//
// The "Upcoming Runs" section shown inside a court's bottom sheet (used by both
// CourtDetailSheet and the MapScreen sheet). Lists the runs scheduled at this
// court with RSVP controls, and a "Schedule a Run" button that opens
// ScheduleMeetupSheet bound to this court.
//
// Attendee avatars reuse the `.whos-here` classes from the "Playing now" row;
// anonymous joiners arrive pre-masked as "Baller" from get_meetup_attendees.
//
// Props:
//   court         — { id, name }
//   meetups       — array of this court's runs (from meetupsByCourt[court.id])
//   user          — logged-in user ({ id })
//   onSchedule    — createMeetup(courtId, iso, title, visibility, label)
//   onJoin        — joinMeetup(meetupId, anonymous)
//   onLeave       — leaveMeetup(meetupId)
//   onCancel      — cancelMeetup(meetupId)   (host only)
//   fetchAttendees— (meetupId) => Promise<attendee[]>
//   onViewProfile — open a tapped attendee's profile
//   onToast       — brief message pill

import { useState } from 'react';
import Avatar from './Avatar';
import ScheduleMeetupSheet from './ScheduleMeetupSheet';
import { formatMeetupTime } from '../utils/datetime';

const VISIBILITY_ICON = { public: '🌍', friends: '👥' };

function MeetupRow({ meetup, user, onJoin, onLeave, onCancel, fetchAttendees, onViewProfile }) {
  const [busy, setBusy]         = useState(false);
  const [anon, setAnon]         = useState(meetup.viewerAnonymous);
  const [expanded, setExpanded] = useState(false);
  const [attendees, setAttendees] = useState(null); // null until first loaded

  const isHost = meetup.hostId === user?.id;

  const toggleAttendees = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && attendees === null) {
      setAttendees(await fetchAttendees(meetup.id));
    }
  };

  const handleJoin = async () => {
    if (busy) return;
    setBusy(true);
    try { await onJoin(meetup.id, anon); }
    finally { setBusy(false); }
  };

  const handleLeave = async () => {
    if (busy) return;
    setBusy(true);
    try { await onLeave(meetup.id); }
    finally { setBusy(false); }
  };

  const handleCancel = async () => {
    if (busy) return;
    setBusy(true);
    try { await onCancel(meetup.id); }
    finally { setBusy(false); }
  };

  return (
    <div className="meetup-row">
      {/* Headline: when + visibility */}
      <div className="meetup-row-head">
        <span className="meetup-row-time">{formatMeetupTime(meetup.scheduledAt)}</span>
        <span className="meetup-row-vis">{VISIBILITY_ICON[meetup.visibility] ?? '🌍'}</span>
      </div>

      {/* Host + optional note */}
      <div className="meetup-row-sub">
        Hosted by {isHost ? 'you' : meetup.hostName}
        {meetup.title ? ` · ${meetup.title}` : ''}
      </div>

      {/* Going count — tap to reveal attendee avatars */}
      <button className="meetup-row-going" onClick={toggleAttendees}>
        🏀 {meetup.attendeeCount} going {expanded ? '▲' : '▼'}
      </button>

      {expanded && attendees && attendees.length > 0 && (
        <div className="whos-here-row" style={{ marginTop: 8 }}>
          {attendees.slice(0, 8).map((a, i) => (
            <button
              key={a.userId ?? `baller-${i}`}
              className="whos-here-player"
              onClick={() => a.userId && onViewProfile?.(a.userId)}
              disabled={!a.userId}
              aria-label={a.userId ? `View ${a.username}'s profile` : 'Anonymous baller'}
            >
              <Avatar avatarUrl={a.avatarUrl} initials={a.initials} size={34} />
              <span className="whos-here-name">
                {a.userId === user?.id ? 'You' : a.username.split('_')[0]}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* RSVP controls */}
      <div className="meetup-row-actions">
        {meetup.viewerJoined ? (
          <>
            <span className="meetup-row-joined">
              You're in{meetup.viewerAnonymous ? ' (as Baller)' : ''}
            </span>
            <button className="meetup-btn-leave" onClick={handleLeave} disabled={busy}>
              {busy ? '…' : 'Leave'}
            </button>
          </>
        ) : (
          <>
            <label className="meetup-anon-check">
              <input
                type="checkbox"
                checked={anon}
                onChange={e => setAnon(e.target.checked)}
              />
              Go as Baller
            </label>
            <button className="meetup-btn-join" onClick={handleJoin} disabled={busy}>
              {busy ? '…' : "I'm in"}
            </button>
          </>
        )}

        {isHost && (
          <button className="meetup-btn-cancel" onClick={handleCancel} disabled={busy}>
            Cancel run
          </button>
        )}
      </div>
    </div>
  );
}

export default function CourtMeetups({
  court,
  meetups = [],
  user,
  onSchedule,
  onJoin,
  onLeave,
  onCancel,
  fetchAttendees,
  onViewProfile,
  onToast,
}) {
  const [showSchedule, setShowSchedule] = useState(false);

  return (
    <div className="court-meetups">
      <div className="whos-here-label">Upcoming runs</div>

      {meetups.length === 0 ? (
        <div className="meetup-empty">No runs scheduled yet — start one 👇</div>
      ) : (
        meetups.map(m => (
          <MeetupRow
            key={m.id}
            meetup={m}
            user={user}
            onJoin={onJoin}
            onLeave={onLeave}
            onCancel={onCancel}
            fetchAttendees={fetchAttendees}
            onViewProfile={onViewProfile}
          />
        ))
      )}

      <button className="meetup-schedule-btn" onClick={() => setShowSchedule(true)}>
        📅 Schedule a Run
      </button>

      <ScheduleMeetupSheet
        isOpen={showSchedule}
        onClose={() => setShowSchedule(false)}
        court={court}
        onSchedule={onSchedule}
        onToast={onToast}
      />
    </div>
  );
}
