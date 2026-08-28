// src/utils/datetime.js
//
// Date/time formatting helpers.
//
// The app already has a PAST-facing relative formatter (toTimeAgo, exported
// from src/hooks/usePosts.js and covered by its own test). Scheduled meetups
// need the opposite: a FUTURE-facing label ("in 45 min", "Today 6:00 PM",
// "Tomorrow 6:00 PM", "Sat, Jul 19 · 6:00 PM"). That lives here.

// Format a clock time like "6:00 PM" for a given Date.
function clockTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// True when two Dates fall on the same calendar day (local time).
function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── formatMeetupTime(iso, now?) ─────────────────────────────────────────────
// Turns an ISO timestamp for a scheduled run into a short human label:
//   • past / happening now   → "Now"
//   • < 60 min away          → "in 1 min" / "in 45 min"
//   • later today            → "Today 6:00 PM"
//   • tomorrow               → "Tomorrow 6:00 PM"
//   • within the next 7 days  → "Sat 6:00 PM"
//   • further out            → "Jul 19 · 6:00 PM"
// `now` is injectable so the logic is unit-testable without mocking the clock.
export function formatMeetupTime(iso, now = new Date()) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffMs = date.getTime() - now.getTime();

  // Started already (within the grace window the query allows) → "Now".
  if (diffMs <= 0) return 'Now';

  const diffMin = Math.round(diffMs / 60000);

  // Under an hour out — a countdown is more useful than a clock time.
  if (diffMin < 60) {
    return `in ${diffMin} min`;
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (sameDay(date, now)) {
    return `Today ${clockTime(date)}`;
  }
  if (sameDay(date, tomorrow)) {
    return `Tomorrow ${clockTime(date)}`;
  }

  // Within a week → weekday name ("Sat 6:00 PM"); otherwise a dated label.
  const diffDays = Math.floor((date - now) / 86400000);
  if (diffDays < 7) {
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    return `${weekday} ${clockTime(date)}`;
  }

  const dateLabel = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  return `${dateLabel} · ${clockTime(date)}`;
}

// ── formatRunLength(minutes) ────────────────────────────────────────────────
// Turns a run's length in minutes into the short label the run cards show:
//   45  → "45m"     90  → "90m"     60  → "1h"
//   120 → "2h"      150 → "2h 30m"  480 → "8h"
//
// The 90 → "90m" case is why this isn't a plain hours-and-minutes split. A
// 90-minute run is universally said as "90 minutes", not "1h 30m", and the
// design asks for it that way — so anything under two hours that isn't a whole
// number of hours stays in minutes. Past two hours "2h 30m" is shorter to read
// than "150m", so it flips.
//
// Returns '' for null/invalid input rather than "NaNm", so a run created before
// the duration column existed simply renders without a length.
export function formatRunLength(minutes) {
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) return '';

  const whole = Math.round(mins);
  const hours = Math.floor(whole / 60);
  const rest  = whole % 60;

  if (rest === 0)   return `${hours}h`;
  if (whole < 120)  return `${whole}m`;
  return `${hours}h ${rest}m`;
}

// ── formatClockShort(iso) ───────────────────────────────────────────────────
// The compact clock label on a run card: "6:30p", "10:00a", "12:00p".
//
// Deliberately shorter than formatMeetupTime's "6:00 PM". A run card already
// carries the weekday and day-of-month in its date block, so the time sits
// beside a length ("6:30p · 2h") where the full form is too wide on a phone.
//
// Returns '' for invalid input, so a malformed timestamp renders as nothing
// rather than "Invalid Datep".
export function formatClockShort(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  let hours = date.getHours();
  const suffix = hours >= 12 ? 'p' : 'a';
  // 0 → 12am, 13 → 1pm.
  hours = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes}${suffix}`;
}

// ── formatElapsed(sinceMs, now?) ────────────────────────────────────────────
// How long something has been running: "Just now", "42m", "1h 12m", "3h".
//
// Used by the Check screen's "Checked in" stat and by the Friends screen's
// "At Cadman Plaza · 40m". It lived privately inside CheckInScreen until the
// second caller turned up; two copies of a duration format is how "1h 12m" and
// "1h12m" end up on the same screen.
//
// Distinct from formatRunLength above, which formats a PLANNED length where 90
// minutes is said as "90m". This formats ELAPSED time, where the clock reading
// "1h 30m" is what a person expects.
//
// Returns '' for missing/invalid input so a friend who has never checked in
// renders nothing rather than "NaNm".
export function formatElapsed(sinceMs, now = Date.now()) {
  // Reject null/undefined BEFORE Number(), which turns null into 0 — a
  // perfectly finite timestamp meaning 1 Jan 1970. Without this, a friend who
  // has never checked in reads "472222h 13m" rather than nothing.
  if (sinceMs == null || sinceMs === '') return '';

  const start = typeof sinceMs === 'string' ? new Date(sinceMs).getTime() : Number(sinceMs);
  if (!Number.isFinite(start)) return '';

  const minutes = Math.floor((now - start) / 60000);
  if (minutes < 0)  return '';
  if (minutes < 1)  return 'Just now';
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const mins  = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
