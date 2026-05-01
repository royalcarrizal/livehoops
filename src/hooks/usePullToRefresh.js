// src/hooks/usePullToRefresh.js
//
// Detects a downward swipe from the top of a scrollable container and calls
// onRefresh() when the pull distance crosses the threshold.
//
// Usage:
//   const { containerRef, pullDistance, refreshing } = usePullToRefresh(onRefresh);
//   <div ref={containerRef} ...>

import { useState, useRef, useCallback, useEffect } from 'react';

const THRESHOLD = 72; // px pulled before releasing triggers a refresh
const MAX_PULL  = 100; // cap on how far the indicator stretches

export function usePullToRefresh(onRefresh) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing,   setRefreshing]   = useState(false);

  const containerRef = useRef(null);
  const startY       = useRef(0);
  const pulling      = useRef(false);
  // Keep a stable ref to the latest onRefresh so the touch handlers don't
  // need to re-register every time the caller's function identity changes.
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  const handleTouchStart = useCallback((e) => {
    const el = containerRef.current;
    if (!el || el.scrollTop > 0 || refreshing) return;
    startY.current  = e.touches[0].clientY;
    pulling.current = true;
  }, [refreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!pulling.current) return;
    const el = containerRef.current;
    // If the container scrolled since touch started, abort the pull gesture
    if (!el || el.scrollTop > 0) { pulling.current = false; setPullDistance(0); return; }

    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) {
      // Prevent the browser's native overscroll/bounce while we're pulling
      e.preventDefault();
      setPullDistance(Math.min(delta, MAX_PULL));
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    const dist = pullDistance;
    setPullDistance(0);

    if (dist >= THRESHOLD) {
      setRefreshing(true);
      try {
        await onRefreshRef.current?.();
      } finally {
        setRefreshing(false);
      }
    }
  }, [pullDistance]);

  // Attach with { passive: false } on touchmove so preventDefault() is allowed.
  // React's synthetic touch events are passive by default, so we go direct.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove',  handleTouchMove,  { passive: false });
    el.addEventListener('touchend',   handleTouchEnd,   { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove',  handleTouchMove);
      el.removeEventListener('touchend',   handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, pullDistance, refreshing };
}
