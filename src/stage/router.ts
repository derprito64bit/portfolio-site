// Page swaps (W-D015): plain Swup plus its a11y plugin. One module boots once; pages declare slots, never scripts.
// The canvas lives outside #swup, so the same canvas and GL context persist across every swap.
// - visit:start: remember this entry's scroll and the print link that started the visit; Lenis stops.
// - before content:replace: unbind the slots. After: scan, Lenis resize, restore scroll for history visits.
// - visit:end: Lenis starts; focus follows the rules below.
// Focus: a hash visit focuses the hash target. Back and Forward focus the [data-gl-id] link that started the forward
// visit (kept in history.state), else the main h1. One anchor scroller: Swup's scroll:anchor is replaced by
// scroll.ts, and the plugin's own focus call is kept. Reduced motion: no animated swap (opacity only, W-C3).
import Swup, { type Visit } from 'swup';
import SwupA11yPlugin from '@swup/a11y-plugin';
import { isReduced } from './motion.ts';
import { scan, unscan } from './slots.ts';
import { getLenis, scrollToElement, scrollToY } from './scroll.ts';
import { invalidate, markDirty } from './ticker.ts';
import { guard, stats } from './state.ts';

const html = document.documentElement;
/** Fork-owned paths (/manor/, /arcade/, /play/: publish.ps1 reserved) are always full loads, never Swup visits. */
const FORK_PATH = /^\/(manor|arcade|play)(\/|$)/;

type Listener = (visit: Visit) => void;
const startListeners = new Set<Listener>();
const beforeReplace = new Set<Listener>();
const afterReplace = new Set<Listener>();
/** Lift-and-dock (W-S3) and GL entities hook in here. */
export const routerHooks = {
  onVisitStart: (fn: Listener) => (startListeners.add(fn), () => startListeners.delete(fn)),
  onBeforeReplace: (fn: Listener) => (beforeReplace.add(fn), () => beforeReplace.delete(fn)),
  onAfterReplace: (fn: Listener) => (afterReplace.add(fn), () => afterReplace.delete(fn)),
};

interface EntryState {
  ionScroll?: number;
  ionFocus?: string;
  [k: string]: unknown;
}
const entry = (): EntryState => (history.state && typeof history.state === 'object' ? history.state : {});
function writeEntry(patch: EntryState): void {
  history.replaceState({ ...entry(), ...patch }, '');
}

function byId(id: string): HTMLElement | null {
  return document.getElementById(decodeURIComponent(id.replace(/^#/, '')));
}
/** Focus without scrolling. Headings get tabindex -1 so they can hold focus; links keep their tab order. */
function focusEl(el: HTMLElement | null): boolean {
  if (!el) return false;
  if (el.tabIndex < 0 && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  return document.activeElement === el;
}

/**
 * The arriving page's GL opt-out (W-D029: the 404 has no WebGL). Base puts data-gl-page on the page's <html> and its
 * <main>; the fetched document's <html> is read first, then the new <main>. A page that says neither is 'off' (fail
 * closed): a Swup arrival never turns GL intent on by default.
 */
function arrivingGlPage(visit: Visit, main: HTMLElement | null): 'on' | 'off' {
  const said = visit.to.document?.documentElement.dataset.glPage ?? main?.dataset.glPage;
  return said === 'on' ? 'on' : 'off';
}

export let swup: Swup | null = null;

/**
 * Scroll restoration (Breaker 3.3 #3; #11 'Back restores scroll to +-1 px'). An entry no Swup visit has touched keeps
 * the browser's own restoration ('auto'), so a full-load Back or a reload lands where the reader was. The first Swup
 * visit turns it to 'manual' on the entry it leaves (the entries Swup pushes copy that mode), and from then on the
 * router restores: Swup's popstate visits from ionScroll (below), and a full-load Back, Forward or reload into such an
 * entry here, once the page has loaded, unless the reader has scrolled by then. Focus follows as for a popstate visit.
 */
function restoreFullLoad(): void {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (history.scrollRestoration !== 'manual' || !nav || (nav.type !== 'back_forward' && nav.type !== 'reload')) return;
  const y = Number(entry().ionScroll);
  const id = entry().ionFocus;
  const go = () => {
    if (window.scrollY === 0 && y > 0) scrollToY(y);
    if (nav.type === 'back_forward' && id) focusEl(document.querySelector<HTMLElement>(`[data-gl-id="${CSS.escape(id)}"]`));
    markDirty();
  };
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}

export function bootRouter(): Swup {
  restoreFullLoad();
  swup = new Swup({
    containers: ['#swup'],
    animationSelector: '[data-swup-fade]',
    linkSelector: 'a[href]',
    ignoreVisit: (url, { el } = {}) => Boolean(el?.closest('[data-no-swup]')) || FORK_PATH.test(new URL(url, location.origin).pathname),
    plugins: [new SwupA11yPlugin({ headingSelector: ['main h1', 'h1'], respectReducedMotion: false })],
  });

  // The current entry keeps its scroll position (debounced; Safari limits replaceState bursts). On popstate the
  // browser has already switched entries, so this is the only way Forward can restore the page we left.
  let navigating = false;
  let saveTimer = 0;
  addEventListener('scroll', () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (!navigating) writeEntry({ ionScroll: window.scrollY });
    }, 150);
  }, { passive: true });

  swup.hooks.on('visit:start', (visit) => {
    stats.swaps++;
    navigating = true;
    // From the first Swup visit the router restores scroll itself (restoreFullLoad above).
    history.scrollRestoration = 'manual';
    clearTimeout(saveTimer);
    // A forward visit: this entry (the page we leave) remembers where it was and which print link started it.
    // Swup pushes the new entry after visit:start, so history.state is still ours here.
    if (!visit.history.popstate) {
      const origin = visit.trigger.el?.closest<HTMLElement>('[data-gl-id]');
      writeEntry({ ionScroll: window.scrollY, ionFocus: origin?.dataset.glId ?? '' });
    }
    if (isReduced() || !document.querySelector('#swup [data-swup-fade]')) visit.animation.animate = false;
    if (visit.to.hash) visit.a11y.focus = `[id="${CSS.escape(decodeURIComponent(visit.to.hash.slice(1)))}"]`;
    if (visit.history.popstate) visit.a11y.focus = false; // handled after the swap, below
    getLenis()?.stop();
    // Each crew's hook on its own (guard): one that throws must not stop the others or the visit.
    for (const fn of startListeners) guard(() => fn(visit), undefined);
    invalidate();
  });

  swup.hooks.before('content:replace', (visit) => {
    for (const fn of beforeReplace) guard(() => fn(visit), undefined);
    unscan();
  });

  swup.hooks.on('content:replace', (visit) => {
    const main = document.getElementById('main');
    if (main?.dataset.page) html.dataset.page = main.dataset.page;
    html.dataset.glPage = arrivingGlPage(visit, main);
    scan(document.getElementById('swup') ?? document);
    getLenis()?.resize();
    if (visit.history.popstate) scrollToY(Number(entry().ionScroll) || 0);
    for (const fn of afterReplace) guard(() => fn(visit), undefined);
    markDirty();
  });

  // Back and Forward: focus the print link that started the forward visit, else the page's h1.
  swup.hooks.on('visit:end', (visit) => {
    navigating = false;
    getLenis()?.start();
    if (visit.history.popstate) {
      const id = entry().ionFocus;
      const link = id ? document.querySelector<HTMLElement>(`[data-gl-id="${CSS.escape(id)}"]`) : null;
      if (!focusEl(link)) focusEl(document.querySelector<HTMLElement>('main h1'));
    }
  });

  swup.hooks.on('visit:abort', () => {
    navigating = false;
    getLenis()?.start();
  });

  // The one anchor scroller. The a11y plugin's own scroll:anchor handler still runs after this and focuses the target.
  swup.hooks.replace('scroll:anchor', (_visit, { hash }) => {
    const el = byId(hash);
    if (!el) return false;
    scrollToElement(el);
    return true;
  });
  swup.hooks.replace('scroll:top', () => {
    scrollToY(0);
    return true;
  });

  return swup;
}
