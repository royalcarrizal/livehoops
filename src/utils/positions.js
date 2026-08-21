// src/utils/positions.js
//
// The five positions a player can claim, and the rules for a valid selection.
//
// These mirror the check constraint in supabase/profile_positions.sql exactly.
// If you change the list here, change it there too — the database is the one
// that actually enforces it, and a client that allows something the constraint
// rejects turns a UI interaction into a failed save with no useful message.
//
// "Wherever" is a real answer, not a placeholder. Pickup basketball is loose
// about positions, and for plenty of players it is the truthful choice; making
// them pick a specific one would make the field less accurate, not more.

export const POSITIONS = ['Guard', 'Wing', 'Forward', 'Center', 'Wherever'];

/**
 * Add or remove a position, preserving the canonical order.
 *
 * Order is taken from POSITIONS rather than from click order on purpose: two
 * players who picked the same positions should read identically on their
 * profiles, and "Wing · Guard" vs "Guard · Wing" is a difference with no
 * meaning behind it. It also keeps the value stable, so an unrelated profile
 * save cannot rewrite the array into a different order.
 *
 * @param {string[]} current
 * @param {string} position
 * @returns {string[]}
 */
export function togglePosition(current, position) {
  const selected = new Set(normalizePositions(current));

  if (selected.has(position)) selected.delete(position);
  else if (POSITIONS.includes(position)) selected.add(position);

  return POSITIONS.filter(p => selected.has(p));
}

/**
 * Coerce whatever came back from the database into something safe to render.
 *
 * Drops unknown values and duplicates and re-sorts into canonical order. The
 * column is constrained, so this should be a no-op in practice — but the
 * profile row is also read for *other* players, and rendering is not the place
 * to discover that an assumption was wrong.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizePositions(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set(value.filter(p => POSITIONS.includes(p)));
  return POSITIONS.filter(p => seen.has(p));
}

/**
 * The profile-header line, e.g. "Guard · Wing". Empty string when nothing is
 * chosen, so the caller can omit the element rather than render a stray dot.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function formatPositions(value) {
  return normalizePositions(value).join(' · ');
}
