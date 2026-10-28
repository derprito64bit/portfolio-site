#!/usr/bin/env node
// W-S2 self-break (PROTOCOL: before ready). Each scenario breaks the page mid-develop and asserts the end state: no
// slot left .is-gl, no print left wet, no page error, no horizontal overflow, the view and ?view= consistent.
//   ctxloss      a WebGL context loss mid-develop (__stage.gl.forceContextLoss): the print is handed back developed;
//                after the restore the sheet still develops or arrives developed.
//   throw        an error thrown from the developing print's step mid-animation: the stage guards it and the print
//                still hands back.
//   resize       the viewport crosses 1024 px mid-wave (D2 1440 -> 900).
//   orientation  P2 turns landscape (390x844 -> 844x390) mid-wave.
//   bfcache      Chrome with the back/forward cache: leave mid-wave by a full navigation, come Back.
//   no3d         Chrome without WebGL: nothing wet, no veil up, no .is-gl, through the whole page.
//   static       ?tier=static: the same.
//   savedata     Save-Data (navigator.connection.saveData): the lite tier, the List by default (W-D024); the
//                enlargements develop and end dry.
//   reduced      reduced motion: nothing develops, nothing wet.
//   rapid        nine Sheet/List toggles in about a second mid-develop: the last state wins, prints arrive developed.
//   swup         a Swup arrival at / from a project page (its markup's inline view default never ran: prints.ts runs
//                it again): the view is set and matches the checked radio, the toggle works; then a toggle, a Swup
//                visit to a project and Back: the address keeps ?view= and the view (breaker 1.1).
// --browser webkit runs throw, resize, rapid, reduced and swup in WebKit (WK-T2).
// --plant handback (negative control): __stage.give() does nothing, so a print keeps .is-gl; the scenario must FAIL.
// Usage: node tests/w-s2/selfbreak.mjs --out <dir> [--only a,b] [--browser chromium|webkit] [--plant handback]
//        [--dist <dir>]
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { closeBrowsers, cliOpts, newContext, serve, sleep } from '../harness/lib.mjs';

const o = cliOpts();
const out = String(o.out ?? 'w-s2-selfbreak');
mkdirSync(out, { recursive: true });
const webkit = String(o.browser ?? 'chromium') === 'webkit';
const plant = o.plant ? String(o.plant) : null;
const ALL = webkit ? ['throw', 'resize', 'rapid', 'reduced', 'swup'] : ['ctxloss', 'throw', 'resize', 'orientation', 'bfcache', 'no3d', 'static', 'savedata', 'reduced', 'rapid', 'swup'];
const only = o.only ? String(o.only).split(',') : ALL;
const DESK = webkit ? 'WK-T2' : 'D2';
const FRAME = 1000 / 60;
let clock = 0;

async function open(srv, profile, url, { browserName, mode = 'auto', init } = {}) {
  clock = 0;
  const extra = browserName ? { browser: browserName } : webkit ? { browser: 'webkit' } : {};
  const ctx = await newContext(profile, mode, extra);
  if (init) await ctx.addInitScript(init);
  if (plant === 'handback') await ctx.addInitScript(() => { const t = setInterval(() => { if (window.__stage) { window.__stage.give = () => {}; clearInterval(t); } }, 5); });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${srv.base}${url}`, { waitUntil: 'load' });
  return { ctx, p, errors };
}
const marks = (p) => p.evaluate(() => performance.getEntriesByName('prints:develop').length);
async function until(p, fn, ms = 4000, arg) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await p.evaluate(fn, arg)) return true;
    await sleep(50);
  }
  return false;
}
const ready = (p) => until(p, () => performance.getEntriesByName('prints:ready').length > 0, 15000);
async function reveal(p, sel, frac) {
  await p.evaluate(([s, f]) => { const r = document.querySelector(s).getBoundingClientRect(); window.scrollTo(0, scrollY + r.top - innerHeight + Math.min(r.height * f, innerHeight * f)); }, [sel, frac]);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(120);
}
const seek = async (p, n) => { for (let i = 0; i < n; i++) await p.evaluate((m) => window.__stage.seek(m), (clock += FRAME)); };
/** The end state every scenario must reach. A print that never reached 35% visible stays wet and veiled (it develops
 *  when it does); a print whose develop started (data-dev) must be dry, handed back and unveiled. */
const endState = (p) =>
  p.evaluate(() => ({
    isGl: [...document.querySelectorAll('[data-print].is-gl')].map((e) => e.dataset.glId),
    stuck: [...document.querySelectorAll('[data-print][data-dev]')].filter((e) => e.dataset.dev !== 'done' || e.hasAttribute('data-wet')).map((e) => e.dataset.glId),
    veils: [...document.querySelectorAll('[data-print][data-dev] .print-veil')].filter((v) => v.offsetParent !== null && getComputedStyle(v).opacity !== '0' && !v.closest('[data-failed]')).length,
    untriggeredWet: [...document.querySelectorAll('[data-print][data-wet]:not([data-dev])')].length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    tier: window.__stage?.tier,
    hookErrors: window.__stage?.stats.hookErrors,
    losses: window.__stage?.stats.losses,
  }));
function judge(s, errors, fails) {
  if (s.isGl.length) fails.push(`still .is-gl: ${s.isGl.join(',')}`);
  if (s.stuck.length) fails.push(`develop started and not finished: ${s.stuck.join(',')}`);
  if (s.veils) fails.push(`${s.veils} veils still up on started prints`);
  if (s.overflow > 0) fails.push(`horizontal overflow ${s.overflow} px`);
  if (errors.length) fails.push(`page errors: ${errors.slice(0, 2).join(' | ')}`);
  return { pass: !fails.length, fails, end: s };
}
/** Start the sheet's develop on the manual clock and play `n` frames into it. */
async function midWave(p, n = 30) {
  const n0 = await marks(p);
  await reveal(p, '[data-sheet-grid]', 0.4);
  await until(p, (k) => performance.getEntriesByName('prints:develop').length > k, 3000, n0);
  await sleep(400);
  await seek(p, n);
  return p.evaluate(() => document.querySelectorAll('[data-print="sheet"].is-gl').length);
}
/** Scroll the whole page in steps (real clock), then wait for any develop to finish. */
async function walk(p) {
  const h = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= h; y += 400) {
    await p.evaluate((v) => window.scrollTo(0, v), y);
    await sleep(80);
  }
  await sleep(3500);
}

const S = {
  async ctxloss(srv) {
    const fails = [];
    const { ctx, p, errors } = await open(srv, DESK, '/?t=0&view=sheet');
    await ready(p);
    const id = await p.evaluate(() => document.querySelector('[data-print="enl"]').dataset.glId);
    await reveal(p, `[data-gl-id="${id}"] .print-card`, 0.4);
    await sleep(400);
    await seek(p, 30);
    const mid = await p.evaluate((i) => document.querySelector(`[data-gl-id="${i}"][data-gl]`).classList.contains('is-gl'), id);
    if (!mid) fails.push('the enlargement was not mid-develop (.is-gl) when the context was lost');
    await p.evaluate(() => window.__stage.gl.forceContextLoss());
    await sleep(300);
    await seek(p, 3);
    const afterLoss = await endState(p);
    if (afterLoss.isGl.length) fails.push(`after the loss still .is-gl: ${afterLoss.isGl.join(',')}`);
    if (afterLoss.stuck.includes(id)) fails.push('after the loss the enlargement is still developing');
    await p.evaluate(() => window.__stage.gl.forceContextRestore());
    await sleep(800);
    await seek(p, 3);
    await midWave(p, 10);
    await seek(p, 160);
    const r = judge(await endState(p), errors, fails);
    await ctx.close();
    return { ...r, midDevelop: mid, afterLoss };
  },
  async throw(srv) {
    const fails = [];
    const { ctx, p, errors } = await open(srv, DESK, '/?t=0&view=sheet');
    await ready(p);
    const id = await p.evaluate(() => document.querySelector('[data-print="enl"]').dataset.glId);
    await reveal(p, `[data-gl-id="${id}"] .print-card`, 0.4);
    await sleep(400);
    await seek(p, 20);
    const h0 = await p.evaluate(() => window.__stage.stats.hookErrors);
    await p.evaluate((i) => {
      const e = window.__stage.gl.entity(i);
      const step = e.step;
      let once = true;
      e.step = function (...a) {
        if (once) {
          once = false;
          throw new Error('selfbreak: a thrown error mid-animation');
        }
        return step.apply(this, a);
      };
    }, id);
    await seek(p, 200);
    const s = await endState(p);
    const dev = await p.evaluate((i) => document.querySelector(`[data-gl-id="${i}"][data-gl]`).dataset.dev, id);
    if (dev !== 'done') fails.push(`the enlargement ended '${dev}', want done`);
    if (!(s.hookErrors > h0)) fails.push(`the throw was not caught by the stage's guard (hookErrors ${h0} -> ${s.hookErrors})`);
    const r = judge(s, errors.filter((e) => !/selfbreak: a thrown error/.test(e)), fails);
    await ctx.close();
    return r;
  },
  async resize(srv) {
    const fails = [];
    const { ctx, p, errors } = await open(srv, DESK, '/?t=0&view=sheet');
    await ready(p);
    const wet = await midWave(p);
    if (!wet) fails.push('the sheet was not mid-develop at the resize');
    const vp = p.viewportSize();
    await p.setViewportSize({ width: vp.width > 1024 ? 900 : 1100, height: vp.height });
    await sleep(300);
    await seek(p, 160);
    const r = judge(await endState(p), errors, fails);
    await ctx.close();
    return { ...r, wetAtResize: wet };
  },
  async orientation(srv) {
    const fails = [];
    const { ctx, p, errors } = await open(srv, 'P2', '/?t=0&view=sheet');
    await ready(p);
    const wet = await midWave(p);
    if (!wet) fails.push('the sheet was not mid-develop at the turn');
    await p.setViewportSize({ width: 844, height: 390 });
    await sleep(300);
    await seek(p, 160);
    const r = judge(await endState(p), errors, fails);
    await ctx.close();
    return { ...r, wetAtTurn: wet };
  },
  async bfcache(srv) {
    const fails = [];
    const { ctx, p, errors } = await open(srv, DESK, '/?view=sheet', { browserName: 'chromium-bfcache' });
    await ready(p);
    await p.evaluate(() => addEventListener('pageshow', (e) => (window.__persisted = e.persisted)));
    const n0 = await marks(p);
    await reveal(p, '[data-sheet-grid]', 0.4);
    await until(p, (k) => performance.getEntriesByName('prints:develop').length > k, 3000, n0);
    await sleep(500);
    const midGl = await p.evaluate(() => document.querySelectorAll('[data-print="sheet"].is-gl').length);
    await p.goto(`${srv.base}/work/project-01/`, { waitUntil: 'load' });
    await sleep(500);
    await p.goBack({ waitUntil: 'commit' });
    await sleep(3000);
    const persisted = await p.evaluate(() => window.__persisted === true);
    const r = judge(await endState(p), errors, fails);
    await ctx.close();
    return { ...r, midGl, restoredFromBfcache: persisted };
  },
  async no3d(srv) {
    const { ctx, p, errors } = await open(srv, DESK, '/', { browserName: 'chromium-no3d' });
    await walk(p);
    const s = await endState(p);
    const r = judge(s, errors, []);
    await ctx.close();
    return r;
  },
  async static(srv) {
    const { ctx, p, errors } = await open(srv, DESK, '/?tier=static');
    await walk(p);
    const fails = [];
    const s = await endState(p);
    if (s.tier !== 'static') fails.push(`tier ${s.tier}`);
    const r = judge(s, errors, fails);
    await ctx.close();
    return r;
  },
  async savedata(srv) {
    const { ctx, p, errors } = await open(srv, DESK, '/', { init: () => Object.defineProperty(navigator, 'connection', { value: { saveData: true, effectiveType: '4g', addEventListener() {} }, configurable: true }) });
    await walk(p);
    const fails = [];
    const s = await endState(p);
    if (s.tier !== 'lite') fails.push(`tier ${s.tier}, want lite under Save-Data`);
    const develops = await marks(p);
    // W-D024: the List is the default with Save-Data; the enlargements still develop on the lite tier.
    const view = await p.evaluate(() => document.querySelector('section.sheet').dataset.view);
    if (view !== 'list') fails.push(`view ${view}, want list under Save-Data (W-D024)`);
    if (develops < 3) fails.push(`${develops} develops, want the 3 enlargements`);
    const r = judge(s, errors, fails);
    await ctx.close();
    return { ...r, develops };
  },
  async reduced(srv) {
    const { ctx, p, errors } = await open(srv, DESK, '/', { mode: 'reduced' });
    await walk(p);
    const fails = [];
    const develops = await marks(p);
    if (develops) fails.push(`${develops} develops under reduced motion`);
    const r = judge(await endState(p), errors, fails);
    await ctx.close();
    return r;
  },
  async rapid(srv) {
    const fails = [];
    const { ctx, p, errors } = await open(srv, DESK, '/?t=0');
    await ready(p);
    const view0 = await p.evaluate(() => document.querySelector('section.sheet')?.dataset.view);
    if (view0 === 'list') await p.click('input[name="sheet-view"][value="sheet"]', { force: true });
    await sleep(700);
    await midWave(p, 20);
    const seq = ['list', 'sheet', 'list', 'sheet', 'list', 'sheet', 'list', 'sheet', 'list'];
    for (const v of seq) {
      await p.click(`input[name="sheet-view"][value="${v}"]`, { force: true });
      await sleep(110);
    }
    await sleep(800);
    await seek(p, 200); // any enlargement the reveal triggered finishes on the manual clock
    const st = await p.evaluate(() => ({ view: document.querySelector('section.sheet').dataset.view, q: new URLSearchParams(location.search).get('view'), checked: document.querySelector('input[name="sheet-view"]:checked')?.value }));
    if (st.view !== 'list' || st.q !== 'list' || st.checked !== 'list') fails.push(`after ${seq.length} toggles: ${JSON.stringify(st)}, want list everywhere`);
    const r = judge(await endState(p), errors, fails);
    await ctx.close();
    return { ...r, state: st };
  },
  async swup(srv) {
    const fails = [];
    const { ctx, p, errors } = await open(srv, DESK, '/work/project-01/');
    await sleep(1500);
    await p.evaluate(() => (window.__sameDoc = 1));
    await p.click('a.site-mark[href="/"]');
    await p.waitForFunction(() => location.pathname === '/' && document.querySelector('section.sheet'), null, { timeout: 10000 });
    await sleep(1000);
    const view = () => p.evaluate(() => ({ sameDoc: window.__sameDoc === 1, view: document.querySelector('section.sheet')?.dataset.view ?? null, checked: document.querySelector('input[name="sheet-view"]:checked')?.value ?? null, q: new URLSearchParams(location.search).get('view') }));
    const arrived = await view();
    if (!arrived.sameDoc) fails.push('the visit to / was a full load, not a Swup arrival (instrument invalid)');
    if (!arrived.view || arrived.view !== arrived.checked) fails.push(`Swup arrival: view ${arrived.view}, checked ${arrived.checked}`);
    const other = arrived.view === 'list' ? 'sheet' : 'list';
    await p.click(`input[name="sheet-view"][value="${other}"]`, { force: true });
    await sleep(800);
    const toggled = await view();
    if (toggled.view !== other || toggled.q !== other || toggled.checked !== other) fails.push(`toggle after a Swup arrival: ${JSON.stringify(toggled)}, want ${other}`);
    await p.evaluate(() => document.querySelector('[data-print="enl"]').click());
    await p.waitForFunction(() => location.pathname.startsWith('/work/'), null, { timeout: 10000 });
    await sleep(800);
    await p.goBack();
    await p.waitForFunction(() => location.pathname === '/' && document.querySelector('section.sheet'), null, { timeout: 10000 });
    await sleep(1000);
    const back = await view();
    if (back.q !== other || back.view !== other || back.checked !== other) fails.push(`Back after a toggle: ${JSON.stringify(back)}, want ?view=${other} and the ${other}`);
    const r = judge(await endState(p), errors, fails);
    await ctx.close();
    return { ...r, arrived, toggled, back };
  },
};

const srv = await serve(o.dist ? String(o.dist) : undefined);
const results = {};
try {
  for (const name of only) {
    try {
      results[name] = await S[name](srv);
    } catch (e) {
      results[name] = { pass: false, fails: [`threw: ${String(e.message ?? e).split('\n')[0]}`] };
    }
    console.log(`  ${results[name].pass ? 'ok  ' : 'FAIL'} ${name}${results[name].fails.length ? `: ${results[name].fails.join('; ')}` : ''}`);
  }
} finally {
  await closeBrowsers();
  await srv.close();
}
const pass = Object.values(results).every((r) => r.pass);
writeFileSync(join(out, `selfbreak-${webkit ? 'webkit' : 'chromium'}${plant ? `-plant-${plant}` : ''}.json`), JSON.stringify({ schema: 1, suite: 'w-s2/selfbreak', browser: webkit ? 'webkit' : 'chromium', plant, pass, results }, null, 2));
console.log(`w-s2 selfbreak (${webkit ? 'webkit' : 'chromium'}${plant ? `, plant ${plant}` : ''}): ${pass ? 'PASS' : 'FAIL'}`);
process.exit(pass ? 0 : 1);
