export default function StatusBar() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div className="status-bar">
      <span className="time">{time}</span>
      <div className="status-icons">
        {/* Signal */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor" style={{ color: 'white' }}>
          <rect x="0" y="6" width="3" height="6" rx="1" opacity="1" />
          <rect x="4.5" y="4" width="3" height="8" rx="1" opacity="1" />
          <rect x="9" y="2" width="3" height="10" rx="1" opacity="1" />
          <rect x="13.5" y="0" width="3" height="12" rx="1" opacity="1" />
        </svg>
        {/* WiFi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" style={{ color: 'white' }}>
          <path d="M8 10.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" fill="currentColor" />
          <path d="M5.2 7.6A3.9 3.9 0 0 1 8 6.5a3.9 3.9 0 0 1 2.8 1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M2.4 5A7.3 7.3 0 0 1 8 2.8 7.3 7.3 0 0 1 13.6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </svg>
        {/* Battery */}
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none" style={{ color: 'white' }}>
          <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="currentColor" strokeOpacity="0.35" />
          <rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" />
          <path d="M23 4v4a2 2 0 0 0 0-4z" fill="currentColor" fillOpacity="0.4" />
        </svg>
      </div>
    </div>
  );
}
