// src/components/CourtListRow.jsx
//
// One court in the Map screen's bottom panel: a glyph, the court's name, a line
// of plain facts about it, and a green "N live" pill when anyone is on it.
//
// A component rather than markup inline in MapScreen because MapScreen is ~29k
// and cannot be rendered in a test without standing up Mapbox. This row can.
//
// Props:
//   court   — a normalized court object (see normalizeCourt in useCourts.js)
//   onClick — tapping the row flies the map to that court

import { hasRealDistance } from '../hooks/useCourts';
import { BALL_VIEWBOX, BALL_CIRCLE, BALL_SEAMS } from '../utils/courtGlyph';

// The facts line: "0.3 mi · 4 courts · lights".
//
// Built by dropping the parts we can't state and joining what's left, rather
// than stringing conditionals together with separators — that is what produced
// a dangling "Houston · " on the Home cards when GPS was unavailable.
//
// "courts", not "hoops": that number is what AddCourtSheet collects under
// "Number of courts". The design says hoops; the data does not. Home settled
// this the same way, and the two screens must not disagree.
//
// Not exported — a component file may only export components, so this is
// covered through the rendered row instead.
function courtFacts(court) {
  const parts = [];

  if (hasRealDistance(court.distance)) parts.push(court.distance);

  const count = court.courts ?? 0;
  if (count > 0) parts.push(`${count} ${count === 1 ? 'court' : 'courts'}`);

  if (court.lighting) parts.push('lights');

  return parts.join(' · ');
}

export default function CourtListRow({ court, onClick }) {
  const players = court.players ?? 0;
  const isLive  = players > 0;
  const facts   = courtFacts(court);

  return (
    <button
      type="button"
      className="map-court-row"
      onClick={onClick}
      aria-label={`${court.name}${isLive ? `, ${players} playing now` : ''}`}
    >
      <div className="map-court-row-glyph" aria-hidden="true">
        {/* Same drawing as the map pin — the geometry is shared so the ball in
            a row and the ball on a pin cannot drift apart. Inline SVG rather
            than an icon font so it inherits currentColor and stays crisp. */}
        <svg viewBox={BALL_VIEWBOX} width="20" height="20" fill="none"
             stroke="currentColor" strokeWidth="1.6">
          <circle cx={BALL_CIRCLE.cx} cy={BALL_CIRCLE.cy} r={BALL_CIRCLE.r} />
          <path d={BALL_SEAMS} />
        </svg>
      </div>

      <div className="map-court-row-body">
        <div className="map-court-row-name">{court.name}</div>
        {/* Every fact can be absent — an unnamed surface, no lights, GPS
            denied. When they all are, the line is dropped rather than left as
            an empty row that pushes the name off-centre. */}
        {facts && <div className="map-court-row-facts">{facts}</div>}
      </div>

      {isLive && (
        <span className="map-court-row-live">{players} live</span>
      )}
    </button>
  );
}
