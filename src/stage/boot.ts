// GL boot scheduling (W-D034). On every tier the GL chunk is imported only after first contentful paint (D-005):
// every trigger goes through request(), which waits for FCP, so nothing can start the import earlier.
// - full: after FCP, in an idle callback (timeout 500 ms).
// - lite: after FCP the near observer is armed. When the first print slot comes within 1.5 viewports, GL boots in an
//   idle callback. GL also boots when the camera or its strip is touched ([data-gl=object], [data-gl-boot]; the boot
//   runs after the next paint), or 5 s after load at idle.
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

// ---------------------------------------------------------------- first contentful paint
let painted = false;
const waiting: (() => void)[] = [];
function markPainted(): void {
  if (painted) return;
  painted = true;
  for (const fn of waiting.splice(0)) fn();
}
/** Run fn once first contentful paint has happened (at once if it already has). */
function afterFirstPaint(fn: () => void): void {
  if (!painted && performance.getEntriesByName('first-contentful-paint').length) painted = true;
  if (painted) return fn();
  waiting.push(fn);
  if (waiting.length > 1) return; // already listening
  if (PerformanceObserver.supportedEntryTypes?.includes('paint')) {
    const po = new PerformanceObserver((list) => {
      if (!list.getEntriesByName('first-contentful-paint').length) return;
      po.disconnect();
      markPainted();
    });
    po.observe({ type: 'paint', buffered: true });
    return;
  }
  // No Paint Timing: the first frame after the load event stands in for first paint.
  const onLoad = () => afterNextFrame(() => window.setTimeout(markPainted, 0));
  if (document.readyState === 'complete') onLoad();
  else addEventListener('load', onLoad, { once: true });
}

// ---------------------------------------------------------------- the boot
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

/** Every trigger comes through here: after first paint, then in an idle callback (or at once when idleMs is 0). */
function request(why: string, idleMs: number): void {
  if (started) return;
  if (state === 'deferred') state = 'scheduled'; // a boot is on its way: the page is not settled yet
  afterFirstPaint(() => {
    if (idleMs > 0) idle(() => void start(why), idleMs);
    else void start(why);
  });
}

let nearIO: IntersectionObserver | null = null;
/** lite: boot when a print slot is within 1.5 viewports. Armed only after first paint. */
function armNear(): void {
  afterFirstPaint(() => {
    if (started || state !== 'deferred') return;
    nearIO?.disconnect();
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        if (nearIO === io) nearIO = null;
        request('near', 500);
      },
      { rootMargin: '150% 0px' },
    );
    nearIO = io;
    document.querySelectorAll('[data-gl="print"]').forEach((el) => io.observe(el));
  });
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
    request(eager ? 'eager' : 'idle', 500);
    return;
  }
  // lite: on intent.
  state = 'deferred';
  armNear();
  const touch = (e: Event) => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-gl="object"], [data-gl-boot]')) return;
    removeEventListener('pointerdown', touch, true);
    removeEventListener('focusin', touch, true);
    afterNextFrame(() => window.setTimeout(() => request('touch', 0), 0));
  };
  addEventListener('pointerdown', touch, true);
  addEventListener('focusin', touch, true);
  addEventListener('load', () => window.setTimeout(() => request('timer', 1000), 5000), { once: true });
}

/** After a swap, a lite page may now hold a print slot in range. */
export function rescanGLIntent(): void {
  if (state !== 'deferred' || started) return;
  armNear();
}
