import { MapPin, Layers, Navigation } from 'lucide-react';
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
      <div className="park-card-top">
        <div className="park-name-row">
          <span className="park-name">{park.name}</span>
          {hasPlayers && (
            <div className="live-badge">
              <div className="live-dot" />
              <span className="live-text">Live</span>
            </div>
          )}
        </div>

        <p className="park-address">{park.shortAddress}</p>

        <div className="park-meta">
          <div className="meta-item">
            <Layers size={13} />
            <span>{park.courts} {park.courts === 1 ? 'court' : 'courts'}</span>
          </div>
          <div className="meta-item">
            <Navigation size={13} />
            <span>{park.distance}</span>
          </div>
          <div className="meta-item">
            <MapPin size={13} />
            <span>{park.surface}</span>
          </div>
        </div>
      </div>

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

        <button
          className={`btn-checkin ${isCheckedIn ? 'checked-in' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onCheckIn(park.id);
          }}
        >
          {isCheckedIn ? '✓ Checked In' : 'Check In'}
        </button>
      </div>
    </div>
  );
}
