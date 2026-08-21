// src/utils/profileSchema.js
//
// Lets the app run correctly against a `profiles` table that may or may not
// have had a given migration applied yet.
//
// WHY THIS EXISTS
// Migrations in this repo are applied by hand in the Supabase SQL editor
// (see the header of any file in supabase/), so there is always a window
// where the deployed code knows about a column the database does not have.
//
// That window is not harmless. useProfile.updateProfile passes its object
// straight to `.update()`, and PostgREST rejects an update naming an unknown
// column outright — it does not ignore it. So shipping `bio` before running
// supabase/profile_bio.sql would not just fail to save the bio: it would fail
// the whole request, and the user could no longer change their username or
// jersey number either. One unapplied migration takes out the entire form.
//
// HOW IT DETECTS
// useProfile reads with select('*'), so the row it returns has a key for
// every column the table actually has — including ones whose value is null.
// A missing key therefore means a missing column, which makes `in` a faithful
// schema check without a second round trip or a hardcoded version number.
//
// This is deliberately additive-only. It answers "can I write this column
// yet?" and nothing else; it is not a migration system.

/**
 * Whether the profiles table has this column, judged from a fetched row.
 *
 * Returns false when the profile has not loaded — callers should treat
 * "unknown" as "don't offer the feature yet" rather than guessing.
 *
 * @param {object|null|undefined} profile — a row from select('*')
 * @param {string} column
 * @returns {boolean}
 */
export function profileHasColumn(profile, column) {
  if (!profile || typeof profile !== 'object') return false;
  return column in profile;
}

/**
 * Drop any key the table does not have, so an update can never be rejected
 * for naming an unknown column.
 *
 * When the profile has not loaded there is nothing to check against, so the
 * updates pass through unchanged — the caller is in no position to save
 * anyway, and silently dropping every field would be worse than the error.
 *
 * @param {object|null|undefined} profile — a row from select('*')
 * @param {object} updates                — the intended column/value pairs
 * @returns {object}
 */
export function pickSupportedUpdates(profile, updates) {
  if (!profile || typeof profile !== 'object') return { ...updates };

  const supported = {};
  for (const [column, value] of Object.entries(updates)) {
    if (column in profile) supported[column] = value;
  }
  return supported;
}
