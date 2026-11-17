// W-V1 A2 (non-timing) and A12, on the flat path, Chromium and WebKit, at 1440 x 900 and 390 x 844: the open project as a
// page (D-041). Open pushes /work/<slug>/, sets the title and adopts the page's article (h1 to h2, unique ids, no
// innerHTML); the prefetch waits for a frame to be current 300 ms; Close (Esc, Back button, browser Back) returns to
// the frame with focus on the opener; Forward reopens; previous and next swap in place with replaceState; a failed page
// falls back to location.assign; a cold /work/<slug>/ boots in 'open' with no intro and closes to /#work-NN; /#work-NN and
// /#contact land with no intro. The gate times the 1.2 s, 0.8 s and 1.5 s.
import { test, expect } from '@playwright/test';
import { DESK, PHONE, base, centrePrint, consoleGate, context, flatPathVerdict, home, scrollTo, toFrame, untilState, vf } from './lib.mjs';

/** Records innerHTML, outerHTML and insertAdjacentHTML writes into #proj or a dialog (D-055: content never enters that way). */
const NO_INNERHTML = `(() => {
  const log = [];
  Object.defineProperty(window, '__htmlWrites', { value: log });
  for (const k of ['innerHTML', 'outerHTML']) {
    const d = Object.getOwnPropertyDescriptor(Element.prototype, k);
    Object.defineProperty(Element.prototype, k, { configurable: true, get: d.get, set(v) { if (this.closest && this.closest('#proj, dialog')) log.push(k + ' ' + (this.id || this.className || this.tagName)); return d.set.call(this, v); } });
  }
  const ins = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (...a) { if (this.closest && this.closest('#proj, dialog')) log.push('insertAdjacentHTML'); return ins.apply(this, a); };
})();`;

const dupIds = (page) => page.evaluate(() => {
  const seen = new Map();
  for (const e of document.querySelectorAll('[id]')) seen.set(e.id, (seen.get(e.id) || 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
});

for (const [label, profile] of [['1440', DESK], ['390', PHONE]]) {
  test.describe(`A2 at ${label}`, () => {
    test('open from frame 3: prefetch after 300 ms, push, title, adopt; Esc closes to frame 3 with focus on the opener', async ({ browser, browserName }) => {
      const ctx = await context(browser, browserName, profile, { init: [NO_INNERHTML] });
      const page = await ctx.newPage();
      const gate = consoleGate(page);
      const work = [];
      page.on('request', (r) => { if (/\/work\//.test(new URL(r.url()).pathname)) work.push({ path: new URL(r.url()).pathname, t: Date.now() }); });
      try {
        await home(page);
        await toFrame(page, 2);
        // frames that change faster than 300 ms never fetch
        await page.keyboard.press('ArrowRight');
        await untilState(page, 'evf', 3);
        await page.keyboard.press('ArrowLeft');
        await untilState(page, 'evf', 2);
        const fast = work.length;
        await page.waitForTimeout(150);
        expect(work.length, 'no /work/ request while frames change faster than 300 ms').toBe(fast);
        await page.waitForRequest((r) => new URL(r.url()).pathname === '/work/project-03/', { timeout: 3000 });
        expect(work.filter((w) => w.path === '/work/project-04/'), 'frame 4 was current under 300 ms: never fetched').toEqual([]);
        expect(page.url(), 'frames replaceState /#work-NN').toMatch(/\/\?vf-test#work-03$/);
        const histBefore = await page.evaluate(() => { history.replaceState({ ...(history.state || {}), wv1: 'home' }, ''); return history.length; });

        const opener = await page.evaluate(() => { document.querySelector('[data-open]').focus(); return document.activeElement.matches('[data-open]'); });
        expect(opener).toBe(true);
        await page.keyboard.press('Enter');
        await untilState(page, 'open', 2);
        expect(new URL(page.url()).pathname).toBe('/work/project-03/');
        expect(await page.evaluate(() => history.length), 'Open pushes one entry').toBe(histBefore + 1);
        expect(await page.title()).toBe('Project 03 · derprito64bit');
        const adopted = await page.evaluate(() => {
          const col = document.querySelector('#proj [data-proj-col]');
          return {
            h1: col.querySelectorAll('h1').length,
            h2: col.querySelector('h2#proj-title')?.textContent.trim(),
            labelled: document.getElementById(document.querySelector('#proj').getAttribute('aria-labelledby'))?.textContent.trim(),
            head: Boolean(col.querySelector('.pj__head .pj__meta')),
            prints: col.querySelectorAll('.roll .print').length,
            honours: col.querySelector('#honours')?.children.length,
            nav: [...col.querySelectorAll('.pj__nav a')].map((a) => new URL(a.href).pathname),
          };
        });
        expect(adopted).toEqual({ h1: 0, h2: 'Project 03', labelled: 'Project 03', head: true, prints: 2, honours: 0, nav: ['/work/project-02/', '/work/project-04/'] });
        expect(await dupIds(page), 'no duplicate ids after the adoption').toEqual([]);
        expect(await page.evaluate(() => window.__htmlWrites), 'no innerHTML into the open view (D-055)').toEqual([]);

        await page.keyboard.press('Escape');
        await untilState(page, 'evf', 2);
        await expect.poll(() => page.url(), { message: 'Close is history.back() to the frame' }).toMatch(/\/\?vf-test#work-03$/);
        expect(await page.evaluate(() => [history.state?.wv1, history.length]), 'back on the home entry itself, not a replaced one').toEqual(['home', histBefore + 1]);
        expect(await page.title()).toBe('derprito64bit · Personal portfolio');
        expect(await page.evaluate(() => document.activeElement?.matches('[data-open]')), 'focus on the opener (#78)').toBe(true);
        await expect(page.locator('#proj')).toBeHidden();
        const v = flatPathVerdict(gate.verdict());
        expect(v.failures.map((f) => f.text.slice(0, 160)), '0 console errors').toEqual([]);
      } finally {
        await ctx.close();
      }
    });

    test('the Back button and browser Back close; Forward reopens; Back with playback open closes playback first', async ({ browser, browserName }) => {
      const ctx = await context(browser, browserName, profile);
      const page = await ctx.newPage();
      try {
        await home(page);
        await toFrame(page, 1);
        await page.keyboard.press('Enter');
        await untilState(page, 'open', 1);
        await page.locator('#proj [data-close]').click();
        await untilState(page, 'evf', 1);
        expect(new URL(page.url()).pathname).toBe('/');

        await page.goForward();
        await untilState(page, 'open', 1);
        expect(new URL(page.url()).pathname, 'Forward after close reopens the project').toBe('/work/project-02/');
        await page.goBack();
        await untilState(page, 'evf', 1);

        // a frame with a print: open, playback, then Back twice
        await page.keyboard.press('ArrowRight');
        await untilState(page, 'evf', 2);
        await page.keyboard.press('Enter');
        await untilState(page, 'open', 2);
        await page.locator('#print-01 [data-print-open]').click();
        await expect(page.locator('dialog.pb')).toHaveAttribute('open', '');
        expect(new URL(page.url()).hash).toBe('#print-01');
        await page.goBack();
        await expect(page.locator('dialog.pb')).not.toHaveAttribute('open', '');
        expect(await vf(page), 'Back closes the top layer only').toEqual({ state: 'open', pos: 2 });
        await page.goBack();
        await untilState(page, 'evf', 2);
      } finally {
        await ctx.close();
      }
    });

    test('previous and next swap in place (replaceState); Close lands on the shown project', async ({ browser, browserName }) => {
      const ctx = await context(browser, browserName, profile);
      const page = await ctx.newPage();
      try {
        await home(page);
        await toFrame(page, 2);
        await page.keyboard.press('Enter');
        await untilState(page, 'open', 2);
        const len = await page.evaluate(() => history.length);
        await page.locator('#proj .pj__nav a[rel="next"]').click();
        await page.waitForFunction(() => document.querySelector('#proj-title')?.textContent.trim() === 'Project 04', null, { timeout: 10000 });
        expect(await vf(page)).toEqual({ state: 'open', pos: 3 });
        expect(new URL(page.url()).pathname).toBe('/work/project-04/');
        expect(await page.evaluate(() => history.length), 'replaceState: no new entry').toBe(len);
        expect(await page.title()).toBe('Project 04 · derprito64bit');
        expect(await page.locator('#proj .print').count()).toBe(4);
        await page.locator('#proj .pj__nav a[rel="prev"]').click();
        await page.waitForFunction(() => document.querySelector('#proj-title')?.textContent.trim() === 'Project 03', null, { timeout: 10000 });
        await page.locator('#proj .pj__nav a[rel="prev"]').click();
        await page.waitForFunction(() => document.querySelector('#proj-title')?.textContent.trim() === 'Project 02', null, { timeout: 10000 });
        expect(await dupIds(page)).toEqual([]);
        await page.keyboard.press('Escape');
        await untilState(page, 'evf', 1);
        expect(page.url()).toMatch(/#work-02$/);
      } finally {
        await ctx.close();
      }
    });

    test('a page that fails to load falls back to location.assign', async ({ browser, browserName }) => {
      const ctx = await context(browser, browserName, profile);
      const page = await ctx.newPage();
      let fails = 1;
      await page.route('**/work/project-02/', (r) => (fails-- > 0 ? r.fulfill({ status: 500, body: 'down' }) : r.continue()));
      try {
        await home(page);
        await toFrame(page, 1);
        await page.keyboard.press('Enter');
        await page.waitForURL(/\/work\/project-02\/\?vf-test$/, { timeout: 10000 });
        await page.waitForFunction(() => window.__vf && window.__vf.state() === 'open', null, { timeout: 10000 });
        expect(await page.locator('#evf').count(), 'the page itself, not the Viewfinder').toBe(0);
      } finally {
        await ctx.close();
      }
    });

    test('cold /work/project-06/: the article at once, state open, no intro; Close lands on /#work-06 with no intro', async ({ browser, browserName }) => {
      const ctx = await context(browser, browserName, profile);
      const page = await ctx.newPage();
      const gate = consoleGate(page);
      try {
        await page.goto(`${base()}/work/project-06/?vf-test`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('h1')).toHaveText('Project 06');
        await untilState(page, 'open', 5);
        expect(await page.locator('#intro, #evf, .intro').count(), 'no EVF markup on the page').toBe(0);
        await page.locator('[data-close]').click();
        await page.waitForURL(/\/\?vf-test#work-06$/);
        await untilState(page, 'evf', 5);
        expect(await page.evaluate(() => document.getElementById('intro').hidden), 'no intro').toBe(true);
        const v = flatPathVerdict(gate.verdict());
        expect(v.failures.map((f) => f.text.slice(0, 160))).toEqual([]);
      } finally {
        await ctx.close();
      }
    });

    test('/#work-04 and /#contact land on their frame with no intro', async ({ browser, browserName }) => {
      const ctx = await context(browser, browserName, profile);
      const page = await ctx.newPage();
      try {
        await page.goto(`${base()}/?vf-test#work-04`, { waitUntil: 'load' });
        await untilState(page, 'evf', 3);
        expect(await page.evaluate(() => document.getElementById('intro').hidden)).toBe(true);
        await page.goto(`${base()}/?vf-test#contact`, { waitUntil: 'load' });
        await page.reload({ waitUntil: 'load' }); // a fragment change alone keeps the document
        await page.waitForFunction(() => window.__vf && window.__vf.state() === 'evf', null, { timeout: 20000, polling: 50 });
        await expect(page.locator('[data-screen="info"]')).toBeVisible();
      } finally {
        await ctx.close();
      }
    });
  });
}

/** The flat frame's tint cover (no WebGL): the gradient's first colour stop, as computed. */
const cover = (page) => page.evaluate(() => /rgb\([^)]*\)/.exec(getComputedStyle(document.querySelector('.frame__cover')).backgroundImage)?.[0] ?? 'none');
/** The HUD print counter: its text when shown, null when hidden. */
const counter = (page) => page.evaluate(() => { const c = document.querySelector('#proj [data-print-count]'); return c && !c.hidden && getComputedStyle(c).display !== 'none' ? c.textContent : null; });
const titled = (page, t) => page.waitForFunction((x) => document.querySelector('#proj-title')?.textContent.trim() === x, t, { timeout: 10000 });

test('A2 / A13 no WebGL: the tint cover follows previous and next; Esc and Back land on that frame with its own cover', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, DESK);
  const page = await ctx.newPage();
  try {
    await home(page);
    await toFrame(page, 3);
    const four = await cover(page);
    await page.keyboard.press('ArrowLeft');
    await untilState(page, 'evf', 2);
    const three = await cover(page);
    expect(four, 'frames 3 and 4 have their own covers').not.toBe(three);
    for (const how of ['Escape', 'Back']) {
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 2);
      await page.locator('#proj .pj__nav a[rel="next"]').click();
      await titled(page, 'Project 04');
      expect(await cover(page), `the cover behind the open view follows Next (${how})`).toBe(four);
      if (how === 'Escape') await page.keyboard.press('Escape'); else await page.goBack();
      await untilState(page, 'evf', 3);
      expect(await cover(page), `${how} lands on frame 4 with frame 4's cover`).toBe(four);
      await page.keyboard.press('ArrowLeft');
      await untilState(page, 'evf', 2);
      expect(await cover(page)).toBe(three);
    }
  } finally {
    await ctx.close();
  }
});

test('A9 the HUD counter never shows another project\'s count: after next, and after Close then Open', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, DESK);
  const page = await ctx.newPage();
  try {
    await home(page);
    await toFrame(page, 5);
    await page.keyboard.press('Enter');
    await untilState(page, 'open', 5);
    expect([null, ''], 'nothing (or empty) until a print takes focus').toContain(await counter(page));
    await centrePrint(page, 8);
    await expect.poll(() => counter(page)).toBe('08 / 12');
    // next, in place: project 07 has 3 prints
    await page.locator('#proj .pj__nav a[rel="next"]').click();
    await titled(page, 'Project 07');
    const after = await counter(page);
    expect(after === null || / \/ 03$/.test(after), `after Next the counter is hidden or reads 07's roll (${after})`).toBe(true);
    await centrePrint(page, 2);
    await expect.poll(() => counter(page)).toBe('02 / 03');
    // Close, then Open another project: never the last roll's count
    await page.keyboard.press('Escape');
    await untilState(page, 'evf', 6);
    await page.keyboard.press('ArrowLeft');
    await untilState(page, 'evf', 5);
    await page.keyboard.press('Enter');
    await untilState(page, 'open', 5);
    const reopened = await counter(page);
    expect(reopened === null || / \/ 12$/.test(reopened), `after a reopen the counter is hidden or reads 06's roll (${reopened})`).toBe(true);
  } finally {
    await ctx.close();
  }
});

test('A12 phone: Back closes on the first tap after scrolling; targets 44 px; swipes inside never move the frame', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, PHONE);
  const page = await ctx.newPage();
  try {
    await home(page);
    await toFrame(page, 5);
    await page.keyboard.press('Enter');
    await untilState(page, 'open', 5);
    const small = await page.evaluate(() => [...document.querySelectorAll('#proj button, #proj a[href]')]
      .filter((e) => e.offsetParent !== null)
      .map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((r) => r.w < 44 || r.h < 44));
    expect(small, 'every target in the open view is 44 px or more').toEqual([]);
    // a swipe inside the open view scrolls it and never changes the frame
    const box = await page.locator('#proj .proj__col').boundingBox();
    for (let i = 0; i < 3; i++) {
      await page.touchscreen.tap(box.x + 20, box.y + 300).catch(() => {});
      await page.evaluate(() => {
        const c = document.querySelector('#proj .proj__col');
        const t = (type, y) => c.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: c, clientX: 200, clientY: y })], changedTouches: [new Touch({ identifier: 1, target: c, clientX: 200, clientY: y })] }));
        t('touchstart', 600); t('touchmove', 400); t('touchmove', 200); t('touchend', 200);
      }).catch(() => {});
    }
    await scrollTo(page, 2400);
    expect((await vf(page)).pos, 'swipes inside the open view never page the frames').toBe(5);
    await page.locator('#proj [data-close]').tap();
    await page.waitForFunction(() => ['closing', 'evf'].includes(window.__vf.state()), null, { timeout: 2000, polling: 20 });
    await untilState(page, 'evf', 5);
  } finally {
    await ctx.close();
  }
});

// fix-pass B2
/** The meta cells (Role, Year, Tools, Link) under `root`: each dd's rect and its placeholder chips', fonts settled. */
const metaCells = (page, root) => page.evaluate(async (r) => {
  await document.fonts.ready;
  return {
    font: document.fonts.check('13px "Chivo Mono Variable"'),
    cells: [...document.querySelectorAll(`${r} .pj__meta > div`)].map((d) => {
      const c = d.querySelector('dd').getBoundingClientRect();
      return { dt: d.querySelector('dt').textContent, l: c.left, r: c.right,
        ph: [...d.querySelectorAll('dd .ph')].map((p) => { const b = p.getBoundingClientRect(); return { l: b.left, r: b.right, h: b.height }; }) };
    }),
  };
}, root);
const metaHold = (m, where) => {
  expect(m.font, `${where}: Chivo Mono has swapped in (the fallback is narrower)`).toBe(true);
  expect(m.cells.length).toBe(4);
  for (const c of m.cells) {
    expect(c.ph.length, `${where} ${c.dt}: a placeholder chip`).toBeGreaterThan(0);
    for (const p of c.ph) {
      expect(p.l, `${where} ${c.dt}: the chip starts inside its cell`).toBeGreaterThanOrEqual(c.l - 0.5);
      expect(p.r, `${where} ${c.dt}: the chip ends inside its cell (${p.r.toFixed(1)} against ${c.r.toFixed(1)})`).toBeLessThanOrEqual(c.r + 0.5);
      expect(p.h, `${where} ${c.dt}: two lines at most, never a word broken mid-letter`).toBeLessThanOrEqual(39);
    }
  }
  // the rows are Role | Year and Tools | Link: the two cells of a row never intersect
  for (const [a, b] of [[0, 1], [2, 3]]) expect(m.cells[a].r, `${where}: ${m.cells[a].dt} and ${m.cells[b].dt} side by side`).toBeLessThanOrEqual(m.cells[b].l + 0.5);
};

for (const w of [760, 768, 900, 1000, 1040]) test(`A1 meta cells hold their placeholders at ${w} x 1024: no chip spills into the next cell (cold and in-app)`, async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, { ...DESK, viewport: { width: w, height: 1024 } });
  const page = await ctx.newPage();
  try {
    await page.goto(`${base()}/work/project-01/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveText('Project 01');
    metaHold(await metaCells(page, '.pj-page'), `cold ${w}`);
    await home(page);
    await toFrame(page, 0);
    await page.keyboard.press('Enter');
    await untilState(page, 'open', 0);
    await page.waitForSelector('#proj .pj__meta');
    metaHold(await metaCells(page, '#proj'), `in-app ${w}`);
  } finally {
    await ctx.close();
  }
});

for (const [label, profile] of [['1440', DESK], ['390', PHONE]]) test(`A1 the title line under the h1 holds real text: wrapped lines stack, the placeholder chip keeps its 21 px line at ${label}`, async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, profile);
  const page = await ctx.newPage();
  try {
    await page.goto(`${base()}/work/project-01/?vf-test`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pj__ph');
    const s = await page.evaluate(() => {
      const p = document.querySelector('.pj__ph');
      const h0 = p.getBoundingClientRect().height;
      // a real title in place of the chip (textContent, never innerHTML: D-055), long enough to wrap at 536 and 358 px
      p.textContent = 'A much longer real project title that has to wrap onto a second line on a phone and across the desktop column too';
      const range = document.createRange();
      range.selectNodeContents(p.firstChild);
      const rects = [...range.getClientRects()].map((r) => ({ top: r.top, bottom: r.bottom }));
      return { h0, rects, lh: parseFloat(getComputedStyle(p).lineHeight) || 0, h: p.getBoundingClientRect().height, meta: document.querySelector('.pj__meta').getBoundingClientRect().top };
    });
    expect(Math.abs(s.h0 - 21), `the placeholder chip's line stays 21 px (${s.h0})`).toBeLessThanOrEqual(1);
    expect(s.rects.length, 'the title wraps (one rect per line)').toBeGreaterThanOrEqual(2);
    expect(s.lh, 'the title line has a line height').toBeGreaterThan(0);
    expect(s.h, `the title has its own height (${s.h} for ${s.rects.length} lines)`).toBeGreaterThanOrEqual(s.rects.length * 16);
    for (let i = 1; i < s.rects.length; i++) expect(s.rects[i].top - s.rects[i - 1].top, `line ${i + 1} sits below line ${i}, not over it`).toBeGreaterThanOrEqual(16);
    expect(s.meta, 'the meta rule stays below the title').toBeGreaterThanOrEqual(s.rects.at(-1).bottom);
  } finally {
    await ctx.close();
  }
});
