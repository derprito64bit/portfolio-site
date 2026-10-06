// Counters instrument (W-F acceptance, budgets.md "Idle"): with gate-owned counters (init.js via addInitScript),
//  1. idle: after the last input (a mouse move and a key), 0 rAF callbacks and 0 draws in the motion-end window,
//     matching __stage.stats (ticks, drawCalls) over the same window;
//  2. idle after a scroll: the last input is a scroll (a wheel step on mouse and WebKit, a real touch fling over CDP on
//     Chromium touch); 0 rAF and 0 draws in the motion-end window.
// The motion-end window (Orchestrator ruling on #11, 5992928262; budgets.md Idle): the motion ends at the later of the
// last input event (scroll, wheel, pointer or key) and the last frame the stage presented, every presented frame
// counted, tail and clear-only frames included (clearTimes: every stage render clears first). The window runs from the
// motion end + windowStartS + 2 frame intervals (the detach frame) to the motion end + windowEndS, from the json budgets
// block. Bound: the motion must end within windowEndS of the user's last input; one that still presents frames then
// fails the row (a loop that never goes idle cannot pass by never ending). The window counted from the input is
// reported too, for information.
//  3. match: over an active window (a scroll with GL drawing) the gate's counts equal __stage.stats exactly, and a page
//     with nothing to draw renders at most once (the canvas stays clear; review item 5);
//  4. scroll: 0 getBoundingClientRect calls inside rAF over a 10 s scroll.
// Usage: npm run h:counters -- [--profiles D2,P2,WK-P2] [--routes /,/bench/] [--out counters.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROFILES, ROOT, budget, cliMain, newContext, serve, sleep, waitSettled } from '../lib.mjs';

export const INIT = readFileSync(join(ROOT, 'tests/harness/counters/init.js'), 'utf8');
/** budgets.md Idle: the window's start (the idle detach) and end, in ms after the motion end. */
const WINDOW_START_MS = budget('site.idle.windowStartS') * 1000;
const WINDOW_END_MS = budget('site.idle.windowEndS') * 1000;
const snap = (page) => page.evaluate(() => {
  const g = window.__gateCounters;
  return {
    gate: { raf: g.raf, draws: g.draws, clears: g.clears, rectReadsInRaf: g.rectReadsInRaf, deps: Object.values(g.rafByDependency).reduce((x, y) => x + y, 0) },
    stage: { ticks: window.__stage.stats.ticks, drawCalls: window.__stage.stats.drawCalls, draws: window.__stage.stats.draws, renderSkips: window.__stage.stats.renderSkips },
    now: performance.now(),
  };
});
// Polling by interval (motionWindow), never by rAF: the harness must not add frames to the counts it reads.
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

/**
 * The motion-end window after an input the caller has just given (input given at or after `since`). Waits, polling by
 * interval, until the motion has ended and WINDOW_END_MS has passed after it, or until the bound is spent (the motion
 * still running WINDOW_END_MS after the user's last input, plus the window). Takes __stage.stats at the window's start
 * and end, so the stage's own counts cover the same window as the gate's. Returns { pass, ... }: 0 rAF and 0 draws in
 * the window, by the gate and by the stage, the motion ended within the bound, and nothing presented inside the window
 * moved the motion end.
 */
export async function motionWindow(page, since) {
  const live = () => page.evaluate((since) => {
    const g = window.__gateCounters;
    const last = (l) => { for (let i = l.length - 1; i >= 0; i--) if (l[i] > since) return l[i]; return 0; };
    const lastUser = g.lastUserInputAt > since ? g.lastUserInputAt : since;
    const lastPresent = Math.max(last(g.drawTimes), last(g.clearTimes));
    return { now: performance.now(), lastUser, lastScroll: g.lastScrollAt > since ? g.lastScrollAt : 0, lastPresent, end: Math.max(lastUser, g.lastScrollAt > since ? g.lastScrollAt : 0, lastPresent) };
  }, since);
  const frameMsOf = () => page.evaluate((since) => {
    const r = window.__gateCounters.rafTimes.filter((t) => t > since);
    const gaps = r.slice(1).map((t, i) => t - r[i]).sort((a, b) => a - b);
    return gaps.length ? gaps[Math.floor(gaps.length / 2)] : 1000 / 60;
  }, since);
  // The stage's own counts and the gate's uncapped counts, read together at the window's start and end.
  const stage = () => page.evaluate(() => {
    const g = window.__gateCounters;
    return { ticks: window.__stage.stats.ticks, drawCalls: window.__stage.stats.drawCalls, draws: window.__stage.stats.draws, tailFrames: window.__stage.stats.tailFrames ?? 0, gateRaf: g.raf, gateDraws: g.draws, gateClears: g.clears, at: performance.now() };
  });
  const hardStop = (s) => s.lastUser + WINDOW_END_MS * 2 + 1000; // the bound plus a whole window after it
  let s = await live();
  let frameMs = 1000 / 60;
  let a;
  let endAtStart;
  let restarts = 0;
  for (;;) {
    // Phase 1: the window's start, measured from the latest motion end seen live.
    while (true) {
      frameMs = await frameMsOf();
      const from = WINDOW_START_MS + 2 * frameMs;
      if (s.now - s.end >= from || s.now >= hardStop(s)) break;
      await sleep(Math.min(50, Math.max(5, s.end + from - s.now)));
      s = await live();
    }
    a = await stage();
    endAtStart = s.end;
    // Phase 2: the window's end. A frame presented (or an input) inside it is a new motion end: the window restarts
    // from it, inside the bound.
    while (s.now - endAtStart < WINDOW_END_MS && s.now < hardStop(s) && s.end === endAtStart) {
      await sleep(Math.min(50, Math.max(5, endAtStart + WINDOW_END_MS - s.now)));
      s = await live();
    }
    if (s.end !== endAtStart && s.now < hardStop(s)) {
      restarts++;
      continue;
    }
    break;
  }
  const b = await stage();
  return page.evaluate(({ since, end, endNow, from, frameMs, a, b, WINDOW_START_MS, WINDOW_END_MS, lastUser, restarts }) => {
    const g = window.__gateCounters;
    const inWin = (list, x, y) => list.filter((t) => t > x && t <= y).length;
    const rafs = g.rafTimes.filter((t) => t > since);
    const lastRaf = rafs.length ? rafs[rafs.length - 1] : null;
    const lastDraw = g.drawTimes.filter((t) => t > since).pop() ?? 0;
    const lastClear = g.clearTimes.filter((t) => t > since).pop() ?? 0;
    const win = { fromMs: Math.round(from), toMs: WINDOW_END_MS, raf: inWin(g.rafTimes, end + from, end + WINDOW_END_MS), draws: inWin(g.drawTimes, end + from, end + WINDOW_END_MS), clears: inWin(g.clearTimes, end + from, end + WINDOW_END_MS) };
    // The stamp lists keep the newest stamps only: they cover the window when their oldest kept stamp is before it (or
    // none was ever dropped). The uncapped counts, read at the window's start and end, cover it whatever the lists hold.
    const covers = (name) => g.stampsDropped?.[name] === 0 || (g[name].length > 0 && g[name][0] <= end + from);
    win.stampsCover = { raf: covers('rafTimes'), draws: covers('drawTimes'), clears: covers('clearTimes') };
    const uncapped = { fromMs: Math.round(a.at - end), toMs: Math.round(b.at - end), raf: b.gateRaf - a.gateRaf, draws: b.gateDraws - a.gateDraws, clears: b.gateClears - a.gateClears };
    const stageWin = { ticks: b.ticks - a.ticks, drawCalls: b.drawCalls - a.drawCalls, renders: b.draws - a.draws, tailFrames: b.tailFrames - a.tailFrames };
    const boundOk = end - lastUser <= WINDOW_END_MS && endNow === end;
    return {
      motionEndsMs: Math.round(end - lastUser), motionEndsBy: end === lastDraw ? 'draw' : end === lastClear ? 'presented clear' : end === g.lastScrollAt ? 'scroll' : 'input',
      frameMs: Math.round(frameMs * 10) / 10, lastRafAfterMotionMs: lastRaf === null ? null : Math.round(lastRaf - end),
      bound: { maxMs: WINDOW_END_MS, motionEndsMs: Math.round(endNow - lastUser), movedDuringWindow: endNow !== end, pass: boundOk },
      windowRestarts: restarts, afterMotion: win, uncappedInWindow: uncapped, stageInWindow: stageWin, stampsDropped: { ...g.stampsDropped },
      // For the negative control: the same window if presented clears were left out of the motion end (the rule before
      // the ruling counted only scrolls and draws).
      ifClearsIgnored: (() => { const e2 = Math.max(lastUser, g.lastScrollAt > since ? g.lastScrollAt : 0, lastDraw); return { raf: inWin(g.rafTimes, e2 + from, e2 + WINDOW_END_MS) }; })(),
      // For information: counted from the user's last input (the budget's old wording, gate F1).
      afterInput: { fromMs: WINDOW_START_MS, toMs: WINDOW_END_MS, raf: inWin(g.rafTimes, lastUser + WINDOW_START_MS, lastUser + WINDOW_END_MS), draws: inWin(g.drawTimes, lastUser + WINDOW_START_MS, lastUser + WINDOW_END_MS) },
      pass: boundOk && win.raf === 0 && win.draws === 0 && uncapped.raf === 0 && uncapped.draws === 0 && stageWin.ticks === 0 && stageWin.drawCalls === 0,
    };
  }, { since, end: endAtStart, endNow: s.end, from: WINDOW_START_MS + 2 * frameMs, frameMs, a, b, WINDOW_START_MS, WINDOW_END_MS, lastUser: s.lastUser, restarts });
}

/** The after-scroll idle window (step 2); negatives.mjs reuses it with planted defects. */
export async function idleAfterScroll(page, cdp) {
  const since = await page.evaluate(() => performance.now());
  const input = await scrollInput(page, cdp, 300);
  // The scroll must have happened (Lenis or the browser scrolls after the input).
  await page.waitForFunction((x) => window.__gateCounters.lastScrollAt > x, since, { polling: 50, timeout: 5000 }).catch(() => {});
  const r = await motionWindow(page, since);
  return { input, ...r, scrolledTo: await page.evaluate(() => Math.round(scrollY)) };
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

        // 1. idle window after a mouse move and a key, counted from the motion end.
        const { width, height } = page.viewportSize();
        const since = await page.evaluate(() => performance.now());
        await page.mouse.move(width / 2, height / 2);
        await page.mouse.move(width / 2 + 40, height / 2 + 10);
        await page.keyboard.press('Shift');
        const idle = await motionWindow(page, since);
        const idlePass = idle.pass;

        // 2. idle after a scroll: the ticker detaches about 1 s after the motion ends.
        const s0 = await snap(page);
        const afterScroll = await idleAfterScroll(page, cdp);
        const s1 = await snap(page);
        afterScroll.counts = diff(s0, s1);
        const afterScrollPass = afterScroll.pass && afterScroll.scrolledTo > 0;
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
    schema: 3, instrument: 'counters',
    motionEndWindow: `${WINDOW_START_MS / 1000} s + 2 frames to ${WINDOW_END_MS / 1000} s after the motion end: the later of the last input event (scroll, wheel, pointer, key) and the last presented frame (draws and clears, tail and clear-only frames included); the motion must end within ${WINDOW_END_MS / 1000} s of the last user input (Orchestrator ruling on #11, 5992928262)`,
    pass, rows,
    summary: rows.map((r) => `${r.profile} ${r.route}: idle raf ${r.idle.afterMotion.raf} draws ${r.idle.afterMotion.draws} (ends +${r.idle.motionEndsMs} ms); after ${r.afterScroll.input} (motion ends +${r.afterScroll.motionEndsMs} ms by ${r.afterScroll.motionEndsBy}, last rAF +${r.afterScroll.lastRafAfterMotionMs} ms after it) raf ${r.afterScroll.afterMotion.raf} draws ${r.afterScroll.afterMotion.draws} bound ${r.afterScroll.bound.pass ? 'ok' : 'FAIL'} [from input: raf ${r.afterScroll.afterInput.raf}]; active raf ${r.active.gate.raf - r.active.gate.rafFromDependencies}=${r.active.stage.ticks} draws ${r.active.gate.draws}=${r.active.stage.drawCalls}${r.empty ? `, empty page renders ${r.active.stage.renders} clears ${r.active.gate.clears} skips ${r.active.stage.renderSkips}` : ''}; scroll rect-in-raf ${r.scroll.gate.rectReadsInRaf}`).join(' | '),
  };
}

await cliMain(import.meta.url, run);
