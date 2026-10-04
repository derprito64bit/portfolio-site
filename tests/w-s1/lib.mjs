// Shared helpers for W-S1's acceptance checks (issue #13). Built on the harness (tests/harness/lib.mjs, GES-1).
// The site must be built first (npm run build); every check serves dist/ itself.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as H from '../harness/lib.mjs';

export { H };

/** GES-1 profiles plus the extra sizes the brief names (landscape phone, 960 x 900, 1180 x 820, 600 x 900). */
export const EXTRA = {
  L844: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true, input: 'touch', browser: 'chromium' },
  W960: { viewport: { width: 960, height: 900 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false, input: 'mouse', browser: 'chromium' },
  X1180: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: false, input: 'touch', browser: 'chromium' },
  X600: { viewport: { width: 600, height: 900 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, input: 'touch', browser: 'chromium' },
};
export const profile = (name) => H.PROFILES[name] ?? EXTRA[name];

/** A context for a GES-1 profile or one of the extras, in a mode (auto, reduced, static is a query). */
export async function context(name, mode = 'auto', extra = {}) {
  if (H.PROFILES[name]) return H.newContext(name, mode, extra);
  const p = EXTRA[name];
  const b = await H.browser(p.browser);
  return b.newContext({
    viewport: p.viewport,
    deviceScaleFactor: p.deviceScaleFactor,
    hasTouch: p.hasTouch,
    isMobile: p.isMobile,
    reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference',
    colorScheme: extra.colorScheme ?? 'light',
    serviceWorkers: 'block',
  });
}

/** Open the home page; `mode` static adds ?tier=static. Returns { page, ctx, gate } with the console gate attached. */
export async function open(base, name, mode = 'auto', { query = '', colorScheme, init } = {}) {
  const ctx = await context(name, mode, { colorScheme });
  const page = await ctx.newPage();
  const gate = H.consoleGate(page);
  if (init) await page.addInitScript(init);
  const q = new URLSearchParams(query);
  if (mode === 'static') q.set('tier', 'static');
  const s = q.toString();
  await page.goto(`${base}/${s ? `?${s}` : ''}`, { waitUntil: 'load' });
  return { page, ctx, gate };
}

/** Wait until the hero is at rest: the intro (if any) handed back and the stage settled. */
export async function heroAtRest(page, timeout = 15000) {
  await page.waitForFunction(() => {
    const h = document.documentElement.dataset.hero;
    const cam = window.__hero;
    return h !== 'eject' && (!cam || !cam.flying) && window.__stage?.settled === true;
  }, null, { timeout, polling: 100 });
}

export function rectsIntersect(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/** The hero's geometry at rest, in viewport CSS px. */
export async function heroRects(page) {
  return page.evaluate(() => {
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    const q = (s) => document.querySelector(s);
    const hero = q('[data-hero-section]');
    const cs = getComputedStyle(hero);
    const band = hero.dataset.band;
    const printEl = q('[data-hero-print]');
    return {
      vw: document.documentElement.clientWidth,
      vh: innerHeight,
      band,
      arrangement: hero.dataset.arrangement,
      contentW: q('.hero-row').clientWidth,
      h1: r(q('h1')),
      line: r(q('.hero-line')),
      cta: r(q('.hero-cta a')),
      camera: r(q('[data-hero-camera]')),
      print: r(printEl),
      printLayoutW: printEl.offsetWidth,
      strip: r(q('[data-camera-strip]')),
      lens: { x: parseFloat(cs.getPropertyValue(`--mk-${band}-lens-x`)), y: parseFloat(cs.getPropertyValue(`--mk-${band}-lens-y`)) },
      tier: document.documentElement.dataset.tier,
      hero: document.documentElement.dataset.hero,
    };
  });
}
