// Tests for the accent palette.
//
// The point of these is to stop an attractive-but-unreadable colour being added
// later. Picking accent colours is the kind of thing that gets done by eye, and
// by eye is exactly how you ship a yellow theme with invisible button labels.

import { describe, it, expect } from 'vitest';
import {
  ACCENTS,
  DEFAULT_ACCENT,
  DARK_BG,
  LIGHT_BG,
  resolveAccent,
  getAccent,
  contrastRatio,
  contrastTextFor,
} from '../accents';

// Accent colours are used for bold text, icons and UI components rather than
// body copy, so 3:1 (the WCAG threshold for large text and UI) is the bar.
const MIN_CONTRAST = 3;

// Light-mode orange scores 2.56:1 and predates this feature — it is the app's
// existing brand colour, shipping today. It's exempted rather than "fixed"
// because orange stays the default specifically so no existing user's app
// changes appearance. Documented here so the exemption is deliberate and
// visible, not an oversight. Every OTHER accent must clear the bar.
const KNOWN_BELOW_BAR = [['orange', 'light']];

const isExempt = (id, mode) =>
  KNOWN_BELOW_BAR.some(([i, m]) => i === id && m === mode);

describe('ACCENTS', () => {
  it('offers the eight colours the app advertises', () => {
    expect(ACCENTS.map(a => a.id)).toEqual([
      'orange', 'blue', 'yellow', 'red', 'purple', 'green', 'brown', 'grey',
    ]);
  });

  it('has unique ids', () => {
    expect(new Set(ACCENTS.map(a => a.id)).size).toBe(ACCENTS.length);
  });

  it('gives every accent a dark and a light variant', () => {
    for (const a of ACCENTS) {
      expect(a.dark, `${a.id}.dark`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(a.light, `${a.id}.light`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('defaults to orange, and orange is in the list', () => {
    expect(DEFAULT_ACCENT).toBe('orange');
    expect(ACCENTS.some(a => a.id === DEFAULT_ACCENT)).toBe(true);
  });
});

describe('readability', () => {
  it.each(ACCENTS)('$id is legible on the dark background', ({ id, dark }) => {
    const ratio = contrastRatio(dark, DARK_BG);
    if (isExempt(id, 'dark')) return;
    expect(ratio, `${id} dark = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it.each(ACCENTS)('$id is legible on the light background', ({ id, light }) => {
    const ratio = contrastRatio(light, LIGHT_BG);
    if (isExempt(id, 'light')) return;
    expect(ratio, `${id} light = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('keeps the documented exemption honest', () => {
    // If someone darkens light-mode orange later, this fails and prompts them
    // to remove the exemption rather than leave a stale one lying around.
    const orange = getAccent('orange');
    expect(contrastRatio(orange.light, LIGHT_BG)).toBeLessThan(MIN_CONTRAST);
  });

  it.each(ACCENTS)('$id declares readable text for its filled surfaces', (a) => {
    for (const [mode, hex, on] of [['dark', a.dark, a.darkOn], ['light', a.light, a.lightOn]]) {
      const ratio = contrastRatio(on, hex);
      // Orange keeps white at 2.86:1 to preserve the app's current appearance —
      // the same documented exemption as above.
      if (a.id === 'orange') continue;
      expect(ratio, `${a.id} ${mode} fill = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });

  it.each(ACCENTS)('$id declares a bright variant', (a) => {
    expect(a.darkBright, `${a.id}.darkBright`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(a.lightBright, `${a.id}.lightBright`).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('only falls back to black text where white genuinely fails', () => {
    // Guards the judgement call: white is the conventional choice for a
    // coloured button, so black should appear only where white is unreadable.
    for (const a of ACCENTS) {
      if (a.darkOn === '#000000') {
        expect(contrastRatio('#FFFFFF', a.dark), `${a.id} dark`).toBeLessThan(MIN_CONTRAST);
      }
      if (a.lightOn === '#000000') {
        expect(contrastRatio('#FFFFFF', a.light), `${a.id} light`).toBeLessThan(MIN_CONTRAST);
      }
    }
  });
});

describe('contrastTextFor', () => {
  it('puts white on dark fills and black on light ones', () => {
    expect(contrastTextFor('#000000')).toBe('#FFFFFF');
    expect(contrastTextFor('#FFFFFF')).toBe('#000000');
  });

  it('puts black on the bright yellow, where white would be unreadable', () => {
    // White on #FFD60A is ~1.41:1 — the case that makes this function necessary.
    expect(contrastTextFor('#FFD60A')).toBe('#000000');
    expect(contrastRatio('#FFFFFF', '#FFD60A')).toBeLessThan(2);
  });
});

describe('contrastRatio', () => {
  it('returns 21 for black against white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('returns 1 for a colour against itself', () => {
    expect(contrastRatio('#FF6B00', '#FF6B00')).toBeCloseTo(1, 5);
  });

  it('is order-independent', () => {
    expect(contrastRatio('#0A84FF', '#000000')).toBeCloseTo(contrastRatio('#000000', '#0A84FF'), 10);
  });
});

describe('resolveAccent', () => {
  it('passes through every real accent', () => {
    for (const a of ACCENTS) expect(resolveAccent(a.id)).toBe(a.id);
  });

  it('falls back to the default for anything it does not recognise', () => {
    // localStorage is user-editable and outlives app versions, so it can hold
    // a typo, a removed colour, or nothing.
    for (const bad of [null, undefined, '', 'teal', 'ORANGE', 42, {}]) {
      expect(resolveAccent(bad)).toBe(DEFAULT_ACCENT);
    }
  });

  it('getAccent always returns a usable entry', () => {
    expect(getAccent('nonsense').id).toBe(DEFAULT_ACCENT);
    expect(getAccent('blue').label).toBe('Blue');
  });
});

// ── The accent basketball ───────────────────────────────────────────────────
// The court glyph on the map pins and the map's court rows takes var(--accent),
// so it follows the accent picker. It sits on two different grounds, and they
// give opposite answers — which is why the live pin does NOT use the accent.

// --green, the fill of a live pin. From index.css.
const DARK_GREEN  = '#2FE08A';
const LIGHT_GREEN = '#12A566';
// --bg-elevated, the ground under an empty pin and a court row.
const DARK_ELEVATED  = '#1D1F24';
const LIGHT_ELEVATED = '#ECEBE8';

describe('the accent basketball', () => {
  it.each(ACCENTS)('$id is legible on an empty pin and a court row (dark)', ({ id, dark }) => {
    const ratio = contrastRatio(dark, DARK_ELEVATED);
    expect(ratio, `${id} dark on elevated = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it.each(ACCENTS)('$id is legible on an empty pin and a court row (light)', ({ id, light }) => {
    const ratio = contrastRatio(light, LIGHT_ELEVATED);
    // Light-mode orange lands at 2.39:1 here — the same exemption it already
    // carries against the page background, for the same reason: it is the
    // shipping brand default and darkening it changes every existing app.
    if (isExempt(id, 'light')) return;
    expect(ratio, `${id} light on elevated = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it('keeps the light-orange exemption on that ground honest too', () => {
    // Fails if orange is ever darkened, prompting removal of the exemption
    // rather than leaving a stale one behind.
    const orange = getAccent('orange');
    expect(contrastRatio(orange.light, LIGHT_ELEVATED)).toBeLessThan(MIN_CONTRAST);
  });

  it('justifies why a LIVE pin keeps a dark ball instead of the accent', () => {
    // Not one of the eight accents is legible on the green fill — the best,
    // brown, reaches only 2.67:1 and orange bottoms out near 1.1:1 in light
    // mode. If this ever stops being true (say --green is darkened), this test
    // fails and the live pin becomes worth revisiting.
    for (const a of ACCENTS) {
      expect(
        contrastRatio(a.dark, DARK_GREEN),
        `${a.id} dark on green is now legible — revisit the live pin`,
      ).toBeLessThan(MIN_CONTRAST);
      expect(
        contrastRatio(a.light, LIGHT_GREEN),
        `${a.id} light on green is now legible — revisit the live pin`,
      ).toBeLessThan(MIN_CONTRAST);
    }
  });
});
