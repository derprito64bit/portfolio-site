// D-055 on the built page, in Chromium and WebKit: plain / has no __vf* global (before and after a raise, so nothing
// attaches later either), and /?vf-test has exactly the test API. The negative control plants a __vf* global with an
// init script on plain /: the same probe must report it, so an empty result cannot come from a probe that sees nothing.
// The module itself is checked both ways in tests/unit/evf/testhooks.test.mjs; lint keeps the names in testhooks.ts.
import { test, expect } from '@playwright/test';
import { NO3D, consoleGate, flatPathVerdict, vfGlobals } from '../harness/lib.mjs';
import { PROFILE, base, isFlat, newSmokeContext } from './vf.mjs';

const API = ['closeProject', 'go', 'lower', 'openProject', 'pos', 'raise', 'resetStats', 'setSim', 'state', 'stats'];
const settled = (page) => page.waitForFunction(() => !document.documentElement.classList.contains('is-loading') && !document.querySelector('[data-raise]').disabled, null, { polling: 50, timeout: 45000 });
const verdict = (gate, flat) => {
  const v = flat ? flatPathVerdict(gate.verdict()) : gate.verdict();
  return v.failures.map((f) => `${f.channel}/${f.level} (${f.why}): ${String(f.text).slice(0, 200)}`);
};

test(`gating at ${PROFILE}${NO3D ? ' (flat frames)' : ''}: no __vf* global without ?vf-test`, async ({ browser, browserName }) => {
  const ctx = await newSmokeContext(browser, browserName);
  try {
    const page = await ctx.newPage();
    const gate = consoleGate(page);
    await page.goto(`${base()}/`, { waitUntil: 'load' });
    expect(await vfGlobals(page), 'plain /, at load').toEqual([]);
    await settled(page);
    expect(await vfGlobals(page), 'plain /, after the preloader').toEqual([]);
    // the page still works without the hooks: Enter raises the camera (the intro hides when the raise ends)
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('intro').hidden, null, { polling: 50, timeout: 45000 });
    expect(await vfGlobals(page), 'plain /, after the raise').toEqual([]);
    expect(verdict(gate, isFlat(browserName)), '0 console errors').toEqual([]);
  } finally {
    await ctx.close();
  }
});

test(`gating at ${PROFILE}${NO3D ? ' (flat frames)' : ''}: ?vf-test attaches the test API`, async ({ browser, browserName }) => {
  const ctx = await newSmokeContext(browser, browserName);
  try {
    const page = await ctx.newPage();
    await page.goto(`${base()}/?vf-test`, { waitUntil: 'load' });
    await settled(page);
    // __vfEngine attaches when the engine boots, so it is absent on the flat-frame path
    const flat = isFlat(browserName);
    expect(await vfGlobals(page)).toEqual(flat ? ['__vf'] : ['__vf', '__vfEngine']);
    expect(await page.evaluate(() => Object.keys(window.__vf).sort())).toEqual(API);
    const s = await page.evaluate(() => window.__vf.stats());
    expect(s.engine).toBe(!flat);
    if (!flat) expect(s.frames, 'the counters count').toBeGreaterThan(0);
  } finally {
    await ctx.close();
  }
});

test('gating, negative control: the probe reports a planted __vf* global on plain /', async ({ browser, browserName }) => {
  const ctx = await newSmokeContext(browser, browserName);
  try {
    await ctx.addInitScript(() => { window.__vfPlanted = 1; });
    const page = await ctx.newPage();
    await page.goto(`${base()}/`, { waitUntil: 'load' });
    expect(await vfGlobals(page)).toEqual(['__vfPlanted']);
  } finally {
    await ctx.close();
  }
});
