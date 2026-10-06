// Negative controls: the checks fail loudly. Each control plants one defect and expects the check to catch it.
//   content   validateContent on v1-style data (an unmarked title, a placeholder URL, a video without alt or captions)
//   ph-gate   a copy of dist/ with an unmarked placeholder, an em dash, a duplicate title, a token on an indexable page
//             and one link name pointing to two URLs
//   stacking  a transform on #main in the live page makes every slot's ancestor a stacking context
//   lint      a second rAF call site and a forbidden navigator read, in a scratch copy of the lint's rules
//   detach    a ticker kept awake (__stage.invalidate every 250 ms) must fail the counters' after-scroll idle window
//   draws     draws outside the ticker (a timer calling drawArrays on the stage's context: no rAF, no clear) at D2 /,
//             where the intro passes the counters' old 20,000-stamp cap, must fail h-counters' step 1 (idle after a
//             mouse move and a key) and step 2 (idle after a scroll); the clean page passes both (round-2 must-fix
//             counters-draw-cap). NEG_COUNTERS_DIR=<dir> runs it with another counters instrument (the pre-fix one).
//   resize    ResizeObserver callbacks deferred by a task (GL re-measures a frame after the layout moved, the round-2
//             defect) must fail the drift harness's resize probe at a toolbar collapse and expand
//   lcp       a wrong or missing Lighthouse LCP element (budgets.md: the h1 on desktop; the h1 or print 1's still on
//             mobile) must make the run invalid
// (The console gate's 5 injected faults live in tests/harness/console.)
// Usage: node tests/w-f/negatives.mjs [--out negatives.json]
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { validateContent } from '../../src/lib/content/validate.js';
import { scanInPage } from '../../scripts/check/stacking.mjs';
import { ROOT, cliMain, lcpElementOf, lcpElementVerdict, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';
import { INIT as COUNTERS_INIT, idleAfterScroll, motionWindow } from '../harness/counters/run.mjs';
import { resizeProbeOnly } from '../harness/drift/run.mjs';

function contentControl() {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, 'content', f), 'utf8'));
  const p = read('projects.json');
  p.projects[0].title = 'Project One';
  p.projects[1].url = 'https://github.com/derprito64bit';
  p.projects[2].media = [{ type: 'video', src: 'media/project-03/a.mp4', alt: '', caption: '', poster: '', captions: '', audio: true, decorative: false }];
  const { errors } = validateContent({ projects: p, honours: read('honours.json'), worlds: read('worlds.json'), profile: read('profile.json'), lookIds: read('tokens.json').filmLooks.ids });
  return { planted: 4, caught: errors.length, errors, pass: errors.length >= 4 };
}

function phGateControl() {
  const dir = mkdtempSync(join(tmpdir(), 'phgate-'));
  try {
    cpSync(join(ROOT, 'dist'), dir, { recursive: true });
    const home = join(dir, 'index.html');
    let html = readFileSync(home, 'utf8');
    html = html.replace('<h2 id="honours"', '<p>Placeholder: write this later — soon</p><h2 id="honours"');
    html = html.replace('</main>', '<a href="/a/">Same name</a><a href="/b/">Same name</a></main>');
    writeFileSync(home, html);
    const p1 = join(dir, 'work/project-01/index.html');
    const doc = readFileSync(p1, 'utf8').replace(/<title>[^<]*<\/title>/, '<title>Portfolio · derprito64bit</title>').replace(/<meta name="robots" content="noindex">/, '');
    writeFileSync(p1, doc);
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/check/ph-gate.mjs'), '--dist', dir], { encoding: 'utf8' });
    const out = r.stderr + r.stdout;
    const expect = { unmarked: /malformed or unmarked/, dash: /em or en dash/, duplicateTitle: /duplicates/, tokenIndexable: /without robots noindex/, linkName: /link name "Same name" points to/ };
    const found = Object.fromEntries(Object.entries(expect).map(([k, re]) => [k, re.test(out)]));
    return { exit: r.status, found, pass: r.status === 1 && Object.values(found).every(Boolean) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function stackingControl() {
  const srv = await serve();
  try {
    const ctx = await newContext('D2');
    const page = await ctx.newPage();
    await page.goto(`${srv.base}/bench/`, { waitUntil: 'load' });
    await waitSettled(page, 15000);
    const clean = await page.evaluate(scanInPage);
    await page.addStyleTag({ content: '#main { transform: translateZ(0); }' });
    const planted = await page.evaluate(scanInPage);
    await ctx.close();
    const cleanBad = clean.filter((s) => s.offenders.length).length;
    const onMain = (s) => s.offenders.find((o) => o.el.startsWith('main#main'));
    const plantedBad = planted.filter((s) => onMain(s)).length;
    const paintedToo = planted.filter((s) => onMain(s)?.painted).length;
    return { slots: planted.length, cleanOffenders: cleanBad, plantedCaught: plantedBad, caughtByPaintedProbe: paintedToo, pass: cleanBad === 0 && plantedBad === planted.length && paintedToo === planted.length && planted.length > 0 };
  } finally {
    await srv.close();
  }
}

function lintControl() {
  // The lint's own regexes, applied to a planted snippet (the lint reads src/, which stays clean).
  const code = 'requestAnimationFrame(a);\nwindow.requestAnimationFrame(b);\nconst n = navigator.hardwareConcurrency;';
  const raf = (code.match(/\brequestAnimationFrame\s*\(/g) || []).length;
  const forbidden = (code.match(/\b(hardwareConcurrency|maxTouchPoints)\b/g) || []).length;
  const src = readFileSync(join(ROOT, 'scripts/check/lint.mjs'), 'utf8');
  const sameRules = src.includes('/\\brequestAnimationFrame\\s*\\(/g') && src.includes('/\\b(hardwareConcurrency|maxTouchPoints)\\b/g');
  return { rafCallSites: raf, forbiddenReads: forbidden, sameRulesAsLint: sameRules, pass: raf === 2 && forbidden === 1 && sameRules };
}

/**
 * Presented clear-only frames on the stage's own context, in rAF, from the first wheel until `ms` after it: what a stage
 * that keeps presenting clear-only frames looks like to the gate's counters (Orchestrator ruling on #11, 5992928262).
 */
const CLEARS_PLANT = (ms) => `addEventListener('wheel', () => {
  const t0 = performance.now();
  const gl = document.getElementById('gl').getContext('webgl2');
  const f = () => { if (performance.now() - t0 > ${ms}) return; gl.clear(gl.COLOR_BUFFER_BIT); requestAnimationFrame(f); };
  requestAnimationFrame(f);
}, { once: true, capture: true });`;

/**
 * The counters' idle window under the motion-end rule:
 * - clean: the real stage passes;
 * - invalidate: a ticker kept awake (__stage.invalidate every 250 ms) never ends its motion: the bound fails it;
 * - clears 5 s: clear-only frames presented 5 s after the last input: the bound fails it (the ruling's control);
 * - clears 2 s: clear-only frames that end 2 s after the input are motion, so the window counts from the last one and
 *   passes; with clears left out of the motion end, the same run fails (ifClearsIgnored), which is what counting them
 *   changes.
 */
async function detachControl() {
  const srv = await serve();
  try {
    const rows = [];
    for (const plant of [null, 'invalidate', 'clears-5s', 'clears-2s']) {
      const ctx = await newContext('D2');
      await ctx.addInitScript({ content: COUNTERS_INIT });
      if (plant === 'clears-5s') await ctx.addInitScript({ content: CLEARS_PLANT(5000) });
      if (plant === 'clears-2s') await ctx.addInitScript({ content: CLEARS_PLANT(2000) });
      const page = await ctx.newPage();
      await page.goto(`${srv.base}/`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      await sleep(300);
      if (plant === 'invalidate') await page.evaluate(() => { window.__plant = setInterval(() => window.__stage.invalidate(), 250); });
      const r = await idleAfterScroll(page, null).catch((e) => ({ error: String(e).slice(0, 200) }));
      await ctx.close();
      const caught = Boolean(r.error) || !r.pass;
      rows.push({ plant, ...r, caught });
    }
    const by = Object.fromEntries(rows.map((r) => [r.plant ?? 'clean', r]));
    const pass = !by.clean.caught && by.invalidate.caught && by['clears-5s'].caught && !by['clears-2s'].caught && by['clears-2s'].ifClearsIgnored?.raf > 0;
    return { rows, pass };
  } finally {
    await srv.close();
  }
}

/**
 * Draws outside the ticker inside the idle window at D2 / (Breaker 2.2 #2): the window's draw count must see them in
 * both h-counters steps. The row records how many stamps the intro had already pushed (g.draws at the plant), so the
 * control shows it ran past the old cap.
 */
async function drawsControl() {
  // NEG_COUNTERS_DIR=<another tests/harness/counters> runs the control with that instrument (init.js and run.mjs), so
  // the pre-fix instrument can be shown to miss the plant.
  const dir = process.env.NEG_COUNTERS_DIR;
  const counters = dir ? await import(pathToFileURL(join(dir, 'run.mjs')).href) : { INIT: COUNTERS_INIT, motionWindow, idleAfterScroll };
  const init = counters.INIT;
  const srv = await serve();
  try {
    const rows = [];
    for (const plant of [null, 'draws']) {
      const ctx = await newContext('D2');
      await ctx.addInitScript({ content: init });
      const page = await ctx.newPage();
      await page.goto(`${srv.base}/`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      await sleep(300);
      const atPlant = await page.evaluate(() => {
        const g = window.__gateCounters;
        return { draws: g.draws, drawStamps: g.drawTimes.length, stampsDropped: g.stampsDropped ?? null, tier: window.__stage.tier, glState: window.__stage.glState };
      });
      if (plant === 'draws') {
        await page.evaluate(() => {
          const gl = window.__stage.gl.renderer.getContext();
          window.__plant = setInterval(() => gl.drawArrays(gl.POINTS, 0, 0), 250);
        });
      }
      const { width, height } = page.viewportSize();
      const since = await page.evaluate(() => performance.now());
      await page.mouse.move(width / 2, height / 2);
      await page.mouse.move(width / 2 + 40, height / 2 + 10);
      await page.keyboard.press('Shift');
      const step1 = await counters.motionWindow(page, since).catch((e) => ({ error: String(e).slice(0, 200), pass: false }));
      const step2 = await counters.idleAfterScroll(page, null).catch((e) => ({ error: String(e).slice(0, 200), pass: false }));
      const g1 = await page.evaluate(() => window.__gateCounters.draws);
      await ctx.close();
      const brief = (r) => ({ pass: r.pass, error: r.error, window: r.afterMotion, uncapped: r.uncappedInWindow, bound: r.bound, restarts: r.windowRestarts, motionEndsBy: r.motionEndsBy });
      rows.push({ plant, atPlant, drawsDuringSteps: g1 - atPlant.draws, step1: brief(step1), step2: brief(step2), caught1: !step1.pass, caught2: !step2.pass });
    }
    const [clean, planted] = rows;
    const pastOldCap = planted.atPlant.draws > 20000;
    return { instrument: dir ?? 'tests/harness/counters', rows, pastOldCap, pass: pastOldCap && !clean.caught1 && !clean.caught2 && planted.caught1 && planted.caught2 };
  } finally {
    await srv.close();
  }
}

/**
 * The Lighthouse LCP element rule (crew.mjs lighthouse, budgets.md) on report fragments shaped like Lighthouse 13.5's
 * lcp-breakdown-insight and Lighthouse 12's largest-contentful-paint-element: a wrong or missing element must make the
 * run invalid.
 */
function lcpControl() {
  const insight = (node) => ({ audits: { 'lcp-breakdown-insight': { details: { type: 'list', items: [{ type: 'table', items: [] }, ...(node ? [{ type: 'node', ...node }] : [])] } } } });
  const legacy = (node) => ({ audits: { 'largest-contentful-paint-element': { details: { type: 'list', items: [{ type: 'table', items: [{ node: { type: 'node', ...node } }] }] } } } });
  const h1 = { selector: 'main#main > section.hero > div.wordmark-fit > h1#hero-title', snippet: '<h1 id="hero-title" class="wordmark">' };
  const img = { selector: 'main#main > section.hero > figure > img', snippet: '<img src="/a.webp" alt="">' };
  const print1 = { selector: 'main#main > section.hero > figure > img', snippet: '<img src="/p1.webp" alt="" data-lcp="print-1">' };
  const cases = [
    ['h1, desktop', insight(h1), 'desktop', true],
    ['h1, mobile', insight(h1), 'mobile', true],
    ['print 1 still, mobile', insight(print1), 'mobile', true],
    ['print 1 still, desktop', insight(print1), 'desktop', false],
    ['other image, mobile', insight(img), 'mobile', false],
    ['other image, desktop', insight(img), 'desktop', false],
    ['no element', insight(null), 'mobile', false],
    ['h1 from the Lighthouse 12 audit', legacy(h1), 'desktop', true],
  ];
  const rows = cases.map(([name, lhr, ff, expect]) => {
    const el = lcpElementOf(lhr);
    const v = lcpElementVerdict(el, ff);
    return { name, formFactor: ff, element: el?.selector ?? null, source: el?.source ?? null, ok: v.ok, why: v.why, expect, correct: v.ok === expect };
  });
  return { rows, pass: rows.every((r) => r.correct) };
}

/** A one-frame GL lag at a layout change: ResizeObserver callbacks deferred a task must fail the drift resize probe. */
async function resizeControl() {
  const srv = await serve();
  try {
    const clean = await resizeProbeOnly(srv.base, null);
    const planted = await resizeProbeOnly(srv.base, 'defer-ro');
    const cleanOk = clean.length === 2 && clean.every((r) => r.ok);
    const caught = planted.length === 2 && planted.every((r) => !r.ok && r.quads.length > 0);
    return { clean, planted, pass: cleanOk && caught };
  } finally {
    await srv.close();
  }
}

export async function run(opts = {}) {
  const only = opts.only ? new Set(String(opts.only).split(',')) : null;
  const want = (k) => !only || only.has(k);
  const out = {};
  if (want('content')) out.content = contentControl();
  if (want('phGate')) out.phGate = phGateControl();
  if (want('stacking')) out.stacking = await stackingControl();
  if (want('lint')) out.lint = lintControl();
  if (want('detach')) out.detach = await detachControl();
  if (want('draws')) out.draws = await drawsControl();
  if (want('resize')) out.resize = await resizeControl();
  if (want('lcp')) out.lcp = lcpControl();
  const parts = Object.entries(out);
  return { schema: 1, suite: 'w-f/negatives', pass: parts.every(([, v]) => v.pass), ...out, summary: parts.map(([k, v]) => `${k} ${v.pass ? 'caught' : 'MISSED'}`).join(', ') };
}

await cliMain(import.meta.url, run);
