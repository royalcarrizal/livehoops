import { MapPin, Layers } from 'lucide-react';
import Avatar from './Avatar';

function AvatarStack({ checkins }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {checkins.slice(0, 3).map((ci, i) => (
        <div key={ci.id} style={{ marginLeft: i === 0 ? 0 : -8, zIndex: 3 - i, position: 'relative' }}>
          <Avatar
            avatarUrl={ci.avatarUrl}
            initials={ci.initials}
            size={26}
            ringColor="var(--bg-card)"
          />
        </div>
      ))}
    </div>
  );
}

export default function ParkCard({ park, isCheckedIn, onCheckIn, style }) {
  const hasPlayers = park.players > 0;

  return (
    <div className="park-card" style={style}>
      {/* Court photo, with the live marker laid over it as a glass pill — the
          canvas's treatment (canvas:97). Only rendered when a photo exists:
          the canvas always has one, but most real courts do not, and an empty
          132px grey block on every card would make the list unreadable. */}
      {park.photoUrl && (
        <div className="park-card-media">
          <img src={park.photoUrl} alt={park.name} className="park-card-photo" />
          {hasPlayers && (
            <div className="park-card-overlay live-badge">
              <div className="live-dot" />
              <span className="live-text">Live</span>
            </div>
          )}
        </div>
      )}

      <div className="park-card-top">
        <div className="park-name-row">
          <span className="park-name">{park.name}</span>
          {/* Without a photo the marker has nowhere to sit, so it stays inline
              beside the name as it always has. */}
          {hasPlayers && !park.photoUrl && (
            <div className="live-badge">
              <div className="live-dot" />
              <span className="live-text">Live</span>
            </div>
          )}
        </div>

        {/* Address and distance on one line, per the canvas — they answer the
            same question ("where is this?") and read better together. */}
        <p className="park-address">
          {park.shortAddress}
          {park.distance && <span className="park-distance"> · {park.distance}</span>}
        </p>

        <div className="park-chips">
          <span className="park-chip">
            <Layers size={12} />
            {park.courts} {park.courts === 1 ? 'court' : 'courts'}
          </span>
          <span className="park-chip">
            <MapPin size={12} />
            {park.surface}
          </span>
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
            {isCheckedIn ? '✓ Checked In' : 'Check In'}
          </button>
        </div>
      </div>

      {/* Who is actually here. The canvas has no equivalent — that is the
          mockup being thinner than the app, not a cue to drop it. */}
      <div className="park-card-bottom">
        <div className="player-info">
          {hasPlayers ? (
            <>
              <div className="player-count-badge">
                <span className="player-count-num">{park.players}</span>
                <span className="player-count-label">players<br />here</span>
              </div>
              {park.checkins.length > 0 && <AvatarStack checkins={park.checkins} />}
            </>
          ) : (
            <span className="empty-text">Empty — Be the first!</span>
          )}
        </div>
      </div>
    </div>
  );
}
