// Flux app: boot, the preloader that really loads, the single loop, and the scroll (loaded by main.ts after first paint).
// Performance rules: the first drop draws from a tiny shader in the first frame; every other shader compiles, and
// every cover renders, in slices across frames; no layout is read per frame (positions come from cached offsets and
// scrollY); the work section pins with CSS sticky, so no scroll library reads layout either.
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import { Engine, type Drop, type PlaneDraw, type Lens, type CoverJob } from './gl/engine';
import { projects, seedOf } from './content';
import { recipe } from './covers';
import { world, dropInk } from './world';
import { NameType } from './type';
import { Work } from './work';
import { ProjectView } from './project';
import { Honours } from './honours';
import { Spring, clamp, easeOutExpo, easeInOut } from './spring';

gsap.registerPlugin(SplitText, ScrambleTextPlugin, CustomEase);
CustomEase.create('flux.out', '0.16,1,0.3,1');
CustomEase.create('flux.inOut', '0.65,0,0.35,1');

const html = document.documentElement;
const $ = (id: string) => document.getElementById(id)!;
world.rm = html.classList.contains('rm');
world.coarse = matchMedia('(pointer: coarse)').matches;
const lowPower = world.coarse || (navigator.hardwareConcurrency || 8) <= 4;
const viewport = () => {
  world.W = window.innerWidth;
  world.H = window.innerHeight;
  world.phone = world.W < 768;
};
viewport();
window.scrollTo(0, 0);

// ---------------------------------------------------------------- engine (only the loader shader compiles here)
let engine: Engine | null = null;
try {
  engine = new Engine($('gl') as HTMLCanvasElement, lowPower);
} catch (err) {
  console.warn('[flux] still page: no WebGL2 with half-float targets', err);
  engine = null;
  html.classList.add('no-gl');
}
world.engine = engine;

// the ink drop the page starts from: one ring per finished task
const seed: Drop = { x: 0, y: 0, r: 0.012, k: 12, vivid: 0.62 };
if (engine) {
  engine.drops.push(seed);
  engine.loaderDrop = seed;
  engine.reveal = 0.02;
}

// ---------------------------------------------------------------- loader: real tasks, sliced across frames
const TASKS = 3 + projects.length;
let done = 0;
let partial = 0; // progress inside the current task (shader steps, cover strips), 0..1
let shown = 0;
let loaded = false;
let released = false;
let holdAt = -1;
let skipReq = false;
const dropR = new Spring(0.012, { k: 260, c: 22 });
const taskEl = $('loader-task');
$('loader-total').textContent = String(TASKS);
function complete(label: string) {
  done++;
  partial = 0;
  $('loader-done').textContent = String(done);
  taskEl.textContent = label;
}

let name: NameType | null = null;
let work: Work | null = null;
let project: ProjectView | null = null;
let honours: Honours | null = null;
let fontReady = false;
document.fonts.load("300 100px 'Flux Flex'").then(() => (fontReady = true), () => (fontReady = true));

function labelCanvas(n: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 1200;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.textBaseline = 'alphabetic';
  try {
    (x as any).fontStretch = 'expanded';
  } catch {}
  x.font = "500 25px 'Flux Flex', sans-serif";
  x.fillText(`Project ${n}`, 34, 1200 - 32);
  x.textAlign = 'right';
  x.globalAlpha = 0.6;
  x.fillText('Placeholder cover, generated', 960 - 34, 1200 - 32);
  return c;
}

/** One small unit of boot work per frame. */
function* boot(): Generator<void, void, void> {
  let typeDone = false;
  const checkType = () => {
    if (fontReady && !typeDone) {
      typeDone = true;
      complete('type');
    }
  };
  if (engine) {
    const total = engine.stepsLeft;
    while (!engine.prepare()) {
      partial = 1 - engine.stepsLeft / Math.max(1, total);
      checkType();
      yield;
    }
  }
  complete('shaders');
  while (!fontReady) yield;
  checkType();
  name = new NameType(document.querySelector('[data-name]') as HTMLElement);
  name.el.classList.add('is-split');
  yield;
  for (const p of projects) {
    if (engine) {
      const rc = recipe(p.slug, p.index, p.tint);
      const job: CoverJob = engine.coverJob({ seed: seedOf(p.slug) * 10 + p.index, ...rc, label: labelCanvas(p.n) }, lowPower ? 640 : 960, lowPower ? 800 : 1200, lowPower ? 2 : 1);
      while (!engine.coverStep(job)) {
        partial = job.row / job.rows;
        yield;
      }
      world.covers[p.index] = job.rt.texture;
      if (world.rm) {
        yield;
        world.coverCanvases[p.index] = engine.coverToCanvas(job.rt.texture);
      }
    }
    complete(`cover ${p.n}`);
    yield;
  }
  complete('first frame');
  loaded = true;
}
const bootGen = boot();
let bootDone = false;
setTimeout(() => {
  if (!loaded) {
    console.warn('[flux] loader timeout: releasing with what is ready');
    loaded = true;
  }
}, 8000);

$('skip').addEventListener('click', () => (skipReq = true));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !released && document.activeElement === document.body) skipReq = true;
});

// ---------------------------------------------------------------- page geometry, measured on resize only
const geo = { workTop: 0, introH: 1, maxScroll: 1, honoursTop: 0 };
let lenis: any = null;
function measure() {
  const sy = window.scrollY;
  const wr = $('work').getBoundingClientRect();
  geo.workTop = wr.top + sy;
  geo.introH = $('intro').getBoundingClientRect().height || world.H;
  geo.maxScroll = Math.max(1, document.documentElement.scrollHeight - world.H);
  geo.honoursTop = $('honours').getBoundingClientRect().top + sy;
  honours?.measure();
  measureLenses();
}
function sizeWork() {
  if (!work) return;
  if (world.rm || !engine) {
    $('work').style.height = '';
    return;
  }
  $('work').style.height = `${world.H + work.scrollLen()}px`;
}

function buildPage() {
  work = new Work();
  project = new ProjectView(work);
  honours = new Honours();
  work.onOpen = (k, cell, uv) => project!.open(k, { x: cell.x, y: cell.y, w: cell.w, h: cell.h }, uv);
  project.onState = () => measureLenses();
  document.querySelectorAll<HTMLAnchorElement>('.work-cell-link').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const r = a.getBoundingClientRect();
      project!.open(Number(a.dataset.i), { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }, [0.5, 0.5]);
    }),
  );
  sizeWork();
}

function setupScroll() {
  if (world.rm || !engine) return;
  lenis = new Lenis({ autoRaf: false, lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.9 });
  world.lenis = lenis;
  lenis.stop();
}

function scrollToId(id: string) {
  if (world.phase === 'open') return;
  let y = 0;
  if (id === 'work') y = geo.workTop;
  else if (id !== 'intro') y = $(id).getBoundingClientRect().top + window.scrollY;
  if (lenis) lenis.scrollTo(y, { duration: 1.1, easing: (t: number) => 1 - Math.pow(1 - t, 4) });
  else window.scrollTo(0, y);
}
document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToId(a.getAttribute('href')!.slice(1));
  }),
);
$('to-top').addEventListener('click', () => scrollToId('intro'));

// ---------------------------------------------------------------- release
function introText(delay: number) {
  const items = Array.from(document.querySelectorAll<HTMLElement>('[data-intro-fade]'));
  gsap.set(items, { opacity: 0 });
  html.classList.remove('is-loading');
  gsap.to(items, { opacity: 1, duration: world.rm ? 0.25 : 0.6, delay, ease: 'none', stagger: 0.08 });
  if (world.rm) return;
  document.querySelectorAll<HTMLElement>('[data-scramble]').forEach((el, i) => {
    const text = el.textContent || '';
    el.textContent = '';
    gsap.to(el, { duration: 1.1, delay: delay + i * 0.12, scrambleText: { text, chars: 'lowerCase', speed: 0.7, revealDelay: 0.15 } });
  });
}

function release(fast: boolean) {
  if (released || !engine) return;
  released = true;
  world.phase = 'intro';
  engine.showLoader = false;
  const d = fast ? 0.4 : 1.1;
  gsap.to(engine, { reveal: 2.8, duration: d * 1.2, ease: 'flux.out' });
  gsap.to(seed, { r: world.phone ? 0.5 : 0.6, k: 3.4, duration: d, ease: 'flux.out' });
  gsap.to(seed, { vivid: 0.3, duration: 3.2, delay: 0.5, ease: 'power2.out' });
  // then the marbler combs the drop: a wavy stroke and fine teeth, so the rings become a marbled pattern
  gsap.to(engine, { wave: world.phone ? 0.04 : 0.055, comb: 0.006, duration: 2.4, delay: d * 0.9, ease: 'flux.inOut' });
  engine.burst(world.W / 2, world.H / 2, seed.r * 1.2, 240);
  gsap.to(['.loader-status', '.loader-skip'], { opacity: 0, duration: 0.25, ease: 'none', onComplete: () => $('loader').classList.add('is-done') });
  name?.reveal(fast ? 0 : 0.3);
  introText(fast ? 0.1 : 0.75);
  measure();
  lenis?.start();
  const m = /^#\/work\/(.+)$/.exec(location.hash);
  const k = m ? projects.findIndex((p) => p.slug === m[1]) : -1;
  if (k >= 0 || fast) {
    gsap.delayedCall(fast ? 0.05 : 0.6, () => {
      lenis?.scrollTo(geo.workTop + Math.max(0, k) * work!.pinPer, { immediate: true, force: true });
      world.pull = 1;
      work!.develop();
      if (k >= 0) {
        work!.jumpTo(k);
        project!.pushed = false;
        gsap.delayedCall(0.7, () => work!.openFocused(k));
      }
    });
  }
}

/** Reduced motion or no WebGL: a still field, the plain page, crossfades only. */
function releaseStill() {
  if (released) return;
  released = true;
  world.phase = 'intro';
  if (!name) {
    name = new NameType(document.querySelector('[data-name]') as HTMLElement);
    name.el.classList.add('is-split');
  }
  name.rest();
  // copy that promises motion does not apply here
  $('intro-hint').textContent = world.rm ? 'Reduced motion is on, so the ink holds still.' : 'The ink needs WebGL2, so it holds still here.';
  $('honours-hint').hidden = true;
  if (engine && engine.ready) {
    engine.simulate = false;
    engine.showLoader = false;
    seed.r = world.phone ? 0.5 : 0.6;
    seed.k = 3.4;
    seed.vivid = 0.3;
    engine.drift = [0.12, -0.05];
    engine.wave = 0.055;
    engine.comb = 0.006;
    engine.reveal = 2.8;
    engine.dim = 0.85;
    engine.frame(1 / 60);
  }
  world.coverCanvases.forEach((c, i) => {
    const el = document.querySelector<HTMLElement>(`[data-cover="${i}"]`);
    if (el && c) el.style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.85)})`;
  });
  gsap.to('.loader', { opacity: 0, duration: 0.25, ease: 'none', onComplete: () => $('loader').classList.add('is-done') });
  introText(0);
  const m = /^#\/work\/(.+)$/.exec(location.hash);
  const k = m ? projects.findIndex((p) => p.slug === m[1]) : -1;
  if (k >= 0) project!.open(k, { x: world.W / 2, y: world.H / 2, w: 100, h: 100 }, [0.5, 0.5]);
}

// ---------------------------------------------------------------- pointer
const P = world.pointer;
let accX = 0, accY = 0, lastMove = 0;
window.addEventListener(
  'pointermove',
  (e) => {
    const now = performance.now();
    const dt = Math.max(1, now - lastMove);
    lastMove = now;
    if (P.seen) {
      const dx = e.clientX - P.x, dy = e.clientY - P.y;
      accX += dx;
      accY += dy;
      P.vx = P.vx * 0.5 + (dx / dt) * 0.5;
      P.vy = P.vy * 0.5 + (dy / dt) * 0.5;
      P.speed = Math.hypot(P.vx, P.vy);
    }
    P.x = e.clientX;
    P.y = e.clientY;
    P.seen = true;
  },
  { passive: true },
);
document.addEventListener('pointerleave', () => (P.seen = false));
$('intro').addEventListener('click', (e) => {
  if (world.phase !== 'intro' || (e.target as HTMLElement).closest('a, button')) return;
  addDrop(e.clientX, e.clientY);
});
$('contact').addEventListener('click', (e) => {
  if (world.phase !== 'intro' || (e.target as HTMLElement).closest('a, button')) return;
  addDrop(e.clientX, e.clientY);
});
function addDrop(x: number, y: number) {
  if (!engine || world.rm || !released) return;
  const mine = engine.drops.filter((d) => d !== seed);
  if (mine.length >= 4) (mine[0] as any).life = world.t - (mine[0] as any).born;
  if (mine.length >= 5) engine.drops.splice(engine.drops.indexOf(mine[0]), 1);
  dropInk(x, y, world.phone ? 0.07 : 0.085, 1);
}

// ---------------------------------------------------------------- lenses (rects cached; refreshed on resize and state changes)
const navLens = new Spring(0, { k: 120, c: 20 });
const lensRects: Record<string, Lens> = {};
function rectLens(el: Element): Lens {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, hw: r.width / 2, hh: r.height / 2, r: Math.min(r.height / 2, 24), on: 0 };
}
function measureLenses() {
  lensRects.nav = rectLens(document.querySelector('.top-nav')!);
  lensRects.close = rectLens($('project-close'));
}

// ---------------------------------------------------------------- phone header: hide on the way down, a solid band on the way up
const top = $('top');
let headerHidden = false, headerSolid = false, lastHeaderY = 0;
function header(sy: number) {
  if (!world.phone) {
    if (headerHidden || headerSolid) {
      headerHidden = headerSolid = false;
      top.classList.remove('is-hidden', 'is-solid');
    }
    return;
  }
  const past = sy > world.H * 0.6;
  const dy = sy - lastHeaderY;
  if (Math.abs(dy) > 6) {
    const hide = past && dy > 0 && world.phase !== 'open';
    if (hide !== headerHidden) top.classList.toggle('is-hidden', (headerHidden = hide));
    lastHeaderY = sy;
  }
  if (past !== headerSolid) top.classList.toggle('is-solid', (headerSolid = past));
}

// ---------------------------------------------------------------- the loop
const fieldDim = new Spring(1, { k: 60, c: 15 });
const fieldDefocus = new Spring(0, { k: 60, c: 15 });
let lastScroll = 0;
let glLive = false;
let contactDropped = false;
buildPage();
setupScroll();
if (lenis) gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

function tick(_time: number, deltaMs: number) {
  const dt = Math.min(deltaMs / 1000, 1 / 20);
  world.t += dt;
  const t = world.t;

  // boot slices (also in reduced motion: covers are needed for the grid)
  if (!bootDone) {
    const r = bootGen.next();
    if (r.done) bootDone = true;
  }
  if (!released && loaded && (world.rm || !engine)) releaseStill();
  if (!engine || world.rm) return;

  // --- scroll (no layout reads)
  const sy = window.scrollY;
  const dScroll = sy - lastScroll;
  lastScroll = sy;
  world.scrollY = sy;
  world.pull = released ? clamp(sy / geo.introH, 0, 1) : 0;
  if (work) {
    const into = sy - geo.workTop;
    const len = work.scrollLen();
    work.setScroll(into);
    work.stageTop = into < 0 ? -into : into > len ? len - into : 0;
    if (into >= -2 && released) work.develop();
  }
  header(sy);
  honours?.read();
  if (!contactDropped && released && sy >= geo.maxScroll - 6) {
    contactDropped = true;
    gsap.delayedCall(0.3, () => {
      const r = $('contact-big').getBoundingClientRect();
      dropInk(r.left + r.width * 0.62, r.top + r.height * 0.5, 0.15, 1);
    });
  }

  // --- loader
  if (!released) {
    shown = Math.min((done + partial) / TASKS, shown + dt / 0.9);
    dropR.target = 0.02 + 0.2 * shown; // the drop grows in step with real progress
    dropR.step(dt);
    seed.r = dropR.x;
    engine.reveal = seed.r * 1.03 + 0.006;
    if (loaded && shown >= 0.999) {
      if (holdAt < 0) holdAt = t;
      if (t - holdAt > (skipReq ? 0 : 0.28) && engine.ready) release(skipReq);
    } else if (skipReq && loaded && engine.ready) release(true);
    if (loaded && !engine.ready && engine.stepsLeft === 0) release(true);
  }

  // --- drops: grow, glow, heal
  for (let i = engine.drops.length - 1; i >= 0; i--) {
    const d = engine.drops[i] as any;
    if (d === seed) continue;
    const age = t - d.born;
    if (age < d.life) {
      d.r = d.size * easeOutExpo(clamp(age / 1.1, 0, 1));
      d.vivid = Math.max(0.28, 1 - age / 3.5);
    } else {
      const h = clamp((age - d.life) / 1.6, 0, 1);
      d.r = d.size * (1 - easeInOut(h));
      if (h >= 1) engine.drops.splice(i, 1);
    }
  }
  // the surface drifts, off-centre, up and to the left
  if (released) {
    engine.drift[0] += dt * 0.016;
    engine.drift[1] -= dt * 0.007;
  }

  // --- pointer stirs the ink
  if (P.seen && (accX || accY)) {
    const cap = 60;
    engine.stir(P.x, P.y, clamp(accX, -cap, cap), clamp(accY, -cap, cap), world.phone ? 1.6 : 1.2);
    accX = accY = 0;
  }
  P.speed *= Math.exp(-dt * 6);
  P.vx *= Math.exp(-dt * 6);
  P.vy *= Math.exp(-dt * 6);
  engine.pointer = [P.x, P.y];

  // --- scroll carries the surface (parallax)
  const lambda = 0.35;
  engine.scroll = (lambda * sy) / world.H;
  engine.shift = [0, (lambda * dScroll) / world.H];

  // --- modules
  name?.update(dt);
  const draws: PlaneDraw[] = [];
  if (work && released) work.update(dt, draws);
  if (project) project.update(draws);
  honours?.update(dt);
  engine.planes = draws;

  // --- field mood by section
  if (work) {
    const H = world.H;
    const st = work.stageTop;
    const vis = released ? clamp(1 - Math.abs(st) / H, 0, 1) : 0;
    const pullSoft = clamp((world.pull - 0.15) / 0.55, 0, 1);
    const open = world.phase === 'open' && project && project.state !== 'closing';
    fieldDim.target = open ? 0.36 : 1 - 0.42 * vis;
    fieldDefocus.target = open ? 0.85 : Math.max(pullSoft * (st > 1 ? 1 : 0), vis * 0.72);
    fieldDim.step(dt);
    fieldDefocus.step(dt);
    engine.dim = fieldDim.x;
    engine.defocus = clamp(fieldDefocus.x, 0, 1);
  }

  // --- lenses
  navLens.target = released && world.phase !== 'open' && !headerHidden && !headerSolid ? 1 : 0;
  navLens.step(dt);
  const lens = (k: string, on: number): Lens => ({ ...(lensRects[k] || { x: 0, y: 0, hw: 0, hh: 0, r: 0 }), on });
  engine.lenses = [lens('nav', navLens.x), lens('close', project ? project.lensOn : 0)];

  engine.frame(dt);
  if (released) engine.govern(deltaMs);
  if (!glLive) {
    glLive = true;
    html.classList.add('gl-live');
  }
}
gsap.ticker.add(tick);

// ---------------------------------------------------------------- resize
let rz = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(rz);
  rz = requestAnimationFrame(() => {
    viewport();
    engine?.resize();
    work?.layout();
    sizeWork();
    name?.fit();
    measure();
    if (world.rm && engine?.ready) engine.frame(1 / 60);
  });
});
document.fonts.ready.then(() => {
  if (released) measure();
});

// a debug handle for checks (no secrets, read-only use)
(window as any).__flux = { world, seed, geo, get work() { return work; }, get project() { return project; }, get name() { return name; }, get engine() { return engine; } };
