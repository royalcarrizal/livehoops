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
import { X, Image, Send } from 'lucide-react';
import { MapPin } from 'lucide-react';
import Avatar from './Avatar';
import { useStorage } from '../hooks/useStorage';

export default function MapPostModal({ court, currentUser, onPost, onClose }) {
  const [text,       setText]       = useState('');
  const [isPosting,  setIsPosting]  = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [file,       setFile]       = useState(null);
  const [bottomOffset, setBottomOffset] = useState(0);

  const fileInputRef  = useRef(null);
  const objectUrlRef  = useRef(null);
  const textareaRef   = useRef(null);

  const { uploadPostImage } = useStorage();

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

      onClose();
    } catch {
      // onPost or uploadPostImage failed — stay open so the user can retry
    } finally {
      setIsPosting(false);
    }
  };

  const canPost = (!!text.trim() || !!file) && !isPosting;

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
      </div>
    </div>,
    document.body
  );
}
