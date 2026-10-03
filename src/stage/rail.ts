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
  // The CSS height follows the buffer, measured once here: if lvh moved later without a reallocation (a height-only
  // change on a coarse pointer), a CSS-driven height would stretch the old buffer and slide GL off its slots.
  canvas.style.blockSize = `${Hc}px`;
  anchored = false;
  stats.reallocs++;
  stats.dpr = dpr;
  stats.canvasPx = Math.round(W * dpr) * Math.round(Hc * dpr);
  return 'realloc';
}

let anchored = false;
/**
 * Keep the canvas over the viewport. The canvas rides the document, so while the viewport stays inside it nothing
 * moves: no transform change and no change in where prints sit on it, which keeps GL glued even where an engine
 * presents a canvas transform and its pixels a frame apart. When the viewport would leave it, the canvas re-anchors
 * at the scroll position with its overscan toward the scroll direction. Device-pixel aligned; style write only.
 */
export function place(sy: number, dir: 1 | -1): number {
  view.side = dir;
  const covered = anchored && sy >= view.anchor && sy + view.H <= view.anchor + view.Hc;
  if (!covered) {
    const raw = dir > 0 ? sy : sy - Math.max(0, view.Hc - view.H);
    const anchor = Math.max(0, Math.round(raw * view.dpr) / view.dpr);
    canvas.style.insetBlockStart = `${anchor}px`;
    view.anchor = anchor;
    anchored = true;
  }
  return view.anchor;
}
/** After a swap or a resize the old anchor means nothing: the next render places the canvas afresh. */
export function reanchor(): void {
  anchored = false;
}

/** The handoff drip is the only moment GL paints above content (z 41, W-D013). */
export function raise(kind: 'drip'): void {
  html.dataset.rail = kind;
}
export function lower(): void {
  delete html.dataset.rail;
}
