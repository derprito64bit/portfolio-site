// The hero's handle on the stage (W-F), through window.__stage and the <html> data attributes only.
// Why not `import ... from 'src/stage'`: a component script that imports the stage module splits it out of the
// layout's entry chunk, and W-F's size-limit config then cannot find the pre-GL entry (filed for W-F). Everything
// the hero needs is reachable here instead: the tier and motion axes are live attributes on <html>, the status region,
// the flash limiter and invalidate() are on __stage, and the GL API arrives as __stage.gl after stage:gl-ready.
import type { GLApi } from '../../stage/gl/index.ts';

const html = document.documentElement;

interface StageHooks {
  readonly gl: GLApi | null;
  readonly tier: string;
  readonly glState: string;
  requestFlash(trigger: string, id?: string): boolean;
  announce(text: string): void;
  invalidate(): void;
  effects: Record<string, (...args: never[]) => Promise<unknown>>;
  registerEffect?: (name: string, impl: unknown) => void;
}

/** The stage's hooks, once the stage module has run (after DOMContentLoaded at the latest). */
export function stage(): StageHooks | null {
  return (window as unknown as { __stage?: StageHooks }).__stage ?? null;
}

export const tier = (): string => html.dataset.tier || 'static';
export const reduced = (): boolean => html.dataset.motion === 'reduced';

/** Watch an attribute on <html> (data-motion, data-tier): the live axes (W-D017). Returns an unsubscribe. */
export function onHtmlAttr(name: string, fn: (value: string) => void): () => void {
  const mo = new MutationObserver(() => fn(html.getAttribute(name) || ''));
  mo.observe(html, { attributes: true, attributeFilter: [name] });
  return () => mo.disconnect();
}

/** Resolves when the named user-timing mark exists (stage:gl-start, stage:gl-ready). */
export function whenMark(name: string): Promise<number> {
  return new Promise((res) => {
    const m = performance.getEntriesByName(name, 'mark')[0];
    if (m) return res(m.startTime);
    try {
      const po = new PerformanceObserver((list) => {
        const e = list.getEntries().find((x) => x.name === name);
        if (e) {
          po.disconnect();
          res(e.startTime);
        }
      });
      po.observe({ type: 'mark', buffered: true });
    } catch {
      /* no PerformanceObserver: never resolves; the hero keeps its posters */
    }
  });
}
export function markTime(name: string): number | null {
  const m = performance.getEntriesByName(name, 'mark')[0];
  return m ? m.startTime : null;
}

/** The GL API, once GL is ready (never on the static tier). */
export async function whenGL(): Promise<GLApi | null> {
  await whenMark('stage:gl-ready');
  return stage()?.gl ?? null;
}

/** After the stage module has run (module scripts run in document order; the stage's comes after the hero's). */
export function afterStage(fn: () => void): void {
  if (stage()) fn();
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else setTimeout(fn, 0);
}

/** Run fn after Swup replaces the page content (the hero comes back on a Back or Home visit). */
export function onContentReplace(fn: () => void): void {
  // Swup 4 swaps the #swup container element itself (or its children, depending on the version): watch both levels.
  const isPage = (n: Node) => n instanceof HTMLElement && (n.id === 'swup' || n.matches('main, #main'));
  new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some(isPage))) fn();
  }).observe(document.body, { childList: true, subtree: false });
  const swup = document.getElementById('swup');
  if (swup) {
    new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes].some(isPage))) fn();
    }).observe(swup, { childList: true });
  }
}
