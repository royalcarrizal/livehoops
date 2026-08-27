// src/components/ParkCard.jsx
//
// The app's one court card. Used by the Home screen's Nearby tab and by the
// Check screen, so both speak the same visual language.
//
// Layout follows the redesign: a photo block carrying the live markers, then
// the court's name, where it is, and a row of factual chips ending in the
// check-in action.

import { Layers, Lightbulb, Image as ImageIcon } from 'lucide-react';

export default function ParkCard({ park, isCheckedIn, onCheckIn, style }) {
  const hasPlayers = park.players > 0;

  // normalizeCourt sets distance to the em dash when GPS is unavailable, and
  // that string is truthy — so a plain `park.distance &&` check renders a
  // dangling "Simsbrook Dr, Houston · —" on every card the moment someone
  // declines the location prompt.
  const hasDistance = !!park.distance && park.distance !== '—';

  return (
    <div className="park-card" style={style}>
      {/* Photo block. Always rendered, unlike the previous version which hid it
          when a court had no photo — the design puts the live markers here, so
          they need somewhere to sit whether or not a photo exists. Courts
          without one get a deliberate empty block rather than a broken-looking
          gap. */}
      <div className="park-card-media">
        {park.photoUrl ? (
          <img src={park.photoUrl} alt={park.name} className="park-card-photo" />
        ) : (
          <div className="park-card-media-empty" aria-hidden="true">
            <ImageIcon size={24} strokeWidth={1.5} />
          </div>
        )}

        {hasPlayers && (
          <>
            <div className="park-card-overlay live-badge">
              <div className="live-dot" />
              <span className="live-text">Live</span>
            </div>

            {/* How many are on it, opposite the Live marker. Replaces the
                separate player-count row the card used to carry below. */}
            <div className="park-card-running">
              {park.players} running
            </div>
          </>
        )}
      </div>

      <div className="park-card-top">
        <div className="park-name-row">
          <span className="park-name">{park.name}</span>
        </div>

        {/* Address and distance on one line — they answer the same question. */}
        <p className="park-address">
          {park.shortAddress}
          {hasDistance && <span className="park-distance"> · {park.distance}</span>}
        </p>

        <div className="park-chips">
          {/* "courts", not "hoops". The design says hoops, but this number is
              what "Number of courts" collects in AddCourtSheet — 1 to 4+ courts,
              not a hoop count. Relabelling it would make the card state
              something the data does not say. */}
          <span className="park-chip">
            <Layers size={12} />
            {park.courts} {park.courts === 1 ? 'court' : 'courts'}
          </span>

          {/* Only shown when the court actually has lights. normalizeCourt has
              always computed this; no screen had ever surfaced it. */}
          {park.lighting && (
            <span className="park-chip">
              <Lightbulb size={12} />
              Lights
            </span>
          )}

          {park.reviewCount > 0 && (
            <span className="park-chip park-chip--rating">
              ★ {Number(park.avgRating).toFixed(1)}
              <span className="park-chip-muted">({park.reviewCount})</span>
            </span>
          )}

          <button
            className={`btn btn--sm btn--pill park-chip-action ${isCheckedIn ? 'btn--live' : 'btn--soft'}`}
            onClick={(e) => {
              e.stopPropagation();
              onCheckIn(park.id);
            }}
          >
            {isCheckedIn ? '✓ Checked In' : 'Check in'}
          </button>
        </div>
      </div>
    </div>
  );
}
