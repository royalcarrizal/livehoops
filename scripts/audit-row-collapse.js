// LiveHoops — centred-row collapse detector
//
// WHAT THIS CATCHES
// A flex container with `flex-direction: column` and `align-items: center`
// makes every one of its children shrink-to-fit on the cross axis. A child
// that is itself a row dividing its width among `flex-grow` children then
// has no width to divide: each child collapses to its own min-content, and
// the row comes out a fraction of the width it was designed for.
//
// Nothing errors. Nothing warns. The layout just quietly comes out wrong,
// which is why both known instances shipped for months:
//
//   - The auth Sign Up / Log In toggle sized to 52px per segment instead of
//     168px, because .auth-screen centres its children and .auth-form opted
//     out with width: 100% while the toggle row never did.  (fixed in #16)
//   - The profile stat row sized to 193px in a 390px screen, squeezing each
//     pill to 59px and wrapping "Check-ins" at its hyphen.  (fixed in #17)
//
// THE INVARIANT
// A row whose children have flex-grow must have a width of its own. Inside a
// centred column it cannot inherit one.
//
// WHY THIS IS A CONSOLE SCRIPT AND NOT A UNIT TEST
// The bug only exists once boxes have been laid out. jsdom — what Vitest runs
// — does not do layout: every getBoundingClientRect() returns zeros, so a
// unit test cannot see this class of bug at all. It needs a real engine.
//
// HOW TO RUN
// Start the app (`npm run dev`), open it, and paste this file into the
// browser console. Then walk the app — every tab, and every sheet, modal and
// overlay you can open — calling auditRowCollapse() on each surface. It only
// sees what is currently mounted, so a surface you never open is a surface
// never checked.
//
//   auditRowCollapse()            → array of findings for the current screen
//   auditRowCollapse({verbose:1}) → also logs a table
//
// A finding is not automatically a bug: a row may be deliberately narrower
// than its container. Check `couldBe` against `eachIs` and look at it.

function auditRowCollapse(opts) {
  opts = opts || {};
  const findings = [];

  document.querySelectorAll('*').forEach((parent) => {
    const pcs = getComputedStyle(parent);
    if (!/flex/.test(pcs.display)) return;
    if (pcs.flexDirection !== 'column') return;
    if (pcs.alignItems !== 'center') return;

    const pRect = parent.getBoundingClientRect();
    const inner =
      pRect.width - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight);
    if (inner <= 0) return;

    Array.from(parent.children).forEach((child) => {
      const ccs = getComputedStyle(child);

      // Out-of-flow and explicitly-stretched children can't collapse.
      if (ccs.display === 'none') return;
      if (ccs.position === 'absolute' || ccs.position === 'fixed') return;
      if (ccs.alignSelf === 'stretch') return;

      const cRect = child.getBoundingClientRect();
      const margins = parseFloat(ccs.marginLeft) + parseFloat(ccs.marginRight);
      const shortBy = inner - (cRect.width + margins);
      if (shortBy <= 8) return; // effectively full width already

      // Only rows can collapse in the way we care about.
      const isRow = /flex/.test(ccs.display) && ccs.flexDirection !== 'column';
      if (!isRow) return;

      const kids = Array.from(child.children).filter(
        (k) => getComputedStyle(k).display !== 'none'
      );
      if (kids.length < 2) return;

      // The signature: children asking to grow into space that isn't there.
      const growers = kids.filter(
        (k) => parseFloat(getComputedStyle(k).flexGrow) > 0
      );
      if (growers.length === 0) return;

      const gap = parseFloat(ccs.columnGap || ccs.gap) || 0;
      findings.push({
        parent: describe(parent),
        row: describe(child),
        rowWidth: Math.round(cRect.width),
        available: Math.round(inner),
        shortBy: Math.round(shortBy),
        growers: `${growers.length}/${kids.length}`,
        eachIs: Math.round(kids[0].getBoundingClientRect().width),
        couldBe: Math.round((inner - (kids.length - 1) * gap) / kids.length),
        anyChildWraps: kids.some(
          (k) => k.scrollHeight > k.getBoundingClientRect().height + 2
        ),
        el: child,
      });
    });
  });

  if (opts.verbose) {
    if (findings.length === 0) {
      console.log('%c\u2713 no collapsed rows on this screen', 'color:#2FE08A');
    } else {
      // Explicit columns so the `el` handle stays on each finding — it's there
      // so you can inspect or $0 the offending row straight from the console.
      console.table(findings, [
        'parent', 'row', 'rowWidth', 'available',
        'shortBy', 'growers', 'eachIs', 'couldBe', 'anyChildWraps',
      ]);
    }
  }
  return findings;
}

function describe(el) {
  const cls = (el.className || '').toString().trim().split(/\s+/)[0];
  return cls ? '.' + cls : el.tagName.toLowerCase();
}

// Make it available when pasted into the console.
if (typeof window !== 'undefined') window.auditRowCollapse = auditRowCollapse;
