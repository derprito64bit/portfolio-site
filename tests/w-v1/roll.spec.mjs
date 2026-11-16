// W-V1 A5, A7, A8, A9 and A11 on the flat path (WebGL off), DOM only, Chromium and WebKit: the print look, the layout at
// 1440 x 900 and 390 x 844 (widths within 2 px of the size rule), overflow from 320 px, CLS over the open path, the
// expose, the focus (brackets, dim, the HUD counter, cached rects) and the loop clips (play and pause stubbed: the calls
// are asserted, nothing really plays).
import { test, expect } from '@playwright/test';
import { DESK, PHONE, base, centrePrint, context, home, prints, scrollTo, toFrame, untilState } from './lib.mjs';

const cold = (page, slug, hash = '') => page.goto(`${base()}/work/${slug}/?vf-test${hash}`, { waitUntil: 'load' });
const AR_MIN = 9 / 21, AR_MAX = 21 / 9;
const clampAr = (r) => Math.min(AR_MAX, Math.max(AR_MIN, r));

test.describe('A5 the print look', () => {
  for (const [label, profile] of [['1440', DESK], ['390', PHONE]]) {
    test(`own aspect (9:21 to 21:9, letterboxed), the strip, the type, no mat or rotation, at ${label}`, async ({ browser, browserName }) => {
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
  test('1440 x 900: width = min(widthFrac x roll, 80 svh x aspect) within 2 px; the zigzag; no overlap', async ({ browser, browserName }) => {
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

  test('390 x 844: one column; width = min(phone fraction x roll, 70 svh x aspect) within 2 px; sides alternate', async ({ browser, browserName }) => {
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

  test('overflow 0 from 320 px: every project page, and the open view on /', async ({ browser, browserName }) => {
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

  test('CLS 0.02 or less over the open path (Chromium: the layout-shift entries)', async ({ browser, browserName }) => {
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
    test(`prints expose in order as they enter; none blank 1.0 s after 50% visible${reduced ? ' (reduced: opacity only)' : ''}`, async ({ browser, browserName }) => {
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

  test('a failed image becomes an "image unavailable" print at the same size', async ({ browser, browserName }) => {
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

  test('the print nearest the centre keeps the brackets and full brightness; the rest dim; the counter reads it; rects cached', async ({ browser, browserName }) => {
    const ctx = await context(browser, browserName, DESK, { init: [GBCR] });
    const page = await ctx.newPage();
    try {
      await cold(page, 'project-06');
      expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches), 'a fine pointer').toBe(true);
      await centrePrint(page, 3);
      await page.waitForFunction(() => document.querySelector('.roll')?.dataset.focus === '3', null, { timeout: 3000 });
      await page.waitForTimeout(400);
      const st = await page.evaluate(() => ({
        focus: document.querySelector('.print[data-focus]')?.id,
        dim: document.querySelector('.roll').hasAttribute('data-dim'),
        counter: document.querySelector('[data-print-count]').textContent,
        others: [...document.querySelectorAll('.print:not([data-focus])')].map((p) => [getComputedStyle(p).opacity, getComputedStyle(p.querySelector('.print__img')).filter]),
        self: [getComputedStyle(document.querySelector('.print[data-focus]')).opacity, getComputedStyle(document.querySelector('.print[data-focus] .print__img')).filter],
        af: (() => { const a = document.querySelector('.roll__af'), f = document.querySelector('#print-03'); const r = a.getBoundingClientRect(), q = f.getBoundingClientRect(); return { on: a.classList.contains('on'), dx: Math.abs(r.left - q.left), dy: Math.abs(r.top - q.top), dw: Math.abs(r.width - q.width), colour: getComputedStyle(a.querySelector('i')).borderTopColor, n: document.querySelectorAll('.roll__af').length }; })(),
      }));
      expect(st.focus).toBe('print-03');
      expect(st.dim).toBe(true);
      expect(st.counter).toBe('03 / 12');
      expect(st.self).toEqual(['1', 'none']);
      for (const [o, f] of st.others) { expect(o).toBe('0.55'); expect(f).toBe('saturate(0.4)'); }
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

  test('the centre line leads: a print the line crosses has focus; the last print takes it at the scroll end (12 / 12)', async ({ browser, browserName }) => {
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
      await cold(page, 'project-06');
      check(await sweep(), 'cold page');
      await home(page);
      await toFrame(page, 5);
      await page.keyboard.press('Enter');
      await untilState(page, 'open', 5);
      check(await sweep(), 'the open view');
      // a tall view: at the scroll end the centre line crosses print 11, and the last print still takes focus
      await page.setViewportSize({ width: 1440, height: 1800 });
      await cold(page, 'project-06');
      const tall = await sweep();
      expect(tall.out.at(-1).crossing, 'the case the end rule exists for').not.toContain(12);
      check(tall, 'cold page at 1440 x 1800');
    } finally {
      await ctx.close();
    }
  });

  test('no dim under 4 prints, nor on touch', async ({ browser, browserName }) => {
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

  test('a loop plays muted inline at 50% visible, pauses out of view and in a hidden tab, two at most; preload none', async ({ browser, browserName }) => {
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

  test('reduced motion: no inline play', async ({ browser, browserName }) => {
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
