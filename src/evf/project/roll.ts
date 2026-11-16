// The roll at work (W-V1 A8, A9, A11): prints expose as they enter, the print nearest the centre keeps focus (the AF
// brackets and the HUD counter follow it, the rest dim), loop clips play muted while they are seen, and a failed image
// becomes an "image unavailable" print at the same size. One controller per article, on either host: the Viewfinder's
// column (an element scroller) or a cold /work/<slug>/ page (the window). Layout is read once per resize: print rects
// are cached, so scrolling never measures (A9).
import { gsap, D, E } from '../motion';

export interface RollOptions {
  /** The element holding the article's content. */
  root: ParentNode;
  /** What scrolls: the column on /, the window on a cold page. */
  scroller: HTMLElement | Window;
  calm: boolean;
  /** The HUD print counter ("03 / 12"), or null. */
  counter: HTMLElement | null;
}

export interface RollControl {
  roll: HTMLElement;
  prints: HTMLElement[];
  /** The focused print, 0-based (-1 before the roll is in view). */
  focus(): number;
  /** Pause the inline clips (playback is open, or the view is leaving). */
  hold(on: boolean): void;
  /** Re-read the layout (the host resized or moved). */
  recache(): void;
  destroy(): void;
}

/** At least this many prints, and a fine pointer, for the dim and the brackets (D-044). */
export const DIM_MIN = 4;
/** At most this many loop clips play at once (budgets-v2). */
export const MAX_PLAYING = 2;
const pad = (n: number) => String(n).padStart(2, '0');

export function initRoll(o: RollOptions): RollControl | null {
  const found = o.root.querySelector<HTMLElement>('[data-roll]');
  if (!found) return null;
  const roll: HTMLElement = found;
  document.documentElement.setAttribute('data-roll', '');
  const grid = roll.querySelector<HTMLElement>('.roll__grid');
  const prints = grid ? [...grid.querySelectorAll<HTMLElement>('.print')] : [];
  const total = prints.length;
  const win = o.scroller instanceof Window;
  const ioRoot = win ? null : (o.scroller as HTMLElement);
  const cleanups: (() => void)[] = [];
  const on = <K extends string>(t: EventTarget, k: K, fn: EventListener, opt?: AddEventListenerOptions) => {
    t.addEventListener(k, fn, opt);
    cleanups.push(() => t.removeEventListener(k, fn, opt));
  };
  const reduced = () => o.calm || matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- failed images: the same size, its own label
  for (const p of prints) {
    const img = p.querySelector<HTMLImageElement>('img.print__img');
    if (!img) continue;
    const fail = () => p.classList.add('is-failed');
    on(img, 'error', fail);
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) fail();
  }

  // ---------------------------------------------------------------- the expose (A8)
  roll.dataset.expose = '';
  const exposed = new WeakSet<Element>();
  const expose = (p: HTMLElement, delay: number) => {
    exposed.add(p);
    const frame = p.querySelector<HTMLElement>('.print__frame');
    if (!frame) return;
    // the tween holds the underexposed state inline from now on, so the class can go at once
    const tw = reduced()
      ? gsap.fromTo(frame, { opacity: 0 }, { opacity: 1, duration: 0.2, delay, ease: 'none', clearProps: 'opacity' })
      : gsap.fromTo(frame, { filter: 'brightness(0.125) blur(8px)' }, { filter: 'brightness(1) blur(0px)', duration: D.land, delay, ease: E.out, clearProps: 'filter' });
    p.classList.add('is-exp');
    void tw;
  };
  const io = new IntersectionObserver((entries) => {
    const entering = entries.filter((e) => e.isIntersecting && !exposed.has(e.target)).map((e) => e.target as HTMLElement);
    entering.sort((a, b) => prints.indexOf(a) - prints.indexOf(b));
    // in order, 0.1 s apart; the stagger starts again every 4 prints
    entering.forEach((p, k) => expose(p, (k % 4) * 0.1));
  }, { root: ioRoot, threshold: 0 });
  prints.forEach((p) => io.observe(p));
  cleanups.push(() => io.disconnect());

  // ---------------------------------------------------------------- focus (A9)
  const af = document.createElement('div');
  af.className = 'roll__af';
  af.setAttribute('aria-hidden', 'true');
  af.append(...Array.from({ length: 4 }, () => document.createElement('i')));
  grid?.append(af);
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let rects: { x: number; y: number; w: number; h: number }[] = [];
  let gridTop = 0, gridLeft = 0;
  let cur = -1;
  const dimOn = () => total >= DIM_MIN && fine.matches;
  const view = () => (win ? { top: window.scrollY, h: window.innerHeight, left: 0, w: window.innerWidth } : { top: (o.scroller as HTMLElement).scrollTop, h: (o.scroller as HTMLElement).clientHeight, left: 0, w: (o.scroller as HTMLElement).clientWidth });

  /** The one place the layout is read: on init and on resize, never while scrolling. */
  function cache() {
    if (!grid) return;
    const g = grid.getBoundingClientRect();
    const base = win ? { top: 0, left: 0, st: window.scrollY } : (() => { const s = (o.scroller as HTMLElement).getBoundingClientRect(); return { top: s.top, left: s.left, st: (o.scroller as HTMLElement).scrollTop }; })();
    gridTop = g.top - base.top + base.st;
    gridLeft = g.left - base.left;
    rects = prints.map((p) => {
      const r = (p.querySelector('.print__frame') ?? p).getBoundingClientRect();
      return { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height };
    });
  }

  function place(n: number, jump: boolean) {
    const r = rects[n];
    if (!r) return;
    gsap.to(af, { x: r.x, y: r.y, width: r.w, height: r.h, duration: jump || reduced() ? 0 : D.step, ease: E.detent, overwrite: true });
  }

  function setFocus(n: number, jump = false) {
    const dim = dimOn() && n >= 0;
    roll.toggleAttribute('data-dim', dim);
    af.classList.toggle('on', dim);
    if (n === cur) { if (dim) place(n, true); return; }
    if (cur >= 0) prints[cur]?.removeAttribute('data-focus');
    const first = cur < 0;
    cur = n;
    if (n < 0) { delete roll.dataset.focus; return; }
    prints[n].setAttribute('data-focus', '');
    roll.dataset.focus = String(n + 1);
    if (o.counter) o.counter.textContent = `${pad(n + 1)} / ${pad(total)}`;
    if (dim) place(n, jump || first);
  }

  /** The print nearest the view's centre, among those in view; -1 when none is. */
  function nearest() {
    const v = view();
    const cy = v.top + v.h / 2 - gridTop, cx = v.left + v.w / 2 - gridLeft;
    let best = -1, bd = Infinity;
    rects.forEach((r, i) => {
      const top = r.y, bottom = r.y + r.h;
      if (bottom < v.top - gridTop || top > v.top - gridTop + v.h) return;
      const d = Math.hypot(r.x + r.w / 2 - cx, (top + bottom) / 2 - cy);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  const onScroll = () => setFocus(nearest());
  on(o.scroller, 'scroll', onScroll, { passive: true });
  const refresh = () => { cache(); setFocus(nearest(), true); };
  let pending: gsap.core.Tween | null = null;
  const later = () => { pending?.kill(); pending = gsap.delayedCall(0.05, refresh); };
  const ro = new ResizeObserver(later);
  if (grid) ro.observe(grid);
  const head = o.root.querySelector('.pj__head');
  if (head) ro.observe(head);
  cleanups.push(() => ro.disconnect());
  const fineChange = () => setFocus(cur, true);
  fine.addEventListener('change', fineChange);
  cleanups.push(() => fine.removeEventListener('change', fineChange));
  refresh();

  // ---------------------------------------------------------------- loop clips (A11)
  const clips = prints.filter((p) => p.hasAttribute('data-loop')).map((p) => ({ fig: p, v: p.querySelector<HTMLVideoElement>('video'), playing: false }));
  const seen = new Set<Element>();
  let held = false;
  function reconcile() {
    const allowed = !held && !reduced() && document.visibilityState === 'visible';
    const want = allowed ? clips.filter((c) => c.v && seen.has(c.fig)).slice(0, MAX_PLAYING) : [];
    for (const c of clips) {
      if (!c.v) continue;
      if (want.includes(c) && !c.playing) {
        c.playing = true;
        const pr = c.v.play();
        if (pr && typeof pr.catch === 'function') pr.catch(() => { c.playing = false; c.fig.removeAttribute('data-playing'); });
      } else if (!want.includes(c) && c.playing) {
        c.playing = false;
        c.v.pause();
        c.fig.removeAttribute('data-playing');
      }
    }
  }
  if (clips.length) {
    for (const c of clips) if (c.v) on(c.v, 'playing', () => { if (c.playing) c.fig.setAttribute('data-playing', ''); });
    const vio = new IntersectionObserver((entries) => {
      for (const e of entries) { if (e.intersectionRatio >= 0.5) seen.add(e.target); else seen.delete(e.target); }
      reconcile();
    }, { root: ioRoot, threshold: [0, 0.5, 1] });
    clips.forEach((c) => vio.observe(c.fig));
    cleanups.push(() => vio.disconnect());
    on(document, 'visibilitychange', reconcile);
  }

  return {
    roll,
    prints,
    focus: () => cur,
    hold(h) { held = h; reconcile(); },
    recache: refresh,
    destroy() {
      held = true;
      reconcile();
      pending?.kill();
      gsap.killTweensOf(af);
      cleanups.forEach((f) => f());
      af.remove();
    },
  };
}
