// Acceptance line 3 (issue #13), the first screen, as the orchestrator ruled on PR #53. Pure: it judges one first
// screen's measured geometry (lib.mjs heroRects) plus the two browser-side measures (text over GL, flight crossings),
// so node --test can hold it to the rulings without a browser (first-screen.test.mjs). checks.mjs firstScreen measures
// and calls it. A row is PASS or FAIL: nothing here waits on a ruling any more.
//
// The rulings (binding from 2026-10-04):
//   ruling        https://github.com/derprito64bit/portfolio-site/pull/53#issuecomment-5981658588
//   clarification https://github.com/derprito64bit/portfolio-site/pull/53#issuecomment-5981743762
// 1. Landscape phones (vw > vh and vh <= 500 CSS px): print 1's laid-out height (its layout box, not the tilted
//    bounding box) is at least 50% of the small viewport height. The 50%-of-content-width rule does not apply there,
//    and neither does the 220 px window floor. Still required: print 1 in view, no text over GL, 0 no-fly crossings.
//    The ruling names the class by the viewport alone, so its size rule wins at any width; where print 1 may sit
//    follows the width (2 and 3).
// 2. 64rem and wider: W-D009 as amended. Print 1's window is at least 220 px; print 1 may land in the copy column
//    under the CTA instead of inside the stage, clear of the copy; in view; no text over GL; 0 no-fly crossings.
// 3. Below 64rem, landscape phones excepted: unchanged. Print 1 is at least 50% of the content width and lands inside
//    the stage (W-D009 as locked).
// Every size also keeps line 3's own checks: the whole camera and print 1 in the viewport, and the lens never covered.

export const RULINGS = {
  ruling: 'https://github.com/derprito64bit/portfolio-site/pull/53#issuecomment-5981658588',
  clarification: 'https://github.com/derprito64bit/portfolio-site/pull/53#issuecomment-5981743762',
};

/** Print 1's proportions (an instax mini card, 54 x 86 mm) and its image window, 46 of its 54 mm (layout.ts). */
const PRINT_H_PER_W = 86 / 54;
const WINDOW_PER_W = 46 / 54;
/** Half a CSS px: subpixel layout on the width and height rules. */
const SUBPIXEL = 0.5;
/** The lens disc the print must never cover, as a share of the camera's width (around the band's lens point). */
const LENS_R = 0.17;

/** How far apart two boxes are along their separating axis (CSS px); 0 or less when they touch or overlap. */
export function boxGap(a, b) {
  return Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h));
}

/** Which of the three classes of the rulings a viewport falls in. Landscape phones first: ruling 1 names them by the
 *  viewport alone, whatever their width. `wide` is the page's own (min-width: 64rem) match. */
export function sizeClass({ vw, vh, wide }) {
  if (vw > vh && vh <= 500) return 'landscape phone';
  return wide ? '64rem and wider' : 'below 64rem';
}

/**
 * Judges one first screen. `g`: heroRects (viewport CSS px; vw is the layout width, vh is innerHeight).
 * `textOverGl`: visible text boxes that intersect a GL slot at rest. `crossings`: frames of the flight log
 * (__stage.bounds('hero-print').gl) that intersect the h1, lede or CTA. `flightFrames` (when given): how many frames a
 * press logged; 0 would make the no-fly check vacuous, so it fails.
 */
export function lineThree(g, { textOverGl = [], crossings = [], flightFrames } = {}) {
  const cls = sizeClass(g);
  const inView = (r) => !!r && r.x >= -SUBPIXEL && r.y >= -SUBPIXEL && r.x + r.w <= g.vw + SUBPIXEL && r.y + r.h <= g.vh + SUBPIXEL;
  const lens = { cx: g.camera.x + g.lens.x * g.camera.w, cy: g.camera.y + g.lens.y * g.camera.h, r: LENS_R * g.camera.w };
  const lensClear = g.print.x + g.print.w <= lens.cx - lens.r || g.print.y >= lens.cy + lens.r || g.print.x >= lens.cx + lens.r;

  // Print 1's laid-out box: offsetWidth and offsetHeight, before its 1.2 degree tilt. The height also follows from the
  // width (the card's 86/54), which the row reports as a cross-check.
  const printW = g.printLayoutW;
  const printH = g.printLayoutH ?? printW * PRINT_H_PER_W;
  const windowW = printW * WINDOW_PER_W;
  const widthRule = { name: 'print 1 >= 50% of the content width', measured: printW, limit: 0.5 * g.contentW, unit: 'px' };
  widthRule.pass = widthRule.measured >= widthRule.limit - SUBPIXEL;
  const windowRule = { name: "print 1's window >= 220 px", measured: windowW, limit: 220, unit: 'px' };
  windowRule.pass = windowRule.measured >= windowRule.limit;
  // innerHeight stands in for svh, as the clarification allows: under device emulation there is no browser bar to
  // collapse, so innerHeight is 100svh exactly; on a real phone innerHeight is never smaller than svh, so this rule is
  // never easier against innerHeight than against svh.
  const heightRule = { name: "print 1's laid-out height >= 50% of the small viewport height (innerHeight as svh)", measured: printH, limit: 0.5 * g.vh, unit: 'px' };
  heightRule.pass = heightRule.measured >= heightRule.limit - SUBPIXEL;
  const rule = cls === 'landscape phone' ? heightRule : cls === '64rem and wider' ? windowRule : widthRule;
  // The rules the class sets aside, still measured so a reader can see what they would say.
  const notApplied = cls === 'landscape phone' ? [widthRule, windowRule] : cls === '64rem and wider' ? [widthRule] : [windowRule];

  // Where print 1 sits. Only the split band (64rem and wider, and landscape phones) has a copy column beside the stage:
  // there, print 1 is in the copy column when its box starts left of the copy's right edge (under the lede and CTA).
  // Elsewhere the stage is the whole row under the copy, so print 1 is in the stage by construction.
  const copy = [g.h1, g.line, g.cta].filter(Boolean);
  const textRight = Math.max(...[g.line, g.cta].filter(Boolean).map((r) => r.x + r.w));
  const placement = g.band === 'split' && g.print.x < textRight ? 'copy column' : 'stage';
  const copyGap = Math.min(...copy.map((r) => boxGap(g.print, r)));
  // Amended W-D009: the copy column is allowed at 64rem and wider only (by width, so a landscape phone that wide gets it
  // too: ruling 1 sets only its size rule), and there print 1 keeps clear of the copy.
  const placementRule = g.wide
    ? { name: 'amended W-D009: print 1 in the stage, or in the copy column clear of the copy', placement, pass: placement === 'stage' || copyGap > 0 }
    : { name: 'W-D009 as locked below 64rem: print 1 lands inside the stage', placement, pass: placement === 'stage' };

  const checks = {
    cameraInView: inView(g.camera),
    printInView: inView(g.print),
    lensClear,
    noTextOverGl: textOverGl.length === 0,
    noFly: crossings.length === 0 && (flightFrames === undefined || flightFrames > 0),
    size: rule.pass,
    placement: placementRule.pass,
  };
  const pass = Object.values(checks).every(Boolean);
  const round = (r) => ({ ...r, measured: Math.round(r.measured * 10) / 10, limit: Math.round(r.limit * 10) / 10 });
  return {
    viewport: `${g.vw}x${g.vh}`,
    class: cls,
    pass,
    status: pass ? 'PASS' : 'FAIL',
    failed: Object.keys(checks).filter((k) => !checks[k]),
    checks,
    rule: round(rule),
    notApplied: notApplied.map(round),
    placementRule,
    printLayoutW: printW,
    printLayoutH: printH,
    printLayoutHFromWidth: Math.round(printW * PRINT_H_PER_W * 10) / 10,
    printBoxH: Math.round(g.print.h * 10) / 10,
    viewportH: g.vh,
    contentW: g.contentW,
    windowW: Math.round(windowW * 10) / 10,
    copyGapPx: Math.round(copyGap * 10) / 10,
  };
}
