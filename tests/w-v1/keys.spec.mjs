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
        expect(await focused(page), 'the title (tabindex -1) inside the column holds focus').toBe('h2#proj-title');
        expect(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'no ring on the title').toBe('none');
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
