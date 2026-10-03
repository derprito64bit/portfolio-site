// The riding canvas (W-D013): one <canvas> in #rail (z 1, outside #swup), translated to the scroll position on
// each render with 0.25 viewport of overscan toward the scroll direction. Width is documentElement.clientWidth;
// height is 100lvh x 1.25. On a coarse pointer the buffer changes only with width or DPR, never height alone.
import { effectiveDpr, getTier } from './tier.ts';
import { stats } from './state.ts';

const OVERSCAN = 0.25;
export const canvas = document.getElementById('gl') as HTMLCanvasElement;
const html = document.documentElement;
const coarse = matchMedia('(pointer: coarse)');

/** Current geometry in CSS px. W x Hc is the canvas; H is the viewport height used by the page camera. */
export const view = { W: 0, H: 0, lvh: 0, Hc: 0, O: 0, dpr: 1, anchor: 0, side: 1 as 1 | -1 };

let probe: HTMLDivElement | null = null;
function measureLvh(): number {
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;inset-block-start:0;inline-size:0;block-size:100lvh;visibility:hidden;pointer-events:none';
    document.body.append(probe);
  }
  return probe.offsetHeight || window.innerHeight;
}

/**
 * Re-read the viewport. Returns 'realloc' when the drawing buffer must change size, 'height' for a height-only
 * change (the page camera re-centres, the buffer stays), or 'none'.
 */
export function measureViewport(): 'realloc' | 'height' | 'none' {
  const W = html.clientWidth;
  const H = window.innerHeight;
  const widthOrDprChanged = W !== view.W || effectiveDpr(W, view.Hc || H * 1.25) !== view.dpr;
  if (!widthOrDprChanged && coarse.matches && view.W) {
    if (H === view.H) return 'none';
    view.H = H;
    return 'height';
  }
  const lvh = measureLvh();
  const Hc = Math.round(lvh * 1.25);
  const dpr = effectiveDpr(W, Hc, getTier());
  const changed = W !== view.W || Hc !== view.Hc || dpr !== view.dpr;
  const prevH = view.H;
  Object.assign(view, { W, H, lvh, Hc, O: Math.round(H * OVERSCAN), dpr });
  if (!changed) return H === prevH ? 'none' : 'height';
  stats.reallocs++;
  stats.dpr = dpr;
  stats.canvasPx = Math.round(W * dpr) * Math.round(Hc * dpr);
  return 'realloc';
}

/** Move the canvas to the scroll position. Device-pixel aligned, so nothing resamples. Style write only. */
export function place(sy: number, dir: 1 | -1): number {
  view.side = dir;
  const raw = dir > 0 ? sy : sy - view.O;
  const anchor = Math.round(raw * view.dpr) / view.dpr;
  if (anchor !== view.anchor || !canvas.style.transform) canvas.style.transform = `translate3d(0,${anchor}px,0)`;
  view.anchor = anchor;
  return anchor;
}

/** The handoff drip is the only moment GL paints above content (z 41, W-D013). */
export function raise(kind: 'drip'): void {
  html.dataset.rail = kind;
}
export function lower(): void {
  delete html.dataset.rail;
}
