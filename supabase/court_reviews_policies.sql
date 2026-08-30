-- LiveHoops: the court_reviews RLS policies.
-- Run this manually in the Supabase SQL editor. Safe to re-run.
--
-- ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
-- These four policies were created by hand in the Supabase dashboard and have
-- never been in Git. They were found during the audit in
-- supabase/legacy_policy_cleanup.sql, which removed twelve other dashboard
-- policies that were shadowing — and quietly disabling — the rules in this
-- directory.
--
-- These four are the exception, and the difference matters:
--
--   • the twelve dropped there each had a snake_case counterpart already doing
--     the job correctly, so the dashboard version was pure interference
--   • these four are the ONLY policies on court_reviews. There is nothing to
--     fall back on. Dropping them alongside the rest would have taken ratings
--     and reviews out entirely — a "security fix" that silently removes a
--     feature is worse than the duplication it cleaned up
--
-- They are also, on inspection, correct: you may write, edit and delete your
-- own review and nobody else's, and reviews are public to read. That is what
-- the court sheet shows and what useCourtReviews.js expects.
--
-- So this file changes NOTHING. Applying it against the current production
-- database is a no-op — each policy is dropped and recreated identically. Its
-- job is to make Git match reality, so the next person auditing this table can
-- answer "what are the rules here?" from the repository instead of from a
-- production query.
--
-- Transcribed verbatim from pg_policies, including the `to authenticated`
-- targeting, which differs from the `to public` the other dashboard policies
-- used.

begin;

-- Anyone signed in can read reviews. Reviews are public by design — they are
-- shown to every viewer of a court sheet, and carry the reviewer's username.
drop policy if exists "Anyone can view reviews" on public.court_reviews;
create policy "Anyone can view reviews"
on public.court_reviews for select
to authenticated
using (true);

-- You may only write a review as yourself. The one-review-per-court rule is a
-- unique constraint on (court_id, user_id), not a policy — useCourtReviews
-- upserts on that conflict target to edit rather than duplicate.
drop policy if exists "Users can create their review" on public.court_reviews;
create policy "Users can create their review"
on public.court_reviews for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update their review" on public.court_reviews;
create policy "Users can update their review"
on public.court_reviews for update
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can delete their review" on public.court_reviews;
create policy "Users can delete their review"
on public.court_reviews for delete
to authenticated
using (user_id = auth.uid());

commit;


-- ── Worth knowing, deliberately NOT changed here ────────────────────────────
--
-- The UPDATE policy has no WITH CHECK, so the USING expression is reused for
-- it. That is safe as it stands — a row must still satisfy user_id = auth.uid()
-- afterwards, so a review cannot be reassigned to someone else.
--
-- There is no column restriction, so a reviewer can edit any column of their
-- own review, including court_id. Moving your review to a different court is
-- pointless rather than dangerous (the rating still belongs to you, and the
-- sync_court_rating trigger recalculates both courts), so it is left alone
-- rather than fixed speculatively. Noted so it is recorded rather than
-- rediscovered.


-- ── Verifying this after applying it ────────────────────────────────────────
--
-- Since this file changes nothing, the check is that nothing changed:
--
--   a) In the app, open a court sheet, expand Ratings & Reviews, submit a
--      rating, edit it, then delete it. All four must work exactly as before.
--
--   b) The policy set is unchanged:
--
--        select policyname, cmd, roles::text, qual, with_check
--        from   pg_policies
--        where  schemaname = 'public' and tablename = 'court_reviews'
--        order  by cmd;
--
--      Expect four rows, all `to authenticated`, matching the definitions above.
