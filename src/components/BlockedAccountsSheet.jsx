// src/components/BlockedAccountsSheet.jsx
//
// Settings → Privacy → Blocked Accounts. Lists everyone the logged-in user
// has blocked, with an Unblock button per row. Reuses the full-screen overlay
// classes AdminSheet already established (single-post-*) and the search
// result row layout (Avatar + name + button) from the Add Friend modal.
//
// Props:
//   blockedUsers — array from useBlockedUsers: { userId, username, avatarUrl, initials }
//   onUnblock    — async (userId) => void
//   onClose      — dismiss the sheet

import { useState } from 'react';
import { X } from 'lucide-react';
import Avatar from './Avatar';

export default function BlockedAccountsSheet({ blockedUsers = [], onUnblock, onClose }) {
  // Tracks which userId has an unblock in flight, so only that row disables
  const [busyId, setBusyId] = useState(null);

  const handleUnblock = async (userId) => {
    if (busyId) return;
    setBusyId(userId);
    try {
      await onUnblock?.(userId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="single-post-overlay">
      <div className="single-post-header">
        <span className="single-post-title">Blocked Accounts</span>
        <button className="single-post-close" onClick={onClose} aria-label="Close">
          <X size={20} strokeWidth={2} />
        </button>
      </div>

      <div className="single-post-body" style={{ padding: '0 20px 40px' }}>
        {blockedUsers.length === 0 ? (
          <div className="feed-empty">
            <div style={{ fontSize: 48 }}>🚫</div>
            <div className="feed-empty-title">No blocked accounts</div>
            <div className="feed-empty-sub">Anyone you block will show up here</div>
          </div>
        ) : (
          blockedUsers.map(u => (
            <div key={u.userId} className="search-result-row">
              <Avatar avatarUrl={u.avatarUrl} initials={u.initials} size="medium" />
              <div className="search-result-info">
                <div className="search-result-username">{u.username}</div>
              </div>
              <button
                className="search-add-btn"
                onClick={() => handleUnblock(u.userId)}
                disabled={busyId === u.userId}
                style={busyId === u.userId ? { opacity: 0.6, cursor: 'default' } : undefined}
              >
                {busyId === u.userId ? '…' : 'Unblock'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
