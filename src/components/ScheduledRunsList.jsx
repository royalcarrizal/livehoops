// src/components/ScheduledRunsList.jsx
//
// The "Scheduled runs" section on the Home screen's Nearby tab: runs happening
// at courts over the next week, soonest first.
//
// Replaces UpcomingMeetupsRow, the horizontal card row this supersedes. A run
// is something you plan around, so it reads as a list of dated rows rather than
// a strip you swipe past.
//
// Props:
//   meetups      — array from useMeetups.upcomingMeetups
//   userId       — the logged-in user, to mark the runs they host
//   setActiveTab — switch app tabs; tapping a run opens its court on the Map

import { ChevronRight } from 'lucide-react';
import Avatar from './Avatar';
import { formatClockShort, formatRunLength } from '../utils/datetime';

// How far ahead the section looks. Matches the "Next 7 days" label — if one
// changes the other has to, so they are defined together.
const DAYS_AHEAD = 7;
const WINDOW_LABEL = `Next ${DAYS_AHEAD} days`;

// Runs starting within the window, soonest first. upcomingMeetups already
// arrives sorted and already excludes runs that finished long ago, so this only
// trims the far end. Not exported — a component file may only export
// components, so this is covered through the rendered output instead.
function withinWindow(meetups, now = new Date()) {
  const cutoff = now.getTime() + DAYS_AHEAD * 86400000;
  return (meetups ?? []).filter(m => {
    const at = new Date(m.scheduledAt).getTime();
    return Number.isFinite(at) && at <= cutoff;
  });
}

export default function ScheduledRunsList({ meetups = [], userId, setActiveTab }) {
  const runs = withinWindow(meetups);

  if (runs.length === 0) return null;

  // Same cross-tab handoff the rest of the app uses: MapScreen reads
  // lh_focus_court on load and flies to that court.
  const handleTap = (run) => {
    if (run.courtId) localStorage.setItem('lh_focus_court', run.courtId);
    setActiveTab('map');
  };

  return (
    <>
      <div className="section-header section-header--eyebrow">
        <span className="section-eyebrow">Scheduled runs</span>
        <span className="section-count">{WINDOW_LABEL}</span>
      </div>

      <div className="scheduled-run-list">
        {runs.map((run, index) => {
          const date    = new Date(run.scheduledAt);
          const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
          const length  = formatRunLength(run.durationMinutes);

          // The design's two badges, mapped onto data the app actually has.
          // There is no invite concept, so "invited" becomes "going" — a run
          // you have RSVP'd to. Hosting wins when both are true, because the
          // host is auto-RSVP'd to their own run and would otherwise always
          // read as merely "going".
          const isHost = !!userId && run.hostId === userId;

          return (
            <button
              key={run.id}
              type="button"
              className="scheduled-run"
              style={{ animationDelay: `${index * 50}ms` }}
              onClick={() => handleTap(run)}
              aria-label={`Run at ${run.courtName}, ${weekday} ${formatClockShort(run.scheduledAt)}`}
            >
              <div className="scheduled-run-date">
                <span className="scheduled-run-weekday">{weekday}</span>
                <span className="scheduled-run-day">{date.getDate()}</span>
              </div>

              <div className="scheduled-run-body">
                <div className="scheduled-run-title">
                  <span className="scheduled-run-court">{run.courtName}</span>
                  {isHost ? (
                    <span className="run-badge run-badge--host">Yours</span>
                  ) : run.viewerJoined ? (
                    <span className="run-badge run-badge--going">Going</span>
                  ) : null}
                </div>

                <div className="scheduled-run-when">
                  {formatClockShort(run.scheduledAt)}
                  {/* Runs created before the length column existed have none —
                      the separator goes with it rather than dangling. */}
                  {length && ` · ${length}`}
                </div>

                <div className="scheduled-run-who">
                  <Avatar
                    avatarUrl={run.hostAvatarUrl}
                    initials={run.hostInitials}
                    size={22}
                  />
                  <span className="scheduled-run-going">
                    {run.attendeeCount} going
                  </span>
                </div>
              </div>

              <ChevronRight size={18} className="scheduled-run-chevron" />
            </button>
          );
        })}
      </div>
    </>
  );
}
