// Overflow instrument (W-D030, budgets.md "Layout"): the maximum of scrollWidth - clientWidth over the whole run,
// sampled every 100 ms while the page scrolls top to bottom, plus an element scan for boxes past the right edge.
// The element scan gates the page as loaded; boxes the raised EVF puts past the edge (clipped by the fixed stage, so no
// page overflow) are reported as evfOffenders for the v2 queue (#106) and do not fail the run.
// Usage: npm run h:overflow -- [--profiles all|D1,P2] [--modes auto,reduced] [--routes /] [--out overflow.json]
import { MODES, PROFILES, cliMain, newContext, routeUrl, serve, sleep, waitSettled } from '../lib.mjs';

export async function measure(page) {
  await page.evaluate(() => {
    window.__ovf = { max: 0, samples: 0 };
    window.__ovfTimer = setInterval(() => {
      const de = document.documentElement;
      window.__ovf.max = Math.max(window.__ovf.max, de.scrollWidth - de.clientWidth);
      window.__ovf.samples++;
    }, 100);
  });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewportSize().height;
  for (let y = 0; y <= h; y += Math.round(vh * 0.8)) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await sleep(120);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(150);
  return page.evaluate(() => {
    clearInterval(window.__ovfTimer);
    const cw = document.documentElement.clientWidth;
    // A box inside a scroller or clipping ancestor that itself fits the viewport (a row that scrolls on purpose) is not page overflow.
    const clipped = (e) => {
      for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible' && a.getBoundingClientRect().right <= cw + 0.5) return true;
      }
      return false;
    };
    const offenders = [...document.querySelectorAll('body *')]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > cw + 0.5 && !e.closest('#rail') && getComputedStyle(e).position !== 'fixed' && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).transform === 'none' && !clipped(e);
      })
      .slice(0, 8)
      .map((e) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}.${String(e.className).slice(0, 40)} right=${Math.round(e.getBoundingClientRect().right)} cw=${cw}`);
    return { maxOverflowPx: window.__ovf.max, samples: window.__ovf.samples, offenders };
  });
}

export async function run(opts = {}) {
  const profiles = !opts.profiles || opts.profiles === 'all' ? Object.keys(PROFILES) : String(opts.profiles).split(',');
  const modes = String(opts.modes || MODES.join(',')).split(',');
  const routes = String(opts.routes || '/,/404.html').split(',');
  const srv = await serve();
  const rows = [];
  try {
    for (const profile of profiles) {
      for (const mode of modes) {
        if (PROFILES[profile].only && !PROFILES[profile].only.includes(mode)) continue;
        for (const route of routes) {
          const ctx = await newContext(profile, mode);
          const page = await ctx.newPage();
          await page.goto(routeUrl(srv.base, route, mode), { waitUntil: 'load' });
          await waitSettled(page, 10000);
          let m = await measure(page);
          if (route === '/') {
            // Raise into the viewfinder with the page's own input, then measure the EVF state too.
            await page.keyboard.press('Enter');
            await sleep(2500);
            const m2 = await measure(page);
            m = { maxOverflowPx: Math.max(m.maxOverflowPx, m2.maxOverflowPx), samples: m.samples + m2.samples, offenders: m.offenders, evfOffenders: m2.offenders };
          }
          rows.push({ profile, mode, route, ...m, pass: m.maxOverflowPx === 0 && m.offenders.length === 0 });
          await ctx.close();
        }
      }
    }
  } finally {
    await srv.close();
  }
  const bad = rows.filter((r) => !r.pass);
  return { schema: 1, instrument: 'overflow', pass: bad.length === 0, rows, summary: `${rows.length} runs over ${profiles.length} profiles x ${modes.length} modes; max overflow ${Math.max(0, ...rows.map((r) => r.maxOverflowPx))} px; ${bad.length} failing` };
}

await cliMain(import.meta.url, run);
