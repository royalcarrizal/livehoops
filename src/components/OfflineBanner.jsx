// src/components/OfflineBanner.jsx
//
// A thin red banner that slides down from the top of the screen when the
// user loses their internet connection, and slides back up when they
// reconnect. This is especially important for a PWA because users may
// use the app on mobile with spotty cell service.

import { useOnlineStatus } from '../hooks/useOnlineStatus';

export default function OfflineBanner() {
  // useOnlineStatus tracks the connection in real time and re-renders
  // this component automatically whenever the connection changes
  const { isOnline } = useOnlineStatus();

  return (
    <div
      style={{
        // Fixed position keeps the banner anchored to the top of the screen
        // regardless of scroll position
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999, // very high z-index so it appears above everything else

        background: '#E24B4A', // red background to signal a problem
        color: '#fff',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 600,
        padding: '10px 16px',

        // Slide animation: when online, move the banner up off-screen (-100%).
        // When offline, slide it down to its natural position (translateY 0).
        // The transition property makes this animate smoothly over 0.3 seconds.
        transform: isOnline ? 'translateY(-100%)' : 'translateY(0)',
        transition: 'transform 0.3s ease',

        // Keep the banner accessible to screen readers even when hidden
        // (the transform hides it visually but doesn't remove it from the DOM)
      }}
      // ARIA role tells screen readers this is an important status message
      role="status"
      aria-live="polite"
    >
      📡 You're offline — some features may not work
    </div>
  );
}
