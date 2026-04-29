import { X } from 'lucide-react';

export default function PhotoViewer({ url, onClose }) {
  if (!url) return null;

  return (
    <div
      className="photo-viewer-overlay"
      onClick={onClose}
    >
      <button
        className="photo-viewer-close"
        onClick={onClose}
        aria-label="Close"
      >
        <X size={20} strokeWidth={2.5} color="#fff" />
      </button>
      <img
        src={url}
        alt=""
        className="photo-viewer-img"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}
