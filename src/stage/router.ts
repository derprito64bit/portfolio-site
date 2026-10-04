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
import { stats } from './state.ts';

const html = document.documentElement;
/** Fork-owned doors are always full loads (publish.ps1 reserved paths). */
const FORK_DOOR = /^\/(manor|arcade|play)(\/|$)/;

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

export let swup: Swup | null = null;

export function bootRouter(): Swup {
  history.scrollRestoration = 'manual';
  swup = new Swup({
    containers: ['#swup'],
    animationSelector: '[data-swup-fade]',
    linkSelector: 'a[href]',
    ignoreVisit: (url, { el } = {}) => Boolean(el?.closest('[data-no-swup]')) || FORK_DOOR.test(new URL(url, location.origin).pathname),
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
    for (const fn of startListeners) fn(visit);
    invalidate();
  });

  swup.hooks.before('content:replace', (visit) => {
    for (const fn of beforeReplace) fn(visit);
    unscan();
  });

  swup.hooks.on('content:replace', (visit) => {
    const main = document.getElementById('main');
    if (main?.dataset.page) html.dataset.page = main.dataset.page;
    html.dataset.glPage = main?.dataset.glPage === 'off' ? 'off' : 'on';
    scan(document.getElementById('swup') ?? document);
    getLenis()?.resize();
    if (visit.history.popstate) scrollToY(Number(entry().ionScroll) || 0);
    for (const fn of afterReplace) fn(visit);
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
