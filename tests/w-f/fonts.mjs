// W-F fonts acceptance: swap shift <= 2 px at D2 and P2. Each route is laid out twice: with the font files blocked
// (the metric-matched fallbacks only) and with the fonts loaded; the tops of every section heading and landmark are
// compared. The largest move is the swap shift.
// Usage: node tests/w-f/fonts.mjs [--out fonts.json]
import { cliMain, newContext, serve, waitSettled } from '../harness/lib.mjs';

const MARKERS = ['h1', '#work', '#sheet', '#honours', '#door', '#contact', '.site-footer'];

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
    return { tops, loaded: [...new Set(loaded)] };
  }, MARKERS);
  await ctx.close();
  return out;
}

export async function run() {
  const srv = await serve();
  const rows = [];
  try {
    for (const profile of ['D2', 'P2']) {
      for (const route of ['/', '/work/project-01/']) {
        const fallback = await layout(srv.base, profile, route, true);
        const web = await layout(srv.base, profile, route, false);
        const deltas = Object.fromEntries(Object.keys(web.tops).map((k) => [k, Math.round(Math.abs(web.tops[k] - (fallback.tops[k] ?? web.tops[k])) * 100) / 100]));
        const maxShiftPx = Math.max(0, ...Object.values(deltas));
        rows.push({ profile, route, fontsLoaded: web.loaded, fallbackLoaded: fallback.loaded, deltas, maxShiftPx, pass: maxShiftPx <= 2 && web.loaded.length >= 2 });
      }
    }
  } finally {
    await srv.close();
  }
  return { schema: 1, suite: 'w-f/fonts', pass: rows.every((r) => r.pass), rows, summary: rows.map((r) => `${r.profile} ${r.route}: max swap shift ${r.maxShiftPx} px`).join(', ') };
}

await cliMain(import.meta.url, run);
