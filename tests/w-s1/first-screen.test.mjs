// Acceptance line 3 under the orchestrator's rulings on PR #53 (line3.mjs): every first screen is PASS or FAIL, each
// class gets its own size rule, and nothing reports BLOCKED. GPU-free: node --test. The geometry is the crew suite's own
// at cf709b6 (w-s1/firstScreen.json), and 568 x 320 is rebuilt from the manager's round-4 probe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULINGS, boxGap, lineThree, sizeClass } from './line3.mjs';

const LENS = { x: 0.79, y: 0.6432 };
const LENS_PHONE = { x: 0.7658, y: 0.6399 };
const G = {
  // 844 x 390: the short split row; print 1 beside the camera's grip, 136 px wide in a 773 px row.
  L844: { vw: 844, vh: 390, wide: false, band: 'split', contentW: 773, printLayoutW: 136, printLayoutH: 217, lens: LENS,
    h1: { x: 35.4375, y: 68, w: 773.125, h: 81.421875 }, line: { x: 35.4375, y: 157.421875, w: 310.125, h: 53.34375 }, cta: { x: 35.4375, y: 222.765625, w: 126.375, h: 44 },
    camera: { x: 594, y: 207, w: 214, h: 166 }, print: { x: 524.18017578125, y: 156.02159118652344, w: 140.5146484375, h: 219.80055236816406 } },
  // 1440 x 900: print 1 in the copy column under the CTA (amended W-D009).
  D2: { vw: 1440, vh: 900, wide: true, band: 'split', contentW: 1319, printLayoutW: 312, printLayoutH: 497, lens: LENS,
    h1: { x: 60.46875, y: 83.59375, w: 1319.0625, h: 186.890625 }, line: { x: 60.46875, y: 282.484375, w: 429.140625, h: 29.84375 }, cta: { x: 60.46875, y: 324.328125, w: 126.375, h: 44 },
    camera: { x: 886, y: 405, w: 492, h: 383 }, print: { x: 55.288299560546875, y: 393.27197265625, w: 322.36090087890625, h: 504.4248046875 } },
  // 1366 x 640: print 1 in the stage, beside the camera.
  S1: { vw: 1366, vh: 640, wide: true, band: 'split', contentW: 1251, printLayoutW: 259, printLayoutH: 412, lens: LENS,
    h1: { x: 57.359375, y: 68, w: 1251.28125, h: 133.625 }, line: { x: 57.359375, y: 209.625, w: 423.59375, h: 29.4375 }, cta: { x: 57.359375, y: 251.0625, w: 126.375, h: 44 },
    camera: { x: 963, y: 261, w: 344, h: 267 }, print: { x: 693.0631713867188, y: 217.958251953125, w: 267.5924072265625, h: 418.33349609375 } },
  // 390 x 844: the phone band; the stage under the copy.
  P2: { vw: 390, vh: 844, wide: false, band: 'phone', contentW: 357, printLayoutW: 179, printLayoutH: 285, lens: LENS_PHONE,
    h1: { x: 16.375, y: 80.234375, w: 357.25, h: 50.609375 }, line: { x: 16.375, y: 140.59375, w: 349.890625, h: 24.296875 }, cta: { x: 16.375, y: 176.890625, w: 126.375, h: 44 },
    camera: { x: 136, y: 276, w: 236, h: 180 }, print: { x: 13.420804977416992, y: 311.75054931640625, w: 184.90838623046875, h: 287.6864013671875 } },
  // 568 x 320 (the manager's probe): the split row's floor runs the camera and print 1 off the bottom (331 and 334).
  L568: { vw: 568, vh: 320, wide: false, band: 'split', contentW: 520, printLayoutW: 119, printLayoutH: 190, lens: LENS,
    h1: { x: 24, y: 60, w: 520, h: 50 }, line: { x: 24, y: 118, w: 218, h: 40 }, cta: { x: 24, y: 166, w: 126.375, h: 44 },
    camera: { x: 378, y: 199, w: 170, h: 132 }, print: { x: 258, y: 140, w: 124, h: 194 } },
};
const clone = (g) => structuredClone(g);

test('the rulings are cited', () => {
  assert.match(RULINGS.ruling, /pull\/53#issuecomment-5981658588$/);
  assert.match(RULINGS.clarification, /pull\/53#issuecomment-5981743762$/);
});

test('classes: landscape phones by the viewport alone, then 64rem', () => {
  assert.equal(sizeClass(G.L844), 'landscape phone');
  assert.equal(sizeClass({ vw: 1100, vh: 480, wide: true }), 'landscape phone');
  assert.equal(sizeClass({ vw: 960, vh: 501, wide: false }), 'below 64rem');
  assert.equal(sizeClass({ vw: 500, vh: 500, wide: false }), 'below 64rem');
  assert.equal(sizeClass(G.D2), '64rem and wider');
  assert.equal(sizeClass(G.P2), 'below 64rem');
});

test('844 x 390 passes on its laid-out height, with the width rule and the window floor set aside', () => {
  const r = lineThree(G.L844);
  assert.equal(r.status, 'PASS');
  assert.equal(r.class, 'landscape phone');
  assert.match(r.rule.name, /laid-out height >= 50% of the small viewport height/);
  assert.equal(r.rule.measured, 217);
  assert.equal(r.rule.limit, 195);
  assert.equal(r.viewportH, 390);
  // What the set-aside rules would say: the width rule fails (136 of 386.5) and so would the window floor (116 px).
  assert.deepEqual(r.notApplied.map((x) => x.pass), [false, false]);
  assert.equal(r.placementRule.placement, 'stage');
});

test('a landscape phone is judged on the layout box, not the tilted bounding box', () => {
  const g = clone(G.L844);
  g.printLayoutH = 0.5 * g.vh - 2; // laid out 2 px short of half the height
  g.print.h = 0.5 * g.vh + 20; // while the tilted box clears it
  const r = lineThree(g);
  assert.equal(r.status, 'FAIL');
  assert.deepEqual(r.failed, ['size']);
});

test('without a measured height, the card proportions give it (86/54 of the width)', () => {
  const g = clone(G.L844);
  delete g.printLayoutH;
  const r = lineThree(g);
  assert.equal(Math.round(r.printLayoutH), 217);
  assert.equal(r.status, 'PASS');
});

test('568 x 320 fails (out of view), and reports FAIL, never BLOCKED', () => {
  const r = lineThree(G.L568);
  assert.equal(r.status, 'FAIL');
  assert.deepEqual(r.failed, ['cameraInView', 'printInView']);
  assert.equal(r.checks.size, true);
});

test('64rem and wider: the copy column is allowed, clear of the copy, with a 220 px window', () => {
  const r = lineThree(G.D2);
  assert.equal(r.status, 'PASS');
  assert.equal(r.placementRule.placement, 'copy column');
  assert.ok(r.copyGapPx > 0);
  assert.ok(r.windowW >= r.rule.limit);
  const s = lineThree(G.S1);
  assert.equal(s.status, 'PASS');
  assert.equal(s.placementRule.placement, 'stage');
  // Touching the CTA is not clear of the copy.
  const g = clone(G.D2);
  g.print.y = g.cta.y + g.cta.h;
  assert.deepEqual(lineThree(g).failed, ['placement']);
  // A window under 220 px fails.
  const n = clone(G.D2);
  n.printLayoutW = 258;
  assert.deepEqual(lineThree(n).failed, ['size']);
});

test('below 64rem: the width rule stands, and the copy column is not allowed', () => {
  assert.equal(lineThree(G.P2).status, 'PASS');
  const g = clone(G.P2);
  g.printLayoutW = Math.floor(0.5 * g.contentW) - 1;
  assert.deepEqual(lineThree(g).failed, ['size']);
  // A landscape phone below 64rem with print 1 under its copy would break the locked W-D009.
  const l = clone(G.L844);
  l.print.x = l.line.x;
  l.print.y = l.cta.y + l.cta.h + 4;
  const r = lineThree(l);
  assert.equal(r.placementRule.placement, 'copy column');
  assert.ok(r.failed.includes('placement'));
});

test('text over GL, a covered lens or a no-fly crossing fails every class', () => {
  for (const name of ['L844', 'D2', 'P2']) {
    assert.deepEqual(lineThree(G[name], { textOverGl: ['derprito64bit'] }).failed, ['noTextOverGl']);
    assert.deepEqual(lineThree(G[name], { crossings: [{ x: 0, y: 0, w: 1, h: 1 }] }).failed, ['noFly']);
    const g = clone(G[name]);
    g.print.x = g.camera.x + g.lens.x * g.camera.w - g.print.w / 2;
    g.print.y = g.camera.y + g.lens.y * g.camera.h - g.print.h / 2;
    assert.ok(lineThree(g).failed.includes('lensClear'));
  }
});

test('a landscape phone 64rem wide keeps the height rule, and may use the copy column (placement follows the width)', () => {
  const g = clone(G.L844);
  g.wide = true;
  g.print.x = g.line.x;
  g.print.y = g.cta.y + g.cta.h + 4;
  g.print.h = g.vh - g.print.y; // kept in view for this case
  const r = lineThree(g);
  assert.equal(r.class, 'landscape phone');
  assert.match(r.rule.name, /laid-out height/);
  assert.equal(r.placementRule.placement, 'copy column');
  assert.equal(r.checks.placement, true);
});

test('a press that logs no flight leaves the no-fly check vacuous, so it fails', () => {
  assert.deepEqual(lineThree(G.L844, { flightFrames: 0 }).failed, ['noFly']);
  assert.equal(lineThree(G.L844, { flightFrames: 64 }).status, 'PASS');
});

test('boxGap: positive apart, 0 touching, negative overlapping', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(boxGap(a, { x: 14, y: 0, w: 10, h: 10 }), 4);
  assert.equal(boxGap(a, { x: 0, y: 10, w: 10, h: 10 }), 0);
  assert.ok(boxGap(a, { x: 5, y: 5, w: 10, h: 10 }) < 0);
});
