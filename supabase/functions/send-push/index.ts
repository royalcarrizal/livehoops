// Supabase Edge Function: send-push
//
// The server-side half of push notifications. The app calls this function with
// "notify user X", and it:
//   1. Identifies the CALLER from their JWT and asks the database whether they
//      are allowed to send this person this kind of notification
//   2. Looks up all of user X's registered devices in the fcm_tokens table
//   3. Gets a short-lived access token from Google using the Firebase
//      service account (the FIREBASE_SERVICE_ACCOUNT secret)
//   4. Tells Firebase Cloud Messaging to deliver the push to each device
//   5. Prunes tokens Firebase reports as dead (uninstalled/expired devices)
//
// Step 1 is new, and it is the important one. This function used to take
// user_id, title and body on trust and send whatever it was given to whoever it
// was told — so any logged-in user could push arbitrary text to any other user,
// bypass the self-insert-only policy on the notifications table, and ignore
// every notification preference (those were checked in the client only).
// supabase/notification_authorization.sql explains that hole in full.
//
// The sender is now taken from the token rather than from a field the caller
// controls, and can_notify() decides. Title and body are still caller-supplied,
// so this stops a STRANGER notifying you; it does not stop a real friend
// sending odd text. That is a known, documented limit — see the same SQL file.
//
// Deploy:   npx supabase functions deploy send-push
// Secret:   npx supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)"
//           (or paste the JSON in Dashboard → Edge Functions → Secrets)
//
// ⚠️  Apply supabase/notification_authorization.sql BEFORE deploying this.
//     Without can_notify() in the database every call here is denied and all
//     push notifications stop.
//
// Invoke from the app:
//   supabase.functions.invoke('send-push', {
//     body: { user_id, title, body, data: { kind: 'dm' } },
//   });
//
// verify_jwt must stay ON for this function (the default). The authorization
// below needs a real user token; deploying with --no-verify-jwt would leave
// every call unauthenticated and therefore denied.

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

// Caps on the caller-supplied text. A notification is a one-line banner: the
// client already trims bodies to 120 characters in preview() (src/lib/push.js),
// so anything approaching these limits is not a real message. Capping keeps a
// caller from stuffing a wall of text into a notifications row that the bell
// panel then has to render.
const TITLE_MAX = 120;
const BODY_MAX  = 240;

const clamp = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

// FCM data payloads are string→string, so every context id arrives as text —
// including, when a caller is careless, the literal "undefined". Handing that
// to a uuid parameter makes Postgres raise a cast error, which would surface as
// a 500 rather than the honest answer, which is "this proves nothing". Anything
// that is not a uuid becomes null, and can_notify denies on null.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asUuid = (value: unknown): string | null =>
  typeof value === 'string' && UUID_RE.test(value) ? value : null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, data } = await req.json();

    if (!user_id || !title) {
      return json(400, { error: 'user_id and title are required' });
    }

    // ── Who is calling? ────────────────────────────────────────────────────
    // A SECOND client, built from the anon key plus the caller's own
    // Authorization header, so requests made through it run AS THEM. This is
    // what makes auth.uid() inside can_notify() the sender's id — taken from a
    // signed token, not from a field in the request body.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json(401, { error: 'authorization header required' });
    }

    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user: sender }, error: authError } = await caller.auth.getUser();
    if (authError || !sender) {
      return json(401, { error: 'not signed in' });
    }

    // ── May they send this? ────────────────────────────────────────────────
    // can_notify() (supabase/notification_authorization.sql) checks the block
    // state, the recipient's preference for this kind, and what the caller
    // actually did to earn the notification. Asked through the caller-scoped
    // client on purpose: routing it through `admin` below would run it as the
    // service role, auth.uid() would be null, and the whole check would be a
    // no-op that always denied.
    //
    // The context ids come from the push payload the client already sends, and
    // are verified inside the function rather than trusted — an id on its own
    // proves nothing until it joins back to a row belonging to the caller.
    const { data: allowed, error: authzError } = await caller.rpc('can_notify', {
      p_recipient:  user_id,
      p_kind:       data?.kind ?? null,
      p_post_id:    asUuid(data?.postId),
      p_comment_id: asUuid(data?.commentId),
    });

    if (authzError) {
      // Most likely cause: notification_authorization.sql has not been applied
      // yet. Fail closed and say so loudly rather than falling back to sending.
      console.error('can_notify failed:', authzError.message);
      return json(500, { error: 'authorization check unavailable' });
    }

    if (allowed !== true) {
      return json(403, { error: 'not authorized to notify this user' });
    }

    // Caller-supplied text, capped. Everything below uses these, not the raw
    // values — including the notifications row, so the bell panel and the push
    // banner can never disagree about what was sent.
    const safeTitle = clamp(title, TITLE_MAX);
    const safeBody  = clamp(body, BODY_MAX);

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
      .insert({ user_id, title: safeTitle, body: safeBody, data: data ?? {} });
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
            data: { ...(data ?? {}), title: safeTitle, body: safeBody },
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
