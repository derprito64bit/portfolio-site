// Lenis (W-D014): a removable feel layer, on the full tier with motion full only. Ticked by our ticker (autoRaf off),
// anchors off (the one anchor scroller in scroll.ts handles them), destroyed on a governor step-down or when reduced
// motion turns on. Scroll velocity drives no visual effect. Loaded after the GL chunk starts, so it is not pre-GL JS.
import Lenis from 'lenis';
import { onActive, onBefore, wake } from './ticker.ts';
import { scrollState, scrollToY, setLenis } from './scroll.ts';
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
 * moves the page this frame (the one scroll source read it: scrollState.moved). Lenis 1.3 sets 'native' on every native
 * scroll event and on a touch with syncTouch off (onVirtualScroll stops its glide there without reset(), so velocity
 * keeps the glide's last step), and clears it only from a timer it starts when a scroll event moved the page. A touch
 * at a glide's tail, a sideways drag on a pan-y control, a swipe toward a boundary or a scroll event that moves nothing
 * leaves 'native' set for good with no scroll event to come, and the ticker never slept (round 4: velocity 0 on the
 * 404; round-5 must-fix lenis-native-velocity: velocity 0.04 to 0.38 after a touch in a glide's tail). So Lenis's own
 * fields are not trusted for 'native': a native scroll that still moves the page is motion whatever they say, and one
 * that does not is not, however stale they are. (Native scroll events wake the ticker themselves: gl/index.ts.)
 */
function scrolling(): boolean {
  if (!lenis) return false;
  return lenis.isScrolling === 'smooth' || (lenis.isScrolling === 'native' && scrollState.moved);
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
  // A glide still running lands where it was going (round-5 should-fix S6, Breaker 4.3 #2): reduced motion, a step-down
  // or a drop to static cut the nav's Work link 180 to 290 px short of #work. W-D017: what was moving jumps to its end.
  // Where the glide goes is its animation's end (a programmatic scrollTo, the anchor scroller's, leaves targetScroll
  // where it was), and the page jumps there natively once Lenis is gone, through the one scroller's instant path.
  const anim = (lenis as unknown as { animate?: { isRunning?: boolean; to?: number } }).animate;
  const target = lenis.isScrolling === 'smooth' && anim?.isRunning && Number.isFinite(anim.to) ? (anim.to as number) : null;
  lenis.destroy();
  lenis = null;
  offBefore?.();
  offActive?.();
  for (const t of INPUTS) removeEventListener(t, wake, { capture: true });
  setLenis(null);
  if (target !== null) scrollToY(target);
}
