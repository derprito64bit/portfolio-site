// W-V1 A2 by keyboard, pointer and touch on the flat path, Chromium and WebKit, at 1440 x 900 and 390 x 844 (judge r2
// must-fix wv1-close-focus-opener and wv1-open-keyboard-scroll; gate path 6, keyboard only).
// - Close (Esc, the Back button, browser Back) puts focus on Open frame after an Enter on the EVF itself, after a click
//   or tap on Open frame (WebKit focuses no button on a click), and after previous or next. 9f25a82 focused main#evf.
// - Right after Open, PageDown, ArrowDown, Space and End scroll the column at once; Space never closes; Shift+Tab reaches
//   Back, Tab goes on into the article (links included, in WebKit too); Esc closes. 9f25a82 focused Back, outside the
//   scroller, so the keys did nothing and Space pressed Back.
import { test, expect } from '@playwright/test';
import { DESK, PHONE, context, home, toFrame, untilState } from './lib.mjs';

const focused = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''}${a.matches('[data-open]') ? '[data-open]' : ''}${a.matches('[data-close]') ? '[data-close]' : ''}` : 'none';
});
const colTop = (page) => page.evaluate(() => document.querySelector('#proj [data-proj-col]').scrollTop);
const titled = (page, t) => page.waitForFunction((x) => document.querySelector('#proj-title')?.textContent.trim() === x, t, { timeout: 10000 });

for (const [label, profile] of [['1440', DESK], ['390', PHONE]]) {
  test.describe(`A2 keys at ${label}`, () => {
    test('Close returns focus to Open frame: after Enter on the EVF, a click or tap on Open frame, next, and browser Back', async ({ browser, browserName }) => {
      const ctx = await context(browser, browserName, profile);
      const page = await ctx.newPage();
      try {
        await home(page);
        await toFrame(page, 2);
        expect(await focused(page), 'the EVF itself holds focus after the raise: Enter opens from it').toBe('main#evf');

        // 1. Enter on the EVF, Esc
        await page.keyboard.press('Enter');
        await untilState(page, 'open', 2);
        await page.keyboard.press('Escape');
        await untilState(page, 'evf', 2);
        expect(await focused(page), 'Esc after an Enter open').toBe('button[data-open]');

        // 2. a click (a tap on the phone) on Open frame, then the Back button
        await page.evaluate(() => document.getElementById('evf').focus());
        if (profile.hasTouch) await page.locator('[data-open]').tap(); else await page.locator('[data-open]').click();
        await untilState(page, 'open', 2);
        await page.locator('[data-close]').click();
        await untilState(page, 'evf', 2);
        expect(await focused(page), 'Back after a click or tap open').toBe('button[data-open]');

        // 3. Enter on the EVF, next in place, Esc: the shown project's frame, focus on Open frame
        await page.evaluate(() => document.getElementById('evf').focus());
        await page.keyboard.press('Enter');
        await untilState(page, 'open', 2);
        await page.keyboard.press('ArrowRight');
        await titled(page, 'Project 04');
        await page.keyboard.press('Escape');
        await untilState(page, 'evf', 3);
        expect(await focused(page), 'Esc after next').toBe('button[data-open]');

        // 4. Enter on the EVF, browser Back
        await page.evaluate(() => document.getElementById('evf').focus());
        await page.keyboard.press('Enter');
        await untilState(page, 'open', 3);
        await page.goBack();
        await untilState(page, 'evf', 3);
        expect(await focused(page), 'browser Back').toBe('button[data-open]');
      } finally {
        await ctx.close();
      }
    });

    test('right after Open the keys scroll the column; Space never closes; Shift+Tab reaches Back, Tab the article; Esc closes', async ({ browser, browserName }) => {
      const ctx = await context(browser, browserName, profile);
      const page = await ctx.newPage();
      try {
        await home(page);
        await toFrame(page, 5);
        await page.keyboard.press('Enter');
        await untilState(page, 'open', 5);
        await titled(page, 'Project 06');
        expect(await page.evaluate(() => document.activeElement?.matches('#proj [data-proj-col]')), 'the column (tabindex -1, the scroller) holds focus').toBe(true);
        expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'no ring on the column').toBe('none');
        let last = await colTop(page);
        expect(last).toBe(0);
        for (const key of ['PageDown', 'ArrowDown', 'Space', 'End']) {
          await page.keyboard.press(key);
          await expect.poll(() => colTop(page), { message: `${key} scrolls the column`, timeout: 3000 }).toBeGreaterThan(last + 10);
          await page.waitForTimeout(400); // a smooth key scroll settles
          last = await colTop(page);
          expect(await page.evaluate(() => window.__vf.state()), `${key} leaves the project open`).toBe('open');
        }
        await expect.poll(() => page.evaluate(() => { const c = document.querySelector('#proj [data-proj-col]'); return c.scrollHeight - c.clientHeight - c.scrollTop; }), { message: 'End reaches the end', timeout: 3000 }).toBeLessThanOrEqual(2);

        // Tab order: from the title, Shift+Tab is Back; Tab from Back goes into the article (a link, in WebKit too)
        await page.evaluate(() => document.getElementById('proj-title').focus({ preventScroll: true }));
        await page.keyboard.press('Shift+Tab');
        expect(await focused(page), 'Shift+Tab from the title reaches Back').toBe('button[data-close]');
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => Boolean(document.activeElement.closest('[data-proj-col]')) && document.activeElement.matches('a[href]')), 'Tab from Back enters the article').toBe(true);
        // and wraps from the last stop to Back
        await page.evaluate(() => { const l = [...document.querySelectorAll('#proj [data-proj-col] a[href]')]; l[l.length - 1].focus(); });
        await page.keyboard.press('Tab');
        expect(await focused(page), 'Tab wraps to Back').toBe('button[data-close]');

        await page.keyboard.press('Escape');
        await untilState(page, 'evf', 5);
      } finally {
        await ctx.close();
      }
    });
  });
}

// wv1-resize-open-rect (queued from judge r2): a resize or rotate while a project is open never draws the frame's marks
// over the page, and with no WebGL the tint cover still fills the view; Close lands with the marks home.
test('A2 / A13 a resize or rotate while open: no marks over the page, the cover fills the view; Close lands home', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, DESK);
  const page = await ctx.newPage();
  const read = () => page.evaluate(() => {
    const f = document.querySelector('[data-frame]').getBoundingClientRect();
    return {
      frame: [f.left, f.top, f.width, f.height].map(Math.round),
      view: [innerWidth, innerHeight],
      marks: [...document.querySelectorAll('[data-frame] .mk')].map((m) => getComputedStyle(m).visibility),
      transforms: [...document.querySelectorAll('[data-frame] .mk')].map((m) => m.style.transform),
    };
  });
  try {
    await home(page);
    await toFrame(page, 1);
    await page.keyboard.press('Enter');
    await untilState(page, 'open', 1);
    for (const size of [{ width: 1200, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(300);
      const s = await read();
      expect(s.marks, `${size.width} x ${size.height}: the marks stay hidden while open`).toEqual(['hidden', 'hidden', 'hidden', 'hidden']);
      expect(s.frame, `${size.width} x ${size.height}: the flat cover fills the view`).toEqual([0, 0, size.width, size.height]);
    }
    await page.keyboard.press('Escape');
    await untilState(page, 'evf', 1);
    const s = await read();
    expect(s.marks, 'home: the marks show').toEqual(['visible', 'visible', 'visible', 'visible']);
    expect(s.transforms, 'home: no transform left on the marks').toEqual(['', '', '', '']);
    const box = await page.evaluate(() => ['--fx', '--fy', '--fw', '--fh'].map((k) => Math.round(parseFloat(document.documentElement.style.getPropertyValue(k)))));
    expect(s.frame, 'home: the frame sits in its box').toEqual(box);
  } finally {
    await ctx.close();
  }
});

// fix-pass B2
import { base as coldBase } from './lib.mjs';

// f11: on the cold page the document scrolls under a fixed 64 px bar. A print link reached by keyboard lands clear of the
// bar going back, and clear of the bottom edge going on, so its whole ring (4 px offset, 2 px outline, 8 px band) shows.
// WebKit's Tab skips links by default (view.ts), so there the link takes focus() with no preventScroll: the same scroll.
for (const [label, profile] of [['1440', DESK], ['390', PHONE]]) test(`A2 / budgets focus ring: a print reached by keyboard on the cold page clears the fixed bar at ${label}`, async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, profile);
  const page = await ctx.newPage();
  const step = async (key, to) => {
    if (browserName === 'chromium') await page.keyboard.press(key);
    else await page.evaluate((k) => document.querySelectorAll('.print__a')[k].focus(), to);
    // WebKit can land the focus scroll a frame later: read after two frames
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  };
  const link = (k) => page.evaluate((i) => {
    const a = [...document.querySelectorAll('.print__a')];
    const r = a[i].getBoundingClientRect();
    return { active: a.indexOf(document.activeElement), top: r.top, bottom: r.bottom, bar: document.querySelector('.pj-bar').getBoundingClientRect().bottom, vh: innerHeight };
  }, k);
  try {
    await page.goto(`${coldBase()}/work/project-01/?vf-test`, { waitUntil: 'load' });
    // back: the third link holds focus, print 2's top 100 px above the view; Shift+Tab
    await page.evaluate(() => {
      document.querySelectorAll('.print__a')[2].focus({ preventScroll: true });
      window.scrollBy(0, document.querySelectorAll('.print')[1].getBoundingClientRect().top + 100);
    });
    await step('Shift+Tab', 1);
    const b = await link(1);
    expect(b.active, 'Shift+Tab reached the second print').toBe(1);
    expect(b.top - 8, `the ring's top band (${(b.top - 8).toFixed(1)}) clears the bar (${b.bar})`).toBeGreaterThanOrEqual(b.bar - 0.5);
    // on: the second link holds focus, print 3's top 100 px above the bottom edge; Tab
    await page.evaluate(() => {
      document.querySelectorAll('.print__a')[1].focus({ preventScroll: true });
      window.scrollBy(0, document.querySelectorAll('.print')[2].getBoundingClientRect().top - (innerHeight - 100));
    });
    await step('Tab', 2);
    const f = await link(2);
    expect(f.active, 'Tab reached the third print').toBe(2);
    expect(f.bottom + 8, `the ring's bottom band (${(f.bottom + 8).toFixed(1)}) stays in the view (${f.vh})`).toBeLessThanOrEqual(f.vh + 0.5);
  } finally {
    await ctx.close();
  }
});
