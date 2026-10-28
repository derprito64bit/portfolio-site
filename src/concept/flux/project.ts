// The open state: the chosen sheet grows into the project page on a liquid wave, the detail rises in after it lands,
// and Close, Esc or Back sends it home faster.
import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { projects, ph } from './content';
import { world } from './world';
import { clamp } from './spring';
import type { PlaneDraw } from './gl/engine';
import type { Work } from './work';

type Rect = { x: number; y: number; w: number; h: number };

export class ProjectView {
  el: HTMLElement;
  hero: HTMLElement;
  panel: HTMLElement;
  closeBtn: HTMLButtonElement;
  work: Work;
  k = -1;
  state: 'closed' | 'opening' | 'open' | 'closing' = 'closed';
  fly = { p: 0 };
  wipe = { p: 1, k: -1 };
  from: Rect = { x: 0, y: 0, w: 1, h: 1 };
  uv: [number, number] = [0.5, 0.5];
  pushed = false;
  returnFocus: HTMLElement | null = null;
  splits: any[] = [];
  tl: gsap.core.Timeline | null = null;
  lensOn = 0;
  onState: (s: string) => void = () => {};

  constructor(work: Work) {
    this.work = work;
    this.el = document.getElementById('project')!;
    this.hero = document.getElementById('project-hero')!;
    this.panel = document.getElementById('project-panel')!;
    this.closeBtn = document.getElementById('project-close') as HTMLButtonElement;
    this.closeBtn.addEventListener('click', () => this.requestClose());
    document.getElementById('project-next')!.addEventListener('click', () => this.step(1));
    document.getElementById('project-prev')!.addEventListener('click', () => this.step(-1));
    document.addEventListener('keydown', (e) => {
      if (this.state === 'closed') return;
      if (e.key === 'Escape') this.requestClose();
      if (e.key === 'Tab') this.trap(e);
    });
    window.addEventListener('popstate', () => {
      const m = /^#\/work\/(.+)$/.exec(location.hash);
      if (!m && (this.state === 'open' || this.state === 'opening')) {
        this.pushed = false;
        this.close();
      }
    });
  }

  trap(e: KeyboardEvent) {
    const f = Array.from(this.el.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]')).filter((x) => !x.hasAttribute('disabled'));
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  heroRect(): Rect {
    const r = this.hero.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }

  fill(k: number) {
    const p = projects[k];
    document.getElementById('project-n')!.textContent = p.n;
    document.getElementById('project-title-t')!.textContent = ph(p.title).text;
    const set = (id: string, v: string) => {
      const x = ph(v);
      document.getElementById(id)!.innerHTML = x.placeholder ? `<span class="ph-tag ph-tag--inline">placeholder</span> ${x.text}` : x.text;
    };
    set('project-role', p.role);
    set('project-year', p.year);
    set('project-kind', p.kind);
    set('project-tools', p.tools.length ? p.tools.join(', ') : '[PLACEHOLDER: tools]');
    set('project-blurb', p.blurb);
    document.getElementById('project-body')!.innerHTML = p.body.map((b) => `<p><span class="ph-tag ph-tag--inline">placeholder</span> ${ph(b).text}</p>`).join('');
    document.getElementById('project-media')!.innerHTML = p.media.length
      ? `<span class="ph-tag ph-tag--inline">placeholder</span> ${p.media.length} media items to come: ${p.media.map((m) => ph(m.alt).text).join('; ')}.`
      : `<span class="ph-tag ph-tag--inline">placeholder</span> Screenshots and clips to come.`;
    if (world.rm || !world.engine) {
      this.hero.innerHTML = '';
      const c = world.coverCanvases[k];
      if (c) {
        const img = new Image();
        img.alt = '';
        img.src = c.toDataURL('image/jpeg', 0.88);
        this.hero.appendChild(img);
      } else this.hero.style.background = `linear-gradient(160deg, ${p.tint}, #050506 85%)`;
    }
  }

  open(k: number, from: Rect, uv: [number, number]) {
    if (this.state !== 'closed') return;
    this.k = k;
    this.from = { ...from };
    this.uv = uv;
    this.returnFocus = document.activeElement as HTMLElement;
    this.fill(k);
    this.el.hidden = false;
    this.state = 'opening';
    world.phase = 'open';
    document.documentElement.classList.add('is-open');
    world.lenis?.stop();
    this.onState('open');
    if (!this.pushed && location.hash !== `#/work/${projects[k].slug}`) {
      history.pushState({ flux: k }, '', `#/work/${projects[k].slug}`);
      this.pushed = true;
    }
    const e = world.engine;
    if (e && !world.rm) e.burst(from.x, from.y, 0.14, 220);
    this.tl?.kill();
    this.prepDetail();
    if (world.rm || !e) {
      gsap.fromTo(this.el, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'none' });
      this.fly.p = 1;
      this.state = 'open';
      this.showDetail(0);
      (document.getElementById('project-title') as HTMLElement).focus({ preventScroll: true });
      return;
    }
    this.el.style.opacity = '1';
    this.fly.p = 0;
    this.tl = gsap.timeline();
    this.tl.to(this.fly, { p: 1, duration: 1.1, ease: 'flux.out' }, 0);
    this.tl.add(() => {
      this.state = 'open';
    }, 0.9);
    this.showDetail(0.78);
    gsap.delayedCall(0.9, () => (document.getElementById('project-title') as HTMLElement).focus({ preventScroll: true }));
  }

  prepDetail() {
    this.splits.forEach((s) => s.revert());
    this.splits = [];
    gsap.set('[data-pd]', { opacity: 0 });
    gsap.set('#project-title', { opacity: 0 });
  }

  showDetail(at: number) {
    const title = document.getElementById('project-title')!;
    const blurb = document.getElementById('project-blurb')!;
    if (world.rm) {
      gsap.to(['#project-title', '[data-pd]'], { opacity: 1, duration: 0.25, delay: at, ease: 'none' });
      return;
    }
    const sTitle = SplitText.create(title.querySelector('#project-title-t'), { type: 'lines', mask: 'lines' });
    const sBlurb = SplitText.create(blurb, { type: 'lines', mask: 'lines' });
    this.splits.push(sTitle, sBlurb);
    const tl = gsap.timeline({ delay: at });
    tl.set(title, { opacity: 1 }, 0);
    tl.from(sTitle.lines, { yPercent: 110, duration: 1.1, ease: 'flux.out', stagger: 0.08 }, 0);
    tl.fromTo(title.querySelector('.ph-tag'), { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'none' }, 0.2);
    tl.to('.project-n', { opacity: 1, duration: 0.25, ease: 'none' }, 0);
    tl.fromTo('#project-n', { textContent: '00' }, { duration: 0.6, scrambleText: { text: projects[this.k].n, chars: '0123456789' } }, 0);
    tl.set('.project-meta', { opacity: 1 }, 0.12);
    tl.from('.project-meta div', { clipPath: 'inset(0 100% 0 0)', duration: 0.6, ease: 'flux.out', stagger: 0.07, clearProps: 'clipPath' }, 0.12);
    tl.set(blurb, { opacity: 1 }, 0.2);
    tl.from(sBlurb.lines, { yPercent: 105, duration: 1.1, ease: 'flux.out', stagger: 0.07 }, 0.2);
    tl.to(['#project-body', '#project-media', '.project-note', '.project-actions'], { opacity: 1, duration: 0.6, ease: 'none', stagger: 0.1 }, 0.42);
    this.tl?.add(tl, 0);
  }

  requestClose() {
    if (this.state === 'closed' || this.state === 'closing') return;
    if (this.pushed) {
      this.pushed = false;
      history.back();
      return;
    }
    if (location.hash.startsWith('#/work/')) history.replaceState(null, '', location.pathname + location.search);
    this.close();
  }

  close() {
    if (this.state === 'closed' || this.state === 'closing') return;
    this.state = 'closing';
    document.documentElement.classList.remove('is-open');
    this.tl?.kill();
    const done = () => {
      this.state = 'closed';
      this.el.hidden = true;
      world.phase = 'intro';
      world.lenis?.start();
      this.onState('closed');
      const link = document.querySelector<HTMLElement>(`#work-index a[data-i="${this.k}"]`);
      (this.returnFocus && document.contains(this.returnFocus) ? this.returnFocus : link)?.focus({ preventScroll: true });
    };
    gsap.to(['#project-title', '[data-pd]'], { opacity: 0, duration: 0.25, ease: 'none', overwrite: true });
    if (world.rm || !world.engine) {
      gsap.to(this.el, { opacity: 0, duration: 0.25, ease: 'none', onComplete: done });
      return;
    }
    // home is wherever the sheet now sits on the canvas
    const c = this.work.rectOf(this.k);
    if (c) this.from = { x: c.x, y: c.y, w: c.w, h: c.h };
    this.uv = [0.5, 0.5];
    this.tl = gsap.timeline({ onComplete: done });
    this.tl.to(this.fly, { p: 0, duration: 0.6, ease: 'flux.inOut' }, 0.05);
    world.phase = 'intro';
    world.engine?.burst(this.from.x, this.from.y, 0.12, -140);
  }

  /** Next or previous project without leaving the page: the new sheet washes over the old. */
  step(dir: number) {
    if (this.state !== 'open') return;
    const k = (this.k + dir + projects.length) % projects.length;
    this.wipe.k = this.k;
    this.k = k;
    this.wipe.p = 0;
    this.prepDetail();
    this.fill(k);
    if (location.hash.startsWith('#/work/')) history.replaceState({ flux: k }, '', `#/work/${projects[k].slug}`);
    gsap.to(this.wipe, { p: 1, duration: 1.1, ease: 'flux.out' });
    this.showDetail(0.15);
    // move the canvas underneath so Close returns to this sheet
    this.work.jumpTo(k);
    const e = world.engine;
    if (e) {
      const r = this.heroRect();
      e.burst(r.x, r.y, 0.16, 160);
    }
  }

  update(draws: PlaneDraw[]) {
    if (this.state === 'closed') {
      this.lensOn = Math.max(0, this.lensOn - 0.08);
      return;
    }
    this.lensOn = Math.min(1, this.lensOn + 0.08);
    if (world.rm || !world.engine) return;
    const to = this.heroRect();
    const p = this.fly.p;
    const lerp = (a: number, b: number) => a + (b - a) * p;
    const r = { x: lerp(this.from.x, to.x), y: lerp(this.from.y, to.y), w: lerp(this.from.w, to.w), h: lerp(this.from.h, to.h) };
    const s = Math.sin(p * Math.PI);
    const dx = (to.x - this.from.x) / world.W, dy = (to.y - this.from.y) / world.H;
    const opening = this.state === 'opening' || this.state === 'open';
    const base: PlaneDraw = {
      ...r,
      tex: world.covers[this.wipe.p < 1 ? this.wipe.k : this.k],
      alpha: 1,
      focus: 1,
      hover: 0,
      mouse: [0.5, 0.5],
      develop: 1,
      wave: [this.uv[0], this.uv[1], opening ? p : 1 - p],
      waveAmp: 1.4 * s + 0.2 * (1 - p),
      seed: this.k * 1.7 + 0.3,
      vel: [-dx * 40 * s, -dy * 40 * s],
      split: [clamp(dx * 0.03 * s, -0.012, 0.012), clamp(-dy * 0.03 * s, -0.012, 0.012)],
      bend: 0.4,
    };
    draws.push(base);
    if (this.wipe.p < 1) {
      draws.push({ ...base, tex: world.covers[this.k], develop: this.wipe.p, wave: [0.5, 0.5, this.wipe.p], waveAmp: 0.6 * (1 - this.wipe.p) });
    }
  }
}
