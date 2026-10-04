// The hero's pre-GL runtime (W-S1). Small on purpose: it ships before GL (pre-GL JS budget, budgets.md).
// - Layout: re-runs layout.ts on width, font and text-spacing changes (never on a toolbar-only height change on touch).
// - The strip: radios drive the readout (and the GL dials once they exist); Shutter and a tap on the camera print the
//   next featured project. Without GL (static, reduced motion, GL not up yet) the print swaps with a 200 ms fade.
// - The opening (D-024, #13 A1 and A2): the head script put the line drawing on screen (data-cam='drawing'). On the
//   full tier GL develops the camera out of it at T0 (src/gl/camera); on lite it crossfades to the finished-camera
//   poster as soon as that poster is decoded (GL never waits for it); a guard crossfades it too (at once under
//   reduced motion; a cut when the tier drops to static). 'ion.hero' is written when the develop or a crossfade
//   starts, so a reload, an anchor arrival or Back in the same session paints the finished camera (head script).
// - The hero run (W-D012, full tier): the GL camera module is fetched only once GL starts booting (stage:gl-start,
//   the pre-GL budget), T0 is the later of stage:gl-ready + 200 ms and the camera being ready, and the guards jump
//   it to the end state.
// GL work lives in src/gl/camera (its own chunk, loaded after first paint). The stage is reached through bridge.ts.
import { heroLayout, heroPoster } from './layout.ts';
import { svgDataUri, testStripSvg } from './still.ts';
import { afterStage, markTime, onContentReplace, onHtmlAttr, reduced, stage, tier, whenGL, whenMark } from './bridge.ts';
import { develop as developTokens, durations, heroTimeline, springs } from '../../lib/tokens.js';
import type { CameraController, IntroHooks, QueueItem } from '../../gl/camera/index.ts';

const html = document.documentElement;
const STACK_MAX = 3;
const LENSES = [16, 28, 50, 85, 135];
const SESSION_KEY = 'ion.hero';
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
/** W-D012's late guard: GL ready later than first contentful paint + 2.5 s jumps to the end state (no token holds it). */
const LATE_GUARD_MS = 2500;
/** The develop curve's exponent, from tokens.develop.curve (d = 1 - (1 - t)^2.4). */
const CURVE_EXP = Number(/\^\s*([\d.]+)/.exec(developTokens.curve)?.[1] ?? 2.4);

interface QueueData {
  slug: string;
  frame: string;
  look: string;
  name: string;
  tint: string;
}

let hero: HTMLElement | null = null;
let cam: CameraController | null = null;
let camLoading: Promise<CameraController | null> | null = null;
let queue: QueueData[] = [];
let printed = 0;
let busy = false;
let introState: 'none' | 'waiting' | 'running' | 'done' = 'none';

// ---------------------------------------------------------------- layout
let lastW = 0;
function layout(force = false): void {
  if (!hero) return;
  const w = html.clientWidth;
  // A height-only change on a touch screen is the toolbar: slots stay put (W-D013).
  if (!force && w === lastW && matchMedia('(pointer: coarse)').matches) return;
  lastW = w;
  heroLayout(hero, true);
  heroPoster(hero);
  stage()?.invalidate();
}

let ro: ResizeObserver | null = null;
function watchLayout(): void {
  ro?.disconnect();
  if (!hero) return;
  // The inline script's pre-paint observer (Hero.astro) hands over to this one.
  (hero as HTMLElement & { __heroRo?: ResizeObserver }).__heroRo?.disconnect();
  let first = true;
  ro = new ResizeObserver(() => {
    // The first callback reports the sizes the pre-paint layout already used.
    if (first) {
      first = false;
      return;
    }
    layout(true);
  });
  const h1 = hero.querySelector('h1');
  const copy = hero.querySelector('.hero-copy');
  if (h1) ro.observe(h1);
  if (copy) ro.observe(copy);
}
addEventListener('resize', () => layout(), { passive: true });
document.fonts?.ready.then(() => layout(true));

// ---------------------------------------------------------------- the opening: the drawing (D-024)
const manualClock = new URLSearchParams(location.search).has('t');
/** On the manual clock (?t=) the stage seeks every document animation to currentTime = ms; an animation started at
 * stage time T gets delay T, so a seek shows its true phase (W-D030 seeked filmstrips). */
const delayFor = (stageMs?: number) => (manualClock && stageMs !== undefined ? stageMs : 0);

function writeSession(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* private mode: the next arrival plays the opening again, which is the safe side */
  }
}
const drawingOn = () => html.dataset.cam === 'drawing';
const drawingParts = () => ({
  ground: hero?.querySelector<HTMLElement>('.hero-ground') ?? null,
  lines: hero?.querySelector<HTMLElement>('.hero-lines') ?? null,
  poster: hero?.querySelector<HTMLImageElement>('.hero-poster') ?? null,
});

function logPhase(id: string, t0: number, ms: number, trigger: string): void {
  const w = window as unknown as { __motionLog?: unknown[] };
  (w.__motionLog ??= []).push({ id, kind: 'drawing', spring: null, trigger, t0: Math.round(t0), t1: Math.round(t0 + ms), from: 0, to: 1, peak: 1, settle2Ms: null, tier: tier(), reduced: reduced() });
}

/** The finished-camera poster, loading (it waits under the drawing on the full tier) and decoded. */
function posterDecoded(): Promise<void> {
  if (!hero) return Promise.resolve();
  heroPoster(hero, true);
  const img = drawingParts().poster;
  return img ? img.decode().catch(() => {}) : Promise.resolve();
}

/** The drawing is over: CSS shows the finished camera from here on (GL's, or the poster). */
function drawingDone(): void {
  if (!drawingOn()) return;
  html.dataset.cam = 'camera';
  const { ground, lines } = drawingParts();
  for (const el of [ground, lines]) el?.getAnimations().forEach((a) => a.cancel());
  // GL draws the finished camera; its poster loads behind it (a context loss hands the slot back to the poster).
  if (hero && cam?.live) heroPoster(hero, true);
}

let crossfading = false;
/**
 * The drawing to the finished-camera poster in the DOM: lite's opening, a guard before GL has the camera, the 6 s
 * safety. `ms` 0 cuts. The poster decodes first, so the crossfade never shows a half-loaded camera, and it starts
 * from the drawing's state when it was called.
 */
async function drawingToPoster(ms: number, trigger: string): Promise<void> {
  if (!drawingOn() || crossfading) return;
  crossfading = true;
  writeSession();
  await posterDecoded();
  if (!drawingOn()) return;
  const { ground, lines, poster } = drawingParts();
  const t0 = performance.now();
  if (ms > 0 && poster) {
    const opts: KeyframeAnimationOptions = { duration: ms, easing: 'linear', fill: 'forwards' };
    const runs = [poster.animate([{ opacity: 0 }, { opacity: 1 }], opts)];
    for (const el of [ground, lines]) if (el) runs.push(el.animate([{ opacity: Number(getComputedStyle(el).opacity) }, { opacity: 0 }], opts));
    await Promise.all(runs.map((a) => a.finished)).catch(() => {});
    drawingDone();
    runs.forEach((a) => a.cancel());
  } else drawingDone();
  logPhase('hero:drawing:crossfade', t0, ms, trigger);
}

/** GL's opening at T0: GL's own ground takes over from the DOM ground in the same frame (the same colour, so the cut is
 *  invisible and the clay shows from its first frame), and the strokes fade with the veil as it clears (develop values
 *  0.08 to 0.84, src/gl/camera/drawing.ts). Called from the stage frame that draws T0. */
function drawingStart(at: number): void {
  writeSession();
  const { ground, lines } = drawingParts();
  const delay = delayFor(at);
  if (ground) ground.style.opacity = '0';
  if (lines) {
    // The strokes' opacity is 1 - smoothstep(0.08, 0.84, d) on the develop curve, d = 1 - (1 - t)^2.4.
    const total = durations.heroDrawingClay + durations.heroDrawingDevelop;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 24; i++) {
      const ms = (total * i) / 24;
      const t = Math.min(1, Math.max(0, (ms - durations.heroDrawingClay) / durations.heroDrawingDevelop));
      const d = 1 - Math.pow(1 - t, CURVE_EXP);
      const k = Math.min(1, Math.max(0, (d - 0.08) / 0.76));
      frames.push({ opacity: 1 - k * k * (3 - 2 * k), offset: i / 24 });
    }
    lines.animate(frames, { duration: total, delay, fill: 'forwards' });
  }
}

/** A guard during GL's develop: the strokes (and anything left of the DOM ground) go with GL's crossfade. */
function drawingCrossfade(ms: number): void {
  writeSession();
  const { ground, lines } = drawingParts();
  for (const el of [ground, lines]) {
    if (!el) continue;
    const from = Number(getComputedStyle(el).opacity);
    el.getAnimations().forEach((a) => a.cancel());
    if (ms > 0) el.animate([{ opacity: from }, { opacity: 0 }], { duration: ms, easing: 'linear', fill: 'forwards' });
    else el.style.opacity = '0';
  }
  logPhase('hero:drawing:crossfade', performance.now(), ms, 'guard');
}

// ---------------------------------------------------------------- the strip
function lookName(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
function stripState(): { lens: number; look: string; lensIndex: number; lookIndex: number } {
  const lensInput = hero?.querySelector<HTMLInputElement>('input[name="camera-lens"]:checked');
  const lookInput = hero?.querySelector<HTMLInputElement>('input[name="camera-look"]:checked');
  const looks = [...(hero?.querySelectorAll<HTMLInputElement>('input[name="camera-look"]') ?? [])].map((i) => i.value);
  const lens = Number(lensInput?.value ?? 50);
  const look = lookInput?.value ?? 'standard';
  return { lens, look, lensIndex: Math.max(0, LENSES.indexOf(lens)), lookIndex: Math.max(0, looks.indexOf(look)) };
}
function syncReadout(): void {
  if (!hero) return;
  const s = stripState();
  const lensOut = hero.querySelector('[data-readout="lens"]');
  const lookOut = hero.querySelector('[data-readout="look"]');
  if (lensOut) lensOut.textContent = `Lens ${s.lens} mm`;
  if (lookOut) lookOut.textContent = `Look ${lookName(s.look)}`;
}

let dragMoved = false;
function bindStrip(): void {
  if (!hero) return;
  const strip = hero.querySelector<HTMLElement>('[data-camera-strip]');
  strip?.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    syncReadout();
    const s = stripState();
    if (t.name === 'camera-lens') cam?.setLens(s.lensIndex, 'strip');
    if (t.name === 'camera-look') cam?.setLook(s.lookIndex, 'strip');
  });
  hero.querySelector('[data-shutter]')?.addEventListener('click', () => shutter('strip'));
  const camera = hero.querySelector<HTMLElement>('[data-hero-camera]');
  // A tap or click on the camera presses the shutter. A vertical swipe stays a scroll: no touch-action override.
  camera?.addEventListener('click', (e) => {
    if (dragMoved) return;
    // A click on the Look dial or the lens ring (their hit areas exist on a fine pointer only) turns it one detent,
    // through the same radios; anywhere else on the camera presses the shutter.
    const hit = (e.target as HTMLElement).closest<HTMLElement>('[data-drag]');
    if (hit && hero) {
      const inputs = [...hero.querySelectorAll<HTMLInputElement>(`input[name="${hit.dataset.drag === 'lens' ? 'camera-lens' : 'camera-look'}"]`)];
      const next = inputs[(inputs.findIndex((i) => i.checked) + 1) % inputs.length];
      next.checked = true;
      next.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    shutter('camera');
  });
  bindDrag();
}

// Drag the Look dial or the lens ring (fine pointer, full tier): 8 px axis lock, one detent per 28 px. It only ever
// checks the same radios, so a drag and the keys end in identical states.
function bindDrag(): void {
  hero?.querySelectorAll<HTMLElement>('[data-drag]').forEach((el) => {
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      const name = el.dataset.drag === 'lens' ? 'camera-lens' : 'camera-look';
      const inputs = [...(hero?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`) ?? [])];
      const start = inputs.findIndex((i) => i.checked);
      const x0 = e.clientX;
      const y0 = e.clientY;
      let axis: 'x' | 'y' | null = null;
      dragMoved = false;
      el.setPointerCapture(e.pointerId);
      const move = (m: PointerEvent) => {
        const dx = m.clientX - x0;
        const dy = m.clientY - y0;
        if (!axis && Math.hypot(dx, dy) >= 8) axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        if (axis !== 'x') return;
        dragMoved = true;
        const i = Math.max(0, Math.min(inputs.length - 1, start + Math.round(dx / 28)));
        if (!inputs[i].checked) {
          inputs[i].checked = true;
          inputs[i].dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        setTimeout(() => (dragMoved = false), 0);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
  });
}

// ---------------------------------------------------------------- the brackets, the flash
/** The viewfinder brackets close on the name (detent spring) and open again (settle spring). Never when reduced. */
function closeBrackets(stageMs?: number): void {
  if (reduced()) return;
  const h1 = hero?.querySelector<HTMLElement>('.wordmark');
  if (!h1) return;
  const delay = delayFor(stageMs);
  // One animation per bracket: in on the detent spring's own curve, then back out on the settle spring's.
  const close = springs.detent.cssLinearMs;
  const total = close + springs.settle.cssLinearMs;
  h1.querySelectorAll<HTMLElement>('.br').forEach((br) => {
    const rest = br.classList.contains('br-l') ? '-0.07em' : '0.07em';
    br.animate(
      [
        { insetInlineStart: rest, offset: 0, easing: springs.detent.css },
        { insetInlineStart: '0em', offset: close / total, easing: springs.settle.css },
        { insetInlineStart: rest, offset: 1 },
      ],
      { duration: total, delay },
    );
  });
}

/** The flash from the lens (W-D011): 350 ms, peak 0.62 at +120 ms, through the stage's one global limiter. */
function flash(trigger: string, stageMs?: number): boolean {
  if (!hero || !stage()?.requestFlash(trigger, 'hero:flash')) return false;
  const el = hero.querySelector<HTMLElement>('.hero-flash');
  const camEl = hero.querySelector<HTMLElement>('[data-hero-camera]');
  if (!el || !camEl) return false;
  const band = hero.dataset.band || 'stacked';
  const cs = getComputedStyle(hero);
  const lx = parseFloat(cs.getPropertyValue(`--mk-${band}-lens-x`)) || 0.7;
  const ly = parseFloat(cs.getPropertyValue(`--mk-${band}-lens-y`)) || 0.6;
  const r = camEl.getBoundingClientRect();
  el.style.setProperty('--flash-x', `${Math.round(r.left + lx * r.width)}px`);
  el.style.setProperty('--flash-y', `${Math.round(r.top + ly * r.height)}px`);
  el.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0.62, offset: 120 / durations.flash, easing: EASE_OUT },
      { opacity: 0, offset: 1 },
    ],
    { duration: durations.flash, easing: 'linear', delay: delayFor(stageMs) },
  );
  return true;
}

// ---------------------------------------------------------------- printing the next project
function nextItem(): QueueItem | null {
  if (!queue.length) return null;
  const q = queue[printed % queue.length];
  printed++;
  // The still is drawn here, on demand: the page carries only the project's slug, tint and frame code.
  return { slug: q.slug, frame: q.frame, look: q.look, name: q.name, still: svgDataUri(testStripSvg({ slug: q.slug, tint: q.tint, frame: q.frame })) };
}

/** Add a still to the print stack (newest on top, at most 3). Returns the new <img>. */
function addStill(item: QueueItem, visible: boolean): HTMLImageElement | null {
  const slot = hero?.querySelector<HTMLElement>('[data-hero-print]');
  if (!slot) return null;
  const img = document.createElement('img');
  img.className = 'hero-still';
  img.alt = '';
  img.width = 540;
  img.height = 860;
  img.decoding = 'sync';
  img.src = item.still;
  img.setAttribute('data-poster', '');
  img.dataset.slug = item.slug;
  // Seeded offsets, so the stack reads as prints dropped on the table, not a pile of clones.
  const k = printed % 3;
  img.style.translate = `${[6, -5, 3][k]}px ${[-4, 3, -2][k]}px`;
  img.style.rotate = `${[1.6, -1.1, 0.7][k]}deg`;
  img.style.opacity = visible ? '1' : '0';
  slot.append(img);
  const stills = slot.querySelectorAll('img.hero-still');
  for (let i = 0; i < stills.length - STACK_MAX; i++) stills[i].remove();
  return img;
}

function shutter(trigger: string): void {
  if (!hero) return;
  if (introState === 'waiting' || introState === 'running') finishIntro('input');
  if (busy) return; // presses during an eject are ignored (W-D012)
  const button = hero.querySelector<HTMLElement>('[data-shutter]');
  button?.setAttribute('data-pressed', '');
  setTimeout(() => button?.removeAttribute('data-pressed'), durations.shutter);
  closeBrackets();
  const item = nextItem();
  if (!item) return;
  const look = stripState().look;
  if (cam && cam.live && !reduced() && tier() !== 'static') {
    busy = true;
    cam.press(trigger);
    setTimeout(() => flash(trigger), heroTimeline.flash - heroTimeline.shutter);
    cam
      .printNext({ ...item, look }, () => addStill(item, false))
      .finally(() => {
        busy = false;
      });
  } else {
    cam?.press(trigger);
    flash(trigger);
    // Static and reduced motion: the next print swaps in with a 200 ms fade (W-D011), no flight, no shift. The
    // final opacity is set first, so the still is never left hidden if the animation is cancelled.
    const img = addStill(item, true);
    img?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: durations.reduced, easing: EASE_OUT });
  }
  stage()?.announce(`Printed ${item.name}.`);
}

// ---------------------------------------------------------------- the hero run (full tier, W-D012)
function mark(name: string): void {
  try {
    performance.mark(name);
  } catch {
    /* evidence only */
  }
}

const guardOff: (() => void)[] = [];
function finishIntro(why: string): void {
  if (introState === 'done' || introState === 'none') return;
  introState = 'done';
  for (const off of guardOff.splice(0)) off();
  // A guard jumps to the end state: print 1 appears at once, with no crossfade (the GL print is let go at once too).
  // A drawing still on screen crossfades to the finished camera (at once under reduced motion; a cut when the tier
  // drops to static, which has no motion at all).
  html.dataset.heroCut = '';
  const fade = reduced() || tier() === 'static' ? 0 : durations.heroDrawingFade;
  if (cam?.drawingLive) cam.finishIntro(fade);
  else {
    cam?.finishIntro(0);
    void drawingToPoster(fade, why);
  }
  if (html.dataset.hero === 'eject') html.dataset.hero = 'done';
  mark(`hero:guard=${why}`);
}

function armGuards(): void {
  const input = (e: Event) => {
    // The shutter and the camera handle their own presses (they end the run too); any other first input ends it.
    if (e.type === 'pointerdown' && (e.target as Element)?.closest?.('[data-shutter], [data-hero-camera]')) return;
    finishIntro(e.type);
  };
  for (const type of ['keydown', 'focusin', 'pointerdown'] as const) {
    addEventListener(type, input, { capture: true });
    guardOff.push(() => removeEventListener(type, input, { capture: true }));
  }
  const onScroll = () => {
    if (hero && window.scrollY > hero.offsetHeight * 0.25) finishIntro('scroll');
  };
  addEventListener('scroll', onScroll, { passive: true });
  guardOff.push(() => removeEventListener('scroll', onScroll));
  const onHidden = () => document.hidden && finishIntro('hidden');
  document.addEventListener('visibilitychange', onHidden);
  guardOff.push(() => document.removeEventListener('visibilitychange', onHidden));
  const onBack = () => finishIntro('back');
  const onShow = (e: PageTransitionEvent) => e.persisted && onBack();
  addEventListener('popstate', onBack);
  addEventListener('pageshow', onShow);
  guardOff.push(() => removeEventListener('popstate', onBack), () => removeEventListener('pageshow', onShow));
  guardOff.push(onHtmlAttr('data-motion', (m) => m === 'reduced' && finishIntro('reduced')));
  guardOff.push(onHtmlAttr('data-tier', (t) => t !== 'full' && finishIntro('tier')));
}

function firstPaint(): Promise<number> {
  return new Promise((res) => {
    const e = performance.getEntriesByName('first-contentful-paint')[0];
    if (e) return res(e.startTime);
    try {
      const po = new PerformanceObserver((list) => {
        const f = list.getEntriesByName('first-contentful-paint')[0];
        if (f) {
          po.disconnect();
          res(f.startTime);
        }
      });
      po.observe({ type: 'paint', buffered: true });
    } catch {
      res(performance.now());
    }
  });
}

// ---------------------------------------------------------------- GL camera
/** The camera chunk (and through it the GLB), only once GL has started booting: never in the pre-GL bytes. */
function loadCamera(): Promise<CameraController | null> {
  if (camLoading) return camLoading;
  camLoading = whenMark('stage:gl-start')
    .then(() => import('../../gl/camera/index.ts'))
    .then(async (mod) => {
      mod.prefetch(tier());
      const api = await whenGL();
      if (!hero || !api) return null;
      const s = stripState();
      const controller = await mod.createCamera(api, {
        hero,
        lookIndex: s.lookIndex,
        lensIndex: s.lensIndex,
        stage: () => stage(),
        onMark: mark,
      });
      cam = controller;
      return controller;
    })
    .catch((e) => {
      console.warn('[hero] camera unavailable; the poster stays', e);
      return null;
    });
  return camLoading;
}

const introHooks: IntroHooks = {
  closeBrackets: (at?: number) => closeBrackets(at),
  flash: (at?: number) => flash('intro', at),
  handback: () => {
    if (html.dataset.hero === 'eject') html.dataset.hero = 'done';
  },
  drawingStart,
  drawingCrossfade,
  drawingEnd: drawingDone,
};

async function startIntro(): Promise<void> {
  introState = 'waiting';
  html.dataset.heroRun = '1';
  armGuards();
  const fcp = await firstPaint();
  // Guard: GL ready later than FCP + 2.5 s jumps to the end state (print 1 developed in its slot).
  const late = setTimeout(() => {
    if (markTime('stage:gl-ready') === null) finishIntro('late');
  }, Math.max(0, fcp + LATE_GUARD_MS - performance.now()));
  guardOff.push(() => clearTimeout(late));
  const controller = await loadCamera();
  if (introState !== 'waiting') return;
  if (!controller) {
    finishIntro('no-gl');
    return;
  }
  clearTimeout(late);
  introState = 'running';
  const glReady = markTime('stage:gl-ready') ?? performance.now();
  // A camera that is still not up 2.5 s after GL is ready (a slow model download) ends the wait the same way.
  // (Not on the manual clock, where T0 waits for the first seek.)
  const slow = setTimeout(() => {
    if (!manualClock && !performance.getEntriesByName('hero:t0').length) finishIntro('slow-camera');
  }, Math.max(0, glReady + LATE_GUARD_MS - performance.now()));
  guardOff.push(() => clearTimeout(slow));
  const result = await controller.intro(glReady + heroTimeline.t0AfterGlReady, introHooks);
  clearTimeout(slow);
  if (result === 'failed') {
    finishIntro('gl-empty');
    return;
  }
  if (introState === 'running') {
    introState = 'done';
    for (const off of guardOff.splice(0)) off();
  }
}

// ---------------------------------------------------------------- boot (and again after a swap back home)
let booted = false;
function init(): void {
  hero = document.querySelector<HTMLElement>('[data-hero-section]');
  if (!hero) return;
  try {
    queue = JSON.parse(hero.querySelector('[data-hero-queue]')?.textContent || '[]');
  } catch {
    queue = [];
  }
  // A return to the home page (Swup) never replays the opening: the finished camera, print 1 developed.
  if (booted && drawingOn()) html.dataset.cam = 'camera';
  if (!hero.hasAttribute('data-laid')) layout(true);
  lastW = html.clientWidth;
  watchLayout();
  bindStrip();
  syncReadout();
  const first = !booted;
  booted = true;
  afterStage(() => {
    if (first && html.dataset.hero === 'eject' && introState === 'none') void startIntro();
    else if (html.dataset.hero === 'eject') html.dataset.hero = 'done';
    // Lite (and the full tier's demoted or reduced paths): the drawing crossfades to the poster once it is decoded.
    if (drawingOn() && html.dataset.hero !== 'eject') void drawingToPoster(reduced() || tier() === 'static' ? 0 : durations.heroDrawingFade, 'lite');
    if (tier() !== 'static') void loadCamera().then((c) => c?.rebind(hero as HTMLElement));
  });
}

// Reduced motion turned on mid-flourish: the brackets and the flash end at once (the GL side snaps itself).
onHtmlAttr('data-motion', (m) => {
  if (m !== 'reduced') return;
  hero?.querySelectorAll<HTMLElement>('.br, .hero-flash').forEach((el) => el.getAnimations().forEach((a) => a.finish()));
});
// The tier dropping to static (no WebGL after all, context lost twice): any drawing left cuts to the poster.
onHtmlAttr('data-tier', (t) => {
  if (t === 'static' && drawingOn()) void drawingToPoster(0, 'static');
});

onContentReplace(() => init());
init();
