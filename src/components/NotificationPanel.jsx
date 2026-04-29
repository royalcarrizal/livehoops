// src/components/NotificationPanel.jsx
//
// A slide-down panel that appears below the header when the bell icon is
// tapped. It lists all recent notifications stored in localStorage, shows
// which ones are unread (highlighted), and lets the user clear them.

import { X } from 'lucide-react';
import { clearNotifications } from '../utils/notificationStore';

export default function NotificationPanel({ notifications, onClose }) {
  const handleClearAll = () => {
    clearNotifications(); // wipes localStorage + dispatches update event
    onClose();
  };

  return (
    // Clicking the dark overlay behind the panel closes it
    <div className="notif-panel-overlay" onClick={onClose}>

      {/* The panel itself — stopPropagation prevents the overlay click
          from firing when the user clicks inside the panel */}
      <div className="notif-panel" onClick={e => e.stopPropagation()}>

        {/* Header row */}
        <div className="notif-panel-header">
          <span className="notif-panel-title">Notifications</span>
          {notifications.length > 0 && (
            <button className="notif-clear-text-btn" onClick={handleClearAll}>
              Clear all
            </button>
          )}
          <button className="notif-panel-close" onClick={onClose} aria-label="Close">
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Empty state */}
        {notifications.length === 0 ? (
          <div className="notif-panel-empty">
            <span>🔕</span>
            <p>No notifications yet</p>
            <p className="notif-panel-empty-sub">
              Check in to a court to get started
            </p>
          </div>
        ) : (
          // Scrollable list of notification items
          <div className="notif-list">
            {notifications.map(n => (
              <div
                key={n.id}
                // 'unread' class applies the orange-tinted background
                className={`notif-item${n.read ? '' : ' unread'}`}
              >
                {/* Emoji icon in a circle */}
                <div className="notif-item-icon">{n.icon}</div>

                {/* Text content */}
                <div className="notif-item-body">
                  <div className="notif-item-title">{n.title}</div>
                  {n.body && (
                    <div className="notif-item-desc">{n.body}</div>
                  )}
                  <div className="notif-item-time">
                    {formatRelativeTime(n.timestamp)}
                  </div>
                </div>

                {/* Orange dot for unread items */}
                {!n.read && <div className="notif-unread-dot" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────
// Converts a Unix timestamp (ms) into a human-readable "time ago" string.
function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000)        return 'Just now';
  if (diff < 3_600_000)     return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)    return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
