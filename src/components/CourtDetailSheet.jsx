// src/components/CourtDetailSheet.jsx
//
// THE court detail bottom sheet — what opens when you tap a court, from the
// Home feed or from the Map.
//
// It used to be two. MapScreen carried its own ~200-line copy of this markup,
// and the two drifted: the Map's copy had favouriting, a visited badge, a
// next-run badge and post-to-feed, while this one had ratings and reviews.
// Neither gap was deliberate — you simply could not read a court review from
// the Map, or favourite a court from Home. One sheet now serves both, and the
// four Map-only features are optional props: pass them and they render, omit
// them and they do not.
//
// Props:
//   court        — court object from useCourts (name, shortAddress, players,
//                  avgRating, reviewCount, checkins, etc.)
//   onClose      — called when the backdrop or close button is tapped
//   onCheckIn    — (courtId) => void — triggers a check-in
//   activeCheckIn — current check-in object or null
//   checkOut     — (checkinId, courtId, userId) => void
//   user         — logged-in Supabase user object
//   isCheckingIn — true while the check-in Supabase call is in progress
//   onViewProfile — optional (userId) => void — opens a checked-in player's profile
//
// Optional, supplied by the Map only:
//   isFavorite       — bool; shows the heart filled
//   onToggleFavorite — () => void; omit and no heart renders
//   visitCount       — how many times you have played here
//   onPostToFeed     — () => void; opens the composer tagged to this court

import { useState, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import Avatar from './Avatar';
import WhosHere from './WhosHere';
import CourtMeetups from './CourtMeetups';
import CourtRoyalty from './CourtRoyalty';
import { useCourtReviews } from '../hooks/useCourtReviews';
import { hasRealDistance } from '../hooks/useCourts';
import { formatMeetupTime } from '../utils/datetime';
import { Image as ImageIcon, Heart, Navigation, CalendarDays } from 'lucide-react';
import { useCourtKing } from '../hooks/useCourtKing';

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
  onViewProfile,
  meetupActions,
  onToast,
  isFavorite = false,
  onToggleFavorite,
  visitCount = 0,
  onPostToFeed,
}) {
  // ── All hooks must be called before any conditional return ────────────────
  const [showReviews,  setShowReviews]  = useState(false);
  const [draftRating,  setDraftRating]  = useState(0);
  const [draftContent, setDraftContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    reviews,
    loading:    reviewsLoading,
    fetchError: reviewsFetchError,
    fetchReviews,
    submitReview,
    deleteReview,
  } = useCourtReviews();

  const { kings, fetchKings } = useCourtKing();

  // Lazy-load reviews the first time the section is expanded
  useEffect(() => {
    if (showReviews && court?.id) {
      fetchReviews(court.id, user?.id);
    }
  }, [showReviews, court?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the two "kings" whenever this sheet opens for a court
  useEffect(() => {
    if (court?.id) fetchKings(court.id);
  }, [court?.id, fetchKings]);

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
          {/* Favourite — Map only. No prop, no heart, so the Home sheet is
              unchanged rather than showing a button that does nothing. */}
          {onToggleFavorite && (
            <button
              className={`map-sheet-favorite${isFavorite ? ' is-favorited' : ''}`}
              onClick={onToggleFavorite}
              aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
            >
              <Heart size={18} strokeWidth={2} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
          )}
          <button className="map-sheet-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* ── Photo, carrying the live marker ───────────────────────────────── */}
        {/* Always rendered so the LIVE pill has somewhere to sit — the same
            decision ParkCard made, and for the same reason. Courts without a
            photo get a quiet block, not a dashed upload target: the mockup's
            "browse files" is its placeholder art. */}
        <div className="court-detail-photo">
          {court.photoUrl ? (
            <img
              src={court.photoUrl}
              alt={`${court.name} court`}
              className="court-detail-photo-img"
            />
          ) : (
            <div className="court-detail-photo-empty" aria-hidden="true">
              <ImageIcon size={26} strokeWidth={1.5} />
            </div>
          )}

          {court.players > 0 && (
            <div className="court-detail-live">
              <span className="live-dot" />
              LIVE · {court.players}
            </div>
          )}
        </div>

        <div className="map-sheet-name">{court.name}</div>

        {/* Address and distance on one line. Filtered then joined, because
            distance is the em dash when GPS is unavailable — writing this as
            `{addr}{dist && ` · ${dist}`}` is what left a dangling separator on
            the Home cards and the Map rows. */}
        <div className="map-sheet-address">
          {[court.shortAddress, hasRealDistance(court.distance) ? court.distance : null]
            .filter(Boolean)
            .join(' · ')}
        </div>

        {/* You have been here before — Map only. */}
        {visitCount > 0 && (
          <div className="map-sheet-visited">
            ✓ You&apos;ve played here {visitCount} {visitCount === 1 ? 'time' : 'times'}
          </div>
        )}

        {/* ── Facts about the court ─────────────────────────────────────────── */}
        {/* "courts", not "hoops": that number is what AddCourtSheet collects
            under "Number of courts", and Home and the Map both say courts.
            "Lights", not "Lights until 11p": there is no closing time stored
            anywhere, and that is the one thing here the data genuinely cannot
            answer. "Outdoor" comes from court_type, which has always been
            populated — normalizeCourt just never read it. */}
        <div className="map-sheet-meta">
          {court.reviewCount > 0 && (
            <span className="map-sheet-meta-item map-sheet-meta-item--rating">
              ★ {Number(court.avgRating).toFixed(1)}
              <span className="map-sheet-meta-count">({court.reviewCount})</span>
            </span>
          )}
          <span className="map-sheet-meta-item">
            {court.courts} {court.courts === 1 ? 'court' : 'courts'}
          </span>
          {court.lighting && <span className="map-sheet-meta-item">Lights</span>}
          {court.setting && (
            <span className="map-sheet-meta-item">{court.setting}</span>
          )}
        </div>

        {/* Next run here, when one is scheduled. court.nextMeetup is attached
            to every court by App's parksWithMeetups, so this needs no prop. */}
        {court.nextMeetup && (
          <div className="map-sheet-meetup-badge">
            <CalendarDays size={13} strokeWidth={2} />
            Run {formatMeetupTime(court.nextMeetup.scheduledAt)}
          </div>
        )}

        {/* ── Who's here — checked-in players (privacy-filtered) ─────────────── */}
        {/* court.checkins comes from the get_court_active_players RPC via     */}
        {/* useCourts. The player count above can be higher — the difference   */}
        {/* is players who've hidden themselves, noted anonymously below.      */}
        <WhosHere
          checkins={court.checkins ?? []}
          players={court.players}
          currentUserId={user?.id}
          onViewProfile={onViewProfile}
          namesSummary
        />

        {/* ── King of the Court — the two reigning per-court leaders ─────────── */}
        <CourtRoyalty
          kings={kings}
          currentUserId={user?.id}
          onViewProfile={onViewProfile}
        />

        {/* ── Actions ───────────────────────────────────────────────────────── */}
        {/* The primary action and Directions share a row; anything else gets
            its own full-width row below, because "Get Directions" alone needs
            ~131px and a third of a 390px sheet is ~110px. */}
        <div className="map-sheet-buttons-row">
          {isCheckedInHere ? (
            <button
              className="btn btn--live-filled btn--grow"
              onClick={async () => {
                await checkOut(activeCheckIn.checkinId, court.id, user?.id);
                onClose();
              }}
            >
              Check out
            </button>
          ) : (
            <button
              className="btn btn--primary btn--grow"
              onClick={() => { onCheckIn(court.id); onClose(); }}
              disabled={isCheckingIn}
            >
              {isCheckingIn ? 'Checking in…' : (isCheckedInElsewhere ? 'Switch courts' : 'Check in here')}
            </button>
          )}

          <a
            className="btn btn--secondary btn--grow"
            href={`https://maps.google.com/?q=${court.lat},${court.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            <Navigation size={15} strokeWidth={2} />
            Directions
          </a>
        </div>

        {/* Post to feed — Map only, and only when there is a composer to open. */}
        {onPostToFeed && (
          <button
            className="btn btn--secondary btn--block map-sheet-secondary-action"
            onClick={onPostToFeed}
          >
            Post to feed from here
          </button>
        )}

        {/* ── Upcoming runs (scheduled meetups) ─────────────────────────────── */}
        {meetupActions && (
          <CourtMeetups
            court={{ id: court.id, name: court.name }}
            meetups={court.meetups ?? []}
            user={user}
            onSchedule={meetupActions.onSchedule}
            onJoin={meetupActions.onJoin}
            onLeave={meetupActions.onLeave}
            onCancel={meetupActions.onCancel}
            fetchAttendees={meetupActions.fetchAttendees}
            onViewProfile={onViewProfile}
            onToast={onToast}
          />
        )}

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
                    <span style={{ color: n <= draftRating ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                      ★
                    </span>
                  </button>
                ))}
              </div>

              <textarea
                className="field field--sm"
                placeholder="Add a comment (optional)"
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                rows={2}
              />

              <button
                className="btn btn--primary btn--sm btn--pill"
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

            {!reviewsLoading && reviewsFetchError && (
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>
                Failed to load reviews —{' '}
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, font: 'inherit' }}
                  onClick={() => fetchReviews(court.id, user?.id)}
                >
                  tap to retry
                </button>
              </div>
            )}

            {!reviewsLoading && !reviewsFetchError && reviews.length === 0 && (
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
