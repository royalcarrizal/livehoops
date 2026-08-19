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
export const DARK_BG  = '#0B0B0E';
export const LIGHT_BG = '#F5F4F2';

export const DEFAULT_ACCENT = 'orange';

// darkOn / lightOn are the text colour for FILLED surfaces in that mode — a
// solid button, the "on" toggle, a badge. Declared rather than computed.
//
// Dark mode uses a deep tint of the accent itself rather than flat white or
// black. That comes from the redesign, and it is measurably better: every dark
// fill now clears 3:1, including orange, which sat at 2.86:1 on white and had
// to be exempted. The tint also keeps a coloured button reading as one colour
// rather than as a colour with white stamped on it.
//
// Light mode keeps white, and keeps the darker accent variants — both were
// re-checked against the new #F5F4F2 background and still clear the bar.
// The index.css [data-accent] blocks mirror these exactly.
export const ACCENTS = [
  // Orange is the app's brand colour and stays the default. The redesign
  // modernises it from #FF6B00 to a slightly softer ember, and its dark fill
  // now passes on its own merits rather than by exemption. Light-mode orange
  // is still below the bar (2.60:1) and keeps its documented exemption.
  { id: 'orange', label: 'Orange', dark: '#FF6A2C', light: '#FF6B00',
    darkBright: '#FF8B57', lightBright: '#FF7A00', darkOn: '#150B05', lightOn: '#FFFFFF' },
  { id: 'blue',   label: 'Blue',   dark: '#4C8DFF', light: '#0066CC',
    darkBright: '#7EADFF', lightBright: '#4791DA', darkOn: '#04102B', lightOn: '#FFFFFF' },
  // Light yellow is a deep amber — a literal yellow is ~1.4:1 on near-white.
  { id: 'yellow', label: 'Yellow', dark: '#F2C230', light: '#A97C00',
    darkBright: '#F6D36A', lightBright: '#C1A147', darkOn: '#1F1804', lightOn: '#FFFFFF' },
  { id: 'red',    label: 'Red',    dark: '#FF5A52', light: '#D70015',
    darkBright: '#FF8882', lightBright: '#E24757', darkOn: '#2A0705', lightOn: '#FFFFFF' },
  { id: 'purple', label: 'Purple', dark: '#A182F5', light: '#8944AB',
    darkBright: '#BBA5F8', lightBright: '#AA78C3', darkOn: '#150A2E', lightOn: '#FFFFFF' },
  { id: 'green',  label: 'Green',  dark: '#3ED27F', light: '#248A3D',
    darkBright: '#74DFA3', lightBright: '#61AB73', darkOn: '#052014', lightOn: '#FFFFFF' },
  // Light brown stays deliberately darker and redder than contrast alone needs:
  // at #7F5539 it sat only 11° of hue from light-mode yellow and the two were
  // hard to tell apart in the picker.
  { id: 'brown',  label: 'Brown',  dark: '#C08457', light: '#6B4423',
    darkBright: '#D2A686', lightBright: '#947861', darkOn: '#20120A', lightOn: '#FFFFFF' },
  { id: 'grey',   label: 'Grey',   dark: '#A6A8B2', light: '#6C6C70',
    darkBright: '#BFC0C8', lightBright: '#959598', darkOn: '#14151A', lightOn: '#FFFFFF' },
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
