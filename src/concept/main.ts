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
    html.classList.add('no-gl');
  }
} else html.classList.add('no-gl');

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
const appP = track(0.25, import('./app'));
track(0.15, new Promise<void>((r) => (document.readyState === 'complete' ? r() : addEventListener('load', () => r(), { once: true }))));
track(
  0.3,
  (async () => {
    await fontsP;
    await nextFrame();
    if (stage && num) stage.mirror.add(num, [num]);
    stage?.warm();
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

function loop(now: number) {
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  const total = tasks.reduce((a, t) => a + t.w, 0);
  let actual = tasks.reduce((a, t) => a + (t.done ? t.w : 0), 0) / total;
  if (now - t0 > TIMEOUT) actual = 1;
  const rate = skip ? 1 / 0.28 : MIN > 0 ? 1 / MIN : 1000;
  shown = Math.min(actual, shown + dt * rate);
  const pct = Math.round(shown * 100);
  if (num) num.textContent = String(pct).padStart(3, '0');
  pre?.setAttribute('aria-valuenow', String(pct));
  if (rig && stage) {
    rig.preP = shown;
    rig.update(dt, now / 1000);
    stage.render(dt);
  }
  if (shown >= 1 && appMod && !handed) {
    handed = true;
    removeEventListener('keydown', onKey);
    appMod.start({ stage, rig, motion, skipped: skip });
    return;
  }
  raf = requestAnimationFrame(loop);
}
raf = requestAnimationFrame(loop);
void raf;
