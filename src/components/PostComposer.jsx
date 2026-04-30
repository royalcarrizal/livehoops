import { useState, useRef, useEffect } from 'react';
import { Image, Video, MapPin, X } from 'lucide-react';
import Avatar from './Avatar';
import CourtPickerSheet from './CourtPickerSheet';
import { useStorage } from '../hooks/useStorage';

// Props:
//   onPost(data)     — async function called when the user taps Post.
//                      data = { type, content, image_url, court_id, court_name }
//   onToast(msg)     — function to show a brief toast message
//   userId           — the logged-in user's Supabase UUID
//   userInitials     — 2-letter string shown in the avatar fallback
//   userAvatarUrl    — URL of the user's avatar photo (or null)
//   courts           — array of court objects from useCourts (for the court picker)
export default function PostComposer({
  onPost,
  onToast,
  userId,
  userInitials  = 'PL',
  userAvatarUrl = null,
  courts        = [],
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
      onToast?.('❌ Failed to post — try again');
    } finally {
      setIsPosting(false);
    }
  };

  const canPost = (!!text.trim() || !!selectedFile || !!selectedCourt) && !isPosting;

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
              <MapPin size={12} strokeWidth={2.5} color="var(--orange)" />
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
                  color={selectedFile ? 'var(--orange)' : 'var(--text-secondary)'}
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
                  color={selectedCourt ? 'var(--orange)' : 'var(--text-secondary)'}
                />
              </button>
            </div>

            <button
              className="composer-post-btn"
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
