// W-V1 A7 with GL at 640 x 400, DPR 1 (Chromium: WebKit has no layout-shift entries): the open zoom and the close move
// no layout. The frame's box stays the work frame's; the GL draws the travel and the corner marks follow it by
// transform (judge r2 must-fix wv1-open-zoom-cls). Every layout-shift entry counts here, input or not: a close from
// browser Back has no input exclusion, and the open's first 500 ms would hide a per-frame layout move. The gate times
// CLS at 60 Hz on the reference host; this fails on 9f25a82, whose travel wrote the frame's left, top, width and height
// on every frame.
import { test, expect } from '@playwright/test';
import { DESK, base, context, home, scrollTo, untilState } from './lib.mjs';

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

// fix-pass B4
/** The state at the first resize after __rzState is armed (set to null). */
const RZ_STATE = `addEventListener('resize', () => { if (window.__rzState === null) window.__rzState = window.__vf && window.__vf.state(); });`;

// f06: a resize that lands during the 1.1 s GL zoom: once it lands, the GL draws the open view over the new viewport,
// the marks stay off, and the frame's box is the new work frame (no layout move)
test('A2 / A13 with GL: a resize or rotate during the open: the open view fills the new viewport once it lands', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'the GL row runs in Chromium (the reference host\'s GPU)');
  test.setTimeout(240_000);
  const ctx = await context(browser, browserName, G1, { gl: true, init: [RZ_STATE] });
  const page = await ctx.newPage();
  try {
    await home(page);
    test.skip(!(await page.evaluate(() => Boolean(window.__vfEngine))), 'no WebGL in this browser here: the row guards on the reference host');
    await page.keyboard.press('Enter');
    await untilState(page, 'evf', 0, GL_MS);
    await page.keyboard.press('ArrowRight');
    await untilState(page, 'evf', 1, GL_MS);
    const fw0 = await page.evaluate(() => { window.__rzState = null; return document.documentElement.style.getPropertyValue('--fw'); });
    // the zoom is time-based (1.1 s), so the resize lands inside it even with software GL
    await page.keyboard.press('Enter');
    await page.setViewportSize({ width: 400, height: 640 });
    // mid-zoom, once main.ts's resize frame has run: the engine already draws the new full view (not the work frame)
    await page.waitForFunction((w) => document.documentElement.style.getPropertyValue('--fw') !== w, fw0, { timeout: GL_MS, polling: 'raf' });
    const mid = await page.evaluate(() => { const r = window.__vfEngine.st.rect; return { state: window.__vf.state(), rect: [r.x, r.y, r.w, r.h].map(Math.round) }; });
    test.info().annotations.push({ type: 'mid-zoom', description: JSON.stringify(mid) });
    if (mid.state === 'opening') expect(mid.rect, 'mid-zoom: the engine draws the new full view').toEqual([0, 0, 400, 640]);
    await untilState(page, 'open', 1, GL_MS);
    expect(await page.evaluate(() => window.__rzState), 'the resize landed during the open').toBe('opening');
    await page.waitForTimeout(300);
    const s = await page.evaluate(() => {
      const f = document.querySelector('[data-frame]').getBoundingClientRect();
      const r = window.__vfEngine.st.rect;
      return {
        rect: [r.x, r.y, r.w, r.h].map(Math.round),
        marks: [...document.querySelectorAll('[data-frame] .mk')].map((m) => getComputedStyle(m).visibility),
        frame: [f.left, f.top, f.width, f.height].map(Math.round),
        box: ['--fx', '--fy', '--fw', '--fh'].map((k) => Math.round(parseFloat(document.documentElement.style.getPropertyValue(k)))),
      };
    });
    expect(s.rect, 'the GL draws the open view over the new viewport').toEqual([0, 0, 400, 640]);
    expect(s.marks, 'the marks stay hidden while open').toEqual(['hidden', 'hidden', 'hidden', 'hidden']);
    expect(s.frame, 'the frame box is the new work frame (no layout move)').toEqual(s.box);
  } finally {
    await ctx.close();
  }
});

/** Wraps every window scroll listener (set before the page's modules run) and counts the scrollY reads made inside a
 *  scroll listener after a DOM write in the same dispatch (raw): each one is a forced style pass. A proxy, not a timing. */
function scrollProbe() {
  let inScroll = false, dirty = false, lastEv = null;
  const st = { reads: 0, raw: 0, listeners: 0 };
  window.__scrollProbe = st;
  const mo = new MutationObserver(() => { dirty = true; });
  mo.observe(document, { attributes: true, childList: true, characterData: true, subtree: true });
  const add = EventTarget.prototype.addEventListener;
  window.addEventListener = function (type, fn, opts) {
    if (type !== 'scroll' || typeof fn !== 'function') return add.call(this, type, fn, opts);
    st.listeners++;
    return add.call(this, type, function (ev) {
      // the first listener of a dispatch starts clean: only writes inside this dispatch count
      if (ev !== lastEv) { lastEv = ev; dirty = false; mo.takeRecords(); }
      inScroll = true;
      try { return fn.call(this, ev); } finally { inScroll = false; }
    }, opts);
  };
  const d = Object.getOwnPropertyDescriptor(window, 'scrollY') ?? Object.getOwnPropertyDescriptor(Window.prototype, 'scrollY');
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    get() {
      st.reads++;
      if (inScroll && (dirty || mo.takeRecords().length)) { dirty = true; st.raw++; }
      return d.get.call(window);
    },
  });
}

// f29: on a cold page the frame's dim listener runs before the roll's, so it reads scrollY before the roll's focus
// writes in the same scroll dispatch (the roll's own read comes before its writes too)
test('A7 cold page with GL: the frame\'s dim reads the scroll before the roll writes (no forced style pass)', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'the GL row runs in Chromium (the reference host\'s GPU)');
  test.setTimeout(240_000);
  const ctx = await context(browser, browserName, DESK, { gl: true, init: [`(${scrollProbe})();`] });
  const page = await ctx.newPage();
  try {
    await page.goto(`${base()}/work/project-06/?vf-test`, { waitUntil: 'load' });
    const gl = await page.waitForFunction(() => Boolean(window.__vfEngine), null, { timeout: 20000 }).then(() => true, () => false);
    test.skip(!gl, 'no WebGL in this browser here: the row guards on the reference host');
    const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const seen = new Set();
    for (let k = 1; k <= 12; k++) {
      await scrollTo(page, Math.round((max * k) / 12));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      seen.add(await page.evaluate(() => document.querySelector('[data-print-count]')?.textContent ?? ''));
    }
    const p = await page.evaluate(() => window.__scrollProbe);
    test.info().annotations.push({ type: 'scroll probe', description: JSON.stringify({ ...p, focus: [...seen] }) });
    expect(seen.size, 'the roll changed focus as it scrolled').toBeGreaterThanOrEqual(3);
    expect(p.reads, 'scrollY was read').toBeGreaterThan(0);
    expect(p.raw, 'no scrollY read after a DOM write in the same scroll dispatch').toBe(0);
  } finally {
    await ctx.close();
  }
});

/** Logs, on every animation frame from now, whether the HUD's focal-length readout and the open view's bar readout are
 *  shown (visible, effective opacity over 0.02 with every ancestor counted) and the bar readout's effective opacity. */
function readoutSampler() {
  const eff = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none') return 0; o *= parseFloat(s.opacity); } return o; };
  const shown = (el) => getComputedStyle(el).visibility === 'visible' && !el.closest('[hidden]') && eff(el) > 0.02;
  const hud = document.querySelector('.ro--fl'), bar = document.querySelector('[data-fl2]');
  const log = [];
  let stop = false;
  window.__ro = { log, stop: () => { stop = true; return log; } };
  const t0 = performance.now();
  const f = () => {
    if (stop) return;
    log.push({ t: Math.round(performance.now() - t0), hud: shown(hud), bar: shown(bar), barO: Math.round(eff(bar) * 100) / 100 });
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

// wv1-landing-readout-double: the zoom's 23 to 56 mm readout hands over to the open view's bar at the landing; no frame
// shows both (the gate saw "56 mm" twice in WebKit at 1440) or neither
test('A2 with GL at 1440: one focal-length readout on every frame of the open\'s landing', async ({ browser, browserName }) => {
  test.setTimeout(240_000);
  const ctx = await context(browser, browserName, DESK, { gl: true });
  const page = await ctx.newPage();
  try {
    await home(page);
    test.skip(!(await page.evaluate(() => Boolean(window.__vfEngine))), 'no WebGL in this browser here: the row guards on the reference host');
    await page.keyboard.press('Enter');
    await untilState(page, 'evf', 0, GL_MS);
    await page.keyboard.press('ArrowRight');
    await untilState(page, 'evf', 1, GL_MS);
    await page.waitForTimeout(600);
    await page.evaluate(`(${readoutSampler})()`);
    await page.keyboard.press('Enter');
    await untilState(page, 'open', 1, GL_MS);
    await page.waitForTimeout(400);
    const log = await page.evaluate(() => window.__ro.stop());
    const both = log.filter((x) => x.hud && x.bar), none = log.filter((x) => !x.hud && !x.bar);
    test.info().annotations.push({ type: 'readouts', description: JSON.stringify({ frames: log.length, both: both.length, none: none.length }) });
    expect(log.filter((x) => x.barO > 0.02 && x.barO < 0.98).length, 'frames sampled while the bar fades in').toBeGreaterThan(0);
    expect(both.map((x) => `${x.t} ms (bar ${x.barO})`), 'no frame shows both readouts').toEqual([]);
    expect(none.map((x) => `${x.t} ms`), 'no frame shows neither').toEqual([]);
  } finally {
    await ctx.close();
  }
});
