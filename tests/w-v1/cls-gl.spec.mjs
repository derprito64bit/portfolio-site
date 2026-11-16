// W-V1 A7 with GL at 640 x 400, DPR 1 (Chromium: WebKit has no layout-shift entries): the open zoom and the close move
// no layout. The frame's box stays the work frame's; the GL draws the travel and the corner marks follow it by
// transform (judge r2 must-fix wv1-open-zoom-cls). Every layout-shift entry counts here, input or not: a close from
// browser Back has no input exclusion, and the open's first 500 ms would hide a per-frame layout move. The gate times
// CLS at 60 Hz on the reference host; this fails on 9f25a82, whose travel wrote the frame's left, top, width and height
// on every frame.
import { test, expect } from '@playwright/test';
import { context, home, untilState } from './lib.mjs';

const G1 = { viewport: { width: 640, height: 400 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false };
const GL_MS = 60000; // software GL in CI draws a few frames a second
const LIMIT = 0.02;
const SHIFTS = `(() => { window.__sh = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__sh.push({ t: e.startTime, v: e.value, src: (e.sources || []).map((s) => (s.node && s.node.nodeType === 1 ? s.node.tagName.toLowerCase() + '.' + String(s.node.className).trim().split(/\\s+/).join('.') : '#text')) }); }).observe({ type: 'layout-shift', buffered: true }); })();`;

/** The sum of every layout shift since `from` (performance.now()), and the nodes that moved. */
const shifts = (page, from) => page.evaluate((t0) => {
  const l = window.__sh.filter((e) => e.t >= t0);
  return { sum: Math.round(l.reduce((s, e) => s + e.v, 0) * 10000) / 10000, nodes: [...new Set(l.flatMap((e) => e.src))].slice(0, 8), n: l.length };
}, from);
const now = (page) => page.evaluate(() => performance.now());

test('A7 with GL: the open zoom and the close (Esc, and browser Back) shift no layout; the marks travel by transform', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebKit has no layout-shift entries; the gate traces CLS in Chromium');
  test.setTimeout(240_000);
  const ctx = await context(browser, browserName, G1, { gl: true, init: [SHIFTS] });
  const page = await ctx.newPage();
  try {
    await home(page);
    test.skip(!(await page.evaluate(() => Boolean(window.__vfEngine))), 'no WebGL in this browser here: the gate checks CLS with GL on the reference host');
    await page.keyboard.press('Enter');
    await untilState(page, 'evf', 0, GL_MS);
    for (let i = 1; i <= 2; i++) {
      await page.keyboard.press('ArrowRight');
      await untilState(page, 'evf', i, GL_MS);
    }
    const box0 = await page.evaluate(() => { const r = document.querySelector('[data-frame]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); });

    // the open from Enter, to 1 s after the landing: the marks move (by transform), the frame's box never does
    let t0 = await now(page);
    await page.keyboard.press('Enter');
    // mid-travel: the marks have left the box's corners while the box itself stays put
    await page.waitForFunction(() => window.__vf.state() === 'opening', null, { timeout: GL_MS, polling: 16 });
    await page.waitForTimeout(350);
    const mid = await page.evaluate(() => {
      const f = document.querySelector('[data-frame]').getBoundingClientRect();
      return { state: window.__vf.state(), box: [f.left, f.top, f.width, f.height].map(Math.round), mark: document.querySelector('[data-frame] .mk--tl')?.style.transform || '' };
    });
    if (mid.state === 'opening') {
      expect(mid.box, 'the frame box does not move during the travel').toEqual(box0);
      expect(mid.mark, 'the top-left mark travels by transform').toMatch(/translate\(-\d/);
    }
    await untilState(page, 'open', 2, GL_MS);
    await page.waitForTimeout(1000);
    const open = await shifts(page, t0);
    test.info().annotations.push({ type: 'open shifts', description: JSON.stringify(open) });
    expect(open.sum, `layout shift over the open, every entry counted (moved: ${open.nodes.join(', ')})`).toBeLessThanOrEqual(LIMIT);
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-frame] .mk')].every((m) => getComputedStyle(m).visibility === 'hidden')), 'open: the marks are off the page').toBe(true);

    // Esc: the close travel
    t0 = await now(page);
    await page.keyboard.press('Escape');
    await untilState(page, 'evf', 2, GL_MS);
    await page.waitForTimeout(1000);
    const esc = await shifts(page, t0);
    expect(esc.sum, `layout shift over the close by Esc (moved: ${esc.nodes.join(', ')})`).toBeLessThanOrEqual(LIMIT);
    const home2 = await page.evaluate(() => ({
      box: (() => { const r = document.querySelector('[data-frame]').getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round); })(),
      marks: [...document.querySelectorAll('[data-frame] .mk')].map((m) => [m.style.transform, getComputedStyle(m).visibility]),
    }));
    expect(home2.box, 'the box is the work frame').toEqual(box0);
    expect(home2.marks, 'the marks are home: no transform left, visible').toEqual(Array(4).fill(['', 'visible']));

    // open again, then browser Back (no input exclusion at all)
    await page.keyboard.press('Enter');
    await untilState(page, 'open', 2, GL_MS);
    await page.waitForTimeout(400);
    t0 = await now(page);
    await page.goBack();
    await untilState(page, 'evf', 2, GL_MS);
    await page.waitForTimeout(1000);
    const back = await shifts(page, t0);
    expect(back.sum, `layout shift over the close by browser Back (moved: ${back.nodes.join(', ')})`).toBeLessThanOrEqual(LIMIT);
  } finally {
    await ctx.close();
  }
});
