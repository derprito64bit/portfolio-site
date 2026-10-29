// Shared by the smoke specs: the context for a profile and path, the page's test API (read only), state waits.
import { NO3D, NO_WEBGL_INIT, PROFILES } from '../harness/lib.mjs';

/** The profile (viewport and DPR) the specs run at: SMOKE_PROFILE, else G1 in CI (small, for software GL), else D2. */
export const PROFILE = process.env.SMOKE_PROFILE || (process.env.CI ? 'G1' : 'D2');
/**
 * The flat-frame path (no WebGL) in an engine: every engine under H_NO3D=1, or the engines SMOKE_FLAT names
 * (SMOKE_FLAT=webkit runs WebKit flat and Chromium with GL).
 */
export const isFlat = (browserName) => NO3D || String(process.env.SMOKE_FLAT ?? '').split(',').map((s) => s.trim()).includes(browserName);
/** The longest wait for one step's state (software GL is slow; every wait ends as soon as the state is reached). */
export const STEP_MS = Number(process.env.SMOKE_STEP_MS) || 45000;

export function base() {
  if (!process.env.SMOKE_BASE) throw new Error('SMOKE_BASE is unset: run through playwright.config.ts (its globalSetup serves dist/)');
  return process.env.SMOKE_BASE;
}

export async function newSmokeContext(browser, browserName, extra = {}) {
  const p = PROFILES[PROFILE];
  if (!p) throw new Error(`SMOKE_PROFILE ${PROFILE} is not a tests/harness/lib.mjs profile`);
  const ctx = await browser.newContext({
    viewport: p.viewport, deviceScaleFactor: p.deviceScaleFactor, hasTouch: false, isMobile: false,
    reducedMotion: 'no-preference', colorScheme: 'light', serviceWorkers: 'block', ...extra,
  });
  // Under H_NO3D Chromium also has --disable-3d-apis (the config); WebKit has no such flag, and SMOKE_FLAT may name
  // either engine, so a flat engine always gets the init script that refuses WebGL contexts.
  if (isFlat(browserName)) await ctx.addInitScript(NO_WEBGL_INIT);
  return ctx;
}

/** state() and pos() through window.__vf (?vf-test only). */
export const at = (page) => page.evaluate(() => ({ state: window.__vf.state(), pos: window.__vf.pos() }));
/** Waits until state() and pos() read `want`; polls every 50 ms, never a fixed sleep. */
export const until = (page, want, timeout = STEP_MS) => page.waitForFunction(
  ([s, p]) => window.__vf && window.__vf.state() === s && window.__vf.pos() === p, [want.state, want.pos], { timeout, polling: 50 });
