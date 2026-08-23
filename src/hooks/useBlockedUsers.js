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

    // ── Step 1: the block rows themselves ─────────────────────────────────
    // Deliberately NOT a PostgREST embed. This used to read
    //   .select('blocked_id, created_at, profiles:blocked_id (…)')
    // which returned 400 on every load: blocked_users.blocked_id has a
    // foreign key to auth.users, not to public.profiles, and PostgREST can
    // only resolve an embed when an FK points at the embedded table.
    //
    // That failure was not cosmetic. The catch below returned early, so
    // blockedIds stayed empty on every page load — and blockedIds is what
    // every screen uses to filter blocked people out. Blocking appeared to
    // work only until you reloaded, because blockUser() updates the Set
    // optimistically. There is no server-side block filtering to fall back
    // on; this Set is the enforcement.
    //
    // usePosts.js hit the identical problem and solved it the same way —
    // see the note in supabase/posts_profiles_fk.sql.
    const { data: blocks, error } = await supabase
      .from('blocked_users')
      .select('blocked_id, created_at')
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      // Table/RLS genuinely missing, or a transient failure. Degrading to
      // "nobody blocked" is the wrong direction for a safety feature, so say
      // so loudly rather than filing it under console.info.
      console.error('[LiveHoops] Blocked list failed to load — blocking is NOT being enforced this session:', error.message);
      setLoading(false);
      return;
    }

    const rows = blocks ?? [];

    // Set the ids first, before the profile lookup. The ids are what enforce
    // blocking; the usernames and avatars are only for the management sheet.
    // If step 2 fails, blocking still holds — it just shows "Player".
    setBlockedIds(new Set(rows.map(r => r.blocked_id)));

    if (rows.length === 0) {
      setBlockedUsers([]);
      setLoading(false);
      return;
    }

    // ── Step 2: the profiles behind those ids ─────────────────────────────
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', rows.map(r => r.blocked_id));

    if (profilesError) {
      console.error('[LiveHoops] Blocked profiles unavailable:', profilesError.message);
    }

    const byId = new Map((profiles ?? []).map(p => [p.id, p]));

    setBlockedUsers(rows.map(r => {
      const p = byId.get(r.blocked_id);
      return {
        userId:    r.blocked_id,
        username:  p?.username ?? 'Player',
        avatarUrl: p?.avatar_url ?? null,
        initials:  (p?.username ?? 'PL').slice(0, 2).toUpperCase(),
      };
    }));
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
