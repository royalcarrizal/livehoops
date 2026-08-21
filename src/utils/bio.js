// src/utils/bio.js
//
// The 120-character rule for a player's bio, in one place.
//
// The limit is enforced at three layers that have to agree: the textarea's
// maxLength, the clamp below as the user types, and a check constraint in
// supabase/profile_bio.sql as the backstop. maxLength alone is not enough —
// it caps typing but browsers still let a paste through in some cases, and it
// counts UTF-16 code units rather than characters.
//
// That last part is the subtle one, and it is why this is a module with tests
// rather than a slice() inline in the component. JavaScript's String.length
// counts UTF-16 code units, so an emoji like 🏀 is 2 and a flag is 4. Postgres
// char_length() counts characters, so it sees 1. Slicing naively on .length
// therefore disagrees with the database about what "120" means, and — worse —
// can cut an emoji in half and leave a lone surrogate in the string.
//
// Array.from() iterates by code point, so both problems go away: the count
// matches what Postgres will check, and a slice can never split a character.

export const BIO_MAX_LENGTH = 120;

/**
 * Number of characters in a bio, counted the way Postgres char_length() does.
 * @param {string} value
 * @returns {number}
 */
export function bioLength(value) {
  if (!value) return 0;
  return Array.from(value).length;
}

/**
 * Cut a bio to the limit without splitting a character. Use on every change,
 * so an over-long paste is trimmed rather than rejected.
 * @param {string} value
 * @returns {string}
 */
export function clampBio(value) {
  if (!value) return '';
  const chars = Array.from(value);
  if (chars.length <= BIO_MAX_LENGTH) return value;
  return chars.slice(0, BIO_MAX_LENGTH).join('');
}

/**
 * Turn form input into what gets stored. Blank or all-whitespace becomes null
 * so "no bio" stays one state rather than two — the profile header omits the
 * line entirely on null, and an empty string would render dead space.
 * @param {string} value
 * @returns {string|null}
 */
export function normalizeBio(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return clampBio(trimmed);
}
