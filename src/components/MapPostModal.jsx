// src/components/MapPostModal.jsx
//
// Slide-up compose sheet for creating a post tagged to a specific court,
// opened directly from the map screen's court detail sheet.
//
// Props:
//   court        — court object { id, name } to pre-tag
//   currentUser  — { id, username, avatarUrl }
//   onPost(data) — async function, data = { type, content, image_url, court_id, court_name }
//   onClose      — called after a successful post or when the user cancels

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Image, Send, Check } from 'lucide-react';
import { MapPin } from 'lucide-react';
import Avatar from './Avatar';
import Toast from './Toast';
import { useStorage } from '../hooks/useStorage';
import { useToast } from '../hooks/useToast';
import { checkInOffer, checkInOfferLabel } from '../utils/checkInOffer';

export default function MapPostModal({
  court,
  currentUser,
  onPost,
  onClose,
  onToast       = null,
  activeCheckIn = null,
  onCheckIn     = null,
  isCheckingIn  = false,
}) {
  const [text,       setText]       = useState('');
  const [isPosting,  setIsPosting]  = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [file,       setFile]       = useState(null);
  const [bottomOffset, setBottomOffset] = useState(0);

  const fileInputRef  = useRef(null);
  const objectUrlRef  = useRef(null);
  const textareaRef   = useRef(null);

  const { uploadPostImage } = useStorage();
  // Local toast for FAILURES only — it lives inside the portal, so it dies with
  // the modal. Success messages go to onToast (the Map screen's toast), which
  // outlives the close.
  const { toast, showToast } = useToast();

  // The court can't change while this sheet is open, so the initial arming is a
  // one-time snapshot. `offer` itself is recomputed each render so the label
  // stays accurate if the check-in state shifts underneath.
  const offer = onCheckIn ? checkInOffer(court, activeCheckIn) : null;
  const [checkInToo, setCheckInToo] = useState(() => offer?.defaultOn ?? false);

  // Focus textarea on open
  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // Lift panel above keyboard (same pattern as DMThread)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onViewport = () => {
      setBottomOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    vv.addEventListener('resize', onViewport);
    vv.addEventListener('scroll', onViewport);
    return () => {
      vv.removeEventListener('resize', onViewport);
      vv.removeEventListener('scroll', onViewport);
    };
  }, []);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handleImageSelect = (e) => {
    const selected = e.target.files[0];
    e.target.value = '';
    if (!selected) return;

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(selected);
    objectUrlRef.current = url;
    setFile(selected);
    setPreviewUrl(url);
  };

  const removeImage = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setFile(null);
    setPreviewUrl(null);
  };

  const handlePost = async () => {
    const trimmed = text.trim();
    if ((!trimmed && !file) || isPosting) return;

    setIsPosting(true);
    try {
      let imageUrl = null;
      if (file) imageUrl = await uploadPostImage(file, currentUser.id);

      await onPost({
        type:       imageUrl ? 'photo' : 'checkin',
        content:    trimmed,
        image_url:  imageUrl,
        court_id:   court.id,
        court_name: court.name,
      });

      // Optional check-in, after the post and isolated from it — see the same
      // reasoning in PostComposer. A check-in failure must not surface as a
      // failed post, because the post is already saved by this point.
      const wantsCheckIn = checkInToo && offer && offer.kind !== 'already';
      let checkInResult = null;
      if (wantsCheckIn) {
        try {
          checkInResult = await onCheckIn(court.id);
        } catch {
          checkInResult = null;
        }
      }

      if (!wantsCheckIn) {
        onToast?.('✅ Posted!');
      } else if (checkInResult) {
        onToast?.(offer.kind === 'switch'
          ? `✅ Posted — switched to ${court.name} 🏀`
          : `✅ Posted — you're on the court at ${court.name} 🏀`);
      } else {
        onToast?.("✅ Posted — but the check-in didn't go through");
      }

      onClose();
    } catch (err) {
      // onPost or uploadPostImage failed — stay open so the user can retry.
      // usePosts.createPost throws a marked friendly error for a tripped
      // rate limit (supabase/rate_limits.sql) — show that; anything else
      // gets a generic fallback so a failure is never silent.
      showToast(err?.friendly ? `❌ ${err.message}` : '❌ Failed to post — try again');
    } finally {
      setIsPosting(false);
    }
  };

  const canPost = (!!text.trim() || !!file) && !isPosting && !isCheckingIn;

  return createPortal(
    <div className="map-post-overlay" onClick={onClose}>
      <div
        className="map-post-sheet"
        style={bottomOffset > 0 ? { bottom: bottomOffset } : undefined}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="map-post-header">
          <span className="map-post-title">Post from court</span>
          <button className="map-post-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Fixed court tag */}
        <div className="map-post-court-tag">
          <MapPin size={13} strokeWidth={2.5} />
          <span>{court.name}</span>
        </div>

        {/* Check-in offer — same rule as the Home composer */}
        {offer && (
          offer.kind === 'already' ? (
            <div className="composer-checkin-offer is-static">
              <span className="composer-checkin-box is-on">
                <Check size={11} strokeWidth={3} />
              </span>
              <span>{checkInOfferLabel(offer, court.name)}</span>
            </div>
          ) : (
            <button
              type="button"
              className={`composer-checkin-offer${checkInToo ? ' is-on' : ''}`}
              onClick={() => setCheckInToo(v => !v)}
              aria-pressed={checkInToo}
            >
              <span className={`composer-checkin-box${checkInToo ? ' is-on' : ''}`}>
                {checkInToo && <Check size={11} strokeWidth={3} />}
              </span>
              <span>{checkInOfferLabel(offer, court.name)}</span>
              {offer.nearby && (
                <span className="composer-checkin-hint">You're here</span>
              )}
            </button>
          )
        )}

        {/* Compose row */}
        <div className="map-post-compose-row">
          <Avatar
            avatarUrl={currentUser.avatarUrl}
            initials={(currentUser.username ?? 'PL').slice(0, 2).toUpperCase()}
            size="small"
          />
          <div className="map-post-body">

            {/* Image preview */}
            {previewUrl && (
              <div className="map-post-image-wrap">
                <img src={previewUrl} alt="Post preview" className="map-post-image" />
                <button className="map-post-image-remove" onClick={removeImage} aria-label="Remove image">
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>
            )}

            <textarea
              ref={textareaRef}
              className="map-post-input"
              placeholder={`What's happening at ${court.name}?`}
              value={text}
              rows={3}
              onChange={e => setText(e.target.value)}
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="map-post-actions">
          <button
            className="map-post-media-btn"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Add photo"
          >
            <Image size={20} strokeWidth={2} color={file ? 'var(--orange)' : 'var(--text-secondary)'} />
          </button>

          <button
            className="map-post-submit"
            disabled={!canPost}
            onClick={handlePost}
          >
            {isPosting ? 'Posting…' : (
              <>
                <Send size={15} strokeWidth={2} />
                Post
              </>
            )}
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />
        <Toast message={toast} />
      </div>
    </div>,
    document.body
  );
}
