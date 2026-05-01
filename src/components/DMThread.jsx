// src/components/DMThread.jsx
//
// Full-screen slide-up chat thread between the logged-in user and one friend.
// Opens when the user taps "Message" on a FriendCard.
//
// Props:
//   friend      — friend object from useFriends { userId, username, avatarUrl, initials }
//   currentUser — { id, username, avatarUrl }
//   onClose     — called when the user taps the back button

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Send } from 'lucide-react';
import Avatar from './Avatar';
import { useDirectMessages } from '../hooks/useDirectMessages';

export default function DMThread({ friend, currentUser, onClose }) {
  const [text,          setText]          = useState('');
  const [isSending,     setIsSending]     = useState(false);
  const [bottomOffset,  setBottomOffset]  = useState(0);
  const bottomRef = useRef(null);
  const threadRef = useRef(null);

  const {
    messages,
    loading,
    fetchConversation,
    sendMessage,
    markRead,
    subscribeToMessages,
  } = useDirectMessages();

  // ── Load conversation and mark existing messages as read on open ──────────
  useEffect(() => {
    fetchConversation(currentUser.id, friend.userId);
    markRead(currentUser.id, friend.userId);
  }, [currentUser.id, friend.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time: append incoming messages from this friend ──────────────────
  useEffect(() => {
    const unsubscribe = subscribeToMessages(currentUser.id, (newMsg) => {
      // Only add messages from this specific friend (my own sends are already optimistic)
      if (newMsg.senderId === friend.userId) {
        fetchConversation(currentUser.id, friend.userId);
        // Mark as read immediately since the thread is open
        markRead(currentUser.id, friend.userId);
      }
    }, 'thread');
    return unsubscribe;
  }, [currentUser.id, friend.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll to the latest message whenever the list changes ───────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Lift the panel above the virtual keyboard on iOS Safari ──────────────
  // iOS doesn't resize fixed elements when the keyboard opens; it just overlays
  // them. The Visual Viewport API tells us exactly how much the keyboard covers.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onViewport = () => {
      const keyboardHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setBottomOffset(keyboardHeight);
    };
    vv.addEventListener('resize', onViewport);
    vv.addEventListener('scroll', onViewport);
    return () => {
      vv.removeEventListener('resize', onViewport);
      vv.removeEventListener('scroll', onViewport);
    };
  }, []);

  // ── Send handler ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    setText('');
    setIsSending(true);
    try {
      await sendMessage(currentUser.id, friend.userId, trimmed);
    } catch {
      // Restore text so the user doesn't lose their message
      setText(trimmed);
    } finally {
      setIsSending(false);
    }
  };

  // Allow Enter to send (Shift+Enter for newline)
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return createPortal(
    <div className="dm-overlay">
      <div
        ref={threadRef}
        className="dm-thread"
        style={bottomOffset > 0 ? { bottom: bottomOffset, height: `calc(92svh - ${bottomOffset}px)` } : undefined}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="dm-header">
          <button className="dm-back-btn" onClick={onClose} aria-label="Back">
            <ChevronLeft size={22} strokeWidth={2.5} />
          </button>
          <Avatar
            avatarUrl={friend.avatarUrl}
            initials={friend.initials}
            size="small"
          />
          <span className="dm-header-name">{friend.name}</span>
        </div>

        {/* ── Message list ─────────────────────────────────────────────────── */}
        <div className="dm-message-list">

          {loading && (
            <div className="dm-loading">Loading messages…</div>
          )}

          {!loading && messages.length === 0 && (
            <div className="dm-empty">
              <div style={{ fontSize: 40 }}>🏀</div>
              <div>Say something to {friend.name}!</div>
            </div>
          )}

          {messages.map(msg => {
            const isMine = msg.senderId === currentUser.id;
            return (
              <div
                key={msg.id}
                className={`dm-bubble-row ${isMine ? 'mine' : 'theirs'}`}
              >
                <div className={`dm-bubble ${isMine ? 'dm-bubble-mine' : 'dm-bubble-theirs'}`}>
                  <div className="dm-bubble-text">{msg.content}</div>
                  <div className="dm-bubble-time">{msg.timeAgo}</div>
                </div>
              </div>
            );
          })}

          {/* Invisible anchor scrolled into view when new messages arrive */}
          <div ref={bottomRef} />
        </div>

        {/* ── Input bar ────────────────────────────────────────────────────── */}
        <div className="dm-input-bar">
          <textarea
            className="dm-input"
            placeholder="Type a message…"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button
            className="dm-send-btn"
            onClick={handleSend}
            disabled={!text.trim() || isSending}
            aria-label="Send message"
          >
            <Send size={18} strokeWidth={2} />
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}
