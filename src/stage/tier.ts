// Render tiers (W-D017): full, lite, static. The head script in src/layouts/Base.astro picks the starting tier
// before first paint from WebGL2 (a context it can create, #61: else static, reason 'no-webgl2'), (pointer: fine)
// and (hover: hover), Save-Data and ?tier=. The GL boot probe can demote full to lite; the governor steps down one
// tier at a time and never back up; two context losses in 60 s end at static. Core counts and touch-point counts are
// never read.
import { guard, mark, stats } from './state.ts';

export type Tier = 'full' | 'lite' | 'static';
const RANK: Record<Tier, number> = { static: 0, lite: 1, full: 2 };
const html = document.documentElement;
const listeners = new Set<(t: Tier, reason: string) => void>();

const initial = html.dataset.tier;
let current: Tier = initial === 'full' || initial === 'lite' || initial === 'static' ? initial : 'static';
// The head script's own reason wins: no-webgl2 holds under a ?tier= override too (an override cannot make WebGL2 exist).
let reason = html.dataset.tierReason || (new URLSearchParams(location.search).has('tier') ? 'override' : 'detect');
/** Every demotion, for GES-1 manifests ('a logged probe demotion'). */
export const tierLog: { tier: Tier; reason: string; at: number }[] = [{ tier: current, reason, at: 0 }];

export function getTier(): Tier {
  return current;
}
export function tierReason(): string {
  return reason;
}
export function onTier(fn: (t: Tier, reason: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Step down to `to` (never up). Returns true when the tier changed. */
export function demote(to: Tier, why: string): boolean {
  if (RANK[to] >= RANK[current]) return false;
  current = to;
  reason = why;
  html.dataset.tier = to;
  tierLog.push({ tier: to, reason: why, at: Math.round(performance.now()) });
  if (to === 'static') {
    try {
      if (why === 'context-loss') sessionStorage.setItem('ion.gl-off', '1');
    } catch {
      /* the page is static for this load either way */
    }
  }
  mark('stage:tier', `${to}:${why}`);
  // Each listener on its own (guard): one that throws must not skip GL's teardown on a drop to static.
  for (const fn of listeners) guard(() => fn(to, why), undefined);
  return true;
}

// ---------------------------------------------------------------- pixel caps (budgets.md)
export const CAPS = {
  full: { dpr: 2, px: 4.5e6, msaa: true },
  lite: { dpr: 1.5, px: 1.5e6, msaa: false },
} as const;

/** The device-pixel ratio to render at: the tier's DPR cap, lowered further so the canvas fits the pixel cap. */
export function effectiveDpr(cssW: number, cssH: number, tier: Tier = current): number {
  if (tier === 'static') return 1;
  const cap = CAPS[tier];
  let dpr = Math.min(window.devicePixelRatio || 1, cap.dpr);
  if (cssW * cssH * dpr * dpr > cap.px) dpr = Math.sqrt(cap.px / (cssW * cssH));
  return dpr;
}

// ---------------------------------------------------------------- governor
const WINDOW = 45;
const BUSY_MS = 22;
/** A frame this long is a stall (a rebuild, a blocked main thread), not a steady busy frame. */
const STALL_MS = 100;
/** How long after a WebGL context restore a stall counts as the restore's rebuild. */
const RESTORE_GRACE_MS = 3000;
let restoredAt = Number.NEGATIVE_INFINITY;
const frames: number[] = [];
/**
 * A WebGL context restore (W-D017 prices one loss and restore at the restore itself; two in 60 s go static). The
 * window restarts, and for RESTORE_GRACE_MS a stall restarts it again instead of entering it: after a restore three
 * rebuilds every program and texture on first use, and in WebKit (no parallel compile) that rebuild blocks one frame for
 * 720 to 1,080 ms, about 0.75 s after the restore in the opening of /. One such interval in a 45-frame window averages
 * over 22 ms on its own, so a single loss stepped full to lite (perf row 33, round 4). Steady slow frames (anything up
 * to STALL_MS) still count from the restore on, so a page that is really busy after a restore still steps.
 */
export function governorAfterRestore(): void {
  frames.length = 0;
  restoredAt = performance.now();
}
/** Feed the interval of every frame that rendered. 45 frames averaging over 22 ms step down one tier. */
export function governorSample(frameMs: number): void {
  if (current === 'static') return;
  if (frameMs > STALL_MS && performance.now() - restoredAt < RESTORE_GRACE_MS) {
    frames.length = 0;
    return;
  }
  frames.push(frameMs);
  if (frames.length > WINDOW) frames.shift();
  if (frames.length < WINDOW) return;
  const avg = frames.reduce((a, b) => a + b, 0) / WINDOW;
  if (avg > BUSY_MS) {
    frames.length = 0;
    stats.governorSteps++;
    // A second governor step always ends at static (W-D017).
    demote(stats.governorSteps >= 2 ? 'static' : current === 'full' ? 'lite' : 'static', 'governor');
  }
}
/** Gaps (idle, a hidden tab) are not busy frames. */
export function governorReset(): void {
  frames.length = 0;
}
