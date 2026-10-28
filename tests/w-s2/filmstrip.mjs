#!/usr/bin/env node
// W-S2 seeked develop filmstrip (#14 Evidence; spec v1 L3 "Judged on __stage.seek frames"). On / (?t=0&view=sheet) at a
// GES-1 profile: the first enlargement's develop (durations.develop) and the sheet's wave (durations.developSheet each,
// sheetStagger apart), each driven one 1000/60 ms seek at a time from its 'prints:develop' mark (never a clock jump),
// with a viewport shot at named keys and one contact sheet per strip. It FAILS unless every key was shot, some key's
// print region differs from the last key's (a develop happened on the seeked frames), and the last two keys, both
// after the develop's end, match (the print is at rest after its hand-back).
// --plant frozen registers a develop that resolves at once (nothing animates): the change check must FAIL.
// Usage: node tests/w-s2/filmstrip.mjs --out <dir> [--profile D2] [--dist <dir>] [--plant frozen]
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { closeBrowsers, cliOpts, newContext, serve, sleep } from '../harness/lib.mjs';
import { durations } from '../../src/lib/tokens.js';

const o = cliOpts();
const out = String(o.out ?? 'w-s2-filmstrip');
mkdirSync(out, { recursive: true });
const PROFILE = String(o.profile ?? 'D2');
const plant = o.plant ? String(o.plant) : null;
const FRAME = 1000 / 60;
/** Mean absolute difference (0..255) by which some key's print region must differ from the last key's. */
export const MIN_CHANGE = 2;
/** The last two keys (rest) may differ by at most this mean. */
export const MAX_REST = 0.5;
const KEYS = {
  enlargement: [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1].map((k) => k * durations.develop).concat(durations.develop + 10 * FRAME, durations.develop + 16 * FRAME),
  sheet: [0, 100, 300, 600, 900, 1200, durations.developSheet, 2100 + 6 * FRAME, 2100 + 12 * FRAME],
};

async function waitMark(p, n0, ms = 4000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if ((await p.evaluate(() => performance.getEntriesByName('prints:develop').length)) > n0) return true;
    await sleep(50);
  }
  return false;
}
async function reveal(p, sel, frac) {
  await p.evaluate(([s, f]) => { const r = document.querySelector(s).getBoundingClientRect(); window.scrollTo(0, scrollY + r.top - innerHeight + Math.min(r.height * f, innerHeight * f)); }, [sel, frac]);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(120);
}
const meanDiff = async (a, b, clip) => {
  const [x, y] = await Promise.all([a, b].map((f) => sharp(f).extract(clip).raw().toBuffer()));
  let s = 0;
  for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]);
  return Math.round((s / x.length) * 1000) / 1000;
};

const srv = await serve(o.dist ? String(o.dist) : undefined);
const report = { schema: 1, suite: 'w-s2/filmstrip', profile: PROFILE, plant, keysMs: KEYS, strips: [] };
let clock = 0;
try {
  const ctx = await newContext(PROFILE, 'auto');
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`${srv.base}/?t=0&view=sheet`, { waitUntil: 'load' });
  const t0 = Date.now();
  while (!(await p.evaluate(() => performance.getEntriesByName('prints:ready').length)) && Date.now() - t0 < 15000) await sleep(50);
  if (plant === 'frozen') await p.evaluate(() => window.__stage.registerEffect('develop', (id) => Promise.resolve({ id, d: 1, developed: true })));
  const dpr = await p.evaluate(() => devicePixelRatio);
  for (const [name, sel] of [['enlargement', '[data-print="enl"] .print-card'], ['sheet', '[data-sheet-grid]']]) {
    const n0 = await p.evaluate(() => performance.getEntriesByName('prints:develop').length);
    await reveal(p, sel, 0.4);
    const marked = await waitMark(p, n0);
    await sleep(400); // each texture is built in real time before its first develop frame; the clock does not move
    const box = await p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: Math.max(0, r.top), w: r.width, h: Math.min(r.bottom, innerHeight) - Math.max(0, r.top) }; }, sel);
    const vp = p.viewportSize();
    const clip = { left: Math.max(0, Math.round(box.x * dpr)), top: Math.round(box.y * dpr), width: Math.min(Math.round(box.w * dpr), Math.round(vp.width * dpr) - Math.max(0, Math.round(box.x * dpr))), height: Math.max(1, Math.round(box.h * dpr)) };
    const keys = KEYS[name].map((ms) => Math.round(ms / FRAME));
    const files = [];
    for (let f = 0; f <= keys[keys.length - 1]; f++) {
      if (f > 0) await p.evaluate((m) => window.__stage.seek(m), (clock += FRAME));
      if (!keys.includes(f)) continue;
      const file = join(out, `${name}-${PROFILE}-f${String(f).padStart(3, '0')}.png`);
      await p.screenshot({ path: file });
      files.push({ f, ms: Math.round(f * FRAME), file });
    }
    const last = files[files.length - 1].file;
    const diffs = await Promise.all(files.slice(0, -2).map((x) => meanDiff(x.file, last, clip)));
    const change = Math.max(...diffs);
    const rest = await meanDiff(files[files.length - 2].file, files[files.length - 1].file, clip);
    const fails = [];
    if (!marked) fails.push('no prints:develop mark');
    if (files.length !== keys.length) fails.push(`${files.length} of ${keys.length} keys shot`);
    if (!(change >= MIN_CHANGE)) fails.push(`no key's print region differs from the rested one by more than ${change} (mean, 0-255), want >= ${MIN_CHANGE}: no develop on the seeked frames`);
    if (!(rest <= MAX_REST)) fails.push(`the last two keys differ by ${rest}, want <= ${MAX_REST}: not at rest`);
    const tiles = await Promise.all(files.map((x) => sharp(x.file).resize({ width: 480 }).toBuffer()));
    const meta = await sharp(tiles[0]).metadata();
    const cols = 3;
    const sheetFile = join(out, `filmstrip-${name}-${PROFILE}.png`);
    await sharp({ create: { width: 480 * cols, height: meta.height * Math.ceil(tiles.length / cols), channels: 3, background: '#808080' } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 480, top: Math.floor(i / cols) * meta.height })))
      .png()
      .toFile(sheetFile);
    report.strips.push({ name, pass: !fails.length, fails, clip, change, diffsFromRest: diffs, rest, frames: files.map(({ f, ms }) => ({ f, ms })), contactSheet: sheetFile });
  }
  report.pageErrors = errors;
  report.tier = await p.evaluate(() => ({ tier: window.__stage.tier, tierLog: window.__stage.tierLog, governorSteps: window.__stage.stats.governorSteps }));
  await ctx.close();
} finally {
  await closeBrowsers();
  await srv.close();
}
report.pass = report.strips.length === 2 && report.strips.every((s) => s.pass) && !report.pageErrors.length;
writeFileSync(join(out, 'filmstrip.json'), JSON.stringify(report, null, 2));
for (const s of report.strips) console.log(`  ${s.name}: change ${s.change}, rest ${s.rest}${s.fails.length ? ` FAIL: ${s.fails.join('; ')}` : ''}`);
console.log(`w-s2 filmstrip ${PROFILE}${plant ? ` --plant ${plant}` : ''}: ${report.pass ? 'PASS' : 'FAIL'}`);
process.exit(report.pass ? 0 : 1);
