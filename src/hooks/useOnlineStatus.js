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
  // Always start as online — iOS Safari sometimes incorrectly reports
  // navigator.onLine as false on PWA launch, causing a false offline flash.
  // We trust the browser's live events instead of the initial value.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return { isOnline };
}
