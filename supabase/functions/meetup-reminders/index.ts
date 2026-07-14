// Supabase Edge Function: meetup-reminders
//
// The scheduled half of the meetups feature. A pg_cron job (see
// supabase/meetup_reminders.sql) hits this every few minutes. It:
//   1. Finds meetups starting within the next hour that haven't been reminded
//   2. For each, loads the RSVP'd users' devices from fcm_tokens
//   3. Sends a data-only "starting soon" push (kind: 'meetup_reminder')
//   4. Flags the meetup reminder_sent = true so it fires once
//   5. Prunes dead FCM tokens (same as send-push)
//
// The FCM-send logic mirrors supabase/functions/send-push/index.ts.
//
// Deploy:  npx supabase functions deploy meetup-reminders --no-verify-jwt
// Secrets: FIREBASE_SERVICE_ACCOUNT (already set for send-push),
//          CRON_SECRET (a random string; the cron job passes it back so a
//          random internet request can't trigger a reminder blast).
//
// It's invoked ONLY by the cron job, never the app.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { JWT } from 'npm:google-auth-library@9';

// How far ahead of a run we send the "starting soon" reminder.
const REMINDER_WINDOW_MIN = 60;

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  try {
    // ── Gate: only the cron job (which knows CRON_SECRET) may run this ──────
    const expectedSecret = Deno.env.get('CRON_SECRET');
    if (expectedSecret) {
      const provided = req.headers.get('x-cron-secret');
      if (provided !== expectedSecret) {
        return json(401, { error: 'unauthorized' });
      }
    }

    const rawServiceAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!rawServiceAccount) {
      return json(500, { error: 'FIREBASE_SERVICE_ACCOUNT secret is not set' });
    }
    const serviceAccount = JSON.parse(rawServiceAccount);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Find runs starting within the reminder window, not yet reminded ────
    const nowIso = new Date().toISOString();
    const windowIso = new Date(Date.now() + REMINDER_WINDOW_MIN * 60_000).toISOString();

    const { data: meetups, error: meetupErr } = await admin
      .from('meetups')
      .select('id, court_id, scheduled_at, courts(name)')
      .eq('reminder_sent', false)
      .gt('scheduled_at', nowIso)          // hasn't started yet
      .lte('scheduled_at', windowIso);     // …but starts within the window

    if (meetupErr) throw meetupErr;
    if (!meetups?.length) {
      return json(200, { reminded: 0, reason: 'no meetups due' });
    }

    // ── One Google access token for the whole batch ───────────────────────
    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const { access_token } = await jwtClient.authorize();
    const fcmUrl =
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

    const staleTokens: string[] = [];
    let sent = 0;

    for (const meetup of meetups) {
      const courtName = (meetup as { courts?: { name?: string } }).courts?.name ?? 'a court';

      // Who RSVP'd?
      const { data: rsvps } = await admin
        .from('meetup_rsvps')
        .select('user_id')
        .eq('meetup_id', meetup.id);

      const userIds = (rsvps ?? []).map((r) => r.user_id);

      if (userIds.length) {
        // Their devices
        const { data: tokenRows } = await admin
          .from('fcm_tokens')
          .select('token')
          .in('user_id', userIds);

        const data = {
          kind: 'meetup_reminder',
          courtId: meetup.court_id ?? '',
          meetupId: meetup.id ?? '',
          title: 'Your run starts soon 🏀',
          body: `Heads up — your run at ${courtName} is coming up`,
        };

        for (const { token } of tokenRows ?? []) {
          const res = await fetch(fcmUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token,
                data,
                webpush: { headers: { Urgency: 'high' } },
              },
            }),
          });

          if (res.ok) {
            sent++;
          } else {
            const errBody = await res.json().catch(() => ({}));
            const code =
              errBody?.error?.details?.[0]?.errorCode ?? errBody?.error?.status;
            if (code === 'UNREGISTERED' || res.status === 404) {
              staleTokens.push(token);
            } else {
              console.error('FCM send failed:', res.status, JSON.stringify(errBody));
            }
          }
        }
      }

      // Mark reminded regardless of how many devices we reached, so a run with
      // no reachable devices doesn't get retried forever.
      await admin.from('meetups').update({ reminder_sent: true }).eq('id', meetup.id);
    }

    if (staleTokens.length) {
      await admin.from('fcm_tokens').delete().in('token', staleTokens);
    }

    return json(200, { reminded: meetups.length, sent, pruned: staleTokens.length });
  } catch (err) {
    console.error('meetup-reminders error:', err);
    return json(500, { error: String((err as Error)?.message ?? err) });
  }
});
