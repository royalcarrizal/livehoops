// src/hooks/useFriends.js
//
// This hook manages everything to do with friendships in LiveHoops.
// It talks to the Supabase 'friendships' and 'profiles' tables.
//
// A "friendship" in the database has:
//   - requester_id: the user who sent the request
//   - addressee_id: the user who received the request
//   - status: 'pending', 'accepted', or 'declined'
//
// This hook returns:
//   friends          — array of accepted friends with their profile info
//   pendingRequests  — incoming friend requests waiting for you to accept/decline
//   sentRequests     — IDs of users you sent requests to (so we know to show "Pending")
//   loading          — true while the initial data is loading
//   sendFriendRequest(addresseeId)       — send a friend request to another user
//   acceptFriendRequest(friendshipId)    — accept an incoming request
//   declineFriendRequest(friendshipId)   — decline an incoming request
//   removeFriend(friendshipId)           — unfriend someone
//   searchUsers(searchTerm)              — search for users by username

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useFriends(userId) {
  // The list of accepted friends (each has friendshipId, userId, username, avatarUrl, initials)
  const [friends, setFriends] = useState([]);

  // Incoming friend requests that you haven't responded to yet
  const [pendingRequests, setPendingRequests] = useState([]);

  // IDs of users you've sent a request to but they haven't accepted yet
  // We store just the user IDs here so the search modal can show "Pending"
  const [sentRequests, setSentRequests] = useState([]);

  // True while we're fetching data from Supabase for the first time
  const [loading, setLoading] = useState(true);

  // ── Helper: build initials from a username ──────────────────────────────
  // Takes the first 2 characters of the username and makes them uppercase.
  // e.g. "marcus_w" → "MA"
  const toInitials = (username) =>
    (username ?? 'PL').slice(0, 2).toUpperCase();

  // ── Fetch accepted friends ──────────────────────────────────────────────
  // Step 1: Find all friendship rows where this user is involved AND status is 'accepted'
  // Step 2: Figure out which user is the OTHER person (not us)
  // Step 3: Fetch that other person's full profile + stats
  // Step 4: Look up which friends are currently checked in (active sessions)
  const fetchFriends = useCallback(async () => {
    if (!userId) return [];

    // Find all accepted friendships involving this user
    const { data: rows, error } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);

    if (error || !rows?.length) return [];

    // Work out which ID is the friend (the one that isn't us)
    const friendIds = rows.map(row =>
      row.requester_id === userId ? row.addressee_id : row.requester_id
    );

    // Map friendship row ID to the friend's user ID (so we can find it later)
    const friendshipMap = {};
    rows.forEach(row => {
      const friendId = row.requester_id === userId ? row.addressee_id : row.requester_id;
      friendshipMap[friendId] = row.id;
    });

    // Fetch full profiles (with stats) and active check-ins in parallel for speed.
    // Active check-ins use an RPC because the checkins RLS policy blocks direct reads
    // of other users' rows — the SECURITY DEFINER function bypasses that safely.
    const [profilesRes, checkinsRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username, avatar_url, checkin_count, hours_played, courts_visited')
        .in('id', friendIds),
      supabase.rpc('get_friends_active_checkins', { p_friend_ids: friendIds }),
    ]);

    if (profilesRes.error) return [];

    // Build a lookup of active check-ins keyed by user ID
    const activeMap = {};
    if (checkinsRes.error) {
      console.error('fetchFriends: checkins query failed, online status unavailable:', checkinsRes.error);
    } else {
      (checkinsRes.data ?? []).forEach(c => {
        activeMap[c.user_id] = {
          courtId:   c.court_id,
          courtName: c.court_name ?? null,
        };
      });
    }

    // Combine friendship + profile + check-in status into one clean object
    return (profilesRes.data ?? []).map(prof => {
      const active = activeMap[prof.id];
      return {
        friendshipId:   friendshipMap[prof.id],
        userId:         prof.id,
        username:       prof.username ?? 'Player',
        avatarUrl:      prof.avatar_url ?? null,
        initials:       toInitials(prof.username),
        // Real stats from profiles table — no more hardcoded zeros
        checkinCount:   prof.checkin_count   ?? 0,
        courtsVisited:  prof.courts_visited  ?? 0,
        hoursOnCourt:   prof.hours_played    ?? 0,
        // Real "playing now" status from checkins table
        isActive:       !!active,
        currentCourt:   active?.courtName ?? '',
        currentCourtId: active?.courtId   ?? null,
      };
    });
  }, [userId]);

  // ── Fetch incoming pending requests ────────────────────────────────────
  // These are requests where YOU are the addressee (someone sent YOU a request)
  // and they're still 'pending' (you haven't accepted or declined yet)
  const fetchPendingRequests = useCallback(async () => {
    if (!userId) return [];

    const { data: rows, error } = await supabase
      .from('friendships')
      .select('id, requester_id')
      .eq('addressee_id', userId)
      .eq('status', 'pending');

    if (error || !rows?.length) return [];

    // Get the profiles of everyone who sent us a request
    const requesterIds = rows.map(r => r.requester_id);

    const { data: profiles, error: profError } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', requesterIds);

    if (profError) return [];

    // Build a lookup so we can match profiles to their friendship rows
    const profileMap = {};
    (profiles ?? []).forEach(p => { profileMap[p.id] = p; });

    return rows.map(row => {
      const prof = profileMap[row.requester_id] ?? {};
      return {
        friendshipId: row.id,
        userId:       row.requester_id,
        username:     prof.username ?? 'Player',
        avatarUrl:    prof.avatar_url ?? null,
        initials:     toInitials(prof.username),
      };
    });
  }, [userId]);

  // ── Fetch sent pending requests ─────────────────────────────────────────
  // These are requests WE sent that the other person hasn't responded to.
  // We only need the addressee IDs to know who we already requested.
  const fetchSentRequests = useCallback(async () => {
    if (!userId) return [];

    const { data: rows, error } = await supabase
      .from('friendships')
      .select('addressee_id')
      .eq('requester_id', userId)
      .eq('status', 'pending');

    if (error) return [];

    // Just return the array of user IDs we sent requests to
    return (rows ?? []).map(r => r.addressee_id);
  }, [userId]);

  // ── Load all friendship data ────────────────────────────────────────────
  // Runs when the component mounts and whenever userId changes (e.g. after login)
  const loadAll = useCallback(async () => {
    if (!userId) {
      setFriends([]);
      setPendingRequests([]);
      setSentRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    // Run all three fetches at the same time for speed
    const [friendsList, pending, sent] = await Promise.all([
      fetchFriends(),
      fetchPendingRequests(),
      fetchSentRequests(),
    ]);
    setFriends(friendsList);
    setPendingRequests(pending);
    setSentRequests(sent);
    setLoading(false);
  }, [userId, fetchFriends, fetchPendingRequests, fetchSentRequests]);

  // Re-load whenever the logged-in user changes
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Send a friend request ───────────────────────────────────────────────
  // Before inserting, we check if a friendship already exists between these
  // two users (in either direction) to avoid duplicates.
  const sendFriendRequest = useCallback(async (addresseeId) => {
    if (!userId || !addresseeId) return;

    // Check for any existing friendship row between these two users
    const { data: existing } = await supabase
      .from('friendships')
      .select('id')
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${addresseeId}),` +
        `and(requester_id.eq.${addresseeId},addressee_id.eq.${userId})`
      )
      .limit(1);

    // Don't send a second request if one already exists
    if (existing?.length) return;

    // Insert the new friendship row
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: userId, addressee_id: addresseeId, status: 'pending' });

    if (!error) {
      // Update sentRequests locally so the UI updates immediately
      setSentRequests(prev => [...prev, addresseeId]);
    }
  }, [userId]);

  // ── Accept an incoming friend request ──────────────────────────────────
  // Updates the row status to 'accepted', then re-fetches everything so
  // the new friend appears in the friends list right away.
  const acceptFriendRequest = useCallback(async (friendshipId) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);

    if (!error) {
      // Re-load all data so the accepted friend moves from pendingRequests → friends
      await loadAll();
    }
  }, [loadAll]);

  // ── Decline an incoming friend request ─────────────────────────────────
  // Sets status to 'declined' and removes the request from the local list.
  const declineFriendRequest = useCallback(async (friendshipId) => {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'declined' })
      .eq('id', friendshipId);

    if (!error) {
      // Remove from the pending list without a full re-fetch
      setPendingRequests(prev => prev.filter(r => r.friendshipId !== friendshipId));
    }
  }, []);

  // ── Remove a friend ─────────────────────────────────────────────────────
  // Deletes the friendship row entirely. Both users lose the connection.
  const removeFriend = useCallback(async (friendshipId) => {
    const { error } = await supabase
      .from('friendships')
      .delete()
      .eq('id', friendshipId);

    if (!error) {
      // Remove from the local friends list immediately
      setFriends(prev => prev.filter(f => f.friendshipId !== friendshipId));
    }
  }, []);

  // ── Search for users by username ────────────────────────────────────────
  // Used in the "Add Friend" modal. Returns up to 10 matching profiles,
  // excluding the current user so you can't add yourself.
  const searchUsers = useCallback(async (searchTerm) => {
    if (!searchTerm?.trim()) return [];

    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      // ilike is case-insensitive "LIKE" — % means "any characters"
      .ilike('username', `%${searchTerm.trim()}%`)
      // Don't show the current user in their own search results
      .neq('id', userId)
      .limit(10);

    if (error) return [];

    return (data ?? []).map(prof => ({
      id:        prof.id,
      username:  prof.username ?? 'Player',
      avatarUrl: prof.avatar_url ?? null,
      initials:  toInitials(prof.username),
    }));
  }, [userId]);

  return {
    friends,
    pendingRequests,
    sentRequests,
    loading,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    removeFriend,
    searchUsers,
  };
}
