import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Link2, Share2, X } from 'lucide-react';
import { createCheckInShare, revokeCheckInShare } from '../lib/checkInShares';
import {
  buildCheckInSharePayload,
  buildCheckInShareUrl,
  normalizePublicAppUrl,
  shareCheckInLink,
} from '../utils/checkInShare';

export default function ShareCheckInSheet({ checkinId, courtName, onClose, onFeedback }) {
  const [shareRecord, setShareRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [manualCopy, setManualCopy] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const closeRef = useRef(null);
  const sheetRef = useRef(null);

  const prepareLink = useCallback(async () => {
    setLoading(true);
    setError('');
    setManualCopy(false);

    try {
      // Validate configuration before creating a bearer token. A production
      // build must never silently fall back to a preview or request origin.
      const publicOrigin = normalizePublicAppUrl({
        configuredUrl: import.meta.env.VITE_PUBLIC_APP_URL,
        runtimeOrigin: window.location.origin,
        isProduction: import.meta.env.PROD,
      });
      const record = await createCheckInShare(checkinId);
      const url = buildCheckInShareUrl(record.token, {
        configuredUrl: publicOrigin,
        isProduction: true,
      });
      setShareRecord({ ...record, url });
    } catch (err) {
      console.error('[LiveHoops] Share link preparation failed:', err?.message ?? err);
      setShareRecord(null);
      setError(
        err?.message?.includes('not shareable')
          ? 'This check-in cannot be shared. Make sure location sharing is enabled and the session is still active.'
          : err?.message || 'Could not prepare the link. Check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [checkinId]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    prepareLink();
    const focusTimer = setTimeout(() => closeRef.current?.focus(), 50);
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheetRef.current) return;

      const focusable = Array.from(sheetRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )).filter(element => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !sheetRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sheetRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [prepareLink, onClose]);

  const runShare = async ({ native }) => {
    if (!shareRecord?.url || sharing) return;
    setSharing(true);
    setManualCopy(false);

    const payload = buildCheckInSharePayload(courtName, shareRecord.url);
    const result = await shareCheckInLink({
      payload,
      share: native && navigator.share ? navigator.share.bind(navigator) : undefined,
      writeClipboard: navigator.clipboard?.writeText
        ? navigator.clipboard.writeText.bind(navigator.clipboard)
        : undefined,
    });

    setSharing(false);
    if (result === 'shared') {
      onClose();
    } else if (result === 'copied') {
      onFeedback?.('Check-in link copied');
      onClose();
    } else if (result === 'manual') {
      setManualCopy(true);
    }
  };

  const handleRevoke = async () => {
    if (!shareRecord?.token || revoking) return;
    setRevoking(true);
    setError('');
    try {
      const revoked = await revokeCheckInShare(shareRecord.token);
      if (!revoked) throw new Error('This link was already stopped.');
      onFeedback?.('Sharing stopped — the old link no longer works');
      onClose();
    } catch (err) {
      setError(err?.message || 'Could not stop sharing. Try again.');
      setConfirmingRevoke(false);
    } finally {
      setRevoking(false);
    }
  };

  const nativeShareAvailable = typeof navigator.share === 'function';
  const expiryLabel = shareRecord?.expires_at
    ? new Date(shareRecord.expires_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return createPortal(
    <div className="map-post-overlay" onClick={onClose}>
      <section
        ref={sheetRef}
        className="map-post-sheet share-checkin-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-checkin-title"
        onClick={event => event.stopPropagation()}
      >
        <div className="map-post-header">
          <span id="share-checkin-title" className="map-post-title">Share your check-in</span>
          <button ref={closeRef} className="map-post-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="share-checkin-body">
          <div className="active-session-card share-checkin-preview">
            <div className="session-badge">
              <Link2 size={12} strokeWidth={2.5} />
              <span className="session-badge-text">Check-in invite</span>
            </div>
            <div className="session-court-name">{courtName || 'Your court'}</div>
            <p className="share-checkin-preview-copy">
              Anyone with this link can see this court, whether your run is live or ended,
              and your username and photo when your profile is public.
            </p>
          </div>

          {loading && <div className="share-checkin-loading">Preparing a private link…</div>}
          {error && <div className="auth-error" role="alert">{error}</div>}

          {!loading && !shareRecord && (
            <button className="auth-submit-btn" onClick={prepareLink}>Try Again</button>
          )}

          {shareRecord && (
            <>
              <div className="share-checkin-actions">
                <button
                  className="auth-submit-btn"
                  onClick={() => runShare({ native: true })}
                  disabled={sharing || revoking}
                >
                  <Share2 size={17} strokeWidth={2.2} />
                  {sharing ? 'Sharing…' : nativeShareAvailable ? 'Share Link' : 'Copy Link'}
                </button>
                {nativeShareAvailable && (
                  <button
                    className="map-directions-btn"
                    onClick={() => runShare({ native: false })}
                    disabled={sharing || revoking}
                  >
                    <Copy size={16} strokeWidth={2.2} />
                    Copy Link
                  </button>
                )}
              </div>

              {manualCopy && (
                <div className="share-checkin-manual-copy">
                  <label htmlFor="share-checkin-url">Press and hold to copy this link</label>
                  <input
                    id="share-checkin-url"
                    className="modal-input"
                    value={shareRecord.url}
                    readOnly
                    autoFocus
                    onFocus={event => event.currentTarget.select()}
                  />
                </div>
              )}

              <p className="share-checkin-note">
                The recap expires {expiryLabel}. Turning off Show My Location stops it immediately.
              </p>

              {!confirmingRevoke ? (
                <button className="share-checkin-revoke" onClick={() => setConfirmingRevoke(true)}>
                  Stop sharing this link
                </button>
              ) : (
                <div className="share-checkin-revoke-confirm">
                  <span>The old link cannot be restored.</span>
                  <div>
                    <button onClick={() => setConfirmingRevoke(false)} disabled={revoking}>Keep Link</button>
                    <button onClick={handleRevoke} disabled={revoking}>
                      {revoking ? 'Stopping…' : 'Stop Sharing'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
