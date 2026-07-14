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
