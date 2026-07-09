-- LiveHoops admin moderation.
-- Run this manually in the Supabase SQL editor. Safe to re-run.
--
-- Adds an is_admin flag to profiles and a set of admin-only RPCs that power
-- the in-app moderation panel (Settings → Admin):
--   - pending court submissions → approve (verified=true) or reject (delete)
--   - reported posts            → dismiss reports or delete the post
--
-- All functions are SECURITY DEFINER but hard-fail unless the caller's
-- profile has is_admin = true, so regular users can't touch them.

-- ── 1. Admin flag ───────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- Make the app owner an admin
update public.profiles
set is_admin = true
where id in (select id from auth.users where email = 'royalanthony96@gmail.com');

-- ── 2. Shared guard ─────────────────────────────────────────────────────────

create or replace function public.admin_guard()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  ) then
    raise exception 'Admin access required';
  end if;
end;
$$;

-- ── 3. Pending counts (drives the badge in Settings) ───────────────────────

create or replace function public.admin_pending_counts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  return jsonb_build_object(
    'courts',  (select count(*) from public.courts where verified = false),
    'reports', (select count(distinct post_id) from public.post_reports)
  );
end;
$$;

-- ── 4. Court submissions ────────────────────────────────────────────────────

create or replace function public.admin_list_pending_courts()
returns table (
  id uuid,
  name text,
  address text,
  city text,
  surface text,
  courts int,
  photo_url text,
  created_at timestamptz,
  submitted_by_username text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  return query
    select c.id, c.name, c.address, c.city, c.surface,
           c.courts, c.photo_url, c.created_at,
           p.username as submitted_by_username
    from public.courts c
    left join public.profiles p on p.id = c.submitted_by
    where c.verified = false
    order by c.created_at asc;
end;
$$;

-- Approve makes the court public; reject deletes the submission entirely.
create or replace function public.admin_review_court(p_court_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  if p_approve then
    update public.courts set verified = true where id = p_court_id;
  else
    delete from public.courts where id = p_court_id and verified = false;
  end if;
end;
$$;

-- ── 5. Post reports ─────────────────────────────────────────────────────────
-- Grouped per post (one row per reported post, with a report count), so the
-- admin reviews the post once no matter how many people reported it.

create or replace function public.admin_list_reports()
returns table (
  post_id uuid,
  report_count bigint,
  content text,
  image_url text,
  author_username text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  return query
    select pr.post_id,
           count(*) as report_count,
           po.content,
           po.image_url,
           p.username as author_username
    from public.post_reports pr
    left join public.posts po on po.id = pr.post_id
    left join public.profiles p on p.id = po.user_id
    group by pr.post_id, po.content, po.image_url, p.username
    order by count(*) desc;
end;
$$;

-- Dismiss clears the reports and keeps the post; delete removes the post
-- (and its reports) entirely.
create or replace function public.admin_resolve_report(p_post_id uuid, p_delete_post boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  delete from public.post_reports where post_id = p_post_id;
  if p_delete_post then
    delete from public.posts where id = p_post_id;
  end if;
end;
$$;

-- ── 6. Permissions ──────────────────────────────────────────────────────────
-- Grant execute to authenticated — the admin_guard() inside each function is
-- what actually restricts access to admins.

revoke execute on function public.admin_guard() from public;
revoke execute on function public.admin_pending_counts() from public;
revoke execute on function public.admin_list_pending_courts() from public;
revoke execute on function public.admin_review_court(uuid, boolean) from public;
revoke execute on function public.admin_list_reports() from public;
revoke execute on function public.admin_resolve_report(uuid, boolean) from public;

grant execute on function public.admin_pending_counts() to authenticated;
grant execute on function public.admin_list_pending_courts() to authenticated;
grant execute on function public.admin_review_court(uuid, boolean) to authenticated;
grant execute on function public.admin_list_reports() to authenticated;
grant execute on function public.admin_resolve_report(uuid, boolean) to authenticated;
