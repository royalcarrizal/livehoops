// src/hooks/useSwipeNav.js
//
// Detects a horizontal swipe on a container and calls onSwipeLeft() /
// onSwipeRight() — used by the Onboarding and FeatureTour slide carousels so
// users can swipe between slides in addition to tapping the Next/Back buttons.
//
// Follows the same shape as usePullToRefresh.js: raw addEventListener (not
// React's passive synthetic touch events) with { passive: false } on
// touchmove so preventDefault() is allowed, and refs so handlers stay stable
// across renders.
//
// Usage:
//   const { containerRef } = useSwipeNav(goNext, goBack);
//   <div ref={containerRef} className="onboarding-strip-wrap">…

import { useRef, useCallback, useEffect } from 'react';

const SWIPE_THRESHOLD = 50; // px of horizontal travel before it counts as a swipe

export function useSwipeNav(onSwipeLeft, onSwipeRight) {
  const containerRef = useRef(null);
  const startX  = useRef(0);
  const startY  = useRef(0);
  const dragging = useRef(false);
  // True once this touch has been claimed as a horizontal swipe (vs. a
  // vertical scroll/tap) — decided on the first move past a small deadzone.
  const isHorizontal = useRef(false);

  // Keep stable refs to the latest callbacks so the listener effect below
  // doesn't need to re-run (and re-attach) every time the caller passes new
  // function identities (e.g. Onboarding re-renders on every step change).
  const onLeftRef  = useRef(onSwipeLeft);
  const onRightRef = useRef(onSwipeRight);
  useEffect(() => { onLeftRef.current  = onSwipeLeft;  }, [onSwipeLeft]);
  useEffect(() => { onRightRef.current = onSwipeRight; }, [onSwipeRight]);

  const handleTouchStart = useCallback((e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    dragging.current = true;
    isHorizontal.current = false;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!dragging.current) return;

    const deltaX = e.touches[0].clientX - startX.current;
    const deltaY = e.touches[0].clientY - startY.current;

    // Decide the gesture's axis once it clears a small deadzone, so a tap
    // or the start of a vertical scroll doesn't get claimed as a swipe.
    if (!isHorizontal.current) {
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return;
      isHorizontal.current = Math.abs(deltaX) > Math.abs(deltaY);
      if (!isHorizontal.current) {
        // Vertical gesture — let the browser handle it normally.
        dragging.current = false;
        return;
      }
    }

    // We've claimed this as a horizontal swipe: stop iOS Safari's edge-swipe
    // back/forward-navigation gesture from firing while the user drags.
    e.preventDefault();
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (!dragging.current || !isHorizontal.current) {
      dragging.current = false;
      return;
    }
    dragging.current = false;

    const deltaX = e.changedTouches[0].clientX - startX.current;
    if (deltaX <= -SWIPE_THRESHOLD) {
      onLeftRef.current?.();   // swiped left → next slide
    } else if (deltaX >= SWIPE_THRESHOLD) {
      onRightRef.current?.();  // swiped right → previous slide
    }
  }, []);

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

  return { containerRef };
}
