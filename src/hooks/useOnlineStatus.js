// src/hooks/useOnlineStatus.js
//
// A small React hook that tells you whether the user's device is connected
// to the internet right now.
//
// Why do we need this?
// When someone uses a PWA on their phone, they might walk into a tunnel or
// lose cell signal. navigator.onLine is a browser built-in that reports
// the connection state, but it won't automatically cause React to re-render
// when the connection changes — that's what this hook is for.

import { useState, useEffect } from 'react';

export function useOnlineStatus() {
  // Initialize with the current online state when the hook first runs.
  // navigator.onLine returns true if connected, false if offline.
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    // These handlers update our state when the connection changes.
    // 'online' fires when the browser regains internet access.
    // 'offline' fires when the browser loses internet access.
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    // Register both event listeners on the window object
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);

    // Cleanup function: React calls this when the component using this hook
    // is removed from the page. Removing listeners prevents memory leaks.
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []); // empty array = set up the listeners once, on mount

  // Return the current online status so any component can use it:
  //   const { isOnline } = useOnlineStatus();
  return { isOnline };
}
