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
  // the brackets live in the article's host (the column, or the cold page's article), not in the roll: their corners sit
  // 7 px outside the print, which for a print flush with the roll's edge overflowed the roll (gate overflow 7 at 1440);
  // the host's own padding holds them
  const host = (grid ? o.root : null) as HTMLElement | null;
  host?.append(af);
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  let rects: { x: number; y: number; w: number; h: number }[] = [];
  let gridTop = 0, gridLeft = 0, scrollMax = Infinity, offX = 0, offY = 0, maxR = Infinity;
  /** How far the brackets' corners sit outside the print (print.css). */
  const BR = 7;
  // the brackets' box, tweened; drawn clamped so vf.detent's overshoot never carries a corner past the host's padding
  // box (a glide onto a print flush with the edge overflowed the page by 3 px for a frame)
  const box = { x: 0, y: 0, w: 0, h: 0 };
  const draw = () => {
    const l = Math.max(box.x, BR), r = Math.min(box.x + box.w, maxR);
    af.style.transform = `translate(${l}px,${box.y}px)`;
    af.style.width = `${Math.max(0, r - l)}px`;
    af.style.height = `${box.h}px`;
  };
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
    // the grid's place in the host's padding box (the column scrolls its content, the brackets with it)
    if (host) { const h = host.getBoundingClientRect(); offX = g.left - h.left - host.clientLeft + host.scrollLeft; offY = g.top - h.top - host.clientTop + host.scrollTop; maxR = host.clientWidth - BR; }
    const sc = win ? document.scrollingElement ?? document.documentElement : (o.scroller as HTMLElement);
    scrollMax = sc.scrollHeight - (win ? window.innerHeight : sc.clientHeight);
    rects = prints.map((p) => {
      // the whole print, strip included: the brackets frame it as Flux's framed its sheet
      const r = p.getBoundingClientRect();
      return { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height };
    });
  }

  function place(n: number, jump: boolean) {
    const r = rects[n];
    if (!r) return;
    const to = { x: offX + r.x, y: offY + r.y, w: r.w, h: r.h };
    if (jump || reduced()) { gsap.killTweensOf(box); Object.assign(box, to); draw(); }
    else gsap.to(box, { ...to, duration: D.step, ease: E.detent, overwrite: true, onUpdate: draw });
  }

  /** The HUD counter reads this roll's focused print, and is hidden while none is (never another roll's count). */
  function count(n: number) {
    if (!o.counter) return;
    o.counter.textContent = n < 0 ? '' : `${pad(n + 1)} / ${pad(total)}`;
    o.counter.hidden = n < 0;
  }

  /** The dim's saturation (print.css holds the end states) moves by tween, never by a CSS filter transition: WPE (Linux
   *  WebKit) segfaults in its compositor when accelerated filter transitions on the roll's images start and stop as the
   *  focus moves (#114's round-3 CI probes: none with the transitions or the filters off). Inline while it runs, from
   *  where an interrupted tween left it; then print.css again. */
  function sat(p: HTMLElement | undefined, from: number, to: number, jump: boolean) {
    const img = p?.querySelector<HTMLElement>('.print__img');
    if (!img) return;
    if (jump || reduced()) { gsap.killTweensOf(img); img.style.removeProperty('filter'); return; }
    const now = /saturate\(([\d.]+)\)/.exec(img.style.filter)?.[1];
    gsap.fromTo(img, { filter: `saturate(${now ?? from})` }, { filter: `saturate(${to})`, duration: D.step, ease: E.out, overwrite: true, clearProps: 'filter' });
  }

  function setFocus(n: number, jump = false) {
    const dim = dimOn() && n >= 0;
    const was = roll.hasAttribute('data-dim');
    roll.toggleAttribute('data-dim', dim);
    af.classList.toggle('on', dim);
    // the dim comes on (or goes) for every print but the focused one
    if (dim !== was) prints.forEach((p, i) => { if (i !== n) sat(p, dim || i === cur ? 1 : 0.4, dim ? 0.4 : 1, jump); });
    // the same print: only a re-layout re-places the brackets; the scroll events that follow a change leave the glide be
    if (n === cur) { if (dim && jump) place(n, true); return; }
    const prev = cur;
    if (prev >= 0) prints[prev]?.removeAttribute('data-focus');
    const first = prev < 0;
    cur = n;
    count(n);
    if (n < 0) { delete roll.dataset.focus; return; }
    prints[n].setAttribute('data-focus', '');
    roll.dataset.focus = String(n + 1);
    if (dim && was) { sat(prints[prev], 1, 0.4, jump); sat(prints[n], 0.4, 1, jump); }
    if (dim) place(n, jump || first);
  }

  /** Across the view, a centre counts this much of a down-the-view distance: the centre line leads, not the 2-D centre. */
  const X_WEIGHT = 0.25;
  /** When the centre line falls between prints, one whose edge is within this fraction of the view from it takes focus. */
  const NEAR = 0.25;
  /** The print at the view's centre line (J3), among those in view; -1 when none is. A print the line crosses always
   *  beats one it misses; among those, the nearest centre (down the view, then a quarter across) wins; when the line
   *  falls between prints, the nearest edge does if it is near. At the end of the scroll the last print at least half in view takes
   *  focus, so the roll's last print is always reachable. */
  function nearest() {
    const v = view();
    const top = v.top - gridTop, bottom = top + v.h;
    const cy = top + v.h / 2, cx = v.left + v.w / 2 - gridLeft;
    if (v.top >= scrollMax - 2) {
      for (let i = rects.length - 1; i >= 0; i--) {
        const r = rects[i];
        if (Math.min(r.y + r.h, bottom) - Math.max(r.y, top) >= r.h * 0.5) return i;
      }
    }
    let best = -1, bd = Infinity;
    rects.forEach((r, i) => {
      if (r.y + r.h < top || r.y > bottom) return;
      const gap = Math.max(0, r.y - cy, cy - (r.y + r.h));
      if (gap > v.h * NEAR) return; // a print just entering at an edge is not the subject yet
      const d = gap > 0 ? 1e6 + gap : Math.abs(r.y + r.h / 2 - cy) + X_WEIGHT * Math.abs(r.x + r.w / 2 - cx);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  /** A print that took keyboard focus holds the AF focus while it keeps it and is at least half in view (nearest()'s
   *  end rule); a wheel, a hover on another print or the print leaving lets the centre line lead again. */
  let keyed = -1;
  const mostlyIn = (i: number) => { const r = rects[i]; if (!r) return false; const v = view(), top = v.top - gridTop, bottom = top + v.h; return Math.min(r.y + r.h, bottom) - Math.max(r.y, top) >= r.h * 0.5; };
  const pick = () => {
    if (keyed >= 0 && !(prints[keyed]?.contains(document.activeElement) && mostlyIn(keyed))) keyed = -1;
    return keyed >= 0 ? keyed : nearest();
  };
  const onScroll = () => setFocus(pick());
  on(o.scroller, 'scroll', onScroll, { passive: true });
  on(o.scroller, 'wheel', () => { keyed = -1; }, { passive: true });
  // hover to focus (the Viewfinder's promise): a fine pointer moving onto a print takes the brackets and full brightness
  // there; the next scroll goes back to the centre line. A move at the same point (a browser's after-scroll hover
  // update) is not the pointer's, so it never pulls focus off the centre line.
  let px = NaN, py = NaN;
  if (grid) on(grid, 'pointermove', (ev) => {
    const e = ev as PointerEvent;
    if (e.pointerType === 'touch' || !dimOn() || (e.clientX === px && e.clientY === py)) return;
    px = e.clientX; py = e.clientY;
    const p = (e.target as Element).closest('.print');
    const i = p ? prints.indexOf(p as HTMLElement) : -1;
    if (i >= 0 && i !== cur) { keyed = -1; setFocus(i); }
  });
  // keyboard to focus: a print that takes focus (a Tab stop, the open view's Tab trap, Esc back from playback) takes the
  // brackets and full brightness as a hover does; a keyboard one (:focus-visible) holds them through its scroll into view
  if (grid) on(grid, 'focusin', (ev) => {
    if (!dimOn()) return;
    const t = ev.target as Element;
    const p = t.closest('.print');
    const i = p ? prints.indexOf(p as HTMLElement) : -1;
    if (i < 0) return;
    keyed = t.matches(':focus-visible') ? i : -1;
    if (i !== cur) setFocus(i);
  });
  const refresh = () => { cache(); setFocus(pick(), true); };
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
  count(-1);
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
      gsap.killTweensOf(box);
      cleanups.forEach((f) => f());
      af.remove();
      count(-1);
    },
  };
}
