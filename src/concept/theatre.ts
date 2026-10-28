// The theatre: one pinned sequence. Intro (the free lens) -> the lens grows into the whole frame -> an original EVF
// overlay etches on -> exposure falls to black, AF hunts and locks -> the first work exposes through it -> the frame
// shrinks onto the stage plate and the lens thins into a standing glass slab -> eight chapters, each changed by the
// slab sweeping across the plate. Scroll drives the travel (scrubbed); small detail plays at its own pace.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import type { Ctx } from './app';
import type { Plate, Shape, LensParams } from './gl/stage';
import { clamp01, damp, inOut, lerp, lerpParams, lerpShape, seg, smooth } from './lens';
import { $, $$, coverOf, lerpRect, rectOf, type Rect } from './util';

export interface Theatre {
  frame(dt: number, time: number): void;
  goTo(i: number, instant?: boolean): void;
  active(): number;
  plate: Plate;
  stagePlate: HTMLElement;
  shape: Shape | null;
  params: LensParams | null;
  scrollForChapter(i: number): number;
  debug?: () => unknown;
}

const S0 = 3.0; // chapters start
const C = 0.8; // scroll (viewport heights) per chapter
const N = 8;
const TOTAL = S0 + (N - 1) * C + 0.55;

interface Chapter {
  li: HTMLElement;
  digits: HTMLElement[];
  lines: HTMLElement[];
  open: HTMLElement;
}

export function initTheatre(ctx: Ctx): Theatre {
  const html = document.documentElement;
  html.classList.add('theatre-on');
  const { stage, rig } = ctx;
  const theatre = $('#theatre');
  const stagePlate = $('.stage__plate');
  const chaptersEl = $('.chapters');
  const intro = $('.intro');
  const evf = $('.evf');
  const af = $('.evf__af');
  const level = $('.evf__level');
  const levelSvg = $('.evf__level svg');
  const mark = $('.evf__mark');
  const hfill = $('.evf__hfill');
  const ro = Object.fromEntries($$('[data-ro]').map((el) => [el.dataset.ro!, el])) as Record<string, HTMLElement>;
  const railBtns = $$('.rail__b');

  // ---- chapters: split the numerals (mirrored) and the title lines (DOM)
  const chapters: Chapter[] = $$('.chapter').map((li) => {
    const dEl = $('.chapter__digits', li);
    const ds = SplitText.create(dEl, { type: 'chars', aria: 'none' });
    stage?.mirror.add(dEl, ds.chars as HTMLElement[]);
    const lines: HTMLElement[] = [];
    $$('.chapter__label, .chapter__name, .chapter__meta dt, .chapter__meta dd', li).forEach((el) => {
      const sp = SplitText.create(el, { type: 'lines', mask: 'lines', aria: 'none' });
      lines.push(...(sp.lines as HTMLElement[]));
    });
    const open = $('.open', li);
    li.inert = true;
    gsap.set(ds.chars, { yPercent: 130 });
    gsap.set(lines, { yPercent: 115 });
    gsap.set(open, { clipPath: 'inset(0 100% 0 0)' });
    return { li, digits: ds.chars as HTMLElement[], lines, open };
  });

  // ---- the stage plate (GL)
  const plate: Plate = { el: null, rect: { x: 0, y: 0, w: 1, h: 1 }, a: coverOf(ctx.projects[0]), b: null, split: 0, dir: 0, exposure: 0, hover: 0, visible: false };
  stage?.plates.push(plate);

  // ---- the scrubbed overlay timeline (DOM only; the glass is computed per frame from the same progress)
  let s = 0;
  gsap.set(evf, { opacity: 0 });
  gsap.set([$('.work__h'), $('.rail')], { opacity: 0 });
  const corners = $$('.evf__c path');
  const ticks = $$('.evf__tk');
  const afPath = $('.evf__af path');
  const levelPaths = $$('.evf__level path');
  gsap.set([...corners, afPath, ...levelPaths, ...ticks], { drawSVG: '0%' });
  const topItems = $$('.evf__top > *');
  const bottomItems = $$('.evf__bottom > *');
  gsap.set([...topItems, ...bottomItems, $('.evf__hist')], { opacity: 0 });

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: theatre,
      start: 'top top',
      end: () => `+=${Math.round(TOTAL * innerHeight)}`,
      pin: true,
      scrub: true,
      invalidateOnRefresh: true,
      onUpdate: (self) => (s = self.progress * TOTAL),
    },
  });
  tl.to(evf, { opacity: 1, duration: 0.1 }, 0.5)
    .to(corners, { drawSVG: '100%', duration: 0.2, stagger: 0.03 }, 0.55)
    .to(topItems, { opacity: 1, duration: 0.08, stagger: 0.025 }, 0.7)
    .to(levelPaths, { drawSVG: '100%', duration: 0.18 }, 0.8)
    .to(bottomItems, { opacity: 1, duration: 0.08, stagger: 0.03 }, 0.74)
    .to(ticks, { drawSVG: '100%', duration: 0.06, stagger: 0.007 }, 0.78)
    .to(afPath, { drawSVG: '100%', duration: 0.2 }, 0.86)
    .to($('.evf__hist'), { opacity: 1, duration: 0.12 }, 0.92)
    .to(intro, { opacity: 0, duration: 0.42, ease: 'power1.in' }, 1.15)
    .to(evf, { opacity: 0, duration: 0.18, ease: 'power1.in' }, 2.4)
    .to([$('.work__h'), $('.rail')], { opacity: 1, duration: 0.22 }, 2.66)
    .set({}, {}, TOTAL);

  // ---- discrete detail that plays at its own pace
  const roState: Record<string, string> = {};
  const setRo = (k: string, text: string) => {
    if (roState[k] === text || !ro[k]) return;
    const first = roState[k] === undefined;
    roState[k] = text;
    if (first) ro[k].textContent = text;
    else gsap.to(ro[k], { duration: 0.5, scrambleText: { text, chars: '0123456789', speed: 0.5, revealDelay: 0.15 }, overwrite: true });
  };
  let afLocked = false;
  const lockAF = (on: boolean) => {
    if (on === afLocked) return;
    afLocked = on;
    gsap.killTweensOf(af);
    if (on) {
      gsap
        .timeline()
        .to(af, { scale: 1.1, duration: 0.12, ease: 'power2.out' })
        .to(af, { scale: 0.94, duration: 0.12, ease: 'power2.inOut' })
        .to(af, { scale: 1.03, duration: 0.1, ease: 'power2.inOut' })
        .add(() => af.classList.add('is-lock'))
        .to(af, { scale: 1, duration: 0.18, ease: 'glass' });
    } else {
      af.classList.remove('is-lock');
      gsap.to(af, { scale: 1, duration: 0.18 });
    }
  };

  let current = -1;
  let shown = false;
  const enter = (i: number, dir: number) => {
    const c = chapters[i];
    c.li.classList.add('is-on');
    c.li.inert = false;
    gsap.killTweensOf([...c.digits, ...c.lines, c.open]);
    gsap.fromTo(c.digits, { yPercent: 130 * dir }, { yPercent: 0, duration: 1.1, ease: 'glass', stagger: 0.07, delay: 0.2 });
    gsap.fromTo(c.lines, { yPercent: 115 * dir }, { yPercent: 0, duration: 0.9, ease: 'glass', stagger: 0.035, delay: 0.26 });
    gsap.fromTo(c.open, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.9, ease: 'glass', delay: 0.42, clearProps: 'clipPath' });
    railBtns.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
  };
  const exit = (i: number, dir: number) => {
    const c = chapters[i];
    c.li.inert = true;
    gsap.killTweensOf([...c.digits, ...c.lines, c.open]);
    gsap.to(c.digits, { yPercent: -130 * dir, duration: 0.34, ease: 'power2.in', stagger: 0.025 });
    gsap.to(c.lines, { yPercent: -115 * dir, duration: 0.3, ease: 'power2.in', stagger: 0.01 });
    gsap.to(c.open, {
      clipPath: 'inset(0 0 0 100%)',
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => {
        if (current !== i || !shown) c.li.classList.remove('is-on');
      },
    });
  };

  // ---- input
  railBtns.forEach((b) => b.addEventListener('click', () => api.goTo(Number(b.dataset.go))));
  // keyboard: arriving in the work by Tab brings the theatre to the first chapter
  $('.rail').addEventListener('focusin', () => {
    if (s < S0 - 0.3) api.goTo(0);
  });
  stagePlate.addEventListener('click', () => {
    if (s > S0 - 0.1 && current >= 0) ctx.project?.open(current, true);
  });

  // the bar and the intro row are driven from s directly (the entry owns them until the first scroll)
  const barEl = $('.bar');
  const rowEl = $('.intro__row');
  let lastBar = 1;
  let lastRow = 1;
  const lv = { v: 0 };
  let levelRot = 0;
  let hover = 0;
  const hv = { v: 0 };

  const api: Theatre = {
    plate,
    stagePlate,
    shape: null,
    params: null,
    active: () => current,
    debug: () => ({ s, p: tl.progress(), start: tl.scrollTrigger?.start, end: tl.scrollTrigger?.end, y: scrollY }),
    scrollForChapter(i: number) {
      const st = tl.scrollTrigger!;
      const target = i === 0 ? S0 + 0.06 * C : S0 + (i - 1) * C + 0.88 * C;
      return st.start + (target / TOTAL) * (st.end - st.start);
    },
    goTo(i: number, instant = false) {
      const y = api.scrollForChapter(Math.max(0, Math.min(N - 1, i)));
      if (ctx.lenis) ctx.lenis.scrollTo(y, { duration: instant ? 0 : 1.5, immediate: instant, force: true, lock: !instant });
      else window.scrollTo(0, y);
    },
    frame(dt: number) {
      const vw = innerWidth;
      const vh = innerHeight;
      const phone = vw < 760;
      const P = rectOf(stagePlate);
      const col = chaptersEl.getBoundingClientRect();
      const inset = Math.min(vw, vh) * 0.022;
      const full: Rect = { x: inset, y: inset, w: vw - 2 * inset, h: vh - 2 * inset };

      if (!ctx.pvOpen) {
        const b = Math.max(0, 1 - seg(s, 0.42, 0.54)) + seg(s, 2.6, 2.78);
        const bv = Math.min(1, b);
        if (Math.abs(bv - lastBar) > 0.001) {
          lastBar = bv;
          gsap.set(barEl, { autoAlpha: bv });
        }
      }
      const rv = 1 - seg(s, 0.12, 0.34);
      if (Math.abs(rv - lastRow) > 0.001) {
        lastRow = rv;
        rowEl.style.opacity = String(rv);
      }

      // plate: full frame (exposes out of black) -> its stage rect
      const gShrink = inOut(seg(s, 2.35, 3.0));
      plate.rect = lerpRect(full, P, gShrink);
      plate.visible = s > 1.66 && !ctx.pvOpen;
      plate.exposure = smooth(seg(s, 1.74, 2.3));

      // slab rests: between plate and numeral (desktop), or at the plate's edges (phone)
      const shw = phone ? Math.max(18, vw * 0.06) : Math.max(50, vw * 0.058);
      const restR = phone ? P.x + P.w - shw * 0.55 : Math.min(P.x + P.w + shw * 0.12, col.left - shw * 0.2);
      const restL = P.x + shw * 0.6;
      const cs = (s - S0) / C;
      let slabX = restR;
      let A = 0;
      let B: number | null = null;
      let seam = 0;
      let dir = 0;
      let sweeping = false;
      if (cs >= 0) {
        const i = Math.min(N - 1, Math.floor(cs));
        const f = cs - i;
        if (i >= N - 1) {
          A = N - 1;
          slabX = (N - 1) % 2 === 1 ? restL : restR;
        } else {
          const u = inOut(seg(f, 0.15, 0.65));
          const rtl = i % 2 === 0; // right-to-left on even segments
          const from = rtl ? restR : restL;
          const to = rtl ? restL : restR;
          slabX = lerp(from, to, u);
          seam = rtl ? lerp(P.x + P.w + 2, P.x - 2, u) : lerp(P.x - 2, P.x + P.w + 2, u);
          dir = rtl ? 1 : -1;
          A = i;
          if (u <= 0) B = null;
          else if (u >= 1) A = i + 1;
          else {
            B = i + 1;
            sweeping = true;
          }
        }
      }
      plate.a = coverOf(ctx.projects[A]);
      plate.b = B === null ? null : coverOf(ctx.projects[B]);
      plate.split = seam;
      plate.dir = dir;

      // active chapter (text): flips at the sweep's midpoint
      const act = s < 2.62 ? -1 : Math.max(0, Math.min(N - 1, Math.floor(Math.max(0, cs) + 0.6)));
      if (act !== current) {
        const prev = current;
        const d = act > prev ? 1 : -1;
        if (prev >= 0) exit(prev, d);
        current = act;
        shown = act >= 0;
        if (act >= 0) enter(act, prev < 0 ? 1 : d);
        else railBtns.forEach((b) => b.setAttribute('aria-current', 'false'));
      }

      // ---- the lens: free intro lens -> centre -> full frame -> slab
      if (rig) {
        const R = rig.R;
        const circle: Shape = { x: vw / 2, y: vh / 2, hw: R, hh: R, r: R, rot: 0 };
        const frameS: Shape = { x: vw / 2, y: vh / 2, hw: full.w / 2, hh: full.h / 2, r: Math.min(30, inset * 1.6), rot: 0 };
        const slab: Shape = { x: slabX, y: P.y + P.h / 2, hw: shw, hh: P.h / 2 + (phone ? vh * 0.025 : vh * 0.055), r: shw, rot: 0 };
        const gGrow = inOut(seg(s, 0.28, 1.05));
        let shape = lerpShape(circle, frameS, gGrow);
        if (gShrink > 0) shape = lerpShape(frameS, slab, gShrink);
        const base = rig.base;
        const frameP: LensParams = { ...base, bevel: Math.min(vw, vh) * 0.12, refract: Math.min(vw, vh) * 0.07, mag: 0.05, disp: 0.42, k: 30 };
        const slabP: LensParams = { ...base, bevel: shw * 0.98, refract: shw * 0.62, mag: 0.04, disp: 0.4, k: 52 };
        let params = lerpParams(base, frameP, gGrow);
        if (gShrink > 0) params = lerpParams(frameP, slabP, gShrink);
        api.shape = shape;
        api.params = params;
        rig.script.w = inOut(seg(s, 0.1, 0.5));
        rig.script.shape = shape;
        rig.script.params = params;
        rig.follow = s < 0.1;

        // the loupe: a droplet pulled out of the slab onto the cursor over the plate
        const p = ctx.pointer;
        const recent = performance.now() / 1000 - p.t < 3;
        const inPlate = !phone && !ctx.pvOpen && recent && s > S0 - 0.05 && !sweeping && p.x > P.x && p.x < P.x + P.w && p.y > P.y && p.y < P.y + P.h;
        const L = rig.loupe;
        if (inPlate && !L.on && L.r < 1) {
          L.x = slab.x;
          L.y = Math.max(slab.y - slab.hh + 30, Math.min(slab.y + slab.hh - 30, p.y));
        }
        L.on = inPlate;
        L.tr = Math.min(86, P.h * 0.14);
        if (inPlate) {
          L.tx = p.x;
          L.ty = p.y;
        } else {
          L.tx = slab.x;
          L.ty = Math.max(slab.y - slab.hh + 20, Math.min(slab.y + slab.hh - 20, L.y));
        }
        hover = damp(hover, inPlate ? 1 : 0, hv, 0.12, dt);
        plate.hover = hover;
        stagePlate.classList.toggle('is-hot', inPlate);
        chapters[current]?.open.classList.toggle('is-hot', inPlate);
      }

      // ---- functional EVF readouts
      if (s > 0.45 && s < 2.6) {
        const ev = -3 * inOut(seg(s, 1.15, 1.6)) + 3 * inOut(seg(s, 1.76, 2.2));
        gsap.set(mark, { x: ev * 45 });
        const thirds = Math.round(ev * 3) / 3;
        ro.ev.textContent = Math.abs(thirds) < 0.01 ? '±0' : `${thirds > 0 ? '+' : '-'}${Math.abs(thirds).toFixed(1)}`;
        setRo('shutter', s < 1.25 ? '1/125' : s < 1.78 ? '1/4000' : '1/60');
        setRo('aperture', s < 1.78 ? '2.0' : '2.8');
        setRo('iso', s < 1.78 ? '400' : '200');
        lockAF(s > 1.62);
        // histogram: two lobes that slide into the shadows as the frame falls to black
        const shift = (ev / 3) * 0.42;
        let d = 'M0 48';
        for (let k = 0; k <= 30; k++) {
          const x = k / 30;
          const a = Math.exp(-Math.pow((x - (0.3 + shift)) / 0.11, 2)) * 0.8;
          const b = Math.exp(-Math.pow((x - (0.68 + shift)) / 0.08, 2)) * 0.55;
          const c = Math.exp(-Math.pow((x - (0.06)) / 0.05, 2)) * clamp01(-ev / 3) * 1.4;
          const yv = Math.min(1, a + b + c + 0.03 * Math.sin(k * 1.7));
          d += ` L${(x * 120).toFixed(1)} ${(48 - yv * 44).toFixed(1)}`;
        }
        hfill.setAttribute('d', `${d} L120 48 Z`);
        // the electronic level answers the hand
        const target = (clamp01(ctx.pointer.x / vw) - 0.5) * 7;
        levelRot = damp(levelRot, target, lv, 0.3, dt);
        levelSvg.style.transform = `rotate(${levelRot.toFixed(2)}deg)`;
        level.classList.toggle('is-level', Math.abs(levelRot) < 0.45);
      }
    },
  };

  setRo('shutter', '1/125');
  setRo('aperture', '2.0');
  setRo('iso', '400');
  ScrollTrigger.refresh();
  return api;
}
