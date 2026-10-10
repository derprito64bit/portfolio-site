// W-F stage acceptance (issue #11): tiers, governor, pixel caps, the live motion axis, context loss, focus through a
// no-op develop, and the stage-local projection of the fixture cube. Reference host only (real GPU).
// Usage: node tests/w-f/stage.mjs [--out stage.json]
import sharp from 'sharp';
import { PROFILES, browser, budget, cliMain, consoleGate, expectedTier, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';

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

/**
 * Forced 30 ms frames: one step down after 45 busy frames, never back up; and W-D014: Lenis, on at full, is destroyed by
 * the step (round-5 should-fix S4, Breaker 4.2 #4).
 */
async function governor(base) {
  const ctx = await newContext('D2');
  const page = await ctx.newPage();
  await page.goto(`${base}/bench/?busy=30&tier=full`, { waitUntil: 'load' });
  await waitSettled(page, 20000);
  await page.waitForFunction(() => window.__stage.fixtures, null, { polling: 100, timeout: 15000 });
  const lenisBefore = await page.waitForFunction(() => document.documentElement.classList.contains('lenis'), null, { polling: 100, timeout: 8000 }).then(() => true, () => false);
  const t0 = await page.evaluate(() => ({ ticks: window.__stage.stats.ticks, draws: window.__stage.stats.draws, now: performance.now() }));
  await page.evaluate(() => window.__stage.fixtures.spin(4000));
  // The frames up to the step are read where the step is seen; the spin goes on at lite after it.
  const atStep = await (await page.waitForFunction(() => window.__stage.tier !== 'full' && { draws: window.__stage.stats.draws }, null, { polling: 20, timeout: 15000 })).jsonValue();
  await sleep(100); // the step's listeners (W-D014's Lenis teardown) run in the same task; read after it
  const first = await page.evaluate(() => ({ tier: window.__stage.tier, log: window.__stage.tierLog, draws: window.__stage.stats.draws, now: performance.now(), lenis: document.documentElement.classList.contains('lenis') }));
  const busyFramesBeforeStep = atStep.draws - t0.draws;
  // Keep watching: the tier never comes back up (a second busy run may only step down again).
  const seen = [];
  for (let i = 0; i < 12; i++) {
    await sleep(250);
    seen.push(await page.evaluate(() => window.__stage.tier));
  }
  await ctx.close();
  const rank = { static: 0, lite: 1, full: 2 };
  const neverUp = seen.every((t, i) => rank[t] <= rank[i ? seen[i - 1] : first.tier]);
  return { busyMs: 30, busyFramesBeforeStep, firstStep: first.log[first.log.length - 1], afterwards: seen, neverUp, lenisBefore, lenisAfterStep: first.lenis, pass: first.tier === 'lite' && busyFramesBeforeStep >= 45 && busyFramesBeforeStep <= 50 && neverUp && lenisBefore && !first.lenis };
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

/**
 * One context loss and its restore in the WebKit opening of / (perf row 33; ruling 6049539219 item 2: W-D017 prices a
 * single loss at the restore itself): the tier stays full, three times over (8a9e8e8 stepped full to lite every time:
 * the restore's rebuild blocks one frame for about 0.75 s in WebKit, and one such interval fills the governor's
 * 45-frame average on its own). Controls: two losses within 60 s still end static (W-D017), and genuinely slow frames
 * after a restore (30 ms frames forced through __stage.flags.busyMs from 0.8 s after it, on /bench/ with the fixtures
 * spinning) still step the governor after 45 to 50 of them, so the governor is not switched off.
 */
async function restoreGovernor(base) {
  const open = async (path) => {
    const ctx = await newContext('D3', 'auto', { browser: 'webkit' });
    const page = await ctx.newPage();
    await page.goto(`${base}${path}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__stage?.glState === 'ready', null, { polling: 50, timeout: 20000 });
    return { ctx, page };
  };
  const loseRestore = (page) => page.evaluate(async () => {
    const c = document.getElementById('gl');
    const lost = new Promise((res) => c.addEventListener('webglcontextlost', res, { once: true }));
    const restored = new Promise((res) => c.addEventListener('webglcontextrestored', () => res(true), { once: true }));
    window.__stage.gl.forceContextLoss();
    await lost;
    await new Promise((res) => setTimeout(res, 50));
    window.__stage.gl.forceContextRestore();
    return Promise.race([restored, new Promise((res) => setTimeout(() => res(false), 3000))]);
  });
  const state = (page) => page.evaluate(() => ({ tier: window.__stage.tier, reason: window.__stage.tierReason, log: window.__stage.tierLog, restores: window.__stage.stats.restores, governorSteps: window.__stage.stats.governorSteps }));
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const { ctx, page } = await open('/');
    await sleep(600); // inside the opening
    const restored = await loseRestore(page);
    await sleep(3500);
    await waitSettled(page, 10000);
    const s = await state(page);
    await ctx.close();
    rows.push({ kind: 'one loss in the opening', restored, ...s, pass: restored && s.tier === 'full' && s.restores === 1 && s.governorSteps === 0 });
  }
  {
    const { ctx, page } = await open('/');
    await sleep(600);
    await loseRestore(page);
    await sleep(500);
    await page.evaluate(() => window.__stage.gl.forceContextLoss());
    await sleep(400);
    const s = await state(page);
    await ctx.close();
    rows.push({ kind: 'control: two losses within 60 s', ...s, pass: s.tier === 'static' && s.reason === 'context-loss' });
  }
  {
    const { ctx, page } = await open('/bench/?tier=full');
    await waitSettled(page, 20000);
    await page.waitForFunction(() => window.__stage.fixtures, null, { polling: 100, timeout: 15000 });
    const restored = await loseRestore(page);
    await sleep(800);
    const flagsExposed = await page.evaluate(() => Boolean(window.__stage.flags));
    const t0 = await page.evaluate(() => {
      window.__stage.flags.busyMs = 30;
      window.__stage.fixtures.spin(6000);
      return { draws: window.__stage.stats.draws };
    }).catch(() => null);
    const stepped = t0 ? await page.waitForFunction(() => window.__stage.tier !== 'full', null, { polling: 20, timeout: 15000 }).then(() => true, () => false) : false;
    const first = await page.evaluate(() => ({ tier: window.__stage.tier, log: window.__stage.tierLog, draws: window.__stage.stats.draws }));
    await ctx.close();
    const busyFramesBeforeStep = t0 ? first.draws - t0.draws : null;
    rows.push({ kind: 'control: forced 30 ms frames after a restore', restored, flagsExposed, stepped, busyFramesBeforeStep, firstStep: first.log.at(-1), pass: restored && stepped && first.tier === 'lite' && busyFramesBeforeStep >= 45 && busyFramesBeforeStep <= 50 });
  }
  return { rows, pass: rows.every((r) => r.pass) };
}

/** Records, in the page, when #gl's context was lost and restored (capture listeners: the events do not bubble). */
const LOSS_CLOCK = `(() => {
  document.addEventListener('webglcontextlost', (e) => { if (e.target && e.target.id === 'gl') (window.__lossAt ||= []).push(performance.now()); }, true);
  document.addEventListener('webglcontextrestored', (e) => { if (e.target && e.target.id === 'gl') (window.__restoreAt ||= []).push(performance.now()); }, true);
})();`;
/** The stage's loss record, the context's state and when stage:gl-ready was marked (null: never). */
const LOSS_STATE = () => {
  const s = window.__stage;
  const ready = s.marks().find((m) => m.name === 'stage:gl-ready');
  return {
    glState: s.glState, tier: s.tier, reason: s.tierReason, settled: s.settled, losses: s.stats.losses, restores: s.stats.restores, probeRetries: s.stats.probeRetries,
    probe: s.gl?.probe ?? null, lostNow: s.gl?.renderer?.getContext().isContextLost() ?? null, readyAt: ready ? ready.t : null,
    lossAt: window.__lossAt ?? [], restoreAt: window.__restoreAt ?? [], isGl: document.querySelectorAll('.is-gl').length, lostOnce: Boolean(window.__lostOnce),
  };
};

/**
 * The W-D017 boot probe on a lost context (round-5 should-fix S7, Breaker 4.3 #3; round-6 must-fix one-loss-costs-restore
 * (c), Breaker 5.1 #4): the stage context is lost in the task after its first program link (the probe's compileAsync)
 * and restored 300 ms later, at D2 on /bench/ and on / (full; on / W-S1's camera builds on the context at gl-ready). A
 * probe that saw its context lost timed nothing and never passes; the boot waits for the restore and probes again, so
 * the one loss costs only its restore (ruling 6049539219 item 2): one loss, one restore, a probe retry, a final probe
 * that was not lost, the tier that probe gives (full, or a logged probe demotion on a slow GPU), GL ready only after the
 * restore, and a clean console (2f496c8 marked gl-ready 12 to 16 ms after the loss, stepped to lite, and on / logged 6
 * 'INVALID_OPERATION: delete: object does not belong to this context'). Control: no loss, no retry, the same tier rule.
 */
async function probeLoss(base) {
  const LOSE = `(() => {
    const P = WebGL2RenderingContext.prototype;
    const link = P.linkProgram;
    P.linkProgram = function (p) {
      const r = link.call(this, p);
      if (this.canvas && this.canvas.id === 'gl' && !window.__lostOnce) {
        window.__lostOnce = true;
        const ext = this.getExtension('WEBGL_lose_context');
        setTimeout(() => { ext.loseContext(); setTimeout(() => ext.restoreContext(), 300); }, 0);
      }
      return r;
    };
  })();`;
  const rows = [];
  for (const path of ['/bench/', '/']) {
    for (const variant of ['loss', 'control']) {
      const ctx = await newContext('D2');
      await ctx.addInitScript({ content: LOSS_CLOCK });
      if (variant === 'loss') await ctx.addInitScript({ content: LOSE });
      const page = await ctx.newPage();
      const gate = consoleGate(page);
      await page.goto(`${base}${path}`, { waitUntil: 'load' });
      await page.waitForFunction(() => ['ready', 'failed', 'off'].includes(window.__stage?.glState), null, { polling: 100, timeout: 20000 }).catch(() => {});
      await waitSettled(page, 15000);
      await sleep(500);
      const s = await page.evaluate(LOSS_STATE);
      const v = gate.verdict();
      await ctx.close();
      const tierOk = s.probe?.pass ? s.tier === 'full' : s.tier === 'lite' && s.reason === 'probe';
      const pass = variant === 'loss'
        ? s.lostOnce && s.losses === 1 && s.restores === 1 && s.probeRetries >= 1 && s.probe?.lost === false && tierOk && s.glState === 'ready'
          && s.restoreAt.length === 1 && s.readyAt !== null && s.readyAt >= Math.floor(s.restoreAt[0]) && v.pass
        : s.probe?.lost === false && s.probeRetries === 0 && s.losses === 0 && tierOk && s.glState === 'ready' && v.pass;
      rows.push({ path, variant, ...s, console: v.failures.map((f) => `${f.channel}/${f.level}: ${f.text.slice(0, 160)}`), pass });
    }
  }
  return { rows, pass: rows.every((r) => r.pass) };
}

/**
 * A context loss in the boot's task gap (round-6 must-fix one-loss-costs-restore (a), Breaker 5.1 #3): the loss is queued
 * (a timer) as #gl's getContext('webgl2') returns, so it lands between the context and three's renderer, which d9abc26
 * put in separate tasks. W-D017 prices one loss at its restore: the loss is counted (losses 1), the tier is kept and the
 * console stays clean, at D2 and at D3 in WebKit, on /. With a restore 300 ms later GL boots (ready after the restore);
 * with none it waits (glState 'lost', settled, no slot taken). 2f496c8 left the loss unprevented, read it as no WebGL2
 * and ended static (losses 0). Control (W-D017): that loss restored, then a second loss within 60 s, ends static.
 */
async function bootGap(base) {
  const PLANT = (restore) => `(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, attrs) {
      const c = get.call(this, type, attrs);
      if (c && this.id === 'gl' && type === 'webgl2' && !window.__lostOnce) {
        window.__lostOnce = true;
        const ext = c.getExtension('WEBGL_lose_context');
        setTimeout(() => ext.loseContext(), 0);
        ${restore ? "this.addEventListener('webglcontextlost', () => setTimeout(() => ext.restoreContext(), 300), { once: true });" : ''}
      }
      return c;
    };
  })();`;
  const rows = [];
  for (const [profile, extra] of [['D2', {}], ['D3', { browser: 'webkit' }]]) {
    for (const variant of ['restored', 'never restored', 'control: a second loss within 60 s']) {
      const ctx = await newContext(profile, 'auto', extra);
      await ctx.addInitScript({ content: LOSS_CLOCK });
      await ctx.addInitScript({ content: PLANT(variant !== 'never restored') });
      const page = await ctx.newPage();
      const gate = consoleGate(page);
      let s;
      let headTier = null;
      try {
        await page.goto(`${base}/`, { waitUntil: 'load' });
        headTier = await page.evaluate(() => window.__stage?.tierLog?.[0]?.tier ?? null);
        await page.waitForFunction(() => window.__lostOnce && ['ready', 'lost', 'failed', 'off'].includes(window.__stage?.glState), null, { polling: 100, timeout: 20000 }).catch(() => {});
        if (variant === 'never restored') await sleep(1500);
        await waitSettled(page, 15000);
        if (variant.startsWith('control')) {
          await page.evaluate(() => new Promise((res) => {
            document.getElementById('gl').addEventListener('webglcontextlost', () => setTimeout(res, 100), { once: true });
            window.__stage.gl.forceContextLoss();
          }));
          await sleep(300);
        }
        s = await page.evaluate(LOSS_STATE);
      } catch (e) {
        s = { error: String(e?.message || e).slice(0, 300) };
      }
      const v = gate.verdict();
      await ctx.close();
      const kept = s.tier === headTier || (s.tier === 'lite' && headTier === 'full' && s.reason === 'probe');
      let pass;
      if (s.error) pass = false;
      else if (variant === 'restored') pass = s.lostOnce && s.losses === 1 && s.restores === 1 && kept && s.glState === 'ready' && s.readyAt !== null && s.restoreAt.length === 1 && s.readyAt >= Math.floor(s.restoreAt[0]) && v.pass;
      else if (variant === 'never restored') pass = s.lostOnce && s.losses === 1 && s.restores === 0 && s.tier === headTier && s.glState === 'lost' && s.settled && s.readyAt === null && s.isGl === 0 && v.pass;
      else pass = s.lostOnce && s.losses === 2 && s.tier === 'static' && s.reason === 'context-loss';
      rows.push({ profile: `${profile}${extra.browser ? `@${extra.browser}` : ''}`, variant, headTier, ...s, console: v.failures.map((f) => `${f.channel}/${f.level}: ${f.text.slice(0, 160)}`), pass });
    }
  }
  return { rows, pass: rows.every((r) => r.pass) };
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

// --only caps,... runs some checks; --dist runs them on another build (a planted copy for a negative control).
export async function run(opts = {}) {
  const srv = await serve(opts.dist ? String(opts.dist) : undefined);
  const only = opts.only ? new Set(String(opts.only).split(',')) : null;
  const checks = { tiers, governor, caps, reducedMidTimeline, motionSwitch, railSlack, contextLoss, restoreGovernor, probeLoss, bootGap, developKeepsFocus, cubeProjection };
  const out = {};
  try {
    for (const [name, fn] of Object.entries(checks)) if (!only || only.has(name)) out[name] = await fn(srv.base);
  } finally {
    await srv.close();
  }
  const parts = Object.entries(out);
  return { schema: 1, suite: 'w-f/stage', pass: parts.every(([, v]) => v.pass), ...out, summary: parts.map(([k, v]) => `${k} ${v.pass ? 'pass' : 'FAIL'}`).join(', ') };
}

await cliMain(import.meta.url, run);
