// Supabase Edge Function: send-push
//
// The server-side half of push notifications. The app (or a database
// webhook) calls this function with "notify user X", and it:
//   1. Looks up all of user X's registered devices in the fcm_tokens table
//   2. Gets a short-lived access token from Google using the Firebase
//      service account (the FIREBASE_SERVICE_ACCOUNT secret)
//   3. Tells Firebase Cloud Messaging to deliver the push to each device
//   4. Prunes tokens Firebase reports as dead (uninstalled/expired devices)
//
// Deploy:   npx supabase functions deploy send-push
// Secret:   npx supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)"
//           (or paste the JSON in Dashboard → Edge Functions → Secrets)
//
// Invoke from the app:
//   supabase.functions.invoke('send-push', {
//     body: { user_id, title, body, data: { kind: 'dm' } },
//   });
//
// Callers must be logged in (Supabase verifies the JWT before running this).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { JWT } from 'npm:google-auth-library@9';

// Browsers send a preflight OPTIONS request before the real call — these
// headers tell them the call is allowed.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, data } = await req.json();

    if (!user_id || !title) {
      return json(400, { error: 'user_id and title are required' });
    }

    // ── Firebase service account (secret) ──────────────────────────────────
    const rawServiceAccount = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
    if (!rawServiceAccount) {
      return json(500, { error: 'FIREBASE_SERVICE_ACCOUNT secret is not set' });
    }
    const serviceAccount = JSON.parse(rawServiceAccount);

    // The service role key bypasses RLS — required because the fcm_tokens
    // policies (correctly) block users from reading each other's tokens, and
    // because this function writes notifications on behalf of OTHER users
    // (the notifications table only allows self-inserts from the client).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Persist the notification ─────────────────────────────────────────
    // This is what makes the in-app bell panel work: a durable row exists
    // regardless of whether the recipient has any registered devices, and
    // regardless of whether their app is open, backgrounded, or fully
    // closed when the FCM send below happens. Best-effort — a failed insert
    // here shouldn't block the actual push.
    const { error: insertError } = await admin
      .from('notifications')
      .insert({ user_id, title, body: body ?? '', data: data ?? {} });
    if (insertError) {
      console.error('Failed to persist notification:', insertError.message);
    }

    // ── Look up the recipient's registered devices ──────────────────────────
    const { data: tokenRows, error: tokenError } = await admin
      .from('fcm_tokens')
      .select('token')
      .eq('user_id', user_id);

    if (tokenError) throw tokenError;
    if (!tokenRows?.length) {
      return json(200, { sent: 0, reason: 'recipient has no registered devices' });
    }

    // ── Exchange the service account for a short-lived access token ────────
    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
    const { access_token } = await jwtClient.authorize();

    // ── Send to every device, collecting dead tokens for cleanup ───────────
    const fcmUrl =
      `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

    let sent = 0;
    const staleTokens: string[] = [];

    for (const { token } of tokenRows) {
      const res = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            // Data-only message: the title/body travel inside `data` and the
            // service worker builds the notification itself. This keeps the
            // deep-link payload (kind, postId, senderId…) attached to the
            // notification so a tap can open the right screen, and avoids
            // the duplicate notifications FCM can create when a
            // `notification` block is auto-displayed alongside our own.
            data: { ...(data ?? {}), title, body: body ?? '' },
            webpush: {
              headers: { Urgency: 'high' },
            },
          },
        }),
      });

      if (res.ok) {
        sent++;
      } else {
        const errBody = await res.json().catch(() => ({}));
        const code =
          errBody?.error?.details?.[0]?.errorCode ?? errBody?.error?.status;
        // UNREGISTERED = the device uninstalled the app / token expired.
        // Delete the row so we stop trying.
        if (code === 'UNREGISTERED' || res.status === 404) {
          staleTokens.push(token);
        } else {
          console.error('FCM send failed:', res.status, JSON.stringify(errBody));
        }
      }
    }

    if (staleTokens.length) {
      await admin.from('fcm_tokens').delete().in('token', staleTokens);
    }

    return json(200, { sent, pruned: staleTokens.length });
  } catch (err) {
    console.error('send-push error:', err);
    return json(500, { error: String(err?.message ?? err) });
  }
});
