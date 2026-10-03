// Negative controls: the checks fail loudly. Each control plants one defect and expects the check to catch it.
//   content   validateContent on v1-style data (an unmarked title, a placeholder URL, a video without alt or captions)
//   ph-gate   a copy of dist/ with an unmarked placeholder, an em dash, a duplicate title, a token on an indexable page
//             and one link name pointing to two URLs
//   stacking  a transform on #main in the live page makes every slot's ancestor a stacking context
//   lint      a second rAF call site and a forbidden navigator read, in a scratch copy of the lint's rules
//   detach    a ticker kept awake (__stage.invalidate every 250 ms) must fail the counters' after-scroll idle window
//   resize    ResizeObserver callbacks deferred by a task (GL re-measures a frame after the layout moved, the round-2
//             defect) must fail the drift harness's resize probe at a toolbar collapse and expand
//   lcp       a wrong or missing Lighthouse LCP element (budgets.md: the h1 on desktop; the h1 or print 1's still on
//             mobile) must make the run invalid
// (The console gate's 5 injected faults live in tests/harness/console.)
// Usage: node tests/w-f/negatives.mjs [--out negatives.json]
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateContent } from '../../src/lib/content/validate.js';
import { scanInPage } from '../../scripts/check/stacking.mjs';
import { ROOT, cliMain, lcpElementOf, lcpElementVerdict, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';
import { INIT as COUNTERS_INIT, idleAfterScroll } from '../harness/counters/run.mjs';
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

async function detachControl() {
  const srv = await serve();
  try {
    const rows = [];
    for (const plant of [false, true]) {
      const ctx = await newContext('D2');
      await ctx.addInitScript({ content: COUNTERS_INIT });
      const page = await ctx.newPage();
      await page.goto(`${srv.base}/`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      await sleep(300);
      if (plant) await page.evaluate(() => { window.__plant = setInterval(() => window.__stage.invalidate(), 250); });
      const r = await idleAfterScroll(page, null).catch((e) => ({ error: String(e).slice(0, 200) }));
      await ctx.close();
      const caught = Boolean(r.error) || r.afterMotion.raf > 0 || r.afterMotion.draws > 0;
      rows.push({ plant, ...r, caught });
    }
    const [clean, planted] = rows;
    return { rows, pass: !clean.caught && planted.caught };
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

export async function run() {
  const out = { content: contentControl(), phGate: phGateControl(), stacking: await stackingControl(), lint: lintControl(), detach: await detachControl(), resize: await resizeControl(), lcp: lcpControl() };
  const parts = Object.entries(out);
  return { schema: 1, suite: 'w-f/negatives', pass: parts.every(([, v]) => v.pass), ...out, summary: parts.map(([k, v]) => `${k} ${v.pass ? 'caught' : 'MISSED'}`).join(', ') };
}

await cliMain(import.meta.url, run);
