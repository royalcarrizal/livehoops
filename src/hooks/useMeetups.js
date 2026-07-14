// src/hooks/useMeetups.js
//
// Manages scheduled meetups ("runs") at courts. Talks to the meetups /
// meetup_rsvps tables and their RPCs (supabase/meetups.sql).
//
// Design mirrors useCourts.js: every read degrades gracefully — if an RPC
// isn't deployed yet it returns [] / null and logs quietly, so the app never
// breaks, it just shows no runs. Notifications mirror useCheckIn.js's
// notifyFriendsOfCheckIn (fire-and-forget friend fan-out).
//
// Returns:
//   upcomingMeetups  — array of visible upcoming runs (Home row)
//   meetupsByCourt   — { courtId: [run, …] } for map badges + court sheets
//   loading
//   createMeetup(courtId, scheduledAtISO, title, visibility)
//   joinMeetup(meetupId, anonymous)   / leaveMeetup(meetupId)
//   cancelMeetup(meetupId)            — host only
//   fetchAttendees(meetupId)          — masked attendee list
//   refreshMeetups()

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { sendPush } from '../lib/push';

// ── Notify friends that this user scheduled a run ───────────────────────────
// Clone of notifyFriendsOfCheckIn (useCheckIn.js): look up the host's name,
// fetch accepted friends, keep only those who opted into Run Alerts
// (notif_meetups), and push. Fire-and-forget — creating the run must succeed
// regardless. courtId + meetupId ride along for the deep link.
async function notifyFriendsOfMeetup(hostId, courtName, courtId, meetupId, scheduledLabel) {
  try {
    const { data: me } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', hostId)
      .single();

    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${hostId},addressee_id.eq.${hostId}`);

    const friendIds = (friendships ?? []).map(f =>
      f.requester_id === hostId ? f.addressee_id : f.requester_id
    );
    if (friendIds.length === 0) return;

    // Only friends who opted into "Run Alerts"
    const { data: recipients } = await supabase
      .from('profiles')
      .select('id')
      .in('id', friendIds)
      .eq('notif_meetups', true);

    const name = me?.username ?? 'A friend';
    (recipients ?? []).forEach(r => {
      sendPush(
        r.id,
        `${name} scheduled a run 🏀`,
        `${courtName ?? 'A court'} · ${scheduledLabel ?? 'soon'}`,
        // courtId + meetupId let a tap deep-link to the court on the map
        { kind: 'meetup_scheduled', courtId: courtId ?? '', meetupId: meetupId ?? '' },
      );
    });
  } catch (err) {
    console.info('[LiveHoops] notifyFriendsOfMeetup skipped:', err?.message ?? err);
  }
}

// Group the flat get_upcoming_meetups rows into { courtId: [meetup, …] },
// newest-scheduled first within each court (the rows already arrive sorted by
// scheduled_at asc, so the first per court is the soonest run).
function groupMeetupsByCourt(list) {
  const byCourt = {};
  list.forEach(m => {
    (byCourt[m.courtId] ??= []).push(m);
  });
  return byCourt;
}

// Shape a raw RPC row (snake_case) into the camelCase object the UI consumes.
function normMeetup(row) {
  const hostName = row.host_username ?? 'Player';
  return {
    id:            row.meetup_id,
    courtId:       row.court_id,
    courtName:     row.court_name ?? 'Court',
    hostId:        row.host_id,
    hostName,
    hostAvatarUrl: row.host_avatar_url ?? null,
    hostInitials:  hostName.slice(0, 2).toUpperCase(),
    title:         row.title ?? null,
    scheduledAt:   row.scheduled_at,
    visibility:    row.visibility ?? 'public',
    attendeeCount: Number(row.attendee_count ?? 0),
    viewerJoined:  !!row.viewer_joined,
    viewerAnonymous: !!row.viewer_anonymous,
  };
}

export function useMeetups(userId) {
  const [upcomingMeetups, setUpcomingMeetups] = useState([]);
  const [meetupsByCourt,  setMeetupsByCourt]  = useState({});
  const [loading,         setLoading]         = useState(true);

  // ── Fetch all upcoming visible meetups ────────────────────────────────────
  const refreshMeetups = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_upcoming_meetups');
    if (error) {
      // RPC not deployed yet, or a transient failure — degrade to "no runs".
      console.info('[LiveHoops] Meetups unavailable:', error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []).map(normMeetup);
    setUpcomingMeetups(list);
    setMeetupsByCourt(groupMeetupsByCourt(list));
    setLoading(false);
  }, []);

  // Load on mount and whenever the logged-in user changes (visibility of
  // friends-only runs depends on who's asking).
  useEffect(() => {
    if (!userId) {
      setUpcomingMeetups([]);
      setMeetupsByCourt({});
      setLoading(false);
      return;
    }
    setLoading(true);
    refreshMeetups();
  }, [userId, refreshMeetups]);

  // ── Create a run ──────────────────────────────────────────────────────────
  const createMeetup = useCallback(async (courtId, scheduledAtISO, title, visibility, scheduledLabel) => {
    if (!userId || !courtId || !scheduledAtISO) return null;

    const { data, error } = await supabase.rpc('livehoops_create_meetup', {
      p_court_id:     courtId,
      p_scheduled_at: scheduledAtISO,
      p_title:        title ?? null,
      p_visibility:   visibility ?? 'public',
    });

    if (error) {
      console.error('[LiveHoops] createMeetup failed:', error.message);
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;

    // Notify friends (fire-and-forget) then refresh so the new run appears.
    notifyFriendsOfMeetup(
      userId,
      result?.court_name,
      courtId,
      result?.meetup_id,
      scheduledLabel,
    );
    await refreshMeetups();
    return result;
  }, [userId, refreshMeetups]);

  // ── Join / update RSVP (with optional anonymity) ──────────────────────────
  // Upsert on the (meetup_id, user_id) PK so re-joining just flips anonymity.
  const joinMeetup = useCallback(async (meetupId, anonymous = false) => {
    if (!userId || !meetupId) return;
    const { error } = await supabase
      .from('meetup_rsvps')
      .upsert(
        { meetup_id: meetupId, user_id: userId, anonymous },
        { onConflict: 'meetup_id,user_id' }
      );
    if (error) {
      console.error('[LiveHoops] joinMeetup failed:', error.message);
      throw error;
    }
    await refreshMeetups();
  }, [userId, refreshMeetups]);

  // ── Leave a run ───────────────────────────────────────────────────────────
  const leaveMeetup = useCallback(async (meetupId) => {
    if (!userId || !meetupId) return;
    const { error } = await supabase
      .from('meetup_rsvps')
      .delete()
      .eq('meetup_id', meetupId)
      .eq('user_id', userId);
    if (error) {
      console.error('[LiveHoops] leaveMeetup failed:', error.message);
      throw error;
    }
    await refreshMeetups();
  }, [userId, refreshMeetups]);

  // ── Cancel a run (host only, enforced in the RPC) ─────────────────────────
  const cancelMeetup = useCallback(async (meetupId) => {
    if (!meetupId) return;
    const { error } = await supabase.rpc('livehoops_cancel_meetup', { p_meetup_id: meetupId });
    if (error) {
      console.error('[LiveHoops] cancelMeetup failed:', error.message);
      throw error;
    }
    await refreshMeetups();
  }, [refreshMeetups]);

  // ── Fetch the (masked) attendee list for one run ──────────────────────────
  // Anonymous joiners other than yourself come back as "Baller" with no id.
  const fetchAttendees = useCallback(async (meetupId) => {
    if (!meetupId) return [];
    const { data, error } = await supabase.rpc('get_meetup_attendees', { p_meetup_id: meetupId });
    if (error) {
      console.info('[LiveHoops] attendees unavailable:', error.message);
      return [];
    }
    return (data ?? []).map(r => {
      const name = r.username ?? 'Baller';
      return {
        userId:    r.user_id ?? null,
        username:  name,
        avatarUrl: r.avatar_url ?? null,
        initials:  name.slice(0, 2).toUpperCase(),
        anonymous: !!r.anonymous,
        isHost:    !!r.is_host,
      };
    });
  }, []);

  return {
    upcomingMeetups,
    meetupsByCourt,
    loading,
    createMeetup,
    joinMeetup,
    leaveMeetup,
    cancelMeetup,
    fetchAttendees,
    refreshMeetups,
  };
}
