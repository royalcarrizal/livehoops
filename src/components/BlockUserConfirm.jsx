// src/components/BlockUserConfirm.jsx
//
// Small shared confirmation dialog for blocking someone, reused from all
// three entry points (ProfileScreen, FeedPost's options sheet, DMThread's
// header) so the "are you sure?" moment looks and behaves the same
// everywhere. Reuses the settings-confirm-* classes SettingsSheet already
// defines for its Sign Out / Delete Account dialogs.
//
// Props:
//   username  — the person being blocked, for the confirmation copy
//   onConfirm — async () => void — performs the block
//   onCancel  — dismiss without blocking

import { useState } from 'react';

export default function BlockUserConfirm({ username, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-confirm-overlay">
      <div className="settings-confirm-box">
        <div className="settings-confirm-title">Block {username}?</div>
        <div className="settings-confirm-desc">
          They won't be able to see your posts or message you, and you won't see
          theirs. This also ends your friendship, if you have one. You can
          unblock them anytime from Settings.
        </div>
        <div className="settings-confirm-btns">
          <button className="settings-confirm-cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="settings-confirm-danger" onClick={handleConfirm} disabled={busy}>
            {busy ? 'Blocking…' : 'Block'}
          </button>
        </div>
      </div>
    </div>
  );
}
