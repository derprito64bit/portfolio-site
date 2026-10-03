// GL boot scheduling (W-D034).
// - full: import the GL chunk after first contentful paint, in an idle callback (timeout 500 ms).
// - lite: boot when the first print slot comes within 1.5 viewports, when the camera or its strip is touched
//   ([data-gl=object], [data-gl-boot]; the boot runs after the next paint), or 5 s after load at idle.
// - static, or a page that opts out (the 404): never.
// Every step after module evaluation runs in its own task.
import { mark } from './state.ts';
import { getTier } from './tier.ts';
import { afterNextFrame } from './ticker.ts';

export type GLState = 'off' | 'deferred' | 'scheduled' | 'booting' | 'ready' | 'failed';
let state: GLState = 'off';
let started = false;
let resolveReady: (v: unknown) => void = () => {};
/** Resolves with the GL context API once GL is ready (never on the static tier). */
export const glReady: Promise<unknown> = new Promise((r) => (resolveReady = r));

export function glState(): GLState {
  return state;
}

const idle = (fn: () => void, timeout: number): void => {
  // WebKit has no requestIdleCallback; a short timeout keeps the GL boot after the current work.
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 1);
};

function afterFirstPaint(fn: () => void): void {
  const fcp = performance.getEntriesByName('first-contentful-paint');
  if (fcp.length) return fn();
  try {
    const po = new PerformanceObserver((list) => {
      if (list.getEntriesByName('first-contentful-paint').length) {
        po.disconnect();
        fn();
      }
    });
    po.observe({ type: 'paint', buffered: true });
  } catch {
    addEventListener('load', fn, { once: true });
  }
}

async function start(why: string): Promise<void> {
  if (started || getTier() === 'static') return;
  started = true;
  state = 'booting';
  mark('stage:gl-start', why);
  try {
    const gl = await import('./gl/index.ts');
    const api = await gl.boot();
    if (!api) {
      state = 'failed';
      return;
    }
    state = 'ready';
    resolveReady(api);
  } catch (e) {
    state = 'failed';
    console.error('[stage] GL boot failed; the page stays on its stills', e);
  }
}

export function scheduleGL(): void {
  const html = document.documentElement;
  const tier = getTier();
  if (tier === 'static' || html.dataset.glPage === 'off') {
    state = 'off';
    return;
  }
  const eager = document.querySelector('[data-gl-boot="eager"]') !== null;
  if (tier === 'full' || eager) {
    state = 'scheduled';
    afterFirstPaint(() => idle(() => void start(eager ? 'eager' : 'idle'), 500));
    return;
  }
  // lite: on intent.
  state = 'deferred';
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void start('near');
      }
    },
    { rootMargin: '150% 0px' },
  );
  document.querySelectorAll('[data-gl="print"]').forEach((el) => io.observe(el));
  const touch = (e: Event) => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-gl="object"], [data-gl-boot]')) return;
    removeEventListener('pointerdown', touch, true);
    removeEventListener('focusin', touch, true);
    afterNextFrame(() => window.setTimeout(() => void start('touch'), 0));
  };
  addEventListener('pointerdown', touch, true);
  addEventListener('focusin', touch, true);
  addEventListener('load', () => window.setTimeout(() => idle(() => void start('timer'), 1000), 5000), { once: true });
}

/** After a swap, a lite page may now hold a print slot in range. */
export function rescanGLIntent(): void {
  if (state !== 'deferred') return;
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        void start('near');
      }
    },
    { rootMargin: '150% 0px' },
  );
  document.querySelectorAll('[data-gl="print"]').forEach((el) => io.observe(el));
}
