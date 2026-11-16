// A cold /work/<slug>/ load (D-041, W-V1 A2): the article is there at once, with no intro. The camera layer boots behind
// it in the state 'open': the project's frame exposes behind the header within 1.5 s, held at the open view's framing
// (no WebGL: a plain dark ground). Scrolling into the roll takes the frame down to -4 EV. Back (and Esc) lands on the
// project's frame in the Viewfinder with location.replace('/#work-NN'). This is its own entry, not main.ts's home wiring.
import { gsap, D, E } from '../motion';
import { projects } from '../data';
import { frameRect } from '../layout';
import { homeUrl, workHash } from '../router';
import { testHooks } from '../testhooks';
import type { Engine } from '../gl/engine';
import type { Scene } from '../scenes';
import { initRoll } from './roll';
import { initPlayback } from './playback';
import { landedState, openZoom, subjectOf } from './framing';

const html = document.documentElement;
const calm = html.classList.contains('calm');
const article = document.getElementById('pj') as HTMLElement;
const n = Number(article.dataset.frame) || 1; // 1-based
const hooks = testHooks(window, location.search);
let engine: Engine | null = null;
let scene: Scene | null = null;
let S: 'open' | 'closing' = 'open';

// ---------------------------------------------------------------- the roll and playback
const roll = initRoll({ root: article, scroller: window, calm, counter: document.querySelector<HTMLElement>('[data-print-count]') });
const pb = initPlayback({ prints: roll?.prints ?? [], calm, onHold: (on) => roll?.hold(on) });
if (/^#print-\d+$/.test(location.hash)) pb.sync(location.hash);
window.addEventListener('popstate', () => pb.sync(location.hash));

// ---------------------------------------------------------------- Back: the project's frame in the Viewfinder
function leave() {
  if (S !== 'open') return;
  S = 'closing';
  location.replace(homeUrl(workHash(n)));
}
document.querySelector('[data-close]')?.addEventListener('click', (e) => { e.preventDefault(); leave(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !pb.isOpen() && !e.defaultPrevented) { e.preventDefault(); leave(); }
});

// ---------------------------------------------------------------- the frame behind the header
/** -4 EV as the roll comes up: the frame recedes behind the prints. */
const dimAt = () => Math.pow(2, -4 * Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.85))));
function frameState() {
  if (!engine || !scene) return;
  Object.assign(engine.st, landedState(scene, subjectOf(scene), openZoom(frameRect('work'))), { dim: dimAt() });
}

async function boot() {
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  // a lost context leaves the plain dark ground at once; the article never depended on it
  canvas.addEventListener('webglcontextlost', () => {
    engine = null;
    canvas.remove();
    html.classList.add('nogl');
  }, { once: true });
  try {
    const { Engine: EngineClass } = await import('../gl/engine');
    const e = new EngineClass(canvas, { stats: hooks.stats });
    e.sway = false; // a page to read: no hand-held drift (D-053)
    e.resize();
    await e.compile(() => {});
    const { projectScene } = await import('../scenes');
    scene = projectScene(projects[n - 1] ?? projects[0]);
    e.setScene(scene);
    engine = e;
    frameState();
    e.st.exposure = calm ? 1 : 0;
    e.start();
    hooks.engine(e);
    if (!calm) gsap.to(e.st, { exposure: 1, duration: D.land, ease: E.out, onUpdate: () => e.invalidate(120) });
    else e.invalidate(300);
  } catch (err) {
    console.warn('[viewfinder] WebGL unavailable, using flat frames', err);
    canvas.remove();
    engine = null;
    html.classList.add('nogl');
  }
}

let lastDim = -1;
window.addEventListener('scroll', () => {
  if (!engine) return;
  const d = dimAt();
  if (Math.abs(d - lastDim) < 0.002) return;
  lastDim = d;
  engine.st.dim = d;
  engine.invalidate(120);
}, { passive: true });

let rz: gsap.core.Tween | null = null;
window.addEventListener('resize', () => {
  rz?.kill();
  rz = gsap.delayedCall(0.05, () => {
    if (!engine) return;
    engine.resize();
    frameState();
    engine.invalidate(200);
  });
});

void boot();

// the test API (only under ?vf-test, D-055): this page is the open state of its frame
const noop = () => {};
hooks.attach({ go: noop, openProject: noop, closeProject: leave, lower: noop, raise: noop, setSim: noop, state: () => S, pos: () => n - 1 }, () => engine);
