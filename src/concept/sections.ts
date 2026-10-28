// Honours and the close. Honours: two glass forms (a standing plaque and a disc, like the owner's glass awards) over
// the category words; the light sweeps across them with scroll and leans with the hand. Close: the GitHub link under
// a droplet that follows the cursor.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import type { Ctx } from './app';
import type { LensParams, Shape } from './gl/stage';
import { clamp01, damp, lerp, type Spring } from './lens';
import { $, $$ } from './util';

export interface Sections {
  frame(dt: number, time: number): void;
  lightOverride(light: [number, number]): [number, number];
}

export function initSections(ctx: Ctx): Sections {
  const { stage, rig, motion } = ctx;
  const honours = $('#honours');
  const contact = $('#contact');
  const forms = $$('.honour__form');
  const link = $('.contact__lt');

  // mirrored words
  const wordChars: HTMLElement[][] = $$('.honour__w').map((w) => {
    const sp = SplitText.create(w, { type: 'chars', aria: 'none' });
    stage?.mirror.add(w, sp.chars as HTMLElement[]);
    return sp.chars as HTMLElement[];
  });
  stage?.mirror.add(link, $$('.contact__w', link));

  if (motion) {
    $$('.honour').forEach((h, i) => {
      const lines: HTMLElement[] = [];
      $$('.honour__title, .honour__meta dt, .honour__meta dd', h).forEach((el) => {
        lines.push(...(SplitText.create(el, { type: 'lines', mask: 'lines', aria: 'none' }).lines as HTMLElement[]));
      });
      gsap.set(wordChars[i], { yPercent: 108 });
      gsap.set(lines, { yPercent: 110 });
      ScrollTrigger.create({
        trigger: h,
        start: 'top 72%',
        once: true,
        onEnter: () => {
          gsap.to(wordChars[i], { yPercent: 0, duration: 1.1, ease: 'glass', stagger: 0.05 });
          gsap.to(lines, { yPercent: 0, duration: 0.9, ease: 'glass', stagger: 0.04, delay: 0.25 });
        },
      });
    });
    const head = $$('.honours__h, .honours__note');
    const hs = head.map((el) => SplitText.create(el, { type: 'lines', mask: 'lines', aria: 'none' }));
    const hl = hs.flatMap((s) => s.lines as HTMLElement[]);
    gsap.set(hl, { yPercent: 110 });
    ScrollTrigger.create({ trigger: honours, start: 'top 78%', once: true, onEnter: () => gsap.to(hl, { yPercent: 0, duration: 1.1, ease: 'glass', stagger: 0.08 }) });

    gsap.set(link, { yPercent: 110 });
    const other = $$('.contact__other, .contact__h, .contact__line .ph-tag');
    gsap.set(other, { opacity: 0 });
    ScrollTrigger.create({
      trigger: contact,
      start: 'top 60%',
      once: true,
      onEnter: () => {
        gsap.to(link, { yPercent: 0, duration: 1.1, ease: 'glass' });
        gsap.to(other, { opacity: 1, duration: 0.6, stagger: 0.1, delay: 0.4 });
      },
    });
  }

  // contact droplet springs
  const cd = { x: 0, y: 0, sx: { v: 0 } as Spring, sy: { v: 0 } as Spring, init: false };
  let hW = 0;
  let cW = 0;
  const hv = { v: 0 } as Spring;
  const cv = { v: 0 } as Spring;
  let sweep = 0;

  const visible = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const vh = innerHeight;
    return clamp01((Math.min(r.bottom, vh) - Math.max(r.top, 0)) / (vh * 0.6));
  };

  return {
    frame(dt: number) {
      if (!rig) return;
      const vw = innerWidth;
      const vh = innerHeight;
      const m = Math.min(vw, vh);
      const shapes: Shape[] = [];
      const ptr = ctx.pointer;
      const now = performance.now() / 1000;

      // honours forms
      const hr = honours.getBoundingClientRect();
      if (hr.bottom > -100 && hr.top < vh + 100 && !ctx.pvOpen) {
        sweep = clamp01((vh - hr.top) / (hr.height + vh));
        forms.forEach((f) => {
          const r = f.getBoundingClientRect();
          if (r.bottom < -200 || r.top > vh + 200) return;
          const cx = r.left + r.width / 2;
          const cyRaw = r.top + r.height / 2;
          const lagY = motion ? (cyRaw - vh / 2) * -0.14 : 0;
          const tilt = motion ? (clamp01(ptr.x / vw) - 0.5) * 0.05 : 0;
          if (f.dataset.form === 'plaque') shapes.push({ x: cx, y: cyRaw + lagY, hw: r.width / 2, hh: r.height / 2, r: r.width * 0.2, rot: tilt });
          else shapes.push({ x: cx, y: cyRaw + lagY * 0.7, hw: r.width / 2, hh: r.width / 2, r: r.width / 2, rot: 0 });
        });
      }

      // contact droplet: rests on the end of the link, follows the hand inside the section
      const cr = contact.getBoundingClientRect();
      if (cr.top < vh && cr.bottom > 0 && !ctx.pvOpen) {
        const lr = link.getBoundingClientRect();
        const R = Math.max(40, Math.min(m * 0.13, lr.height * 0.95));
        const inside = motion && ptr.y > cr.top && ptr.y < cr.bottom && now - ptr.t < 2.6 && vw >= 760;
        const rx = lr.right - R * 0.9;
        const ry = lr.top + lr.height * 0.52;
        if (!cd.init) {
          cd.x = rx;
          cd.y = ry;
          cd.init = true;
        }
        cd.x = motion ? damp(cd.x, inside ? ptr.x : rx, cd.sx, inside ? 0.3 : 0.7, dt) : rx;
        cd.y = motion ? damp(cd.y, inside ? ptr.y : ry, cd.sy, inside ? 0.3 : 0.7, dt) : ry;
        shapes.push({ x: cd.x, y: cd.y, hw: R, hh: R, r: R, rot: 0 });
      }

      // params: blend toward whichever section holds the eye
      const ht = visible(honours);
      const ct = visible(contact);
      hW = damp(hW, ht, hv, 0.2, dt);
      cW = damp(cW, ct, cv, 0.2, dt);
      const base = rig.base;
      const hP: LensParams = { ...base, bevel: 44, refract: 30, mag: 0.07, disp: 0.55, k: 8, shade: 1.15, caust: 0.22 };
      const lr = link.getBoundingClientRect();
      const R = Math.max(40, Math.min(m * 0.13, lr.height * 0.95));
      const cP: LensParams = { ...base, bevel: R * 0.85, refract: R * 0.36, mag: 0.15, disp: 0.36, k: R * 0.4 };
      const t = Math.max(hW, cW);
      rig.extraParams = { t: ctx.pvOpen ? 0 : t, params: hW >= cW ? hP : cP };
      rig.extras.push(...shapes);
    },
    lightOverride(light: [number, number]): [number, number] {
      if (hW < 0.01) return light;
      // the light swings across the forms as the section passes
      const a = lerp(-2.5, -0.65, sweep);
      const sw: [number, number] = [Math.cos(a) * 0.9 + light[0] * 0.25, Math.sin(a) * 0.9 + light[1] * 0.15];
      return [lerp(light[0], sw[0], hW), lerp(light[1], sw[1], hW)];
    },
  };
}
