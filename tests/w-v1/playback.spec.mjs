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
      // the Flip lands (in 0.6 s: the gate's timing; a slow CI engine's long frame holds GSAP's clock): the frame ends
      // untransformed
      await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('.pb__frame')).transform), { message: 'the Flip lands untransformed', timeout: 3000 }).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);

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

// wv1-pb-arrows-focus (judge r3 must-fix; breakers 3.1 and 3.2): focus fell out of playback to BODY, where the arrows
// (a keydown on the dialog) did nothing and WebKit's Tab stayed put, in three ways: a cold #print-NN load (the load's
// fragment scroll clears focus about 5 ms after the open), a typed #print-NN hash, and Next or Prev reaching an end (the
// focused button is disabled). 4f2deb5 fails each row below. Focus is "in" when it sits on the dialog or inside it.
const where = (page) => page.evaluate(() => {
  const a = document.activeElement;
  const d = document.querySelector('dialog.pb');
  const name = !a ? 'none' : `${a.tagName}${['close', 'prev', 'next'].filter((k) => a.hasAttribute(`data-pb-${k}`)).map((k) => `[${k}]`).join('')}`;
  return `${d && a && d.contains(a) ? 'in' : 'out'}:${name}`;
});
/** n animation frames: a load's or a hash's fragment scroll has run by then. */
const frames = (page, n = 2) => page.evaluate((k) => new Promise((r) => { const f = () => (--k > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), n);
/** The key pages at once: the address follows within a second. */
async function pages(page, key, want) {
  await page.keyboard.press(key);
  await expect.poll(async () => (await pb(page)).hash, { message: `${key} pages at once`, timeout: 1000 }).toBe(want);
}
/** Tab and Shift+Tab, each past a wrap: focus never leaves playback. */
async function tabsStay(page) {
  for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    expect(await where(page), `${key}: focus stays in playback`).toMatch(/^in:/);
  }
}
const press = (page, profile, sel) => (profile.hasTouch ? page.locator(sel).tap() : page.locator(sel).click());

for (const [label, profile] of [['1440', DESK], ['390', PHONE]]) {
  test(`A10 at ${label}: a cold #print-NN load, then a typed #print-NN: focus stays in playback, the arrows page at once, Tab stays inside`, async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, profile);
    const page = await ctx.newPage();
    try {
      await cold(page, 'project-06', '#print-03');
      await expect.poll(async () => (await pb(page))?.open).toBe(true);
      await frames(page);
      await expect.poll(() => where(page), { message: 'after the load\'s fragment scroll, focus is in playback' }).toMatch(/^in:/);
      await pages(page, 'ArrowRight', '#print-04');
      await pages(page, 'ArrowLeft', '#print-03');
      await tabsStay(page);
      await pages(page, 'ArrowRight', '#print-04');
      // the arrows are read wherever focus sits: a key that lands on BODY pages too (focus never stays there now, so the
      // key is sent there by hand)
      await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })));
      await expect.poll(async () => (await pb(page)).hash, { message: 'a key on BODY pages', timeout: 1000 }).toBe('#print-05');
      // a focused clip keeps its own arrow keys (they seek): no paging from it; Esc still closes
      await expect.poll(async () => (await pb(page)).media).toBe('VIDEO');
      await page.locator('dialog.pb video').focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      expect((await pb(page)).hash, 'the clip keeps ArrowRight').toBe('#print-05');
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await pb(page)).open).toBe(false);
      await expect.poll(() => page.evaluate(() => location.hash)).toBe('');

      // a typed #print-NN on the cold page: the same fragment scroll
      await page.evaluate(() => { location.hash = '#print-07'; });
      await expect.poll(async () => (await pb(page))?.count).toBe('07 / 12');
      expect((await pb(page)).open).toBe(true);
      await frames(page);
      await expect.poll(() => where(page), { message: 'after a typed hash, focus is in playback' }).toMatch(/^in:/);
      await pages(page, 'ArrowRight', '#print-08');
      await tabsStay(page);
    } finally {
      await ctx.close();
    }
  });

  test(`A10 at ${label}: typed #print-NN hashes while the project is open in the Viewfinder: focus stays in playback, the arrows page at once, Tab stays inside`, async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, profile);
    const page = await ctx.newPage();
    try {
      await home(page);
      await toFrame(page, 5);
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 5);
      await page.evaluate(() => { location.hash = '#print-02'; });
      await expect.poll(async () => (await pb(page))?.open, { message: 'the typed hash opens playback' }).toBe(true);
      expect((await pb(page)).count).toBe('02 / 12');
      await frames(page);
      await expect.poll(() => where(page), { message: 'after a typed hash, focus is in playback' }).toMatch(/^in:/);
      await pages(page, 'ArrowRight', '#print-03');
      // a second typed hash while playback is up
      await page.evaluate(() => { location.hash = '#print-06'; });
      await expect.poll(async () => (await pb(page)).count).toBe('06 / 12');
      await frames(page);
      await expect.poll(() => where(page), { message: 'after a second typed hash, focus is in playback' }).toMatch(/^in:/);
      await pages(page, 'ArrowLeft', '#print-05');
      await pages(page, 'ArrowRight', '#print-06');
      await tabsStay(page);
    } finally {
      await ctx.close();
    }
  });

  test(`A10 at ${label}: Next or Prev to either end, by ${profile.hasTouch ? 'tap' : 'click'} and by Enter: focus stays in playback, the arrows page at once, Tab stays inside`, async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, profile);
    const page = await ctx.newPage();
    const openAt = async (n, by) => {
      const sel = `#print-${String(n).padStart(2, '0')} [data-print-open]`;
      await centrePrint(page, n);
      if (by === 'key') { await page.locator(sel).focus(); await page.keyboard.press('Enter'); } else await press(page, profile, sel);
      await expect.poll(async () => (await pb(page))?.hash).toBe(`#print-${String(n).padStart(2, '0')}`);
      expect((await pb(page)).open).toBe(true);
    };
    const shut = async () => {
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await pb(page)).open).toBe(false);
      await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
    };
    try {
      await cold(page, 'project-06');
      // by click or tap: Next to the end, then Prev to the start
      await openAt(11, 'pointer');
      await press(page, profile, 'dialog.pb [data-pb-next]');
      await expect.poll(async () => (await pb(page)).hash).toBe('#print-12');
      expect(await page.locator('dialog.pb [data-pb-next]').isDisabled(), 'Next is off at the end').toBe(true);
      expect(await where(page), 'Next to the end: focus is in playback').toMatch(/^in:/);
      await pages(page, 'ArrowLeft', '#print-11');
      await pages(page, 'ArrowRight', '#print-12');
      await tabsStay(page);
      await shut();
      await openAt(2, 'pointer');
      await press(page, profile, 'dialog.pb [data-pb-prev]');
      await expect.poll(async () => (await pb(page)).hash).toBe('#print-01');
      expect(await where(page), 'Prev to the start: focus is in playback').toMatch(/^in:/);
      await pages(page, 'ArrowRight', '#print-02');
      await shut();

      // by Enter on a focused Next or Prev: focus moves to the other one as its own is disabled
      await openAt(11, 'key');
      await page.locator('dialog.pb [data-pb-next]').focus();
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await pb(page)).hash).toBe('#print-12');
      expect(await where(page), 'Enter on Next to the end: focus on Prev').toBe('in:BUTTON[prev]');
      await pages(page, 'ArrowLeft', '#print-11');
      await pages(page, 'ArrowRight', '#print-12');
      await tabsStay(page);
      await shut();
      await openAt(2, 'key');
      await page.locator('dialog.pb [data-pb-prev]').focus();
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await pb(page)).hash).toBe('#print-01');
      expect(await where(page), 'Enter on Prev to the start: focus on Next').toBe('in:BUTTON[next]');
      await pages(page, 'ArrowRight', '#print-02');
      await tabsStay(page);
    } finally {
      await ctx.close();
    }
  });
}

// wv1-pb-failed-image (queued from judge r2): playback of a print whose image failed shows the same "image unavailable"
// print at its aspect, with no broken-image glyph and no raw alt text (9f25a82 cloned the failed <picture>).
test('A10 / A8 a failed image opens in playback as the same "image unavailable" print, at its aspect', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, DESK);
  const page = await ctx.newPage();
  await page.route(/\/media\//, (r) => r.abort());
  try {
    await cold(page, 'project-06');
    await centrePrint(page, 3);
    await expect(page.locator('#print-03')).toHaveClass(/is-failed/, { timeout: 5000 });
    await page.locator('#print-03 [data-print-open]').click();
    await expect.poll(async () => (await pb(page))?.open).toBe(true);
    await page.waitForTimeout(800);
    const s = await page.evaluate(() => {
      const f = document.querySelector('dialog.pb .pb__frame');
      const r = f.getBoundingClientRect();
      return {
        failed: f.hasAttribute('data-failed'), media: f.querySelectorAll('img, picture, video').length,
        label: getComputedStyle(f, '::after').content, ar: r.width / r.height, want: Number(document.querySelector('#print-03').dataset.ar),
      };
    });
    expect(s.failed, 'the playback frame is the failed print').toBe(true);
    expect(s.media, 'no image or clip element (no broken glyph, no alt text)').toBe(0);
    expect(s.label).toBe('"Image unavailable"');
    expect(Math.abs(s.ar - s.want), `at its aspect (${s.ar} vs ${s.want})`).toBeLessThan(0.02);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await pb(page))?.open).toBe(false);
  } finally {
    await ctx.close();
  }
});

// wv1-pb-esc-roll-follow (a gate note): paging in playback, then Esc, leaves the roll on the print just shown. 9f25a82's
// step back over playback's entry restored the scroll the page had at the open (print 06 centred, focus on 07 below).
test('A10 paging 06 to 07 in playback, then Esc: the roll is centred on print 07, with focus there', async ({ browser, browserName }) => {
  const ctx = await context(browser, browserName, DESK);
  const page = await ctx.newPage();
  const at7 = () => page.evaluate(() => { const r = document.querySelector('#print-07').getBoundingClientRect(); return Math.round(r.top + r.height / 2 - innerHeight / 2); });
  try {
    await cold(page, 'project-06');
    await centrePrint(page, 6);
    await page.waitForTimeout(300);
    await page.locator('#print-06 [data-print-open]').click();
    await expect.poll(async () => (await pb(page))?.hash).toBe('#print-06');
    await page.waitForTimeout(700);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await pb(page))?.hash).toBe('#print-07');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await pb(page))?.open).toBe(false);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('');
    await page.waitForTimeout(400);
    expect(Math.abs(await at7()), 'print 07 sits at the centre of the view').toBeLessThanOrEqual(24);
    expect(await page.evaluate(() => document.activeElement?.closest('.print')?.id), 'focus on print 07').toBe('print-07');
    expect(await page.evaluate(() => document.querySelector('.roll').dataset.focus), 'the roll\'s focus is 07').toBe('7');
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

  // wv1-pb-esc-swallow (queued from judge r2): a second Esc during playback's 0.33 s exit is never swallowed
  for (const gap of [40, 200]) {
    test(`Esc, Esc ${gap} ms apart: in the Viewfinder the frame (/#work-06), and a cold page leaves for it`, async ({ browser, browserName }) => {
      const ctx = await context(browser, browserName, DESK);
      const page = await ctx.newPage();
      try {
        await home(page);
        await toFrame(page, 5);
        await page.keyboard.press('Enter');
        await untilState(page, 'open', 5);
        await page.locator('#print-02 [data-print-open]').click();
        await expect.poll(async () => (await pb(page))?.hash).toBe('#print-02');
        await page.waitForTimeout(700);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(gap);
        await page.keyboard.press('Escape');
        await untilState(page, 'evf', 5);
        await expect.poll(() => page.evaluate(() => `${location.pathname}${location.hash}`), { message: 'in-app: the frame' }).toBe('/#work-06');
        await page.waitForTimeout(600);
        expect(await page.evaluate(() => window.__vf.state()), 'and it stays there: no stale entry reopens the project').toBe('evf');
        expect(await page.evaluate(() => document.querySelector('dialog.pb')?.open ?? false), 'playback is shut').toBe(false);

        await cold(page, 'project-06');
        await centrePrint(page, 2);
        await page.locator('#print-02 [data-print-open]').click();
        await expect.poll(async () => (await pb(page))?.hash).toBe('#print-02');
        await page.waitForTimeout(700);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(gap);
        await page.keyboard.press('Escape');
        await page.waitForURL(/\/\?vf-test#work-06$|\/#work-06$/, { timeout: 10000 });
        await page.waitForFunction(() => window.__vf && window.__vf.state() === 'evf', null, { timeout: 20000 });
      } finally {
        await ctx.close();
      }
    });
  }
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
      // every animation frame, and every 8 ms between them (a slow CI engine draws few frames), for 500 ms from the
      // key: the most opaque frame or leaving copy on the stage
      const watch = page.evaluate(() => new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        const read = () => {
          const els = [...document.querySelectorAll('dialog.pb .pb__stage > *')];
          out.push(Math.max(0, ...els.map((e) => (getComputedStyle(e).visibility === 'hidden' ? 0 : Number(getComputedStyle(e).opacity)))));
        };
        const frame = () => { read(); if (performance.now() - t0 < 500) requestAnimationFrame(frame); };
        const timer = setInterval(() => { read(); if (performance.now() - t0 >= 500) { clearInterval(timer); read(); resolve(out); } }, 8);
        requestAnimationFrame(frame);
      }));
      await page.keyboard.press(key);
      const frames = await watch;
      expect(frames.length, 'sampled').toBeGreaterThan(5);
      expect(frames.filter((o) => o < 0.05).length, `${key}: blank frames (max opacity on the stage per frame: ${frames.map((o) => o.toFixed(2)).join(' ')})`).toBe(0);
      // fully up once the page lands (polled: a slow CI engine can run the 0.3 s fade past the 500 ms window above)
      await expect.poll(() => page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('dialog.pb .pb__stage > *')].map((e) => (getComputedStyle(e).visibility === 'hidden' ? 0 : Number(getComputedStyle(e).opacity))))), { message: 'the page ends fully up', timeout: 3000 }).toBe(1);
      expect(await page.locator('dialog.pb .pb__ghost').count(), 'the leaving copy is gone').toBe(0);
    }
    // rapid paging (each page cut short by the next), Esc, a reopen, Back / Forward / Back, Forward: playback is fully
    // up each time (a start state left behind by a cut-short tween once held the frame and the ground at opacity 0)
    for (let round = 0; round < 3; round++) {
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await pb(page)).open).toBe(false);
      await page.locator('#print-02 [data-print-open]').click();
      await page.waitForTimeout(700);
      for (let i = 0; i < 6; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(30 + 10 * round); }
      await page.waitForTimeout(700);
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await pb(page)).open).toBe(false);
      await page.waitForTimeout(500);
      await page.locator('#print-07 [data-print-open]').click();
      await page.waitForTimeout(400);
      await page.goBack();
      await page.goForward();
      await page.goBack();
      await expect.poll(async () => (await pb(page)).open).toBe(false);
      await page.waitForTimeout(500);
      await page.goForward();
      await page.waitForTimeout(900);
      const up = await page.evaluate(() => ['.pb__frame', '.pb__bg', '.pb__bar'].map((s) => getComputedStyle(document.querySelector(`dialog.pb ${s}`)).opacity));
      expect(up, `round ${round + 1}: after rapid paging and a reopen, the frame, the ground and the bar are up`).toEqual(['1', '1', '1']);
      expect(await page.evaluate(() => document.querySelectorAll('.print__frame[style*="visibility: hidden"]').length), 'only the print in playback is hidden in the roll').toBeLessThanOrEqual(1);
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

// fix-pass B4
test.describe('A2 / A10 history over playback: traversals that cross the open', () => {
  const where6 = (page) => page.evaluate(() => [window.__vf.state(), location.pathname, location.hash]);
  /** Esc closes playback onto /work/project-06/; a second Esc lands on frame 6 at /#work-06, and it stays there. */
  const lands6 = async (page) => {
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await pb(page)).open, { message: 'the first Esc closes playback' }).toBe(false);
    await expect.poll(() => where6(page)).toEqual(['open', '/work/project-06/', '']);
    await page.keyboard.press('Escape');
    await untilState(page, 'evf', 5);
    await expect.poll(() => page.evaluate(() => `${location.pathname}${location.hash}`), { message: 'the second Esc lands on the frame' }).toBe('/#work-06');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__vf.state()), 'and stays there: no stale entry reopens a project').toBe('evf');
  };

  // f07: Next's replaceState leaves 06's #print-01 entry forward of 07's; Forward onto it swaps in app, never reloads
  test(`Forward onto another project's #print entry after Next: no reload; Esc, Esc: that frame`, async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    try {
      await home(page);
      await toFrame(page, 5);
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 5);
      await page.locator('#print-01 [data-print-open]').click();
      await expect.poll(async () => (await pb(page))?.hash).toBe('#print-01');
      await page.waitForTimeout(700);
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => [document.querySelector('dialog.pb')?.open, location.hash])).toEqual([false, '']);
      await page.locator('#proj .pj__nav a[rel="next"]').click();
      await page.waitForFunction(() => document.querySelector('#proj-title')?.textContent.trim() === 'Project 07', null, { timeout: 10000 });
      await page.evaluate(() => { window.__live = 1; });
      await page.goForward();
      // a reload would destroy the context mid-poll: read through it, and let __live tell
      await expect.poll(() => page.evaluate(() => window.__vf && [window.__vf.state(), window.__vf.pos(), location.pathname, location.hash]).catch(() => null)).toEqual(['open', 5, '/work/project-06/', '#print-01']);
      expect(await page.evaluate(() => window.__live ?? null), 'the same document: no reload').toBe(1);
      await expect.poll(async () => (await pb(page))?.open, { message: 'playback follows the entry' }).toBe(true);
      await lands6(page);
    } finally {
      await ctx.close();
    }
  });

  /** Frame 6 in the EVF with project 06's /work/ and #print-01 entries forward of it. */
  const forwardOf6 = async (page) => {
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
  };

  // f05 (a): the second Forward lands inside the 0.4 s open (onPop has started it before this listener runs)
  test('two Forwards inside the open: playback follows #print-01, then Esc, Esc: the frame', async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    try {
      await forwardOf6(page);
      const at = await page.evaluate(() => new Promise((r) => {
        addEventListener('popstate', () => setTimeout(() => { const s = window.__vf.state(); history.forward(); r(s); }, 30), { once: true });
        history.forward();
      }));
      expect(at, 'the second Forward is sent while the project opens').toBe('opening');
      await expect.poll(async () => [await page.evaluate(() => window.__vf.state()), (await pb(page))?.open, await page.evaluate(() => location.hash)], { message: 'playback follows #print-01' }).toEqual(['open', true, '#print-01']);
      await lands6(page);
    } finally {
      await ctx.close();
    }
  });

  // f05 (b): Esc mid-zoom on a #print entry steps back over both entries, so no stale project entry is left behind
  test('Esc mid-zoom after history.go(2) onto #print-NN: the frame, and the next project\'s close does not reopen it', async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    try {
      await forwardOf6(page);
      const at = await page.evaluate(() => new Promise((r) => {
        addEventListener('popstate', () => setTimeout(() => { const s = window.__vf.state(); dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); r(s); }, 50), { once: true });
        history.go(2);
      }));
      expect(at, 'Esc is sent while the project opens').toBe('opening');
      await expect.poll(() => page.evaluate(() => [window.__vf.state(), `${location.pathname}${location.hash}`]), { message: 'Esc mid-zoom lands on the frame' }).toEqual(['evf', '/#work-06']);
      for (let i = 4; i >= 1; i--) {
        await page.keyboard.press('ArrowLeft');
        await untilState(page, 'evf', i);
      }
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 1);
      await page.keyboard.press('Escape');
      await expect.poll(() => page.evaluate(() => [window.__vf.state(), window.__vf.pos()]), { message: 'the close lands on frame 2' }).toEqual(['evf', 1]);
      await expect.poll(() => page.evaluate(() => `${location.pathname}${location.hash}`)).toBe('/#work-02');
      await page.waitForTimeout(400);
      expect(await page.evaluate(() => [window.__vf.state(), window.__vf.pos()]), 'project 06 never reopens').toEqual(['evf', 1]);
    } finally {
      await ctx.close();
    }
  });
});
