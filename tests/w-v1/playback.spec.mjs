// W-V1 A10 and A13 on the flat path, Chromium and WebKit: playback (a native modal dialog, Flip to fit, readouts, paging,
// #print-NN pushed; Back, Esc and Close return focus to the print; a deep link opens it without the Flip), the calm path
// (reduced motion), no WebGL (the default here) and no JS on /work/project-01/.
import { test, expect } from '@playwright/test';
import { DESK, PHONE, base, centrePrint, context, home, toFrame, untilState } from './lib.mjs';

const cold = (page, slug, hash = '') => page.goto(`${base()}/work/${slug}/?vf-test${hash}`, { waitUntil: 'load' });
const pb = (page) => page.evaluate(() => {
  const d = document.querySelector('dialog.pb');
  return d && {
    open: d.open, modal: d.matches(':modal'), hash: location.hash,
    count: d.querySelector('.pb__count')?.textContent, ro: [...d.querySelectorAll('.pb__ro span')].map((s) => s.textContent),
    cap: d.querySelector('.pb__cap')?.textContent.trim(), media: d.querySelector('.pb__frame picture, .pb__frame video, .pb__frame .print__box')?.tagName,
    focus: document.activeElement?.closest('.print')?.id ?? document.activeElement?.className ?? '',
  };
});

for (const [label, profile] of [['1440', DESK], ['390', PHONE]]) {
  test(`A10 at ${label}: open with the readouts, page, Esc / Close / Back return focus to the print, #print-NN`, async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, profile);
    const page = await ctx.newPage();
    try {
      await cold(page, 'project-06');
      await centrePrint(page, 3);
      const len = await page.evaluate(() => history.length);
      if (profile.hasTouch) await page.locator('#print-03 [data-print-open]').tap(); else await page.locator('#print-03 [data-print-open]').click();
      await expect.poll(async () => (await pb(page))?.open).toBe(true);
      const s = await pb(page);
      expect(s.modal, 'showModal').toBe(true);
      expect(s.hash).toBe('#print-03');
      expect(await page.evaluate(() => history.length), 'pushes #print-NN').toBe(len + 1);
      expect(s.count).toBe('03 / 12');
      expect(s.ro).toEqual(['03', '1080 × 1080', 'image']);
      expect(s.cap).toBe('[PLACEHOLDER: caption]');
      expect(s.media).toBe('PICTURE');
      // the Flip lands in 0.6 s: the frame ends untransformed
      await page.waitForTimeout(700);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('.pb__frame')).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

      // arrows page; the address follows (replaceState)
      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await pb(page)).hash).toBe('#print-04');
      await expect.poll(async () => (await pb(page)).ro).toEqual(['04', '2560 × 1080', 'image']);
      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await pb(page)).ro[2]).toBe('loop clip');
      expect((await pb(page)).media).toBe('VIDEO');
      expect(await page.evaluate(() => document.querySelector('.pb__frame video').controls), 'controls in playback').toBe(true);
      expect(await page.evaluate(() => history.length), 'paging adds no entry').toBe(len + 1);

      // Esc: closed, the hash gone, focus on the print shown
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await pb(page)).open).toBe(false);
      await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
      expect((await pb(page)).focus, 'focus returns to the print').toBe('print-05');
      expect(await page.evaluate(() => window.__vf.state()), 'Esc closed playback only').toBe('open');

      // Close button
      await page.locator('#print-05 [data-print-open]').focus();
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await pb(page))?.open).toBe(true);
      await page.locator('dialog.pb [data-pb-close]').click();
      await expect.poll(async () => (await pb(page)).open).toBe(false);
      expect((await pb(page)).focus).toBe('print-05');

      // Back
      await page.locator('#print-05 [data-print-open]').click();
      await expect.poll(async () => (await pb(page)).hash).toBe('#print-05');
      await page.goBack();
      await expect.poll(async () => (await pb(page)).open).toBe(false);
      expect((await pb(page)).focus).toBe('print-05');
      expect(new URL(page.url()).pathname).toBe('/work/project-06/');
    } finally {
      await ctx.close();
    }
  });
}

test('A10: a deep link to #print-NN opens playback at once, without the Flip', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, DESK, { init: [`(() => { window.__fit = 0; const t = setInterval(() => { const f = document.querySelector('.pb__frame'); if (f && f.style.transform && !/scale\\(1\\)|none|^$/.test(f.style.transform) && /scale/.test(f.style.transform)) window.__fit++; }, 5); setTimeout(() => clearInterval(t), 3000); })();`] });
  const page = await ctx.newPage();
  try {
    await cold(page, 'project-06', '#print-07');
    await expect.poll(async () => (await pb(page))?.open).toBe(true);
    expect((await pb(page)).count).toBe('07 / 12');
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__fit), 'no Flip transform on a deep link').toBe(0);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
  } finally {
    await ctx.close();
  }
});

test('A10 in the Viewfinder: Esc in playback closes playback, not the project', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, DESK);
  const page = await ctx.newPage();
  try {
    await home(page);
    await toFrame(page, 0);
    await page.keyboard.press('Enter');
    await untilState(page, 'open', 0);
    await page.locator('#print-02 [data-print-open]').click();
    await expect.poll(async () => (await pb(page))?.hash).toBe('#print-02');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await pb(page)).open).toBe(false);
    expect(await page.evaluate(() => window.__vf.state())).toBe('open');
    expect(new URL(page.url()).pathname).toBe('/work/project-01/');
  } finally {
    await ctx.close();
  }
});

test.describe('A2 / A10 history over playback: one Esc per layer', () => {
  const lands = async (page) => {
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await pb(page)).open, { message: 'the first Esc closes playback' }).toBe(false);
    await expect.poll(() => page.evaluate(() => [window.__vf.state(), location.pathname, location.hash])).toEqual(['open', '/work/project-06/', '']);
    await page.keyboard.press('Escape');
    await untilState(page, 'evf', 5);
    await expect.poll(() => page.evaluate(() => `${location.pathname}${location.hash}`), { message: 'the second Esc lands on the frame' }).toBe('/#work-06');
    // and stays there: no stale entry reopens the project
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__vf.state())).toBe('evf');
  };

  test('Back then Forward over a playback entry, then Esc, Esc: the frame', async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    try {
      await home(page);
      await toFrame(page, 5);
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 5);
      await page.locator('#print-01 [data-print-open]').click();
      await expect.poll(async () => (await pb(page))?.hash).toBe('#print-01');
      await page.goBack();
      await expect.poll(async () => (await pb(page)).open).toBe(false);
      await page.goForward();
      await expect.poll(async () => (await pb(page)).open, { message: 'Forward reopens playback' }).toBe(true);
      await lands(page);
    } finally {
      await ctx.close();
    }
  });

  test('a traversal straight onto /work/<slug>/#print-NN from the frame, then Esc, Esc: the frame', async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    try {
      await home(page);
      await toFrame(page, 5);
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 5);
      await page.locator('#print-01 [data-print-open]').click();
      await expect.poll(async () => (await pb(page))?.hash).toBe('#print-01');
      await page.goBack();
      await expect.poll(async () => (await pb(page)).open).toBe(false);
      await page.goBack();
      await untilState(page, 'evf', 5);
      await page.evaluate(() => history.go(2));
      await untilState(page, 'open', 5);
      await expect.poll(async () => (await pb(page))?.open, { message: 'the traversal opens playback' }).toBe(true);
      await lands(page);
    } finally {
      await ctx.close();
    }
  });
});

test('J4 paging never blanks the stage: one print is always up', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, DESK);
  const page = await ctx.newPage();
  try {
    await cold(page, 'project-06');
    await centrePrint(page, 3);
    await page.locator('#print-03 [data-print-open]').click();
    await expect.poll(async () => (await pb(page))?.open).toBe(true);
    await page.waitForTimeout(700);
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowLeft']) {
      // every animation frame for 500 ms from the key: the most opaque frame or leaving copy on the stage
      const watch = page.evaluate(() => new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        const tick = () => {
          const els = [...document.querySelectorAll('dialog.pb .pb__stage > *')];
          out.push(Math.max(0, ...els.map((e) => (getComputedStyle(e).visibility === 'hidden' ? 0 : Number(getComputedStyle(e).opacity)))));
          if (performance.now() - t0 < 500) requestAnimationFrame(tick); else resolve(out);
        };
        requestAnimationFrame(tick);
      }));
      await page.keyboard.press(key);
      const frames = await watch;
      expect(frames.length, 'sampled').toBeGreaterThan(5);
      expect(frames.filter((o) => o < 0.05).length, `${key}: blank frames (max opacity on the stage per frame: ${frames.map((o) => o.toFixed(2)).join(' ')})`).toBe(0);
      expect(frames.at(-1), 'the page ends fully up').toBe(1);
      expect(await page.locator('dialog.pb .pb__ghost').count(), 'the leaving copy is gone').toBe(0);
    }
  } finally {
    await ctx.close();
  }
});

test.describe('A13 calm, no WebGL, no JS', () => {
  test('reduced motion: a crossfade open, opacity-only expose, brackets that jump, no dim spring, a playback crossfade', async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK, { reduced: true });
    const page = await ctx.newPage();
    try {
      await home(page);
      await toFrame(page, 5);
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 5);
      const cs = await page.evaluate(() => ({
        transition: getComputedStyle(document.querySelector('#proj .print')).transitionDuration,
        imgTransition: getComputedStyle(document.querySelector('#proj .print__img')).transitionDuration,
      }));
      expect(cs.transition.split(',').every((d) => parseFloat(d) === 0), 'no dim spring').toBe(true);
      expect(cs.imgTransition.split(',').every((d) => parseFloat(d) === 0)).toBe(true);
      // the first focus always jumps into place; the next change must too
      await centrePrint(page, 2);
      await page.waitForFunction(() => document.querySelector('#proj .roll')?.dataset.focus === '2', null, { timeout: 3000 });
      await page.waitForTimeout(300);
      await centrePrint(page, 3);
      await page.waitForFunction(() => document.querySelector('#proj .roll')?.dataset.focus === '3', null, { timeout: 3000 });
      const jump = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => {
        const a = document.querySelector('#proj .roll__af').getBoundingClientRect(), f = document.querySelector('#print-03').getBoundingClientRect();
        r(Math.abs(a.top - f.top) + Math.abs(a.width - f.width));
      })));
      expect(jump, 'the brackets jump').toBeLessThanOrEqual(2);
      const filters = await page.evaluate(() => [...document.querySelectorAll('#proj .print.is-exp .print__frame')].map((f) => getComputedStyle(f).filter));
      expect(filters.every((f) => f === 'none'), 'opacity-only expose').toBe(true);
      await page.locator('#print-03 [data-print-open]').click();
      await expect.poll(async () => (await pb(page))?.open).toBe(true);
      const tr = await page.evaluate(() => new Promise((r) => { const out = []; const f = document.querySelector('.pb__frame'); const t0 = performance.now(); const s = () => { out.push(getComputedStyle(f).transform); if (performance.now() - t0 < 300) setTimeout(s, 10); else r(out); }; s(); }));
      expect(tr.every((t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'), 'a crossfade, no Flip').toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test('no WebGL: the frame is the CSS tint cover; the prints and playback work', async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    try {
      await home(page);
      await toFrame(page, 0);
      expect(await page.evaluate(() => [document.documentElement.classList.contains('nogl'), getComputedStyle(document.querySelector('.frame__cover')).backgroundImage.startsWith('radial-gradient')])).toEqual([true, true]);
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 0);
      await page.locator('#print-01 [data-print-open]').click();
      await expect.poll(async () => (await pb(page))?.open).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  for (const [label, profile] of [['1440', DESK], ['390', PHONE]]) {
    test(`no JS: /work/project-01/ is whole at ${label}`, async ({ browser, browserName }) => {
      const ctx = await context(browser, browserName, profile, { js: false });
      const page = await ctx.newPage();
      try {
        await page.goto(`${base()}/work/project-01/`, { waitUntil: 'load' });
        await expect(page.locator('h1')).toHaveText('Project 01');
        const s = await page.evaluate(() => ({
          meta: [...document.querySelectorAll('.pj__meta dt')].map((d) => d.textContent),
          prints: [...document.querySelectorAll('.print')].map((p) => { const f = getComputedStyle(p.querySelector('.print__frame')); return [f.opacity, f.filter, p.querySelector('img')?.complete ?? false]; }),
          nav: [...document.querySelectorAll('.pj__nav a')].map((a) => a.getAttribute('href')),
          back: document.querySelector('[data-close]').getAttribute('href'),
          canvas: document.querySelectorAll('canvas').length,
        }));
        expect(s.meta).toEqual(['Role', 'Year', 'Tools', 'Link']);
        expect(s.prints.length).toBe(6);
        for (const [o, f] of s.prints) { expect(o).toBe('1'); expect(f).toBe('none'); }
        expect(s.nav).toEqual(['/work/project-08/', '/work/project-02/']);
        expect(s.back).toBe('/#work-01');
        expect(s.canvas).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      } finally {
        await ctx.close();
      }
    });
  }
});
