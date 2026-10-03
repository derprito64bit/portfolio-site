// Counters instrument (W-F acceptance, budgets.md "Idle"): with gate-owned counters (init.js via addInitScript),
//  1. idle: 0 rAF callbacks and 0 draws from 1 s to 4 s after the last input (a mouse move and a key), matching
//     __stage.stats (ticks, drawCalls);
//  2. idle after a scroll: the last input is a scroll (a wheel step on mouse and WebKit, a real touch fling over CDP on
//     Chromium touch). Motion ends at the later of the last scroll event and the last GL draw. The ticker must detach
//     1 s after that (W-D002): 0 rAF and 0 draws from 1 s plus two frame intervals (the detach frame) to 4 s after
//     the motion ends. The window counted from the input instead is reported too (gate F1: the budget's wording is with
//     the orchestrator);
//  3. match: over an active window (a scroll with GL drawing) the gate's counts equal __stage.stats exactly, and a page
//     with nothing to draw renders at most once (the canvas stays clear; review item 5);
//  4. scroll: 0 getBoundingClientRect calls inside rAF over a 10 s scroll.
// Usage: npm run h:counters -- [--profiles D2,P2,WK-P2] [--routes /,/bench/] [--out counters.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROFILES, ROOT, cliMain, newContext, serve, sleep, waitSettled } from '../lib.mjs';

export const INIT = readFileSync(join(ROOT, 'tests/harness/counters/init.js'), 'utf8');
/** The motion-end window: from 1 s (the idle detach) plus two frame intervals after the motion ends, to 4 s after. */
const DETACH_MS = 1000;
const snap = (page) => page.evaluate(() => {
  const g = window.__gateCounters;
  return {
    gate: { raf: g.raf, draws: g.draws, clears: g.clears, rectReadsInRaf: g.rectReadsInRaf, deps: Object.values(g.rafByDependency).reduce((x, y) => x + y, 0) },
    stage: { ticks: window.__stage.stats.ticks, drawCalls: window.__stage.stats.drawCalls, draws: window.__stage.stats.draws, renderSkips: window.__stage.stats.renderSkips },
    now: performance.now(),
  };
});
// Polling by interval, never by rAF: the harness must not add frames to the counts it reads.
const waitUntil = (page, t, timeout = 10000) => page.waitForFunction((x) => performance.now() >= x, t, { polling: 50, timeout });
const diff = (a, b) => ({
  gate: { raf: b.gate.raf - a.gate.raf, rafFromDependencies: b.gate.deps - a.gate.deps, draws: b.gate.draws - a.gate.draws, clears: b.gate.clears - a.gate.clears, rectReadsInRaf: b.gate.rectReadsInRaf - a.gate.rectReadsInRaf },
  stage: { ticks: b.stage.ticks - a.stage.ticks, drawCalls: b.stage.drawCalls - a.stage.drawCalls, renders: b.stage.draws - a.stage.draws, renderSkips: b.stage.renderSkips - a.stage.renderSkips },
  ms: Math.round(b.now - a.now),
});

/** A scroll as the last input: a touch fling over CDP on Chromium touch profiles, else a wheel step. */
async function scrollInput(page, cdp, dy) {
  const { width, height } = page.viewportSize();
  if (cdp) {
    const x = Math.round(width / 2);
    const y0 = Math.round(height * 0.8);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(y0 - (i * dy) / 10) }] });
      await sleep(8);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return 'touch fling (CDP)';
  }
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.wheel(0, dy);
  return 'wheel';
}

/** The after-scroll idle window (step 2); negatives.mjs reuses it with a planted ticker that never detaches. */
export async function idleAfterScroll(page, cdp) {
  const t0 = await page.evaluate(() => performance.now());
  const input = await scrollInput(page, cdp, 300);
  const tInput = await page.evaluate(() => performance.now());
  // Wait for the motion to end and 4 s to pass after it (polled by interval). A page that never stops drawing times out.
  await page.waitForFunction((x) => {
    const g = window.__gateCounters;
    const end = Math.max(g.lastScrollAt, g.drawTimes[g.drawTimes.length - 1] ?? 0);
    return g.lastScrollAt > x && performance.now() - end >= 4000;
  }, t0, { polling: 50, timeout: 20000 });
  return page.evaluate(({ tInput, DETACH }) => {
    const g = window.__gateCounters;
    const lastDraw = g.drawTimes.filter((t) => t > tInput).pop() ?? 0;
    const end = Math.max(g.lastScrollAt, lastDraw);
    const rafs = g.rafTimes.filter((t) => t > tInput);
    const gaps = rafs.slice(1).map((t, i) => t - rafs[i]).sort((a, b) => a - b);
    const frameMs = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1000 / 60;
    const from = DETACH + 2 * frameMs;
    const inWin = (list, a, b) => list.filter((t) => t > a && t <= b).length;
    const lastRaf = rafs.length ? rafs[rafs.length - 1] : null;
    return {
      motionEndsMs: Math.round(end - tInput), motionEndsBy: lastDraw > g.lastScrollAt ? 'draw' : 'scroll', frameMs: Math.round(frameMs * 10) / 10,
      lastRafAfterMotionMs: lastRaf === null ? null : Math.round(lastRaf - end),
      afterMotion: { fromMs: Math.round(from), toMs: 4000, raf: inWin(g.rafTimes, end + from, end + 4000), draws: inWin(g.drawTimes, end + from, end + 4000) },
      // Counted from the input (gate F1): a scroll's own motion can outlast the first second.
      afterInput: { fromMs: 1000, toMs: 4000, raf: inWin(g.rafTimes, tInput + 1000, tInput + 4000), draws: inWin(g.drawTimes, tInput + 1000, tInput + 4000) },
      scrolledTo: Math.round(scrollY),
    };
  }, { tInput, DETACH: DETACH_MS }).then((r) => ({ input, ...r }));
}

export async function run(opts = {}) {
  const profiles = String(opts.profiles || 'D2,P2,WK-P2').split(',');
  const routes = String(opts.routes || '/,/bench/').split(',');
  const srv = await serve();
  const rows = [];
  try {
    for (const profile of profiles) {
      for (const route of routes) {
        const ctx = await newContext(profile);
        await ctx.addInitScript({ content: INIT });
        const page = await ctx.newPage();
        const cdp = PROFILES[profile].browser === 'chromium' && PROFILES[profile].input === 'touch' ? await ctx.newCDPSession(page) : null;
        await page.goto(srv.base + route, { waitUntil: 'load' });
        await waitSettled(page, 12000);
        await sleep(300);

        // 1. idle window: last input, then 1 s to 4 s after it.
        const { width, height } = page.viewportSize();
        await page.mouse.move(width / 2, height / 2);
        await page.mouse.move(width / 2 + 40, height / 2 + 10);
        await page.keyboard.press('Shift');
        const tInput = await page.evaluate(() => performance.now());
        await waitUntil(page, tInput + 1000);
        const a = await snap(page);
        await waitUntil(page, tInput + 4000);
        const b = await snap(page);
        const idle = diff(a, b);
        const idlePass = idle.gate.raf === 0 && idle.gate.draws === 0 && idle.stage.ticks === 0 && idle.stage.drawCalls === 0;

        // 2. idle after a scroll: the ticker detaches about 1 s after the motion ends.
        const s0 = await snap(page);
        const afterScroll = await idleAfterScroll(page, cdp);
        const s1 = await snap(page);
        afterScroll.counts = diff(s0, s1);
        const afterScrollPass = afterScroll.afterMotion.raf === 0 && afterScroll.afterMotion.draws === 0 && afterScroll.scrolledTo > 0;
        await waitSettled(page, 8000);

        // 3. active window: the gate and the stage must agree frame for frame.
        const gl = await page.evaluate(() => window.__stage.gl?.info() ?? null);
        const empty = Boolean(gl) && gl.entities === 0 && gl.views === 0;
        const c = await snap(page);
        for (let i = 0; i < 10; i++) {
          await page.mouse.wheel(0, i < 5 ? 240 : -240);
          await sleep(60);
        }
        await waitSettled(page, 8000);
        const d = await snap(page);
        const active = diff(c, d);
        const matchPass = active.gate.raf - active.gate.rafFromDependencies === active.stage.ticks && active.gate.draws === active.stage.drawCalls && active.gate.raf > 0;
        // A page with nothing to draw keeps its clear canvas: at most one render (and one clear) per window.
        const emptyPass = !empty || (active.stage.renders <= 1 && active.gate.clears <= 1);

        // 4. a 10 s scroll: no layout reads inside the ticker.
        const e = await snap(page);
        const t0 = Date.now();
        let dir = 1;
        while (Date.now() - t0 < 10000) {
          const y = await page.evaluate(() => [window.scrollY, document.documentElement.scrollHeight - window.innerHeight]);
          if (y[0] >= y[1] - 10) dir = -1;
          if (y[0] <= 10) dir = 1;
          await page.mouse.wheel(0, 180 * dir);
          await sleep(40);
        }
        await waitSettled(page, 8000);
        const f = await snap(page);
        const scroll = diff(e, f);
        const scrollPass = scroll.gate.rectReadsInRaf === 0;

        rows.push({
          profile, route, tier: await page.evaluate(() => window.__stage.tier), gl, empty,
          idle, idlePass, afterScroll, afterScrollPass, active, matchPass, emptyPass, scroll, scrollPass,
          pass: idlePass && afterScrollPass && matchPass && emptyPass && scrollPass,
        });
        await ctx.close();
      }
    }
  } finally {
    await srv.close();
  }
  const pass = rows.every((r) => r.pass);
  return {
    schema: 2, instrument: 'counters', motionEndWindow: '1 s + 2 frames to 4 s after the later of the last scroll event and the last draw', pass, rows,
    summary: rows.map((r) => `${r.profile} ${r.route}: idle raf ${r.idle.gate.raf} draws ${r.idle.gate.draws}; after ${r.afterScroll.input} (motion ends +${r.afterScroll.motionEndsMs} ms, last rAF +${r.afterScroll.lastRafAfterMotionMs} ms after it) raf ${r.afterScroll.afterMotion.raf} draws ${r.afterScroll.afterMotion.draws} [from input: raf ${r.afterScroll.afterInput.raf}]; active raf ${r.active.gate.raf - r.active.gate.rafFromDependencies}=${r.active.stage.ticks} draws ${r.active.gate.draws}=${r.active.stage.drawCalls}${r.empty ? `, empty page renders ${r.active.stage.renders} clears ${r.active.gate.clears} skips ${r.active.stage.renderSkips}` : ''}; scroll rect-in-raf ${r.scroll.gate.rectReadsInRaf}`).join(' | '),
  };
}

await cliMain(import.meta.url, run);
