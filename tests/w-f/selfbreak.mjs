// W-F self-break (the crew loop's list), Chromium and WebKit. Each case tries to break the stage, then checks that the
// page is whole: the console gate (only the failures a case plants are expected), GL still presents what it last drew,
// the canvas stays on its buffer-pixel grid and as wide as its layout (W-D013 as amended), there is one ticker chain
// (the gate's rAF count, dependencies aside, equals __stage.stats.ticks over an active window), and the stage settles
// (__stage.settled). Round 2: every case can fail on what it claims (round-1 review, Breakers 1.1 #3, 1.2 #3, 1.3 #3).
//   rest        rest past the idle detach (2.5 x durations.idleDetach), then a real wheel, a real press and a recolour:
//               no error, each settles, the recolour is presented
//   tierDrop    from full: a recolour, then a demotion to lite inside its present tail (lite's DPR and pixel caps from
//               the json budgets block hold on the allocated canvas, the grid holds, the recolour is presented), then
//               a recolour and a drop to static inside its tail: GL gone, the stage settles and stops ticking (round-3
//               should-fix S4; plant P keeps the full canvas after the drop and must fail it)
//   staticScheduled a drop to static while GL is only scheduled: glState off, no boot, settled within 10 s (S5)
//   ctxLoss     a recolour, then a context loss inside its tail (the restore waits for webglcontextlost); after the
//               restore, with no input, the canvas shows the recoloured print again (Breaker 2.3 #3: a restore that
//               re-takes the slots and never redraws leaves the bare page); then a recolour is presented; settles
//   throw       an entity whose step() throws once in the middle of a spin: reported once, the spin finishes, the
//               stage still renders, presents and sleeps (stats.hookErrors)
//   finishThrow two running timelines, the first's finish() throws once; reduced motion turned on: the second ends in
//               the same frame, setMotion does not throw, Lenis goes (full tier), one error counted, it settles
//               (round-2 should-fix S1, Breaker 2.1 #1)
//   timelineThrow a timeline whose update throws on every frame from 400 ms: it is finished and dropped after its
//               first throws (not one per frame), the stage settles and a recolour is presented (Breaker 2.1 #1)
//   lenisRace   reduced motion, or a drop to lite or static, while Lenis's chunk is still loading: Lenis stays off once
//               it arrives (Breaker 2.3 #1, W-D014); with no change it comes on (the control)
//   entityThrow one entity's snap(), unbind() and restore() each throw once (Breaker 2.2 #3): reduced motion still
//               snaps the next entity; a Swup visit still forgets the old slots and rebinds the persistent cube; a
//               context restore still redraws the other prints with no input
//   renderThrow a three hook (onBeforeRender) that throws once inside one view's draw, through a ticker frame and
//               through a layout render (renderNow): the other views still draw that frame, the error is counted
//   crewThrow   an entity factory whose match() throws for one slot (the others still bind, nothing reaches the
//               caller) and a registered develop impl that takes its slot and throws (the call resolves through next,
//               the slot is handed back); both counted (round-3 should-fix S1, Breaker 3.1 #3)
//   scrollRestore a full-load Back and a reload land where the reader was (+-1 px), also after a Swup visit touched
//               the entry (round-3 should-fix S8, Breaker 3.3 #3)
//   gapGovernor a 3 s bfcache stay during the opening or a Lenis glide does not step the tier (round-3 should-fix S7,
//               Breaker 3.3 #2; Chromium with the back/forward cache on)
//   history     Swup to a project and Back (focus on the print link; settles; one chain; grid), a real bfcache restore
//               (Chromium with the back/forward cache on: pageshow.persisted; one chain; recolour presented), a
//               reload and a hash arrival. Playwright's WebKit never restores from its page cache: its row records
//               the Back as a fresh load and asserts the rest
//   rapid       actions 1 to 4 in a row with real input: on /bench/ a wheel, a click on a print link (a Swup visit),
//               Back and a second click, no waits; on / four Shutter presses. No error, it settles, one chain
//   resize      a resize and an orientation change in the middle of a cube spin: the cube stays on its slot, the
//               canvas on its grid and as wide as #rail and the body, and it settles
//   reduced     reduced motion turned on in the middle of a spin: the spin ends at once and the stage settles
// Usage: node tests/w-f/selfbreak.mjs [--out selfbreak.json] [--profiles D2,P2,WK-P2] [--only rest,history]
import sharp from 'sharp';
import { durations } from '../../src/lib/tokens.js';
import { PROFILES, budget, cliMain, consoleGate, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';
import { INIT as COUNTERS_INIT } from '../harness/counters/run.mjs';

const near = (a, b, tol = 4) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const touch = (profile) => PROFILES[profile].hasTouch;
/** The stage settles within this long after an action (the idle detach plus a present tail, with room). */
const SETTLE_MS = durations.idleDetach * 4;

async function open(base, profile, path, extra = {}) {
  const ctx = await newContext(profile, 'auto', extra);
  await ctx.addInitScript({ content: COUNTERS_INIT });
  const page = await ctx.newPage();
  const gate = consoleGate(page);
  await page.goto(base + path, { waitUntil: 'load' });
  return { ctx, page, gate };
}
async function bench(base, profile, query = '', tier = 'lite') {
  const o = await open(base, profile, `/bench/?tier=${tier}${query}`);
  await o.page.waitForFunction(() => window.__stage?.glState === 'ready' && window.__stage.fixtures, null, { polling: 100, timeout: 20000 });
  await o.page.evaluate(() => document.querySelector('[data-gl-id="fx-1"]').scrollIntoView({ block: 'center' }));
  await waitSettled(o.page, 10000);
  return o;
}
async function colourOf(page, id = 'fx-1') {
  const box = await page.evaluate((i) => { const r = document.querySelector(`[data-gl-id="${i}"]`).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, id);
  const clip = { x: Math.round(box.x + box.w * 0.3), y: Math.round(box.y + box.h * 0.6), width: Math.max(4, Math.round(box.w * 0.4)), height: Math.max(4, Math.round(box.h * 0.25)) };
  const { data } = await sharp(await page.screenshot({ clip })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < data.length; i += 3) px.push([data[i], data[i + 1], data[i + 2]]);
  const med = (k) => px.map((p) => p[k]).sort((a, b) => a - b)[Math.floor(px.length / 2)];
  return [med(0), med(1), med(2)];
}
const sleeps = (page) => page.evaluate(() => window.__stage.stats.sleeps);
async function tintAndRest(page, rgb, id = 'fx-1') {
  const s0 = await sleeps(page);
  await page.evaluate(([i, c]) => window.__stage.fixtures.tint(i, ...c), [id, rgb]);
  await page.waitForFunction((n) => window.__stage.stats.sleeps > n, s0, { polling: 50, timeout: 10000 });
  await sleep(80);
  return colourOf(page, id);
}
/**
 * In the page: (optionally recolour a quad, then) a context loss, and the restore once webglcontextlost has fired: one
 * rAF was not always enough for Chromium to dispatch it, and a restore before it is refused (Breaker 2.3 #3).
 */
async function lossAndRestore({ tint } = {}) {
  const s = window.__stage;
  const c = document.getElementById('gl');
  const within = (p, ms) => Promise.race([p.then(() => true), new Promise((res) => setTimeout(() => res(false), ms))]);
  if (tint) {
    s.fixtures.tint(...tint);
    await new Promise((res) => requestAnimationFrame(res));
  }
  const lost = new Promise((res) => c.addEventListener('webglcontextlost', res, { once: true }));
  const restored = new Promise((res) => c.addEventListener('webglcontextrestored', res, { once: true }));
  s.gl.forceContextLoss();
  const lostEvent = await within(lost, 3000);
  // The browser allows the restore only once the lost event's dispatch has finished (its default prevented): a task.
  await new Promise((res) => setTimeout(res, 50));
  const isGlAfterLoss = document.querySelectorAll('.is-gl').length;
  s.gl.forceContextRestore();
  const restoredEvent = await within(restored, 3000);
  return { lostEvent, restoredEvent, isGlAfterLoss, tier: s.tier, restores: s.stats.restores };
}
const verdict = (gate, expect = null) => {
  const v = gate.verdict();
  const planted = expect ? v.failures.filter((f) => expect.test(f.text)) : [];
  const others = v.failures.filter((f) => !expect || !expect.test(f.text));
  return { failures: others.map((f) => `${f.channel}/${f.level}: ${f.text.slice(0, 140)}`), planted: planted.length, ok: others.length === 0 };
};
/**
 * The stage settles within `ms` (after a short wait, so input that has not reached the page yet cannot read as settled),
 * then ticks no more for a second (no chain kept awake behind it).
 */
async function settles(page, ms = SETTLE_MS) {
  await sleep(250);
  const settled = await waitSettled(page, ms);
  const t0 = await page.evaluate(() => window.__stage.stats.ticks);
  await sleep(durations.idleDetach);
  const t1 = await page.evaluate(() => ({ ticks: window.__stage.stats.ticks, settled: window.__stage.settled }));
  return { settled, still: t1.ticks === t0 && t1.settled, ok: settled && t1.ticks === t0 && t1.settled };
}
/** The canvas on its buffer-pixel grid and as wide as its layout (#59 item 3, W-D013 as amended). */
const gridOf = (page) => page.evaluate(() => {
  const s = window.__stage;
  if (!s.gl || s.tier === 'static') return { ok: true, gl: false };
  const c = document.getElementById('gl');
  const v = s.view;
  const cssH = c.getBoundingClientRect().height;
  const railW = document.getElementById('rail').getBoundingClientRect().width;
  const r = { gl: true, W: v.W, Hc: v.Hc, dpr: v.dpr, width: c.width, height: c.height, cssH, railW, bodyW: document.body.clientWidth };
  return { ...r, ok: Math.abs(c.width / v.W - v.dpr) < 1e-6 && Math.abs(c.height / v.Hc - v.dpr) < 1e-6 && Math.abs(cssH - v.Hc) <= 1 / 64 + 1e-6 && v.W === railW && railW === r.bodyW };
});
/**
 * One ticker chain: over an active window (a wheel down and up), the gate's rAF callbacks other than Lenis's and
 * Swup's equal the stage's ticks. A second chain (a duplicated ticker, a planted loop) adds callbacks the stage does
 * not count.
 */
async function oneChain(page, profile) {
  const snap = () => page.evaluate(() => {
    const g = window.__gateCounters;
    return { raf: g.raf - Object.values(g.rafByDependency).reduce((x, y) => x + y, 0), ticks: window.__stage.stats.ticks, tier: window.__stage.tier };
  });
  await waitSettled(page, SETTLE_MS);
  const a = await snap();
  const { width, height } = page.viewportSize();
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.wheel(0, 160);
  await sleep(250);
  await page.mouse.wheel(0, -160);
  await sleep(250);
  await waitSettled(page, SETTLE_MS);
  const b = await snap();
  const raf = b.raf - a.raf;
  const ticks = b.ticks - a.ticks;
  // On the static tier the stage does not tick: one chain then means no rAF at all.
  return { raf, ticks, tier: b.tier, ok: raf === ticks && (b.tier === 'static' || ticks > 0), input: touch(profile) ? 'wheel (touch profile)' : 'wheel' };
}
async function press(page, profile, selector) {
  if (touch(profile)) await page.tap(selector);
  else await page.click(selector);
}

const CASES = {
  async rest(base, profile) {
    const { ctx, page, gate } = await bench(base, profile);
    await sleep(durations.idleDetach * 2.5); // well past the idle detach: the stage is asleep
    const asleep = await page.evaluate(() => window.__stage.settled);
    const { width, height } = page.viewportSize();
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, 180); // a real scroll after the rest
    const afterWheel = await settles(page);
    await sleep(durations.idleDetach * 2.5);
    await press(page, profile, '#bench-title'); // a real press after another rest (a pointerdown that navigates nowhere)
    const afterPress = await settles(page);
    await page.evaluate(() => document.querySelector('[data-gl-id="fx-1"]').scrollIntoView({ block: 'center' }));
    await waitSettled(page, SETTLE_MS);
    const got = await tintAndRest(page, [250, 30, 30]);
    const grid = await gridOf(page);
    const c = verdict(gate);
    await ctx.close();
    return { asleepBefore: asleep, afterWheel, afterPress, got, grid, ...c, pass: asleep && afterWheel.ok && afterPress.ok && near(got, [250, 30, 30]) && grid.ok && c.ok };
  },
  async tierDrop(base, profile) {
    // Starts on full (round-3 should-fix S4, Breaker 3.2 #2: '?tier=lite&tier=full' started on lite, so the drop to lite
    // was a no-op). A recolour, then a drop to lite inside its present tail: lite's caps hold (DPR and pixels, from the
    // json budgets block) on the canvas the GPU allocates, the canvas stays on its grid, and the recolour is presented
    // at the lite size; then a recolour and a drop to static inside its tail: GL gone, the stage settles and stops.
    const caps = { dpr: budget('site.dprCap.lite'), px: budget('site.canvasMpx.lite') * 1e6 };
    const { ctx, page, gate } = await bench(base, profile, '', 'full');
    const startTier = await page.evaluate(() => window.__stage.tier);
    await page.evaluate(async () => {
      const s = window.__stage;
      s.fixtures.tint('fx-1', 250, 30, 30);
      await new Promise((res) => requestAnimationFrame(res));
      s.demote('lite', 'self-break');
    });
    await sleep(durations.idleDetach * 1.5); // the reallocation, its render and tail, then the idle detach
    const atLite = await page.evaluate(() => {
      const s = window.__stage;
      const c = document.getElementById('gl');
      return { tier: s.tier, dpr: s.view.dpr, W: s.view.W, Hc: s.view.Hc, width: c.width, height: c.height, px: c.width * c.height, statPx: s.stats.canvasPx };
    });
    const liteGrid = await gridOf(page);
    const liteColour = await colourOf(page, 'fx-1');
    const r = await page.evaluate(async () => {
      const s = window.__stage;
      s.fixtures.tint('fx-1', 30, 30, 250);
      await new Promise((res) => requestAnimationFrame(res));
      s.demote('static', 'self-break');
      const draws = s.stats.draws;
      await new Promise((res) => setTimeout(res, 300));
      return { tier: s.tier, isGl: document.querySelectorAll('.is-gl').length, railShown: getComputedStyle(document.getElementById('rail')).display !== 'none', drawsAfter: s.stats.draws - draws };
    });
    const after = await settles(page);
    const c = verdict(gate);
    await ctx.close();
    // The DPR cap on the buffer the GPU holds: at most floor(css size x cap) pixels each way (the stage's grid DPR sits a
    // hair above a whole-pixel ratio by design, rail.ts gridDpr), and the pixel cap on their product.
    const capsOk = atLite.tier === 'lite' && atLite.width <= Math.floor(atLite.W * caps.dpr + 1e-6) && atLite.height <= Math.floor(atLite.Hc * caps.dpr + 1e-6) && atLite.px <= caps.px && atLite.statPx === atLite.px;
    // WebKit shows no GL after a buffer reallocation (#88, pre-existing): there the colour is recorded, not asserted.
    const presents = PROFILES[profile].browser === 'chromium';
    return {
      startTier, atLite, caps, capsOk, liteGrid, liteColour, colourAsserted: presents, ...r, after, ...c,
      pass: startTier === 'full' && capsOk && liteGrid.ok && (!presents || near(liteColour, [250, 30, 30])) && r.tier === 'static' && r.isGl === 0 && !r.railShown && r.drawsAfter <= 1 && after.ok && c.ok,
    };
  },
  async staticScheduled(base, profile) {
    // A drop to static while GL is only scheduled (Breaker 3.2 #3, round-3 should-fix S5): the boot never runs, glState
    // goes off and the page settles within 10 s. On / the boot is scheduled until first paint's idle callback (full) or
    // the near observer (lite): the drop comes from the head of the page, before any of those can fire.
    const ctx = await newContext(profile);
    await ctx.addInitScript({ content: `addEventListener('DOMContentLoaded', () => { const t = setInterval(() => { const s = window.__stage; if (!s) return; clearInterval(t); window.__stateAtDrop = s.glState; s.demote('static', 'self-break'); }, 0); });` });
    const page = await ctx.newPage();
    const gate = consoleGate(page);
    await page.goto(`${base}/`, { waitUntil: 'load' });
    const settled = await waitSettled(page, 10000);
    const s = await page.evaluate(() => ({ stateAtDrop: window.__stateAtDrop ?? null, glState: window.__stage.glState, tier: window.__stage.tier, glStarts: window.__stage.marks().filter((m) => m.name === 'stage:gl-start').length }));
    const c = verdict(gate);
    await ctx.close();
    return { ...s, settled, ...c, pass: ['scheduled', 'deferred'].includes(s.stateAtDrop) && settled && s.glState === 'off' && s.tier === 'static' && s.glStarts === 0 && c.ok };
  },
  async ctxLoss(base, profile) {
    const { ctx, page, gate } = await bench(base, profile);
    const r = await page.evaluate(lossAndRestore, { tint: ['fx-1', 250, 30, 30] });
    // No input after the restore: the stage must draw the prints back by itself.
    const after = await settles(page);
    const redrawn = await colourOf(page, 'fx-1');
    const got = await tintAndRest(page, [30, 30, 250]);
    const grid = await gridOf(page);
    const c = verdict(gate);
    await ctx.close();
    return { ...r, after, redrawn, got, grid, ...c, pass: r.lostEvent && r.restoredEvent && r.isGlAfterLoss === 0 && r.restores >= 1 && r.tier === 'lite' && after.ok && near(redrawn, [250, 30, 30]) && near(got, [30, 30, 250]) && grid.ok && c.ok };
  },
  async finishThrow(base, profile) {
    // The full tier (Lenis on) where the profile has a mouse; touch profiles run lite (no Lenis to drop).
    const full = !touch(profile);
    const { ctx, page, gate } = await bench(base, profile, '', full ? 'full' : 'lite');
    const lenisBefore = full ? await page.waitForFunction(() => document.documentElement.classList.contains('lenis'), null, { polling: 100, timeout: 8000 }).then(() => true, () => false) : null;
    const r = await page.evaluate(async () => {
      const s = window.__stage;
      const e = s.gl.entity('fx-1');
      const make = (id, throwOnce) => {
        let done = false;
        let threw = false;
        return {
          id,
          get active() { return !done; },
          finish() {
            if (throwOnce && !threw) { threw = true; throw new Error('self-break: timeline finish threw'); }
            done = true;
          },
        };
      };
      const A = make('self-break:A', true);
      const B = make('self-break:B', false);
      const queue = [A, B];
      e.startSpin = () => queue.shift();
      s.fixtures.spin(0, 'fx-1');
      s.fixtures.spin(0, 'fx-1');
      const h0 = s.stats.hookErrors;
      await new Promise((res) => requestAnimationFrame(res));
      let threwToCaller = null;
      try {
        s.setMotion('reduced');
      } catch (err) {
        threwToCaller = String(err).slice(0, 120);
      }
      const sameTask = B.active;
      await new Promise((res) => requestAnimationFrame(res));
      return { bActiveSameTask: sameTask, bActiveNextFrame: B.active, threwToCaller, hookErrors: s.stats.hookErrors - h0, motion: s.motion, lenisAfter: document.documentElement.classList.contains('lenis') };
    });
    const after = await settles(page);
    const c = verdict(gate, /self-break: timeline finish threw/);
    await ctx.close();
    return {
      full, lenisBefore, ...r, after, ...c,
      pass: !r.bActiveSameTask && !r.bActiveNextFrame && r.threwToCaller === null && r.hookErrors === 1 && r.motion === 'reduced' && (!full || (lenisBefore && !r.lenisAfter)) && after.ok && c.planted >= 1 && c.ok,
    };
  },
  async timelineThrow(base, profile) {
    const { ctx, page, gate } = await bench(base, profile);
    await page.evaluate(() => document.querySelector('[data-gl-id="fixture-cube"]').scrollIntoView({ block: 'center' }));
    await waitSettled(page, SETTLE_MS);
    const r = await page.evaluate(async () => {
      const s = window.__stage;
      const e = s.gl.entity('fixture-cube');
      let spin = 0;
      let throws = 0;
      let armed = true;
      const at = performance.now() + 400;
      // The spin tween writes entity.spin from its `active` getter on every frame: from 400 ms on, each write throws.
      Object.defineProperty(e, 'spin', {
        configurable: true,
        get: () => spin,
        set: (v) => {
          if (armed && performance.now() > at) { throws++; throw new Error('self-break: timeline update threw'); }
          spin = v;
        },
      });
      const h0 = s.stats.hookErrors;
      s.fixtures.spin(1200);
      await new Promise((res) => setTimeout(res, 2600));
      armed = false;
      return { throws, hookErrors: s.stats.hookErrors - h0, spinning: s.fixtures.spinning() };
    });
    const after = await settles(page);
    await page.evaluate(() => document.querySelector('[data-gl-id="fx-1"]').scrollIntoView({ block: 'center' }));
    await waitSettled(page, SETTLE_MS);
    const got = await tintAndRest(page, [30, 200, 30]);
    const c = verdict(gate, /self-break: timeline update threw/);
    await ctx.close();
    // Its `active` throws, then the finish that ends it throws once more; never one error per frame.
    return { ...r, after, got, ...c, pass: r.throws >= 1 && r.throws <= 3 && r.hookErrors === r.throws && !r.spinning && after.ok && near(got, [30, 200, 30]) && c.planted >= 1 && c.ok };
  },
  async lenisRace(base, profile) {
    // Lenis's chunk held 2.5 s in flight (network latency); reduced motion or a drop to lite or static lands inside the
    // hold. When the chunk arrives Lenis must stay off (W-D014: full tier with motion full only). The control changes
    // nothing and Lenis comes on.
    const LENIS = /\/_astro\/lenis\.[\w-]+\.js$/;
    // Playwright's WebKit routing logs a failed blob: request and "preloaded but not used" warnings (Breaker 2.3): those
    // are the probe's, expected there and nowhere else.
    const routeNoise = PROFILES[profile].browser === 'webkit' ? /preload|blob:/i : null;
    const rows = [];
    for (const change of [null, 'reduced', 'lite', 'static']) {
      const ctx = await newContext(profile);
      let held = 0;
      await ctx.route(LENIS, async (route) => {
        held++;
        await sleep(2500);
        await route.continue();
      });
      const page = await ctx.newPage();
      const gate = consoleGate(page);
      const arrived = page.waitForResponse(LENIS, { timeout: 20000 }).then(() => true, () => false);
      await page.goto(`${base}/bench/?tier=full`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__stage?.glState === 'ready', null, { polling: 50, timeout: 20000 });
      await sleep(300);
      if (change === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
      else if (change) await page.evaluate((t) => window.__stage.demote(t, 'self-break'), change);
      const got = await arrived;
      await sleep(500);
      const s = await page.evaluate(() => ({ lenis: document.documentElement.classList.contains('lenis'), tier: window.__stage.tier, motion: window.__stage.motion }));
      const c = verdict(gate, routeNoise);
      await ctx.close();
      rows.push({ change, held, arrived: got, ...s, console: c, ok: held >= 1 && got && (change === null ? s.lenis : !s.lenis) && c.ok });
    }
    return { rows, pass: rows.every((r) => r.ok) };
  },
  async entityThrow(base, profile) {
    // (a) snap: fx-1's snap throws once; fx-2 moves until its snap runs. Reduced motion must still snap fx-2.
    const A = await bench(base, profile);
    const snap = await A.page.evaluate(async () => {
      const s = window.__stage;
      const e1 = s.gl.entity('fx-1');
      const e2 = s.gl.entity('fx-2');
      let thrown = 0;
      let snaps2 = 0;
      let moving2 = true;
      e1.snap = () => { if (!thrown++) throw new Error('self-break: entity snap threw'); };
      e2.step = () => moving2;
      e2.snap = () => { snaps2++; moving2 = false; };
      s.invalidate();
      await new Promise((res) => setTimeout(res, 200));
      let threwToCaller = null;
      try {
        s.setMotion('reduced');
      } catch (err) {
        threwToCaller = String(err).slice(0, 120);
      }
      const h = s.stats.hookErrors;
      await new Promise((res) => setTimeout(res, 400));
      return { thrown, snaps2, moving2, threwToCaller, hookErrors: h };
    });
    snap.after = await settles(A.page);
    snap.console = verdict(A.gate, /self-break: entity snap threw/);
    await A.ctx.close();
    snap.ok = snap.thrown === 1 && snap.snaps2 === 1 && !snap.moving2 && snap.threwToCaller === null && snap.after.ok && snap.console.planted >= 1 && snap.console.ok;
    // (b) unbind: fx-1's unbind throws once on a Swup visit to /bench/swap/. The old slots must be forgotten and the
    // persistent cube must rebind to the new page's slot (no duplicate-id warning, the cube drawn).
    const B = await bench(base, profile);
    await B.page.evaluate(() => {
      const e1 = window.__stage.gl.entity('fx-1');
      const orig = e1.unbind.bind(e1);
      let n = 0;
      e1.unbind = () => { if (!n++) throw new Error('self-break: entity unbind threw'); return orig(); };
    });
    await press(B.page, profile, '.bench-head a[href="/bench/swap/"]');
    const arrived = await B.page.waitForFunction(() => location.pathname === '/bench/swap/' && !document.documentElement.hasAttribute('aria-busy'), null, { polling: 50, timeout: 10000 }).then(() => true, () => false);
    await B.page.evaluate(() => document.querySelector('[data-gl-id="fixture-cube"]').scrollIntoView({ block: 'center' }));
    const unbindAfter = await settles(B.page);
    const unbind = await B.page.evaluate(() => ({ slots: window.__stage.slots().map((x) => x.id).sort(), cube: window.__stage.bounds('fixture-cube')?.gl ?? null, entities: window.__stage.gl.info().entities, hookErrors: window.__stage.stats.hookErrors }));
    Object.assign(unbind, { arrived, after: unbindAfter, console: verdict(B.gate, /self-break: entity unbind threw/) });
    await B.ctx.close();
    unbind.ok = unbind.arrived && unbind.slots.join(',') === 'fixture-cube,fx-7,fx-8,fx-9' && Boolean(unbind.cube) && unbind.entities === 4 && unbind.after.ok && unbind.console.planted >= 1 && unbind.console.ok;
    // (c) restore: fx-1's restore throws once after a context loss. fx-2 (recoloured first) must be drawn again with no
    // input: the other entities still restore, and the stage still resizes and redraws.
    const C = await bench(base, profile);
    await C.page.evaluate(() => document.querySelector('[data-gl-id="fx-2"]').scrollIntoView({ block: 'center' }));
    await waitSettled(C.page, SETTLE_MS);
    const before = await tintAndRest(C.page, [30, 30, 250], 'fx-2');
    await C.page.evaluate(() => {
      const e1 = window.__stage.gl.entity('fx-1');
      const orig = e1.restore.bind(e1);
      let n = 0;
      e1.restore = () => { if (!n++) throw new Error('self-break: entity restore threw'); return orig(); };
    });
    const restore = await C.page.evaluate(lossAndRestore, {});
    restore.after = await settles(C.page);
    restore.redrawn = await colourOf(C.page, 'fx-2');
    restore.before = before;
    restore.console = verdict(C.gate, /self-break: entity restore threw/);
    await C.ctx.close();
    restore.ok = restore.lostEvent && restore.restoredEvent && near(before, [30, 30, 250]) && near(restore.redrawn, [30, 30, 250]) && restore.after.ok && restore.console.planted >= 1 && restore.console.ok;
    return { snap, unbind, restore, pass: snap.ok && unbind.ok && restore.ok };
  },
  async throw(base, profile) {
    const { ctx, page, gate } = await bench(base, profile);
    const r = await page.evaluate(async () => {
      const s = window.__stage;
      let thrown = 0;
      // A crew entity (fx-2's) whose step() throws once, in the middle of the cube's spin.
      const e = s.gl.entity('fx-2');
      const at = performance.now() + 400;
      e.step = () => {
        if (!thrown && performance.now() > at) {
          thrown++;
          throw new Error('self-break: entity step threw');
        }
        return false;
      };
      s.fixtures.spin(1200);
      await new Promise((res) => setTimeout(res, 2600));
      return { thrown, hookErrors: s.stats.hookErrors, spinning: s.fixtures.spinning() };
    });
    const after = await settles(page);
    const got = await tintAndRest(page, [30, 200, 30]);
    const c = verdict(gate, /self-break: entity step threw/);
    await ctx.close();
    return { ...r, after, got, ...c, pass: r.thrown === 1 && r.hookErrors === 1 && !r.spinning && c.planted >= 1 && c.ok && after.ok && near(got, [30, 200, 30]) };
  },
  async renderThrow(base, profile) {
    const { ctx, page, gate } = await open(base, profile, '/bench/aspect/?tier=lite');
    await page.waitForFunction(() => window.__stage?.glState === 'ready' && window.__stage.fixtures, null, { polling: 100, timeout: 20000 });
    await waitSettled(page, 10000);
    const ids = ['fx-aspect-wide', 'fx-aspect-tall', 'fx-aspect-none'];
    /** The share of each slot the aspect fixtures' flat green covers on screen. */
    const coverage = async () => {
      const shot = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const scale = shot.info.width / page.viewportSize().width;
      const boxes = await page.evaluate((list) => list.map((id) => { const r = document.querySelector(`[data-gl-id="${id}"]`).getBoundingClientRect(); return { id, x: r.left, y: r.top, w: r.width, h: r.height }; }), ids);
      return Object.fromEntries(boxes.map((b) => {
        let hit = 0;
        let all = 0;
        for (let y = Math.max(0, Math.floor(b.y * scale)); y < Math.min(shot.info.height, Math.ceil((b.y + b.h) * scale)); y += 2) {
          for (let x = Math.max(0, Math.floor(b.x * scale)); x < Math.min(shot.info.width, Math.ceil((b.x + b.w) * scale)); x += 2) {
            const o = (y * shot.info.width + x) * 3;
            all++;
            if (Math.abs(shot.data[o] - 40) <= 3 && Math.abs(shot.data[o + 1] - 200) <= 3 && Math.abs(shot.data[o + 2] - 120) <= 3) hit++;
          }
        }
        return [b.id, all ? Math.round((hit / all) * 1000) / 1000 : 0];
      }));
    };
    const before = await coverage();
    // (a) a ticker frame: the first view's mesh throws once from onBeforeRender, then the stage presents and sleeps.
    const plant = (id) => page.evaluate((i) => {
      const s = window.__stage;
      const mesh = s.gl.entity(i).stageView.scene.children[0];
      let once = false;
      mesh.onBeforeRender = () => { if (!once) { once = true; throw new Error('self-break: render hook threw'); } };
    }, id);
    await plant('fx-aspect-wide');
    let s0 = await sleeps(page);
    await page.evaluate(() => window.__stage.invalidate());
    await page.waitForFunction((n) => window.__stage.stats.sleeps > n, s0, { polling: 50, timeout: 10000 });
    await sleep(80);
    const afterFrame = await coverage();
    const errorsA = await page.evaluate(() => window.__stage.stats.hookErrors);
    // (b) a layout render (slots ResizeObserver, renderNow): the same, through a 2 px padding change.
    await plant('fx-aspect-tall');
    s0 = await sleeps(page);
    await page.evaluate(() => { document.querySelector('[data-gl-id="fx-aspect-tall"]').style.paddingTop = '2px'; });
    await page.waitForFunction((n) => window.__stage.stats.sleeps > n, s0, { polling: 50, timeout: 10000 }).catch(() => {});
    await sleep(80);
    const afterLayout = await coverage();
    const errorsB = await page.evaluate(() => window.__stage.stats.hookErrors);
    const after = await settles(page);
    const c = verdict(gate, /self-break: render hook threw/);
    await ctx.close();
    // Each view that did not throw keeps drawing through the frame that threw, and the next frame draws them all.
    const kept = (cov, gone) => ids.filter((id) => id !== gone).every((id) => cov[id] >= before[id] * 0.9 && before[id] > 0.2);
    return {
      before, afterFrame, afterLayout, hookErrors: { frame: errorsA, layout: errorsB }, after, ...c,
      // WebKit reports a repeated error once on the console; stats.hookErrors counts both.
      pass: kept(afterFrame, null) && kept(afterLayout, null) && errorsA === 1 && errorsB === 2 && c.planted >= 1 && c.ok && after.ok,
    };
  },
  async history(base, profile) {
    const chromium = PROFILES[profile].browser === 'chromium';
    // 1. Swup to a project and Back.
    const { ctx, page, gate } = await open(base, profile, '/');
    await waitSettled(page, 15000);
    const sheetLink = page.locator('#sheet ~ ol [data-gl-id="project-02"]');
    await sheetLink.scrollIntoViewIfNeeded();
    await sheetLink.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.pathname === '/work/project-02/' && !document.documentElement.hasAttribute('aria-busy'), null, { timeout: 10000 });
    await waitSettled(page, 10000);
    await page.goBack();
    await page.waitForFunction(() => location.pathname === '/' && !document.documentElement.hasAttribute('aria-busy'), null, { timeout: 10000 });
    await sleep(300);
    const back = await page.evaluate(() => ({ focus: document.activeElement?.dataset?.glId ?? null, swaps: window.__stage.stats.swaps, canvas: Boolean(document.getElementById('gl')) }));
    back.after = await settles(page);
    back.chain = await oneChain(page, profile);
    back.grid = await gridOf(page);
    // 2. Reload and a hash arrival.
    await page.reload({ waitUntil: 'load' });
    await waitSettled(page, 15000);
    const reload = await page.evaluate(() => ({ tier: window.__stage.tier, cam: document.documentElement.dataset.cam ?? null, glState: window.__stage.glState }));
    await page.goto(`${base}/#contact`, { waitUntil: 'load' });
    await waitSettled(page, 15000);
    const hash = await page.evaluate(() => ({ y: Math.round(window.scrollY), cam: document.documentElement.dataset.cam ?? null }));
    const c = verdict(gate);
    await ctx.close();
    // 3. bfcache: a full navigation away and Back, in a Chromium with the back/forward cache on.
    const bf = await (async () => {
      const PAGESHOW = 'window.__pageshows = []; addEventListener("pageshow", (e) => window.__pageshows.push(e.persisted));';
      const o = await open(base, profile, '/bench/?tier=lite', chromium ? { browser: 'chromium-bfcache' } : {});
      await o.ctx.addInitScript({ content: PAGESHOW });
      await o.page.reload({ waitUntil: 'load' }); // the pageshow log from the first load on
      await o.page.waitForFunction(() => window.__stage?.glState === 'ready' && window.__stage.fixtures, null, { polling: 100, timeout: 20000 });
      await o.page.evaluate(() => { window.__marker = 'kept'; document.querySelector('[data-gl-id="fx-1"]').scrollIntoView({ block: 'center' }); });
      await waitSettled(o.page, 10000);
      await o.page.goto(`${base}/404.html`, { waitUntil: 'load' });
      // A bfcache restore fires pageshow, not load.
      await o.page.goBack({ waitUntil: 'commit' });
      await o.page.waitForFunction(() => location.pathname === '/bench/' && document.readyState === 'complete' && window.__stage, null, { polling: 100, timeout: 15000 });
      await sleep(500);
      const r = await o.page.evaluate(() => ({ path: location.pathname, persisted: (window.__pageshows || []).slice(-1)[0] ?? null, marker: window.__marker ?? null, stage: Boolean(window.__stage) }));
      r.after = await settles(o.page);
      await o.page.evaluate(() => document.querySelector('[data-gl-id="fx-1"]').scrollIntoView({ block: 'center' }));
      await waitSettled(o.page, SETTLE_MS);
      r.got = await tintAndRest(o.page, [250, 30, 30]);
      r.chain = await oneChain(o.page, profile);
      r.grid = await gridOf(o.page);
      r.console = verdict(o.gate);
      await o.ctx.close();
      // Chromium must restore from the bfcache; Playwright's WebKit never does, so there the Back is a fresh load.
      r.restoredExpected = chromium;
      r.ok = r.path === '/bench/' && r.stage && (!chromium || (r.persisted === true && r.marker === 'kept')) && r.after.ok && near(r.got, [250, 30, 30]) && r.chain.ok && r.grid.ok && r.console.ok;
      return r;
    })();
    return {
      back, bf, reload, hash, ...c,
      pass: back.focus === 'project-02' && back.canvas && back.after.ok && back.chain.ok && back.grid.ok && Boolean(reload.tier) && hash.y > 0 && hash.cam === 'camera' && bf.ok && c.ok,
    };
  },
  async crewThrow(base, profile) {
    // The two calls into crew code round 3 left unguarded (Breaker 3.1 #3, round-3 should-fix S1), on / with GL ready:
    // (a) an entity factory whose match() throws for one unbound slot: the error is counted, never reaches the caller,
    //     and every other slot the factory matches is still bound;
    // (b) a registered develop impl that takes its print's slot and then throws: the call resolves through `next` (the
    //     no-op: take, then give), so the slot is handed back (no .is-gl), and the error is counted.
    const { ctx, page, gate } = await open(base, profile, '/');
    await page.waitForFunction(() => window.__stage?.glState === 'ready', null, { polling: 100, timeout: 20000 });
    await waitSettled(page, 15000);
    const r = await page.evaluate(async () => {
      const s = window.__stage;
      const unbound = s.slots().filter((x) => x.kind === 'print' && !s.gl.entity(x.id)).map((x) => x.id);
      const victim = unbound[0];
      const h0 = s.stats.hookErrors;
      let threwToCaller = null;
      const made = [];
      try {
        s.gl.registerEntityFactory({
          match: (slot) => {
            if (slot.id === victim) throw new Error('self-break: factory match threw');
            return unbound.includes(slot.id);
          },
          create: (slot) => {
            made.push(slot.id);
            return { id: slot.id, persistent: false, bind() {}, unbind() {}, place() {}, visible: () => false, dispose() {} };
          },
        });
      } catch (e) {
        threwToCaller = String(e).slice(0, 120);
      }
      const factory = { unbound: unbound.length, victim, bound: unbound.filter((id) => id !== victim && s.gl.entity(id)).length, made: made.length, threwToCaller, hookErrors: s.stats.hookErrors - h0 };
      // (b) the effect chain.
      const target = 'project-02';
      const h1 = s.stats.hookErrors;
      s.registerEffect('develop', (id, opts, next) => {
        if (id !== target) return next(id, opts);
        s.take(id);
        throw new Error('self-break: develop impl threw');
      });
      let result = null;
      let rejected = null;
      try {
        result = await s.effects.develop(target, { trigger: 'self-break' });
      } catch (e) {
        rejected = String(e).slice(0, 120);
      }
      await new Promise((res) => setTimeout(res, 0));
      const el = document.querySelector(`[data-gl-id="${target}"]`);
      const effect = { result, rejected, isGl: el?.classList.contains('is-gl') ?? null, hookErrors: s.stats.hookErrors - h1 };
      return { factory, effect };
    });
    const after = await settles(page);
    const c = verdict(gate, /self-break: (factory match|develop impl) threw/);
    await ctx.close();
    const f = r.factory;
    const e = r.effect;
    return {
      ...r, after, ...c,
      pass: f.unbound >= 2 && f.threwToCaller === null && f.hookErrors === 1 && f.bound === f.unbound - 1 && e.rejected === null && e.result?.developed === true && e.isGl === false && e.hookErrors === 1 && after.ok && c.planted >= 2 && c.ok,
    };
  },
  async scrollRestore(base, profile) {
    // #11 'Back restores scroll to +-1 px' on full loads too (Breaker 3.3 #3, round-3 should-fix S8): the reader
    // scrolls, leaves by a full load and comes Back (a fresh load: Playwright's browsers keep no bfcache here), or
    // reloads; and the same after a Swup visit has touched the entry (the router restores ionScroll itself there).
    const rows = [];
    const scrollTo = async (page, y) => {
      await page.evaluate((top) => window.scrollTo({ top, left: 0, behavior: 'instant' }), y);
      await sleep(400); // the router's scroll writer is debounced 150 ms
      return page.evaluate(() => Math.round(window.scrollY));
    };
    const yNow = (page) => page.evaluate(() => Math.round(window.scrollY));
    for (const kind of ['back', 'reload', 'swupBack']) {
      const { ctx, page, gate } = await open(base, profile, '/');
      await waitSettled(page, 15000);
      if (kind === 'swupBack') {
        // A Swup visit to a project and Back first: from here the entry's scroll restoration is the router's.
        const link = page.locator('#sheet ~ ol [data-gl-id="project-02"]');
        await link.scrollIntoViewIfNeeded();
        await link.focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => location.pathname === '/work/project-02/' && !document.documentElement.hasAttribute('aria-busy'), null, { timeout: 10000 });
        await waitSettled(page, 10000);
        await page.goBack();
        await page.waitForFunction(() => location.pathname === '/' && !document.documentElement.hasAttribute('aria-busy'), null, { timeout: 10000 });
        await waitSettled(page, 10000);
      }
      const want = await scrollTo(page, 1200);
      const mode = await page.evaluate(() => history.scrollRestoration);
      if (kind === 'reload') await page.reload({ waitUntil: 'load' });
      else {
        await page.goto(`${base}/work/project-01/`, { waitUntil: 'load' });
        await waitSettled(page, 10000);
        await page.goBack({ waitUntil: 'load' });
      }
      await waitSettled(page, 15000);
      await sleep(300);
      const got = await yNow(page);
      const nav = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type ?? null);
      const c = verdict(gate);
      await ctx.close();
      rows.push({ kind, modeBefore: mode, want, got, nav, ...c, ok: want > 0 && Math.abs(got - want) <= 1 && c.ok });
    }
    return { rows, pass: rows.every((r) => r.ok) };
  },
  async gapGovernor(base, profile) {
    // A stay in the back/forward cache mid-motion is a gap, not a busy frame (Breaker 3.3 #2, perf row 29, W-D017): the
    // visitor leaves / during the opening, or during a Lenis glide after a wheel step, by a full load, stays 3 s and
    // comes Back (a bfcache restore). The tier and the governor's step count do not change. Chromium with the
    // back/forward cache on; Playwright's WebKit never restores from its page cache, so its row does not apply.
    if (PROFILES[profile].browser !== 'chromium') return { applies: false, why: "Playwright's WebKit never restores from its page cache", pass: true };
    const rows = [];
    for (const variant of ['intro', 'wheel']) {
      const ctx = await newContext(profile, 'auto', { browser: 'chromium-bfcache' });
      await ctx.addInitScript({ content: 'window.__shows = []; addEventListener("pageshow", (e) => window.__shows.push(e.persisted));' });
      const page = await ctx.newPage();
      const gate = consoleGate(page, { expectStatus: [{ status: 404, url: /\/manor\/$/ }] });
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__stage?.glState === 'ready', null, { polling: 50, timeout: 20000 });
      if (variant === 'intro') await sleep(600);
      else {
        await waitSettled(page, 20000);
        const { width, height } = page.viewportSize();
        await page.mouse.move(width / 2, height / 2);
        await page.mouse.wheel(0, 900);
        await sleep(120);
      }
      const before = await page.evaluate(() => ({ tier: window.__stage.tier, steps: window.__stage.stats.governorSteps, moving: !window.__stage.settled }));
      await page.goto(`${base}/manor/`, { waitUntil: 'load' });
      await sleep(3000);
      await page.goBack({ waitUntil: 'commit' });
      await page.waitForFunction(() => window.__stage && location.pathname === '/', null, { timeout: 15000 });
      await sleep(2500);
      const after = await page.evaluate(() => ({ tier: window.__stage.tier, steps: window.__stage.stats.governorSteps, restored: window.__shows.includes(true), tierLog: window.__stage.tierLog }));
      const settled = await settles(page);
      const c = verdict(gate);
      await ctx.close();
      rows.push({ variant, before, after, settled, ...c, ok: before.moving && after.restored && after.tier === before.tier && after.steps === before.steps && settled.ok && c.ok });
    }
    return { rows, pass: rows.every((r) => r.ok) };
  },
  async rapid(base, profile) {
    // /bench/: a wheel, a click on a print link (a Swup visit), Back and a second click, with no waits between them.
    const { ctx, page, gate } = await bench(base, profile);
    const { width, height } = page.viewportSize();
    await page.mouse.move(width / 2, height / 2);
    await page.mouse.wheel(0, 120);
    await press(page, profile, '[data-gl-id="fx-2"]');
    await page.goBack().catch(() => {});
    await press(page, profile, '[data-gl-id="fx-3"]').catch(() => {});
    await page.waitForFunction(() => !document.documentElement.hasAttribute('aria-busy'), null, { timeout: 10000 }).catch(() => {});
    const benchAfter = await settles(page);
    const benchChain = await oneChain(page, profile);
    const benchGrid = await gridOf(page);
    const where = await page.evaluate(() => location.pathname);
    const c1 = verdict(gate);
    await ctx.close();
    // /: four Shutter presses in a row (W-S1's camera; the stage must stay whole under them).
    const home = await open(base, profile, '/');
    await waitSettled(home.page, 15000);
    for (let i = 0; i < 4; i++) {
      if (touch(profile)) await home.page.tap('[data-hero-camera]', { position: { x: 20, y: 20 } }).catch(() => home.page.click('[data-shutter]'));
      else await home.page.click('[data-shutter]');
    }
    // The hero runs each press's develop and eject (W-S1, under 5 s per sequence): room for four.
    const homeAfter = await settles(home.page, 20000);
    const homeChain = await oneChain(home.page, profile);
    const c2 = verdict(home.gate);
    await home.ctx.close();
    return {
      bench: { where, after: benchAfter, chain: benchChain, grid: benchGrid, console: c1 }, home: { after: homeAfter, chain: homeChain, console: c2 },
      pass: benchAfter.ok && benchChain.ok && benchGrid.ok && c1.ok && homeAfter.ok && homeChain.ok && c2.ok,
    };
  },
  async resize(base, profile) {
    const { ctx, page, gate } = await open(base, profile, '/bench/');
    await page.waitForFunction(() => window.__stage?.glState === 'ready' && window.__stage.fixtures, null, { polling: 100, timeout: 20000 });
    await page.evaluate(() => document.querySelector('[data-gl-id="fixture-cube"]').scrollIntoView({ block: 'center' }));
    await waitSettled(page, 10000);
    const vp = page.viewportSize();
    await page.evaluate(() => window.__stage.fixtures.spin(1500));
    await sleep(300);
    await page.setViewportSize({ width: vp.width, height: vp.height - 80 });
    await sleep(200);
    await page.setViewportSize({ width: vp.height, height: vp.width }); // orientation change
    await sleep(200);
    const gridTurned = await gridOf(page);
    await page.setViewportSize(vp);
    await page.evaluate(() => document.querySelector('[data-gl-id="fixture-cube"]').scrollIntoView({ block: 'center' }));
    const after = await settles(page);
    const r = await page.evaluate(() => {
      const b = window.__stage.bounds('fixture-cube');
      return { spinning: window.__stage.fixtures.spinning(), slot: b.slot, gl: b.gl };
    });
    const grid = await gridOf(page);
    const c = verdict(gate);
    await ctx.close();
    // The cube's projected box sits inside its slot (its view is the slot), on the grid, as wide as the layout.
    const inside = r.gl && r.gl.x >= r.slot.x - 0.5 && r.gl.y >= r.slot.y - 0.5 && r.gl.x + r.gl.w <= r.slot.x + r.slot.w + 0.5 && r.gl.y + r.gl.h <= r.slot.y + r.slot.h + 0.5;
    return { ...r, inside, gridTurned, grid, after, ...c, pass: !r.spinning && inside && gridTurned.ok && grid.ok && after.ok && c.ok };
  },
  async reduced(base, profile) {
    const { ctx, page, gate } = await bench(base, profile);
    await page.evaluate(() => window.__stage.fixtures.spin(4000));
    await sleep(300);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(50);
    const r = await page.evaluate(() => ({ spinning: window.__stage.fixtures.spinning(), motion: window.__stage.motion }));
    const after = await settles(page);
    const c = verdict(gate);
    await ctx.close();
    return { ...r, after, ...c, pass: !r.spinning && r.motion === 'reduced' && after.ok && c.ok };
  },
};

export async function run(opts = {}) {
  const profiles = String(opts.profiles || 'D2,P2,WK-P2').split(',');
  const only = opts.only ? new Set(String(opts.only).split(',')) : null;
  const srv = await serve(opts.dist ? String(opts.dist) : undefined);
  const rows = [];
  try {
    for (const profile of profiles) {
      for (const [name, fn] of Object.entries(CASES)) {
        if (only && !only.has(name)) continue;
        let r;
        try {
          r = await fn(srv.base, profile);
        } catch (e) {
          r = { pass: false, error: String(e?.stack || e).slice(0, 400) };
        }
        rows.push({ case: name, profile, browser: PROFILES[profile].browser, ...r });
      }
    }
  } finally {
    await srv.close();
  }
  return { schema: 2, suite: 'w-f/selfbreak', pass: rows.every((r) => r.pass), rows, summary: rows.map((r) => `${r.case}@${r.profile} ${r.pass ? 'ok' : 'BROKE'}`).join(', ') };
}

await cliMain(import.meta.url, run);
