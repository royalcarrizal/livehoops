import { useCallback, useEffect, useState } from 'react';
import { getSharedCheckIn } from '../lib/checkInShares';

export function useSharedCheckIn(token, invalid = false, audienceKey = 'guest') {
  const [data, setData] = useState(invalid ? { state: 'unavailable' } : null);
  const [loading, setLoading] = useState(!!token);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [resolvedFor, setResolvedFor] = useState(null);

  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    let cancelled = false;

    if (invalid) {
      setData({ state: 'unavailable' });
      setLoading(false);
      setError(null);
      setResolvedFor(audienceKey);
      return () => { cancelled = true; };
    }

    if (!token) {
      setData(null);
      setLoading(false);
      setError(null);
      setResolvedFor(null);
      return () => { cancelled = true; };
    }

    setLoading(true);
    setError(null);
    setResolvedFor(null);

    getSharedCheckIn(token)
      .then(result => {
        if (!cancelled) {
          setData(result);
          setResolvedFor(audienceKey);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setData(null);
          setError(err);
          setResolvedFor(audienceKey);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [token, invalid, attempt, audienceKey]);

  // Keep an open invite current without exposing any extra data. Polling turns
  // live sessions into recaps after checkout and removes content after revoke,
  // privacy-off, or link expiry. Boundary timers avoid waiting for the next
  // poll at the known three-hour and 30-day cutoffs.
  useEffect(() => {
    if (
      !token ||
      invalid ||
      resolvedFor !== audienceKey ||
      error ||
      data?.state === 'unavailable'
    ) return undefined;

    let cancelled = false;
    const refreshSilently = async () => {
      try {
        const result = await getSharedCheckIn(token);
        if (!cancelled) setData(result);
      } catch {
        // Preserve the last safe projection during a transient background
        // failure. The explicit Retry path remains available for initial errors.
      }
    };

    const interval = window.setInterval(refreshSilently, 60_000);
    const boundaryTimers = [];
    const boundaries = [];

    if (data?.state === 'live' && data.checked_in_at) {
      boundaries.push(new Date(data.checked_in_at).getTime() + 3 * 60 * 60 * 1000);
    }
    if (data?.expires_at) boundaries.push(new Date(data.expires_at).getTime());

    boundaries.forEach(timestamp => {
      if (!Number.isFinite(timestamp)) return;
      const delay = Math.max(0, timestamp - Date.now() + 100);
      boundaryTimers.push(window.setTimeout(refreshSilently, Math.min(delay, 2_147_483_647)));
    });

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      boundaryTimers.forEach(timer => window.clearTimeout(timer));
    };
  }, [
    token,
    invalid,
    audienceKey,
    resolvedFor,
    error,
    data?.state,
    data?.checked_in_at,
    data?.expires_at,
  ]);

  return { data, loading, error, retry, resolvedFor };
}
