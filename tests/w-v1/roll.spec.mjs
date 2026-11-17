// W-V1 A5, A7, A8, A9 and A11 on the flat path (WebGL off), DOM only, Chromium and WebKit: the print look, the layout at
// 1440 x 900 and 390 x 844 (widths within 2 px of the size rule), overflow from 320 px, CLS over the open path, the
// expose, the focus (brackets, dim, the HUD counter, cached rects) and the loop clips (play and pause stubbed: the calls
// are asserted, nothing really plays).
import { expect } from '@playwright/test';
import { DESK, PHONE, base, centrePrint, context, home, ownBrowser as test, prints, scrollTo, toFrame, untilState } from './lib.mjs';

const cold = (page, slug, hash = '') => page.goto(`${base()}/work/${slug}/?vf-test${hash}`, { waitUntil: 'load' });
const AR_MIN = 9 / 21, AR_MAX = 21 / 9;
const clampAr = (r) => Math.min(AR_MAX, Math.max(AR_MIN, r));

test.describe('A5 the print look', () => {
  for (const [label, profile] of [['1440', DESK], ['390', PHONE]]) {
    test(`own aspect (9:21 to 21:9, letterboxed), the strip, the type, no mat or rotation, at ${label}`, async ({ own: browser, browserName }) => {
      const ctx = await context(browser, browserName, profile);
      const page = await ctx.newPage();
      try {
        for (const slug of ['project-01', 'project-05', 'project-06']) {
          await cold(page, slug);
          await scrollTo(page, 100000);
          await page.waitForTimeout(1200); // every print exposed
          const ps = await prints(page);
          expect(ps.length).toBeGreaterThan(0);
          for (const p of ps) {
            const want = clampAr(p.w / p.h);
            expect(Math.abs(p.frame.w / p.frame.h - want), `${slug} #${p.n}: frame aspect ${p.frame.w / p.frame.h} vs ${want}`).toBeLessThan(0.012);
            expect(p.letterbox, `${slug} #${p.n}: letterboxed only past the limits`).toBe(p.w / p.h > AR_MAX || p.w / p.h < AR_MIN);
            expect(p.strip.h, `${slug} #${p.n}: strip >= 28 px`).toBeGreaterThanOrEqual(28);
            expect(Math.abs(p.strip.top - (p.frame.y + p.frame.h)), `${slug} #${p.n}: the strip sits under the image`).toBeLessThan(1.5);
          }
          const look = await page.evaluate(() => [...document.querySelectorAll('.print')].map((p) => {
            const f = p.querySelector('.print__frame'), n = p.querySelector('.print__n'), c = p.querySelector('.print__cap'), s = p.querySelector('.print__strip'), img = p.querySelector('.print__img');
            const cs = (e) => getComputedStyle(e);
            const bg = cs(s).backgroundColor.match(/\d+/g).map(Number);
            return {
              nFont: cs(n).fontFamily, nSize: cs(n).fontSize, cFont: cs(c).fontFamily, cSize: cs(c).fontSize,
              truncated: c.scrollWidth > c.clientWidth + 1 || [...c.querySelectorAll('*'), c].some((e) => cs(e).textOverflow === 'ellipsis'),
              transform: [cs(p).transform, cs(f).transform], rotate: [cs(p).rotate, cs(f).rotate],
              mat: [cs(f).borderTopWidth, cs(f).paddingTop, cs(p).paddingTop, cs(p).borderTopWidth],
              stripDark: Math.max(...bg.slice(0, 3)) < 20, fit: img ? cs(img).objectFit : 'contain',
            };
          }));
          for (const [i, l] of look.entries()) {
            expect(l.nFont, `#${i + 1} index in Chivo Mono`).toMatch(/Chivo Mono/);
            expect(l.nSize).toBe('12px');
            expect(l.cFont, `#${i + 1} caption in Archivo`).toMatch(/Archivo/);
            expect(l.cSize).toBe('13px');
            expect(l.truncated, `#${i + 1} caption never truncated`).toBe(false);
            expect(l.transform, `#${i + 1} no rotation`).toEqual(['none', 'none']);
            expect(l.rotate).toEqual(['none', 'none']);
            expect(l.mat, `#${i + 1} no mat`).toEqual(['0px', '0px', '0px', '0px']);
            expect(l.stripDark, `#${i + 1} a near-black strip`).toBe(true);
            expect(l.fit, 'never cropped').toBe('contain');
          }
        }
      } finally {
        await ctx.close();
      }
    });
  }
});

test.describe('A7 layout', () => {
  test('1440 x 900: width = min(widthFrac x roll, 80 svh x aspect) within 2 px; the zigzag; no overlap', async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    try {
      for (const slug of ['project-01', 'project-04', 'project-05', 'project-06', 'project-07']) {
        await cold(page, slug);
        const ps = await prints(page);
        for (const p of ps) {
          const want = Math.min(p.wf * p.roll.w, 0.8 * 900 * p.ar);
          expect(Math.abs(p.frame.w - want), `${slug} #${p.n}: ${p.frame.w} vs ${want}`).toBeLessThanOrEqual(2);
        }
        for (const a of ps) for (const b of ps) {
          if (a.n >= b.n) continue;
          const sep = a.fig.x + a.fig.w <= b.fig.x + 0.5 || b.fig.x + b.fig.w <= a.fig.x + 0.5 || a.fig.y + a.fig.h <= b.fig.y + 0.5 || b.fig.y + b.fig.h <= a.fig.y + 0.5;
          expect(sep, `${slug}: #${a.n} and #${b.n} overlap`).toBe(true);
        }
        // the zigzag: a dropped print sits half its own frame height lower than its row's first print
        const rows = await page.evaluate(() => [...document.querySelectorAll('.print')].map((p) => ({ row: getComputedStyle(p).gridRowStart, drop: p.hasAttribute('data-drop') })));
        ps.forEach((p, i) => {
          if (!rows[i].drop) return;
          const first = ps[rows.findIndex((r) => r.row === rows[i].row)];
          expect(Math.abs(p.frame.y - first.frame.y - (Math.min(p.frame.h, 0.8 * 900) / 2 + 14)), `${slug} #${p.n} drops half its height`).toBeLessThanOrEqual(2);
        });
      }
    } finally {
      await ctx.close();
    }
  });

  test('390 x 844: one column; width = min(phone fraction x roll, 70 svh x aspect) within 2 px; sides alternate', async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, PHONE);
    const page = await ctx.newPage();
    try {
      for (const slug of ['project-01', 'project-05', 'project-06']) {
        await cold(page, slug);
        const ps = await prints(page);
        for (const [i, p] of ps.entries()) {
          const want = Math.min(p.pf * p.roll.w, 0.7 * 844 * p.ar);
          expect(Math.abs(p.frame.w - want), `${slug} #${p.n}: ${p.frame.w} vs ${want}`).toBeLessThanOrEqual(2);
          if (i) expect(p.fig.y, `${slug} #${p.n}: one column`).toBeGreaterThanOrEqual(ps[i - 1].fig.y + ps[i - 1].fig.h - 0.5);
          if (p.frame.w < p.roll.w - 2) {
            const edge = p.side === 'right' ? Math.abs(p.frame.x + p.frame.w - (p.roll.x + p.roll.w)) : Math.abs(p.frame.x - p.roll.x);
            expect(edge, `${slug} #${p.n} sits ${p.side}`).toBeLessThanOrEqual(1);
          }
        }
        expect(ps.map((p) => p.side).slice(0, 4)).toEqual(['left', 'right', 'left', 'right']);
      }
    } finally {
      await ctx.close();
    }
  });

  test('overflow 0 from 320 px: every project page, and the open view on /', async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, { ...PHONE, viewport: { width: 320, height: 640 } });
    const page = await ctx.newPage();
    const over = () => page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, ...[...document.querySelectorAll('.proj__col, .roll, .pj')].map((e) => e.scrollWidth - e.clientWidth)));
    try {
      for (let i = 1; i <= 8; i++) {
        await cold(page, `project-0${i}`);
        await scrollTo(page, 100000);
        expect(await over(), `/work/project-0${i}/ at 320`).toBe(0);
      }
      await home(page);
      await toFrame(page, 5);
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 5);
      await scrollTo(page, 1600);
      expect(await over(), 'the open view at 320').toBe(0);
    } finally {
      await ctx.close();
    }
  });

  // the AF brackets sit 7 px outside the focused print: on a print flush with the roll's edge they overflowed the roll
  // by 7 px at 1440 (the gate's frames row, 9f25a82); every step of the roll, cold and in the open view
  // each place a row of its own, in its own browser, so a failure names the place. These long sweeps are what found
  // WPE's compositor crash on CSS filter transitions (round 2's source too; project/roll.ts now tweens the dim's
  // saturation): CI's WebKit runs them with no retry, so a crash fails the row.
  for (const where of ['project-01', 'project-06', 'the open view']) test(`overflow 0 at 1440 with the brackets on: every step through the roll (${where === 'the open view' ? where : `cold ${where}`})`, async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    // after each scroll step: every frame for 320 ms, how far the brackets' drawn box (their inline transform and width,
    // plus the corners' 7 px) reaches past their container's padding box, since a glide onto a print flush with the edge
    // overshoots (vf.detent) and a single late read would miss it; then the page's overflow once. The per-frame read
    // takes no layout (a forced layout every frame for minutes lost the page in CI's WebKit).
    const over = () => page.evaluate(() => new Promise((done) => {
      const read = () => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, ...[...document.querySelectorAll('.proj__col, .roll, .roll__grid, .pj, dialog[open]')].map((e) => e.scrollWidth - e.clientWidth));
      const af = document.querySelector('.roll__af');
      const limit = af?.parentElement ? af.parentElement.clientWidth : Infinity;
      let worst = 0;
      const t0 = performance.now();
      const tick = () => {
        if (af) {
          const x = Number(/translate3?d?\(\s*(-?[\d.]+)px/.exec(af.style.transform)?.[1] ?? 0);
          worst = Math.max(worst, Math.round(x + (parseFloat(af.style.width) || 0) + 7 - limit)); // sub-pixel float noise is not overflow
        }
        if (performance.now() - t0 < 320) requestAnimationFrame(tick); else done(Math.max(worst, read()));
      };
      requestAnimationFrame(tick);
    }));
    const sweep = async (where) => {
      const worst = [];
      const max = await page.evaluate(() => { const c = document.querySelector('.proj:not([hidden]) .proj__col') ?? document.scrollingElement; return c.scrollHeight - c.clientHeight; });
      for (let y = 0; y <= max + 299; y += 300) {
        await scrollTo(page, y);
        const v = await over();
        if (v > 0) worst.push(`${y}: ${v}px (focus ${await page.evaluate(() => document.querySelector('.roll')?.dataset.focus)})`);
      }
      expect(worst, `${where}: steps with overflow`).toEqual([]);
    };
    try {
      if (where !== 'the open view') { await cold(page, where); await sweep(where); return; }
      await home(page);
      await toFrame(page, 5);
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 5);
      await sweep('the open view');
    } finally {
      await ctx.close();
    }
  });

  test('CLS 0.02 or less over the open path (Chromium: the layout-shift entries)', async ({ own: browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'WebKit has no layout-shift entries; the gate traces CLS in Chromium');
    const ctx = await context(browser, browserName, DESK, { init: [`(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); })();`] });
    const page = await ctx.newPage();
    try {
      await home(page);
      await toFrame(page, 5);
      await page.evaluate(() => { window.__cls = 0; });
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 5);
      for (const y of [600, 1400, 2400, 3600, 5000]) { await scrollTo(page, y); await page.waitForTimeout(250); }
      await page.locator('#print-08 [data-print-open]').click();
      await expect(page.locator('dialog.pb')).toHaveAttribute('open', '');
      await page.waitForTimeout(700);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await page.keyboard.press('Escape');
      await untilState(page, 'evf', 5);
      const cls = await page.evaluate(() => window.__cls);
      test.info().annotations.push({ type: 'cls', description: String(cls) });
      expect(cls).toBeLessThanOrEqual(0.02);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('A8 expose', () => {
  for (const reduced of [false, true]) {
    test(`prints expose in order as they enter; none blank 1.0 s after 50% visible${reduced ? ' (reduced: opacity only)' : ''}`, async ({ own: browser, browserName }) => {
      const ctx = await context(browser, browserName, DESK, { reduced });
      const page = await ctx.newPage();
      try {
        await cold(page, 'project-06');
        await page.evaluate(() => {
          // print 1's top edge closes the first view, so it may have exposed already
          window.__exp = [...document.querySelectorAll('.print.is-exp')].map((p) => p.id);
          new MutationObserver((ms) => { for (const m of ms) if (m.target.classList.contains('is-exp') && !window.__exp.includes(m.target.id)) window.__exp.push(m.target.id); })
            .observe(document.querySelector('.roll__grid'), { subtree: true, attributes: true, attributeFilter: ['class'] });
        });
        const before = await page.evaluate(() => [...document.querySelectorAll('.print')].filter((p) => p.getBoundingClientRect().top > innerHeight).map((p) => getComputedStyle(p.querySelector('.print__frame'))[document.documentElement.classList.contains('calm') ? 'opacity' : 'filter']));
        expect(before.length, 'prints below the fold').toBeGreaterThanOrEqual(11);
        expect(before.every((v) => v !== 'none' && v !== '1'), 'below the fold the prints wait underexposed').toBe(true);
        for (let y = 500; y < 9000; y += 450) {
          await scrollTo(page, y);
          await page.waitForTimeout(1000);
          const blank = await page.evaluate(() => [...document.querySelectorAll('.print')].filter((p) => {
            const r = p.querySelector('.print__frame').getBoundingClientRect();
            const vis = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) / r.height;
            const f = getComputedStyle(p.querySelector('.print__frame'));
            return vis >= 0.5 && (Number(f.opacity) < 0.05 || /brightness\(0\.125\)/.test(f.filter));
          }).map((p) => p.id));
          expect(blank, `blank 1.0 s after 50% visible at scroll ${y}`).toEqual([]);
        }
        const order = await page.evaluate(() => window.__exp);
        expect(order, 'exposed in order').toEqual([...order].sort());
        expect(order.length).toBe(12);
        if (reduced) {
          const filters = await page.evaluate(() => [...document.querySelectorAll('.print__frame')].map((f) => getComputedStyle(f).filter));
          expect(filters.every((f) => f === 'none'), 'reduced: no blur or brightness').toBe(true);
        }
      } finally {
        await ctx.close();
      }
    });
  }

  test('a failed image becomes an "image unavailable" print at the same size', async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    await page.route(/\/media\/fixtures\/project-06\/04-/, (r) => r.abort());
    try {
      await cold(page, 'project-06');
      await centrePrint(page, 4);
      await expect(page.locator('#print-04')).toHaveClass(/is-failed/, { timeout: 5000 });
      const p = (await prints(page)).find((x) => x.n === 4);
      expect(Math.abs(p.frame.w - Math.min(p.wf * p.roll.w, 720 * p.ar))).toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector('#print-04 .print__frame'), '::after').content)).toBe('"Image unavailable"');
    } finally {
      await ctx.close();
    }
  });
});

test.describe('A9 focus', () => {
  const GBCR = `(() => {
    const o = Element.prototype.getBoundingClientRect;
    window.__gbcr = 0;
    Element.prototype.getBoundingClientRect = function () { if (this.closest && this.closest('.print')) window.__gbcr++; return o.call(this); };
  })();`;

  test('the print nearest the centre keeps the brackets and full brightness; the rest dim; the counter reads it; rects cached', async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK, { init: [GBCR] });
    const page = await ctx.newPage();
    try {
      await cold(page, 'project-06');
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), 'a fine pointer').toBe(true);
      await centrePrint(page, 3);
      await page.waitForFunction(() => document.querySelector('.roll')?.dataset.focus === '3', null, { timeout: 3000 });
      await page.waitForTimeout(400);
      // the 0.24 s dim has landed (a slow CI engine was still at 0.550062 after 400 ms)
      await page.waitForFunction(() => [...document.querySelectorAll('.print:not([data-focus])')].every((p) => getComputedStyle(p.querySelector('.print__frame')).opacity === '0.55' && getComputedStyle(p.querySelector('.print__img')).filter === 'saturate(0.4)'), null, { timeout: 3000 }).catch(() => {});
      const st = await page.evaluate(() => ({
        focus: document.querySelector('.print[data-focus]')?.id,
        dim: document.querySelector('.roll').hasAttribute('data-dim'),
        counter: document.querySelector('[data-print-count]').textContent,
        others: [...document.querySelectorAll('.print:not([data-focus])')].map((p) => [getComputedStyle(p.querySelector('.print__frame')).opacity, getComputedStyle(p.querySelector('.print__img')).filter]),
        self: [getComputedStyle(document.querySelector('.print[data-focus] .print__frame')).opacity, getComputedStyle(document.querySelector('.print[data-focus] .print__img')).filter],
        af: (() => { const a = document.querySelector('.roll__af'), f = document.querySelector('#print-03'); const r = a.getBoundingClientRect(), q = f.getBoundingClientRect(); return { on: a.classList.contains('on'), dx: Math.abs(r.left - q.left), dy: Math.abs(r.top - q.top), dw: Math.abs(r.width - q.width), colour: getComputedStyle(a.querySelector('i')).borderTopColor, n: document.querySelectorAll('.roll__af').length }; })(),
      }));
      expect(st.focus).toBe('print-03');
      expect(st.dim).toBe(true);
      expect(st.counter).toBe('03 / 12');
      expect(st.self).toEqual(['1', 'none']);
      for (const [o, f] of st.others) { expect(o).toBe('0.55'); expect(f).toBe('saturate(0.4)'); }
      // no CSS filter transition anywhere in the roll: WPE's compositor segfaults on them as the focus moves (#114's
      // round-3 CI probes); roll.ts tweens the dim's saturation instead
      const filterTransitions = await page.evaluate(() => [...document.querySelectorAll('.roll, .roll *')].flatMap((e) => {
        const cs = getComputedStyle(e), d = cs.transitionDuration.split(', ').map(parseFloat);
        return cs.transitionProperty.split(', ').filter((p, i) => /^(filter|all)$/.test(p) && (d[i % d.length] || 0) > 0).map((p) => `${e.className}: ${p}`);
      }));
      expect(filterTransitions, 'CSS filter transitions in the roll').toEqual([]);
      expect(st.af.on && st.af.n === 1, 'one bracket element, on').toBe(true);
      expect(Math.max(st.af.dx, st.af.dy, st.af.dw), 'the brackets frame the print').toBeLessThanOrEqual(2);
      expect(st.af.colour, 'phosphor').toBe('rgb(255, 177, 59)');

      // the brackets move within 100 ms of a change
      const at = () => page.evaluate(() => { const r = document.querySelector('.roll__af').getBoundingClientRect(); return [r.top + window.scrollY, r.height]; });
      const was = await at();
      await centrePrint(page, 4);
      await page.waitForFunction(() => document.querySelector('.roll').dataset.focus === '4', null, { timeout: 2000 });
      await page.waitForTimeout(100);
      expect(await at(), 'moving 100 ms after the change').not.toEqual(was);

      // a 2 s scripted scroll measures nothing: rects are cached on resize
      await page.evaluate(() => { window.__gbcr = 0; });
      await page.evaluate(() => new Promise((done) => { const t0 = performance.now(); const step = () => { window.scrollBy(0, 14); if (performance.now() - t0 < 2000) setTimeout(step, 16); else done(); }; step(); }));
      const n = await page.locator('.print').count();
      expect(await page.evaluate(() => window.__gbcr), 'getBoundingClientRect calls on prints over the scroll').toBeLessThanOrEqual(2 * n);
    } finally {
      await ctx.close();
    }
  });

  // each place a row of its own, in its own browser (as the overflow rows above)
  for (const where of ['cold page', 'the open view', 'cold page at 1440 x 1800']) test(`the centre line leads: a print the line crosses has focus; the last print takes it at the scroll end (12 / 12) (${where})`, async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    /** Steps the scroller (the window, or the open view's column) through the roll; at each stop, the focused print and
     *  the prints the view's centre line crosses. */
    const sweep = () => page.evaluate(async () => {
      const col = document.querySelector('.proj:not([hidden]) .proj__col');
      const sc = col || document.scrollingElement;
      const vh = col ? col.clientHeight : innerHeight;
      const vtop = () => (col ? col.getBoundingClientRect().top : 0);
      const max = sc.scrollHeight - vh;
      const out = [];
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (let y = 0; y <= max + 1; y += 120) {
        sc.scrollTop = Math.min(y, max);
        await frame();
        const line = vtop() + vh / 2;
        const crossing = [...document.querySelectorAll('.print')].filter((p) => { const r = p.getBoundingClientRect(); return r.top <= line && r.bottom >= line; }).map((p) => Number(p.dataset.print));
        out.push({ y: sc.scrollTop, end: sc.scrollTop >= max - 2, focus: Number(document.querySelector('.roll').dataset.focus || 0), crossing });
      }
      sc.scrollTop = max;
      await frame();
      return { out, last: { focus: Number(document.querySelector('.roll').dataset.focus || 0), counter: document.querySelector('[data-print-count]').textContent } };
    });
    const check = ({ out, last }, where) => {
      const wrong = out.filter((s) => !s.end && s.crossing.length && !s.crossing.includes(s.focus));
      expect(wrong, `${where}: stops where focus is off the centre line`).toEqual([]);
      expect(last, `${where}: the scroll end`).toEqual({ focus: 12, counter: '12 / 12' });
    };
    try {
      if (where === 'cold page') {
        await cold(page, 'project-06');
        check(await sweep(), where);
      } else if (where === 'the open view') {
        await home(page);
        await toFrame(page, 5);
        await page.keyboard.press('Enter');
        await untilState(page, 'open', 5);
        check(await sweep(), where);
      } else {
        // a tall view: at the scroll end the centre line crosses print 11, and the last print still takes focus
        await page.setViewportSize({ width: 1440, height: 1800 });
        await cold(page, 'project-06');
        const tall = await sweep();
        expect(tall.out.at(-1).crossing, 'the case the end rule exists for').not.toContain(12);
        check(tall, where);
      }
    } finally {
      await ctx.close();
    }
  });

  // the cold page and the open view each a row of its own, in its own browser (as the overflow rows above)
  for (const place of ['cold', 'open']) test(`hover to focus: a fine pointer on a print takes the brackets and full brightness; the next scroll returns to the centre line (${place})`, async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    const focusOf = () => page.evaluate(() => document.querySelector('.roll').dataset.focus);
    try {
      for (const where of [place]) {
        if (where === 'cold') await cold(page, 'project-06');
        else { await home(page); await toFrame(page, 5); await page.keyboard.press('Enter'); await untilState(page, 'open', 5); }
        await centrePrint(page, 5);
        await page.waitForFunction(() => document.querySelector('.roll')?.dataset.focus === '5', null, { timeout: 3000 });
        // the view has settled: fonts in, the arrival over, the scroll still (a late layout refresh or a running scroll
        // takes the focus back to the centre line, as it should)
        await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(700);
        for (let k = 0, prev = -1; k < 20; k++) {
          const y = await page.evaluate(() => (document.querySelector('.proj:not([hidden]) .proj__col') ?? document.scrollingElement).scrollTop);
          if (y === prev) break;
          prev = y;
          await page.waitForTimeout(150);
        }
        // another print with a part in view (under the bar): the pointer goes to the middle of that part
        const other = await page.evaluate(() => {
          for (const p of document.querySelectorAll('.print')) {
            if (p.dataset.print === '5') continue;
            const r = p.querySelector('.print__frame').getBoundingClientRect();
            const top = Math.max(r.top, 120), bottom = Math.min(r.bottom, innerHeight - 10);
            const left = Math.max(r.left, 10), right = Math.min(r.right, innerWidth - 10);
            if (bottom - top > 60 && right - left > 60) return { n: p.dataset.print, x: (left + right) / 2, y: (top + bottom) / 2 };
          }
          return null;
        });
        expect(other, `${where}: a second print in view to hover`).not.toBeNull();
        await page.mouse.move(other.x - 30, other.y - 20);
        await page.mouse.move(other.x, other.y, { steps: 3 });
        await expect.poll(focusOf, { message: `${where}: hover moves the focus to print ${other.n}`, timeout: 1000 }).toBe(other.n);
        await page.waitForTimeout(400);
        const st = await page.evaluate((n) => {
          const p = document.querySelector(`.print[data-print="${n}"]`), a = document.querySelector('.roll__af');
          const r = p.getBoundingClientRect(), q = a.getBoundingClientRect();
          return { focused: p.hasAttribute('data-focus'), opacity: getComputedStyle(p.querySelector('.print__frame')).opacity, dx: Math.abs(r.left - q.left), dy: Math.abs(r.top - q.top), counter: document.querySelector('[data-print-count]').textContent };
        }, other.n);
        expect(st.focused && st.opacity === '1', `${where}: the hovered print has focus at full brightness`).toBe(true);
        expect(Math.max(st.dx, st.dy), `${where}: the brackets frame the hovered print`).toBeLessThanOrEqual(2);
        expect(st.counter).toBe(`${String(other.n).padStart(2, '0')} / 12`);
        // a scroll (the pointer resting where it is) goes back to the centre line; an after-scroll hover update at the
        // same point does not pull it off again
        await centrePrint(page, 5);
        await page.evaluate(() => { const c = document.querySelector('.proj:not([hidden]) .proj__col'); if (c) c.scrollTop += 6; else window.scrollBy(0, 6); });
        await expect.poll(focusOf, { message: `${where}: the scroll returns to the centre line`, timeout: 1000 }).toBe('5');
        await page.waitForTimeout(500);
        expect(await focusOf(), `${where}: still the centre line after the scroll settles`).toBe('5');
        await page.mouse.move(5, 300);
      }
    } finally {
      await ctx.close();
    }
  });

  test('no dim under 4 prints, nor on touch', async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    try {
      await cold(page, 'project-03');
      await centrePrint(page, 1);
      await page.waitForFunction(() => document.querySelector('.roll')?.dataset.focus === '1', null, { timeout: 3000 });
      expect(await page.evaluate(() => document.querySelector('.roll').hasAttribute('data-dim')), 'two prints: no dim').toBe(false);
    } finally {
      await ctx.close();
    }
    // a coarse pointer in both engines: WebKit reports a fine one under touch emulation, so the query is forced
    const COARSE = `(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => mm(/pointer: ?fine|hover: ?hover/.test(q) ? '(max-width: 0px)' : q); })();`;
    const tctx = await context(browser, browserName, PHONE, { init: [COARSE] });
    const tp = await tctx.newPage();
    try {
      await cold(tp, 'project-06');
      expect(await tp.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), 'a coarse pointer').toBe(false);
      await centrePrint(tp, 3);
      await tp.waitForFunction(() => document.querySelector('.roll')?.dataset.focus === '3', null, { timeout: 3000 });
      expect(await tp.evaluate(() => [document.querySelector('.roll').hasAttribute('data-dim'), document.querySelector('.roll__af').classList.contains('on')]), 'touch: no dim, no brackets').toEqual([false, false]);
      expect(await tp.evaluate(() => document.querySelector('[data-print-count]').textContent)).toBe('03 / 12');
    } finally {
      await tctx.close();
    }
  });
});

test.describe('A11 loop clips', () => {
  const STUB = `(() => {
    window.__media = [];
    HTMLMediaElement.prototype.play = function () { window.__media.push(['play', this.closest('.print')?.id]); this.dispatchEvent(new Event('playing')); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { window.__media.push(['pause', this.closest('.print')?.id]); };
  })();`;
  const calls = (page) => page.evaluate(() => window.__media.slice());
  const playing = (c) => { const s = new Set(); for (const [op, id] of c) op === 'play' ? s.add(id) : s.delete(id); return [...s].sort(); };

  test('a loop plays muted inline at 50% visible, pauses out of view and in a hidden tab, two at most; preload none', async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK, { init: [STUB] });
    const page = await ctx.newPage();
    try {
      await cold(page, 'project-06');
      const attrs = await page.evaluate(() => [...document.querySelectorAll('.print video')].map((v) => [v.getAttribute('preload'), v.muted, v.hasAttribute('playsinline'), v.loop]));
      expect(attrs).toEqual([['none', true, true, true], ['none', true, true, true], ['none', true, true, true]]);
      expect(await calls(page), 'nothing plays above the fold').toEqual([]);
      await centrePrint(page, 2);
      await expect.poll(async () => playing(await calls(page))).toEqual(['print-02']);
      await centrePrint(page, 8);
      await expect.poll(async () => playing(await calls(page)), { message: 'out of view: paused' }).toEqual([]);
      await centrePrint(page, 9);
      await expect.poll(async () => playing(await calls(page))).toEqual(['print-09']);
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      await expect.poll(async () => playing(await calls(page)), { message: 'hidden tab: paused' }).toEqual([]);
    } finally {
      await ctx.close();
    }
    // a viewport tall enough for all three loops: two play
    const tall = await context(browser, browserName, { ...PHONE, viewport: { width: 390, height: 4200 } }, { init: [STUB] });
    const tp = await tall.newPage();
    try {
      await cold(tp, 'project-06');
      await scrollTo(tp, 4300);
      const vis = await tp.evaluate(() => [...document.querySelectorAll('.print[data-loop]')].map((p) => { const r = p.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
      expect(vis, 'all three loops in view').toEqual([true, true, true]);
      await expect.poll(async () => playing(await calls(tp)).length).toBe(2);
    } finally {
      await tall.close();
    }
  });

  test('reduced motion: no inline play', async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK, { init: [STUB], reduced: true });
    const page = await ctx.newPage();
    try {
      await cold(page, 'project-06');
      await centrePrint(page, 2);
      await page.waitForTimeout(800);
      expect(await calls(page)).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
});

// fix-pass B1 (the W-V1 fix pass, batch B1: the roll and the print surface)
test.describe('A9 focus (fix-pass B1)', () => {
  /** The opacity each match is composited at: its own times every ancestor's (an expression for page.evaluate). */
  const composite = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => { let v = 1; for (let n = e; n; n = n.parentElement) v *= Number(getComputedStyle(n).opacity); return v; })`;

  // f02: the dim is on the print's media, never on its caption strip: the strip's ink-2 on near-black at 0.55 was about
  // 2.9:1 (WCAG 1.4.3 asks 4.5:1)
  test('the dim leaves the strip at full ink: axe colour-contrast 0 in the dim state', async ({ own: browser, browserName }) => {
    const { AxeBuilder } = await import('@axe-core/playwright');
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    try {
      await cold(page, 'project-06');
      await centrePrint(page, 3);
      // the dim has landed, wherever it applies (no catch: a dim that never lands fails here)
      await page.waitForFunction(`document.querySelector('.roll[data-dim]')?.dataset.focus === '3' && ${composite('.print:not([data-focus]) .print__frame')}.every((v) => Math.abs(v - 0.55) < 0.001)`, null, { timeout: 3000 });
      const strip = await page.evaluate(`({ n: ${composite('.print:not([data-focus]) .print__n')}, cap: ${composite('.print:not([data-focus]) .print__cap')} })`);
      expect(strip.n.length, 'the dimmed prints').toBe(11);
      for (const v of [...strip.n, ...strip.cap]) expect(v, 'a dimmed print\'s strip composites at full opacity').toBeCloseTo(1, 5);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).include('.print').analyze();
      const cc = axe.violations.filter((v) => v.id === 'color-contrast').flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')}: ${n.failureSummary.split('\n')[1]?.trim()}`));
      expect(cc, 'colour-contrast in the dim state').toEqual([]);
      expect(await page.evaluate(() => [...document.querySelectorAll('.print:not([data-focus]) .print__frame')].every((f) => getComputedStyle(f).opacity === '0.55')), 'the dim is on the media').toBe(true);
    } finally {
      await ctx.close();
    }
    // a failed image and a typed placeholder box never dim: their label is text
    const fctx = await context(browser, browserName, DESK);
    const fp = await fctx.newPage();
    await fp.route(/\/media\/fixtures\/project-06\/04-/, (r) => r.abort());
    try {
      await cold(fp, 'project-06');
      await fp.evaluate(() => {
        // the test build has no file-less print: print 5 becomes one, as Print.astro renders it
        const f = document.querySelector('#print-05 .print__frame');
        f.querySelector('picture')?.remove();
        const box = document.createElement('span');
        box.className = 'print__box';
        const t = document.createElement('span');
        t.className = 'ph';
        t.textContent = '[PLACEHOLDER: media file]';
        box.append(t);
        f.prepend(box);
      });
      await centrePrint(fp, 3);
      await expect(fp.locator('#print-04')).toHaveClass(/is-failed/, { timeout: 5000 });
      await fp.waitForFunction(() => document.querySelector('.roll[data-dim]')?.dataset.focus === '3', null, { timeout: 3000 });
      await fp.waitForTimeout(500);
      const v = await fp.evaluate(composite('#print-02 .print__frame, #print-04 .print__frame, #print-05 .print__frame'));
      expect(v[0], 'a print with media still dims').toBeCloseTo(0.55, 3);
      expect(v[1], 'the failed print\'s frame stays at full ink').toBeCloseTo(1, 5);
      expect(v[2], 'the placeholder box stays at full ink').toBeCloseTo(1, 5);
    } finally {
      await fctx.close();
    }
  });

  // f03: a wheel or trackpad keeps sending scroll events for 100-150 ms after the focus changes; one on an unchanged
  // focus re-placed the brackets with a jump and killed the glide. The reads are in-page, on both sides of the roll's
  // own scroll listener (a capture listener runs before it, a later bubble one after), so the row does not depend on
  // how long an engine's frames are (headless WebKit's ran 60-80 ms here: two frames were most of the glide)
  test('the brackets glide through the scroll events that follow a focus change (A9 0.24 s, J3)', async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK);
    const page = await ctx.newPage();
    const gap = () => page.evaluate(() => Math.abs(document.querySelector('.roll__af').getBoundingClientRect().top - document.querySelector('#print-04').getBoundingClientRect().top));
    try {
      await cold(page, 'project-06');
      await centrePrint(page, 3);
      await page.waitForFunction(() => document.querySelector('.roll[data-dim]')?.dataset.focus === '3', null, { timeout: 3000 });
      await page.waitForTimeout(400);
      const s = await page.evaluate(() => new Promise((done) => {
        const af = document.querySelector('.roll__af'), p4 = document.querySelector('#print-04');
        const d = () => Math.abs(af.getBoundingClientRect().top - p4.getBoundingClientRect().top);
        const out = [];
        let pre = 0;
        const end = () => { removeEventListener('scroll', before, true); removeEventListener('scroll', after); done(out); };
        const before = () => { pre = d(); };
        const after = () => {
          out.push({ f: document.querySelector('.roll').dataset.focus, pre, post: d() });
          if (out.length === 1) window.scrollBy(0, 1); // the change's event started the glide; the stream's next, on the same focus
          else end();
        };
        addEventListener('scroll', before, { capture: true, passive: true });
        addEventListener('scroll', after, { passive: true });
        setTimeout(end, 3000);
        const r = p4.querySelector('.print__frame').getBoundingClientRect();
        window.scrollBy(0, r.top + r.height / 2 - innerHeight / 2);
      }));
      expect(s.map((e) => e.f), 'the change, then a 1 px nudge that keeps the focus').toEqual(['4', '4']);
      expect(s[0].pre, 'the brackets start a print away').toBeGreaterThan(20);
      expect(s[1].pre, 'the glide is in flight at the next scroll event').toBeGreaterThan(2);
      expect(Math.abs(s[1].post - s[1].pre), `the next scroll event leaves the glide be (${s[1].pre.toFixed(1)} px to go before it, ${s[1].post.toFixed(1)} after)`).toBeLessThan(0.5);
      await expect.poll(gap, { message: 'the glide lands', timeout: 1000, intervals: [50] }).toBeLessThanOrEqual(2);
    } finally {
      await ctx.close();
    }
  });
});

test.describe('A8 expose (fix-pass B1)', () => {
  /** The cold page's entry module (and so initRoll, which sets the roll's [data-expose]). */
  const MODULE = /\/_astro\/_slug_\.astro_astro_type_script_index_0_lang\.[^/]+\.js/;
  /** A cold page with its module held: the page as it paints before the module runs (the stylesheet in). */
  const held = async (page, slug) => {
    const routes = [];
    await page.route(MODULE, (r) => { routes.push(r); });
    await page.goto(`${base()}/work/${slug}/?vf-test`, { waitUntil: 'commit' }); // held module scripts hold DOMContentLoaded and load
    await page.waitForSelector('.print__frame', { state: 'attached' });
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.pj-bar')).position === 'fixed');
    return routes;
  };
  const release = (routes) => { routes.splice(0).forEach((r) => r.continue().catch(() => {})); };

  // f16: before the module ran there was no underexposed state, so the prints painted lit, dropped to -3 EV when it ran
  // and exposed again (lit, dark, lit), and the counter showed a static "01 / NN"
  for (const reduced of [false, true]) test(`the cold page paints its prints underexposed and the counter hidden before its module runs${reduced ? ' (calm)' : ''}`, async ({ own: browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK, { reduced });
    const page = await ctx.newPage();
    let routes = [];
    try {
      routes = await held(page, 'project-06');
      const st = await page.evaluate(() => ({
        pjjs: document.documentElement.classList.contains('pj-js'), roll: document.documentElement.hasAttribute('data-roll'),
        frames: [...document.querySelectorAll('.print__frame')].map((f) => { const cs = getComputedStyle(f); return [cs.filter, cs.opacity]; }),
        counter: document.querySelector('[data-print-count]').hidden,
      }));
      expect([st.pjjs, st.roll], 'pj-js on, the module held').toEqual([true, false]);
      expect(st.frames.length).toBe(12);
      for (const [filter, opacity] of st.frames) {
        if (reduced) expect([filter, opacity], 'calm: underexposed is unseen').toEqual(['none', '0']);
        else expect(filter, 'underexposed: -3 EV behind the blur').toMatch(/brightness\(0\.125\).*blur\(8px\)/);
      }
      expect(st.counter, 'the counter waits hidden').toBe(true);
      release(routes);
      await page.waitForFunction(() => document.documentElement.hasAttribute('data-roll'), null, { timeout: 10000 });
      if (reduced) {
        // the dim (f02) must not show a print still to expose: the cold calm rule outranks it
        await centrePrint(page, 3);
        await page.waitForFunction(() => document.querySelector('.roll[data-dim]')?.dataset.focus === '3', null, { timeout: 3000 });
        const waiting = await page.evaluate(() => [...document.querySelectorAll('.print:not(.is-exp) .print__frame')].map((f) => getComputedStyle(f).opacity));
        expect(waiting.length, 'prints still to expose').toBeGreaterThan(0);
        expect(waiting, 'calm, under the dim: a print still to expose stays unseen').toEqual(waiting.map(() => '0'));
      }
    } finally {
      release(routes);
      await ctx.close();
    }
    // a module that fails to load: the page falls back to its prints as they are
    const fctx = await context(browser, browserName, DESK, { reduced });
    const fp = await fctx.newPage();
    try {
      await fp.route(MODULE, (r) => r.abort());
      await fp.goto(`${base()}/work/project-06/?vf-test`, { waitUntil: 'domcontentloaded' });
      await fp.waitForFunction(() => !document.documentElement.classList.contains('pj-js'), null, { timeout: 8000 });
      const lit = await fp.evaluate(() => [...document.querySelectorAll('.print__frame')].map((f) => { const cs = getComputedStyle(f); return `${cs.filter} ${cs.opacity}`; }));
      expect(lit, 'a failed module: the prints lit').toEqual(lit.map(() => 'none 1'));
    } finally {
      await fctx.close();
    }
  });

  // f16: the first print, sampled every frame from its first paint through the module landing: its exposure only rises
  for (const reduced of [false, true]) test(`the first print never steps from lit to dark as the module lands${reduced ? ' (calm)' : ''}`, async ({ own: browser, browserName }) => {
    const SAMPLER = `(() => {
      window.__s = [];
      const tick = () => {
        const f = document.querySelector('#print-01 .print__frame');
        if (f) { const cs = getComputedStyle(f); window.__s.push([cs.filter, cs.opacity]); }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })();`;
    const ctx = await context(browser, browserName, DESK, { reduced, init: [SAMPLER] });
    const page = await ctx.newPage();
    let routes = [];
    try {
      routes = await held(page, 'project-06');
      await page.waitForTimeout(1500);
      release(routes);
      await page.waitForFunction(() => document.querySelector('#print-01')?.classList.contains('is-exp'), null, { timeout: 10000 });
      await page.waitForTimeout(1200);
      // exposure: opacity times brightness ('none' is 1)
      const s = (await page.evaluate(() => window.__s)).map(([f, o]) => Number(o) * Number(/brightness\(([\d.]+)\)/.exec(f)?.[1] ?? 1));
      expect(s.length, 'frames sampled').toBeGreaterThan(10);
      expect(s[0], 'the first paint is underexposed').toBeLessThan(0.2);
      const drops = s.map((v, i) => (i && v < s[i - 1] - 0.01 ? `${i}: ${s[i - 1].toFixed(3)} -> ${v.toFixed(3)}` : null)).filter(Boolean);
      expect(drops, 'a step down in exposure').toEqual([]);
      expect(s.at(-1), 'exposed in the end').toBeGreaterThan(0.99);
    } finally {
      release(routes);
      await ctx.close();
    }
  });
});
