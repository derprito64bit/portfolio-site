// The riding canvas (W-D013): one <canvas> in #rail (z 1, outside #swup), translated to the scroll position on
// each render with 0.25 viewport of overscan: three quarters of it toward the scroll direction, a quarter behind.
// Width (W-D013 as amended, Orchestrator ruling on #11, 5992943706): the laid-out width of the canvas's containing
// block, #rail's clientWidth, which equals body.clientWidth. html.clientWidth ignores a reserved scrollbar gutter on a
// page that does not scroll (Chrome, classic scrollbars: 1440 against a 1425 px layout), so it is only the fallback
// when #rail has no box (display: none). A 0 px box is kept finite by gridDpr and gridHeight. Height is 100lvh x 1.25.
// The canvas is laid out at exactly W x Hc CSS px (inline styles written on each reallocation).
// On a coarse pointer the buffer changes only with width or DPR, never height alone.
import { effectiveDpr, getTier } from './tier.ts';
import { stats } from './state.ts';

const OVERSCAN = 0.25;
/** Share of the overscan kept behind the viewport on a re-anchor (about 53 px of 211 at 390 x 844). */
const TRAIL = 0.25;
/** Frames of scroll the compositor may be ahead of the main thread; the slack kept ahead before a re-anchor. */
const LEAD = 2;
export const canvas = document.getElementById('gl') as HTMLCanvasElement;
const html = document.documentElement;
const coarse = matchMedia('(pointer: coarse)');

/** Current geometry in CSS px. W x Hc is the canvas; H is the viewport height used by the page camera. */
export const view = { W: 0, H: 0, lvh: 0, Hc: 0, O: 0, dpr: 1, anchor: 0, side: 1 as 1 | -1 };

/**
 * The canvas grid (#59 item 3, #61 item 2). three sizes the buffer as floor(css px x pixel ratio), and the compositor
 * stretches it over the CSS box, so at a fractional DPR the buffer grid and a dpr grid drift apart (T1, lite: 948 px
 * for 1024 CSS px is 1.0802 CSS px per pixel, not 1 / 0.92609). The stage therefore renders at gridDpr, the DPR at which
 * W is a whole number of buffer pixels, and gives the canvas a CSS height of a whole number of them: one buffer pixel
 * is then exactly 1 / view.dpr CSS px both ways, and every snap to the view.dpr grid lands on buffer pixels. Both only
 * ever go down (by under a pixel), so the tier's pixel cap still holds. The 1e-6 keeps three's floor() on the intended
 * whole number when the product rounds a hair under it.
 */
const EPS = 1e-6;
/**
 * A collapsed box (an iframe or an embed laid out at 0 px wide, or a page laid out before it has a width) has no grid:
 * the DPR stays the tier's and the canvas height its own, so the geometry stays finite and the stage still sleeps.
 */
export function gridDpr(W: number, dpr: number): number {
  if (!(W > 0) || !(dpr > 0)) return dpr > 0 ? dpr : 1;
  return (Math.max(1, Math.floor(W * dpr + EPS)) + EPS) / W;
}
export function gridHeight(cssH: number, dpr: number): number {
  if (!(cssH > 0) || !(dpr > 0)) return Math.max(0, cssH || 0);
  return (Math.max(1, Math.floor(cssH * dpr + EPS)) + EPS) / dpr;
}
/** True while the canvas has no area to draw into (W or Hc is 0): the stage then renders nothing. */
export function collapsed(): boolean {
  return !(view.W > 0) || !(view.Hc > 0);
}
/** The canvas height before the grid (round(lvh x 1.25)): the pixel cap is computed on it, so it never moves the DPR. */
let rawHc = 0;

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
  // #rail's laid-out width; html.clientWidth only when #rail has no box. A 0 px box stays 0 (the collapsed case).
  const rail = canvas.parentElement;
  const W = rail && rail.getClientRects().length ? rail.clientWidth : html.clientWidth;
  const H = window.innerHeight;
  const widthOrDprChanged = W !== view.W || gridDpr(W, effectiveDpr(W, rawHc || H * 1.25)) !== view.dpr;
  if (!widthOrDprChanged && coarse.matches && view.W) {
    if (H === view.H) return 'none';
    view.H = H;
    return 'height';
  }
  const lvh = measureLvh();
  rawHc = Math.round(lvh * 1.25);
  const dpr = gridDpr(W, effectiveDpr(W, rawHc, getTier()));
  const Hc = gridHeight(rawHc, dpr);
  const changed = W !== view.W || Hc !== view.Hc || dpr !== view.dpr;
  const prevH = view.H;
  Object.assign(view, { W, H, lvh, Hc, O: Math.round(H * OVERSCAN), dpr });
  if (!changed) return H === prevH ? 'none' : 'height';
  // The CSS height follows the buffer, measured once here: if lvh moved later without a reallocation (a height-only
  // change on a coarse pointer), a CSS-driven height would stretch the old buffer and slide GL off its slots.
  canvas.style.blockSize = `${Hc}px`;
  // So does the CSS width (round-5 must-fix canvas-grid-fractional-width; W-D013 as amended: the canvas width is #rail's
  // clientWidth, word for word). clientWidth is a whole number, while 100% of #rail is its fractional laid-out width at
  // a fractional DSF or zoom (1351.43 against 1351 at 1.75), which stretched the W-gridded buffer by up to 0.43 CSS px
  // and broke 'one buffer pixel is 1 / view.dpr CSS px' (#59 item 3). #rail clips the sub-pixel remainder.
  canvas.style.inlineSize = `${W}px`;
  anchored = false;
  stats.reallocs++;
  stats.dpr = dpr;
  // three.js sizes the buffer with Math.floor(css px x pixel ratio); the stat matches what the GPU allocates.
  stats.canvasPx = Math.floor(W * dpr) * Math.floor(Hc * dpr);
  stats.canvasW = Math.floor(W * dpr);
  stats.canvasH = Math.floor(Hc * dpr);
  return 'realloc';
}

let anchored = false;
/** The scroll position at the last placement (its change per frame is the scroll speed). */
let lastSy = Number.NaN;
/**
 * Keep the canvas over the viewport. The canvas rides the document, so while the viewport stays inside it nothing
 * moves: no transform change and no change in where prints sit on it, which keeps GL glued even where an engine
 * presents a canvas transform and its pixels a frame apart. The compositor scrolls ahead of the main thread, so the
 * canvas re-anchors before the viewport leaves it: once the slack ahead is under LEAD frames of the current scroll
 * speed. It re-anchors with most of its overscan toward the scroll direction and TRAIL of it behind, because the
 * compositor can also reverse a fling before the main thread re-anchors; with no slack behind the viewport that frame
 * opens a gap at the trailing edge (the gate measured 10 px at a reversal). Device-pixel aligned; style write only.
 */
export function place(sy: number, dir: 1 | -1): number {
  view.side = dir;
  const slack = Math.max(0, view.Hc - view.H);
  const trail = Math.round(slack * TRAIL);
  const speed = Number.isFinite(lastSy) ? Math.abs(sy - lastSy) : 0;
  lastSy = sy;
  const ahead = Math.min(Math.round(speed * LEAD), Math.max(0, slack - trail - 1));
  const covered = anchored && sy - (dir < 0 ? ahead : 0) >= view.anchor && sy + view.H + (dir > 0 ? ahead : 0) <= view.anchor + view.Hc;
  if (!covered) {
    const raw = dir > 0 ? sy - trail : sy - (slack - trail);
    const anchor = Math.max(0, Math.round(raw * view.dpr) / view.dpr);
    // At the document top the anchor stays clamped at 0: no style write when nothing changes.
    if (!anchored || anchor !== view.anchor) {
      canvas.style.insetBlockStart = `${anchor}px`;
      stats.reanchors++;
    }
    view.anchor = anchor;
    anchored = true;
  }
  return view.anchor;
}
/** After a swap or a resize the old anchor means nothing: the next render places the canvas afresh. */
export function reanchor(): void {
  anchored = false;
  lastSy = Number.NaN;
}
/** A GL boot that stood down (gl/index.ts abandon): forget the geometry, so the next boot measures and allocates afresh. */
export function resetView(): void {
  Object.assign(view, { W: 0, H: 0, lvh: 0, Hc: 0, O: 0, dpr: 1, anchor: 0, side: 1 });
  rawHc = 0;
  reanchor();
}

/** The handoff drip is the only moment GL paints above content (z 41, W-D013). */
export function raise(kind: 'drip'): void {
  html.dataset.rail = kind;
}
export function lower(): void {
  delete html.dataset.rail;
}
