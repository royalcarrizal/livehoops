// src/utils/avatarColors.js
//
// The background colour behind a user's initials when they have no photo.
//
// These are deliberately NOT the accent the user picked. An accent themes the
// app; these identify a person, so two people in one list have to be able to
// differ while the accent stays whatever it is. That distinction was already
// documented in Avatar.jsx and still holds.
//
// What changed is where the colours come from. Until now they were the last six
// pre-redesign iOS system colours left anywhere in the app (#FF6B1A, #30D158,
// #0A84FF, #BF5AF2, #FF375F, #FFD60A) — never tokenised, never contrast-checked,
// and visibly a half-step off everything the redesign put next to them. They are
// now derived from the accent palette: same hues, same contrast guarantees
// (accents.test.js already asserts every `darkOn` clears 3:1 on its `dark`), and
// one list to maintain instead of two that drift.
//
// Green is excluded on purpose. Green means live/active and nothing else, and a
// green circle behind someone's initials reads as "this person is at a court
// right now" — which is exactly the claim the colour must not make casually.
//
// The colours do not vary by theme. A person's avatar colour is part of how you
// recognise them in a list, so it should not change when they switch to light
// mode; the `dark` variants are bright fills that carry their own deep-tint text
// and stay legible on either background.

import { ACCENTS } from './accents';

/** The avatar background colours, in fixed order. */
export const AVATAR_COLORS = ACCENTS
  .filter(a => a.id !== 'green')
  .map(a => ({ id: a.id, bg: a.dark, text: a.darkOn }));

/**
 * Pick a stable colour for a set of initials.
 *
 * Stability is the whole point: the same initials must always produce the same
 * colour, on every device and across reloads, or a person's avatar changes
 * identity as you scroll. Hence a pure character-sum hash rather than anything
 * involving a user id, which is not always loaded when the avatar renders.
 */
export function avatarColorFor(initials = '') {
  let sum = 0;
  for (let i = 0; i < initials.length; i++) sum += initials.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
