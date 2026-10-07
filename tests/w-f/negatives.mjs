// Negative controls: the checks fail loudly. Each control plants one defect and expects the check to catch it.
//   content   validateContent on v1-style data (an unmarked title, a placeholder URL, a video without alt or captions)
//   ph-gate   a copy of dist/ with an unmarked placeholder, an em dash, a duplicate title, a token on an indexable page
//             and one link name pointing to two URLs
//   stacking  a transform on #main in the live page makes every slot's ancestor a stacking context
//   lint      scripts/check/lint.mjs --src on scratch copies of src/ with one planted form each (a second rAF chain by
//             .bind, ?.(), .call, a destructured alias or a computed name; a core or touch-point read by a computed key,
//             destructuring or an alias of navigator): each fails it, the clean copy passes (round-3 should-fix S9)
//   detach    a ticker kept awake (__stage.invalidate every 250 ms) must fail the counters' after-scroll idle window
//   draws     draws outside the ticker (a timer on the stage's context: no rAF) at D2 / (where the intro passes the
//             counters' old 20,000-stamp cap) and WK-P2 /, one kind per plant: drawArrays, WEBGL_multi_draw,
//             clearBufferfv, and blitFramebuffer into the default framebuffer where valid (lite: single-sampled); each
//             must fail h-counters' step 1 (idle after a mouse move and a key) and step 2 (idle after a scroll); the
//             clean page passes both (round-2 and round-3 must-fix counters-draw-cap). NEG_COUNTERS_INIT=<init.js> runs
//             it with another in-page instrument (7a2d0df's misses all but drawArrays); NEG_COUNTERS_DIR=<dir> another
//             counters directory
//   tolerance one rAF callback planted at motion end + 1 s + 40 ms fails the window, one at + 1 s + 20 ms passes
//             (ruling 6030949628 item 2: max(2 frames, 34 ms)), D2 and WK-P2
//   arrival   a wake that presents nothing (180 rAF callbacks, no draw) 1.5 s after the load fails h-counters' arrival
//             window (ruling 6030949628 item 1), D2 and WK-P2; the clean arrivals pass
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
import { join, resolve } from 'node:path';
import { validateContent } from '../../src/lib/content/validate.js';
import { scanInPage } from '../../scripts/check/stacking.mjs';
import { ROOT, cliMain, lcpElementOf, lcpElementVerdict, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';
import { INIT as COUNTERS_INIT, arrivals, idleAfterScroll, motionWindow } from '../harness/counters/run.mjs';
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

/**
 * The lint itself (scripts/check/lint.mjs --src) on scratch copies of src/, each with one planted form (round-3
 * should-fix S9, Breaker 3.3 #4): a second rAF chain reached by .bind, ?.(), .call, a destructured alias or a computed
 * name, and a core or touch-point read by a computed key, destructuring or an alias of navigator. Each must fail it;
 * the clean copy passes. NEG_LINT=<another lint.mjs> runs the same plants through that one (7a2d0df's misses them).
 */
const LINT_PLANTS = {
  rafBind: 'const f = requestAnimationFrame.bind(window);\nf(() => {});',
  rafOptionalCall: 'window.requestAnimationFrame?.(() => {});',
  rafCall: 'requestAnimationFrame.call(window, () => {});',
  rafDestructured: 'const { requestAnimationFrame: r } = window;\nr(() => {});',
  rafComputed: "const r = (window as any)['requestAnimation' + 'Frame'];\nr(() => {});",
  readComputed: "export const n = (navigator as any)['hardware' + 'Concurrency'];",
  readDestructured: "const { ['max' + 'TouchPoints']: m } = navigator as any;\nexport { m };",
  readAlias: "const nav: any = navigator;\nconst key = 'hardware' + 'Concurrency';\nexport const n = nav[key];",
};
function lintControl() {
  const lint = process.env.NEG_LINT ? resolve(process.env.NEG_LINT) : join(ROOT, 'scripts/check/lint.mjs');
  const runLint = (srcDir) => spawnSync(process.execPath, [lint, '--src', srcDir, '--json'], { cwd: ROOT, encoding: 'utf8' });
  const scratch = mkdtempSync(join(tmpdir(), 'lint-plants-'));
  try {
    const rows = [];
    for (const [name, code] of [['clean', null], ...Object.entries(LINT_PLANTS)]) {
      const dir = join(scratch, name, 'src');
      cpSync(join(ROOT, 'src'), dir, { recursive: true });
      if (code) writeFileSync(join(dir, 'stage', `plant-${name}.ts`), `${code}\n`);
      const r = runLint(dir);
      rows.push({ plant: name, exit: r.status, caught: r.status !== 0 && /requestAnimationFrame|core or touch-point/.test(r.stderr), out: r.stderr.slice(0, 300) });
    }
    const clean = rows.find((r) => r.plant === 'clean');
    const planted = rows.filter((r) => r.plant !== 'clean');
    return { lint, rows, pass: clean.exit === 0 && planted.every((r) => r.caught), missed: planted.filter((r) => !r.caught).map((r) => r.plant) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
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
 * Draws outside the ticker, every 250 ms on the stage's own context, inside the idle window (Breaker 2.2 #2, Breaker
 * 3.3 #1; round-2 and round-3 must-fix counters-draw-cap): the gate must see each kind of draw in both h-counters steps.
 * One plant per entry point that writes the default framebuffer (see init.js): drawArrays, WEBGL_multi_draw's
 * multiDrawArraysWEBGL, clearBufferfv and a blitFramebuffer into the default framebuffer (only where that is valid: a
 * single-sampled default framebuffer, so the lite tier). D2 / (full; the intro passes the old 20,000-stamp cap) and
 * WK-P2 / (lite). A plant whose extension the engine lacks is reported as unsupported, not as caught.
 */
const DRAW_PLANTS = {
  drawArrays: (gl) => () => gl.drawArrays(gl.POINTS, 0, 0),
  multiDraw: (gl) => {
    const ext = gl.getExtension('WEBGL_multi_draw');
    if (!ext) return null;
    return () => ext.multiDrawArraysWEBGL(gl.POINTS, new Int32Array([0]), 0, new Int32Array([0]), 0, 1);
  },
  clearBufferfv: (gl) => () => gl.clearBufferfv(gl.COLOR, 0, new Float32Array([0, 0, 0, 0])),
  blitFramebuffer: (gl) => {
    if (gl.getContextAttributes().antialias) return null; // blitting into a multisampled default framebuffer is invalid
    const fb = gl.createFramebuffer();
    const tex = gl.createTexture();
    const prevTex = gl.getParameter(gl.TEXTURE_BINDING_2D);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 4, 4, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, prevTex);
    const prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.READ_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead);
    return () => {
      const pr = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
      const pd = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, 4, 4, 0, 0, 4, 4, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, pr);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, pd);
    };
  },
};
async function drawsControl() {
  // NEG_COUNTERS_DIR=<another tests/harness/counters> runs the control with that instrument (init.js and run.mjs), so
  // the pre-fix instrument can be shown to miss the plants.
  // NEG_COUNTERS_INIT=<an init.js> swaps only the in-page instrument (round 4: 7a2d0df's init.js under this window).
  const dir = process.env.NEG_COUNTERS_DIR;
  const counters = dir ? await import(pathToFileURL(join(dir, 'run.mjs')).href) : { INIT: COUNTERS_INIT, motionWindow, idleAfterScroll };
  const init = process.env.NEG_COUNTERS_INIT ? readFileSync(process.env.NEG_COUNTERS_INIT, 'utf8') : counters.INIT;
  const srv = await serve();
  try {
    const rows = [];
    for (const profile of ['D2', 'WK-P2']) {
      for (const plant of [null, ...Object.keys(DRAW_PLANTS)]) {
        const ctx = await newContext(profile);
        await ctx.addInitScript({ content: init });
        const page = await ctx.newPage();
        await page.goto(`${srv.base}/`, { waitUntil: 'load' });
        await waitSettled(page, 15000);
        await page.waitForFunction(() => window.__stage.glState === 'ready', null, { polling: 100, timeout: 15000 }).catch(() => {});
        await waitSettled(page, 15000);
        await sleep(300);
        const atPlant = await page.evaluate(() => {
          const g = window.__gateCounters;
          return { draws: g.draws, drawStamps: g.drawTimes.length, stampsDropped: g.stampsDropped ?? null, tier: window.__stage.tier, glState: window.__stage.glState };
        });
        let supported = true;
        if (plant) {
          supported = await page.evaluate(({ plant, src }) => {
            const gl = window.__stage.gl?.renderer?.getContext();
            if (!gl) return false;
            const make = new Function(`return (${src})`)();
            const fire = make(gl);
            if (!fire) return false;
            window.__plantErrors = [];
            window.__plant = setInterval(() => {
              fire();
              const e = gl.getError();
              if (e) window.__plantErrors.push(e);
            }, 250);
            return true;
          }, { plant, src: DRAW_PLANTS[plant].toString() });
        }
        if (!supported) {
          await ctx.close();
          rows.push({ profile, plant, supported: false });
          continue;
        }
        const { width, height } = page.viewportSize();
        const since = await page.evaluate(() => performance.now());
        await page.mouse.move(width / 2, height / 2);
        await page.mouse.move(width / 2 + 40, height / 2 + 10);
        await page.keyboard.press('Shift');
        const step1 = await counters.motionWindow(page, since).catch((e) => ({ error: String(e).slice(0, 200), pass: false }));
        const step2 = await counters.idleAfterScroll(page, null).catch((e) => ({ error: String(e).slice(0, 200), pass: false }));
        const end = await page.evaluate(() => ({ draws: window.__gateCounters.draws, drawsBy: window.__gateCounters.drawsBy ?? null, plantErrors: window.__plantErrors ?? [] }));
        await ctx.close();
        const brief = (r) => ({ pass: r.pass, error: r.error, window: r.afterMotion, uncapped: r.uncappedInWindow, bound: r.bound, restarts: r.windowRestarts, motionEndsBy: r.motionEndsBy });
        rows.push({ profile, plant, supported, atPlant, drawsDuringSteps: end.draws - atPlant.draws, drawsBy: end.drawsBy, plantGlErrors: end.plantErrors.length, step1: brief(step1), step2: brief(step2), caught1: !step1.pass, caught2: !step2.pass });
      }
    }
    const clean = rows.filter((r) => r.plant === null);
    const planted = rows.filter((r) => r.plant !== null && r.supported);
    const pastOldCap = rows.some((r) => r.profile === 'D2' && r.plant === 'drawArrays' && r.atPlant.draws > 20000);
    // Every kind is planted where it is valid: drawArrays, multiDraw and clearBufferfv in both engines' rows (when the
    // engine has the extension), blitFramebuffer at least once (the lite tier's single-sampled framebuffer).
    const kindsRun = new Set(planted.map((r) => r.plant));
    return {
      instrument: process.env.NEG_COUNTERS_INIT ?? dir ?? 'tests/harness/counters', rows, pastOldCap, kindsRun: [...kindsRun],
      missedKinds: [...new Set(planted.filter((r) => !r.caught1 || !r.caught2).map((r) => `${r.profile} ${r.plant}`))],
      unsupported: rows.filter((r) => r.supported === false).map((r) => `${r.profile} ${r.plant}`),
      pass: pastOldCap && clean.every((r) => !r.caught1 && !r.caught2) && planted.length > 0 && planted.every((r) => r.caught1 && r.caught2 && r.plantGlErrors === 0)
        && Object.keys(DRAW_PLANTS).every((k) => kindsRun.has(k)),
    };
  } finally {
    await srv.close();
  }
}

/**
 * The window's tolerance (ruling 6030949628 item 2: the window opens at motion end + 1 s + max(2 frames, 34 ms)): one
 * rAF callback planted at motion end + 1 s + 40 ms must fail the window; one at + 1 s + 20 ms (inside the tolerance,
 * outside the old 2-frame tolerance at 238 Hz) must pass. The plant watches the gate's own stamps for the motion end.
 */
const TOLERANCE_PLANT = (afterMs) => `(() => {
  let fired = 0;
  const tick = () => {
    const g = window.__gateCounters;
    if (!g || !window.__plantArmedAt) return setTimeout(tick, 5);
    const since = window.__plantArmedAt;
    const last = (l) => { for (let i = l.length - 1; i >= 0; i--) if (l[i] > since) return l[i]; return 0; };
    const end = Math.max(since, g.lastUserInputAt > since ? g.lastUserInputAt : 0, g.lastScrollAt > since ? g.lastScrollAt : 0, last(g.drawTimes), last(g.clearTimes));
    if (fired !== end && performance.now() >= end + ${afterMs}) {
      fired = end;
      window.__plantFiredAt = performance.now() - end;
      requestAnimationFrame(() => { window.__plantRafAt = performance.now() - end; });
    }
    setTimeout(tick, 2);
  };
  tick();
})();`;
async function toleranceControl() {
  const srv = await serve();
  try {
    const rows = [];
    for (const profile of ['D2', 'WK-P2']) {
      for (const afterMs of [null, 1020, 1040]) {
        const ctx = await newContext(profile);
        await ctx.addInitScript({ content: COUNTERS_INIT });
        if (afterMs) await ctx.addInitScript({ content: TOLERANCE_PLANT(afterMs) });
        const page = await ctx.newPage();
        await page.goto(`${srv.base}/bench/`, { waitUntil: 'load' });
        await waitSettled(page, 15000);
        await sleep(300);
        const { width, height } = page.viewportSize();
        const since = await page.evaluate(() => (window.__plantArmedAt = performance.now()));
        await page.mouse.move(width / 2, height / 2);
        await page.keyboard.press('Shift');
        const r = await motionWindow(page, since).catch((e) => ({ error: String(e).slice(0, 200), pass: false }));
        const plant = await page.evaluate(() => ({ firedAt: window.__plantFiredAt ?? null, rafAt: window.__plantRafAt ?? null }));
        await ctx.close();
        rows.push({ profile, afterMs, plant, pass: r.pass, window: r.afterMotion, frameMs: r.frameMs, lastRafAfterMotionMs: r.lastRafAfterMotionMs, error: r.error });
      }
    }
    const at = (p, a) => rows.find((r) => r.profile === p && r.afterMs === a);
    const ok = ['D2', 'WK-P2'].every((p) => at(p, null).pass && at(p, 1040).pass === false && at(p, 1040).plant.rafAt !== null);
    // The +20 ms plant passes only where the old 2-frame tolerance was below 20 ms (a display above 100 Hz, D2 here).
    const inside = at('D2', 1020);
    return { rows, insideTolerancePasses: inside.pass, pass: ok && inside.pass && inside.plant.rafAt !== null };
  } finally {
    await srv.close();
  }
}

/**
 * A wake after an arrival that presents nothing (ruling 6030949628 item 1; perf row 26): about 180 rAF callbacks and no
 * draw, starting 1.5 s after the load, must fail h-counters' arrival window; the clean arrival passes.
 */
const ARRIVAL_PLANT = `addEventListener('load', () => setTimeout(() => {
  let n = 0;
  const f = () => { if (++n < 180) requestAnimationFrame(f); };
  requestAnimationFrame(f);
}, 1500), { once: true });`;
async function arrivalControl() {
  const srv = await serve();
  try {
    const clean = await arrivals(srv.base, ['D2', 'WK-P2']);
    const planted = await arrivals(srv.base, ['D2', 'WK-P2'], { plant: ARRIVAL_PLANT });
    const loads = (x) => x.rows.filter((r) => r.kind === 'load' || r.kind === 'back');
    return { clean: clean.rows, planted: loads(planted), pass: clean.pass && loads(planted).length > 0 && loads(planted).every((r) => !r.pass) };
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
  if (want('tolerance')) out.tolerance = await toleranceControl();
  if (want('arrival')) out.arrival = await arrivalControl();
  if (want('resize')) out.resize = await resizeControl();
  if (want('lcp')) out.lcp = lcpControl();
  const parts = Object.entries(out);
  return { schema: 1, suite: 'w-f/negatives', pass: parts.every(([, v]) => v.pass), ...out, summary: parts.map(([k, v]) => `${k} ${v.pass ? 'caught' : 'MISSED'}`).join(', ') };
}

await cliMain(import.meta.url, run);
