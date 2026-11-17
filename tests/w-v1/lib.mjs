// Shared by the W-V1 specs (tests/w-v1, spec v1 rows A2 and A5 to A14): contexts on the flat path (WebGL off) at the
// two gate viewports, the page's test API (?vf-test, D-055, read only), state waits and layout reads. Every wait is on
// page state, never a fixed sleep, except where a row names a duration (the 1.0 s expose, the 100 ms brackets, A14's
// 1 s and 3 s).
import { test as base0 } from '@playwright/test';
import { NO_WEBGL_INIT, consoleGate, flatPathVerdict } from '../harness/lib.mjs';

export { consoleGate, flatPathVerdict };

/** `test` with `own`: a browser of the row's own, launched with the project's options and closed after the row. CI's
 *  one long-lived WebKit was lost late in the run (the page closed mid-row, a different roll row each run; never on the
 *  reference host), so the roll's rows run each in a fresh browser. The assertions are the same. */
export const ownBrowser = base0.extend({
  own: async ({ playwright, browserName, launchOptions, channel }, use) => {
    const b = await playwright[browserName].launch({ ...launchOptions, ...(channel ? { channel } : {}), headless: true });
    await use(b);
    await b.close();
  },
});
export const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false };
export const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
export const STEP_MS = Number(process.env.W_V1_STEP_MS) || 20000;
/** A coarse pointer in both engines (an init script): WebKit reports a fine one under touch emulation, so the query is
 *  forced. context()'s `coarse` option adds it. */
export const COARSE = `(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => mm(/pointer: ?fine|hover: ?hover/.test(q) ? '(max-width: 0px)' : q); })();`;

export function base() {
  if (!process.env.SMOKE_BASE) throw new Error('SMOKE_BASE is unset: run through tests/w-v1/playwright.config.mjs (its globalSetup serves dist/)');
  return process.env.SMOKE_BASE;
}

/** A context on the flat path (no WebGL in either engine) unless gl is true. WebKit ignores isMobile; touch still holds,
 *  and `coarse` makes the pointer coarse in both engines. */
export async function context(browser, browserName, profile = DESK, { gl = false, reduced = false, js = true, coarse = false, init = [] } = {}) {
  const p = browserName === 'webkit' ? { ...profile, isMobile: false } : profile;
  const ctx = await browser.newContext({
    ...p, reducedMotion: reduced ? 'reduce' : 'no-preference', colorScheme: 'dark', serviceWorkers: 'block', javaScriptEnabled: js,
  });
  if (!gl) await ctx.addInitScript(NO_WEBGL_INIT);
  if (coarse) await ctx.addInitScript(COARSE);
  for (const s of init) await ctx.addInitScript(s);
  return ctx;
}

export const vf = (page) => page.evaluate(() => ({ state: window.__vf.state(), pos: window.__vf.pos() }));
export const untilState = (page, state, pos = null, timeout = STEP_MS) => page.waitForFunction(
  ([s, p]) => window.__vf && window.__vf.state() === s && (p === null || window.__vf.pos() === p), [state, pos], { timeout, polling: 50 });

/** / with the test API, past the preloader, at the intro. */
export async function home(page, path = '/?vf-test') {
  await page.goto(`${base()}${path}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__vf && !document.documentElement.classList.contains('is-loading') && window.__vf.state() !== 'loading', null, { timeout: STEP_MS, polling: 50 });
}

/** From the intro: raise, then ArrowRight to frame `to` (0-based), one key per frame. */
export async function toFrame(page, to) {
  await page.keyboard.press('Enter');
  await untilState(page, 'evf', 0);
  for (let i = 1; i <= to; i++) {
    await page.keyboard.press('ArrowRight');
    await untilState(page, 'evf', i);
  }
}

/** The open project's column scroller on /, or the window on a cold page. */
export const scrollTo = (page, y) => page.evaluate((v) => {
  const c = document.querySelector('.proj:not([hidden]) .proj__col');
  if (c) c.scrollTop = v; else window.scrollTo(0, v);
}, y);

/** Scrolls so print n (1-based) sits at the view's centre. */
export const centrePrint = (page, n) => page.evaluate((k) => {
  const p = document.querySelector(`#print-${String(k).padStart(2, '0')} .print__frame`);
  const c = document.querySelector('.proj:not([hidden]) .proj__col');
  const r = p.getBoundingClientRect();
  if (c) { const cr = c.getBoundingClientRect(); c.scrollTop += r.top + r.height / 2 - (cr.top + c.clientHeight / 2); }
  else window.scrollBy(0, r.top + r.height / 2 - window.innerHeight / 2);
}, n);

/** Every print's frame and figure geometry, plus its data. */
export const prints = (page) => page.evaluate(() => [...document.querySelectorAll('.print')].map((p) => {
  const f = p.querySelector('.print__frame').getBoundingClientRect();
  const g = p.getBoundingClientRect();
  const roll = p.closest('.roll__grid').getBoundingClientRect();
  const s = p.querySelector('.print__strip');
  const sr = s.getBoundingClientRect();
  return {
    n: Number(p.dataset.print), w: Number(p.dataset.w), h: Number(p.dataset.h), ar: Number(p.dataset.ar), wf: Number(p.dataset.wf), pf: Number(p.dataset.pf),
    drop: p.hasAttribute('data-drop'), side: p.dataset.side, letterbox: p.hasAttribute('data-letterbox'), type: p.dataset.type,
    frame: { x: f.left, y: f.top, w: f.width, h: f.height }, fig: { x: g.left, y: g.top, w: g.width, h: g.height },
    roll: { x: roll.left, w: roll.width }, strip: { h: sr.height, top: sr.top, bottom: sr.bottom },
  };
}));
