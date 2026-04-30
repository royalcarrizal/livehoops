// src/components/CourtDetailSheet.jsx
//
// Reusable court detail bottom sheet — used when a user taps a tagged court
// in the feed or on the map. Shows court info, check-in controls, and a
// collapsible Ratings & Reviews section.
//
// Props:
//   court        — court object from useCourts (name, shortAddress, players,
//                  avgRating, reviewCount, etc.)
//   onClose      — called when the backdrop or close button is tapped
//   onCheckIn    — (courtId) => void — triggers a check-in
//   activeCheckIn — current check-in object or null
//   checkOut     — (checkinId, courtId, userId) => void
//   user         — logged-in Supabase user object
//   isCheckingIn — true while the check-in Supabase call is in progress

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import Avatar from './Avatar';
import { useCourtReviews } from '../hooks/useCourtReviews';

// ── Renders 1–5 filled/empty star characters ─────────────────────────────────
function StarRow({ rating, size = 14 }) {
  return (
    <div className="stars-row">
      {[1, 2, 3, 4, 5].map(n => (
        <span key={n} className={`star${n <= Math.round(rating) ? '' : ' empty'}`} style={{ fontSize: size }}>
          ★
        </span>
      ))}
    </div>
  );
}

export default function CourtDetailSheet({
  court,
  onClose,
  onCheckIn,
  activeCheckIn,
  checkOut,
  user,
  isCheckingIn = false,
}) {
  // ── All hooks must be called before any conditional return ────────────────
  const [showReviews,  setShowReviews]  = useState(false);
  const [draftRating,  setDraftRating]  = useState(0);
  const [draftContent, setDraftContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    reviews,
    loading: reviewsLoading,
    fetchReviews,
    submitReview,
    deleteReview,
  } = useCourtReviews();

  // Lazy-load reviews the first time the section is expanded
  useEffect(() => {
    if (showReviews && court?.id) {
      fetchReviews(court.id, user?.id);
    }
  }, [showReviews, court?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill the draft editor when the user's own review loads
  const myReview = reviews.find(r => r.isOwn);
  useEffect(() => {
    if (myReview) {
      setDraftRating(myReview.rating);
      setDraftContent(myReview.content ?? '');
    }
  }, [myReview?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Early return after all hooks ──────────────────────────────────────────
  if (!court) return null;

  const isCheckedInHere      = activeCheckIn?.courtId === court.id;
  const isCheckedInElsewhere = !!activeCheckIn && !isCheckedInHere;

  // ── Submit / update review ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!draftRating || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await submitReview(user.id, court.id, draftRating, draftContent);
    } catch {
      // Error logged inside the hook
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="map-sheet-overlay" onClick={onClose} />

      {/* Sheet — reuses MapScreen sheet styles for visual consistency */}
      <div className="map-bottom-sheet map-bottom-sheet--scrollable">
        <div className="map-sheet-top-row">
          <div className="map-sheet-drag-handle" />
          <button className="map-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="map-sheet-name">{court.name}</div>
        <div className="map-sheet-address">{court.shortAddress}</div>

        {/* ── Info pills ─────────────────────────────────────────────────────── */}
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

        {/* ── Average rating summary ────────────────────────────────────────── */}
        <div className="court-avg-rating">
          {court.reviewCount > 0 ? (
            <>
              <StarRow rating={court.avgRating} size={15} />
              <span className="court-avg-number">{Number(court.avgRating).toFixed(1)}</span>
              <span className="court-avg-count">
                ({court.reviewCount} {court.reviewCount === 1 ? 'rating' : 'ratings'})
              </span>
            </>
          ) : (
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No ratings yet</span>
          )}
        </div>

        {/* ── Check-in / Directions buttons ─────────────────────────────────── */}
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

        {/* ── Ratings & Reviews section ─────────────────────────────────────── */}
        {/* Tapping the header toggles the section open/closed.               */}
        {/* Reviews are fetched lazily on first open.                         */}
        <button
          className="reviews-section-header"
          onClick={() => setShowReviews(v => !v)}
        >
          <span className="reviews-section-title">
            Ratings &amp; Reviews{court.reviewCount > 0 ? ` (${court.reviewCount})` : ''}
          </span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            {showReviews ? '▲' : '▼'}
          </span>
        </button>

        {showReviews && (
          <div className="reviews-section-body">

            {/* ── Rate this court composer ──────────────────────────────────── */}
            <div className="review-composer">
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600 }}>
                {myReview ? 'Your rating' : 'Rate this court'}
              </div>

              {/* 5 tappable stars */}
              <div className="review-star-picker">
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    className="review-star-btn"
                    onClick={() => setDraftRating(n)}
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  >
                    <span style={{ color: n <= draftRating ? 'var(--orange)' : 'var(--text-tertiary)' }}>
                      ★
                    </span>
                  </button>
                ))}
              </div>

              <textarea
                className="review-textarea"
                placeholder="Add a comment (optional)"
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                rows={2}
              />

              <button
                className="review-submit-btn"
                disabled={!draftRating || isSubmitting}
                onClick={handleSubmit}
              >
                {isSubmitting ? 'Saving…' : (myReview ? 'Update Review' : 'Submit Review')}
              </button>
            </div>

            {/* ── Review list ───────────────────────────────────────────────── */}
            {reviewsLoading && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                Loading reviews…
              </div>
            )}

            {!reviewsLoading && reviews.length === 0 && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>
                Be the first to rate this court!
              </div>
            )}

            {!reviewsLoading && reviews.map(review => (
              <div key={review.id} className="review-item">
                <Avatar
                  avatarUrl={review.userAvatarUrl}
                  initials={review.userInitials}
                  size="small"
                />
                <div className="review-item-body">
                  <div className="review-item-header">
                    <span className="review-item-username">{review.username}</span>
                    <StarRow rating={review.rating} size={12} />
                    <span className="review-item-time">{review.timeAgo}</span>
                    {review.isOwn && (
                      <button
                        className="review-delete-btn"
                        onClick={() => deleteReview(review.id)}
                        aria-label="Delete review"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {review.content && (
                    <div className="review-item-text">{review.content}</div>
                  )}
                </div>
              </div>
            ))}

          </div>
        )}

        {/* Bottom spacer so last item isn't flush against the nav bar */}
        <div style={{ height: 8 }} />
      </div>
    </>
  );
}
