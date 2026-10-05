// W-F fonts acceptance: swap shift <= 2 px at D2 and P2. Each route is laid out twice: with the font files blocked
// (the metric-matched fallbacks only) and with the fonts loaded; the tops of every section heading and landmark are
// compared. The largest move is the swap shift.
// The site header (#59 item 2) is held tighter: every nav link's box and the mark's with its brackets (left, top,
// width, height) must be the same in both layouts to a quarter of a CSS pixel, so nothing in the header moves when its
// face arrives; and a load with every font held back 600 ms must record no layout shift whose source sits in the
// header (CLS 0 from it; Chromium, which has the Layout Instability API). The nav boxes are checked in Chromium and WebKit; the WebKit row reports the section
// markers without gating them (#11's swap-shift line is D2 and P2).
// Usage: node tests/w-f/fonts.mjs [--out fonts.json] [--dist <dir>]
import { join, resolve } from 'node:path';
import { ROOT, cliMain, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';

const MARKERS = ['h1', '#work', '#sheet', '#honours', '#contact', '.site-footer'];
/** A nav box that moves less than this between faces is sub-pixel noise (layout units are 1/64 px). */
const NAV_TOLERANCE_PX = 0.25;

async function layout(base, profile, route, block) {
  const ctx = await newContext(profile);
  if (block) await ctx.route('**/fonts/*.woff2', (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(base + route, { waitUntil: 'load' });
  await waitSettled(page, 12000);
  const out = await page.evaluate(async (sel) => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family);
    const tops = {};
    for (const s of sel) {
      const el = document.querySelector(s);
      if (el) tops[s] = Math.round((el.getBoundingClientRect().top + scrollY) * 100) / 100;
    }
    // The header's text boxes: every nav link, and the mark with its brackets where the page shows it.
    const nav = [...document.querySelectorAll('nav[aria-label="Site"] a, .site-mark, .site-mark .br')].map((a, i) => {
      const r = a.getBoundingClientRect();
      return { name: `${a.className || a.tagName.toLowerCase()}:${a.textContent.trim()}#${i}`, font: getComputedStyle(a).fontFamily, left: r.left, top: r.top + scrollY, width: r.width, height: r.height };
    }).filter((b) => b.width > 0 || b.height > 0);
    return { tops, nav, loaded: [...new Set(loaded)] };
  }, MARKERS);
  await ctx.close();
  return out;
}

/** Layout shifts while every font file is held back: total, and those with a source inside the nav. */
const SHIFTS = `(() => {
  window.__shifts = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (e.hadRecentInput) continue;
        window.__shifts.push({ value: e.value, t: e.startTime, sources: (e.sources || []).map((s) => ({ nav: Boolean(s.node && s.node.closest && s.node.closest('.site-header')), node: s.node ? (s.node.nodeName + (s.node.className ? '.' + String(s.node.className).split(' ')[0] : '')) : null, dx: s.currentRect.x - s.previousRect.x, dy: s.currentRect.y - s.previousRect.y })) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch (e) {}
})();`;
async function lateFonts(base, profile, route) {
  const ctx = await newContext(profile);
  await ctx.addInitScript({ content: SHIFTS });
  await ctx.route('**/fonts/*.woff2', async (r) => {
    await sleep(600);
    await r.continue();
  });
  const page = await ctx.newPage();
  await page.goto(base + route, { waitUntil: 'load' });
  await waitSettled(page, 12000);
  await page.evaluate(() => document.fonts.ready);
  await sleep(300);
  const shifts = await page.evaluate(() => window.__shifts);
  await ctx.close();
  const supported = profile.startsWith('WK') ? null : true; // WebKit has no Layout Instability API
  const nav = shifts.filter((s) => s.sources.some((x) => x.nav));
  return { supported, total: Math.round(shifts.reduce((a, s) => a + s.value, 0) * 1e6) / 1e6, navShifts: nav, shifts };
}

export async function run(opts = {}) {
  const srv = await serve(opts.dist ? resolve(String(opts.dist)) : join(ROOT, 'dist'));
  const rows = [];
  try {
    for (const profile of ['D2', 'P2', 'WK-P2']) {
      for (const route of ['/', '/work/project-01/']) {
        const fallback = await layout(srv.base, profile, route, true);
        const web = await layout(srv.base, profile, route, false);
        const deltas = Object.fromEntries(Object.keys(web.tops).map((k) => [k, Math.round(Math.abs(web.tops[k] - (fallback.tops[k] ?? web.tops[k])) * 100) / 100]));
        const maxShiftPx = Math.max(0, ...Object.values(deltas));
        const nav = web.nav.map((w, i) => {
          const f = fallback.nav[i] ?? {};
          const d = (k) => Math.round(Math.abs(w[k] - (f[k] ?? NaN)) * 1000) / 1000;
          return { name: w.name, fontWeb: w.font, fontFallback: f.font, dLeft: d('left'), dTop: d('top'), dWidth: d('width'), dHeight: d('height') };
        });
        const webkit = profile.startsWith('WK');
        // Playwright's WebKit on Windows resolves local("Arial") but not local("Arial Bold") or "Arial-BoldMT" (no bold
        // Arial face shows in its loaded fallbacks), so there the mark falls to system-ui: reported, gated in Chromium.
        const gated = nav.filter((n) => !webkit || n.name.startsWith('a:'));
        const navMaxPx = Math.max(0, ...gated.flatMap((n) => [n.dLeft, n.dTop, n.dWidth, n.dHeight].map((v) => (Number.isFinite(v) ? v : Infinity))));
        const late = webkit ? null : await lateFonts(srv.base, profile, route);
        // #11's swap-shift line is D2 and P2 (Chromium); the WebKit row gates the nav only and reports the rest.
        rows.push({
          profile, route, fontsLoaded: web.loaded, fallbackLoaded: fallback.loaded, deltas, maxShiftPx, markersGated: !webkit, nav, navMaxPx, late,
          pass: (webkit || maxShiftPx <= 2) && web.loaded.length >= 2 && nav.length > 0 && navMaxPx <= NAV_TOLERANCE_PX && (!late || late.navShifts.length === 0),
        });
      }
    }
  } finally {
    await srv.close();
  }
  return { schema: 1, suite: 'w-f/fonts', dist: opts.dist ?? 'dist', navTolerancePx: NAV_TOLERANCE_PX, pass: rows.every((r) => r.pass), rows, summary: rows.map((r) => `${r.profile} ${r.route}: max swap shift ${r.maxShiftPx} px, nav ${r.navMaxPx} px${r.late ? `, late-font CLS ${r.late.total} (nav ${r.late.navShifts.length})` : ''}`).join(', ') };
}

await cliMain(import.meta.url, run);
