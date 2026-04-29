// src/components/IOSInstallBanner.jsx
//
// iPhones use Safari, and Safari never fires the 'beforeinstallprompt' event
// that Android Chrome does. So iOS users get their own separate banner with
// manual instructions for how to add the app to their home screen.
//
// The iOS install flow is: tap the Share button (⬆) at the bottom of Safari,
// then tap "Add to Home Screen" from the menu that appears.

import { useState } from 'react';

// ── Detect if the user is on an iOS device ─────────────────────────────────
// navigator.userAgent is a string the browser sends that describes itself.
// We check if it contains any of the Apple device names.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

// ── Detect if the app is already installed (running as a PWA) ─────────────
// window.navigator.standalone is an Apple-specific property that is 'true'
// when the page is running as a full-screen PWA (i.e., already installed).
// If it's already installed, we don't need to show the install instructions.
const isInstalled = window.navigator.standalone === true;

export default function IOSInstallBanner() {
  const [visible, setVisible] = useState(() => {
    // Conditions for showing this banner:
    //   1. Must be on an iOS device
    //   2. Must NOT already be installed as a PWA
    //   3. Must NOT have been dismissed before
    if (!isIOS) return false;
    if (isInstalled) return false;
    if (localStorage.getItem('lh_ios_dismissed')) return false;
    return true;
  });

  const handleDismiss = () => {
    // Save dismissal to localStorage so this never shows again
    localStorage.setItem('lh_ios_dismissed', '1');
    setVisible(false);
  };

  // Don't render anything if not on iOS or already dismissed
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 70,   // clears the 80px navigation bar
        left: 12,
        right: 12,
        zIndex: 800,

        background: 'var(--bg-card)',
        border: '1px solid var(--separator-strong)',
        borderRadius: 16,
        padding: '14px 16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header row: icon + title + dismiss button */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>🏀</span>

        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>
            Install LiveHoops
          </div>
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          aria-label="Dismiss"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: 18,
            cursor: 'pointer',
            padding: '0 2px',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Instructions */}
      <div style={{
        fontSize: 13,
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
      }}>
        {/* The ⬆ symbol visually hints at the Share button location in Safari */}
        Tap{' '}
        <span style={{
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}>
          Share ⬆
        </span>
        {' '}below, then tap{' '}
        <span style={{
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}>
          "Add to Home Screen"
        </span>
        {' '}to install LiveHoops
      </div>

      {/* Small triangle pointing down to hint at the share button location */}
      <div style={{
        position: 'absolute',
        bottom: -8,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 0,
        height: 0,
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderTop: '8px solid var(--bg-card)',
      }} />
    </div>
  );
}
