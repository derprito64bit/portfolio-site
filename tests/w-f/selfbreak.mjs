// W-F self-break (the crew loop's list), Chromium and WebKit. Each case tries to break the stage, then checks that the
// page is whole: the console gate (only the failures a case plants are expected), GL still presents what it last drew,
// the canvas stays on its buffer-pixel grid and as wide as its layout (W-D013 as amended), there is one ticker chain
// (the gate's rAF count, dependencies aside, equals __stage.stats.ticks over an active window), and the stage settles
// (__stage.settled). Round 2: every case can fail on what it claims (round-1 review, Breakers 1.1 #3, 1.2 #3, 1.3 #3).
//   rest        rest past the idle detach (2.5 x durations.idleDetach), then a real wheel, a real press and a recolour:
//               no error, each settles, the recolour is presented
//   tierDrop    a recolour, then a demotion to lite and to static inside its present tail: GL gone, the stage settles
//               and stops ticking
//   ctxLoss     a recolour, then a context loss inside its tail; a restore; a recolour is presented again; settles
//   throw       an entity whose step() throws once in the middle of a spin: reported once, the spin finishes, the
//               stage still renders, presents and sleeps (stats.hookErrors)
//   renderThrow a three hook (onBeforeRender) that throws once inside one view's draw, through a ticker frame and
//               through a layout render (renderNow): the other views still draw that frame, the error is counted
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
import { PROFILES, cliMain, consoleGate, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';
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
async function bench(base, profile, query = '') {
  const o = await open(base, profile, `/bench/?tier=lite${query}`);
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
    const { ctx, page, gate } = await bench(base, profile, '&tier=full');
    const r = await page.evaluate(async () => {
      const s = window.__stage;
      s.fixtures.tint('fx-1', 250, 30, 30);
      await new Promise((res) => requestAnimationFrame(res));
      s.demote('lite', 'self-break');
      await new Promise((res) => requestAnimationFrame(res));
      s.demote('static', 'self-break');
      const draws = s.stats.draws;
      await new Promise((res) => setTimeout(res, 300));
      return { tier: s.tier, isGl: document.querySelectorAll('.is-gl').length, railShown: getComputedStyle(document.getElementById('rail')).display !== 'none', drawsAfter: s.stats.draws - draws };
    });
    const after = await settles(page);
    const c = verdict(gate);
    await ctx.close();
    return { ...r, after, ...c, pass: r.tier === 'static' && r.isGl === 0 && !r.railShown && r.drawsAfter <= 1 && after.ok && c.ok };
  },
  async ctxLoss(base, profile) {
    const { ctx, page, gate } = await bench(base, profile);
    const r = await page.evaluate(async () => {
      const s = window.__stage;
      s.fixtures.tint('fx-1', 250, 30, 30);
      await new Promise((res) => requestAnimationFrame(res));
      s.gl.forceContextLoss();
      await new Promise((res) => requestAnimationFrame(res));
      const isGl = document.querySelectorAll('.is-gl').length;
      s.gl.forceContextRestore();
      await new Promise((res) => setTimeout(res, 800));
      return { isGlAfterLoss: isGl, tier: s.tier, restores: s.stats.restores };
    });
    const after = await settles(page);
    const got = await tintAndRest(page, [30, 30, 250]);
    const grid = await gridOf(page);
    const c = verdict(gate);
    await ctx.close();
    return { ...r, after, got, grid, ...c, pass: r.isGlAfterLoss === 0 && r.restores >= 1 && r.tier === 'lite' && after.ok && near(got, [30, 30, 250]) && grid.ok && c.ok };
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
