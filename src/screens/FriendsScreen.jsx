// src/screens/FriendsScreen.jsx
//
// Shows two views toggled by a "Friends | Messages" tab row:
//
//   Friends  — accepted friends list + incoming friend requests
//   Messages — DM inbox: all conversations sorted by most recent,
//              with per-thread last-message preview and unread badge
//
// All data comes from Supabase via useFriends and useDirectMessages.

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, X } from 'lucide-react';
import { useFriends } from '../hooks/useFriends';
import { useDirectMessages } from '../hooks/useDirectMessages';
import FriendCard from '../components/FriendCard';
import DMThread from '../components/DMThread';
import Avatar from '../components/Avatar';

// Props:
//   user         — logged-in Supabase user object (.id)
//   profile      — logged-in user's profile row (username, avatar_url)
//   onViewProfile — navigate to another user's profile
//   onUnreadDMs  — called with total unread count so App can badge BottomNav
export default function FriendsScreen({ user, profile, onViewProfile, onUnreadDMs }) {
  // ── Friends data ─────────────────────────────────────────────────────────
  const {
    friends,
    pendingRequests,
    sentRequests,
    loading,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
  } = useFriends(user?.id);

  // ── DM state ─────────────────────────────────────────────────────────────
  const [dmFriend,    setDmFriend]    = useState(null);   // thread currently open
  const [unreadCount, setUnreadCount] = useState(0);       // total unread (for header badge)
  const [threads,     setThreads]     = useState([]);      // inbox thread list
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxLoaded,  setInboxLoaded]  = useState(false); // lazy-load guard

  const { fetchUnreadCount, fetchInbox, subscribeToMessages } = useDirectMessages();

  // ── Which view is active ──────────────────────────────────────────────────
  const [activeView, setActiveView] = useState('friends'); // 'friends' | 'messages'

  // ── Load total unread count on mount ─────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    fetchUnreadCount(user.id).then(count => {
      setUnreadCount(count);
      onUnreadDMs?.(count);
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lazy-load inbox the first time Messages tab opens ────────────────────
  useEffect(() => {
    if (activeView !== 'messages' || inboxLoaded || !user?.id) return;
    setInboxLoading(true);
    fetchInbox(user.id).then(data => {
      setThreads(data);
      setInboxLoading(false);
      setInboxLoaded(true);
    });
  }, [activeView, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh inbox helper (called after receiving a new message) ───────────
  const refreshInbox = useCallback(() => {
    if (!user?.id) return;
    fetchInbox(user.id).then(setThreads);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time: bump unread count + refresh inbox preview ─────────────────
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = subscribeToMessages(user.id, (newMsg) => {
      // Only increment total badge if the thread for this sender isn't open
      if (!dmFriend || newMsg.senderId !== dmFriend.userId) {
        setUnreadCount(n => {
          const next = n + 1;
          onUnreadDMs?.(next);
          return next;
        });
      }
      // Refresh inbox list so last-message preview updates in real time
      if (inboxLoaded) refreshInbox();
    });
    return unsubscribe;
  }, [user?.id, dmFriend, inboxLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add Friend modal state ────────────────────────────────────────────────
  const [showModal,     setShowModal]     = useState(false);
  const [localStatuses, setLocalStatuses] = useState({});

  const getStatus = (resultUserId) => {
    if (localStatuses[resultUserId]) return localStatuses[resultUserId];
    if (friends.some(f => f.userId === resultUserId)) return 'accepted';
    if (sentRequests.includes(resultUserId)) return 'pending';
    return 'none';
  };

  // ── Open a DM thread (called from inbox row OR FriendCard "Message" btn) ──
  const openThread = (friend) => setDmFriend(friend);

  // ── Close thread and refresh counts ──────────────────────────────────────
  const closeThread = () => {
    setDmFriend(null);
    fetchUnreadCount(user?.id).then(count => {
      setUnreadCount(count);
      onUnreadDMs?.(count);
    });
    // Refresh inbox so unread dots clear for the thread we just read
    if (inboxLoaded) refreshInbox();
  };

  // ── Resolve friend info from partnerId ───────────────────────────────────
  // The threads from fetchInbox only have a partnerId — we look up the full
  // friend object from the friends array so we can display name + avatar.
  const getFriendByPartnerId = (partnerId) =>
    friends.find(f => f.userId === partnerId) ?? null;

  return (
    <div className="screen-content">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="screen-header">
        <div className="header-row">
          <h1 className="app-title">Live<span>Hoops</span></h1>
          <button className="icon-btn" onClick={() => setShowModal(true)} aria-label="Add friend">
            <UserPlus size={18} strokeWidth={2} />
          </button>
        </div>
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

      {/* ── Friends | Messages tab toggle ──────────────────────────────────── */}
      <div className="feed-tab-row">
        <button
          className={`feed-tab-btn${activeView === 'friends' ? ' active' : ''}`}
          onClick={() => setActiveView('friends')}
        >
          Friends
        </button>
        <button
          className={`feed-tab-btn${activeView === 'messages' ? ' active' : ''}`}
          onClick={() => setActiveView('messages')}
        >
          Messages
          {unreadCount > 0 && (
            <span className="tab-unread-pill">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* FRIENDS VIEW                                                        */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeView === 'friends' && (
        <>
          {/* Loading */}
          {loading && (
            <div style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
              Loading your crew...
            </div>
          )}

          {/* Pending friend requests */}
          {!loading && pendingRequests.length > 0 && (
            <>
              <div className="section-header">
                <span className="section-title">Requests</span>
                <span className="section-count">{pendingRequests.length}</span>
              </div>
              <div style={{ margin: '0 20px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {pendingRequests.map((req) => (
                  <div key={req.friendshipId} className="friend-request-card">
                    <Avatar avatarUrl={req.avatarUrl} initials={req.initials} size="medium" />
                    <div className="friend-request-info">
                      <div className="friend-name">{req.username}</div>
                      <div className="friend-location">Wants to join your crew</div>
                    </div>
                    <div className="friend-request-actions">
                      <button className="btn-accept" onClick={() => acceptFriendRequest(req.friendshipId)}>
                        Accept
                      </button>
                      <button className="btn-decline" onClick={() => declineFriendRequest(req.friendshipId)}>
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Friends list */}
          {!loading && (
            <>
              <div className="section-header" style={{ marginTop: 8 }}>
                <span className="section-title">Your Friends</span>
                {friends.length > 0 && <span className="section-count">{friends.length}</span>}
              </div>

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
                      onMessage={(f) => openThread(f)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* MESSAGES VIEW — inbox thread list                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeView === 'messages' && (
        <div style={{ padding: '8px 20px' }}>

          {inboxLoading && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14, padding: '32px 0' }}>
              Loading conversations…
            </div>
          )}

          {!inboxLoading && threads.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '48px 20px',
              background: 'var(--bg-card)',
              borderRadius: 14,
              border: '1px solid var(--separator-strong)',
              marginTop: 8,
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                No conversations yet
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Message a friend to get started
              </div>
              <button
                className="auth-submit-btn"
                style={{ marginTop: 16, fontSize: 14 }}
                onClick={() => setActiveView('friends')}
              >
                Go to Friends
              </button>
            </div>
          )}

          {!inboxLoading && threads.map(thread => {
            const friend = getFriendByPartnerId(thread.partnerId);
            // If the friend isn't in our list (edge case), skip the row
            if (!friend) return null;

            // Truncate preview to 42 chars
            const rawPreview = thread.isMine
              ? `You: ${thread.lastMessage}`
              : thread.lastMessage;
            const preview = rawPreview.length > 42
              ? rawPreview.slice(0, 42) + '…'
              : rawPreview;

            return (
              <button
                key={thread.partnerId}
                className="dm-thread-row"
                onClick={() => openThread({
                  userId:    friend.userId,
                  username:  friend.username,
                  name:      friend.username,
                  avatarUrl: friend.avatarUrl,
                  initials:  friend.initials,
                })}
              >
                {/* Avatar with unread dot overlay */}
                <div className="dm-thread-avatar-wrap">
                  <Avatar avatarUrl={friend.avatarUrl} initials={friend.initials} size="medium" />
                  {thread.unreadCount > 0 && <span className="dm-thread-unread-dot" />}
                </div>

                {/* Name + preview */}
                <div className="dm-thread-body">
                  <div className="dm-thread-name">{friend.username}</div>
                  <div className={`dm-thread-preview${thread.unreadCount > 0 ? ' unread' : ''}`}>
                    {preview}
                  </div>
                </div>

                {/* Time + unread count badge */}
                <div className="dm-thread-meta">
                  <span className="dm-thread-time">{thread.lastTimeAgo}</span>
                  {thread.unreadCount > 0 && (
                    <span className="dm-thread-count">
                      {thread.unreadCount > 9 ? '9+' : thread.unreadCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ height: 24 }} />

      {/* ── DM Thread overlay ─────────────────────────────────────────────── */}
      {dmFriend && (
        <DMThread
          friend={dmFriend}
          currentUser={{
            id:        user?.id,
            username:  profile?.username ?? 'Player',
            avatarUrl: profile?.avatar_url ?? null,
          }}
          onClose={closeThread}
        />
      )}

      {/* ── Add Friend modal ──────────────────────────────────────────────── */}
      {showModal && (
        <SearchModal
          userId={user?.id}
          onClose={() => setShowModal(false)}
          getStatus={getStatus}
          onSend={async (targetId) => {
            setLocalStatuses(prev => ({ ...prev, [targetId]: 'pending' }));
            await sendFriendRequest(targetId);
          }}
        />
      )}
    </div>
  );
}

// ── Search Modal ──────────────────────────────────────────────────────────────
function SearchModal({ userId, onClose, getStatus, onSend }) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);

  const { searchUsers } = useFriends(userId);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchUsers(query);
      setResults(found);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="add-friend-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add Friend</span>
          <button className="modal-close" onClick={onClose}><X size={18} strokeWidth={2} /></button>
        </div>
        <p className="modal-subtitle">Search for players by username to send a friend request.</p>
        <input
          className="modal-input"
          placeholder="Search username..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        {searching && <div className="modal-search-loading">Searching...</div>}
        {!searching && query.trim() && results.length === 0 && (
          <div className="modal-search-empty">No players found for "{query}"</div>
        )}
        {results.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {results.map(result => {
              const status = getStatus(result.id);
              return (
                <div key={result.id} className="search-result-row">
                  <Avatar avatarUrl={result.avatarUrl} initials={result.initials} size="medium" />
                  <div className="search-result-info">
                    <div className="search-result-username">{result.username}</div>
                  </div>
                  {status === 'accepted' && <button className="search-add-btn muted" disabled>Friends</button>}
                  {status === 'pending'  && <button className="search-add-btn muted" disabled>Pending</button>}
                  {status === 'none'     && (
                    <button className="search-add-btn" onClick={() => onSend(result.id)}>Add</button>
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
