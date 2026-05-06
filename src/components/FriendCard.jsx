import Avatar from './Avatar';

export default function FriendCard({ friend, onViewProfile, onMessage }) {
  return (
    <div className="friend-card">
      {/* Tapping anywhere on the card main area opens the friend's profile */}
      <button
        className="friend-card-main"
        onClick={() => onViewProfile?.(friend.userId)}
        style={{ width: '100%', background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
      >
        <Avatar
          avatarUrl={friend.avatarUrl}
          initials={friend.initials}
          size="medium"
          showOnlineDot
          isOnline={friend.isActive}
          isCheckedIn={friend.isActive}
        />

        {/* Info */}
        <div className="friend-info">
          <div className="friend-name">{friend.name}</div>
          {friend.isActive ? (
            <div className="friend-status active">🏀 At {friend.currentCourt}</div>
          ) : (
            <div className="friend-status offline">Offline</div>
          )}

          {/* Compact stat row — shows real values from the profiles table */}
          <div className="friend-stats-inline">
            <span>{friend.checkinCount ?? 0} check-ins</span>
            <span className="friend-stats-dot">·</span>
            <span>{friend.courtsVisited ?? 0} courts</span>
            <span className="friend-stats-dot">·</span>
            <span>{friend.hoursOnCourt ?? 0}h played</span>
          </div>
        </div>
      </button>

      {/* Action buttons — rendered outside the tappable area so they don't nest */}
      <div className="friend-card-actions">
        <button
          className="btn-message"
          onClick={() => onMessage?.(friend)}
        >
          Message
        </button>
        <button
          className="btn-view"
          onClick={() => onViewProfile?.(friend.userId)}
        >
          Profile
        </button>
      </div>
    </div>
  );
}
