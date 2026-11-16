// W-V1 A14 (D-053) with GL at 640 x 400, DPR 1, Chromium and WebKit: while S is opening, open or closing, main.ts holds
// engine.sway false (restored on close); in the roll, 1 s after the last input, __vf.resetStats() then 3 s: every channel
// and frames read 0. The same on a cold /work/<slug>/ page. Engine counters only exist under ?vf-test (D-055).
import { test, expect } from '@playwright/test';
import { base, context, home, scrollTo, toFrame, untilState } from './lib.mjs';

const G1 = { viewport: { width: 640, height: 400 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false };
const GL_MS = 60000; // software GL in CI draws a few frames a second
/** Samples state and sway every 5 ms. */
const TRAIL = `(() => {
  const t = [];
  Object.defineProperty(window, '__swayTrail', { value: t });
  setInterval(() => { const v = window.__vf, e = window.__vfEngine; if (v && e) t.push([v.state(), e.sway]); }, 5);
})();`;
const zeros = { frames: 0, scene: 0, composite: 0, eyepiece: 0, readback: 0 };
const counts = (page) => page.evaluate(() => { const s = window.__vf.stats(); return { frames: s.frames, scene: s.scene, composite: s.composite, eyepiece: s.eyepiece, readback: s.readback, engine: s.engine }; });

test('A14 in the Viewfinder: no sway while a project is up; the roll at rest draws nothing', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, G1, { gl: true, init: [TRAIL] });
  const page = await ctx.newPage();
  try {
    await home(page);
    const hasGl = await page.evaluate(() => Boolean(window.__vfEngine));
    test.skip(!hasGl, 'no WebGL in this browser here: the gate runs A14 with GL on the reference host');
    await page.keyboard.press('Enter');
    await untilState(page, 'evf', 0, GL_MS);
    await page.keyboard.press('ArrowRight');
    await untilState(page, 'evf', 1, GL_MS);
    await page.keyboard.press('ArrowRight');
    await untilState(page, 'evf', 2, GL_MS);
    expect(await page.evaluate(() => window.__vfEngine.sway), 'sway on in the EVF').toBe(true);
    await page.keyboard.press('Enter');
    await untilState(page, 'open', 2, GL_MS);
    for (const y of [300, 700, 1100]) { await scrollTo(page, y); await page.waitForTimeout(120); }
    await page.mouse.move(320, 200);
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__vf.resetStats());
    await page.waitForTimeout(3000);
    const c = await counts(page);
    expect(c.engine).toBe(true);
    expect({ ...c, engine: undefined }, 'the roll at rest: every channel 0').toEqual({ ...zeros, engine: undefined });
    await page.keyboard.press('Escape');
    await untilState(page, 'evf', 2, GL_MS);
    expect(await page.evaluate(() => window.__vfEngine.sway), 'sway back on close').toBe(true);
    const trail = await page.evaluate(() => window.__swayTrail.filter(([s]) => ['opening', 'open', 'closing'].includes(s)));
    expect(trail.length, 'sampled while open').toBeGreaterThan(10);
    expect(trail.filter(([, sway]) => sway), 'no sway while opening, open or closing').toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('A14 on a cold /work/project-06/: the frame behind holds still once exposed', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, G1, { gl: true });
  const page = await ctx.newPage();
  try {
    await page.goto(`${base()}/work/project-06/?vf-test`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__vf && (window.__vfEngine || document.documentElement.classList.contains('nogl')), null, { timeout: GL_MS, polling: 50 });
    test.skip(!(await page.evaluate(() => Boolean(window.__vfEngine))), 'no WebGL in this browser here');
    expect(await page.evaluate(() => window.__vfEngine.sway)).toBe(false);
    await page.waitForFunction(() => window.__vf.stats().composite > 0, null, { timeout: GL_MS, polling: 50 });
    for (const y of [400, 900, 1600]) { await scrollTo(page, y); await page.waitForTimeout(120); }
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__vf.resetStats());
    await page.waitForTimeout(3000);
    const c = await counts(page);
    expect({ ...c, engine: undefined }).toEqual({ ...zeros, engine: undefined });
  } finally {
    await ctx.close();
  }
});
