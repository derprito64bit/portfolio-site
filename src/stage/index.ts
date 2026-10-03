// The stage (W-F). Boots once per visit from the layout and outlives every Swup swap. Crews import from here:
// the ticker hooks, slots, effects, the flash limiter, the motion axis, tiers, the status region and GL (whenGL).
// Test hooks live on window.__stage (W-D030): settled, seek(ms) (only behind ?t=), bounds(id), stats.
import { flags, logMotion, mark, setManualNow, stats, type MotionEntry } from './state.ts';
import { demote, getTier, onTier, tierLog, tierReason } from './tier.ts';
import { getMotion, isReduced, onMotion, setMotion } from './motion.ts';
import { frame, invalidate, isRunning, markDirty, onIdle, onStep, setMeasure, wake } from './ticker.ts';
import { allSlots, getSlot, give, measureAll, scan, slotRect, take } from './slots.ts';
import { anyActive, finishAll, seekAll, track, tween } from './timelines.ts';
import { bootRouter, routerHooks } from './router.ts';
import { glReady, glState, rescanGLIntent, scheduleGL } from './boot.ts';
import { effects, registerEffect } from './effects.ts';
import { requestFlash } from './flash.ts';
import { announce } from './status.ts';
import { lower, raise, view } from './rail.ts';
import type { GLApi } from './gl/index.ts';

const html = document.documentElement;
if (flags.debug) html.dataset.debug = flags.debug;

// ---------------------------------------------------------------- motion axis: applied live (W-D017)
let lenisMod: typeof import('./lenis.ts') | null = null;
async function syncLenis(): Promise<void> {
  const want = getTier() === 'full' && !isReduced() && glState() === 'ready';
  if (want && !lenisMod) lenisMod = await import('./lenis.ts');
  if (want) lenisMod?.enableLenis();
  else lenisMod?.disableLenis();
}
onMotion((m) => {
  if (m === 'reduced') finishAll(); // running timelines jump to their end in this task, before the next frame
  void syncLenis();
  invalidate();
});
onTier(() => void syncLenis());

// ---------------------------------------------------------------- slots, router, GL
setMeasure(measureAll);
scan(document.getElementById('swup') ?? document);
bootRouter();
routerHooks.onAfterReplace(() => rescanGLIntent());
scheduleGL();
let gl: GLApi | null = null;
glReady.then((api) => {
  gl = api as GLApi;
  void syncLenis();
});

let fontsReady = false;
document.fonts?.ready.then(() => {
  fontsReady = true;
  markDirty();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) invalidate();
});

// ---------------------------------------------------------------- settled (capture waits for this)
const SETTLED_GL = new Set(['off', 'deferred', 'ready', 'failed']);
function isSettled(): boolean {
  return fontsReady && !isRunning() && !anyActive() && SETTLED_GL.has(glState());
}
let settledMarked = false;
onIdle(() => {
  if (!settledMarked && isSettled()) {
    settledMarked = true;
    mark('stage:settled');
  }
});

// ---------------------------------------------------------------- __stage (W-D030 hooks)
function seek(ms: number): Promise<boolean> {
  setManualNow(ms);
  seekAll(ms);
  for (const a of document.getAnimations()) {
    a.pause();
    a.currentTime = ms;
  }
  frame(ms);
  return Promise.resolve(true);
}

const hooks = {
  version: 1,
  get settled(): boolean {
    return isSettled();
  },
  stats,
  get tier() {
    return getTier();
  },
  get tierReason() {
    return tierReason();
  },
  tierLog,
  get motion() {
    return getMotion();
  },
  get glState() {
    return glState();
  },
  get gl(): GLApi | null {
    return gl;
  },
  view,
  bounds(id: string) {
    const s = getSlot(id);
    return s ? { id, kind: s.kind, slot: slotRect(id), gl: gl?.entity(id)?.bounds?.() ?? null } : null;
  },
  seek: flags.manualClock ? seek : undefined,
  slots: () =>
    allSlots().map((s) => ({ id: s.id, kind: s.kind, fixture: s.fixture, cx: s.cx, cy: s.cy, w: s.w, h: s.h, near: s.near, isGl: s.el.classList.contains('is-gl') })),
  marks: () =>
    performance
      .getEntriesByType('mark')
      .filter((m) => m.name.startsWith('stage:'))
      .map((m) => ({ name: m.name, t: Math.round(m.startTime), detail: (m as PerformanceMark).detail ?? null })),
  effects,
  requestFlash,
  announce,
  setMotion,
  invalidate,
  raise,
  lower,
  demote,
  fixtures: undefined as unknown,
};
(window as unknown as { __stage: typeof hooks }).__stage = hooks;

// First frame: measure, then sleep.
wake();

// ---------------------------------------------------------------- the API crews build on
/** Resolves with the GL API once the GL chunk is ready (never on the static tier or a page without GL). */
export function whenGL(): Promise<GLApi> {
  return glReady as Promise<GLApi>;
}
export type { GLApi, MotionEntry };
export {
  announce,
  effects,
  getMotion,
  getSlot,
  getTier,
  give,
  invalidate,
  isReduced,
  logMotion,
  lower,
  markDirty,
  onMotion,
  onStep,
  onTier,
  raise,
  registerEffect,
  requestFlash,
  routerHooks,
  setMotion,
  take,
  track,
  tween,
  wake,
};
