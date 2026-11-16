// Playback (W-V1 A10, D-044): a print opens into a native modal <dialog>. Click, tap or Enter lifts it with GSAP Flip to
// fit (0.6 s, vf.out; back 0.33 s, vf.in), with its caption and readouts (index, w x h, type); arrows, the buttons and a
// swipe page through the roll. It pushes #print-NN; Back, Esc and Close all close it and return focus to the print. A
// load or popstate onto #print-NN opens it without the Flip. Reduced motion: a crossfade. Nodes are built or cloned,
// never parsed from strings (D-055).
import { gsap, Flip, D, E } from '../motion';
import { hashHistory, printHash, type HashHistory } from '../router';

export interface PlaybackOptions {
  prints: HTMLElement[];
  calm: boolean;
  /** Called with true while playback is open (the roll pauses its clips). */
  onHold?: (on: boolean) => void;
  history?: HashHistory;
}

export interface PlaybackControl {
  open(n: number, opts?: { flip?: boolean; push?: boolean }): void;
  /** Closes; true when playback had pushed its own history entry (the caller steps over it). */
  close(opts?: { fromPop?: boolean; instant?: boolean }): boolean;
  /** Follow the location's hash after a popstate or on load: #print-NN opens (no Flip), anything else closes. */
  sync(hash: string): void;
  isOpen(): boolean;
  current(): number;
  destroy(): void;
}

const pad = (n: number) => String(n).padStart(2, '0');
type Kids = (Node | string | null | false | undefined)[];
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', attrs: Record<string, string> = {}, kids: Kids = []) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const k of kids) if (k) e.append(k);
  return e;
}

export function initPlayback(o: PlaybackOptions): PlaybackControl {
  const prints = o.prints;
  const total = prints.length;
  const hist = o.history ?? hashHistory;
  const reduced = () => o.calm || matchMedia('(prefers-reduced-motion: reduce)').matches;
  let dlg: HTMLDialogElement | null = null;
  let parts: Record<string, HTMLElement> = {};
  let cur = -1;
  let pushed = false;
  let leaving: gsap.core.Timeline | null = null;
  const cleanups: (() => void)[] = [];

  function build() {
    const bg = el('div', 'pb__bg');
    const count = el('span', 'pb__count num', { 'aria-hidden': 'true' });
    const close = el('button', 'pb__close mono', { type: 'button', 'data-pb-close': '' }, ['Close', el('kbd', '', { 'aria-hidden': 'true' }, ['Esc'])]);
    const title = el('h2', 'pb__k mono', { id: 'pb-h' }, ['Playback']);
    const frame = el('div', 'pb__frame');
    const prev = el('button', '', { type: 'button', 'aria-label': 'Previous print', 'data-pb-prev': '' }, ['←']);
    const next = el('button', '', { type: 'button', 'aria-label': 'Next print', 'data-pb-next': '' }, ['→']);
    const ro = el('span', 'pb__ro mono');
    const cap = el('span', 'pb__cap');
    const bar = el('div', 'pb__bar', {}, [title, count, close]);
    const foot = el('div', 'pb__foot', {}, [el('div', 'pb__nav', {}, [prev, next]), el('p', 'pb__strip', {}, [ro, cap])]);
    const d = el('dialog', 'pb', { 'aria-labelledby': 'pb-h' }, [bg, el('div', 'pb__in', {}, [bar, el('div', 'pb__stage', {}, [frame]), foot])]) as HTMLDialogElement;
    parts = { bg, count, close, frame, prev, next, ro, cap, bar, foot };
    close.addEventListener('click', () => api.close());
    prev.addEventListener('click', () => page(-1));
    next.addEventListener('click', () => page(1));
    d.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); page(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); page(-1); }
    });
    // a close request that is not Esc (a phone's back gesture): close our way
    d.addEventListener('cancel', (e) => { e.preventDefault(); api.close(); });
    // the page behind never scrolls while playback is up; a swipe pages
    const stop = (e: Event) => e.preventDefault();
    d.addEventListener('wheel', stop, { passive: false });
    d.addEventListener('touchmove', stop, { passive: false });
    let sx = 0, sy = 0, sid = -1;
    d.addEventListener('pointerdown', (e) => { sid = e.pointerId; sx = e.clientX; sy = e.clientY; });
    d.addEventListener('pointerup', (e) => {
      if (e.pointerId !== sid) return;
      sid = -1;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) page(dx < 0 ? 1 : -1);
    });
    document.body.append(d);
    cleanups.push(() => d.remove());
    return d;
  }

  /** Fills the dialog with print n: a clone of its media (the widest rungs), its readouts and its caption. */
  function fill(n: number) {
    const p = prints[n];
    const { frame, count, ro, cap, prev, next } = parts;
    const ar = p.style.getPropertyValue('--ar') || p.dataset.ar || '1.5';
    frame.style.setProperty('--ar', ar);
    const lq = p.style.getPropertyValue('--lqip');
    if (lq) frame.style.setProperty('--lqip', lq); else frame.style.removeProperty('--lqip');
    frame.replaceChildren();
    const type = p.dataset.type;
    const pic = p.querySelector('picture');
    if (type === 'video') {
      const img = p.querySelector<HTMLImageElement>('img.print__img');
      const src = p.querySelector('video')?.dataset.src ?? '';
      const v = el('video', '', { controls: '', playsinline: '', preload: src ? 'metadata' : 'none', 'aria-label': img?.alt || 'Clip' }) as HTMLVideoElement;
      if (img) v.poster = img.currentSrc || img.src;
      if (src) v.append(el('source', '', { src, type: 'video/mp4' }));
      if (p.hasAttribute('data-loop')) { v.loop = true; v.muted = true; }
      frame.append(v);
    } else if (pic) {
      const c = pic.cloneNode(true) as HTMLElement;
      c.querySelectorAll('source, img').forEach((x) => {
        x.setAttribute('sizes', '(max-width: 759px) 100vw, 92vw');
        for (const a of ['loading', 'fetchpriority', 'data-lcp', 'id', 'class']) x.removeAttribute(a);
      });
      frame.append(c);
    } else {
      frame.append(...[...p.querySelectorAll('.print__box')].map((b) => b.cloneNode(true)));
    }
    const label = `${pad(n + 1)} / ${pad(total)}`;
    count.textContent = label;
    ro.replaceChildren(
      el('span', '', {}, [pad(n + 1)]),
      el('span', 'num', {}, [`${p.dataset.w} × ${p.dataset.h}`]),
      el('span', '', {}, [p.dataset.kind ?? type ?? 'image']),
    );
    cap.replaceChildren(...[...(p.querySelector('.print__cap')?.childNodes ?? [])].map((x) => x.cloneNode(true)));
    prev.toggleAttribute('disabled', n === 0);
    next.toggleAttribute('disabled', n === total - 1);
    dlg?.setAttribute('aria-label', `Playback, print ${label}`);
  }

  const frameOf = (n: number) => prints[n]?.querySelector<HTMLElement>('.print__frame') ?? prints[n];
  const linkOf = (n: number) => prints[n]?.querySelector<HTMLElement>('[data-print-open]') ?? prints[n];

  function page(dir: number) {
    if (cur < 0) return;
    const to = cur + dir;
    if (to < 0 || to >= total) return;
    cur = to;
    hist.replace(printHash(to + 1));
    // the roll follows behind, so the exit lands on the print being shown
    prints[to].scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const f = parts.frame;
    gsap.killTweensOf(f);
    if (reduced()) { fill(to); gsap.fromTo(f, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'none' }); return; }
    gsap.timeline()
      .to(f, { opacity: 0, x: -dir * 24, duration: D.snap, ease: E.in })
      .call(() => fill(to))
      .fromTo(f, { opacity: 0, x: dir * 24 }, { opacity: 1, x: 0, duration: D.step, ease: E.out });
  }

  const api: PlaybackControl = {
    open(n, { flip = true, push = true } = {}) {
      if (n < 0 || n >= total) return;
      if (cur >= 0) { if (n !== cur) page(n - cur); return; }
      leaving?.progress(1);
      dlg ??= build();
      cur = n;
      fill(n);
      o.onHold?.(true);
      if (push) { hist.push(printHash(n + 1)); pushed = true; }
      dlg.showModal();
      parts.close.focus({ preventScroll: true });
      const { frame, bg, bar, foot } = parts;
      gsap.killTweensOf([frame, bg, bar, foot]);
      gsap.set([frame, bg, bar, foot], { clearProps: 'opacity,transform' });
      if (reduced() || !flip) {
        gsap.fromTo([bg, frame, bar, foot], { opacity: 0 }, { opacity: 1, duration: reduced() ? 0.2 : D.step, ease: 'none' });
        return;
      }
      // the print rises to fit: its frame is the start of the playback frame
      Flip.fit(frame, frameOf(n), { scale: true });
      gsap.to(frame, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: D.land, ease: E.out });
      gsap.fromTo(bg, { opacity: 0 }, { opacity: 1, duration: D.step, ease: E.out });
      gsap.fromTo([bar, foot], { opacity: 0 }, { opacity: 1, duration: D.step, ease: E.out, delay: 0.2 });
    },
    close({ fromPop = false, instant = false } = {}) {
      if (cur < 0 || !dlg) return false;
      const n = cur;
      const had = pushed;
      cur = -1;
      if (!fromPop) {
        if (pushed) { pushed = false; hist.back(); }
        else if (/^#print-\d+$/.test(location.hash)) hist.replace('');
      } else pushed = false;
      const d = dlg;
      const { frame, bg, bar, foot } = parts;
      const done = () => {
        leaving = null;
        if (d.open) d.close();
        gsap.set([frame, bg, bar, foot], { clearProps: 'opacity,transform' });
        o.onHold?.(false);
        linkOf(n)?.focus({ preventScroll: true });
      };
      gsap.killTweensOf([frame, bg, bar, foot]);
      if (instant) { done(); return had; }
      leaving = gsap.timeline({ onComplete: done });
      if (reduced()) { leaving.to([frame, bg, bar, foot], { opacity: 0, duration: 0.2, ease: 'none' }); return had; }
      leaving.to([bar, foot], { opacity: 0, duration: D.snap, ease: E.in }, 0);
      leaving.to(frame, { ...Flip.fit(frame, frameOf(n), { scale: true, getVars: true }), duration: 0.33, ease: E.in }, 0);
      leaving.to(bg, { opacity: 0, duration: 0.33, ease: E.in }, 0);
      return had;
    },
    sync(hash) {
      const m = /^#print-(\d+)$/.exec(hash);
      if (m) {
        const n = Number(m[1]) - 1;
        if (cur < 0) api.open(n, { flip: false, push: false });
        else if (n !== cur && n >= 0 && n < total) { cur = n; fill(n); }
      } else if (cur >= 0) api.close({ fromPop: true });
    },
    isOpen: () => cur >= 0,
    current: () => cur,
    destroy() {
      if (cur >= 0) api.close({ fromPop: true, instant: true });
      leaving?.progress(1);
      cleanups.forEach((f) => f());
      dlg = null;
    },
  };

  // the prints open playback; without JS their links are anchors to themselves
  prints.forEach((p, i) => {
    const a = p.querySelector<HTMLElement>('[data-print-open]');
    if (!a) return;
    const fn = (e: Event) => { e.preventDefault(); api.open(i); };
    a.addEventListener('click', fn);
    cleanups.push(() => a.removeEventListener('click', fn));
  });
  return api;
}
