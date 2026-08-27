// Guards the label treatment (Phase C, C2).
//
// Three classes used to spell out near-misses of the same style — 11px vs 12px
// vs 13px, with and without the uppercase — which is how one visual language
// ends up looking like three. They now share a single definition, and this
// keeps them sharing it.
//
// It also pins the boundary, which is the part most likely to be undone by
// someone tidying: .section-title heads a LIST ("Your Crew", "Active Courts",
// "Sorted by distance") and is deliberately NOT part of this treatment.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../index.css'),
  'utf8'
);

/** The rule whose selector list contains `selector`, as raw text. */
function ruleContaining(selector) {
  const i = CSS.indexOf(selector);
  if (i === -1) return null;
  const open = CSS.indexOf('{', i);
  return CSS.slice(open, CSS.indexOf('}', open));
}

const SHARED = ['.settings-section-label', '.edit-field-label', '.add-court-field-label'];

describe('the label treatment', () => {
  it('is declared once, for all three classes', () => {
    // If someone splits these back apart, the shared rule stops containing all
    // three and this fails.
    const i = CSS.indexOf('.settings-section-label');
    const open = CSS.indexOf('{', i);
    const selectorList = CSS.slice(i, open);
    for (const cls of SHARED) {
      expect(selectorList, `${cls} is no longer on the shared rule`).toContain(cls);
    }
  });

  it.each(SHARED)('%s is small, uppercase and letterspaced', (cls) => {
    const body = ruleContaining(cls);
    expect(body).not.toBeNull();
    expect(body).toMatch(/text-transform:\s*uppercase/);
    expect(body).toMatch(/font-size:\s*11px/);
    expect(body).toMatch(/letter-spacing:/);
  });

  it('is muted, not primary — it labels content rather than being content', () => {
    const body = ruleContaining('.settings-section-label');
    expect(body).toMatch(/color:\s*var\(--text-secondary\)/);
  });
});

describe('section titles are a different job', () => {
  it('.section-title is not folded into the label treatment', () => {
    // A large title above a list is not wrong, it is a different job. The
    // original plan said "apply it consistently", which read as "everywhere";
    // this is the line that keeps that from happening later.
    const i = CSS.indexOf('.settings-section-label');
    const selectorList = CSS.slice(i, CSS.indexOf('{', i));
    expect(selectorList).not.toContain('.section-title');
  });

  it('.section-title keeps its own larger, non-uppercase treatment', () => {
    const body = ruleContaining('\n.section-title {');
    expect(body).not.toBeNull();
    expect(body).toMatch(/font-size:\s*18px/);
    expect(body).not.toMatch(/text-transform:\s*uppercase/);
  });
});
