// W-V1 A2 with GL at 640 x 400, DPR 1, Chromium and WebKit: a deep-link landing (/#work-NN, and Back from a cold
// /work/<slug>/, which lands on /#work-NN) puts the AF box where the arrows put it on the same frame, within 2 px. The
// landing used to place it against the intro's full-screen rect (the engine's rect was set after the AF), across the
// frame's bottom edge (gate r1 must-fix wv1-af-after-landing).
import { test, expect } from '@playwright/test';
import { base, context, home, untilState } from './lib.mjs';

const G1 = { viewport: { width: 640, height: 400 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false };
const GL_MS = 60000; // software GL in CI draws a few frames a second

/** The AF box's centre once it has held still for 3 reads 120 ms apart (the box has no transition, but the engine may). */
const afAt = (page) => page.evaluate(() => new Promise((resolve) => {
  const read = () => { const r = document.querySelector('[data-af]').getBoundingClientRect(); return [Math.round((r.left + r.width / 2) * 10) / 10, Math.round((r.top + r.height / 2) * 10) / 10]; };
  let last = read(), same = 0;
  const t = setInterval(() => {
    const now = read();
    same = now[0] === last[0] && now[1] === last[1] ? same + 1 : 0;
    last = now;
    if (same >= 3) { clearInterval(t); resolve(now); }
  }, 120);
}));
const frameBox = (page) => page.evaluate(() => { const r = document.querySelector('.frame').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });

test('A2 landing with GL: /#work-03, /#work-06 and Back from a cold /work/project-06/ put the AF box where the arrows do', async ({ browser, browserName }) => {
  test.setTimeout(240_000);
  const ctx = await context(browser, browserName, G1, { gl: true });
  const page = await ctx.newPage();
  try {
    // the arrows path: frames 3 and 6
    await home(page);
    test.skip(!(await page.evaluate(() => Boolean(window.__vfEngine))), 'no WebGL in this browser here: the gate checks the landing with GL on the reference host');
    await page.keyboard.press('Enter');
    await untilState(page, 'evf', 0, GL_MS);
    const arrows = {};
    for (let i = 1; i <= 5; i++) {
      await page.keyboard.press('ArrowRight');
      await untilState(page, 'evf', i, GL_MS);
      if (i === 2 || i === 5) {
        await page.waitForFunction(() => document.querySelector('[data-af]').classList.contains('is-lock'), null, { timeout: GL_MS });
        arrows[i] = await afAt(page);
      }
    }
    const frame = await frameBox(page);
    // each AF centre sits inside the frame (a sanity floor for the comparison itself)
    for (const [x, y] of Object.values(arrows)) {
      expect(x > frame[0] && x < frame[2] && y > frame[1] && y < frame[3], `arrows AF ${x},${y} inside the frame ${frame}`).toBe(true);
    }

    const landed = {};
    for (const [hash, i] of [['#work-03', 2], ['#work-06', 5]]) {
      await page.goto(`${base()}/?vf-test${hash}`, { waitUntil: 'load' });
      await page.reload({ waitUntil: 'load' }); // a fragment change alone keeps the document
      await untilState(page, 'evf', i, GL_MS);
      expect(await page.evaluate(() => document.getElementById('intro').hidden), 'no intro').toBe(true);
      landed[hash] = await afAt(page);
    }
    // Back from a cold page: location.replace('/#work-06') is a fresh landing
    await page.goto(`${base()}/work/project-06/?vf-test`, { waitUntil: 'load' });
    await untilState(page, 'open', 5, GL_MS);
    await page.keyboard.press('Escape');
    await page.waitForURL(/\/\?vf-test#work-06$/, { timeout: GL_MS });
    await untilState(page, 'evf', 5, GL_MS);
    landed.cold = await afAt(page);

    const off = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    expect({
      'work-03': off(landed['#work-03'], arrows[2]) <= 2,
      'work-06': off(landed['#work-06'], arrows[5]) <= 2,
      'cold back': off(landed.cold, arrows[5]) <= 2,
    }, `AF centres: arrows ${JSON.stringify(arrows)}, landed ${JSON.stringify(landed)}`).toEqual({ 'work-03': true, 'work-06': true, 'cold back': true });
  } finally {
    await ctx.close();
  }
});
