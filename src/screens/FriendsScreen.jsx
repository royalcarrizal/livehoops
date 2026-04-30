// src/screens/FriendsScreen.jsx
//
// Shows the logged-in user's friends, incoming friend requests,
// and lets them search for new players to add.
//
// All data now comes from Supabase via the useFriends hook — no mock data.

import { useState, useEffect } from 'react';
import { UserPlus, X } from 'lucide-react';
import { useFriends } from '../hooks/useFriends';
import { useDirectMessages } from '../hooks/useDirectMessages';
import FriendCard from '../components/FriendCard';
import DMThread from '../components/DMThread';
import Avatar from '../components/Avatar';

// Props:
//   user         — the logged-in Supabase user object (has .id)
//   profile      — the logged-in user's profile row (username, avatar_url)
//   onUnreadDMs  — called with the current unread DM count so App can badge BottomNav
export default function FriendsScreen({ user, profile, onViewProfile, onUnreadDMs }) {
  // ── Real friendship data from Supabase ───────────────────────────────────
  const {
    friends,
    pendingRequests,
    sentRequests,
    loading,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
  } = useFriends(user?.id);

  // ── Direct messaging ─────────────────────────────────────────────────────
  // dmFriend — the friend whose thread is currently open (null = closed)
  const [dmFriend,    setDmFriend]    = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const { fetchUnreadCount, subscribeToMessages } = useDirectMessages();

  // Fetch unread count on mount and propagate to App for BottomNav badge
  useEffect(() => {
    if (!user?.id) return;
    fetchUnreadCount(user.id).then(count => {
      setUnreadCount(count);
      onUnreadDMs?.(count);
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time: bump unread count when a new message arrives while thread is closed
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToMessages(user.id, (newMsg) => {
      // Only increment if the thread for this sender isn't open
      if (!dmFriend || newMsg.senderId !== dmFriend.userId) {
        setUnreadCount(n => {
          const next = n + 1;
          onUnreadDMs?.(next);
          return next;
        });
      }
    });
    return unsubscribe;
  }, [user?.id, dmFriend]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search modal state ───────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);

  // Tracks the request status per user so the button updates instantly
  // after you tap "Add" without needing to re-fetch from Supabase.
  // Shape: { [userId]: 'pending' | 'accepted' | 'none' }
  const [localStatuses, setLocalStatuses] = useState({});

  // ── Build request status lookup ──────────────────────────────────────────
  // Merges Supabase data with any local changes made during this session.
  // We compute this fresh whenever sentRequests or friends changes.
  const getStatus = (resultUserId) => {
    // Check if we added this person as a friend during this session
    if (localStatuses[resultUserId]) return localStatuses[resultUserId];
    // Check Supabase data: already friends?
    if (friends.some(f => f.userId === resultUserId)) return 'accepted';
    // Already sent a request?
    if (sentRequests.includes(resultUserId)) return 'pending';
    return 'none';
  };

  // ── 300ms debounced search ───────────────────────────────────────────────
  // We wait 300ms after the user stops typing before hitting Supabase.
  // This avoids sending a request for every single keystroke.
  //
  // We call searchUsers directly from the hook via a lazy import approach:
  // we need access to useFriends's searchUsers fn. Get it by calling the
  // hook again — hooks are cheap and React deduplicates them.
  // Actually useFriends is already called above — we need to expose searchUsers.
  // Let's re-export it from the same hook call.
  // NOTE: We call the hook once and get searchUsers from it (see line above).

  // ── Close and reset the modal ────────────────────────────────────────────
  const handleCloseModal = () => {
    setShowModal(false);
  };

  return (
    <div className="screen-content">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="screen-header">
        <div className="header-row">
          <h1 className="app-title">Live<span>Hoops</span></h1>
          {/* UserPlus button opens the Add Friend search modal */}
          <button className="icon-btn" onClick={() => setShowModal(true)}>
            <UserPlus size={18} strokeWidth={2} />
          </button>
        </div>
        {/* Shows how many accepted friends the user has + unread DM count */}
        <div className="crew-summary">
          <div className="crew-summary-dot" />
          <span className="crew-summary-text">
            {friends.length} {friends.length === 1 ? 'player' : 'players'} in your crew
          </span>
          {unreadCount > 0 && (
            <span className="crew-unread-badge">
              {unreadCount > 9 ? '9+' : unreadCount} new {unreadCount === 1 ? 'message' : 'messages'}
            </span>
          )}
        </div>
      </div>

      {/* ── Loading state ───────────────────────────────────────────────────── */}
      {loading && (
        <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
          Loading your crew...
        </div>
      )}

      {/* ── Pending (incoming) friend requests ─────────────────────────────── */}
      {/* Hide this entire section if there are no pending requests */}
      {!loading && pendingRequests.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Requests</span>
            <span className="section-count">{pendingRequests.length}</span>
          </div>
          <div style={{ margin: '0 20px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingRequests.map((req) => (
              <div key={req.friendshipId} className="friend-request-card">
                <Avatar
                  avatarUrl={req.avatarUrl}
                  initials={req.initials}
                  size="medium"
                />
                <div className="friend-request-info">
                  {/* username is the real value from the profiles table */}
                  <div className="friend-name">{req.username}</div>
                  <div className="friend-location">Wants to join your crew</div>
                </div>
                <div className="friend-request-actions">
                  {/* Accept: updates the friendship row to 'accepted' in Supabase */}
                  <button
                    className="btn-accept"
                    onClick={() => acceptFriendRequest(req.friendshipId)}
                  >
                    Accept
                  </button>
                  {/* Decline: updates the friendship row to 'declined' in Supabase */}
                  <button
                    className="btn-decline"
                    onClick={() => declineFriendRequest(req.friendshipId)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Friends list ────────────────────────────────────────────────────── */}
      {!loading && (
        <>
          <div className="section-header" style={{ marginTop: 8 }}>
            <span className="section-title">Your Friends</span>
            {friends.length > 0 && (
              <span className="section-count">{friends.length}</span>
            )}
          </div>

          {/* Empty state when the user has no friends yet */}
          {friends.length === 0 ? (
            <div style={{
              margin: '0 20px 24px',
              padding: '24px 16px',
              background: 'var(--bg-card)',
              borderRadius: 14,
              border: '1px solid var(--separator-strong)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏀</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                No friends yet — search for players to connect with
              </div>
              <button
                className="auth-submit-btn"
                style={{ marginTop: 16, fontSize: 14 }}
                onClick={() => setShowModal(true)}
              >
                Find Players
              </button>
            </div>
          ) : (
            <div style={{ margin: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {friends.map((friend) => (
                // FriendCard expects the old mock data shape, so we normalize here.
                // Fields like isActive, checkinCount etc. will be real once we build
                // that part of the database — for now they default to 0/false.
                <FriendCard
                  key={friend.userId}
                  friend={{
                    userId:        friend.userId,
                    avatarUrl:     friend.avatarUrl,
                    initials:      friend.initials,
                    name:          friend.username,
                    isActive:      friend.isActive,
                    currentCourt:  friend.currentCourt,
                    location:      'LiveHoops player',
                    checkinCount:  friend.checkinCount,
                    courtsVisited: friend.coursesVisited,
                    hoursOnCourt:  friend.hoursOnCourt,
                  }}
                  onViewProfile={onViewProfile}
                  onMessage={(f) => setDmFriend(f)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <div style={{ height: 24 }} />

      {/* ── DM Thread ────────────────────────────────────────────────────────── */}
      {/* Slides up when the user taps "Message" on a FriendCard */}
      {dmFriend && (
        <DMThread
          friend={dmFriend}
          currentUser={{
            id:        user?.id,
            username:  profile?.username ?? 'Player',
            avatarUrl: profile?.avatar_url ?? null,
          }}
          onClose={() => {
            setDmFriend(null);
            // Refresh unread count after closing a thread
            fetchUnreadCount(user?.id).then(count => {
              setUnreadCount(count);
              onUnreadDMs?.(count);
            });
          }}
        />
      )}

      {/* ── Add Friend Modal ─────────────────────────────────────────────────── */}
      {showModal && (
        <SearchModal
          userId={user?.id}
          onClose={handleCloseModal}
          getStatus={getStatus}
          onSend={async (targetId) => {
            // Optimistically mark as pending so the button changes right away
            setLocalStatuses(prev => ({ ...prev, [targetId]: 'pending' }));
            await sendFriendRequest(targetId);
          }}
        />
      )}
    </div>
  );
}

// ── Search Modal ──────────────────────────────────────────────────────────────
// Separated into its own component so it can have its own state without
// interfering with the main FriendsScreen state.
//
// Props:
//   userId    — the logged-in user's ID (so we can exclude them from results)
//   onClose   — called when the user dismisses the modal
//   getStatus — function that returns 'pending' | 'accepted' | 'none' for a user ID
//   onSend    — called when the user taps "Add" on a search result
function SearchModal({ userId, onClose, getStatus, onSend }) {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState([]);
  const [searching, setSearching]   = useState(false);

  // We call useFriends here just to access searchUsers.
  // The hook is already called in the parent, but React deduplicates state —
  // this second call just gives us access to the searchUsers function.
  const { searchUsers } = useFriends(userId);

  // ── 300ms debounce: wait until the user stops typing before searching ───
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setSearching(true);

    // Set up a timer — if the user types again before 300ms, we cancel this
    const timer = setTimeout(async () => {
      const found = await searchUsers(query);
      setResults(found);
      setSearching(false);
    }, 300);

    // Cancel the previous timer whenever query changes
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-overlay" onClick={onClose}>
      {/* stopPropagation prevents tapping inside the modal from closing it */}
      <div className="add-friend-modal" onClick={e => e.stopPropagation()}>

        {/* Modal header */}
        <div className="modal-header">
          <span className="modal-title">Add Friend</span>
          <button className="modal-close" onClick={onClose}>
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <p className="modal-subtitle">
          Search for players by username to send a friend request.
        </p>

        {/* Search input — typing triggers the debounced search above */}
        <input
          className="modal-input"
          placeholder="Search username..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />

        {/* Loading indicator */}
        {searching && (
          <div className="modal-search-loading">Searching...</div>
        )}

        {/* Empty results message */}
        {!searching && query.trim() && results.length === 0 && (
          <div className="modal-search-empty">No players found for "{query}"</div>
        )}

        {/* Search results list */}
        {results.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {results.map(result => {
              const status = getStatus(result.id);

              return (
                <div key={result.id} className="search-result-row">
                  <Avatar
                    avatarUrl={result.avatarUrl}
                    initials={result.initials}
                    size="medium"
                  />
                  <div className="search-result-info">
                    <div className="search-result-username">{result.username}</div>
                  </div>

                  {/* Button changes based on relationship status */}
                  {status === 'accepted' && (
                    <button className="search-add-btn muted" disabled>
                      Friends
                    </button>
                  )}
                  {status === 'pending' && (
                    <button className="search-add-btn muted" disabled>
                      Pending
                    </button>
                  )}
                  {status === 'none' && (
                    <button
                      className="search-add-btn"
                      onClick={() => onSend(result.id)}
                    >
                      Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
