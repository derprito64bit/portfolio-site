// The prints' pre-GL script (W-S2): everything that does not draw (ruling on GL headroom, #14 c5995444490).
// - Develop scheduling (L3, W-D011): each enlargement once 35% visible, the sheet as one wave; once per session
//   (sessionStorage 'ion.dev': w1, w2, w3, s), never on an anchor, List or Back arrival. A develop is triggered only
//   after src/gl/prints has registered the real one (ruling 2); a visit whose GL never comes ends dry.
// - View: Sheet / List (W-D024, TRANSITIONS A3/A4): the radios, ?view= and localStorage follow the visitor at once; the
//   view follows at most once per swapMinGap (the first change at once, the last state at the window's end), with
//   the listToggle crossfade, instant under reduced motion. A toggle is a List arrival: undeveloped sheet prints arrive
//   developed (flagged), and a developing one jumps to d = 1 and hands back before the crossfade.
// - Hover lift (H1): GL only, fine pointer, never keyboard focus.
// - A cover that fails to load: the print stays undeveloped and says so (W-D022).
// It reaches the stage only through window.__stage (no src/stage import: hero/bridge.ts says why).
import { durations } from '../../lib/tokens.js';
import type { GLApi } from '../../stage/gl/index.ts';
import type { PrintsGL } from '../../gl/prints/index.ts';

interface StageHooks {
  readonly gl: GLApi | null;
  readonly glState: string;
  readonly tier: string;
  effects: { develop(id: string, opts?: Record<string, unknown>): Promise<unknown> };
  registerEffect(name: string, impl: unknown): void;
  take(id: string): void;
  give(id: string): void;
  invalidate(): void;
}
declare global {
  interface Navigator {
    connection?: { saveData?: boolean };
  }
}
const html = document.documentElement;
const stage = () => (window as unknown as { __stage?: StageHooks }).__stage;
const KEY = 'ion.dev';
const VIEW_KEY = 'ion.view';
const reduced = () => html.dataset.motion === 'reduced';

// ---------------------------------------------------------------- the session's developed groups
const done = new Set((html.dataset.dev ?? '').split(' ').filter(Boolean));
function flag(group: string): void {
  if (done.has(group)) return;
  done.add(group);
  html.dataset.dev = [...done].join(' ');
  try {
    sessionStorage.setItem(KEY, html.dataset.dev);
  } catch {
    /* private mode: this page still remembers */
  }
}
const groupEls = (g: string) => [...document.querySelectorAll<HTMLElement>(`[data-print][data-dev-group="${g}"]`)];
/** The print is developed: its still shows, for good (this visit). */
function dry(el: HTMLElement): void {
  el.removeAttribute('data-wet');
  el.dataset.dev = 'done';
}
/** A whole group arrives developed (an anchor, List, Back or static arrival, or GL that never came). */
function dryGroup(g: string): void {
  flag(g);
  gl?.finish(groupEls(g).map((el) => el.dataset.glId as string));
  groupEls(g).forEach(dry);
}
const allGroups = () => [...new Set([...document.querySelectorAll<HTMLElement>('[data-print][data-dev-group]')].map((el) => el.dataset.devGroup as string))];
const dryAll = () => allGroups().forEach(dryGroup);

// ---------------------------------------------------------------- GL (src/gl/prints, after stage:gl-start)
let gl: PrintsGL | null = null;
const pending = new Map<string, HTMLElement[]>();
function whenMark(name: string): Promise<void> {
  return new Promise((res) => {
    if (performance.getEntriesByName(name, 'mark').length) return res();
    try {
      const po = new PerformanceObserver((l) => {
        if (l.getEntries().some((e) => e.name === name)) {
          po.disconnect();
          res();
        }
      });
      po.observe({ type: 'mark', buffered: true });
    } catch {
      /* no PerformanceObserver: GL never develops; the visit ends dry (failed()) */
    }
  });
}
whenMark('stage:gl-start')
  .then(() => import('../../gl/prints/index.ts'))
  .then(async (mod) => {
    await whenMark('stage:gl-ready');
    const st = stage();
    if (!st?.gl) return;
    gl = mod.install(st, st.gl);
    if (!gl) return dryAll();
    performance.mark('prints:ready');
    for (const [g, els] of pending) start(g, els);
    pending.clear();
  })
  .catch((e) => {
    console.warn('[prints] GL prints unavailable; the stills stay', e);
    dryAll();
  });
/** GL is not coming this visit (off, failed or torn down): nothing stays wet. */
function failed(): boolean {
  const s = stage()?.glState;
  return html.dataset.tier === 'static' || s === 'off' || s === 'failed';
}

// ---------------------------------------------------------------- develop scheduling
function trigger(g: string, els: HTMLElement[]): void {
  if (done.has(g) || html.dataset.prints !== 'wet' || reduced()) return dryGroup(g);
  if (failed()) return dryGroup(g);
  if (!gl) {
    pending.set(g, els);
    return;
  }
  start(g, els);
}
function start(g: string, els: HTMLElement[]): void {
  const st = stage();
  if (!st || done.has(g) || !els.some((el) => el.hasAttribute('data-wet'))) return;
  flag(g);
  const sheet = g === 's';
  const ids = els.map((el) => el.dataset.glId as string);
  performance.mark('prints:develop', { detail: { group: g, ids } });
  els.forEach((el, k) => {
    el.dataset.dev = 'run';
    const delay = sheet ? k * durations.sheetStagger : 0;
    void st.effects
      .develop(el.dataset.glId as string, { duration: sheet ? durations.developSheet : durations.develop, trigger: sheet ? 'sheet' : 'scroll', delay })
      .finally(() => dry(el));
  });
}

/** Visible enough to develop: 35% of the print, or 35% of the viewport when the print is taller than that. */
const enough = (e: IntersectionObserverEntry) => e.isIntersecting && (e.intersectionRatio >= 0.35 || e.intersectionRect.height >= 0.35 * (e.rootBounds?.height ?? innerHeight));
let io: IntersectionObserver | null = null;
function observe(): void {
  io?.disconnect();
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!enough(e)) continue;
        const el = e.target as HTMLElement;
        io?.unobserve(el);
        if (el.matches('[data-sheet-grid]')) trigger('s', groupEls('s').filter((p) => p.offsetParent !== null));
        else {
          const p = el.closest<HTMLElement>('[data-print]');
          if (p?.dataset.devGroup) trigger(p.dataset.devGroup, [p]);
        }
      }
    },
    { threshold: [0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.5, 0.6, 0.8, 1] },
  );
  for (const el of document.querySelectorAll<HTMLElement>('[data-print="enl"][data-wet] .print-card')) io.observe(el);
  const grid = document.querySelector<HTMLElement>('[data-sheet-grid]');
  if (grid && groupEls('s').some((el) => el.hasAttribute('data-wet'))) io.observe(grid);
}

// ---------------------------------------------------------------- arrivals
/** Prints from the top of the page to one screen below `y` (document px) arrive developed: an anchor arrival. */
function arriveAt(y: number): void {
  for (const g of allGroups()) {
    const first = groupEls(g)[0];
    if (first && first.getBoundingClientRect().top + scrollY < y + innerHeight) dryGroup(g);
  }
}
addEventListener(
  'click',
  (e) => {
    const a = (e.target as Element | null)?.closest?.('a[href*="#"]') as HTMLAnchorElement | null;
    if (!a || a.pathname !== location.pathname || !a.hash) return;
    let t: Element | null = null;
    try {
      t = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    } catch {
      /* a malformed fragment goes nowhere */
    }
    if (t) arriveAt(t.getBoundingClientRect().top + scrollY);
  },
  true,
);
let backArrival = false;
addEventListener('popstate', () => (backArrival = true));
addEventListener('pageshow', (e) => {
  if (e.persisted) dryAll();
});

// ---------------------------------------------------------------- View: Sheet / List
let shown = '';
let lastApply = -Infinity;
let windowTimer = 0;
let fade: Animation[] = [];
const section = () => document.querySelector<HTMLElement>('section.sheet');
const checked = () => document.querySelector<HTMLInputElement>('[data-view-toggle] input:checked')?.value;
function apply(v: string): void {
  const s = section();
  if (!s || v === shown) return;
  const from = shown;
  shown = v;
  order(s, v);
  // A toggle is a List arrival (A3); a developing sheet print jumps to d = 1 and hands back first (A4).
  dryGroup('s');
  fade.forEach((a) => a.cancel());
  fade = [];
  s.dataset.view = v;
  if (reduced() || !from) {
    s.removeAttribute('data-fading');
    return;
  }
  s.dataset.fading = '';
  const inEl = s.querySelector<HTMLElement>(v === 'list' ? '[data-sheet-list]' : '[data-sheet-grid]');
  const outEl = s.querySelector<HTMLElement>(v === 'list' ? '[data-sheet-grid]' : '[data-sheet-list]');
  const o = { duration: durations.listToggle, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' as const };
  fade = [inEl?.animate({ opacity: [0, 1] }, o), outEl?.animate({ opacity: [1, 0] }, o)].filter(Boolean) as Animation[];
  fade[0]?.finished
    .then(() => {
      s.removeAttribute('data-fading');
      fade.forEach((a) => a.cancel());
      fade = [];
    })
    .catch(() => {});
  stage()?.invalidate();
}
/** The shown view's list comes first in the DOM (only the List moves; the sheet's slots stay put), so reading order is
 *  visual order and a first match for a print's id (the router's Back focus) is the visible link. */
function order(s: HTMLElement, v: string): void {
  const grid = s.querySelector('[data-sheet-grid]');
  const list = s.querySelector('[data-sheet-list]');
  if (!grid || !list) return;
  if (v === 'list' && grid.nextElementSibling === list) grid.before(list);
  if (v === 'sheet' && list.nextElementSibling === grid) grid.after(list);
}
function onToggle(): void {
  const v = checked();
  if (!v) return;
  try {
    const u = new URL(location.href);
    u.searchParams.set('view', v);
    history.replaceState(history.state, '', u);
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* storage off: the view still follows */
  }
  const now = performance.now();
  if (windowTimer) return;
  if (now - lastApply >= durations.swapMinGap) {
    lastApply = now;
    apply(v);
    return;
  }
  // The window's end applies the last state; it opens a new window only when it changes the view.
  windowTimer = window.setTimeout(() => {
    windowTimer = 0;
    const last = checked() ?? shown;
    if (last === shown) return;
    lastApply = performance.now();
    apply(last);
  }, durations.swapMinGap - (now - lastApply));
}
function initView(): void {
  const s = section();
  if (!s) return;
  // A Swup arrival brought markup the inline default never ran on: compute it the same way.
  if (!s.dataset.view) {
    const q = new URLSearchParams(location.search).get('view');
    let v = q === 'sheet' || q === 'list' ? q : null;
    try {
      v ??= ['sheet', 'list'].includes(localStorage.getItem(VIEW_KEY) ?? '') ? localStorage.getItem(VIEW_KEY) : null;
    } catch {
      /* no storage */
    }
    // A plain dotted read of navigator.connection (scripts/check/lint.mjs: no cast or alias of navigator).
    v ??= matchMedia('(max-width: 47.99rem)').matches || html.dataset.tier === 'static' || navigator.connection?.saveData ? 'list' : 'sheet';
    s.dataset.view = v;
    const r = s.querySelector<HTMLInputElement>(`input[value="${v}"]`);
    if (r) r.checked = true;
  }
  shown = s.dataset.view as string;
  order(s, shown);
  s.querySelector('[data-view-toggle]')?.addEventListener('change', onToggle);
}

// ---------------------------------------------------------------- failed covers, hover
document.addEventListener(
  'error',
  (e) => {
    const img = e.target as HTMLElement;
    if (!(img instanceof HTMLImageElement) || !img.matches('[data-poster]')) return;
    const p = img.closest<HTMLElement>('.print');
    if (!p) return;
    p.dataset.failed = '';
    p.removeAttribute('data-wet');
  },
  true,
);
const fine = matchMedia('(hover: hover) and (pointer: fine)');
function hover(e: PointerEvent, on: boolean): void {
  if (e.pointerType === 'touch' || !fine.matches) return;
  const el = (e.target as Element).closest?.<HTMLElement>('[data-print][data-gl-id]');
  if (el && !el.hasAttribute('data-failed') && (!on || !el.hasAttribute('data-wet'))) gl?.lift(el.dataset.glId as string, on);
}

// ---------------------------------------------------------------- page init (first load and every Swup arrival)
function init(): void {
  if (!document.querySelector('[data-print]')) return;
  const back = backArrival;
  backArrival = false;
  for (const img of document.querySelectorAll<HTMLImageElement>('.print img[data-poster]')) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) img.dispatchEvent(new Event('error'));
  }
  // Developed groups, and visits that never develop, are dry before anything else looks at them.
  for (const g of allGroups()) {
    if (done.has(g) || back || html.dataset.prints !== 'wet' || reduced() || location.hash) dryGroup(g);
  }
  initView();
  observe();
  for (const el of document.querySelectorAll<HTMLElement>('[data-print][data-gl-id]')) {
    el.addEventListener('pointerenter', (e) => hover(e, true));
    el.addEventListener('pointerleave', (e) => hover(e, false));
  }
}
init();
// A Swup swap replaces the #swup element itself (Swup 4: replaceWith): run again on the new page before it paints
// (mutation callbacks are microtasks).
new MutationObserver((records) => {
  if (records.some((r) => [...r.addedNodes].some((n) => n instanceof HTMLElement && n.id === 'swup'))) {
    shown = '';
    init();
  }
}).observe(document.body, { childList: true });
// The tier dropping to static, or motion turning reduced: nothing stays wet.
new MutationObserver(() => {
  if (failed() || reduced()) dryAll();
}).observe(html, { attributes: true, attributeFilter: ['data-tier', 'data-motion'] });
