import { useState } from 'react';
import { X, Check } from 'lucide-react';

// Slide-up sheet that lets the user search and select a court to tag in a post.
//
// Props:
//   courts   — full array of court objects from useCourts
//   selected — the currently selected court object (or null)
//   onSelect(court) — called when the user taps a court row
//   onClose  — called when the sheet is dismissed
export default function CourtPickerSheet({ courts, selected, onSelect, onClose }) {
  const [query, setQuery] = useState('');

  const filtered = courts.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      {/* Dark backdrop — tapping it closes the sheet */}
      <div className="court-picker-overlay" onClick={onClose} />

      <div className="court-picker-sheet">
        {/* Header */}
        <div className="court-picker-header">
          <div className="map-sheet-drag-handle" style={{ margin: '0 auto 12px' }} />
          <span className="court-picker-title">Tag a Court</span>
          <button className="court-picker-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Search input */}
        <input
          className="court-picker-search"
          placeholder="Search courts…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />

        {/* Court list */}
        <div className="court-picker-list">
          {filtered.length === 0 ? (
            <div className="court-picker-empty">No courts match "{query}"</div>
          ) : (
            filtered.map(court => {
              const isSelected = selected?.id === court.id;
              return (
                <button
                  key={court.id}
                  className={`court-picker-item${isSelected ? ' selected' : ''}`}
                  onClick={() => { onSelect(court); onClose(); }}
                >
                  <div className="court-picker-item-info">
                    <div className="court-picker-item-name">{court.name}</div>
                    <div className="court-picker-item-meta">
                      {court.distance !== '—' ? `${court.distance} · ` : ''}
                      {court.surface}
                      {court.players > 0 ? ` · 🏀 ${court.players} live` : ''}
                    </div>
                  </div>
                  {isSelected && (
                    <Check size={16} strokeWidth={2.5} color="var(--orange)" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
