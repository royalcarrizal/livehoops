-- LiveHoops: schedule the meetup reminder push.
-- Run this manually in the Supabase SQL editor AFTER deploying the
-- meetup-reminders Edge Function. Safe to re-run.
--
-- WHAT THIS DOES
-- Every 5 minutes, pg_cron calls the meetup-reminders Edge Function, which
-- finds runs starting within the next hour, pushes a "starting soon" reminder
-- to everyone who RSVP'd, and flags each run reminder_sent = true so it fires
-- once. Mirrors auto_expire_checkins.sql (pg_cron), except the actual work
-- (loading tokens + sending FCM) lives in the Edge Function, not plpgsql.
--
-- ── PREREQS ─────────────────────────────────────────────────────────────────
-- 1. Deploy the function:
--       npx supabase functions deploy meetup-reminders --no-verify-jwt
-- 2. Set its secrets (FIREBASE_SERVICE_ACCOUNT is already set from send-push):
--       npx supabase secrets set CRON_SECRET="$(openssl rand -hex 16)"
--    Keep that CRON_SECRET value — you paste it below.
-- 3. Fill in the two placeholders in the cron.schedule call:
--       <SERVICE_ROLE_KEY>  — Project Settings → API → service_role key
--       <CRON_SECRET>       — the value you set in step 2
--    (These live only in your database's cron config, not in the repo.)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove any prior copy so re-running doesn't stack duplicate jobs.
select cron.unschedule('meetup-reminders')
where exists (select 1 from cron.job where jobname = 'meetup-reminders');

select cron.schedule(
  'meetup-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://jsxzybwbvknjqwcwexdy.supabase.co/functions/v1/meetup-reminders',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer <SERVICE_ROLE_KEY>',
      'x-cron-secret',  '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- To confirm the job is registered:
--   select jobname, schedule, active from cron.job where jobname = 'meetup-reminders';
-- To watch recent runs:
--   select status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'meetup-reminders')
--   order by start_time desc limit 10;
