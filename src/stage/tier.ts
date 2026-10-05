// Render tiers (W-D017): full, lite, static. The head script in src/layouts/Base.astro picks the starting tier
// before first paint from WebGL2 (a context it can create, #61: else static, reason 'no-webgl2'), (pointer: fine)
// and (hover: hover), Save-Data and ?tier=. The GL boot probe can demote full to lite; the governor steps down one
// tier at a time and never back up; two context losses in 60 s end at static. Core counts and touch-point counts are
// never read.
import { mark, stats } from './state.ts';

export type Tier = 'full' | 'lite' | 'static';
const RANK: Record<Tier, number> = { static: 0, lite: 1, full: 2 };
const html = document.documentElement;
const listeners = new Set<(t: Tier, reason: string) => void>();

const initial = html.dataset.tier;
let current: Tier = initial === 'full' || initial === 'lite' || initial === 'static' ? initial : 'static';
let reason = new URLSearchParams(location.search).has('tier') ? 'override' : html.dataset.tierReason || 'detect';
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
  for (const fn of listeners) fn(to, why);
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
const frames: number[] = [];
/** Feed the interval of every frame that rendered. 45 frames averaging over 22 ms step down one tier. */
export function governorSample(frameMs: number): void {
  if (current === 'static') return;
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
