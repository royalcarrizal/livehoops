import { useState } from 'react';
import { X, Check } from 'lucide-react';
import { sortByDistance as sortCourtsByDistance } from '../hooks/useCourts';

// Slide-up sheet that lets the user search and select a court.
//
// Used twice, for two different jobs: tagging a court in a post, and choosing
// a home court on Edit Profile. The defaults below are the post-composer's
// wording, so that call site did not have to change.
//
// Props:
//   courts   — full array of court objects from useCourts
//   selected — the currently selected court object (or null)
//   onSelect(court) — called when the user taps a court row
//   onClose  — called when the sheet is dismissed
//   title    — sheet heading
//   subtitle — optional line under the heading
//   sortByDistance — nearest first. Off by default: when tagging a post the
//                    user is usually looking for a court by name, and
//                    reordering the list under them is unhelpful. When
//                    choosing a home court, nearest-first is almost always
//                    the right order.
export default function CourtPickerSheet({
  courts,
  selected,
  onSelect,
  onClose,
  title = 'Tag a Court',
  subtitle,
  sortByDistance = false,
}) {
  const [query, setQuery] = useState('');

  const matches = courts.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase())
  );

  // See sortCourtsByDistance for why null distances sort last, not first.
  const filtered = sortByDistance ? sortCourtsByDistance(matches) : matches;

  return (
    <>
      {/* Dark backdrop — tapping it closes the sheet */}
      <div className="court-picker-overlay" onClick={onClose} />

      <div className="court-picker-sheet">
        {/* The drag handle gets its own centred row above the title, matching
            every other sheet. It used to sit inside .court-picker-header —
            a flex row — where `margin: 0 auto` made the auto margins eat the
            row's free space and shove the title sideways instead of centring
            the handle. */}
        <div className="sheet-handle" />

        {/* Header */}
        <div className="court-picker-header">
          <div className="court-picker-heading">
            <span className="court-picker-title">{title}</span>
            {subtitle && <span className="court-picker-subtitle">{subtitle}</span>}
          </div>
          <button className="court-picker-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Search input */}
        <input
          className="field field--sm court-picker-search"
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
                    <Check size={16} strokeWidth={2.5} color="var(--accent)" />
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
