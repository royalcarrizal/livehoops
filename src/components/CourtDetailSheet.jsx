// Reusable court detail bottom sheet — used when a user taps a tagged court
// in the feed. Shows the same info as the MapScreen detail sheet and lets
// the user check in or get directions without leaving the feed.
//
// Props:
//   court        — court object from useCourts (has name, shortAddress, players, etc.)
//   onClose      — called when the backdrop or close button is tapped
//   onCheckIn    — (courtId) => void — triggers a check-in
//   activeCheckIn — current check-in object or null
//   checkOut     — (checkinId, courtId, userId) => void
//   user         — logged-in Supabase user object
export default function CourtDetailSheet({ court, onClose, onCheckIn, activeCheckIn, checkOut, user, isCheckingIn = false }) {
  if (!court) return null;

  const isCheckedInHere      = activeCheckIn?.courtId === court.id;
  const isCheckedInElsewhere = !!activeCheckIn && !isCheckedInHere;

  return (
    <>
      {/* Backdrop */}
      <div className="map-sheet-overlay" onClick={onClose} />

      {/* Sheet — reuses MapScreen sheet styles so the design is consistent */}
      <div className="map-bottom-sheet">
        <div className="map-sheet-top-row">
          <div className="map-sheet-drag-handle" />
          <button className="map-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="map-sheet-name">{court.name}</div>
        <div className="map-sheet-address">{court.shortAddress}</div>

        <div className="map-sheet-meta">
          {court.players > 0 ? (
            <span className="map-sheet-live-badge">🟢 {court.players} live</span>
          ) : (
            <span className="map-sheet-empty-badge">Empty</span>
          )}
          <span className="map-sheet-meta-item">
            {court.courts} {court.courts === 1 ? 'court' : 'courts'}
          </span>
          <span className="map-sheet-meta-item">{court.surface}</span>
          <span className="map-sheet-meta-item">
            {court.lighting ? '💡 Lit' : 'No lights'}
          </span>
          {court.distance && court.distance !== '—' && (
            <span className="map-sheet-meta-item">📍 {court.distance}</span>
          )}
        </div>

        <div className="map-sheet-buttons">
          {isCheckedInHere ? (
            <button
              className="auth-submit-btn"
              style={{ flex: 1, background: '#22c55e' }}
              onClick={async () => {
                await checkOut(activeCheckIn.checkinId, court.id, user?.id);
                onClose();
              }}
            >
              Checked In ✓ (Check Out)
            </button>
          ) : (
            <button
              className="auth-submit-btn"
              style={{ flex: 1 }}
              onClick={() => { onCheckIn(court.id); onClose(); }}
              disabled={isCheckingIn}
            >
              {isCheckingIn ? 'Checking in…' : (isCheckedInElsewhere ? 'Switch Courts' : 'Check In')}
            </button>
          )}

          <a
            className="map-directions-btn"
            href={`https://maps.google.com/?q=${court.lat},${court.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Get Directions
          </a>
        </div>
      </div>
    </>
  );
}
