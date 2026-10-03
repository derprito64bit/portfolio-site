// Lenis (W-D014): a removable feel layer, on the full tier with motion full only. Ticked by our ticker (autoRaf off),
// anchors off (the one anchor scroller in scroll.ts handles them), destroyed on a governor step-down or when reduced
// motion turns on. Scroll velocity drives no visual effect. Loaded after the GL chunk starts, so it is not pre-GL JS.
import Lenis from 'lenis';
import { onActive, onBefore, wake } from './ticker.ts';
import { setLenis } from './scroll.ts';

let lenis: Lenis | null = null;
let offBefore: (() => void) | null = null;
let offActive: (() => void) | null = null;
const INPUTS = ['wheel', 'touchstart', 'keydown'] as const;

export function enableLenis(): void {
  if (lenis) return;
  lenis = new Lenis({ autoRaf: false, lerp: 0.15, smoothWheel: true, syncTouch: false, anchors: false, stopInertiaOnNavigate: true });
  offBefore = onBefore((time) => lenis?.raf(time));
  offActive = onActive(() => Boolean(lenis?.isScrolling));
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
