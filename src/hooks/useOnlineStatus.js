// src/hooks/useOnlineStatus.js
//
// Reports whether the device is connected to the internet. Built to survive
// the iOS standalone-PWA cold-launch window, where the OS spuriously fires
// `offline` events and brief network probes can fail for ~1–2s after the
// home-screen icon is tapped.
//
// Rules:
//   1. Always start optimistic (online: true). Never trust navigator.onLine.
//   2. Never flip to offline on a single signal. Require two consecutive
//      probe failures, spaced apart, before showing the banner.
//   3. Any `online` event or successful probe immediately clears offline.
//
// Also returns a debug `log` (last 12 events) so a temporary overlay can
// show what is happening on-device.

import { useState, useEffect, useRef } from 'react';

const PROBE_URLS = ['/favicon.svg', '/apple-touch-icon.png'];
const PROBE_TIMEOUT_MS  = 4000;
const FIRST_PROBE_DELAY = 1500;
const SECOND_PROBE_GAP  = 2500;
const LOG_MAX = 12;

async function probeOnline() {
  const attempts = PROBE_URLS.map((path) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    return fetch(`${path}?_=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
      signal: ctrl.signal,
    })
      .then(() => true)
      .catch(() => false)
      .finally(() => clearTimeout(timer));
  });
  const results = await Promise.all(attempts);
  return results.some(Boolean);
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [log, setLog] = useState([]);
  const timersRef = useRef([]);

  useEffect(() => {
    let cancelled = false;

    const push = (msg) => {
      const stamp = new Date().toLocaleTimeString();
      setLog((prev) => [...prev.slice(-(LOG_MAX - 1)), `${stamp}  ${msg}`]);
    };

    push(`init  navOnLine=${navigator.onLine}  standalone=${
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    }`);

    const clearTimers = () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };

    const confirmOffline = () => {
      clearTimers();
      push('offline event → probing in 1.5s');
      timersRef.current.push(setTimeout(async () => {
        if (cancelled) return;
        const first = await probeOnline();
        if (cancelled) return;
        push(`probe1 ${first ? 'OK' : 'FAIL'}`);
        if (first) { setIsOnline(true); return; }

        timersRef.current.push(setTimeout(async () => {
          if (cancelled) return;
          const second = await probeOnline();
          if (cancelled) return;
          push(`probe2 ${second ? 'OK' : 'FAIL'} → online=${second}`);
          setIsOnline(second);
        }, SECOND_PROBE_GAP));
      }, FIRST_PROBE_DELAY));
    };

    const goOnline = () => {
      clearTimers();
      push('online event');
      if (!cancelled) setIsOnline(true);
    };
    const goOffline = () => confirmOffline();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        push('foreground → optimistic online');
        if (!cancelled) setIsOnline(true);
      }
    };

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      clearTimers();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { isOnline, log };
}
