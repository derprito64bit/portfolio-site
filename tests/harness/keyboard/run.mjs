// Keyboard instrument (W-D015, W-D032, W-V0a on the Viewfinder).
//  walk       Tab through a page; at every stop, at least site.focusRing.coverageMinPct of the focus-ring band
//             (outline-offset to offset + width outside the border box) differs from the unfocused frame by at least
//             site.focusRing.contrastMin:1 (WCAG contrast of the two colours); both from the json budgets block.
//  flow       / : walk the intro, raise with Enter, walk the EVF, open a project with Enter, Tab stays inside the dialog,
//             Escape closes it and focus returns to the EVF. The 404 page is walked too.
// Usage: npm run h:keyboard -- [--profiles D2,P2] [--dist <dir>] [--out keyboard.json]
import sharp from 'sharp';
import { budget, cliMain, newContext, serve, sleep, waitSettled } from '../lib.mjs';

/** budgets.md: focus ring >= 3:1 with >= 90% ring coverage at every Tab stop (the json budgets block). */
const RING_CONTRAST = budget('site.focusRing.contrastMin');
const RING_COVERAGE = budget('site.focusRing.coverageMinPct') / 100;

/** Changed device pixels at the ring contrast that count as a custom focus indicator. */
const CUSTOM_MIN_PX = 12;
const lin = (c) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const [x, y] = [a, b].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

async function raw(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Ring coverage for the focused element: compare focused and unfocused shots of the band around it. */
export async function ringCoverage(page) {
  const info = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: r.left, y: r.top, w: r.width, h: r.height, offset: parseFloat(cs.outlineOffset) || 0, width: parseFloat(cs.outlineWidth) || 0, style: cs.outlineStyle, tag: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50), id: el.dataset?.glId || el.id || '' };
  });
  if (!info) return null;
  const vp = page.viewportSize();
  const pad = Math.ceil(info.offset + info.width + 4);
  const clip = { x: Math.max(0, Math.floor(info.x - pad)), y: Math.max(0, Math.floor(info.y - pad)), width: 0, height: 0 };
  clip.width = Math.min(vp.width - clip.x, Math.ceil(info.w + pad * 2));
  clip.height = Math.min(vp.height - clip.y, Math.ceil(info.h + pad * 2));
  if (clip.width < 4 || clip.height < 4) return { ...info, coverage: null, note: 'off screen' };
  const focused = await raw(await page.screenshot({ clip }));
  await page.evaluate(() => { window.__kbEl = document.activeElement; window.__kbEl.blur(); });
  await sleep(60);
  const plain = await raw(await page.screenshot({ clip }));
  await page.evaluate(() => window.__kbEl.focus({ preventScroll: true }));
  await sleep(30);
  // An element that draws its own indicator instead of an outline (the Raise button turns its corner brackets amber):
  // it passes when changed pixels reach the ring contrast; the ring-band coverage does not apply to it.
  if (info.style === 'none' || info.width === 0) {
    let changed = 0;
    for (let i = 0; i < focused.data.length; i += 3) {
      if (contrast(lum(focused.data[i], focused.data[i + 1], focused.data[i + 2]), lum(plain.data[i], plain.data[i + 1], plain.data[i + 2])) >= RING_CONTRAST) changed++;
    }
    return { ...info, band: 0, coverage: null, custom: changed, note: changed >= CUSTOM_MIN_PX ? 'custom indicator' : 'no focus indicator' };
  }
  // Device pixels: the border box snapped the way the browser paints it, and the band measured at pixel centres, so
  // anti-aliased edge pixels never count against the ring.
  const dpr = focused.w / clip.width;
  const inner = {
    x0: Math.round(info.x * dpr) - clip.x * dpr,
    y0: Math.round(info.y * dpr) - clip.y * dpr,
    x1: Math.round((info.x + info.w) * dpr) - clip.x * dpr,
    y1: Math.round((info.y + info.h) * dpr) - clip.y * dpr,
  };
  // Browsers snap the outline rect to device pixels in their own way (up to 1 device px either side of a rounded
  // rect, measured); one device pixel is left out at each edge of the band so the snap never decides the verdict.
  const edge = Math.max(1, Math.ceil(dpr / 2));
  const a = info.offset * dpr + edge;
  const b = (info.offset + info.width) * dpr - edge;
  let band = 0;
  let good = 0;
  const misses = {};
  for (let y = 0; y < focused.h; y++) {
    for (let x = 0; x < focused.w; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const dx = Math.max(inner.x0 - cx, 0, cx - inner.x1);
      const dy = Math.max(inner.y0 - cy, 0, cy - inner.y1);
      const d = Math.max(dx, dy);
      if (d <= a || d >= b) continue;
      band++;
      const i = (y * focused.w + x) * 3;
      const c = contrast(lum(focused.data[i], focused.data[i + 1], focused.data[i + 2]), lum(plain.data[i], plain.data[i + 1], plain.data[i + 2]));
      if (c >= RING_CONTRAST) good++;
      else {
        const side = dy > dx ? (cy < inner.y0 ? 'top' : 'bottom') : cx < inner.x0 ? 'left' : 'right';
        misses[`${side}@${Math.floor(d)}`] = (misses[`${side}@${Math.floor(d)}`] || 0) + 1;
      }
    }
  }
  return { ...info, band, coverage: band ? good / band : null, misses };
}

export async function walk(page, maxStops = 40) {
  const stops = [];
  await page.keyboard.press('Tab');
  for (let i = 0; i < maxStops; i++) {
    await sleep(80);
    const r = await ringCoverage(page);
    if (!r) break;
    stops.push({ ...r, pass: r.coverage === null ? r.note === 'off screen' || r.note === 'custom indicator' : r.coverage >= RING_COVERAGE });
    const before = await page.evaluate(() => document.activeElement);
    await page.keyboard.press('Tab');
    const same = await page.evaluate((b) => document.activeElement === b, before);
    if (same) break;
  }
  return stops;
}

const focusInfo = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return { tag: el?.tagName ?? null, inProj: Boolean(el?.closest('#proj')), inEvf: Boolean(el?.closest('#evf')), inIntro: Boolean(el?.closest('#intro')) };
});

const summarise = (w) => ({ stops: w.length, failing: w.filter((x) => !x.pass), minCoverage: Math.min(...w.filter((x) => x.coverage !== null).map((x) => x.coverage)), detail: w });

/** Walk the intro, raise with the keyboard, walk the EVF, open a project, check the trap, close, check focus returns. */
async function viewfinder(page, base) {
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await waitSettled(page, 15000);
  const intro = await walk(page);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press('Enter');
  await sleep(2600);
  const raised = await page.evaluate(() => document.getElementById('evf')?.classList.contains('is-on') && !document.getElementById('evf').inert);
  await page.evaluate(() => document.getElementById('evf').focus());
  const evf = await walk(page);
  // Open the current frame with Enter on the Open control, then Tab around: focus must stay inside the dialog.
  await page.focus('[data-open]');
  await page.keyboard.press('Enter');
  await sleep(2600);
  const open = await focusInfo(page);
  const trapped = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    trapped.push((await focusInfo(page)).inProj);
  }
  await page.keyboard.press('Escape');
  await sleep(1800);
  const back = await focusInfo(page);
  const closed = await page.evaluate(() => document.getElementById('proj')?.hidden === true);
  const result = {
    intro: summarise(intro), evf: summarise(evf), raised: Boolean(raised),
    openFocusInDialog: open.inProj, trapped: trapped.every(Boolean), closed, focusAfterClose: back,
  };
  result.pass = result.raised && result.intro.stops > 0 && result.intro.failing.length === 0 && result.evf.stops > 0 && result.evf.failing.length === 0
    && result.openFocusInDialog && result.trapped && result.closed && back.inEvf;
  return result;
}

export async function run(opts = {}) {
  const profiles = String(opts.profiles || 'D2,P2').split(',');
  const srv = await serve(opts.dist ? String(opts.dist) : undefined);
  const rows = [];
  try {
    for (const profile of profiles) {
      const ctx = await newContext(profile);
      const page = await ctx.newPage();
      const vf = await viewfinder(page, srv.base);
      await page.goto(`${srv.base}/404.html`, { waitUntil: 'load' });
      const nf = await walk(page);
      await ctx.close();
      rows.push({ profile, viewfinder: vf, notFound: { stops: nf.length, failing: nf.filter((x) => !x.pass) }, pass: vf.pass && nf.length > 0 && nf.every((x) => x.pass) });
    }
  } finally {
    await srv.close();
  }
  return {
    schema: 2, instrument: 'keyboard', pass: rows.every((r) => r.pass), rows,
    summary: rows.map((r) => `${r.profile}: intro ${r.viewfinder.intro.stops} stops, EVF ${r.viewfinder.evf.stops} stops, min ring ${(Math.min(r.viewfinder.intro.minCoverage, r.viewfinder.evf.minCoverage) * 100).toFixed(1)}%; dialog focus ${r.viewfinder.openFocusInDialog && r.viewfinder.trapped}; returns ${r.viewfinder.focusAfterClose.inEvf}; 404 ${r.notFound.stops} stops`).join(' | '),
  };
}

await cliMain(import.meta.url, run);
