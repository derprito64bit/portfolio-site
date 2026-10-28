// The open project: the chosen plate becomes the page (GSAP Flip carries the plate's rect into the hero; the GL cover
// follows the DOM rect). The slab becomes a droplet resting on the hero's edge. Detail rises after the landing; the
// way back is faster. History: #/project-0n, Esc and Back close.
import gsap from 'gsap';
import { Flip } from 'gsap/Flip';
import { SplitText } from 'gsap/SplitText';
import type { Ctx } from './app';
import type { Plate, Shape, LensParams } from './gl/stage';
import { lerpParams, lerpShape } from './lens';
import { $, $$, coverOf, rectOf } from './util';

export interface ProjectView {
  open(i: number, animate: boolean): void;
  close(): void;
  frame(dt: number, time: number): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function initProject(ctx: Ctx): ProjectView {
  const html = document.documentElement;
  const { stage, rig } = ctx;
  const pv = $('#pv');
  const scroller = $('#pv-scroll');
  scroller.setAttribute('data-lenis-prevent', '');
  const hero = $('.pv__hero');
  const digits = $('.pv__digits');
  const label = $('.pv__label');
  const title = $('.pv__title');
  const meta = $('.pv__meta');
  const body = $('.pv__body');
  const media = $('.pv__media');
  const nextB = $('.pv__nextb');
  const nextN = $('.pv__nextn');
  const back = $('.pv__back');
  const main = $('main');
  const bar = $('.bar');

  const plate: Plate = { el: hero, rect: null, a: coverOf(ctx.projects[0]), b: null, split: 0, dir: 0, exposure: 1, hover: 0, visible: false };
  stage?.plates.push(plate);

  let current = -1;
  let busy = false;
  let flipTl: gsap.core.Timeline | null = null;
  let lastFocus: HTMLElement | null = null;
  let splits: SplitText[] = [];
  let digitSplit: SplitText | null = null;
  const pvT = { v: 0 };
  let fromShape: Shape | null = null;
  let fromParams: LensParams | null = null;

  function fill(i: number) {
    const p = ctx.projects[i];
    splits.forEach((s) => s.revert());
    splits = [];
    if (digitSplit) {
      stage?.mirror.remove(digits);
      digitSplit.revert();
    }
    digits.textContent = p.num;
    digitSplit = SplitText.create(digits, { type: 'chars', aria: 'none' });
    stage?.mirror.add(digits, digitSplit.chars as HTMLElement[]);
    label.textContent = `Project ${p.num}`;
    title.textContent = p.title;
    const ph = (v: string, f: string) => (v ? esc(v) : `[PLACEHOLDER: ${f}]`);
    meta.innerHTML = [
      ['Role', ph(p.role, 'my role')],
      ['Year', ph(p.year, 'year')],
      ['Kind', '[PLACEHOLDER: kind of project]'],
      ['Tools', p.tools.length ? esc(p.tools.join(', ')) : '[PLACEHOLDER: tools]'],
    ]
      .map(([k, v]) => `<div><dt>${k}</dt><dd class="ph">${v}</dd></div>`)
      .join('');
    body.innerHTML = [p.blurb, ...p.body].map((t) => `<p class="ph">${esc(t)}</p>`).join('') + `<p class="ph">[PLACEHOLDER: link to the repository or demo]</p>`;
    const items = p.media.length ? p.media : [{ type: 'image', alt: '[PLACEHOLDER: images and video of this project]', caption: '' }];
    media.innerHTML = items
      .map((m) => `<figure class="pv__fig"><div class="pv__slot">${esc(m.alt)}<br>${m.type === 'video' ? 'Video' : 'Image'} slot</div>${m.caption ? `<figcaption class="ph">${esc(m.caption)}</figcaption>` : ''}</figure>`)
      .join('');
    const n = ctx.projects[(i + 1) % ctx.projects.length];
    nextN.textContent = `Project ${n.num}`;
    plate.a = coverOf(p);
    plate.b = null;
    if (ctx.motion) {
      [label, title, ...$$('dt, dd', meta), ...$$('p', body)].forEach((el) => {
        splits.push(SplitText.create(el, { type: 'lines', mask: 'lines', aria: 'none' }));
      });
    }
  }

  const detailTargets = () => ({
    chars: (digitSplit?.chars ?? []) as HTMLElement[],
    lines: splits.flatMap((s) => s.lines as HTMLElement[]),
    rest: [...$$('.pv__fig', media), $('.pv__next'), back],
  });

  function detailIn(delay: number) {
    const d = detailTargets();
    gsap.fromTo(d.chars, { yPercent: 130 }, { yPercent: 0, duration: 1.1, ease: 'glass', stagger: 0.07, delay });
    gsap.fromTo(d.lines, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: 'glass', stagger: 0.025, delay: delay + 0.1 });
    gsap.fromTo(d.rest, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power1.out', stagger: 0.1, delay: delay + 0.3 });
  }

  function detailOut(dur = 0.25) {
    const d = detailTargets();
    gsap.killTweensOf([...d.chars, ...d.lines, ...d.rest]);
    gsap.to(d.chars, { yPercent: -130, duration: dur, ease: 'power2.in' });
    gsap.to(d.lines, { yPercent: -110, duration: dur, ease: 'power3.in' });
    gsap.to(d.rest, { opacity: 0, duration: dur * 0.8 });
  }

  function open(i: number, animate: boolean) {
    if (busy || (ctx.pvOpen && current === i)) return;
    busy = true;
    lastFocus = document.activeElement as HTMLElement;
    current = i;
    fill(i);
    const fromEl = ctx.theatre ? ctx.theatre.stagePlate : $$('.chapter__plate')[i];
    const state = Flip.getState(fromEl);
    fromShape = ctx.theatre?.shape ?? null;
    fromParams = ctx.theatre?.params ?? null;
    pv.hidden = false;
    scroller.scrollTop = 0;
    html.classList.add('pv-open');
    ctx.pvOpen = true;
    ctx.lenis?.stop();
    if (location.hash !== `#/${ctx.projects[i].slug}`) history.pushState({ pv: i }, '', `#/${ctx.projects[i].slug}`);
    plate.visible = true;
    if (ctx.theatre) ctx.theatre.plate.visible = false;

    const done = () => {
      busy = false;
      back.focus({ preventScroll: true });
    };
    if (!ctx.motion || !animate) {
      gsap.fromTo(pv, { opacity: 0 }, { opacity: 1, duration: ctx.motion ? 0.4 : 0.3 });
      gsap.to(main, { opacity: 0, duration: 0.3 });
      gsap.to(bar, { autoAlpha: 0, duration: 0.3 });
      pvT.v = 1;
      if (ctx.motion) detailIn(0.1);
      done();
      return;
    }
    gsap.set(pv, { opacity: 1 });
    gsap.set([...detailTargets().rest], { opacity: 0 });
    gsap.set(detailTargets().chars, { yPercent: 130 });
    gsap.set(detailTargets().lines, { yPercent: 110 });
    flipTl = Flip.from(state, { targets: hero, duration: 1.05, ease: 'glass', onComplete: done });
    gsap.to(main, { opacity: 0, duration: 0.45, ease: 'power2.out' });
    gsap.to(bar, { autoAlpha: 0, duration: 0.3 });
    gsap.to(pvT, { v: 1, duration: 1.05, ease: 'glass' });
    detailIn(0.72);
  }

  function close() {
    if (!ctx.pvOpen) return;
    flipTl?.kill();
    busy = true;
    const i = current;
    if (location.hash.startsWith('#/')) history.pushState({}, '', location.pathname + location.search);
    const finish = () => {
      gsap.set(hero, { clearProps: 'transform,width,height,top,left,position' });
      pv.hidden = true;
      plate.visible = false;
      html.classList.remove('pv-open');
      ctx.pvOpen = false;
      if (ctx.theatre) ctx.theatre.plate.visible = true;
      ctx.lenis?.start();
      busy = false;
      const own = document.querySelector<HTMLElement>(`#${ctx.projects[current].slug} .open`);
      const target = own && !own.closest('[inert]') ? own : lastFocus;
      target?.focus({ preventScroll: true });
    };
    if (!ctx.motion || !stage) {
      gsap.to(pv, { opacity: 0, duration: 0.25, onComplete: finish });
      gsap.to(main, { opacity: 1, duration: 0.3 });
      gsap.to(bar, { autoAlpha: 1, duration: 0.3 });
      pvT.v = 0;
      return;
    }
    detailOut(0.22);
    const toEl = ctx.theatre ? ctx.theatre.stagePlate : $$('.chapter__plate')[i];
    const state = Flip.getState(hero);
    // the theatre's plate takes the hero's place and flies home under Flip
    ctx.pvOpen = false;
    plate.visible = false;
    if (ctx.theatre) ctx.theatre.plate.visible = true;
    gsap.to(main, { opacity: 1, duration: 0.45, delay: 0.15, ease: 'power1.inOut' });
    gsap.to(bar, { autoAlpha: 1, duration: 0.4, delay: 0.3 });
    gsap.to(pvT, { v: 0, duration: 0.68, ease: 'power3.inOut' });
    Flip.from(state, { targets: toEl, duration: 0.68, ease: 'power3.inOut', onComplete: finish });
  }

  function next() {
    if (busy) return;
    const i = (current + 1) % ctx.projects.length;
    busy = true;
    detailOut(0.3);
    const sweep = { u: 0 };
    gsap.to(scroller, {
      scrollTop: 0,
      duration: ctx.motion ? 0.7 : 0,
      ease: 'power3.inOut',
      onComplete: () => {
        plate.b = coverOf(ctx.projects[i]);
        plate.dir = 1;
        const r = rectOf(hero);
        gsap.to(sweep, {
          u: 1,
          duration: ctx.motion ? 1.0 : 0.01,
          ease: 'power2.inOut',
          onUpdate: () => {
            const rr = rectOf(hero);
            plate.split = rr.x + rr.w + 2 - (rr.w + 4) * sweep.u;
            sweepX = plate.split;
          },
          onComplete: () => {
            sweepX = null;
            current = i;
            fill(i);
            if (location.hash !== `#/${ctx.projects[i].slug}`) history.replaceState({ pv: i }, '', `#/${ctx.projects[i].slug}`);
            if (ctx.theatre && ctx.lenis) ctx.lenis.scrollTo(ctx.theatre.scrollForChapter(i), { immediate: true, force: true });
            gsap.set(detailTargets().chars, { yPercent: 130 });
            gsap.set(detailTargets().lines, { yPercent: 110 });
            detailIn(0.05);
            busy = false;
          },
        });
        void r;
      },
    });
  }
  let sweepX: number | null = null;

  $$('.open').forEach((b) =>
    b.addEventListener('click', () => {
      const i = ctx.projects.findIndex((p) => p.slug === b.dataset.open);
      if (i >= 0) open(i, true);
    }),
  );
  back.addEventListener('click', () => close());
  nextB.addEventListener('click', () => next());
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ctx.pvOpen) close();
    if (e.key === 'Tab' && ctx.pvOpen) {
      // keep focus inside the dialog
      const f = $$('button, a[href]', pv).filter((el) => !el.hasAttribute('disabled'));
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  addEventListener('popstate', () => {
    const m = location.hash.match(/^#\/(project-\d\d)$/);
    if (!m && ctx.pvOpen) close();
    else if (m && !ctx.pvOpen) {
      const i = ctx.projects.findIndex((p) => p.slug === m[1]);
      if (i >= 0) open(i, true);
    }
  });

  return {
    open,
    close,
    frame(dt: number) {
      if (!rig) return;
      const t = pvT.v;
      if (t <= 0.0001 && !ctx.pvOpen) return;
      const vw = innerWidth;
      const vh = innerHeight;
      const H = rectOf(hero);
      const m = Math.min(vw, vh);
      const r = m * (vw < 760 ? 0.17 : 0.13);
      const drop: Shape = { x: H.x + H.w * (vw < 760 ? 0.72 : 0.79), y: H.y + H.h, hw: r, hh: r, r, rot: 0 };
      const slabAsDrop: Shape | null = sweepX !== null ? { x: sweepX, y: H.y + H.h / 2, hw: Math.max(40, vw * 0.045), hh: H.h / 2 + 30, r: Math.max(40, vw * 0.045), rot: 0 } : null;
      const dropP: LensParams = { ...rig.base, bevel: r * 0.85, refract: r * 0.36, mag: 0.14, disp: 0.36, k: r * 0.5 };
      const target = slabAsDrop ?? drop;
      const from = fromShape ?? target;
      rig.script.w = Math.max(rig.script.w, t);
      rig.script.shape = lerpShape(ctx.theatre?.shape ?? from, target, t);
      rig.script.params = lerpParams(ctx.theatre?.params ?? fromParams ?? dropP, dropP, t);
      // the loupe over the hero
      const p = ctx.pointer;
      const L = rig.loupe;
      const inHero = ctx.pvOpen && !busy && vw >= 760 && p.x > H.x && p.x < H.x + H.w && p.y > H.y && p.y < H.y + H.h;
      if (inHero && !L.on && L.r < 1) {
        L.x = drop.x;
        L.y = drop.y;
      }
      L.on = inHero;
      L.tr = Math.min(96, H.h * 0.14);
      L.tx = inHero ? p.x : drop.x;
      L.ty = inHero ? p.y : drop.y;
      plate.hover = inHero ? 1 : 0;
      void dt;
    },
  };
}
