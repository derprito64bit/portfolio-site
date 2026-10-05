// W-F self-break (the crew loop's list), Chromium and WebKit. Each case tries to break the stage, then checks that the
// page is whole: the console gate (only the failures a case plants are expected), GL still presents what it last drew,
// and the stage still sleeps.
//   rest       rest past the idle detach (2.5 s), then act: a recolour is presented after the stage wakes
//   tierDrop   a recolour, then a demotion to lite and to static inside its present tail
//   ctxLoss    a recolour, then a context loss inside its tail; a restore; a recolour is presented again
//   throw      an entity whose step() throws once in the middle of a spin: reported once, the spin finishes, the
//              stage still renders, presents and sleeps (stats.hookErrors)
//   history    Swup to a project and Back (focus on the print link), a bfcache round trip, a reload, a hash arrival
//   rapid      actions 1 to 4 in a row: four recolours inside one frame's reach; the last one is presented
//   resize     a resize and an orientation change in the middle of a cube spin: no errors, the cube stays on its slot
//   reduced    reduced motion turned on in the middle of a spin: the spin ends at once
// Usage: node tests/w-f/selfbreak.mjs [--out selfbreak.json] [--profiles D2,WK-P2]
import sharp from 'sharp';
import { PROFILES, cliMain, consoleGate, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';

const near = (a, b, tol = 4) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

async function bench(base, profile, query = '') {
  const ctx = await newContext(profile);
  const page = await ctx.newPage();
  const gate = consoleGate(page);
  await page.goto(`${base}/bench/?tier=lite${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stage?.glState === 'ready' && window.__stage.fixtures, null, { polling: 100, timeout: 20000 });
  await page.evaluate(() => document.querySelector('[data-gl-id="fx-1"]').scrollIntoView({ block: 'center' }));
  await waitSettled(page, 10000);
  return { ctx, page, gate };
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
async function tintAndRest(page, rgb) {
  const s0 = await sleeps(page);
  await page.evaluate((c) => window.__stage.fixtures.tint('fx-1', ...c), rgb);
  await page.waitForFunction((n) => window.__stage.stats.sleeps > n, s0, { polling: 50, timeout: 10000 });
  await sleep(80);
  return colourOf(page);
}
const verdict = (gate, expectErrors = 0) => {
  const v = gate.verdict();
  return { failures: v.failures.map((f) => `${f.channel}/${f.level}: ${f.text.slice(0, 140)}`), ok: v.failures.length === expectErrors };
};

const CASES = {
  async rest(base, profile) {
    const { ctx, page, gate } = await bench(base, profile);
    await sleep(2500);
    const asleep = await page.evaluate(() => window.__stage.settled);
    const got = await tintAndRest(page, [250, 30, 30]);
    const c = verdict(gate);
    await ctx.close();
    return { asleepBefore: asleep, got, ...c, pass: asleep && near(got, [250, 30, 30]) && c.ok };
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
      await new Promise((res) => setTimeout(res, 1500));
      return { tier: s.tier, isGl: document.querySelectorAll('.is-gl').length, railShown: getComputedStyle(document.getElementById('rail')).display !== 'none', drawsAfter: s.stats.draws - draws, settled: s.settled };
    });
    const c = verdict(gate);
    await ctx.close();
    return { ...r, ...c, pass: r.tier === 'static' && r.isGl === 0 && !r.railShown && r.drawsAfter <= 1 && c.ok };
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
    await waitSettled(page, 10000);
    const got = await tintAndRest(page, [30, 30, 250]);
    const c = verdict(gate);
    await ctx.close();
    return { ...r, got, ...c, pass: r.isGlAfterLoss === 0 && r.restores >= 1 && r.tier === 'lite' && near(got, [30, 30, 250]) && c.ok };
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
      return { thrown, hookErrors: s.stats.hookErrors, spinning: s.fixtures.spinning(), settled: s.settled };
    });
    await waitSettled(page, 10000);
    const got = await tintAndRest(page, [30, 200, 30]);
    const v = gate.verdict();
    const planted = v.failures.filter((f) => /self-break: entity step threw/.test(f.text));
    const others = v.failures.filter((f) => !/self-break: entity step threw/.test(f.text));
    await ctx.close();
    return { ...r, got, plantedReported: planted.length, otherFailures: others.map((f) => f.text.slice(0, 140)), pass: r.thrown === 1 && r.hookErrors === 1 && !r.spinning && planted.length >= 1 && others.length === 0 && near(got, [30, 200, 30]) };
  },
  async history(base, profile) {
    const ctx = await newContext(profile);
    const page = await ctx.newPage();
    const gate = consoleGate(page);
    await page.goto(`${base}/`, { waitUntil: 'load' });
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
    // bfcache: a full navigation away and Back.
    await page.goto(`${base}/404.html`, { waitUntil: 'load' });
    await page.goBack({ waitUntil: 'load' });
    await sleep(500);
    const bf = await page.evaluate(() => ({ path: location.pathname, persisted: performance.getEntriesByType('navigation')[0]?.type ?? null, stage: Boolean(window.__stage), tier: window.__stage?.tier }));
    await page.reload({ waitUntil: 'load' });
    await waitSettled(page, 15000);
    const reload = await page.evaluate(() => ({ tier: window.__stage.tier, cam: document.documentElement.dataset.cam ?? null, glState: window.__stage.glState }));
    await page.goto(`${base}/#contact`, { waitUntil: 'load' });
    await waitSettled(page, 15000);
    const hash = await page.evaluate(() => ({ y: Math.round(window.scrollY), target: Math.round(document.getElementById('contact').getBoundingClientRect().top), cam: document.documentElement.dataset.cam ?? null }));
    const c = verdict(gate);
    await ctx.close();
    return { back, bf, reload, hash, ...c, pass: back.focus === 'project-02' && back.canvas && bf.path === '/' && bf.stage && Boolean(reload.tier) && hash.y > 0 && hash.cam === 'camera' && c.ok };
  },
  async rapid(base, profile) {
    const { ctx, page, gate } = await bench(base, profile);
    const s0 = await sleeps(page);
    await page.evaluate(() => { for (const c of [[250, 30, 30], [30, 30, 250], [30, 200, 30], [200, 200, 30]]) window.__stage.fixtures.tint('fx-1', ...c); });
    await page.waitForFunction((n) => window.__stage.stats.sleeps > n, s0, { polling: 50, timeout: 10000 });
    await sleep(80);
    const got = await colourOf(page);
    const c = verdict(gate);
    await ctx.close();
    return { got, ...c, pass: near(got, [200, 200, 30]) && c.ok };
  },
  async resize(base, profile) {
    const ctx = await newContext(profile);
    const page = await ctx.newPage();
    const gate = consoleGate(page);
    await page.goto(`${base}/bench/`, { waitUntil: 'load' });
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
    await page.setViewportSize(vp);
    await page.evaluate(() => document.querySelector('[data-gl-id="fixture-cube"]').scrollIntoView({ block: 'center' }));
    await waitSettled(page, 10000);
    const r = await page.evaluate(() => {
      const b = window.__stage.bounds('fixture-cube');
      return { spinning: window.__stage.fixtures.spinning(), slot: b.slot, gl: b.gl, view: { W: window.__stage.view.W, dpr: window.__stage.view.dpr }, clientWidth: document.getElementById('rail').clientWidth };
    });
    const c = verdict(gate);
    await ctx.close();
    // The cube's projected box sits inside its slot (its view is the slot), and the stage measured the new width.
    const inside = r.gl && r.gl.x >= r.slot.x - 0.5 && r.gl.y >= r.slot.y - 0.5 && r.gl.x + r.gl.w <= r.slot.x + r.slot.w + 0.5 && r.gl.y + r.gl.h <= r.slot.y + r.slot.h + 0.5;
    return { ...r, inside, ...c, pass: !r.spinning && inside && r.view.W === r.clientWidth && c.ok };
  },
  async reduced(base, profile) {
    const { ctx, page, gate } = await bench(base, profile);
    await page.evaluate(() => window.__stage.fixtures.spin(4000));
    await sleep(300);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sleep(50);
    const r = await page.evaluate(() => ({ spinning: window.__stage.fixtures.spinning(), motion: window.__stage.motion }));
    const c = verdict(gate);
    await ctx.close();
    return { ...r, ...c, pass: !r.spinning && r.motion === 'reduced' && c.ok };
  },
};

export async function run(opts = {}) {
  const profiles = String(opts.profiles || 'D2,P2,WK-P2').split(',');
  const srv = await serve();
  const rows = [];
  try {
    for (const profile of profiles) {
      for (const [name, fn] of Object.entries(CASES)) {
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
  return { schema: 1, suite: 'w-f/selfbreak', pass: rows.every((r) => r.pass), rows, summary: rows.map((r) => `${r.case}@${r.profile} ${r.pass ? 'ok' : 'BROKE'}`).join(', ') };
}

await cliMain(import.meta.url, run);
