// src/components/ScheduleMeetupSheet.jsx
//
// Slide-up sheet for scheduling a run at a court. Reuses the always-in-DOM
// `.open` transform pattern from AddCourtSheet (overlay + sheet slide up/down),
// with a full state reset when it closes.
//
// Props:
//   isOpen    — controls the slide-up
//   onClose   — close the sheet
//   court     — { id, name } the run is being scheduled at
//   onSchedule(courtId, scheduledAtISO, title, visibility, label, durationMinutes)
//               — async; throws on failure so we can show an error toast
//   onToast   — brief message pill

import { useState, useEffect } from 'react';
import { formatMeetupTime, formatRunLength } from '../utils/datetime';
import Toast from './Toast';
import { useToast } from '../hooks/useToast';

// Format a Date into the value a <input type="datetime-local"> expects,
// in LOCAL time ("YYYY-MM-DDTHH:mm").
function toLocalInputValue(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
         `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Default suggestion: 2 hours from now, rounded down to the nearest half hour.
function defaultWhen() {
  const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0);
  return toLocalInputValue(d);
}

// How long the run goes. Presets rather than a free number field: every real
// pickup run is one of these, and a text input would invite the 5-minute and
// 3-day typos the DB constraint then has to reject. 90 is the default because
// it is the most common session length.
const LENGTH_OPTIONS = [60, 90, 120, 180];
const DEFAULT_LENGTH = 90;

export default function ScheduleMeetupSheet({ isOpen, onClose, court, onSchedule, onToast }) {
  const [when,       setWhen]       = useState(defaultWhen);
  const [title,      setTitle]      = useState('');
  const [visibility, setVisibility] = useState('public');
  const [duration,   setDuration]   = useState(DEFAULT_LENGTH);
  const [submitting, setSubmitting] = useState(false);

  const { toast, showToast } = useToast();

  // Reset the form every time the sheet closes so it opens fresh next time.
  useEffect(() => {
    if (!isOpen) {
      setWhen(defaultWhen());
      setTitle('');
      setVisibility('public');
      setDuration(DEFAULT_LENGTH);
      setSubmitting(false);
    }
  }, [isOpen]);

  // The minimum selectable time is now (can't schedule a run in the past).
  const minWhen = toLocalInputValue(new Date());

  const handleSubmit = async () => {
    if (submitting) return;

    // datetime-local has no timezone; new Date() reads it as local, then we
    // send UTC to the DB.
    const localDate = new Date(when);
    if (Number.isNaN(localDate.getTime())) {
      showToast('Pick a date and time');
      return;
    }
    if (localDate.getTime() <= Date.now()) {
      showToast('Pick a time in the future');
      return;
    }

    setSubmitting(true);
    try {
      const iso = localDate.toISOString();
      await onSchedule(court.id, iso, title.trim(), visibility, formatMeetupTime(iso), duration);
      onToast?.('🏀 Run scheduled!');
      onClose();
    } catch {
      showToast('Could not schedule — try again');
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className={`settings-overlay${isOpen ? ' open' : ''}`}
        style={{ zIndex: 299 }}
        onClick={onClose}
      />

      <div className={`add-court-sheet${isOpen ? ' open' : ''}`}>
        <div className="add-court-header">
          <span className="add-court-title">Schedule a Run</span>
          <button className="add-court-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="add-court-body">
          {/* Which court */}
          <div className="meetup-form-court">
            📍 {court?.name ?? 'This court'}
          </div>

          {/* When */}
          <label className="add-court-field-label">When *</label>
          <input
            className="field"
            type="datetime-local"
            value={when}
            min={minWhen}
            onChange={e => setWhen(e.target.value)}
          />
          {when && !Number.isNaN(new Date(when).getTime()) && (
            <div className="meetup-form-preview">{formatMeetupTime(new Date(when).toISOString())}</div>
          )}

          {/* How long — presets, same row treatment as the visibility buttons */}
          <label className="add-court-field-label">How long?</label>
          <div className="meetup-visibility-row">
            {LENGTH_OPTIONS.map(mins => (
              <button
                key={mins}
                type="button"
                className={`btn btn--grow ${duration === mins ? 'btn--soft' : 'btn--secondary'}`}
                onClick={() => setDuration(mins)}
                aria-pressed={duration === mins}
              >
                {formatRunLength(mins)}
              </button>
            ))}
          </div>

          {/* Optional note */}
          <label className="add-court-field-label">Note <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(optional)</span></label>
          <input
            className="field"
            type="text"
            placeholder="e.g. 5v5 full court, bring a light + dark shirt"
            value={title}
            maxLength={80}
            onChange={e => setTitle(e.target.value)}
          />

          {/* Who can see it */}
          <label className="add-court-field-label">Who can see this run?</label>
          <div className="meetup-visibility-row">
            <button
              type="button"
              className={`btn btn--grow ${visibility === 'public' ? 'btn--soft' : 'btn--secondary'}`}
              onClick={() => setVisibility('public')}
            >
              🌍 Everyone
            </button>
            <button
              type="button"
              className={`btn btn--grow ${visibility === 'friends' ? 'btn--soft' : 'btn--secondary'}`}
              onClick={() => setVisibility('friends')}
            >
              👥 Friends only
            </button>
          </div>
          <div className="meetup-visibility-hint">
            {visibility === 'public'
              ? 'Any LiveHoops player can see and join this run.'
              : 'Only your friends can see and join this run.'}
          </div>
        </div>

        <div className="add-court-nav">
          <button className="btn btn--secondary" onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="btn btn--primary btn--grow"
            disabled={submitting}
            onClick={handleSubmit}
            type="button"
          >
            {submitting ? 'Scheduling…' : 'Schedule Run'}
          </button>
        </div>

        <Toast message={toast} />
      </div>
    </>
  );
}
