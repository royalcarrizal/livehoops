import { useState, useRef, useEffect } from 'react';
import { Image, Video, MapPin, X, Check } from 'lucide-react';
import Avatar from './Avatar';
import CourtPickerSheet from './CourtPickerSheet';
import { useStorage } from '../hooks/useStorage';
import { checkInOffer, checkInOfferLabel } from '../utils/checkInOffer';

// Props:
//   onPost(data)     — async function called when the user taps Post.
//                      data = { type, content, image_url, court_id, court_name }
//   onToast(msg)     — function to show a brief toast message
//   userId           — the logged-in user's Supabase UUID
//   userInitials     — 2-letter string shown in the avatar fallback
//   userAvatarUrl    — URL of the user's avatar photo (or null)
//   courts           — array of court objects from useCourts (for the court picker)
//   activeCheckIn    — the user's current check-in, or null. Decides whether the
//                      offer below reads "Check in" or "Switch".
//   onCheckIn(id)    — App.jsx's unified check-in handler. Omit it (or pass null)
//                      and the check-in offer simply doesn't render, so this
//                      component still works anywhere it's used without one.
//   isCheckingIn     — true while a check-in is already in flight (App's guard)
export default function PostComposer({
  onPost,
  onToast,
  userId,
  userInitials  = 'PL',
  userAvatarUrl = null,
  courts        = [],
  activeCheckIn = null,
  onCheckIn     = null,
  isCheckingIn  = false,
}) {
  const [text, setText]       = useState('');
  const [focused, setFocused] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  // ── Image state ────────────────────────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl,   setPreviewUrl]   = useState(null);

  // ── Court tag state ────────────────────────────────────────────────────────
  // selectedCourt — the court object the user tagged, or null
  // showPicker    — controls whether CourtPickerSheet is open
  const [selectedCourt, setSelectedCourt] = useState(null);
  const [showPicker,    setShowPicker]    = useState(false);

  // ── Check-in offer state ──────────────────────────────────────────────────
  // offer is null unless a court is tagged AND a handler was provided.
  // checkInToo is whether the user wants to check in along with the post; it
  // re-arms from offer.defaultOn whenever the tagged court changes, so picking
  // a court you're standing at turns it on and switching to a distant one
  // turns it back off.
  const offer = onCheckIn ? checkInOffer(selectedCourt, activeCheckIn) : null;
  const [checkInToo, setCheckInToo] = useState(false);

  useEffect(() => {
    setCheckInToo(offer?.defaultOn ?? false);
    // Keyed on the court id, not the offer object (which is rebuilt each
    // render) — otherwise this would fight the user's own toggling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourt?.id]);

  const textareaRef   = useRef(null);
  const imageInputRef = useRef(null);
  const objectUrlRef  = useRef(null);

  const { uploadPostImage } = useStorage();

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  // ── Image picker ───────────────────────────────────────────────────────────
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      onToast?.('Image too large — please choose a file under 10MB');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      onToast?.('Please choose a JPEG, PNG, or WebP image');
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setSelectedFile(file);
    setPreviewUrl(url);
  };

  const removeImage = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  // ── Post handler ───────────────────────────────────────────────────────────
  const handlePost = async () => {
    const trimmed = text.trim();
    // Need at least some text, an image, OR a tagged court
    if ((!trimmed && !selectedFile && !selectedCourt) || isPosting) return;

    setIsPosting(true);
    try {
      let imageUrl = null;
      if (selectedFile) {
        imageUrl = await uploadPostImage(selectedFile, userId);
      }

      // Determine post type:
      // photo if an image is attached, checkin if a court is tagged, otherwise status
      const type = imageUrl ? 'photo' : selectedCourt ? 'checkin' : 'status';

      await onPost?.({
        type,
        content:    trimmed,
        image_url:  imageUrl,
        court_id:   selectedCourt?.id   ?? null,
        court_name: selectedCourt?.name ?? null,
      });

      // ── Optional check-in ────────────────────────────────────────────────
      // Deliberately AFTER the post: posting is what the user tapped, the
      // check-in rides along. Its own try/catch keeps a check-in failure from
      // being reported as a failed post — the post is already saved by here.
      // 'already' is skipped: they're checked in at this court, so there's
      // nothing to do.
      const wantsCheckIn = checkInToo && offer && offer.kind !== 'already';
      let checkInResult = null;
      if (wantsCheckIn) {
        try {
          checkInResult = await onCheckIn(selectedCourt.id);
        } catch {
          checkInResult = null; // fall through to the partial-success message
        }
      }

      // One toast covering both outcomes, rather than two firing in sequence.
      if (!wantsCheckIn) {
        onToast?.('✅ Posted!');
      } else if (checkInResult) {
        onToast?.(offer.kind === 'switch'
          ? `✅ Posted — switched to ${selectedCourt.name} 🏀`
          : `✅ Posted — you're on the court at ${selectedCourt.name} 🏀`);
      } else {
        onToast?.("✅ Posted — but the check-in didn't go through");
      }

      // Clear everything on success
      setText('');
      textareaRef.current?.blur();
      setFocused(false);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setSelectedFile(null);
      setPreviewUrl(null);
      setSelectedCourt(null);

    } catch (err) {
      console.error('PostComposer submit failed:', err);
      // usePosts.createPost throws a marked friendly error for a tripped
      // rate limit (supabase/rate_limits.sql) — show that specific message;
      // any other failure keeps the generic fallback.
      onToast?.(err?.friendly ? `❌ ${err.message}` : '❌ Failed to post — try again');
    } finally {
      setIsPosting(false);
    }
  };

  // isCheckingIn is App's global double-tap guard — if a check-in is already in
  // flight, ours would be silently dropped, so block the button instead.
  const canPost =
    (!!text.trim() || !!selectedFile || !!selectedCourt) && !isPosting && !isCheckingIn;

  return (
    <>
      <div className="post-composer">
        <Avatar avatarUrl={userAvatarUrl} initials={userInitials} size="small" />

        <div className="composer-body">

          {/* ── Image preview ───────────────────────────────────────────────── */}
          {previewUrl && (
            <div className="composer-image-preview">
              <img src={previewUrl} alt="Selected image preview" />
              <button
                className="composer-image-remove"
                onClick={removeImage}
                aria-label="Remove image"
              >
                ×
              </button>
            </div>
          )}

          {/* ── Tagged court pill ────────────────────────────────────────────── */}
          {selectedCourt && (
            <div className="composer-court-tag">
              <MapPin size={12} strokeWidth={2.5} color="var(--accent)" />
              <span>{selectedCourt.name}</span>
              <button
                className="composer-court-tag-remove"
                onClick={() => setSelectedCourt(null)}
                aria-label="Remove court"
              >
                <X size={12} strokeWidth={2.5} />
              </button>
            </div>
          )}

          {/* ── Check-in offer ───────────────────────────────────────────────── */}
          {/* Only appears once a court is tagged. Pre-armed when GPS says the  */}
          {/* user is at that court; otherwise they have to opt in, because a   */}
          {/* stray check-in inflates the court's live count and alerts friends. */}
          {offer && selectedCourt && (
            offer.kind === 'already' ? (
              <div className="composer-checkin-offer is-static">
                <span className="composer-checkin-box is-on">
                  <Check size={11} strokeWidth={3} />
                </span>
                <span>{checkInOfferLabel(offer, selectedCourt.name)}</span>
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
                <span>{checkInOfferLabel(offer, selectedCourt.name)}</span>
                {offer.nearby && (
                  <span className="composer-checkin-hint">You're here</span>
                )}
              </button>
            )
          )}

          {/* ── Text input ──────────────────────────────────────────────────── */}
          <textarea
            ref={textareaRef}
            className="composer-input"
            placeholder="What's happening on the court?"
            value={text}
            rows={focused ? 3 : 1}
            onChange={e => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => !text && !previewUrl && !selectedCourt && setFocused(false)}
          />

          {/* ── Action bar ──────────────────────────────────────────────────── */}
          <div className="composer-actions">
            <div className="composer-media-btns">

              {/* Photo button */}
              <button
                className="composer-media-btn"
                aria-label="Photo"
                onClick={() => imageInputRef.current?.click()}
              >
                <Image
                  size={18}
                  strokeWidth={2}
                  color={selectedFile ? 'var(--accent)' : 'var(--text-secondary)'}
                />
              </button>

              {/* Video button — shows coming soon message */}
              <button
                className="composer-media-btn"
                aria-label="Video"
                onClick={() => onToast?.('🎬 Videos coming soon!')}
              >
                <Video size={18} strokeWidth={2} color="var(--text-secondary)" />
              </button>

              {/* Court tag button — opens CourtPickerSheet */}
              <button
                className="composer-media-btn"
                aria-label="Tag a court"
                onClick={() => setShowPicker(true)}
              >
                <MapPin
                  size={18}
                  strokeWidth={2}
                  color={selectedCourt ? 'var(--accent)' : 'var(--text-secondary)'}
                />
              </button>
            </div>

            <button
              className="btn btn--primary btn--sm btn--pill"
              disabled={!canPost}
              onClick={handlePost}
            >
              {isPosting ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />
      </div>

      {/* Court picker sheet — rendered outside the composer div so it overlays everything */}
      {showPicker && (
        <CourtPickerSheet
          courts={courts}
          selected={selectedCourt}
          onSelect={setSelectedCourt}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
