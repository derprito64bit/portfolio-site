// Counters instrument (W-F acceptance, budgets.md "Idle"): with gate-owned counters (init.js via addInitScript),
//  1. idle: after the last input (a mouse move and a key), 0 rAF callbacks and 0 draws in the motion-end window,
//     matching __stage.stats (ticks, drawCalls) over the same window;
//  2. idle after a scroll: the last input is a scroll (a wheel step on mouse and WebKit, a real touch fling over CDP on
//     Chromium touch); 0 rAF and 0 draws in the motion-end window.
// The motion-end window (Orchestrator rulings on #11, 5992928262 and 6030949628; budgets.md Idle): the motion ends at the
// later of the last input event (scroll, wheel, pointer or key), the last arrival (a full load, a history traversal that
// loads, a bfcache restore, a Swup visit's end) and the last frame the stage presented, every presented frame counted,
// tail and clear-only frames included (clearTimes: every stage render clears first). The window runs from the motion end
// + windowStartS + max(2 frame intervals, 34 ms) to the motion end + windowEndS, from the json budgets block. Bound
// (ruling 6031879782 item 2): after an input the motion must end within windowEndS of it; after an arrival there is no
// windowEndS bound (a designed motion, such as W-S1's opening on a plain load of /, is a motion, not idle cost). Either
// way a motion still presenting frames at the hard stop, 2 x windowEndS + 1 s after the anchor (the later of the input
// and the arrival), fails the row: a loop that never goes idle cannot pass by never ending. The window counted from the
// input is reported too.
//  3. match: over an active window (a scroll with GL drawing) the gate's counts equal __stage.stats exactly, and a page
//     with nothing to draw renders at most once (the canvas stays clear; review item 5);
//  4. scroll: 0 getBoundingClientRect calls inside rAF over a 10 s scroll, and 0 other forced layout reads (offset*,
//     client*, scroll size, getClientRects, getComputedStyle) inside rAF (round-3 should-fix S9);
//  5. arrivals (rulings 6030949628 item 1 and 6031879782 item 2): the same window after an arrival with no input: a
//     full load of /#contact (a hash: no opening) and of / (W-S1's opening plays, about 5.4 s), a history Back to
//     /#contact (a fresh load), a Swup visit's end and, in Chromium with the back/forward cache on, a bfcache restore. A
//     wake after the arrival that presents nothing falls in the window and fails it. swup-404 (ruling 6031879782 item
//     3): GL up on /, a Swup visit to the 404: the window passes with no restart (0 draws after it settles), no WebGL
//     context is made there, and the same live context draws / again on the way back.
//  6. touch tail (round-5 must-fix lenis-native-velocity): on the full tier, a finger on the lens ring 250 to 550 ms
//     into a 120 px wheel glide (Chromium D2 over CDP, WebKit D3 by the page's TouchEvents): the motion ends within
//     windowEndS of the touch, the window reads 0 rAF and 0 draws, and the stage renders next to nothing after the touch
//     (not every frame until a governor step); no-touch and touch-at-rest
//     controls. Any window fails on a page that used a frame source the counters cannot see (init.js (d)).
// Usage: npm run h:counters -- [--profiles D2,P2,WK-P2] [--routes /,/bench/] [--no-arrivals] [--arrivals-only]
//        [--no-touch-tail] [--touch-tail-only] [--touch-tail-cases tail-250,no-touch] [--dist <dir>] [--out counters.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROFILES, ROOT, budget, cliMain, newContext, serve, sleep, waitSettled } from '../lib.mjs';

export const INIT = readFileSync(join(ROOT, 'tests/harness/counters/init.js'), 'utf8');
/** budgets.md Idle: the window's start (the idle detach) and end, in ms after the motion end. */
const WINDOW_START_MS = budget('site.idle.windowStartS') * 1000;
const WINDOW_END_MS = budget('site.idle.windowEndS') * 1000;
/**
 * The window opens at the motion end + windowStartS + max(2 frame intervals, the floor), so its tolerance does not
 * depend on the display's refresh rate (Orchestrator ruling on #11, 6030949628 item 2: at 238 Hz 2 frames are 8.4 ms,
 * inside ordinary timer and frame jitter). The floor is site.idle.windowToleranceMinMs once the orchestrator's docs PR
 * carries it in the json budgets block; until then the ruling's own number binds, as the ruling says.
 */
const RULING_6030949628_FLOOR_MS = 34; // '34 ms is 2 frames at 60 Hz' (ruling 6030949628 item 2), until the key lands
export const TOLERANCE_FLOOR_MS = (() => {
  try {
    return budget('site.idle.windowToleranceMinMs');
  } catch {
    return RULING_6030949628_FLOOR_MS;
  }
})();
export const windowTolerance = (frameMs) => Math.max(2 * frameMs, TOLERANCE_FLOOR_MS);
const snap = (page) => page.evaluate(() => {
  const g = window.__gateCounters;
  return {
    gate: { raf: g.raf, draws: g.draws, clears: g.clears, rectReadsInRaf: g.rectReadsInRaf, layoutReadsInRaf: g.layoutReadsInRaf ?? 0, layoutReadsInRafBy: { ...(g.layoutReadsInRafBy ?? {}) }, deps: Object.values(g.rafByDependency).reduce((x, y) => x + y, 0) },
    stage: { ticks: window.__stage.stats.ticks, drawCalls: window.__stage.stats.drawCalls, draws: window.__stage.stats.draws, renderSkips: window.__stage.stats.renderSkips },
    now: performance.now(),
  };
});
// Polling by interval (motionWindow), never by rAF: the harness must not add frames to the counts it reads.
const diff = (a, b) => ({
  gate: {
    raf: b.gate.raf - a.gate.raf, rafFromDependencies: b.gate.deps - a.gate.deps, draws: b.gate.draws - a.gate.draws, clears: b.gate.clears - a.gate.clears, rectReadsInRaf: b.gate.rectReadsInRaf - a.gate.rectReadsInRaf,
    layoutReadsInRaf: b.gate.layoutReadsInRaf - a.gate.layoutReadsInRaf,
    layoutReadsInRafBy: Object.fromEntries(Object.entries(b.gate.layoutReadsInRafBy).map(([k, v]) => [k, v - (a.gate.layoutReadsInRafBy[k] ?? 0)]).filter(([, v]) => v > 0)),
  },
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

/** The hard stop, after the anchor (ruling 6031879782 item 2): 2 x windowEndS + 1 s, 9 s at the budgets' 4 s. */
export const HARD_STOP_MS = WINDOW_END_MS * 2 + 1000;

/**
 * The motion-end window after an input the caller has just given (input given at or after `since`), or after an
 * arrival. Waits, polling by interval, until the motion has ended and WINDOW_END_MS has passed after it, or until the
 * hard stop (a frame still presented HARD_STOP_MS after the anchor). Takes __stage.stats at the window's start and end,
 * so the stage's own counts cover the same window as the gate's. Returns { pass, ... }: 0 rAF and 0 draws in the
 * window, by the gate and by the stage; the motion ended within the bound (WINDOW_END_MS after an input, the hard stop
 * after an arrival); the window ran in full; and nothing presented inside the window moved the motion end.
 */
export async function motionWindow(page, since) {
  // An arrival (a full load, a bfcache restore, a Swup visit's end) anchors the window as an input does (ruling
  // 6030949628 item 1); the windowEndS bound counts from an input only (ruling 6031879782 item 2). The anchor is the
  // later of the two: an input after an arrival brings the bound back.
  const live = () => page.evaluate((since) => {
    const g = window.__gateCounters;
    const last = (l) => { for (let i = l.length - 1; i >= 0; i--) if (l[i] > since) return l[i]; return 0; };
    const arrival = (g.lastArrivalAt ?? 0) > since ? g.lastArrivalAt : 0;
    const input = g.lastUserInputAt > since ? g.lastUserInputAt : 0;
    // No input or arrival after `since`: the caller's input is at `since` (it was given just after it).
    const anchor = Math.max(input || since, arrival);
    const anchorKind = arrival > 0 && arrival >= input ? 'arrival' : 'input';
    const lastPresent = Math.max(last(g.drawTimes), last(g.clearTimes));
    return { now: performance.now(), anchor, anchorKind, arrival, lastScroll: g.lastScrollAt > since ? g.lastScrollAt : 0, lastPresent, end: Math.max(anchor, g.lastScrollAt > since ? g.lastScrollAt : 0, lastPresent) };
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
  // A motion end after the hard stop is a motion that never ended: the harness stops waiting for it there.
  const pastHardStop = (s) => s.end - s.anchor > HARD_STOP_MS;
  let s = await live();
  let frameMs = 1000 / 60;
  let a;
  let endAtStart;
  let restarts = 0;
  for (;;) {
    // Phase 1: the window's start, measured from the latest motion end seen live.
    while (true) {
      frameMs = await frameMsOf();
      const from = WINDOW_START_MS + windowTolerance(frameMs);
      if (s.now - s.end >= from || pastHardStop(s)) break;
      await sleep(Math.min(50, Math.max(5, s.end + from - s.now)));
      s = await live();
    }
    a = await stage();
    endAtStart = s.end;
    // Phase 2: the window's end. A frame presented (or an input) inside it is a new motion end: the window restarts
    // from it, up to the hard stop. A window that started before the hard stop runs in full.
    while (s.now - endAtStart < WINDOW_END_MS && s.end === endAtStart) {
      await sleep(Math.min(50, Math.max(5, endAtStart + WINDOW_END_MS - s.now)));
      s = await live();
    }
    if (s.end !== endAtStart && !pastHardStop(s)) {
      restarts++;
      continue;
    }
    break;
  }
  const ranMs = s.now - endAtStart;
  const b = await stage();
  return page.evaluate(({ since, end, endNow, ranMs, from, toleranceMs, frameMs, a, b, WINDOW_START_MS, WINDOW_END_MS, HARD_STOP_MS, anchor, anchorKind, arrival, restarts }) => {
    const g = window.__gateCounters;
    const inWin = (list, x, y) => list.filter((t) => t > x && t <= y).length;
    const rafs = g.rafTimes.filter((t) => t > since);
    const lastRaf = rafs.length ? rafs[rafs.length - 1] : null;
    const lastDraw = g.drawTimes.filter((t) => t > since).pop() ?? 0;
    const win = { fromMs: Math.round(from), toleranceMs: Math.round(toleranceMs * 10) / 10, toMs: WINDOW_END_MS, raf: inWin(g.rafTimes, end + from, end + WINDOW_END_MS), draws: inWin(g.drawTimes, end + from, end + WINDOW_END_MS), clears: inWin(g.clearTimes, end + from, end + WINDOW_END_MS) };
    // The stamp lists keep the newest stamps only: they cover the window when their oldest kept stamp is before it (or
    // none was ever dropped). The uncapped counts, read at the window's start and end, cover it whatever the lists hold.
    const covers = (name) => g.stampsDropped?.[name] === 0 || (g[name].length > 0 && g[name][0] <= end + from);
    win.stampsCover = { raf: covers('rafTimes'), draws: covers('drawTimes'), clears: covers('clearTimes') };
    const uncapped = { fromMs: Math.round(a.at - end), toMs: Math.round(b.at - end), raf: b.gateRaf - a.gateRaf, draws: b.gateDraws - a.gateDraws, clears: b.gateClears - a.gateClears };
    const stageWin = { ticks: b.ticks - a.ticks, drawCalls: b.drawCalls - a.drawCalls, renders: b.draws - a.draws, tailFrames: b.tailFrames - a.tailFrames };
    // The bound (ruling 6031879782 item 2): windowEndS after an input; after an arrival, only the hard stop. Either way
    // the motion end did not move inside the window, and the window ran in full.
    const maxMs = anchorKind === 'input' ? WINDOW_END_MS : HARD_STOP_MS;
    const complete = ranMs >= WINDOW_END_MS;
    const boundOk = end - anchor <= maxMs && endNow === end && complete;
    return {
      // What made the motion end the window was measured from (a frame presented after it does not relabel it).
      anchor: anchorKind, motionEndsMs: Math.round(end - anchor), motionEndsBy: g.drawTimes.includes(end) ? 'draw' : g.clearTimes.includes(end) ? 'presented clear' : end === g.lastScrollAt ? 'scroll' : arrival > 0 && end === arrival ? `arrival (${g.arrivals.at(-1)?.kind ?? '?'})` : 'input',
      frameMs: Math.round(frameMs * 10) / 10, lastRafAfterMotionMs: lastRaf === null ? null : Math.round(lastRaf - end),
      bound: { anchor: anchorKind, maxMs, hardStopMs: HARD_STOP_MS, motionEndsMs: Math.round(endNow - anchor), movedDuringWindow: endNow !== end, windowRanMs: Math.round(ranMs), complete, pass: boundOk },
      windowRestarts: restarts, afterMotion: win, uncappedInWindow: uncapped, stageInWindow: stageWin, stampsDropped: { ...g.stampsDropped },
      // For the negative control: the same window if presented clears were left out of the motion end (the rule before
      // the ruling counted only scrolls and draws).
      ifClearsIgnored: (() => { const e2 = Math.max(anchor, g.lastScrollAt > since ? g.lastScrollAt : 0, lastDraw); return { raf: inWin(g.rafTimes, e2 + from, e2 + WINDOW_END_MS) }; })(),
      // For information: counted from the anchor (the budget's old wording, gate F1).
      afterInput: { fromMs: WINDOW_START_MS, toMs: WINDOW_END_MS, raf: inWin(g.rafTimes, anchor + WINDOW_START_MS, anchor + WINDOW_END_MS), draws: inWin(g.drawTimes, anchor + WINDOW_START_MS, anchor + WINDOW_END_MS) },
      // Frame sources the counters cannot see (init.js (d): a worker's frames through transferControlToOffscreen, a
      // 'webgpu' context, navigator.gpu): a page that used one has frames no window can count, so it fails every window
      // (ruling 6049539219 item 4 (d)). rafBy and realms say which alias and how many realms the counts came from.
      blind: [...(g.blind ?? [])], rafBy: { ...(g.rafBy ?? {}) }, realms: g.realms ?? 1,
      // Any frame the gate sees in the window fails it: a rAF callback (any alias, any same-origin realm), a draw through
      // any entry point, a clear (clear or clearBuffer*, round-3 must-fix counters-draw-cap), by the stamps and by the
      // uncapped counts.
      pass: boundOk && (g.blind ?? []).length === 0 && win.raf === 0 && win.draws === 0 && win.clears === 0 && uncapped.raf === 0 && uncapped.draws === 0 && uncapped.clears === 0 && stageWin.ticks === 0 && stageWin.drawCalls === 0,
    };
  }, { since, end: endAtStart, endNow: s.end, ranMs, from: WINDOW_START_MS + windowTolerance(frameMs), toleranceMs: windowTolerance(frameMs), frameMs, a, b, WINDOW_START_MS, WINDOW_END_MS, HARD_STOP_MS, anchor: s.anchor, anchorKind: s.anchorKind, arrival: s.arrival, restarts });
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

/**
 * Step 5 (ruling 6030949628 item 1): the motion-end window after an arrival with no input. The gate stamps every arrival
 * itself (init.js: the load event, pageshow from the bfcache, a Swup visit replacing #swup and its classes coming off);
 * the window is anchored at the latest, so a wake after it that presents nothing lands in the window and fails it.
 */
export async function arrivalWindow(page, kind) {
  await page.waitForFunction((k) => window.__gateCounters.arrivals.some((a) => a.kind === k), kind, { polling: 50, timeout: 10000 }).catch(() => {});
  await sleep(100); // a Swup visit's classes come off a little after its content replace: anchor at the latest
  const at = await page.evaluate(() => window.__gateCounters.lastArrivalAt);
  const r = await motionWindow(page, Math.max(0, at - 1));
  const after = await page.evaluate(() => ({ arrivals: window.__gateCounters.arrivals.map((a) => `${a.kind}@${Math.round(a.at)}`), sleeps: window.__stage.stats.sleeps, quietFrames: window.__stage.stats.quietFrames ?? null, glState: window.__stage.glState, tier: window.__stage.tier, url: location.pathname + location.hash }));
  return { kind, ...after, ...r, pass: r.pass && after.arrivals.some((a) => a.startsWith(kind)) };
}

/** Logs every WebGL context made on any canvas, with the page's opt-out (data-gl-page) at that moment. */
const GL_CONTEXTS = `(() => {
  const log = (window.__glContexts = []);
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const had = this.__hctx ?? null;
    const c = gc.call(this, type, attrs);
    if (/webgl/.test(String(type)) && c && !had) log.push({ id: this.id || null, path: location.pathname, glPage: document.documentElement.dataset.glPage ?? null, t: Math.round(performance.now()) });
    if (c) this.__hctx = c;
    return c;
  };
})();`;
export const MISSING_URL = '/work/no-such-print/';

/**
 * Ruling 6031879782 item 3: GL already up may stay alive on a 404 reached by Swup (the one canvas, W-D013), on three
 * conditions: 0 draws on the 404 after the arrival settles (no frame presented after the motion end's first quiet
 * second: the arrival window passes with no restart), the Idle window met, and the same context reused, not rebooted,
 * on the way back (the same context object, no new stage:gl-ready). A new WebGL context made on the 404 fails it.
 * Starts on / with GL up, goes to a missing URL by a keyboard Swup visit, and comes back by the site mark.
 */
async function aliveOn404(page, base) {
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stage?.glState === 'ready', null, { polling: 100, timeout: 15000 }).catch(() => {});
  await waitSettled(page, 15000);
  const glInfo = () => page.evaluate(() => {
    const c = window.__stage.gl?.renderer?.getContext() ?? null;
    return {
      glState: window.__stage.glState, sameContext: c === (window.__h404ctx ?? undefined), contextLost: c ? c.isContextLost() : null,
      contexts: window.__glContexts.length, glReady: window.__stage.marks().filter((m) => m.name === 'stage:gl-ready').length, path: location.pathname,
      draws: window.__gateCounters.draws, planted: window.__planted ?? null,
    };
  });
  await page.evaluate(() => { window.__h404ctx = window.__stage.gl?.renderer?.getContext() ?? null; });
  const before = await glInfo();
  await page.evaluate((href) => {
    const a = document.createElement('a');
    a.href = href;
    a.id = 'h-missing';
    a.textContent = 'a print that is not there';
    document.querySelector('main').append(a);
  }, MISSING_URL);
  await page.focus('#h-missing');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.page === 'notfound', null, { polling: 50, timeout: 10000 });
  const r = await arrivalWindow(page, 'swup');
  const on404 = { ...(await glInfo()), contextsMade: await page.evaluate(() => window.__glContexts.filter((c) => c.glPage === 'off')) };
  await page.focus('a.site-mark');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => location.pathname === '/' && document.documentElement.dataset.page === 'home', null, { polling: 50, timeout: 10000 });
  await page.waitForFunction(() => window.__stage.glState === 'ready', null, { polling: 100, timeout: 15000 }).catch(() => {});
  await waitSettled(page, 15000);
  const back = await glInfo();
  // Reused: the same live context draws / again (a lost context, a new one or a second gl-ready is not reuse).
  const alive = {
    before, on404, back, glUp: before.glState === 'ready' && before.contexts >= 1 && before.contextLost === false,
    settledOn404: r.windowRestarts === 0, noContextOn404: on404.contextsMade.length === 0, drawsBack: back.draws - on404.draws,
    reused: back.glState === 'ready' && back.sameContext && back.contextLost === false && back.contexts === before.contexts && back.glReady === before.glReady && back.draws > on404.draws,
  };
  return { ...r, alive, pass: r.pass && on404.path === MISSING_URL && alive.glUp && alive.settledOn404 && alive.noContextOn404 && alive.reused };
}

/**
 * The arrival rows: a full load of /#contact and of / (W-S1's opening plays: no windowEndS bound after an arrival,
 * ruling 6031879782 item 2), a history Back (a fresh load), a Swup visit, a Swup visit from / with GL up to the 404
 * (ruling 6031879782 item 3) and, in Chromium, a bfcache restore. opts.cases runs a subset; opts.plant adds an init
 * script (the negative controls).
 */
export async function arrivals(base, profiles, opts = {}) {
  const rows = [];
  const target = opts.route ?? '/#contact';
  for (const profile of profiles) {
    const all = ['load', 'load-home', 'back', 'swup', 'swup-404', ...(PROFILES[profile].browser === 'chromium' && profile === 'D2' ? ['bfcache'] : [])];
    const cases = opts.cases ? all.filter((k) => opts.cases.includes(k)) : all;
    for (const kind of cases) {
      const ctx = await newContext(profile, 'auto', kind === 'bfcache' ? { browser: 'chromium-bfcache' } : {});
      await ctx.addInitScript({ content: INIT });
      if (kind === 'swup-404') await ctx.addInitScript({ content: GL_CONTEXTS });
      if (opts.plant) await ctx.addInitScript({ content: opts.plant });
      const page = await ctx.newPage();
      let r;
      try {
        if (kind === 'load' || kind === 'load-home') {
          await page.goto(base + (kind === 'load' ? target : '/'), { waitUntil: 'load' });
          r = await arrivalWindow(page, 'load');
        } else if (kind === 'back') {
          await page.goto(base + target, { waitUntil: 'load' });
          await waitSettled(page, 15000);
          await page.goto(`${base}/work/project-02/`, { waitUntil: 'load' });
          await waitSettled(page, 15000);
          await page.goBack({ waitUntil: 'load' });
          r = await arrivalWindow(page, 'load');
        } else if (kind === 'bfcache') {
          await page.goto(base + target, { waitUntil: 'load' });
          await waitSettled(page, 15000);
          await page.goto(`${base}/work/project-02/`, { waitUntil: 'load' });
          await waitSettled(page, 15000);
          await page.goBack({ waitUntil: 'commit' }); // a bfcache restore fires pageshow, not load
          r = await arrivalWindow(page, 'bfcache');
        } else if (kind === 'swup-404') {
          r = await aliveOn404(page, base);
        } else {
          // A Swup visit by keyboard (no pointer move after it): the nav's Work link (/#work) from a project page.
          await page.goto(`${base}/work/project-01/`, { waitUntil: 'load' });
          await waitSettled(page, 15000);
          await page.focus('a[data-nav="work"]');
          await page.keyboard.press('Enter');
          await page.waitForFunction(() => location.pathname === '/' && document.documentElement.dataset.page === 'home', null, { polling: 50, timeout: 10000 });
          r = await arrivalWindow(page, 'swup');
        }
      } catch (e) {
        r = { kind, pass: false, error: String(e?.message || e).slice(0, 300) };
      }
      await ctx.close();
      rows.push({ profile, case: kind, ...r });
    }
  }
  return { rows, pass: rows.length > 0 && rows.every((x) => x.pass) };
}

/**
 * Step 6 (round-5 must-fix lenis-native-velocity; Breaker 4.1 #1, perf rows 28 and 29): on the full tier (Lenis on), a
 * finger on the lens ring 250 to 550 ms into a 120 px wheel glide. Lenis (syncTouch off) turns 'native' and stops its
 * glide without a reset, so no scroll event follows to clear it: the motion must still end within windowEndS of the
 * touch, and the window must read 0 rAF and 0 draws, with at most TOUCH_TAIL_MAX_RENDERS stage renders after the touch
 * (a stage that renders every frame until the governor demotes it would otherwise settle for the wrong reason, as
 * WebKit did on 8a9e8e8: 28 to 32 renders, then lite).
 * Chromium D2 with real touches over CDP in a mouse context (a touchscreen laptop: the head script picks full); WebKit
 * D3 (1280x800, mouse: full) with the page's own TouchEvent sequence on the ring, which Lenis reads as it reads a real
 * one. Controls: the same glide with no touch, and a touch at rest (no glide).
 */
export const TOUCH_TAIL_PROFILES = [['D2', 'chromium'], ['D3', 'webkit']];
export const TOUCH_TAIL_CASES = [['tail-250', 250], ['tail-400', 400], ['tail-550', 550], ['no-touch', null], ['touch-at-rest', 0]];
/**
 * Stage renders allowed after the touch: the glide's last step that was in flight and its present tail (PRESENT_TAIL
 * 2, REANCHOR_TAIL 3) with room to spare; a stage held awake renders every frame (about 45 or more before a governor
 * step at 60 Hz, hundreds at 240 Hz).
 */
const TOUCH_TAIL_MAX_RENDERS = 12;
/**
 * A finger dragging the ring sideways (8 moves of +10 px x and +1 px y, as on the lens ring). Chromium: real touches
 * over CDP, sent when the caller says. WebKit has no trusted touch input: the page dispatches its own TouchEvent
 * sequence, in the task after a frame (the frame's rAF callbacks, where the ticker steps Lenis's glide, then the touch),
 * at the first frame from `atPage` on where the glide is still running (html.lenis-smooth) and its last step did not
 * move the page's integer scroll position (the glide's sub-pixel tail at DPR 1: no scroll event follows such a step,
 * which is what leaves Lenis 'native' for good; a step that moves the page fires a scroll event that clears it, so a
 * touch timed blind lands on a clearing step at random). At `latestPage` (550 ms into the glide), or once the glide
 * ended, it fires anyway and says it was not aligned.
 */
async function dragRing(page, cdp, pt, atPage = 0, latestPage = atPage) {
  if (cdp) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x + i * 10, y: pt.y + i }] });
      await sleep(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    return { input: 'CDP touch', at: null };
  }
  return page.evaluate(({ pt, atPage, latestPage }) => new Promise((resolve) => {
    const fire = (aligned) => {
      const el = document.elementFromPoint(pt.x, pt.y) || document.body;
      const mk = (type, x, y, ended) => {
        let t = null;
        try {
          t = new Touch({ identifier: 7, target: el, clientX: x, clientY: y, pageX: x, pageY: y + scrollY, screenX: x, screenY: y });
        } catch {
          t = null;
        }
        const init = { bubbles: true, cancelable: true, composed: true, touches: ended || !t ? [] : [t], targetTouches: ended || !t ? [] : [t], changedTouches: t ? [t] : [] };
        let ev;
        try {
          ev = new TouchEvent(type, init);
        } catch {
          ev = new Event(type, init);
        }
        if (!t) Object.defineProperty(ev, 'targetTouches', { value: ended ? [] : [{ clientX: x, clientY: y }] });
        return ev;
      };
      const at = performance.now();
      el.dispatchEvent(mk('touchstart', pt.x, pt.y));
      for (let i = 1; i <= 8; i++) el.dispatchEvent(mk('touchmove', pt.x + i * 10, pt.y + i));
      el.dispatchEvent(mk('touchend', pt.x + 80, pt.y + 8, true));
      resolve({ input: `page TouchEvent (${typeof Touch === 'function' ? 'Touch' : 'plain'})${aligned ? ', at a sub-pixel glide step' : ', not aligned'}`, at, aligned });
    };
    let prevY = scrollY;
    const tick = () => {
      const now = performance.now();
      const gliding = document.documentElement.classList.contains('lenis-smooth');
      const still = scrollY === prevY;
      prevY = scrollY;
      if (now >= atPage && gliding && still) setTimeout(() => fire(true), 0);
      else if (now >= atPage && (!gliding || now >= latestPage)) setTimeout(() => fire(false), 0);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { pt, atPage, latestPage });
}
export async function touchTail(base, opts = {}) {
  const rows = [];
  const cases = opts.cases ? TOUCH_TAIL_CASES.filter(([k]) => opts.cases.includes(k)) : TOUCH_TAIL_CASES;
  for (const [profile, engine] of TOUCH_TAIL_PROFILES) {
    for (const [kase, at] of cases) {
      const ctx = await newContext(profile, 'auto', { browser: engine });
      await ctx.addInitScript({ content: INIT });
      const page = await ctx.newPage();
      let r;
      try {
        await page.goto(`${base}/`, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__stage?.glState === 'ready', null, { polling: 100, timeout: 20000 }).catch(() => {});
        await waitSettled(page, 20000);
        await sleep(500);
        const state = () => page.evaluate(() => ({ tier: window.__stage.tier, lenis: document.documentElement.classList.contains('lenis'), lenisScrolling: document.documentElement.classList.contains('lenis-scrolling'), governorSteps: window.__stage.stats.governorSteps, sleeps: window.__stage.stats.sleeps, draws: window.__stage.stats.draws, settled: window.__stage.settled, y: Math.round(scrollY) }));
        const before = await state();
        const ring = await page.evaluate(() => {
          const el = document.querySelector(".hero-hit[data-drag='lens']");
          if (!el || getComputedStyle(el).display === 'none') return null;
          const b = el.getBoundingClientRect();
          return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
        });
        const { width, height } = page.viewportSize();
        const pt = ring ?? { x: Math.round(width / 2), y: Math.round(height / 2) };
        const cdp = engine === 'chromium' ? await ctx.newCDPSession(page) : null;
        const since = await page.evaluate(() => performance.now());
        let touchMs = null;
        let input = 'wheel only';
        let aligned = null;
        if (at !== 0) {
          await page.mouse.move(pt.x, pt.y);
          const wheelAt = await page.evaluate(() => performance.now());
          const t0 = Date.now();
          await page.mouse.wheel(0, 120);
          if (at !== null) {
            if (!cdp) {
              const d = await dragRing(page, null, pt, wheelAt + at, wheelAt + Math.max(at, 550));
              input = d.input;
              touchMs = Math.round(d.at - wheelAt);
              aligned = d.aligned;
            } else {
              await sleep(Math.max(0, at - (Date.now() - t0)));
              touchMs = Date.now() - t0;
              input = (await dragRing(page, cdp, pt)).input;
            }
          }
        } else {
          touchMs = 0;
          input = (await dragRing(page, cdp, pt)).input;
        }
        const afterTouch = await state();
        const w = await motionWindow(page, since);
        const after = await state();
        // A touch stops the glide, so the stage has next to nothing left to render after it (a frame or two and their
        // present tail). A stage held awake renders every frame instead, until the governor demotes it and Lenis goes
        // (WebKit on 8a9e8e8: the motion then ends for the wrong reason, the tier lost), so the renders after the touch
        // are counted. A governor step with few renders after the touch is WebKit's own slow headless frames (perf row
        // 30, pre-existing on main): recorded, not failed here.
        const rendersAfterTouch = at === null ? null : after.draws - afterTouch.draws - (w.stageInWindow?.renders ?? 0);
        const quiet = at === null || rendersAfterTouch <= TOUCH_TAIL_MAX_RENDERS;
        r = { case: kase, touchAtMs: touchMs, input, aligned, ring: Boolean(ring), before, afterTouch, after, rendersAfterTouch, quietAfterTouch: quiet, keptFull: after.tier === 'full' && after.lenis, ...w, pass: w.pass && quiet && before.tier === 'full' && before.lenis };
      } catch (e) {
        r = { case: kase, pass: false, error: String(e?.message || e).slice(0, 300) };
      }
      await ctx.close();
      rows.push({ profile: `${profile}@${engine}`, ...r });
    }
  }
  return { rows, pass: rows.length > 0 && rows.every((x) => x.pass) };
}

export async function run(opts = {}) {
  const profiles = String(opts.profiles || 'D2,P2,WK-P2').split(',');
  // --arrivals-only runs step 5 alone, --touch-tail-only step 6 alone (the other steps keep their own routes).
  const routes = opts['arrivals-only'] || opts['touch-tail-only'] ? [] : String(opts.routes || '/,/bench/').split(',');
  const srv = await serve(opts.dist ? String(opts.dist) : undefined);
  const rows = [];
  let arrivalStep = null;
  let touchTailStep = null;
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
        const scrollPass = scroll.gate.rectReadsInRaf === 0 && scroll.gate.layoutReadsInRaf === 0;

        rows.push({
          profile, route, tier: await page.evaluate(() => window.__stage.tier), gl, empty,
          idle, idlePass, afterScroll, afterScrollPass, active, matchPass, emptyPass, scroll, scrollPass,
          pass: idlePass && afterScrollPass && matchPass && emptyPass && scrollPass,
        });
        await ctx.close();
      }
    }
    if (!opts['no-arrivals'] && !opts['touch-tail-only']) arrivalStep = await arrivals(srv.base, profiles);
    if (!opts['no-touch-tail'] && !opts['arrivals-only']) touchTailStep = await touchTail(srv.base, { cases: opts['touch-tail-cases'] ? String(opts['touch-tail-cases']).split(',') : undefined });
  } finally {
    await srv.close();
  }
  const pass = rows.every((r) => r.pass) && (arrivalStep ? arrivalStep.pass : true) && (touchTailStep ? touchTailStep.pass : true);
  return {
    schema: 6, instrument: 'counters', touchTail: touchTailStep,
    touchTailSummary: touchTailStep?.rows.map((r) => `${r.profile} ${r.case}: ${r.pass ? 'pass' : 'FAIL'} (touch +${r.touchAtMs ?? '-'} ms, motion ends +${r.motionEndsMs} ms by ${r.motionEndsBy}, window raf ${r.afterMotion?.raf} draws ${r.afterMotion?.draws}, tier ${r.after?.tier}${r.error ? `, ${r.error}` : ''})`).join(' | ') ?? null,
    motionEndWindow: `${WINDOW_START_MS / 1000} s + max(2 frames, ${TOLERANCE_FLOOR_MS} ms) to ${WINDOW_END_MS / 1000} s after the motion end: the later of the last input event (scroll, wheel, pointer, key), the last arrival (load, bfcache restore, Swup visit end) and the last presented frame (draws through any entry point and clears, tail and clear-only frames included); after an input the motion must end within ${WINDOW_END_MS / 1000} s of it, after an arrival there is no ${WINDOW_END_MS / 1000} s bound, and a motion still presenting ${HARD_STOP_MS / 1000} s after the anchor fails (Orchestrator rulings on #11, 5992928262, 6030949628 and 6031879782)`,
    pass, rows, arrivals: arrivalStep,
    arrivalSummary: arrivalStep?.rows.map((r) => `${r.profile} ${r.case}: ${r.pass ? 'pass' : 'FAIL'} (motion ends by ${r.motionEndsBy} +${r.motionEndsMs} ms after the ${r.anchor ?? '?'}, last rAF +${r.lastRafAfterMotionMs} ms, window raf ${r.afterMotion?.raf} draws ${r.afterMotion?.draws}${r.error ? `, ${r.error}` : ''})`).join(' | ') ?? null,
    summary: rows.map((r) => `${r.profile} ${r.route}: idle raf ${r.idle.afterMotion.raf} draws ${r.idle.afterMotion.draws} (ends +${r.idle.motionEndsMs} ms); after ${r.afterScroll.input} (motion ends +${r.afterScroll.motionEndsMs} ms by ${r.afterScroll.motionEndsBy}, last rAF +${r.afterScroll.lastRafAfterMotionMs} ms after it) raf ${r.afterScroll.afterMotion.raf} draws ${r.afterScroll.afterMotion.draws} bound ${r.afterScroll.bound.pass ? 'ok' : 'FAIL'} [from input: raf ${r.afterScroll.afterInput.raf}]; active raf ${r.active.gate.raf - r.active.gate.rafFromDependencies}=${r.active.stage.ticks} draws ${r.active.gate.draws}=${r.active.stage.drawCalls}${r.empty ? `, empty page renders ${r.active.stage.renders} clears ${r.active.gate.clears} skips ${r.active.stage.renderSkips}` : ''}; scroll rect-in-raf ${r.scroll.gate.rectReadsInRaf}`).join(' | '),
  };
}

await cliMain(import.meta.url, run);
