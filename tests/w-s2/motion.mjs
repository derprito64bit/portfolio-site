#!/usr/bin/env node
// W-S2 motion instrument (#14 spec v1 rows L3, L4 at rest, T1, T2, H1, M1) on the built /.
//   L3 develop   on __stage.seek frames (?t=0): an enlargement develops once 35% visible and not before, over
//                durations.develop; the sheet as one wave (durations.developSheet each, sheetStagger apart), all
//                handed back <= 2.1 s after its trigger; take, then give at d = 1; focus never moves.
//   L3 once      a reload in the same session, an anchor arrival (/#sheet and the hero's #work link), a List arrival
//                and a Back arrival never develop.
//   T1, T2       a toggle is a List arrival (the sheet is flagged developed); mid-develop, Sheet to List hands every
//                print back in the toggle's own task, before the crossfade; the swap rate on page.clock.
//   H1           the lift is GL (.is-gl) on a fine pointer within about 100 ms, never on keyboard focus or a coarse
//                pointer.
//   M1           the lay-down: pitched under 35% visible, flat from 35%, one-way, flat under reduced motion.
//   L4           at rest no slot is .is-gl and the stage stops drawing.
// --plant <name> breaks one thing from outside the product (page-side), and its row must FAIL: duration (develops 20%
// short), early (the IO trigger fires at 10%), twice (the session forgets), handback (give() does nothing), swap (no
// swap window), focuslift (focus lifts), tilt (the card stays pitched), rest (a slot keeps .is-gl).
// Usage: node tests/w-s2/motion.mjs [--only l3,once,toggle,swap,hover,m1,rest] [--browser chromium|webkit]
//        [--plant <name>] [--dist <dir>] [--out <dir>]
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { closeBrowsers, cliOpts, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';
import { durations } from '../../src/lib/tokens.js';

const o = cliOpts();
const plant = o.plant ? String(o.plant) : null;
const only = new Set(String(o.only ?? 'l3,once,toggle,swap,hover,m1,rest').split(','));
const webkit = String(o.browser ?? 'chromium') === 'webkit';
const DESK = webkit ? 'WK-T2' : 'D2';
const FRAME = 1000 / 60;
/** The sheet is fully developed within this long of its trigger (#14 acceptance line 3). */
export const SHEET_DONE_MS = 2100;
const results = {};
const evidence = {};

const PLANT_INIT = {
  // The session forgets what developed: every load develops again.
  twice: () => sessionStorage.removeItem('ion.dev'),
  // A defect that fires the develop trigger at 10% visible.
  early: () => {
    const IO = window.IntersectionObserver;
    window.IntersectionObserver = class extends IO {
      constructor(cb, opts) {
        super((es, ob) => cb(es.map((e) => (e.isIntersecting && e.intersectionRatio >= 0.1 ? Object.defineProperty(Object.create(e), 'intersectionRatio', { value: 1 }) : e)), ob), opts);
      }
    };
  },
  // No swap window: timers fire at once.
  swap: () => {
    const st = window.setTimeout;
    window.setTimeout = (fn, ms, ...a) => st(fn, 0, ...a);
  },
};
async function page(srv, profile, url, { mode = 'auto', init = [], clock = false } = {}) {
  const ctx = await newContext(profile, mode, webkit ? { browser: 'webkit' } : {});
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  for (const fn of init) await ctx.addInitScript(fn);
  if (plant && PLANT_INIT[plant]) await ctx.addInitScript(PLANT_INIT[plant]);
  if (clock) await p.clock.install();
  await p.goto(`${srv.base}${url}`, { waitUntil: 'load' });
  return { ctx, p, errors };
}
const markAt = (p, name) => p.evaluate((n) => performance.getEntriesByName(n).length, name);
async function waitMark(p, name, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await markAt(p, name)) return true;
    await sleep(50);
  }
  return false;
}
/** Scroll so `sel`'s box is `frac` visible from the bottom of the viewport; returns once two frames have rendered. */
async function reveal(p, sel, frac) {
  await p.evaluate(
    ([s, f]) => {
      const el = document.querySelector(s);
      const r = el.getBoundingClientRect();
      const visible = Math.min(r.height * f, innerHeight * f);
      window.scrollTo(0, scrollY + r.top - innerHeight + visible);
    },
    [sel, frac],
  );
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(120);
}
const state = (p, ids) =>
  p.evaluate((ids) => ids.map((id) => { const el = document.querySelector(`[data-gl-id="${id}"][data-gl]`); return { id, gl: el.classList.contains('is-gl'), wet: el.hasAttribute('data-wet') }; }), ids);
async function plantPage(p) {
  if (plant === 'duration') await p.evaluate(() => window.__stage.registerEffect('develop', (id, op, next) => next(id, { ...op, duration: op.duration * 0.8 })));
  if (plant === 'handback') await p.evaluate(() => (window.__stage.give = () => {}));
}

/** Seek frame by frame from `t` until every id has been taken and handed back (or `max` frames); one record per frame. */
async function seekRun(p, ids, t, max) {
  const frames = [];
  for (let i = 0; i < max; i++) {
    const ms = t + i * FRAME;
    await p.evaluate((m) => window.__stage.seek(m), ms);
    const s = await state(p, ids);
    frames.push({ i, ms, s });
    if (i > 2 && s.every((x) => !x.gl && !x.wet)) break;
  }
  const first = (id, f) => frames.find((fr) => f(fr.s.find((x) => x.id === id)))?.i ?? null;
  return ids.map((id) => ({ id, take: first(id, (x) => x.gl), give: first(id, (x) => !x.wet && !x.gl) }));
}

const srv = await serve(o.dist ? String(o.dist) : undefined);
try {
  // ---------------------------------------------------------------- L3 develop on seek frames
  if (only.has('l3')) {
    const { ctx, p, errors } = await page(srv, DESK, '/?t=0&view=sheet');
    await waitMark(p, 'prints:ready');
    await plantPage(p);
    const focus0 = await p.evaluate(() => document.activeElement?.tagName);
    const id = (await p.evaluate(() => document.querySelector('[data-print="enl"]').dataset.glId));
    await reveal(p, `[data-gl-id="${id}"] .print-card`, 0.25);
    const before = await markAt(p, 'prints:develop');
    await reveal(p, `[data-gl-id="${id}"] .print-card`, 0.4);
    const triggered = await waitMark(p, 'prints:develop', 3000);
    await sleep(400); // the texture is built in real time before the develop's first frame
    const [enl] = await seekRun(p, [id], 10000, 200);
    const enlMs = enl.give !== null && enl.take !== null ? (enl.give - (enl.take - 1)) * FRAME : null;
    // The sheet wave.
    const sheetIds = await p.evaluate(() => [...document.querySelectorAll('[data-print="sheet"]')].map((a) => a.dataset.glId));
    const n0 = await p.evaluate(() => performance.getEntriesByName('prints:develop').length);
    await reveal(p, '[data-sheet-grid]', 0.4);
    const t0 = Date.now();
    while ((await p.evaluate(() => performance.getEntriesByName('prints:develop').length)) === n0 && Date.now() - t0 < 3000) await sleep(50);
    await sleep(400);
    const wave = await seekRun(p, sheetIds, 20000, 160);
    const focus1 = await p.evaluate(() => document.activeElement?.tagName);
    const lastGive = Math.max(...wave.map((w) => w.give ?? Infinity));
    const starts = wave.map((w) => (w.take ?? NaN) - 1);
    const stagger = starts.slice(1).map((s, k) => (s - starts[k]) * FRAME);
    const durs = wave.map((w) => (w.give - (w.take - 1)) * FRAME);
    const fails = [];
    if (before) fails.push('an enlargement developed under 35% visible');
    if (!triggered) fails.push('no develop at 40% visible');
    if (enlMs === null || enlMs < durations.develop || enlMs > durations.develop + 2 * FRAME) fails.push(`enlargement develop ${enlMs?.toFixed(0)} ms, want ${durations.develop}`);
    if (!(lastGive * FRAME <= SHEET_DONE_MS)) fails.push(`sheet done ${(lastGive * FRAME).toFixed(0)} ms after its trigger > ${SHEET_DONE_MS}`);
    if (durs.some((d) => d < durations.developSheet || d > durations.developSheet + 2 * FRAME)) fails.push(`sheet print develops ${durs.map((d) => d.toFixed(0)).join(',')} ms, want ${durations.developSheet}`);
    if (stagger.some((s) => Math.abs(s - durations.sheetStagger) > FRAME)) fails.push(`stagger ${stagger.map((s) => s.toFixed(0)).join(',')} ms, want ${durations.sheetStagger}`);
    if (focus0 !== focus1) fails.push(`focus moved ${focus0} -> ${focus1}`);
    if (errors.length) fails.push(`console: ${errors.slice(0, 2).join(' | ')}`);
    results.L3 = { pass: !fails.length, fails, enlargement: { id, ...enl, ms: enlMs }, sheet: { lastGiveMs: lastGive * FRAME, durationsMs: durs, staggerMs: stagger, wave } };
    await ctx.close();
  }

  // ---------------------------------------------------------------- once per session, never on an anchor, List or Back arrival
  if (only.has('once')) {
    const fails = [];
    const { ctx, p } = await page(srv, DESK, '/?t=0&view=sheet');
    await waitMark(p, 'prints:ready');
    const id = await p.evaluate(() => document.querySelector('[data-print="enl"]').dataset.glId);
    await reveal(p, `[data-gl-id="${id}"] .print-card`, 0.5);
    await waitMark(p, 'prints:develop', 3000);
    await sleep(300);
    await seekRun(p, [id], 10000, 200);
    // Reload in the same session: the developed enlargement arrives developed and never develops again.
    await p.reload({ waitUntil: 'load' });
    await waitMark(p, 'prints:ready');
    const wetAfterReload = await p.evaluate((i) => document.querySelector(`[data-gl-id="${i}"][data-gl]`).hasAttribute('data-wet'), id);
    await reveal(p, `[data-gl-id="${id}"] .print-card`, 0.6);
    await sleep(500);
    const marks = await p.evaluate(() => performance.getEntriesByName('prints:develop').map((m) => m.detail.group));
    if (wetAfterReload || marks.includes('w1')) fails.push(`reload: w1 wet ${wetAfterReload}, develops ${marks.join(',')}`);
    await ctx.close();
    // Anchor arrival: /#sheet arrives with nothing wet and develops nothing.
    const a = await page(srv, DESK, '/?view=sheet#sheet');
    await waitSettled(a.p, 12000);
    await sleep(800);
    const anchor = await a.p.evaluate(() => ({ wet: document.querySelectorAll('[data-print][data-wet]').length, flag: document.documentElement.dataset.prints, develops: performance.getEntriesByName('prints:develop').length }));
    if (anchor.flag === 'wet' || anchor.develops) fails.push(`anchor /#sheet: ${JSON.stringify(anchor)}`);
    await a.ctx.close();
    // The hero's 'See the work' (#work): the enlargements arrive developed.
    const h = await page(srv, DESK, '/?view=sheet');
    await waitSettled(h.p, 12000);
    await waitMark(h.p, 'prints:ready');
    await h.p.click('a[href="#work"]');
    await sleep(1500);
    const viaLink = await h.p.evaluate(() => ({ develops: performance.getEntriesByName('prints:develop').map((m) => m.detail.group), wetEnl: document.querySelectorAll('[data-print="enl"][data-wet]').length }));
    if (viaLink.develops.some((g) => g.startsWith('w')) || viaLink.wetEnl) fails.push(`#work link: ${JSON.stringify(viaLink)}`);
    // Back arrival: a Swup visit to a project and Back; nothing develops on the way back.
    await h.p.evaluate(() => window.scrollTo(0, 0));
    const n0 = await h.p.evaluate(() => performance.getEntriesByName('prints:develop').length);
    await h.p.evaluate(() => document.querySelector('[data-print="sheet"]').click());
    await h.p.waitForFunction(() => location.pathname.startsWith('/work/'), null, { timeout: 10000 });
    await sleep(800);
    await h.p.goBack();
    await h.p.waitForFunction(() => location.pathname === '/' && document.querySelector('[data-sheet-grid]'), null, { timeout: 10000 });
    await sleep(300);
    const back = await h.p.evaluate(() => ({ wet: [...document.querySelectorAll('[data-print][data-wet]')].map((e) => e.dataset.glId) }));
    for (const s of ['[data-sheet-grid]', '[data-print="enl"] .print-card']) {
      await h.p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), s);
      await sleep(500);
    }
    const n1 = await h.p.evaluate(() => performance.getEntriesByName('prints:develop').length);
    if (back.wet.length || n1 > n0) fails.push(`Back: wet ${back.wet.join(',')}, develops ${n1 - n0}`);
    await h.ctx.close();
    results.once = { pass: !fails.length, fails, anchor, viaLink, back };
  }

  // ---------------------------------------------------------------- T1 and T2
  if (only.has('toggle')) {
    const fails = [];
    // T1: a toggle before the sheet developed is a List arrival.
    const a = await page(srv, DESK, '/?t=0&view=sheet');
    await waitMark(a.p, 'prints:ready');
    await a.p.evaluate(() => document.querySelector('[data-view-toggle] input[value="list"]').click());
    const t1 = await a.p.evaluate(() => ({ dev: document.documentElement.dataset.dev, wet: document.querySelectorAll('[data-print="sheet"][data-wet]').length }));
    if (!/(^| )s( |$)/.test(t1.dev ?? '') || t1.wet) fails.push(`T1: dev "${t1.dev}", wet sheet prints ${t1.wet}`);
    await a.ctx.close();
    // T2: mid-develop, Sheet to List hands every print back in the toggle's own task, before the crossfade.
    const b = await page(srv, DESK, '/?t=0&view=sheet');
    await waitMark(b.p, 'prints:ready');
    await plantPage(b.p);
    await reveal(b.p, '[data-sheet-grid]', 0.4);
    await waitMark(b.p, 'prints:develop', 3000);
    await sleep(400);
    for (let i = 0; i < 20; i++) await b.p.evaluate((m) => window.__stage.seek(m), 30000 + i * FRAME);
    const mid = await b.p.evaluate(() => document.querySelectorAll('[data-print="sheet"].is-gl').length);
    const t2 = await b.p.evaluate(() => {
      const r = document.querySelector('[data-view-toggle] input[value="list"]');
      r.click();
      const s = document.querySelector('section.sheet');
      return { gl: document.querySelectorAll('[data-print="sheet"].is-gl').length, wet: document.querySelectorAll('[data-print="sheet"][data-wet]').length, view: s.dataset.view, fading: s.hasAttribute('data-fading'), anims: s.querySelector('[data-sheet-list]').getAnimations().map((x) => x.effect.getTiming().duration) };
    });
    if (!mid) fails.push('T2: no sheet print was mid-develop before the toggle');
    if (t2.gl || t2.wet || t2.view !== 'list') fails.push(`T2: after the toggle ${JSON.stringify(t2)}`);
    if (!t2.anims.includes(durations.listToggle)) fails.push(`T2: crossfade ${t2.anims.join(',')} ms, want ${durations.listToggle}`);
    await b.ctx.close();
    results.T = { pass: !fails.length, fails, t1, t2, midDevelopGl: mid };
  }

  // ---------------------------------------------------------------- T2's swap rate on page.clock
  if (only.has('swap')) {
    const fails = [];
    for (const mode of ['auto', 'reduced']) {
      const { ctx, p } = await page(srv, DESK, '/?view=sheet', { mode, clock: true });
      const click = (v) => p.evaluate((x) => document.querySelector(`[data-view-toggle] input[value="${x}"]`).click(), v);
      const look = () => p.evaluate(() => ({ view: document.querySelector('section.sheet').dataset.view, q: new URL(location.href).searchParams.get('view'), ls: localStorage.getItem('ion.view'), radio: document.querySelector('[data-view-toggle] input:checked').value }));
      const q0 = await p.evaluate(() => new URL(location.href).searchParams.get('view'));
      // Stop the clock's natural flow: from here time moves only with runFor.
      await p.clock.pauseAt((await p.evaluate(() => Date.now())) + 1000);
      const steps = [];
      await click('list');
      steps.push({ t: 0, ...(await look()) });
      await p.clock.runFor(100);
      await click('sheet');
      steps.push({ t: 100, ...(await look()) });
      await p.clock.runFor(100);
      await click('list');
      steps.push({ t: 200, ...(await look()) });
      await p.clock.runFor(150);
      await click('sheet');
      steps.push({ t: 350, ...(await look()) });
      await p.clock.runFor(140);
      steps.push({ t: 490, ...(await look()) });
      await p.clock.runFor(20);
      steps.push({ t: 510, ...(await look()) });
      const want = [['list', 'list'], ['list', 'sheet'], ['list', 'list'], ['list', 'sheet'], ['list', 'sheet'], ['sheet', 'sheet']];
      steps.forEach((s, i) => {
        if (s.view !== want[i][0] || s.q !== want[i][1] || s.ls !== want[i][1] || s.radio !== want[i][1]) fails.push(`${mode} t=${s.t}: ${JSON.stringify(s)}, want view ${want[i][0]}, radio/?view/storage ${want[i][1]}`);
      });
      if (q0 !== 'sheet') fails.push(`${mode}: loaded without ?view=sheet`);
      results[`swap-${mode}`] = steps;
      await ctx.close();
    }
    // ?view= is absent until the visitor toggles.
    const { ctx, p } = await page(srv, 'P2', '/');
    await waitSettled(p, 12000);
    const untouched = await p.evaluate(() => ({ q: location.search, view: document.querySelector('section.sheet').dataset.view, ls: localStorage.getItem('ion.view') }));
    if (untouched.q !== '' || untouched.ls !== null || untouched.view !== 'list') fails.push(`P2 untouched: ${JSON.stringify(untouched)}`);
    await ctx.close();
    results.swap = { pass: !fails.length, fails, untouched };
  }

  // ---------------------------------------------------------------- H1 hover lift
  if (only.has('hover') && !webkit) {
    const fails = [];
    const devAll = () => sessionStorage.setItem('ion.dev', 'w1 w2 w3 s');
    const { ctx, p } = await page(srv, 'D2', '/?view=sheet', { init: [devAll] });
    await waitSettled(p, 12000);
    await waitMark(p, 'prints:ready');
    await p.evaluate(() => document.querySelector('[data-sheet-grid]').scrollIntoView({ block: 'center' }));
    await sleep(600);
    if (plant === 'focuslift') await p.evaluate(() => document.addEventListener('focusin', (e) => e.target.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }))));
    const box = await p.evaluate(() => { const r = document.querySelector('[data-print="sheet"] .print-card').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const t0 = Date.now();
    await p.mouse.move(box.x, box.y);
    let liftMs = null;
    while (Date.now() - t0 < 600) {
        if (await p.evaluate(() => document.querySelector('[data-print="sheet"]').classList.contains('is-gl'))) { liftMs = Date.now() - t0; break; }
      await sleep(10);
    }
    await p.mouse.move(5, 5);
    await sleep(900);
    const afterLeave = await p.evaluate(() => document.querySelectorAll('[data-print].is-gl').length);
    // Keyboard focus never lifts.
    await p.evaluate(() => document.querySelector('[data-print="sheet"]:nth-of-type(1)'));
    await p.focus('[data-print="sheet"]');
    await p.keyboard.press('Tab');
    let focusLift = 0;
    for (let i = 0; i < 30; i++) { focusLift += await p.evaluate(() => document.querySelectorAll('[data-print].is-gl').length); await sleep(15); }
    if (liftMs === null || liftMs > 150) fails.push(`hover lift took ${liftMs} ms`);
    if (afterLeave) fails.push(`${afterLeave} slots still .is-gl 900 ms after the pointer left`);
    if (focusLift) fails.push('keyboard focus lifted a print');
    await ctx.close();
    // A coarse pointer never lifts.
    const t = await page(srv, 'P2', '/?view=sheet', { init: [devAll] });
    await waitSettled(t.p, 12000);
    await waitMark(t.p, 'prints:ready', 8000);
    await t.p.evaluate(() => document.querySelector('[data-print="sheet"]').dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' })));
    await sleep(300);
    const touchLift = await t.p.evaluate(() => document.querySelectorAll('[data-print].is-gl').length);
    if (touchLift) fails.push('a touch pointer lifted a print');
    await t.ctx.close();
    results.H1 = { pass: !fails.length, fails, liftMs, afterLeave, focusLift, touchLift };
  }

  // ---------------------------------------------------------------- M1 lay-down
  if (only.has('m1') && !webkit) {
    const fails = [];
    const read = (p) => p.evaluate(() => { const c = document.querySelector('[data-print="enl"] .print-card'); return getComputedStyle(c).transform; });
    const rotX = (m) => (m === 'none' ? 0 : (() => { const v = m.match(/matrix3d\(([^)]+)\)/); if (!v) return 0; const a = v[1].split(',').map(Number); return Math.round((Math.atan2(a[6], a[5]) * 180) / Math.PI * 100) / 100; })());
    const { ctx, p } = await page(srv, 'D2', '/?view=sheet');
    await waitSettled(p, 12000);
    if (plant === 'tilt') await p.addStyleTag({ content: '[data-print="enl"] .print-card { transform: perspective(900px) rotateX(5deg) !important; }' });
    const at = {};
    for (const f of [0.02, 0.15, 0.3]) { await reveal(p, '[data-print="enl"] .print-card', f); at[f] = rotX(await read(p)); }
    await reveal(p, '[data-print="enl"] .print-card', 0.5);
    at[0.5] = rotX(await read(p));
    await reveal(p, '[data-print="enl"] .print-card', 0.1);
    at.back = rotX(await read(p));
    if (!(at[0.02] > 3.5 && at[0.02] <= 5.01)) fails.push(`pitch at entry ${at[0.02]} deg, want about 5`);
    if (!(at[0.15] < at[0.02] && at[0.3] < at[0.15])) fails.push(`pitch does not fall with scroll: ${JSON.stringify(at)}`);
    if (at[0.5] !== 0) fails.push(`not flat at 50% visible: ${at[0.5]}`);
    if (at.back !== 0) fails.push(`re-pitched after its develop started: ${at.back}`);
    await ctx.close();
    const r = await page(srv, 'D2', '/?view=sheet', { mode: 'reduced' });
    await waitSettled(r.p, 12000);
    await reveal(r.p, '[data-print="enl"] .print-card', 0.1);
    const reducedPitch = rotX(await read(r.p));
    if (reducedPitch !== 0) fails.push(`pitched under reduced motion: ${reducedPitch}`);
    await r.ctx.close();
    results.M1 = { pass: !fails.length, fails, pitchDeg: at, reducedPitch };
  }

  // ---------------------------------------------------------------- L4 at rest
  if (only.has('rest')) {
    const fails = [];
    const { ctx, p } = await page(srv, DESK, '/?view=sheet');
    await waitSettled(p, 12000);
    await waitMark(p, 'prints:ready');
    for (const s of ['[data-print="enl"] .print-card', '[data-sheet-grid]']) {
      await p.evaluate((sel) => document.querySelectorAll(sel).forEach((el) => el.scrollIntoView({ block: 'center' })), s);
      await sleep(400);
    }
    await sleep(3500);
    if (plant === 'rest') await p.evaluate(() => document.querySelector('[data-print]').classList.add('is-gl'));
    // W-S2's slots only: the hero's camera is W-S1's and keeps its own contract.
    const a = await p.evaluate(() => ({ gl: [...document.querySelectorAll('[data-print].is-gl')].map((e) => e.dataset.glId), draws: window.__stage.stats.draws, wet: document.querySelectorAll('[data-print][data-wet]').length }));
    await sleep(1500);
    const b = await p.evaluate(() => ({ draws: window.__stage.stats.draws }));
    if (a.gl.length) fails.push(`at rest .is-gl on ${a.gl.join(', ')}`);
    if (b.draws !== a.draws) fails.push(`the stage drew ${b.draws - a.draws} frames at rest`);
    results.L4 = { pass: !fails.length, fails, rest: a, drawsLater: b.draws };
    await ctx.close();
  }
} finally {
  await closeBrowsers();
  await srv.close();
}
const pass = Object.values(results).every((r) => !('pass' in r) || r.pass);
const summary = Object.entries(results).filter(([, r]) => 'pass' in r).map(([k, r]) => `${k} ${r.pass ? 'pass' : 'fail'}`).join(', ');
if (o.out) {
  mkdirSync(String(o.out), { recursive: true });
  writeFileSync(join(String(o.out), `motion-${webkit ? 'webkit' : 'chromium'}${plant ? `-plant-${plant}` : ''}.json`), JSON.stringify({ schema: 1, instrument: 'w-s2/motion', browser: webkit ? 'webkit' : 'chromium', profile: DESK, plant, pass, summary, results, evidence }, null, 2));
}
console.log(`motion (${webkit ? 'webkit' : 'chromium'}${plant ? `, plant ${plant}` : ''}): ${pass ? 'PASS' : 'FAIL'}  ${summary}`);
for (const [k, r] of Object.entries(results)) if (r.fails?.length) console.log(`  ${k}: ${r.fails.slice(0, 3).join(' | ')}`);
process.exit(pass ? 0 : 1);
