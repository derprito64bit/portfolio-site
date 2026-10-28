// Entry: starts the glass at once, runs the preloader on real progress, then hands over to the app chunk.
// The preloader loads what the first minute needs: the type (document.fonts), the GSAP/Lenis app chunk, the shader
// programs (compiled and drawn once), and the window load. Progress is monotonic and never hangs (7 s timeout).
import { Stage } from './gl/stage';
import { LensRig } from './lens';

const html = document.documentElement;
const motion = html.classList.contains('motion');
const canvas = document.querySelector<HTMLCanvasElement>('canvas.gl');
const pre = document.getElementById('pre');
const num = document.querySelector<HTMLElement>('.pre__num');
const skipBtn = document.querySelector<HTMLButtonElement>('.pre__skip');

let stage: Stage | null = null;
let rig: LensRig | null = null;
const params = new URLSearchParams(location.search);
if (canvas && !params.has('nogl')) {
  try {
    stage = new Stage(canvas, 1.5);
    rig = new LensRig(stage);
    html.classList.add('gl-on');
  } catch (e) {
    console.warn('[refraction] WebGL unavailable, DOM fallback', e);
    stage = null;
    rig = null;
    html.classList.add('no-gl');
  }
} else html.classList.add('no-gl');
(window as unknown as { __boot: unknown }).__boot = { t0: performance.now() };

const FONT_SPECS = [
  '700 expanded 100px "Mona Sans Variable"',
  '300 expanded 100px "Mona Sans Variable"',
  '600 condensed 20px "Mona Sans Variable"',
  '520 16px "Mona Sans Variable"',
];

const tasks: { w: number; done: boolean }[] = [];
function track<T>(w: number, p: Promise<T>): Promise<T> {
  const t = { w, done: false };
  tasks.push(t);
  p.then(
    () => (t.done = true),
    () => (t.done = true),
  );
  return p;
}
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

const fontsP = track(0.3, Promise.all(FONT_SPECS.map((f) => document.fonts.load(f))).then(() => document.fonts.ready));
const appP = track(0.2, import('./app').then((m) => (performance.mark('app-loaded'), m)));
// the app prepares in slices while the droplets keep moving; the count reaches 100 only when it is ready
track(
  0.1,
  appP.then(async (m) => {
    await fontsP;
    await m.prepare({ stage, rig, motion });
    ready = true;
  }),
);
track(0.15, new Promise<void>((r) => (document.readyState === 'complete' ? r() : addEventListener('load', () => r(), { once: true }))));
// the cover shader compiles in the driver while the droplets already move (parallel compile), then draws once
const platesP = stage ? stage.preparePlates(nextFrame) : Promise.resolve();
track(
  0.3,
  (async () => {
    await fontsP;
    await nextFrame();
    if (stage && num) stage.mirror.add(num, [num]);
    await platesP;
    performance.mark('warm-start');
    stage?.warm();
    performance.mark('warm-end');
  })(),
);

const t0 = performance.now();
const MIN = motion ? 1.6 : 0;
const TIMEOUT = 7000;
let shown = 0;
let skip = false;
let raf = 0;
let last = t0;
let handed = false;
let ready = false;
let appMod: typeof import('./app') | null = null;
appP.then((m) => (appMod = m)).catch((e) => console.error('[refraction] app chunk failed', e));

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && !handed) {
    e.preventDefault();
    skip = true;
  }
}
if (motion) {
  addEventListener('keydown', onKey);
  skipBtn?.addEventListener('click', () => (skip = true));
}

let drawn = false;
let frameN = 0;
function loop(now: number) {
  // the first rAF stamp can predate t0 after the boot task: never a negative step
  const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20));
  last = Math.max(last, now);
  const total = tasks.reduce((a, t) => a + t.w, 0);
  let actual = tasks.reduce((a, t) => a + (t.done ? t.w : 0), 0) / total;
  if (now - t0 > TIMEOUT) actual = 1;
  const rate = skip ? 1 / 0.28 : MIN > 0 ? 1 / MIN : 1000;
  shown = Math.max(shown, Math.min(actual, shown + dt * rate), 0);
  const pct = Math.round(shown * 100);
  if (num) num.textContent = String(pct).padStart(3, '0');
  pre?.setAttribute('aria-valuenow', String(pct));
  if (rig && stage) {
    rig.preP = shown;
    rig.update(dt, now / 1000);
    if (frameN < 6) performance.mark(`r${frameN}-a`);
    stage.render(dt);
    if (frameN < 6) performance.mark(`r${frameN}-b`);
    frameN++;
    if (!drawn) {
      drawn = true;
      html.classList.add('gl-drawn');
    }
  }
  if (now - t0 > TIMEOUT + 4000 && !ready && !handed) {
    // the app never arrived: show the plain document rather than hang
    handed = true;
    html.classList.add('is-in', 'gl-drawn');
    if (pre) pre.style.display = 'none';
    return;
  }
  if (shown >= 1 && appMod && ready && !handed) {
    handed = true;
    removeEventListener('keydown', onKey);
    appMod.start({ skipped: skip });
    return;
  }
  raf = requestAnimationFrame(loop);
}
raf = requestAnimationFrame(loop);
void raf;
