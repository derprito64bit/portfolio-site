// The one ticker (W-D002): the only rAF call site in src/ (schedule() below). Frame order:
//   before hooks (lenis.raf, anime engine.update) -> read scrollY once -> re-measure if dirty -> step springs and
//   entities -> return if idle -> else place and render.
// It renders only when something moved, skips the render on idle frames and detaches after 1 s of idle, so a page at
// rest costs 0 rAF callbacks and 0 draws. Any module wakes it with invalidate().
import { durations } from '../lib/tokens.js';
import { flags, mark, now, stats } from './state.ts';
import { governorReset, governorSample } from './tier.ts';
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
  render(readScroll(), false);
  if (stats.draws > draws) stats.layoutRenders++;
}
bindWake(invalidate);

function schedule(): void {
  requestAnimationFrame(onFrame);
}
function onFrame(): void {
  stats.ticks++;
  frame(now());
  if (running) schedule();
}

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
    for (const fn of before) fn(time);
    const sy = readScroll();
    if (dirty && measure) {
      dirty = false;
      measure();
      stats.measuresInTick++;
      need = true;
    }
    let active = need;
    need = false;
    for (const fn of steps) if (fn(dt, time, sy)) active = true;
    if (anyActive()) active = true;
    for (const fn of activeChecks) if (fn()) active = true;

    // A frame with nothing new still renders while a present tail is owed (presentTail).
    const tailFrame = !active && tail > 0 && render !== null;
    if (tailFrame) tail--;
    if (active || tailFrame) {
      lastActive = time;
      if (flags.busyMs) spin(flags.busyMs);
      render?.(sy, tailFrame);
      if (tailFrame) stats.tailFrames++;
      if (prevActive) governorSample(interval);
    } else {
      governorReset();
    }
    prevActive = active || tailFrame;
    while (afterFrame.length) afterFrame.shift()?.();

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
  for (const fn of idleListeners) fn();
}
