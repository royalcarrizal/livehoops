// src/utils/accents.js
//
// The eight accent colours the user can choose between, and the maths that
// keeps them readable.
//
// Each accent needs TWO values, not one. The app has a dark and a light theme,
// and a colour that reads well on black often disappears on near-white. Yellow
// is the extreme case: #FFD60A scores ~15:1 against black and ~1.4:1 against
// the light background — legible in one mode, invisible in the other. So the
// light variants are darkened until they hold up, while still reading as the
// colour the user picked.
//
// This module is the single source of truth: index.css mirrors these values in
// its [data-accent] blocks, the Settings picker renders its swatches from them,
// and the tests assert every entry stays readable.

// The backgrounds each variant sits on — from the --bg custom property in
// index.css. Used by the contrast tests.
export const DARK_BG  = '#000000';
export const LIGHT_BG = '#F2F2F7';

export const DEFAULT_ACCENT = 'orange';

// darkOn / lightOn are the text colour for FILLED surfaces in that mode — a
// solid button, the "on" toggle, a badge. Declared rather than computed,
// because the rule isn't purely "maximum contrast": white reads as the
// conventional choice for a coloured button, so we keep white wherever it
// clears the bar and only fall back to black where it genuinely fails. The
// index.css [data-accent] blocks mirror these exactly.
export const ACCENTS = [
  // Orange is the app's original colour and stays the default, so nobody's app
  // changes appearance unless they choose it. That's also why it keeps WHITE
  // button text despite scoring 2.86:1 — flipping it to black would score
  // better but would visibly change every existing user's buttons, which is
  // the one thing keeping orange as default is meant to avoid.
  { id: 'orange', label: 'Orange', dark: '#FF6B00', light: '#FF6B00',
    darkBright: '#FF8040', lightBright: '#FF7A00', darkOn: '#FFFFFF', lightOn: '#FFFFFF' },
  { id: 'blue',   label: 'Blue',   dark: '#0A84FF', light: '#0066CC',
    darkBright: '#4FA6FF', lightBright: '#4791DA', darkOn: '#FFFFFF', lightOn: '#FFFFFF' },
  // Light yellow is a deep amber — a literal yellow is ~1.4:1 on near-white.
  // Dark yellow is the one accent where white button text is unusable.
  { id: 'yellow', label: 'Yellow', dark: '#FFD60A', light: '#A97C00',
    darkBright: '#FFE14F', lightBright: '#C1A147', darkOn: '#000000', lightOn: '#FFFFFF' },
  { id: 'red',    label: 'Red',    dark: '#FF453A', light: '#D70015',
    darkBright: '#FF7971', lightBright: '#E24757', darkOn: '#FFFFFF', lightOn: '#FFFFFF' },
  { id: 'purple', label: 'Purple', dark: '#BF5AF2', light: '#8944AB',
    darkBright: '#D188F6', lightBright: '#AA78C3', darkOn: '#FFFFFF', lightOn: '#FFFFFF' },
  { id: 'green',  label: 'Green',  dark: '#30D158', light: '#248A3D',
    darkBright: '#6ADE87', lightBright: '#61AB73', darkOn: '#000000', lightOn: '#FFFFFF' },
  // Light brown is deliberately darker and redder than it needs to be for
  // contrast alone: at #7F5539 it sat only 11° of hue from light-mode yellow
  // and the two were hard to tell apart in the picker. Pushing them apart
  // matters more than either one's exact shade.
  { id: 'brown',  label: 'Brown',  dark: '#AC8E68', light: '#6B4423',
    darkBright: '#C3AE92', lightBright: '#947861', darkOn: '#FFFFFF', lightOn: '#FFFFFF' },
  { id: 'grey',   label: 'Grey',   dark: '#98989D', light: '#6C6C70',
    darkBright: '#B5B5B8', lightBright: '#959598', darkOn: '#000000', lightOn: '#FFFFFF' },
];

/**
 * Coerce a stored accent id into a real one.
 *
 * The chosen accent lives in localStorage, which is user-editable and survives
 * across app versions — so it can hold a typo, a colour that was renamed, or
 * nothing at all. Falling back to the default means a bad value can never leave
 * the app with no accent at all.
 */
export function resolveAccent(id) {
  return ACCENTS.some(a => a.id === id) ? id : DEFAULT_ACCENT;
}

/** Look up a full accent entry (always returns one — falls back to default). */
export function getAccent(id) {
  return ACCENTS.find(a => a.id === resolveAccent(id));
}

// ── Contrast maths (WCAG 2.1) ───────────────────────────────────────────────

/** Relative luminance of a #rrggbb colour, per the WCAG definition. */
export function luminance(hex) {
  const h = hex.replace('#', '');
  const channels = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map(c =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Contrast ratio between two colours, from 1 (identical) to 21 (black/white).
 * WCAG wants 4.5 for body text and 3 for large/bold text and UI components —
 * which is what an accent colour is used for here.
 */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Which text colour to place ON a filled accent surface (a solid button, the
 * "on" toggle, a badge). Picks whichever of black/white is more readable.
 *
 * This exists because white-on-accent fails outright for several of these
 * colours — white on the dark yellow is 1.41:1, a button whose label you
 * genuinely cannot read. Hardcoding `color: #fff` on accent fills is exactly
 * the bug this prevents.
 */
export function contrastTextFor(hex) {
  return contrastRatio('#FFFFFF', hex) >= contrastRatio('#000000', hex)
    ? '#FFFFFF'
    : '#000000';
}
