// The app chunk: GSAP (ScrollTrigger, SplitText, Flip, ScrambleText, DrawSVG, CustomEase), Lenis, the entry release,
// the theatre, honours, contact and the project view, all driven from one ticker.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { Flip } from 'gsap/Flip';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { CustomEase } from 'gsap/CustomEase';
import Lenis from 'lenis';
import type { Stage, LensParams, Shape } from './gl/stage';
import type { LensRig } from './lens';
import { damp, clamp01 } from './lens';
import { initTheatre, type Theatre } from './theatre';
import { initProject, type ProjectView } from './project';
import { initSections, type Sections } from './sections';
import type { Project } from './content';
import { $, $$, coverOf } from './util';

gsap.registerPlugin(ScrollTrigger, SplitText, Flip, ScrambleTextPlugin, DrawSVGPlugin, CustomEase);
CustomEase.create('glass', '0.16, 1, 0.3, 1');

export interface Ctx {
  stage: Stage | null;
  rig: LensRig | null;
  motion: boolean;
  phone: boolean;
  lenis: Lenis | null;
  projects: Project[];
  pointer: { x: number; y: number; t: number; down: boolean };
  pvOpen: boolean;
  theatre: Theatre | null;
  project: ProjectView | null;
  sections: Sections | null;
  light: [number, number];
}


/** Fit the name so its widest line (with the indent) fills the column, capped by the viewport. */
function fitName(phone: boolean) {
  const root = document.documentElement;
  const name = $('.intro__name');
  const inner = $('.intro__inner');
  const lines = $$('.nl');
  name.style.fontSize = '100px';
  void name.offsetWidth;
  const avail = inner.clientWidth;
  let need = 1;
  lines.forEach((l, i) => {
    const w = l.getBoundingClientRect().width + (i === 1 ? (phone ? 32 : 62) : 0);
    need = Math.max(need, w);
  });
  const cap = phone ? Math.min(innerWidth * 0.3, innerHeight * 0.2) : Math.min(innerWidth * 0.19, innerHeight * 0.33);
  const fs = Math.min(cap, (100 * avail) / need);
  name.style.fontSize = `${fs.toFixed(1)}px`;
  root.style.setProperty('--ns', `${fs.toFixed(1)}px`);
}

export function start({ stage, rig, motion, skipped }: { stage: Stage | null; rig: LensRig | null; motion: boolean; skipped: boolean }) {
  const html = document.documentElement;
  const data = JSON.parse($('#r-data').textContent || '{}') as { projects: Project[] };
  const phone = innerWidth < 760;
  const ctx: Ctx = {
    stage,
    rig,
    motion,
    phone,
    lenis: null,
    projects: data.projects,
    pointer: { x: innerWidth / 2, y: innerHeight / 2, t: -10, down: false },
    pvOpen: false,
    theatre: null,
    project: null,
    sections: null,
    light: [-0.55, -0.8],
  };
  if (stage) stage.frozen = !motion;
  if (rig && !motion) {
    rig.calm = true;
    rig.follow = false;
  }
  const introEl = $('.intro');

  fitName(phone);

  // the name: chars, each masked by its line, mirrored into the glass
  const nameChars: HTMLElement[] = [];
  $$('.nl').forEach((l) => {
    const sp = SplitText.create(l, { type: 'chars', aria: 'none', charsClass: 'nc' });
    nameChars.push(...(sp.chars as HTMLElement[]));
    stage?.mirror.add(l, sp.chars as HTMLElement[]);
  });

  if (motion) {
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    ctx.lenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    lenis.stop();
  }
  gsap.ticker.lagSmoothing(0);

  ctx.theatre = motion ? initTheatre(ctx) : null;
  ctx.sections = initSections(ctx);
  ctx.project = initProject(ctx);
  if (!motion) bindCalmPlates(ctx);

  // pointer
  addEventListener(
    'pointermove',
    (e) => {
      ctx.pointer.x = e.clientX;
      ctx.pointer.y = e.clientY;
      ctx.pointer.t = performance.now() / 1000;
      if (motion && e.pointerType === 'mouse') rig?.setPointer(e.clientX, e.clientY, ctx.pointer.t);
    },
    { passive: true },
  );

  // nav: smooth jumps that respect the theatre
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href')!.slice(1);
      if (!ctx.lenis && id !== 'work') return;
      e.preventDefault();
      if (ctx.pvOpen) ctx.project?.close();
      if (id === 'work') {
        if (ctx.theatre) ctx.theatre.goTo(0);
        else $('#work').scrollIntoView();
        return;
      }
      if (id === 'top' || id === '') ctx.lenis?.scrollTo(0, { duration: 1.6 });
      else ctx.lenis?.scrollTo(`#${id}`, { duration: 1.6 });
    });
  });
  $('.skip').addEventListener('click', (e) => {
    e.preventDefault();
    if (ctx.theatre) ctx.theatre.goTo(0, true);
    else $('#work').scrollIntoView();
    ($('.chapter.is-on .open') ?? $('.open')).focus({ preventScroll: true });
  });

  // resize
  let rz = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => {
      ctx.phone = innerWidth < 760;
      fitName(ctx.phone);
      stage?.resize();
      rig?.layout();
      ScrollTrigger.refresh();
    });
  });

  // the loop: lenis, sections, theatre, lens, then one GL frame
  let lastLight: [number, number] = [-0.55, -0.8];
  const lv = { x: { v: 0 }, y: { v: 0 } };
  gsap.ticker.add((time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    ctx.lenis?.raf(time * 1000);
    // light follows the hand: the specular and rim catch it
    const px = clamp01(ctx.pointer.x / innerWidth) - 0.5;
    const py = clamp01(ctx.pointer.y / innerHeight) - 0.5;
    const tl: [number, number] = [-0.55 + px * 1.1, -0.8 + py * 0.7];
    lastLight = [damp(lastLight[0], tl[0], lv.x, 0.25, dt), damp(lastLight[1], tl[1], lv.y, 0.25, dt)];
    ctx.light = lastLight;
    for (const p of calmPlates) p.visible = !ctx.pvOpen;
    if (rig) {
      rig.extras = [];
      if (!motion) {
        const r = introEl.getBoundingClientRect();
        rig.anchor = { x: r.left + r.width * (ctx.phone ? 0.62 : 0.63), y: r.top + r.height * 0.6 };
      }
    }
    ctx.theatre?.frame(dt, time);
    ctx.project?.frame(dt, time);
    ctx.sections?.frame(dt, time);
    if (rig && stage) {
      rig.update(dt, time);
      // the liquid answers the hand: fast scrolling ripples the glass, rest stills it
      if (ctx.lenis) stage.lens.wobble = Math.max(stage.lens.wobble, Math.min(0.32, Math.abs(ctx.lenis.velocity) * 0.005));
      stage.lens.light = ctx.sections?.lightOverride(ctx.light) ?? ctx.light;
      stage.render(dt);
    }
  });

  // a small handle for the evidence scripts (no effect on the page)
  (window as unknown as { __r: unknown }).__r = {
    ctx,
    scrollS(v: number) {
      const st = ScrollTrigger.getAll().find((t) => t.vars.pin);
      if (!st) return;
      const y = st.start + v * innerHeight;
      if (ctx.lenis) ctx.lenis.scrollTo(y, { immediate: true, force: true });
      else scrollTo(0, y);
    },
    scrollY(y: number) {
      if (ctx.lenis) ctx.lenis.scrollTo(y, { immediate: true, force: true });
      else scrollTo(0, y);
    },
    scrollToSel(sel: string) {
      const el = document.querySelector(sel) as HTMLElement;
      if (ctx.lenis) ctx.lenis.scrollTo(el, { immediate: true, force: true });
      else el.scrollIntoView();
    },
  };

  // entry: the release
  const pre = $('#pre');
  const preNum = $('.pre__num');
  const kicker = $('.intro__k');
  const tag = $('.intro__ph');
  const bar = $('.bar');
  const enter = () => {
    html.classList.add('is-in');
    pre.setAttribute('aria-hidden', 'true');
    ctx.lenis?.start();
    ScrollTrigger.refresh();
    const hash = location.hash.match(/^#\/(project-\d\d)$/);
    if (hash) {
      const i = ctx.projects.findIndex((p) => p.slug === hash[1]);
      if (i >= 0) {
        if (ctx.theatre) ctx.theatre.goTo(i, true);
        setTimeout(() => ctx.project?.open(i, false), 120);
      }
    }
  };
  if (motion && rig) {
    const tl = gsap.timeline();
    const hold = skipped ? 0 : 0.18;
    tl.to(preNum, { yPercent: -130, duration: 0.4, ease: 'power2.in' }, hold);
    tl.to(rig, { surge: 1, duration: 0.3, ease: 'power2.out' }, hold);
    tl.to(rig, { surge: 0, duration: 1.1, ease: 'glass' }, hold + 0.3);
    tl.add(() => rig.release(), hold + 0.24);
    tl.fromTo(nameChars, { yPercent: 130 }, { yPercent: 0, duration: 1.1, ease: 'glass', stagger: 0.035 }, hold + 0.2);
    tl.fromTo(kicker, { yPercent: 115 }, { yPercent: 0, duration: 1.1, ease: 'glass' }, hold + 0.55);
    tl.fromTo([tag, bar], { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out' }, hold + 0.75);
    tl.add(() => {
      pre.style.display = 'none';
      stage?.mirror.remove(preNum);
    }, hold + 0.5);
    tl.add(enter, hold + 0.5);
  } else {
    if (rig) {
      rig.release();
      rig.travel = 0;
    }
    pre.style.display = 'none';
    stage?.mirror.remove(preNum);
    enter();
  }
}

const calmPlates: { visible: boolean }[] = [];

/** Calm mode: each chapter carries its own still plate. */
function bindCalmPlates(ctx: Ctx) {
  const stage = ctx.stage;
  if (!stage) return;
  $$('.chapter__digits').forEach((d) => stage.mirror.add(d, [d]));
  $$('.chapter__plate').forEach((el, i) => {
    const p = ctx.projects[i];
    const plate = { el, rect: null, a: coverOf(p), b: null, split: 0, dir: 0, exposure: 1, hover: 0, visible: true };
    stage.plates.push(plate);
    calmPlates.push(plate);
  });
}

export type { LensParams, Shape };
