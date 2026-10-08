// GL boot scheduling (W-D034). On every tier the GL chunk is imported only after first contentful paint (D-005):
// every trigger goes through request(), which waits for FCP, so nothing can start the import earlier.
// - full: after FCP, in an idle callback (timeout 500 ms).
// - lite: after FCP the near observer is armed. When the first print slot comes within 1.5 viewports, GL boots in an
//   idle callback. GL also boots when the camera or its strip is touched ([data-gl=object], [data-gl-boot]; the boot
//   runs after the next paint), or 5 s after load at idle.
// - static, or a page that opts out (the 404): never. A Swup arrival carries the arriving page's opt-out (router.ts),
//   and start() checks it again, so a trigger armed on another page never boots GL on the 404; a boot already in
//   flight reads it after every await and stands down (W-D029).
// Every step after module evaluation runs in its own task.
import { mark, stats } from './state.ts';
import { getTier, onTier } from './tier.ts';
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
/** W-D029: the page under the stage opts out of GL (the 404). Swup arrivals write the arriving page's value (router.ts). */
const optedOut = (): boolean => document.documentElement.dataset.glPage === 'off';

/**
 * A boot that found its page opted out stands down: GL off, not started, so the next arrival on a page with GL
 * schedules the boot again (rescanGLIntent). `gl` undoes what the GL chunk had made, when it got that far.
 */
function standDown(gl?: { abandon(): void }): void {
  gl?.abandon();
  started = false;
  state = 'off';
  stats.standDowns++;
  mark('stage:gl-stand-down');
}

async function start(why: string): Promise<void> {
  if (started) return;
  // A drop to static before the boot ran (Breaker 3.2 #3): GL is off for this visit, and the page can settle.
  if (getTier() === 'static') {
    state = 'off';
    return;
  }
  // W-D029: never on a page that opts out. A trigger armed on a page with GL (the lite timer, an idle callback) can
  // fire after a Swup visit has landed on the 404: it stands down, and the next arrival on a page with GL schedules
  // the boot again (rescanGLIntent).
  if (optedOut()) {
    state = 'off';
    return;
  }
  started = true;
  state = 'booting';
  mark('stage:gl-start', why);
  let gl: typeof import('./gl/index.ts');
  try {
    gl = await import('./gl/index.ts');
  } catch (e) {
    // A navigation away cancels the chunk import: the page is leaving, so that is not a failure to report. WebKit
    // rejects the import as soon as a navigation starts, before pagehide (a reload while the chunk loads), so a failed
    // import is reported only if the page is still here IMPORT_GRACE_MS later and was not hidden meanwhile. A page that
    // unloads never runs the timer; one kept in the bfcache runs it after its restore and stands down then, and the
    // boot is scheduled again (pageshow's own rescan found it still started).
    const hidesAtFailure = hides;
    if (!leaving) await new Promise((r) => setTimeout(r, IMPORT_GRACE_MS));
    if (leaving || hides !== hidesAtFailure) {
      standDown();
      if (!leaving) rescanGLIntent();
      return;
    }
    state = 'failed';
    console.error('[stage] GL boot failed; the page stays on its stills', e);
    return;
  }
  try {
    // ...and never while it runs (round-3 must-fix s2-404-gl-boot): a Swup visit can land on the 404 during any await
    // of the boot. The page is read again after the import, after every await inside gl.boot(), and once more here.
    if (optedOut()) return standDown();
    const api = await gl.boot(optedOut);
    if (api === 'stood-down') return standDown(); // gl.boot() has already abandoned what it made
    if (optedOut()) return standDown(gl);
    if (!api) {
      state = getTier() === 'static' ? 'off' : 'failed';
      return;
    }
    state = 'ready';
    resolveReady(api);
  } catch (e) {
    // A boot cut short by the page leaving (pagehide came first) is not a failure either. GL is off, and a bfcache
    // restore schedules the boot again.
    if (leaving) return standDown();
    state = 'failed';
    console.error('[stage] GL boot failed; the page stays on its stills', e);
  }
}

/** How long a failed GL chunk import waits for the navigation that may have cancelled it (see start()). */
const IMPORT_GRACE_MS = 5000;
let leaving = false;
let hides = 0;
addEventListener('pagehide', () => {
  leaving = true;
  hides++;
});
addEventListener('pageshow', (e) => {
  leaving = false;
  if (e.persisted) rescanGLIntent();
});

// A drop to static while GL is only scheduled or deferred (the governor, two context losses, Breaker 3.2 #3): no boot
// will run, so GL is off and the page can settle.
onTier((t) => {
  if (t !== 'static') return;
  // GL that was up is torn down for the visit (gl/index.ts teardown): it reads off from now on (round-5 should-fix S5).
  if (started) {
    if (state === 'ready') state = 'off';
    return;
  }
  nearIO?.disconnect();
  nearIO = null;
  state = 'off';
});

/** Every trigger comes through here: after first paint, then in an idle callback (or at once when idleMs is 0). */
function request(why: string, idleMs: number): void {
  if (started) return;
  if (getTier() === 'static') {
    state = 'off';
    return;
  }
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
  const timer = () => window.setTimeout(() => request('timer', 1000), 5000);
  if (document.readyState === 'complete') timer();
  else addEventListener('load', timer, { once: true });
}

/**
 * After a swap: a lite page may now hold a print slot in range; and a session that started on a page without GL (the
 * 404) schedules GL the first time a swap lands on a page with GL, as a full load of that page would.
 */
export function rescanGLIntent(): void {
  if (started) return;
  if (state === 'off' && getTier() !== 'static' && document.documentElement.dataset.glPage !== 'off') {
    scheduleGL();
    return;
  }
  if (state !== 'deferred') return;
  armNear();
}
