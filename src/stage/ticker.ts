// The one ticker (W-D002): the only rAF call site in src/ (schedule() below). Frame order:
//   before hooks (lenis.raf, anime engine.update) -> read scrollY once -> re-measure if dirty -> step springs and
//   entities -> return if idle -> else place and render.
// It renders only when something moved, skips the render on idle frames and detaches after 1 s of idle, so a page at
// rest costs 0 rAF callbacks and 0 draws. Any module wakes it with invalidate().
import { durations } from '../lib/tokens.js';
import { flags, guard, mark, now, stats } from './state.ts';
import { governorAfterRestore, governorReset, governorSample } from './tier.ts';
import { anyActive, bindWake } from './timelines.ts';
import { readScroll } from './scroll.ts';

type Hook = (time: number) => void;
type Step = (dt: number, time: number, sy: number) => boolean | void;

const before: Hook[] = [];
const steps: Step[] = [];
const activeChecks: (() => boolean)[] = [];
const afterFrame: (() => void)[] = [];
const idleListeners = new Set<() => void>();
/** The render: `tail` is true on a frame that only presents again what the last frame drew (presentTail). */
type Render = (sy: number, tail: boolean) => void;
let render: Render | null = null;
let measure: (() => void) | null = null;
/** Frames still to present after the last frame that drew something new. */
let tail = 0;

let running = false;
let need = true;
let dirty = false;
let inFrame = false;
let lastTime = 0;
let lastActive = 0;
let interval = 1000 / 60;
let prevActive = false;
let idleMarks = 0;

/** Called before scrollY is read: Lenis writes scrollTop here, anime advances its timelines. */
export function onBefore(fn: Hook): () => void {
  before.push(fn);
  return () => before.splice(before.indexOf(fn), 1);
}
/** Step springs or entities. Return true while still moving. */
export function onStep(fn: Step): () => void {
  steps.push(fn);
  return () => steps.splice(steps.indexOf(fn), 1);
}
/** Extra 'still busy' signals (Lenis inertia, anime timelines). */
export function onActive(fn: () => boolean): () => void {
  activeChecks.push(fn);
  return () => activeChecks.splice(activeChecks.indexOf(fn), 1);
}
export function setRender(fn: Render | null): void {
  render = fn;
  if (!fn) tail = 0;
}
/**
 * Present the next `frames` frames again, even when nothing moves (#61): WebKit shows a canvas one frame late, so a
 * change that renders once and then sleeps would stay on its old frame there. A tail frame renders the same scene
 * through the one render path, counts as a rendered frame (stats.draws, the governor) and never starts a new tail.
 */
export function presentTail(frames: number): void {
  if (frames > tail) tail = frames;
  wake();
}
export function setMeasure(fn: () => void): void {
  measure = fn;
}
export function onIdle(fn: () => void): () => void {
  idleListeners.add(fn);
  return () => idleListeners.delete(fn);
}
/** Run once after the next frame's work (for 'after the next paint' work, chain a task from it). */
export function afterNextFrame(fn: () => void): void {
  afterFrame.push(fn);
  wake();
}

export function isRunning(): boolean {
  return running;
}
export function isInFrame(): boolean {
  return inFrame;
}

/** Start the loop if it sleeps. Waking alone renders nothing; it keeps frames coming for up to 1 s. */
export function wake(): void {
  lastActive = now();
  if (running || flags.manualClock) return;
  running = true;
  lastTime = 0;
  stats.wakes++;
  schedule();
}
/** Something visible changed: render on the next frame. */
export function invalidate(): void {
  need = true;
  wake();
}
/** Layout changed outside a ResizeObserver callback: re-measure slots on the next frame, then render. */
export function markDirty(): void {
  dirty = true;
  invalidate();
}
/**
 * Layout moved a slot and the rects are already re-measured: render now, outside rAF, through the same render path as
 * a frame (counted in stats.draws and drawCalls). Called from the slots ResizeObserver callback, which runs after
 * layout and before paint, so GL and the DOM change in the same presented frame instead of GL following a frame late.
 * Scroll is read as a frame reads it, after any scroll anchoring the layout applied. Inside a frame (a re-measure the
 * ticker ran) or before GL is up, the next frame renders as usual.
 */
export function renderNow(): void {
  if (inFrame || !render) {
    invalidate();
    return;
  }
  const draws = stats.draws;
  const r = render;
  // Guarded like a frame's render: a throw is reported, counted in stats.hookErrors, and the next frame still runs.
  guard(() => r(readScroll(), false), undefined);
  if (stats.draws > draws) stats.layoutRenders++;
}
bindWake(invalidate);

/**
 * A gap is not a busy frame (W-D017; Breaker 3.3 #2, perf row 29): a page frozen in the back/forward cache or a hidden
 * tab stops rAF mid-motion, and the first frame after it would otherwise feed the governor one interval of seconds (a
 * 3 s stay stepped full to lite every time) and step the springs by the gap. Leaving and coming back start the frame
 * clock afresh: the next frame steps 1/60 s and samples nothing.
 */
function resumeClock(): void {
  lastTime = 0;
  prevActive = false;
  governorReset();
}
/** A WebGL context restore starts the frame clock afresh too (perf row 33; the governor's rebuild grace: tier.ts). */
export function restartClock(): void {
  resumeClock();
  governorAfterRestore();
}
addEventListener('pageshow', (e) => {
  if (e.persisted) resumeClock();
});
addEventListener('pagehide', resumeClock);
document.addEventListener('visibilitychange', resumeClock);

function schedule(): void {
  requestAnimationFrame(onFrame);
}
function onFrame(): void {
  stats.ticks++;
  try {
    frame(now());
  } finally {
    if (running) schedule();
  }
}

/**
 * One crew's hook that throws must not stop the one ticker (guard, state.ts): the error is reported and counted in
 * stats.hookErrors, and the hook counts as idle for this frame, so the loop still renders the rest and still detaches
 * when nothing moves.
 */
export { guard };

function spin(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* ?busy= only: a forced slow frame for the governor test */
  }
}

/** One frame of stage work at stage time `time`. Exported for __stage.seek (manual clock). */
export function frame(time: number): void {
  inFrame = true;
  try {
    const dt = lastTime ? Math.min(Math.max((time - lastTime) / 1000, 0), 0.05) : 1 / 60;
    if (lastTime) interval = time - lastTime;
    lastTime = time;
    for (const fn of before) guard(() => fn(time), undefined);
    const sy = readScroll();
    if (dirty && measure) {
      const m = measure;
      dirty = false;
      guard(() => m(), undefined);
      stats.measuresInTick++;
      need = true;
    }
    // Motion someone reports: a step, a timeline or an active check (Lenis inertia, anime).
    let moving = false;
    for (const fn of steps) if (guard(() => fn(dt, time, sy), false)) moving = true;
    if (anyActive()) moving = true;
    for (const fn of activeChecks) if (guard(() => fn(), false)) moving = true;
    const active = need || moving;
    need = false;

    // A frame with nothing new still renders while a present tail is owed (presentTail).
    const tailFrame = !active && tail > 0 && render !== null;
    if (tailFrame) tail--;
    if (active || tailFrame) {
      if (flags.busyMs) spin(flags.busyMs);
      const drawn = stats.draws;
      const r = render;
      if (r) guard(() => r(sy, tailFrame), undefined);
      if (tailFrame) stats.tailFrames++;
      // Activity is what reaches the screen (round-4 must-fix zero-width-grid): motion someone reports, or a frame the
      // render presented. A frame that ran only because something asked for a render that then presented nothing (a
      // collapsed canvas, a tail on it, nothing to draw on a canvas already clear) leaves lastActive where it was, so
      // it never holds the ticker past the idle window that the gate counts from the last presented frame.
      if (moving || stats.draws > drawn) lastActive = time;
      else stats.quietFrames++;
      if (prevActive) governorSample(interval);
    } else {
      governorReset();
    }
    prevActive = active || tailFrame;
    while (afterFrame.length) {
      const fn = afterFrame.shift();
      if (fn) guard(fn, undefined);
    }

    // Detach on the frame that would otherwise run past 1 s of idle.
    if (!active && time + interval * 1.5 - lastActive >= durations.idleDetach) sleep();
  } finally {
    inFrame = false;
  }
}

function sleep(): void {
  running = false;
  prevActive = false;
  stats.sleeps++;
  if (idleMarks++ < 20) mark('stage:idle');
  for (const fn of idleListeners) guard(fn, undefined);
}
