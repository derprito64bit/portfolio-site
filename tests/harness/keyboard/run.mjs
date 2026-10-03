// Keyboard instrument (W-D015, W-D032).
//  walk       Tab through a route; at every stop, >= 90% of the focus-ring band (outline-offset to offset + width
//             outside the border box) differs from the unfocused frame by >= 3:1 (WCAG contrast of the two colours).
//             On /bench/?debug=ring the fixture quads draw GL 12 px past their slots, so the band sits over GL.
//  roundtrip  sheet -> project -> Back leaves focus on the same print link, and the next Tab reaches the next print.
//  hash       a cross-page hash visit (/work/project-01/ -> 'The Manor', /#door) focuses the target.
//  anchor     an anchor scroll moves one way only (no double scroll).
// Usage: npm run h:keyboard -- [--profiles D2,P2] [--routes /,/bench/?debug=ring] [--out keyboard.json]
import sharp from 'sharp';
import { cliMain, newContext, serve, sleep, waitSettled } from '../lib.mjs';

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
      if (c >= 3) good++;
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
    stops.push({ ...r, pass: r.coverage === null ? r.note === 'off screen' : r.coverage >= 0.9 });
    const before = await page.evaluate(() => document.activeElement);
    await page.keyboard.press('Tab');
    const same = await page.evaluate((b) => document.activeElement === b, before);
    if (same) break;
  }
  return stops;
}

const visitEnd = (page, path) => page.waitForFunction((p) => location.pathname === p && !document.documentElement.hasAttribute('aria-busy'), path, { polling: 50, timeout: 10000 });

async function roundtrip(page, base) {
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await waitSettled(page, 12000);
  // Tab to the third print on the sheet with the keyboard only.
  let id = null;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    id = await page.evaluate(() => (document.activeElement?.closest('#sheet ~ ol') ? document.activeElement.dataset.glId : null));
    if (id === 'project-03') break;
  }
  await page.keyboard.press('Enter');
  await visitEnd(page, '/work/project-03/');
  await waitSettled(page, 8000);
  await page.goBack();
  await visitEnd(page, '/');
  await sleep(250);
  const back = await page.evaluate(() => ({ id: document.activeElement?.dataset?.glId ?? null, tag: document.activeElement?.tagName }));
  await page.keyboard.press('Tab');
  const next = await page.evaluate(() => document.activeElement?.dataset?.glId ?? null);
  return { started: id, afterBack: back, nextTab: next, pass: id === 'project-03' && back.id === 'project-03' && next === 'project-04' };
}

async function hashVisit(page, base) {
  await page.goto(`${base}/work/project-01/`, { waitUntil: 'load' });
  await waitSettled(page, 12000);
  await page.click('nav[aria-label="Site"] a[href="/#door"]');
  await visitEnd(page, '/');
  await sleep(300);
  const focus = await page.evaluate(() => ({ id: document.activeElement?.id ?? null, tag: document.activeElement?.tagName }));
  return { focus, pass: focus.id === 'door' };
}

async function anchorMonotonic(page, base) {
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await waitSettled(page, 12000);
  await page.evaluate(() => {
    window.__ys = [];
    window.__yt = setInterval(() => window.__ys.push(window.scrollY), 8);
  });
  await page.click('nav[aria-label="Site"] a[href="/#door"]');
  await sleep(1600);
  const ys = await page.evaluate(() => { clearInterval(window.__yt); return window.__ys; });
  let monotonic = true;
  for (let i = 1; i < ys.length; i++) if (ys[i] < ys[i - 1]) monotonic = false;
  const focus = await page.evaluate(() => document.activeElement?.id ?? null);
  return { samples: ys.length, first: ys[0], last: ys[ys.length - 1], monotonic, focus, pass: monotonic && ys[ys.length - 1] > ys[0] && focus === 'door' };
}

export async function run(opts = {}) {
  const profiles = String(opts.profiles || 'D2,P2').split(',');
  const routes = String(opts.routes || '/,/bench/?debug=ring').split(',');
  const srv = await serve();
  const rows = [];
  try {
    for (const profile of profiles) {
      const walks = [];
      for (const route of routes) {
        const ctx = await newContext(profile);
        const page = await ctx.newPage();
        await page.goto(srv.base + route, { waitUntil: 'load' });
        await waitSettled(page, 15000);
        const stops = await walk(page);
        walks.push({ route, stops: stops.length, failing: stops.filter((s) => !s.pass), minCoverage: Math.min(...stops.filter((s) => s.coverage !== null).map((s) => s.coverage)), detail: stops });
        await ctx.close();
      }
      const ctx = await newContext(profile);
      const page = await ctx.newPage();
      const rt = await roundtrip(page, srv.base);
      const hv = await hashVisit(page, srv.base);
      const an = await anchorMonotonic(page, srv.base);
      await ctx.close();
      rows.push({ profile, walks, roundtrip: rt, hash: hv, anchor: an, pass: walks.every((w) => w.failing.length === 0 && w.stops > 0) && rt.pass && hv.pass && an.pass });
    }
  } finally {
    await srv.close();
  }
  return {
    schema: 1, instrument: 'keyboard', pass: rows.every((r) => r.pass), rows,
    summary: rows.map((r) => `${r.profile}: ${r.walks.map((w) => `${w.route} ${w.stops} stops, min ring ${(w.minCoverage * 100).toFixed(1)}%`).join(', ')}; round trip ${r.roundtrip.pass}; hash ${r.hash.pass}; anchor ${r.anchor.pass}`).join(' | '),
  };
}

await cliMain(import.meta.url, run);
