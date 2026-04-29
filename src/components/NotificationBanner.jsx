// src/components/NotificationBanner.jsx
//
// A subtle banner that appears at the top of the Home screen asking the user
// to enable push notifications. It only renders when permission is 'default'
// (not yet asked) — it disappears once the user grants or denies permission,
// and also when they hit the ✕ to dismiss it.

export default function NotificationBanner({ onEnable, onDismiss }) {
  return (
    // The outer div is the card — styled to match the app's theme
    <div className="notif-banner">

      {/* Bell emoji on the left */}
      <div className="notif-banner-icon">🔔</div>

      {/* Title and description text */}
      <div className="notif-banner-text">
        <span className="notif-banner-title">Stay in the loop</span>
        <span className="notif-banner-body">
          Get alerts when your crew hits the court
        </span>
      </div>

      {/* Action buttons on the right */}
      <div className="notif-banner-actions">
        {/* "Enable" opens the browser's permission popup */}
        <button className="notif-banner-enable" onClick={onEnable}>
          Enable
        </button>
        {/* ✕ dismisses the banner without asking for permission */}
        <button className="notif-banner-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
