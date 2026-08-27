/** @vitest-environment jsdom */
//
// courtGlyph — the basketball shared by the map pin and the court list rows.
//
// The trap worth a test: SVG elements must be built with createElementNS.
// document.createElement('svg') succeeds, returns an HTMLUnknownElement, and
// renders absolutely nothing — no error, no warning, just an invisible pin.

import { describe, it, expect } from 'vitest';
import { createBallSvg, BALL_VIEWBOX, BALL_CIRCLE, BALL_SEAMS } from '../courtGlyph';

const SVG_NS = 'http://www.w3.org/2000/svg';

describe('createBallSvg', () => {
  it('builds a real SVG element, not an HTML one', () => {
    const svg = createBallSvg();
    expect(svg.namespaceURI).toBe(SVG_NS);
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });

  it('puts the children in the SVG namespace too', () => {
    // A namespaced <svg> containing HTML children renders just as blank.
    const svg = createBallSvg();
    expect(svg.querySelector('circle').namespaceURI).toBe(SVG_NS);
    expect(svg.querySelector('path').namespaceURI).toBe(SVG_NS);
  });

  it('draws the ball: an outline and its seams', () => {
    const svg = createBallSvg();
    expect(svg.querySelector('circle').getAttribute('r')).toBe(String(BALL_CIRCLE.r));
    expect(svg.querySelector('path').getAttribute('d')).toBe(BALL_SEAMS);
    expect(svg.getAttribute('viewBox')).toBe(BALL_VIEWBOX);
  });

  it('takes its colour from CSS rather than baking one in', () => {
    const svg = createBallSvg();
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('fill')).toBe('none');
  });

  it('scales to the size asked for', () => {
    const svg = createBallSvg(20, 2);
    expect(svg.getAttribute('width')).toBe('20');
    expect(svg.getAttribute('height')).toBe('20');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    // The viewBox never changes — that is what keeps the seams proportional.
    expect(svg.getAttribute('viewBox')).toBe(BALL_VIEWBOX);
  });

  it('is hidden from screen readers, which read the pin label instead', () => {
    expect(createBallSvg().getAttribute('aria-hidden')).toBe('true');
  });
});
