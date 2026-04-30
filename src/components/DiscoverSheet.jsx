// src/components/DiscoverSheet.jsx
//
// Full-screen player search / discovery sheet.
// Opens when the user taps the search icon in the HomeScreen header.
//
// Props:
//   userId        — logged-in user's Supabase UUID
//   onClose       — called when the user taps the back button
//   onViewProfile — called with a userId to navigate to that player's profile

import { useState, useEffect, useRef } from 'react';
import { ChevronLeft } from 'lucide-react';
import Avatar from './Avatar';
import { useFriends } from '../hooks/useFriends';

export default function DiscoverSheet({ userId, onClose, onViewProfile }) {
  const [query,        setQuery]        = useState('');
  const [results,      setResults]      = useState([]);
  const [searching,    setSearching]    = useState(false);
  // Tracks friend request status per user so the button updates instantly
  // without waiting for a re-fetch. Shape: { [userId]: 'pending' }
  const [localStatuses, setLocalStatuses] = useState({});
  const inputRef = useRef(null);

  const { searchUsers, sendFriendRequest, friends, sentRequests } = useFriends(userId);

  // Auto-focus the search input when the sheet opens
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  // ── 300ms debounced search ─────────────────────────────────────────────────
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    const timer = setTimeout(async () => {
      const found = await searchUsers(query);
      setResults(found ?? []);
      setSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resolve friend status for a result ────────────────────────────────────
  const getStatus = (resultUserId) => {
    if (localStatuses[resultUserId]) return localStatuses[resultUserId];
    if (friends.some(f => f.userId === resultUserId)) return 'accepted';
    if (sentRequests.includes(resultUserId)) return 'pending';
    return 'none';
  };

  // ── Send friend request ───────────────────────────────────────────────────
  const handleAdd = async (targetId) => {
    setLocalStatuses(prev => ({ ...prev, [targetId]: 'pending' }));
    await sendFriendRequest(targetId);
  };

  return (
    <div className="discover-overlay">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="discover-header">
        <button className="discover-back-btn" onClick={onClose} aria-label="Back">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </button>
        <input
          ref={inputRef}
          className="discover-input"
          placeholder="Search players by username…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {/* ── Results list ────────────────────────────────────────────────────── */}
      <div className="discover-list">

        {/* Empty state — no query typed yet */}
        {!query.trim() && (
          <div className="discover-empty">
            <div style={{ fontSize: 40 }}>🏀</div>
            <div>Search for players by username</div>
          </div>
        )}

        {/* Searching indicator */}
        {searching && (
          <div className="discover-empty">
            <div style={{ fontSize: 13 }}>Searching…</div>
          </div>
        )}

        {/* No results */}
        {!searching && query.trim() && results.length === 0 && (
          <div className="discover-empty">
            <div>No players found for "{query}"</div>
          </div>
        )}

        {/* Player results */}
        {!searching && results.map(result => {
          const status = getStatus(result.id);
          return (
            <div
              key={result.id}
              className="discover-player-row"
              onClick={() => { onViewProfile?.(result.id); onClose(); }}
            >
              <Avatar
                avatarUrl={result.avatarUrl}
                initials={result.initials}
                size="medium"
              />

              <div className="discover-player-info">
                <div className="discover-player-name">{result.username}</div>
                {status === 'accepted' && (
                  <div className="discover-player-status">Friends</div>
                )}
              </div>

              {/* Friend action button — stops propagation so row tap doesn't fire */}
              {status === 'accepted' && (
                <button className="search-add-btn muted" disabled onClick={e => e.stopPropagation()}>
                  Friends
                </button>
              )}
              {status === 'pending' && (
                <button className="search-add-btn muted" disabled onClick={e => e.stopPropagation()}>
                  Pending
                </button>
              )}
              {status === 'none' && (
                <button
                  className="search-add-btn"
                  onClick={e => { e.stopPropagation(); handleAdd(result.id); }}
                >
                  Add
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
