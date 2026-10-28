// Flux: boot, the preloader that really loads, the single loop, and the scroll.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import { Engine, type Drop, type PlaneDraw, type Lens } from './gl/engine';
import { projects, seedOf } from './content';
import { recipe } from './covers';
import { world, dropInk } from './world';
import { NameType } from './type';
import { Work } from './work';
import { ProjectView } from './project';
import { Honours } from './honours';
import { Spring, FIRM, clamp, easeOutExpo, easeInOut } from './spring';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, CustomEase);
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

// ---------------------------------------------------------------- engine
let engine: Engine | null = null;
try {
  engine = new Engine($('gl') as HTMLCanvasElement, lowPower);
} catch (err) {
  console.warn('[flux] still page: no WebGL2 with half-float targets', err);
  engine = null;
  html.classList.add('no-gl');
}
world.engine = engine;

// the ink drop the page starts from
const seed: Drop = { x: 0, y: 0, r: 0.012, k: 7, vivid: 0.62 };
if (engine) {
  engine.drops.push(seed);
  engine.reveal = 0.02;
}

// ---------------------------------------------------------------- loader
const TASKS = 3 + projects.length;
let done = 0;
let shown = 0;
let loaded = false;
let released = false;
let holdAt = -1;
let skipReq = false;
const dropR = new Spring(0.012, FIRM);
const taskEl = $('loader-task');
$('loader-total').textContent = String(TASKS);
function complete(label: string) {
  done++;
  $('loader-done').textContent = String(done);
  gsap.to(taskEl, { duration: 0.25, scrambleText: { text: label, chars: 'lowerCase', speed: 1 }, overwrite: true });
}
const frameP = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

let name: NameType | null = null;
let work: Work | null = null;
let project: ProjectView | null = null;
let honours: Honours | null = null;

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

async function load() {
  const font = document.fonts
    .load("300 100px 'Flux Flex'")
    .then(() => document.fonts.ready)
    .then(() => complete('type'));
  if (engine) {
    engine.frame(1 / 60);
    complete('shaders');
  } else complete('shaders');
  await font;
  // the name can be split and measured now
  name = new NameType(document.querySelector('[data-name]') as HTMLElement);
  name.el.classList.add('is-split');
  for (const p of projects) {
    await frameP();
    if (engine) {
      const rc = recipe(p.slug, p.index, p.tint);
      const tex = engine.makeCover({ seed: seedOf(p.slug) * 10 + p.index, ...rc, label: labelCanvas(p.n) }, lowPower ? 768 : 960, lowPower ? 960 : 1200);
      world.covers[p.index] = tex;
      if (world.rm) world.coverCanvases[p.index] = engine.coverToCanvas(tex);
    }
    complete(`cover ${p.n}`);
  }
  await frameP();
  await frameP();
  complete('first frame');
  loaded = true;
}

const timeout = new Promise<void>((r) => setTimeout(r, 8000));
Promise.race([load(), timeout]).then(() => {
  loaded = true;
  if (world.rm || !engine) releaseStill();
});

$('skip').addEventListener('click', () => {
  skipReq = true;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !released && document.activeElement === document.body) skipReq = true;
});

// ---------------------------------------------------------------- the page modules
let lenis: any = null;
function buildPage() {
  work = new Work();
  project = new ProjectView(work);
  honours = new Honours();
  work.onOpen = (k, cell, uv) => project!.open(k, { x: cell.x, y: cell.y, w: cell.w, h: cell.h }, uv);
  project.onState = () => {};
  document.querySelectorAll<HTMLAnchorElement>('.work-cell-link').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const r = a.getBoundingClientRect();
      project!.open(Number(a.dataset.i), { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }, [0.5, 0.5]);
    }),
  );
}

function setupScroll() {
  if (world.rm || !engine) return;
  lenis = new Lenis({ autoRaf: false, lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.9 });
  world.lenis = lenis;
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  lenis.stop();
  ScrollTrigger.create({
    trigger: '#intro',
    start: 'top top',
    end: 'bottom top',
    onUpdate: (s) => (world.pull = s.progress),
  });
  ScrollTrigger.create({
    trigger: '#work',
    start: 'top top',
    end: () => `+=${work!.step * (projects.length - 1)}`,
    pin: '#work-stage',
    pinSpacing: true,
    onUpdate: (s) => (work!.travel = s.progress * work!.step * (projects.length - 1)),
    onEnter: () => work!.develop(),
    onEnterBack: () => work!.develop(),
    onLeave: () => work!.develop(),
  });
  ScrollTrigger.create({
    trigger: '#contact',
    start: 'bottom bottom+=4',
    once: true,
    onEnter: () => {
      const r = $('contact-big').getBoundingClientRect();
      gsap.delayedCall(0.35, () => {
        const r2 = $('contact-big').getBoundingClientRect();
        dropInk(r2.left + r2.width * 0.62, r2.top + r2.height * 0.5, 0.15, 1);
      });
      void r;
    },
  });
}

function scrollToId(id: string) {
  if (world.phase === 'open') return;
  let y = 0;
  if (id === 'work') {
    const st = ScrollTrigger.getAll().find((s) => s.pin);
    y = st ? st.start : ($(id).getBoundingClientRect().top + window.scrollY);
  } else if (id !== 'intro') y = $(id).getBoundingClientRect().top + window.scrollY;
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
  const d = fast ? 0.4 : 1.1;
  gsap.to(engine, { reveal: 2.8, duration: d * 1.2, ease: 'flux.out' });
  gsap.to(seed, { r: world.phone ? 0.5 : 0.6, k: 3.1, duration: d, ease: 'flux.out' });
  gsap.to(seed, { vivid: 0.14, duration: 3.2, delay: 0.5, ease: 'power2.out' });
  engine.burst(world.W / 2, world.H / 2, seed.r * 1.2, 240);
  gsap.to(['.loader-status', '.loader-skip'], { opacity: 0, duration: 0.25, ease: 'none', onComplete: () => $('loader').classList.add('is-done') });
  skipLens.target = 0;
  name?.reveal(fast ? 0 : 0.3);
  introText(fast ? 0.1 : 0.75);
  lenis?.start();
  ScrollTrigger.refresh();
  navLens.target = 1;
  const m = /^#\/work\/(.+)$/.exec(location.hash);
  const k = m ? projects.findIndex((p) => p.slug === m[1]) : -1;
  if (k >= 0 || fast) {
    gsap.delayedCall(fast ? 0.05 : 0.6, () => {
      const st = ScrollTrigger.getAll().find((s) => s.pin);
      const y = st ? st.start + Math.max(0, k) * work!.step : 0;
      lenis?.scrollTo(y, { immediate: true, force: true });
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
  if (engine) {
    engine.simulate = false;
    seed.r = world.phone ? 0.5 : 0.6;
    seed.k = 3.1;
    seed.vivid = 0.3;
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
  navLens.target = 0;
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
  if (!engine || world.rm) return;
  const mine = engine.drops.filter((d) => d !== seed);
  if (mine.length >= 4) (mine[0] as any).life = world.t - (mine[0] as any).born; // the oldest starts to heal
  if (mine.length >= 5) engine.drops.splice(engine.drops.indexOf(mine[0]), 1);
  dropInk(x, y, world.phone ? 0.07 : 0.085, 1);
}

// ---------------------------------------------------------------- lenses
const navLens = new Spring(0, { k: 120, c: 20 });
const skipLens = new Spring(1, { k: 120, c: 20 });
function lensOf(el: Element, on: number): Lens {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, hw: r.width / 2, hh: r.height / 2, r: Math.min(r.height / 2, 24), on };
}
const navEl = document.querySelector('.top-nav')!;
const skipEl = $('skip');
const closeEl = $('project-close');

// ---------------------------------------------------------------- the loop
const fieldDim = new Spring(1, { k: 60, c: 15 });
const fieldDefocus = new Spring(0, { k: 60, c: 15 });
let lastScroll = 0;
let glLive = false;
buildPage();
setupScroll();

function tick(_time: number, deltaMs: number) {
  const dt = Math.min(deltaMs / 1000, 1 / 20);
  world.t += dt;
  const t = world.t;
  if (!engine) return;
  if (world.rm) return;

  // --- reads (layout) first
  if (name && world.pull < 1 && released) name.measure();
  const sy = window.scrollY;
  const dScroll = sy - lastScroll;
  lastScroll = sy;
  world.scrollY = sy;
  honours?.read();

  // --- loader
  if (!released) {
    const target = done / TASKS;
    shown = Math.min(target, shown + dt / 1.05);
    dropR.target = 0.014 + 0.205 * easeInOut(shown);
    dropR.step(dt);
    seed.r = dropR.x;
    engine.reveal = seed.r * 1.03 + 0.006;
    if (loaded && shown >= 0.999) {
      if (holdAt < 0) holdAt = t;
      if (t - holdAt > (skipReq ? 0 : 0.28)) release(skipReq);
    } else if (skipReq && loaded) release(true);
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
  if (work) work.update(dt, draws);
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
  navLens.target = released && world.phase !== 'open' && !world.rm ? 1 : 0;
  navLens.step(dt);
  skipLens.step(dt);
  engine.lenses = [lensOf(navEl, navLens.x), lensOf(skipEl, released ? 0 : skipLens.x), lensOf(closeEl, project ? project.lensOn : 0)];

  engine.frame(dt);
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
    name?.fit();
    ScrollTrigger.refresh();
    if (world.rm && engine) engine.frame(1 / 60);
  });
});

// a debug handle for checks (no secrets, read-only use)
(window as any).__flux = { world, seed, get work() { return work; }, get project() { return project; } };
