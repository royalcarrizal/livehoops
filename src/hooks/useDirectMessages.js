// src/hooks/useDirectMessages.js
//
// Manages direct messages between two users.
// Talks to the Supabase 'direct_messages' table.
//
// Returns:
//   messages           — array of message objects for the open conversation
//   loading            — true while fetching from Supabase
//   fetchConversation  — loads messages between two users (newest at bottom)
//   sendMessage        — inserts a new message with optimistic update
//   markRead           — marks received messages as read (clears unread badge)
//   fetchUnreadCount   — total unread messages for the logged-in user
//   subscribeToMessages — real-time listener for incoming messages

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Helper: convert ISO timestamp to relative time string ─────────────────
function toTimeAgo(isoString) {
  if (!isoString) return '';
  const diff    = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(diff / 3_600_000);
  const days    = Math.floor(diff / 86_400_000);
  if (minutes < 1)  return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours   < 24) return `${hours}h ago`;
  if (days    <  7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Helper: shape a raw Supabase row into the format DMThread expects ──────
function normMessage(row) {
  return {
    id:          row.id,
    senderId:    row.sender_id,
    recipientId: row.recipient_id,
    content:     row.content,
    timeAgo:     toTimeAgo(row.created_at),
    createdAt:   row.created_at,
    isRead:      !!row.read_at,
  };
}

export function useDirectMessages() {
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(false);

  // ── Fetch conversation between two users ──────────────────────────────────
  // Loads the last 50 messages between userId and friendId, oldest first
  // so they render naturally top-to-bottom in the chat view.
  const fetchConversation = useCallback(async (userId, friendId) => {
    if (!userId || !friendId) return;
    setLoading(true);

    // RLS already restricts to messages where auth.uid() is sender or recipient.
    // We additionally filter to rows where the friend is also involved —
    // the intersection gives us exactly this two-person conversation.
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .or(`sender_id.eq.${friendId},recipient_id.eq.${friendId}`)
      .order('created_at', { ascending: true })
      .limit(50);

    if (error) {
      console.error('fetchConversation error:', error);
      setLoading(false);
      return;
    }

    setMessages((data ?? []).map(normMessage));
    setLoading(false);
  }, []);

  // ── Send a message ────────────────────────────────────────────────────────
  // Immediately appends an optimistic message so the UI feels instant,
  // then replaces it with the real row once Supabase confirms.
  const sendMessage = useCallback(async (senderId, recipientId, content) => {
    if (!senderId || !recipientId || !content?.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      id:          tempId,
      senderId,
      recipientId,
      content:     content.trim(),
      timeAgo:     'Just now',
      createdAt:   new Date().toISOString(),
      isRead:      false,
    };

    // Show message immediately
    setMessages(prev => [...prev, optimistic]);

    const { data, error } = await supabase
      .from('direct_messages')
      .insert({ sender_id: senderId, recipient_id: recipientId, content: content.trim() })
      .select()
      .single();

    if (error) {
      console.error('sendMessage error:', error);
      // Remove the optimistic message so the user knows it failed
      setMessages(prev => prev.filter(m => m.id !== tempId));
      throw error;
    }

    // Swap the optimistic placeholder with the real row
    const real = normMessage(data);
    setMessages(prev => prev.map(m => m.id === tempId ? real : m));
    return real;
  }, []);

  // ── Mark messages as read ─────────────────────────────────────────────────
  // Sets read_at on all unread messages sent by friendId to userId.
  // Called when the user opens a conversation thread.
  const markRead = useCallback(async (userId, friendId) => {
    if (!userId || !friendId) return;
    await supabase
      .from('direct_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', userId)
      .eq('sender_id', friendId)
      .is('read_at', null);
  }, []);

  // ── Fetch total unread count ──────────────────────────────────────────────
  // Returns the number of unread messages across ALL conversations.
  // Used to drive the badge on the Friends tab in BottomNav.
  const fetchUnreadCount = useCallback(async (userId) => {
    if (!userId) return 0;

    const { count, error } = await supabase
      .from('direct_messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .is('read_at', null);

    if (error) {
      console.error('fetchUnreadCount error:', error);
      return 0;
    }

    return count ?? 0;
  }, []);

  // ── Subscribe to incoming messages in real time ───────────────────────────
  // Opens a Supabase Realtime channel that fires on every INSERT to
  // direct_messages where the current user is the recipient.
  // Calls onNewMessage(msg) — the caller decides what to do (e.g. append
  // to conversation, increment unread count).
  //
  // Returns a cleanup function to close the channel on unmount.
  const subscribeToMessages = useCallback((userId, onNewMessage, channelSuffix = 'inbox') => {
    if (!userId) return () => {};

    const channel = supabase
      .channel(`direct-messages-${channelSuffix}-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages' },
        (payload) => {
          // Only notify when this user is involved (sender or recipient)
          const { sender_id, recipient_id } = payload.new;
          if (sender_id === userId || recipient_id === userId) {
            onNewMessage(normMessage(payload.new));
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return {
    messages,
    loading,
    fetchConversation,
    sendMessage,
    markRead,
    fetchUnreadCount,
    subscribeToMessages,
  };
}
