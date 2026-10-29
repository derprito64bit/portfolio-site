// State-machine smoke (W-V0b row 8): boot, intro, raise, frame 3, open, close, honours, contact, lower, in Chromium and
// WebKit. Real inputs drive every step (the wheel for the raise and one frame, keys for the rest); window.__vf
// (?vf-test, D-055) is only read: state() and pos() are asserted at each step, with the transitional state the step must
// pass through (raising, opening, closing, lowering) taken from a 5 ms state trail. Every wait is on page state, never a
// fixed sleep. 0 console errors, by the console gate's rules (tests/harness/lib.mjs consoleGate; on the flat-frame path
// the page's own flat-frame notice is expected, as in h:console).
// The frame counters (#92): with GL each step's counts must hold the per-frame invariants (scene, composite, eyepiece
// and readback at most one draw per presented frame; composite and eyepiece never in the same frame) and the passes
// the step draws must count (the eyepiece in the raise and the lower, the scene and the composite in a frame change);
// on the flat-frame path every count is 0 and stats().engine is false.
// Run: npm run build, then npm run test:smoke (GL), or H_NO3D=1 npm run test:smoke (flat frames).
import { test, expect } from '@playwright/test';
import { consoleGate, flatPathVerdict } from '../harness/lib.mjs';
import { NO3D } from '../harness/lib.mjs';
import { PROFILE, STEP_MS, at, base, isFlat, newSmokeContext, until } from './vf.mjs';

const TRAIL = `(() => {
  const trail = [];
  Object.defineProperty(window, '__smokeTrail', { value: trail });
  let last = null;
  setInterval(() => {
    const v = window.__vf;
    if (!v) return;
    const s = v.state();
    if (s !== last) { last = s; trail.push(s); }
  }, 5);
})();`;

test(`state machine at ${PROFILE}${NO3D ? ' (flat frames)' : ''}: boot, intro, raise, frame 3, open, close, honours, contact, lower`, async ({ browser, browserName }) => {
  const FLAT = isFlat(browserName);
  const ctx = await newSmokeContext(browser, browserName);
  await ctx.addInitScript(TRAIL);
  const page = await ctx.newPage();
  const gate = consoleGate(page);
  const log = [];
  let seen = 0;
  /** The states entered since the last call. */
  const trail = async () => {
    const t = await page.evaluate(() => window.__smokeTrail.slice());
    const out = t.slice(seen);
    seen = t.length;
    return out;
  };
  const stats = () => page.evaluate(() => window.__vf.stats());
  const reset = () => page.evaluate(() => window.__vf && window.__vf.resetStats());
  /** One step: act, wait for `want`, then assert state, pos, the transitional state and the counters. */
  const step = (name, want, { via = null, act = null, draws = [] } = {}) => test.step(name, async () => {
    await reset();
    if (act) await act();
    await until(page, want);
    expect(await at(page), `${name}: state and pos`).toEqual(want);
    const states = await trail();
    if (via) expect(states, `${name}: passes through ${via}`).toContain(via);
    // the passes this step draws: waited on (a slow renderer may present its first frame after the state is reached)
    if (!FLAT && draws.length) await page.waitForFunction((chs) => chs.every((c) => window.__vf.stats()[c] > 0), draws, { timeout: STEP_MS, polling: 50 });
    const s = await stats();
    if (FLAT) {
      expect(s.engine, `${name}: no engine on the flat-frame path`).toBe(false);
      expect([s.frames, s.scene, s.composite, s.eyepiece, s.readback], `${name}: no frames on the flat-frame path`).toEqual([0, 0, 0, 0, 0]);
    } else {
      expect(s.engine, `${name}: the GL engine booted`).toBe(true);
      for (const ch of ['scene', 'composite', 'eyepiece', 'readback']) expect(s[ch], `${name}: ${ch} at most one draw per presented frame`).toBeLessThanOrEqual(s.frames);
      expect(s.composite + s.eyepiece, `${name}: composite and eyepiece never in one frame`).toBeLessThanOrEqual(s.frames);
      for (const ch of draws) expect(s[ch], `${name}: the ${ch} pass draws`).toBeGreaterThan(0);
    }
    log.push({ step: name, ...want, states, counts: { frames: s.frames, scene: s.scene, composite: s.composite, eyepiece: s.eyepiece, readback: s.readback, ms: Math.round(s.ms) } });
  });
  const centre = async () => {
    const vp = page.viewportSize();
    await page.mouse.move(Math.round(vp.width / 2), Math.round(vp.height / 2));
  };
  const wheel = async () => {
    await centre();
    await page.mouse.wheel(0, 240);
  };
  /** Presses ArrowRight until pos() reads `to`, one key per frame change (waits on pos, never a sleep). */
  const forwardTo = async (from, to) => {
    for (let p = from + 1; p <= to; p++) {
      await page.keyboard.press('ArrowRight');
      await until(page, { state: 'evf', pos: p });
    }
  };

  try {
    await step('boot', { state: 'intro', pos: 0 }, {
      act: async () => {
        await page.goto(`${base()}/?vf-test`, { waitUntil: 'load' });
        await page.waitForFunction(() => Boolean(window.__vf), null, { polling: 50 });
      },
      draws: ['scene', 'composite'],
    });
    expect((await page.evaluate(() => window.__smokeTrail.slice()))[0], 'boot starts in loading').toBe('loading');
    const counts = await page.evaluate(() => ({
      work: document.querySelectorAll('[data-grp="work"] [data-go]').length,
      play: document.querySelectorAll('[data-grp="play"] [data-go]').length,
    }));
    expect(counts.work, 'projects in the index').toBeGreaterThan(3);
    expect(counts.play, 'honours in the index').toBeGreaterThan(0);
    const NW = counts.work, NP = counts.play;

    await step('intro', { state: 'intro', pos: 0 }, {
      act: () => page.waitForFunction(() => !document.documentElement.classList.contains('is-loading') && !document.querySelector('[data-raise]').disabled && !document.getElementById('intro').hidden, null, { polling: 50 }),
    });
    await step('raise (wheel)', { state: 'evf', pos: 0 }, { via: 'raising', act: wheel, draws: ['eyepiece', 'scene'] });
    await step('frame 3 (ArrowRight, then the wheel)', { state: 'evf', pos: 2 }, {
      act: async () => {
        await forwardTo(0, 1);
        await wheel();
      },
      draws: ['scene', 'composite'],
    });
    await step('open (Enter)', { state: 'open', pos: 2 }, { via: 'opening', act: () => page.keyboard.press('Enter'), draws: ['composite'] });
    await expect(page.locator('#proj')).toBeVisible();
    await step('close (Escape)', { state: 'evf', pos: 2 }, { via: 'closing', act: () => page.keyboard.press('Escape'), draws: ['composite'] });
    await expect(page.locator('#proj')).toBeHidden();
    await step('honours (ArrowRight to the first honour)', { state: 'evf', pos: NW }, { act: () => forwardTo(2, NW), draws: ['scene', 'composite'] });
    await expect(page.locator('[data-screen="play"]')).toBeVisible();
    await step('contact (ArrowRight to the info frame)', { state: 'evf', pos: NW + NP }, { act: () => forwardTo(NW, NW + NP), draws: ['composite'] });
    await expect(page.locator('[data-screen="info"]')).toBeVisible();
    await step('lower (Escape)', { state: 'intro', pos: NW + NP }, { via: 'lowering', act: () => page.keyboard.press('Escape'), draws: ['eyepiece'] });
    await expect(page.locator('#intro')).toBeVisible();

    const v = FLAT ? flatPathVerdict(gate.verdict()) : gate.verdict();
    test.info().annotations.push({ type: 'smoke', description: JSON.stringify({ browser: browserName, profile: PROFILE, flat: FLAT, steps: log, consoleEvents: v.events }) });
    expect(v.failures.map((f) => `${f.channel}/${f.level} (${f.why}): ${String(f.text).slice(0, 200)}`), '0 console errors').toEqual([]);
  } finally {
    await ctx.close();
  }
});
