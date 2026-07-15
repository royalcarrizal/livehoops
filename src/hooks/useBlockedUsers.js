// src/hooks/useBlockedUsers.js
//
// Manages the logged-in user's blocked-accounts list. Mirrors
// useCourtFavorites.js's shape: a Set for O(1) "is this person blocked?"
// checks, plus the full list (with profile info) for the Settings management
// screen.
//
// Blocking goes through the livehoops_block_user RPC (supabase/block_users.sql)
// because it has side effects — ending any existing friendship — beyond the
// plain insert. Unblocking is a plain delete under the table's own RLS, same
// as toggling a court favorite.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useBlockedUsers(userId) {
  // Fast membership check — e.g. "is post.userId blocked?"
  const [blockedIds, setBlockedIds] = useState(new Set());
  // Full list with profile info, for the Settings → Blocked Accounts sheet
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBlockedIds(new Set());
      setBlockedUsers([]);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from('blocked_users')
      .select('blocked_id, created_at, profiles:blocked_id (id, username, avatar_url)')
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      // Table/RLS not applied yet, or a transient failure — degrade to
      // "nobody blocked" rather than breaking the app.
      console.info('[LiveHoops] Blocked list unavailable:', error.message);
      setLoading(false);
      return;
    }

    const rows = data ?? [];
    setBlockedIds(new Set(rows.map(r => r.blocked_id)));
    setBlockedUsers(rows.map(r => ({
      userId:    r.blocked_id,
      username:  r.profiles?.username ?? 'Player',
      avatarUrl: r.profiles?.avatar_url ?? null,
      initials:  (r.profiles?.username ?? 'PL').slice(0, 2).toUpperCase(),
    })));
    setLoading(false);
  }, [userId]);

  useEffect(() => { refresh(); }, [refresh]);

  // ── Block ────────────────────────────────────────────────────────────────
  // Goes through the RPC (not a plain insert) so the "end any friendship"
  // side effect happens atomically with the block itself.
  const blockUser = useCallback(async (targetId) => {
    if (!userId || !targetId) return;
    const { error } = await supabase.rpc('livehoops_block_user', { p_target: targetId });
    if (error) {
      console.error('[LiveHoops] blockUser failed:', error.message);
      throw error;
    }
    // Optimistic local update so the UI reflects the block immediately,
    // without waiting for a full refetch.
    setBlockedIds(prev => new Set(prev).add(targetId));
    refresh();
  }, [userId, refresh]);

  // ── Unblock ──────────────────────────────────────────────────────────────
  const unblockUser = useCallback(async (targetId) => {
    if (!userId || !targetId) return;
    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', userId)
      .eq('blocked_id', targetId);
    if (error) {
      console.error('[LiveHoops] unblockUser failed:', error.message);
      throw error;
    }
    setBlockedIds(prev => {
      const next = new Set(prev);
      next.delete(targetId);
      return next;
    });
    setBlockedUsers(prev => prev.filter(u => u.userId !== targetId));
  }, [userId]);

  return { blockedIds, blockedUsers, loading, blockUser, unblockUser };
}
