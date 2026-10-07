// Lenis (W-D014): a removable feel layer, on the full tier with motion full only. Ticked by our ticker (autoRaf off),
// anchors off (the one anchor scroller in scroll.ts handles them), destroyed on a governor step-down or when reduced
// motion turns on. Scroll velocity drives no visual effect. Loaded after the GL chunk starts, so it is not pre-GL JS.
import Lenis from 'lenis';
import { onActive, onBefore, wake } from './ticker.ts';
import { setLenis } from './scroll.ts';
import { getTier } from './tier.ts';
import { isReduced } from './motion.ts';

let lenis: Lenis | null = null;
let offBefore: (() => void) | null = null;
let offActive: (() => void) | null = null;
const INPUTS = ['wheel', 'touchstart', 'keydown'] as const;

// Lenis damps by the time since its previous raf. Across a ticker sleep that is seconds, so the first wheel after a
// rest would finish its glide in one frame (measured: a 300 px wheel step landed in 12 ms). Lenis gets its own clock
// instead: a gap over 100 ms is a sleep and counts as one 60 Hz frame (as the ticker's first frame after a wake does);
// otherwise it advances by the frame time, at most 50 ms (the ticker's dt clamp).
let clock = 0;
let last = 0;
function step(time: number): void {
  const dt = time - last;
  clock += !last || dt > 100 || dt < 0 ? 1000 / 60 : Math.min(dt, 50);
  last = time;
  lenis?.raf(clock);
}

/**
 * Lenis is moving the page: its own glide ('smooth'), or a native scroll it follows ('native') while that scroll still
 * moves. Lenis 1.3 sets 'native' on every native scroll event but clears it only from a timer it starts when the event
 * moved the page; a scroll event that moves nothing leaves 'native' set for good. A Swup visit from / to the 404 (a
 * page shorter than the viewport) fires one at y 0, and the ticker never slept there: 1 rAF a frame and 0 draws at D2
 * (round 4, ruling 6031879782 item 3). A native scroll with no velocity is not motion.
 */
function scrolling(): boolean {
  if (!lenis) return false;
  return lenis.isScrolling === 'smooth' || (lenis.isScrolling === 'native' && lenis.velocity !== 0);
}

export function enableLenis(): void {
  // W-D014: the full tier with motion full only, checked here too, so a caller holding a stale answer cannot turn it on.
  if (lenis || getTier() !== 'full' || isReduced()) return;
  lenis = new Lenis({ autoRaf: false, lerp: 0.15, smoothWheel: true, syncTouch: false, anchors: false, stopInertiaOnNavigate: true });
  offBefore = onBefore(step);
  offActive = onActive(scrolling);
  for (const t of INPUTS) addEventListener(t, wake, { passive: true, capture: true });
  setLenis(lenis, wake);
}

export function disableLenis(): void {
  if (!lenis) return;
  lenis.destroy();
  lenis = null;
  offBefore?.();
  offActive?.();
  for (const t of INPUTS) removeEventListener(t, wake, { capture: true });
  setLenis(null);
}
