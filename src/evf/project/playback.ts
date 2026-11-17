// Playback (W-V1 A10, D-044): a print opens into a native modal <dialog>. Click, tap or Enter lifts it with GSAP Flip to
// fit (0.6 s, vf.out; back 0.33 s, vf.in), with its caption and readouts (index, w x h, type); arrows, the buttons and a
// swipe page through the roll. It pushes #print-NN; Back, Esc and Close all close it and return focus to the print. A
// load or popstate onto #print-NN opens it without the Flip. Reduced motion: a crossfade. Nodes are built or cloned,
// never parsed from strings (D-055). The arrows and Tab are read on the document, wherever focus sits, and focus is
// kept inside the dialog while a print is shown (wv1-pb-arrows-focus).
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
    const stage = el('div', 'pb__stage', {}, [frame]);
    const d = el('dialog', 'pb', { 'aria-labelledby': 'pb-h' }, [bg, el('div', 'pb__in', {}, [bar, stage, foot])]) as HTMLDialogElement;
    parts = { bg, count, close, frame, stage, prev, next, ro, cap, bar, foot };
    close.addEventListener('click', () => api.close());
    prev.addEventListener('click', () => page(-1));
    next.addEventListener('click', () => page(1));
    d.addEventListener('keydown', (e) => {
      // Esc is playback's only while a print is shown: one during the 0.33 s exit goes on to the page (the project
      // closes, or the cold page leaves), so Esc, Esc is never swallowed. The arrows are the document's (onKey).
      if (e.key === 'Escape') { if (cur < 0) return; e.preventDefault(); e.stopPropagation(); api.close(); }
    });
    // focus that falls out of the dialog to nothing comes back on the next tick: a load's or a typed #print-NN's
    // fragment scroll clears it to BODY just after the open (its target, a figure, takes no focus)
    d.addEventListener('focusout', (e) => { if (cur >= 0 && !d.contains(e.relatedTarget as Node | null)) gsap.delayedCall(0, keepFocus); });
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
    const box = p.hasAttribute('data-letterbox');
    // a print whose image failed is the same "image unavailable" print here, at its aspect (no broken glyph, no alt)
    const failed = p.classList.contains('is-failed');
    frame.toggleAttribute('data-letterbox', box);
    frame.toggleAttribute('data-failed', failed);
    if (lq && !box && !failed) frame.style.setProperty('--lqip', lq); else frame.style.removeProperty('--lqip');
    // a focused clip that pages away (a swipe) hands focus to Close before it goes
    if (frame.contains(document.activeElement)) parts.close.focus({ preventScroll: true });
    frame.replaceChildren();
    const type = p.dataset.type;
    const pic = p.querySelector('picture');
    if (failed) { /* the label is the frame's own (print.css) */ }
    else if (type === 'video') {
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
    // a focused Prev or Next about to be disabled at an end hands focus to the other one (or Close) first: focus on a
    // disabled control falls to BODY
    const atStart = n === 0, atEnd = n === total - 1;
    const a = document.activeElement;
    if ((a === prev && atStart) || (a === next && atEnd)) {
      const other = a === prev ? next : prev;
      const otherOff = a === prev ? atEnd : atStart;
      (otherOff ? parts.close : other).focus({ preventScroll: true });
    }
    prev.toggleAttribute('disabled', atStart);
    next.toggleAttribute('disabled', atEnd);
    dlg?.setAttribute('aria-label', `Playback, print ${label}`);
  }

  const frameOf = (n: number) => prints[n]?.querySelector<HTMLElement>('.print__frame') ?? prints[n];
  const linkOf = (n: number) => prints[n]?.querySelector<HTMLElement>('[data-print-open]') ?? prints[n];

  /** The roll's own copy of the print in playback hides while the playback frame flies from or to it (no double). */
  let concealed: HTMLElement | null = null;
  const unconceal = () => { if (concealed) concealed.style.visibility = ''; concealed = null; };
  const conceal = (n: number) => { unconceal(); concealed = frameOf(n); concealed.style.visibility = 'hidden'; };

  /** The print leaving a page: a still copy of the frame where it stands, so the stage is never empty (J4). */
  let ghosts: HTMLElement[] = [];
  const dropGhosts = () => { for (const g of ghosts) { gsap.killTweensOf(g); g.remove(); } ghosts = []; };
  function ghostOf(f: HTMLElement) {
    const g = f.cloneNode(true) as HTMLElement;
    g.classList.add('pb__ghost');
    g.setAttribute('aria-hidden', 'true');
    g.inert = true;
    // a still: a clip's copy keeps its poster and never loads
    g.querySelectorAll('video').forEach((v) => { v.preload = 'none'; v.removeAttribute('src'); v.querySelectorAll('source').forEach((s) => s.remove()); });
    Object.assign(g.style, { position: 'absolute', margin: '0', left: `${f.offsetLeft}px`, top: `${f.offsetTop}px`, width: `${f.offsetWidth}px`, height: `${f.offsetHeight}px`, pointerEvents: 'none' });
    parts.stage.append(g);
    ghosts.push(g);
    return g;
  }

  function page(dir: number) {
    if (cur < 0) return;
    const to = cur + dir;
    if (to < 0 || to >= total) return;
    cur = to;
    hist.replace(printHash(to + 1));
    // the roll follows behind, so the exit lands on the print being shown
    prints[to].scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    if (concealed) conceal(to);
    const f = parts.frame;
    // a page that interrupts a page: the one leaving goes at once, the one arriving leaves from where it is
    dropGhosts();
    gsap.killTweensOf(f);
    const g = ghostOf(f);
    fill(to);
    const gone = () => { g.remove(); ghosts = ghosts.filter((x) => x !== g); };
    if (reduced()) {
      // a crossfade: the two opacities always sum to one
      gsap.to(g, { opacity: 0, duration: 0.2, ease: 'none', onComplete: gone });
      gsap.set(f, { opacity: 0, x: 0 });
      gsap.to(f, { opacity: 1, duration: 0.2, ease: 'none' });
      return;
    }
    // the old print leaves over D.snap while the next enters over D.step, half a snap behind: never a blank stage
    gsap.to(g, { opacity: 0, x: `-=${dir * 24}`, duration: D.snap, ease: E.in, onComplete: gone });
    // set, then to: a delayed fromTo that a quick next page kills during its delay leaves its start state behind
    // (GSAP keeps re-rendering it), which held the frame and the ground at opacity 0 on a later open
    gsap.set(f, { opacity: 0, x: dir * 24 });
    gsap.to(f, { opacity: 1, x: 0, duration: D.step, ease: E.out, delay: D.snap / 2 });
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
      // manual scroll restoration (the pushed entry copies it): stepping back over playback's entry keeps the roll where
      // paging left it, on the print just shown, not the scroll the page had when playback opened
      if (push) { history.scrollRestoration = 'manual'; hist.push(printHash(n + 1)); pushed = true; }
      dlg.showModal();
      parts.close.focus({ preventScroll: true });
      const { frame, bg, bar, foot } = parts;
      gsap.killTweensOf([frame, bg, bar, foot]);
      gsap.set([frame, bg, bar, foot], { clearProps: 'opacity,transform' });
      if (reduced() || !flip) {
        gsap.set([bg, frame, bar, foot], { opacity: 0 });
        gsap.to([bg, frame, bar, foot], { opacity: 1, duration: reduced() ? 0.2 : D.step, ease: 'none' });
        return;
      }
      // the print rises to fit: its frame is the start of the playback frame
      Flip.fit(frame, frameOf(n), { scale: true });
      conceal(n);
      gsap.to(frame, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: D.land, ease: E.out });
      gsap.set([bg, bar, foot], { opacity: 0 });
      gsap.to(bg, { opacity: 1, duration: D.step, ease: E.out });
      gsap.to([bar, foot], { opacity: 1, duration: D.step, ease: E.out, delay: 0.2 });
    },
    close({ fromPop = false, instant = false } = {}) {
      if (cur < 0 || !dlg) return false;
      const n = cur;
      const had = pushed;
      cur = -1;
      // a clip never plays on in the hidden dialog (WCAG 1.4.2): the sound stops with the close, not after the Flip
      parts.frame?.querySelector('video')?.pause();
      if (!fromPop) {
        if (pushed) { pushed = false; hist.back(); }
        else if (/^#print-\d+$/.test(location.hash)) hist.replace('');
      } else pushed = false;
      const d = dlg;
      const { frame, bg, bar, foot } = parts;
      const done = () => {
        leaving = null;
        dropGhosts();
        unconceal();
        if (d.open) d.close();
        gsap.set([frame, bg, bar, foot], { clearProps: 'opacity,transform' });
        o.onHold?.(false);
        linkOf(n)?.focus({ preventScroll: true });
      };
      gsap.killTweensOf([frame, bg, bar, foot]);
      if (instant) { done(); return had; }
      leaving = gsap.timeline({ onComplete: done });
      if (reduced()) { leaving.to([frame, bg, bar, foot], { opacity: 0, duration: 0.2, ease: 'none' }); return had; }
      dropGhosts();
      conceal(n);
      leaving.to([bar, foot], { opacity: 0, duration: D.snap, ease: E.in }, 0);
      leaving.to(frame, { ...Flip.fit(frame, frameOf(n), { scale: true, getVars: true }), opacity: 1, duration: 0.33, ease: E.in }, 0);
      leaving.to(bg, { opacity: 0, duration: 0.33, ease: E.in }, 0);
      return had;
    },
    sync(hash) {
      const m = /^#print-(\d+)$/.exec(hash);
      if (m) {
        const n = Number(m[1]) - 1;
        if (cur < 0) {
          api.open(n, { flip: false, push: false });
          // Forward (or a reload) onto an entry playback itself pushed: closing steps back over it, as after a push,
          // so the entry is never rewritten into a duplicate of the page's own (which a later Close would land on)
          if (cur >= 0 && hist.own()) pushed = true;
        } else if (n !== cur && n >= 0 && n < total) { cur = n; fill(n); }
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

  /** Focus back on Close if it has fallen out of the dialog while a print is shown. */
  function keepFocus() {
    if (cur >= 0 && dlg?.open && !dlg.contains(document.activeElement)) parts.close.focus({ preventScroll: true });
  }
  /** Tab never leaves the dialog: from outside it (BODY) or the dialog itself it enters at the first stop (Shift: the
   *  last), and it wraps at both ends. A clip's own controls sit between Close and Prev and keep their native Tab. */
  function tab(e: KeyboardEvent, d: HTMLDialogElement) {
    const { close, frame, prev, next } = parts;
    const clip = frame.querySelector('video');
    const f = [close, clip, prev, next].filter((x): x is HTMLElement => !!x && !x.hasAttribute('disabled'));
    const a = document.activeElement;
    const first = f[0], last = f[f.length - 1];
    const inside = !!a && a !== d && d.contains(a);
    const edge = e.shiftKey ? a === first : a === last && a !== clip;
    if (inside && !edge) return;
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
  // the arrows and Tab are the document's while playback is up, so they work wherever focus sits (a keydown on the
  // dialog never fired once focus had fallen to BODY); a focused clip or field keeps its own arrows (a clip seeks)
  const onKey = (e: KeyboardEvent) => {
    if (cur < 0 || !dlg || e.defaultPrevented) return;
    if (e.key === 'Tab') { tab(e, dlg); return; }
    if ((e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as Element | null)?.closest?.('video, input, select, textarea')) return;
    e.preventDefault();
    e.stopPropagation();
    page(e.key === 'ArrowRight' ? 1 : -1);
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));

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
