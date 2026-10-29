// Idle check (W-V0b row 7; #92; D-053), on the engine's frame counters (?vf-test, D-055). Each segment is a window with
// no input:
//   intro           the intro at rest: from its own idle marker (.raise.is-idle, the roaming spot meter's start)
//   evf             frame 1 after the raise, from 2 s after the raise ends (past the meter's settle and the idle timer)
//   intro-hidden,   the same states with the tab hidden. Headless Chromium never hides a page, so it is emulated
//   evf-hidden      (lib.setHidden: document.hidden, visibilityState and the visibilitychange event)
//   intro-reduced,  under prefers-reduced-motion: reduce (the page's calm path; the intro has no idle marker there, so its
//   evf-reduced     window opens 5 s after the release, when the auto path's marker would appear)
// Per segment: frames per second per channel (frames, scene, composite, eyepiece, readback); document.getAnimations()
// when the window opens (running and infinite); and in Chromium a trace of the same window, independent of the counters
// (#92): rAF callbacks (FireAnimationFrame), Paint events and main-thread busy time (top-level tasks) in ms per second.
// The trace cross-check: the engine draws only inside a rAF callback, so its presented frames can never exceed the
// trace's rAF callbacks.
// Assertions: thresholds.json "assert" holds only what the current build meets (measured in W-V0b); D-053's targets
// ("d053") are reported per segment, not asserted, until W-V3 moves them into "assert".
// Usage: npm run h:idle -- [--profile D2] [--window 10] [--browsers chromium,webkit] [--no-trace] [--plant hot] [--out idle.json]
// --plant hot is the negative control: it keeps the engine drawing in the EVF segment, which must then FAIL.
// CI runs it at --profile G1 (software GL; see .github/workflows/check.yml); the reference host's numbers are the record.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NO3D, ROOT, browser, cliMain, consoleGate, flatPathVerdict, newContext, serve, setHidden, sleep, waitSettled } from '../lib.mjs';

const CHANNELS = ['frames', 'scene', 'composite', 'eyepiece', 'readback'];
export const THRESHOLDS = JSON.parse(readFileSync(join(ROOT, 'tests/harness/idle/thresholds.json'), 'utf8'));
const TRACE_CATEGORIES = ['devtools.timeline', 'toplevel', 'blink.user_timing', 'disabled-by-default-devtools.timeline'];

/** Frames per second per channel from a stats() snapshot. */
export const rates = (s) => Object.fromEntries(CHANNELS.map((c) => [c, s.ms > 0 ? Math.round((s[c] / s.ms) * 10000) / 10 : 0]));

/**
 * One limit table ({ channel: max fps, infiniteAnimations: max count }; a missing key is not judged) against a segment's
 * rates and its count of infinite animations: what is past its maximum.
 */
export function overLimits(r, limits = {}, infinite = 0) {
  const out = CHANNELS.filter((c) => typeof limits[c] === 'number' && r[c] > limits[c]).map((c) => `${c} ${r[c]} fps > ${limits[c]}`);
  if (typeof limits.infiniteAnimations === 'number' && infinite > limits.infiniteAnimations) out.push(`${infinite} infinite animations > ${limits.infiniteAnimations}`);
  return out;
}
/** The trace cross-check (#92): the engine draws only inside a rAF callback, so frames > callbacks means a miscount. */
export const crossCheck = (frames, tr) => (tr && !tr.error && frames > tr.rafCallbacks ? [`trace cross-check: ${frames} engine frames > ${tr.rafCallbacks} rAF callbacks`] : []);

/**
 * The trace's numbers inside the window marked idle:start .. idle:end on the page's renderer main thread: rAF callbacks,
 * Paint events and the time its tasks kept the thread busy (ms per second; a task that straddles an edge is clipped).
 */
export function traceWindow(traceEvents) {
  const start = traceEvents.find((e) => e.name === 'idle:start');
  const end = traceEvents.find((e) => e.name === 'idle:end');
  if (!start || !end) return { error: 'no idle:start / idle:end marks in the trace' };
  const pid = start.pid;
  const mains = traceEvents.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.pid === pid && e.args?.name === 'CrRendererMain').map((e) => e.tid);
  const inWin = (e) => e.pid === pid && e.ts >= start.ts && e.ts <= end.ts;
  const sec = (end.ts - start.ts) / 1e6;
  const raf = traceEvents.filter((e) => inWin(e) && e.name === 'FireAnimationFrame' && (e.ph === 'X' || e.ph === 'B')).length;
  const paint = traceEvents.filter((e) => inWin(e) && e.name === 'Paint' && (e.ph === 'X' || e.ph === 'B')).length;
  // busy time = the union of the main thread's task intervals inside the window (task events nest and repeat under two
  // names, so a plain sum can pass 1000 ms per second)
  const spans = traceEvents.filter((e) => e.pid === pid && mains.includes(e.tid) && e.ph === 'X' && (e.name === 'RunTask' || e.name === 'ThreadControllerImpl::RunTask'))
    .map((e) => [Math.max(e.ts, start.ts), Math.min(e.ts + (e.dur ?? 0), end.ts)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let busyUs = 0;
  let to = -Infinity;
  for (const [a, b] of spans) {
    if (b <= to) continue;
    busyUs += b - Math.max(a, to);
    to = b;
  }
  const r1 = (x) => Math.round(x * 10) / 10;
  return { seconds: r1(sec), rafCallbacks: raf, rafPerSec: r1(raf / sec), paints: paint, paintsPerSec: r1(paint / sec), mainThreadMsPerSec: r1(busyUs / 1000 / sec) };
}

/** The running animations when a window opens (#92): their names, and which never end. */
const animations = (page) => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => {
  const t = a.effect?.getTiming?.() ?? {};
  const target = a.effect?.target;
  return { name: a.animationName || a.transitionProperty || a.id || a.constructor.name, infinite: t.iterations === Infinity, target: target ? `${target.tagName?.toLowerCase()}${target.className ? `.${String(target.className).trim().split(/\s+/).join('.')}` : ''}` : null };
}));

/** The state each segment measures: the intro, or frame 1 of the EVF. */
const WANT = (name) => ({ state: name.startsWith('evf') ? 'evf' : 'intro', pos: 0 });

async function measure(page, b, name, windowSec, trace) {
  const anims = await animations(page);
  const infinite = anims.filter((a) => a.infinite);
  const tracing = trace && b.browserType().name() === 'chromium';
  if (tracing) await b.startTracing(page, { categories: TRACE_CATEGORIES });
  await page.evaluate(() => { window.__vf.resetStats(); performance.mark('idle:start'); });
  await sleep(windowSec * 1000);
  const s = await page.evaluate(() => { performance.mark('idle:end'); return window.__vf.stats(); });
  let tr = null;
  if (tracing) {
    const buf = await b.stopTracing();
    tr = traceWindow(JSON.parse(buf.toString('utf8')).traceEvents ?? []);
  }
  const r = rates(s);
  const at = await page.evaluate(() => ({ state: window.__vf.state(), pos: window.__vf.pos() }));
  const want = WANT(name);
  const over = overLimits(r, THRESHOLDS.assert[name] ?? {}, infinite.length);
  if (THRESHOLDS.traceCrossCheck) over.push(...crossCheck(s.frames, tr));
  if (tr?.error) over.push(`trace: ${tr.error}`);
  if (at.state !== want.state || at.pos !== want.pos) over.push(`the page left ${want.state} ${want.pos} during the window (now ${at.state} ${at.pos})`);
  const d053 = overLimits(r, THRESHOLDS.d053[name] ?? {}, infinite.length);
  if (tr && !tr.error && typeof THRESHOLDS.d053.mainThreadMsPerSecMax === 'number' && !/hidden/.test(name) && tr.mainThreadMsPerSec > THRESHOLDS.d053.mainThreadMsPerSecMax) d053.push(`main thread ${tr.mainThreadMsPerSec} ms/s > ${THRESHOLDS.d053.mainThreadMsPerSecMax}`);
  return {
    segment: name, state: at.state, pos: at.pos,
    engine: s.engine, seconds: Math.round(s.ms) / 1000, counts: Object.fromEntries(CHANNELS.map((c) => [c, s[c]])), fps: r,
    animations: { running: anims.length, infinite: infinite.map((a) => `${a.name} on ${a.target}`) },
    trace: tr, pass: over.length === 0, failures: over, d053: { meets: d053.length === 0, misses: d053 },
  };
}

async function runBrowser(srv, browserName, profile, windowSec, trace, plant) {
  const rows = [];
  const consoleFailures = [];
  for (const mode of ['auto', 'reduced']) {
    const ctx = await newContext(profile, mode, { browser: browserName === 'webkit' ? 'webkit' : NO3D ? 'chromium-no3d' : 'chromium' });
    try {
      const page = await ctx.newPage();
      const gate = consoleGate(page);
      const b = await browser(browserName === 'webkit' ? 'webkit' : NO3D ? 'chromium-no3d' : 'chromium');
      await page.goto(`${srv.base}/?vf-test`, { waitUntil: 'load' });
      if (!(await waitSettled(page, 45000))) throw new Error(`${browserName} ${mode}: the preloader did not finish in 45 s`);
      const tag = mode === 'reduced' ? '-reduced' : '';
      // the intro at rest
      if (mode === 'auto') await page.waitForSelector('.raise.is-idle', { timeout: 30000 });
      else await sleep(5000);
      rows.push({ browser: browserName, mode, ...(await measure(page, b, `intro${tag}`, windowSec, trace)) });
      if (mode === 'auto') {
        await setHidden(page, true);
        rows.push({ browser: browserName, mode, ...(await measure(page, b, 'intro-hidden', windowSec, trace)) });
        await setHidden(page, false);
      }
      // frame 1 after the raise
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => window.__vf.state() === 'evf' && window.__vf.pos() === 0, null, { timeout: 45000, polling: 50 });
      await sleep(2000);
      // --plant hot (the negative control): the engine is kept drawing every frame, as a broken rest would; the evf
      // segment must then fail its frame limit.
      if (plant === 'hot') await page.evaluate(() => window.__vfEngine?.invalidate(600000));
      rows.push({ browser: browserName, mode, ...(await measure(page, b, `evf${tag}`, windowSec, trace)) });
      if (mode === 'auto') {
        await setHidden(page, true);
        rows.push({ browser: browserName, mode, ...(await measure(page, b, 'evf-hidden', windowSec, trace)) });
        await setHidden(page, false);
      }
      const v = NO3D ? flatPathVerdict(gate.verdict()) : gate.verdict();
      consoleFailures.push(...v.failures.map((f) => `${browserName} ${mode} ${f.channel}/${f.level}: ${String(f.text).slice(0, 160)}`));
    } finally {
      await ctx.close();
    }
  }
  return { rows, consoleFailures };
}

export async function run(opts = {}) {
  const profile = String(opts.profile ?? (process.env.CI ? 'G1' : 'D2'));
  const windowSec = Number(opts.window ?? THRESHOLDS.windowSec);
  const browsers = String(opts.browsers ?? 'chromium').split(',').map((s) => s.trim()).filter(Boolean);
  const trace = !opts['no-trace'];
  const srv = await serve();
  const rows = [];
  const consoleFailures = [];
  try {
    for (const name of browsers) {
      const r = await runBrowser(srv, name, profile, windowSec, trace, opts.plant ? String(opts.plant) : null);
      rows.push(...r.rows);
      consoleFailures.push(...r.consoleFailures);
    }
  } finally {
    await srv.close();
  }
  const failing = rows.filter((r) => !r.pass);
  const pass = failing.length === 0 && consoleFailures.length === 0;
  const fmt = (r) => `${r.browser} ${r.segment} ${r.fps.frames} fps (scene ${r.fps.scene}, composite ${r.fps.composite}, eyepiece ${r.fps.eyepiece}, readback ${r.fps.readback})${r.trace && !r.trace.error ? ` [rAF ${r.trace.rafPerSec}/s, main ${r.trace.mainThreadMsPerSec} ms/s]` : ''}`;
  return {
    schema: 1, instrument: 'idle', pass, profile, windowSec, flat: NO3D, ...(opts.plant ? { planted: String(opts.plant) } : {}), thresholds: THRESHOLDS, rows, consoleFailures,
    d053: { meets: rows.every((r) => r.d053.meets), misses: rows.filter((r) => !r.d053.meets).map((r) => `${r.browser} ${r.segment}: ${r.d053.misses.join('; ')}`) },
    summary: `${rows.map(fmt).join('; ')}${failing.length ? ` | FAIL ${failing.map((r) => `${r.browser} ${r.segment}: ${r.failures.join(', ')}`).join(' | ')}` : ''}${consoleFailures.length ? ` | console: ${consoleFailures.slice(0, 3).join(' | ')}` : ''}`,
  };
}

await cliMain(import.meta.url, run);
