// src/components/InstallPrompt.jsx
//
// On Android Chrome, the browser fires a special event called
// 'beforeinstallprompt' when it decides the user might want to install
// your PWA. This component catches that event and shows a friendly
// banner so the user knows they can install the app.
//
// This component does NOT show on iPhones — Safari never fires
// 'beforeinstallprompt'. The IOSInstallBanner component handles iOS instead.

import { useState, useEffect } from 'react';

export default function InstallPrompt() {
  // We store the browser's install event here so we can trigger it later
  // when the user taps "Install". Without storing it, the event is lost.
  const [installEvent, setInstallEvent] = useState(null);

  // Whether to actually show the banner right now
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // If the user already dismissed this banner in a previous session,
    // don't show it again — respect their choice.
    const dismissed = localStorage.getItem('lh_install_dismissed');
    if (dismissed) return;

    // Listen for the browser's install prompt event.
    // This fires automatically when Chrome decides the PWA is installable
    // (after the user has visited the site at least once).
    const handlePrompt = (e) => {
      // Prevent Chrome from showing its own default mini-infobar at the
      // bottom of the screen — we'll show our custom banner instead.
      e.preventDefault();

      // Save the event object so we can call it later on button click
      setInstallEvent(e);

      // Now show our custom banner
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);

    // Cleanup: remove the listener when this component is removed from the page
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []); // empty array = only run this once when the component first appears

  // ── Install button handler ─────────────────────────────────────────────
  const handleInstall = async () => {
    if (!installEvent) return;

    // This triggers the browser's built-in "Add to Home Screen?" dialog
    installEvent.prompt();

    // Wait to see if the user accepted or dismissed the dialog
    const { outcome } = await installEvent.userChoice;
    console.log('[LiveHoops] Install prompt outcome:', outcome);

    // Either way, hide our banner — the browser handles the rest
    setVisible(false);
    setInstallEvent(null);
  };

  // ── Dismiss button handler ────────────────────────────────────────────
  const handleDismiss = () => {
    // Remember the dismissal in localStorage so the banner never
    // comes back, even after the user refreshes or returns later.
    localStorage.setItem('lh_install_dismissed', '1');
    setVisible(false);
  };

  // Don't render anything if there's nothing to show
  if (!visible) return null;

  return (
    <div
      style={{
        // Fixed position means it stays in place even when the page scrolls
        position: 'fixed',
        // 70px from the bottom clears the navigation bar (which is 80px tall)
        bottom: 70,
        left: 12,
        right: 12,
        zIndex: 800,

        // Match the app's card style using CSS variables from index.css
        background: 'var(--bg-card)',
        border: '1px solid var(--separator-strong)',
        borderRadius: 16,
        padding: '14px 16px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5)',

        // Layout: emoji + text on the left, buttons on the right
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Basketball emoji — grabs attention */}
      <span style={{ fontSize: 28, flexShrink: 0 }}>🏀</span>

      {/* Main text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 2,
        }}>
          Add LiveHoops to your home screen
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Install for the full app experience
        </div>
      </div>

      {/* Install button — triggers the browser's "Add to Home Screen" dialog */}
      <button
        onClick={handleInstall}
        style={{
          background: 'var(--orange)',
          color: '#fff',
          border: 'none',
          borderRadius: 20,
          padding: '7px 14px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        Install
      </button>

      {/* Dismiss button — closes the banner permanently */}
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
  );
}
