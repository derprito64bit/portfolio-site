// W-F stage acceptance (issue #11): tiers, governor, pixel caps, the live motion axis, context loss, focus through a
// no-op develop, and the stage-local projection of the fixture cube. Reference host only (real GPU).
// Usage: node tests/w-f/stage.mjs [--out stage.json]
import sharp from 'sharp';
import { PROFILES, browser, budget, cliMain, expectedTier, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';

const nextFrames = (page, n = 1) => page.evaluate((k) => new Promise((r) => { let i = 0; const f = () => (++i >= k ? r(i) : window.requestAnimationFrame(f)); window.requestAnimationFrame(f); }), n);

/** Mouse profiles report full (or a logged probe demotion), touch profiles lite, ?tier=static static. */
async function tiers(base) {
  const rows = [];
  for (const p of ['D1', 'D2', 'D3', 'S1', 'T1', 'T2', 'P1', 'P2', 'S2', 'WK-P2', 'WK-T2']) {
    for (const mode of ['auto', 'static']) {
      const ctx = await newContext(p);
      const page = await ctx.newPage();
      await page.goto(`${base}/${mode === 'static' ? '?tier=static' : ''}`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      const s = await page.evaluate(() => ({ tier: window.__stage.tier, reason: window.__stage.tierReason, log: window.__stage.tierLog, gl: window.__stage.glState }));
      const want = mode === 'static' ? 'static' : expectedTier(p);
      const probeDemotion = mode === 'auto' && want === 'full' && s.tier === 'lite' && s.reason === 'probe';
      rows.push({ profile: p, browser: PROFILES[p].browser, mode, ...s, expected: want, pass: s.tier === want || probeDemotion });
      await ctx.close();
    }
  }
  return { rows, pass: rows.every((r) => r.pass) };
}

/** Forced 30 ms frames: one step down after 45 busy frames, never back up. */
async function governor(base) {
  const ctx = await newContext('D2');
  const page = await ctx.newPage();
  await page.goto(`${base}/bench/?busy=30&tier=full`, { waitUntil: 'load' });
  await waitSettled(page, 20000);
  await page.waitForFunction(() => window.__stage.fixtures, null, { polling: 100, timeout: 15000 });
  const t0 = await page.evaluate(() => ({ ticks: window.__stage.stats.ticks, draws: window.__stage.stats.draws, now: performance.now() }));
  await page.evaluate(() => window.__stage.fixtures.spin(4000));
  await page.waitForFunction(() => window.__stage.tier !== 'full', null, { polling: 20, timeout: 15000 });
  const first = await page.evaluate(() => ({ tier: window.__stage.tier, log: window.__stage.tierLog, draws: window.__stage.stats.draws, now: performance.now() }));
  const busyFramesBeforeStep = first.draws - t0.draws;
  // Keep watching: the tier never comes back up (a second busy run may only step down again).
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await sleep(250);
    seen.push(await page.evaluate(() => window.__stage.tier));
  }
  await ctx.close();
  const rank = { static: 0, lite: 1, full: 2 };
  const neverUp = seen.every((t, i) => rank[t] <= rank[i ? seen[i - 1] : first.tier]);
  return { busyMs: 30, busyFramesBeforeStep, firstStep: first.log[first.log.length - 1], afterwards: seen, neverUp, pass: first.tier === 'lite' && busyFramesBeforeStep >= 45 && busyFramesBeforeStep <= 50 && neverUp };
}

/**
 * The canvas at 1920 x 1080, DPR 2. The pixel caps (json budgets block, site.canvasMpx) on the buffer the GPU allocates: fresh loads on full and lite,
 * and a drop from full to lite after GL is up (round-3 should-fix S4: the canvas must reallocate to lite's caps, not
 * keep the full one; selfbreak-plants P keeps it and fails selfbreak tierDrop).
 */
async function caps(base) {
  const out = {};
  const cap = { full: budget('site.canvasMpx.full') * 1e6, lite: budget('site.canvasMpx.lite') * 1e6 };
  for (const [name, tier, drop] of [['full', 'full', false], ['lite', 'lite', false], ['demoted', 'full', true]]) {
    const b = await browser('chromium');
    const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto(`${base}/bench/?tier=${tier}`, { waitUntil: 'load' });
    await waitSettled(page, 15000);
    if (drop) {
      await page.evaluate(() => window.__stage.demote('lite', 'stage-caps'));
      await sleep(500);
      await waitSettled(page, 15000);
    }
    out[name] = await page.evaluate(() => ({ tier: window.__stage.tier, dpr: window.__stage.stats.dpr, canvasPx: window.__stage.stats.canvasPx, buffer: [document.getElementById('gl').width, document.getElementById('gl').height] }));
    await ctx.close();
  }
  const px = (t) => out[t].buffer[0] * out[t].buffer[1];
  const ok = (t, c) => px(t) <= cap[c] && out[t].canvasPx === px(t);
  return { ...out, cap, bufferPx: { full: px('full'), lite: px('lite'), demoted: px('demoted') }, pass: out.full.tier === 'full' && out.demoted.tier === 'lite' && ok('full', 'full') && ok('lite', 'lite') && ok('demoted', 'lite') };
}

/** Turning on reduced motion mid-timeline ends running timelines within 1 frame. */
async function reducedMidTimeline(base) {
  const ctx = await newContext('D2');
  const page = await ctx.newPage();
  await page.goto(`${base}/bench/`, { waitUntil: 'load' });
  await waitSettled(page, 15000);
  await page.waitForFunction(() => window.__stage.fixtures, null, { polling: 100, timeout: 15000 });
  await page.evaluate(() => window.__stage.fixtures.spin(5000));
  await sleep(600);
  // The probe listens on its own MediaQueryList, created after the stage's, so it runs right after the stage's
  // handler in the same task: it sees what the stage left behind at the moment the change arrived.
  await page.evaluate(() => {
    window.__rm = null;
    window.__rmFrames = 0;
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', () => {
      window.__rm = { spinningAtChange: window.__stage.fixtures.spinning(), t: performance.now() };
    });
  });
  const before = await page.evaluate(() => window.__stage.fixtures.spinning());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => window.__rm !== null, null, { polling: 10, timeout: 5000 });
  await nextFrames(page, 1);
  const after = await page.evaluate(() => ({ atChange: window.__rm, spinning: window.__stage.fixtures.spinning(), motion: window.__stage.motion, lenis: document.documentElement.classList.contains('lenis') }));
  await ctx.close();
  // Ended in the same task as the change event, i.e. before the next frame: within 1 frame.
  const framesToEnd = after.atChange.spinningAtChange ? 1 : 0;
  return { spinningBefore: before, framesToEnd, ...after, pass: before === true && !after.atChange.spinningAtChange && !after.spinning && after.motion === 'reduced' && !after.lenis };
}

/**
 * The Motion switch (W-D032) works where storage throws: setMotion('reduced') applies at once (motion, data-motion,
 * Lenis dropped), survives an OS media change, and setMotion(null) hands back to the OS setting. Run with storage
 * working and with every Storage method throwing (blocked site data).
 */
async function motionSwitch(base) {
  const BLOCK = `for (const m of ['getItem', 'setItem', 'removeItem', 'clear', 'key']) {
    Storage.prototype[m] = function () { throw new DOMException('blocked', 'SecurityError'); };
  }`;
  const rows = [];
  for (const storage of ['working', 'blocked']) {
    const ctx = await newContext('D2');
    if (storage === 'blocked') await ctx.addInitScript({ content: BLOCK });
    const page = await ctx.newPage();
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await waitSettled(page, 15000);
    await page.waitForFunction(() => window.__stage.glState === 'ready', null, { polling: 100, timeout: 15000 }).catch(() => {});
    const read = () => page.evaluate(() => ({ motion: window.__stage.motion, data: document.documentElement.dataset.motion, lenis: document.documentElement.classList.contains('lenis') }));
    await sleep(300);
    const start = await read();
    await page.evaluate(() => window.__stage.setMotion('reduced'));
    const reduced = await read();
    // An OS change event must not undo the choice.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await sleep(100);
    const afterOsChange = await read();
    await page.evaluate(() => window.__stage.setMotion(null));
    await sleep(300);
    const cleared = await read();
    const storageThrows = await page.evaluate(() => { try { localStorage.getItem('x'); return false; } catch { return true; } });
    await ctx.close();
    rows.push({
      storage, storageThrows, start, reduced, afterOsChange, cleared,
      pass: storageThrows === (storage === 'blocked') && start.motion === 'full' && reduced.motion === 'reduced' && reduced.data === 'reduced' && !reduced.lenis
        && afterOsChange.motion === 'reduced' && cleared.motion === 'full' && cleared.data === 'full',
    });
  }
  return { rows, pass: rows.every((r) => r.pass) };
}

/**
 * The riding canvas keeps slack behind the viewport (review item 3, gate F2): after every re-anchor the trailing side
 * has a quarter of the overscan (round(0.25 x (Hc - H)) px, unless clamped at the document top), and every rendered
 * frame covers the viewport. Scrolled in 40 px steps down then up on /bench/ (lite, P2), one frame per step.
 */
async function railSlack(base) {
  const ctx = await newContext('P2');
  const page = await ctx.newPage();
  await page.goto(`${base}/bench/?tier=lite`, { waitUntil: 'load' });
  await waitSettled(page, 15000);
  await page.waitForFunction(() => window.__stage.glState === 'ready', null, { polling: 100, timeout: 15000 });
  const samples = await page.evaluate(async () => {
    const frame = () => new Promise((r) => window.requestAnimationFrame(() => window.requestAnimationFrame(r)));
    const v = window.__stage.view;
    const out = [];
    const max = document.documentElement.scrollHeight - innerHeight;
    for (const dir of [1, -1]) {
      for (let i = 0; i < 400; i++) {
        const before = scrollY;
        window.scrollBy(0, 40 * dir);
        await frame();
        if (scrollY === before) break;
        out.push({ dir, sy: scrollY, anchor: v.anchor, H: v.H, Hc: v.Hc });
        if ((dir > 0 && scrollY >= max - 2) || (dir < 0 && scrollY <= 0)) break;
      }
    }
    return out;
  });
  await ctx.close();
  const trailWant = samples.length ? Math.round(0.25 * (samples[0].Hc - samples[0].H)) : null;
  const reanchors = [];
  let uncovered = 0;
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i];
    if (s.sy < s.anchor - 0.5 || s.sy + s.H > s.anchor + s.Hc + 0.5) uncovered++;
    if (s.anchor === samples[i - 1].anchor || s.anchor === 0) continue;
    const trail = s.dir > 0 ? s.sy - s.anchor : s.anchor + s.Hc - (s.sy + s.H);
    reanchors.push({ dir: s.dir, sy: s.sy, anchor: s.anchor, trailPx: Math.round(trail * 100) / 100 });
  }
  const down = reanchors.filter((r) => r.dir > 0);
  const up = reanchors.filter((r) => r.dir < 0);
  const minTrail = (list) => (list.length ? Math.min(...list.map((r) => r.trailPx)) : null);
  return {
    steps: samples.length, trailWantPx: trailWant, reanchorsDown: down.length, reanchorsUp: up.length,
    minTrailDownPx: minTrail(down), minTrailUpPx: minTrail(up), uncovered, reanchors: reanchors.slice(0, 40),
    pass: down.length > 0 && up.length > 0 && uncovered === 0 && minTrail(down) >= trailWant - 1 && minTrail(up) >= trailWant - 1,
  };
}

/** Context loss: every slot drops .is-gl within 1 frame; a second loss within 60 s sets static. */
async function contextLoss(base) {
  const ctx = await newContext('D2');
  const page = await ctx.newPage();
  await page.goto(`${base}/bench/`, { waitUntil: 'load' });
  await waitSettled(page, 15000);
  const isGl = () => page.evaluate(() => document.querySelectorAll('.is-gl').length);
  const before = await isGl();
  await page.evaluate(() => window.__stage.gl.forceContextLoss());
  const frames = await page.evaluate(() => new Promise((r) => { let n = 0; const f = () => (document.querySelectorAll('.is-gl').length === 0 || n > 30 ? r(n) : (n++, window.requestAnimationFrame(f))); f(); }));
  const lost = await isGl();
  await page.evaluate(() => window.__stage.gl.forceContextRestore());
  await sleep(800);
  const restored = await page.evaluate(() => ({ isGl: document.querySelectorAll('.is-gl').length, tier: window.__stage.tier, restores: window.__stage.stats.restores }));
  await page.evaluate(() => window.__stage.gl.forceContextLoss());
  await sleep(300);
  const second = await page.evaluate(() => ({ tier: window.__stage.tier, reason: window.__stage.tierReason, isGl: document.querySelectorAll('.is-gl').length, flag: sessionStorage.getItem('ion.gl-off'), railHidden: getComputedStyle(document.getElementById('rail')).display === 'none' }));
  await ctx.close();
  return { isGlBefore: before, framesToDrop: frames, isGlAfterLoss: lost, restored, second, pass: before > 0 && frames <= 1 && lost === 0 && second.tier === 'static' && second.isGl === 0 && second.railHidden };
}

/** activeElement survives a full no-op develop. */
async function developKeepsFocus(base) {
  const ctx = await newContext('D2');
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await waitSettled(page, 15000);
  await page.focus('[data-gl-id="project-02"]');
  const r = await page.evaluate(async () => {
    const before = document.activeElement;
    const result = await window.__stage.effects.develop('project-02', { trigger: 'test' });
    return { result, same: document.activeElement === before, id: document.activeElement?.dataset?.glId, isGl: document.querySelector('[data-gl-id="project-02"]').classList.contains('is-gl') };
  });
  await ctx.close();
  return { ...r, pass: r.same && r.result.d === 1 && r.result.developed === true && !r.isGl };
}

/** Stage-local cube: projected bounds drift < 0.5 px and < 1 degree across a 40% (of the viewport) scroll. */
async function cubeProjection(base) {
  const ctx = await newContext('D2');
  const page = await ctx.newPage();
  await page.goto(`${base}/bench/`, { waitUntil: 'load' });
  await waitSettled(page, 15000);
  const vh = page.viewportSize().height;
  // Start with the cube near the bottom of the viewport, so it stays whole for the full 40% scroll.
  const cube = await page.evaluate(() => { const r = document.querySelector('[data-gl-id="fixture-cube"]').getBoundingClientRect(); return { top: r.top + scrollY, h: r.height }; });
  const startY = Math.max(0, Math.round(cube.top - (vh - cube.h - 20)));
  if (cube.top - startY - 0.4 * vh < 0) throw new Error('fixture cube cannot stay in view over a 40% scroll at this profile');
  const samples = [];
  for (let k = 0; k <= 8; k++) {
    const y = Math.round(startY + (0.4 * vh * k) / 8);
    await page.evaluate((t) => window.scrollTo(0, t), y);
    await waitSettled(page, 5000);
    await nextFrames(page, 2);
    const b = await page.evaluate(() => window.__stage.bounds('fixture-cube'));
    // Pixel check: the cube is flat amber rgb(227, 155, 43); find its box in the frame.
    const shot = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = shot;
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let py = 0; py < info.height; py++) for (let px = 0; px < info.width; px++) {
      const o = (py * info.width + px) * 3;
      if (Math.abs(data[o] - 227) <= 2 && Math.abs(data[o + 1] - 155) <= 2 && Math.abs(data[o + 2] - 43) <= 2) {
        if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      }
    }
    const s = info.width / page.viewportSize().width;
    samples.push({ scrollY: y, slot: b.slot, gl: b.gl, pixel: x1 >= 0 ? { x: x0 / s - b.slot.x, y: y0 / s - b.slot.y, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s } : null });
  }
  await ctx.close();
  const rel = samples.map((p) => ({ x: p.gl.x - p.slot.x, y: p.gl.y - p.slot.y, w: p.gl.w, h: p.gl.h, a: p.gl.angleDeg }));
  const spread = (k) => Math.max(...rel.map((r) => r[k])) - Math.min(...rel.map((r) => r[k]));
  // Raster cross-check on the presented frame: the box origin and centre. One anti-aliased edge row can change the
  // box size by a device pixel without the cube moving, so size is reported but the drift reads origin and centre.
  const px = samples.filter((p) => p.pixel).map((p) => ({ ...p.pixel, cx: p.pixel.x + p.pixel.w / 2, cy: p.pixel.y + p.pixel.h / 2 }));
  const pxSpread = (k) => (px.length ? Math.max(...px.map((r) => r[k])) - Math.min(...px.map((r) => r[k])) : Infinity);
  const boundsDriftPx = Math.max(spread('x'), spread('y'), spread('w'), spread('h'));
  const pixelDriftPx = Math.max(pxSpread('x'), pxSpread('y'), pxSpread('cx'), pxSpread('cy'));
  const pixelSizeSpreadPx = Math.max(pxSpread('w'), pxSpread('h'));
  const angleDriftDeg = spread('a');
  return { scrollRangePx: Math.round(0.4 * vh), samples, boundsDriftPx, pixelDriftPx, pixelSizeSpreadPx, angleDriftDeg, pass: boundsDriftPx < 0.5 && pixelDriftPx < 0.5 && angleDriftDeg < 1 };
}

export async function run() {
  const srv = await serve();
  const out = {};
  try {
    out.tiers = await tiers(srv.base);
    out.governor = await governor(srv.base);
    out.caps = await caps(srv.base);
    out.reducedMidTimeline = await reducedMidTimeline(srv.base);
    out.motionSwitch = await motionSwitch(srv.base);
    out.railSlack = await railSlack(srv.base);
    out.contextLoss = await contextLoss(srv.base);
    out.developKeepsFocus = await developKeepsFocus(srv.base);
    out.cubeProjection = await cubeProjection(srv.base);
  } finally {
    await srv.close();
  }
  const parts = Object.entries(out);
  return { schema: 1, suite: 'w-f/stage', pass: parts.every(([, v]) => v.pass), ...out, summary: parts.map(([k, v]) => `${k} ${v.pass ? 'pass' : 'FAIL'}`).join(', ') };
}

await cliMain(import.meta.url, run);
