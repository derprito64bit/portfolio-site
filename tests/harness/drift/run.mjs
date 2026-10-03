// Drift instrument (W-D013, W-D030): is GL glued to its DOM slot while the page moves fast?
// Ported from the w-scroll Wave 1b drift harness after a read. On /bench/?debug=drift each fixture slot has a 3 px DOM
// bar rgb(0, 255, 20i) on top and a GL quad rgb(255, 0, 20i) of exactly the slot's size underneath. On every presented
// frame, for every fully visible slot: drift = GL bottom edge - (DOM bar top + slot height), in CSS px. 0 = glued.
//   Chromium: CDP screencast frames (what the compositor presented) during a dispatched touch fling.
//   WebKit:   Playwright has no touch gestures for WebKit, so the fling is a smooth programmatic scroll on a touch
//             (coarse pointer) context, and frames are page screenshots taken through it.
// Mid-fling the viewport loses 80 px of height (a toolbar collapse). On a coarse pointer that must not reallocate the
// canvas buffer (__stage.stats.reallocs unchanged).
// Usage: npm run h:drift -- [--browsers chromium,webkit] [--out drift.json]
import sharp from 'sharp';
import { browser, cliMain, serve, sleep, waitSettled } from '../lib.mjs';

const VIEW = { width: 390, height: 844 };

export async function decode(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Per frame and per visible slot index: drift of the GL bottom edge against the DOM slot, in CSS px. */
export function analyse(frame, slotHeights, scale) {
  const { data, w, h } = frame;
  const acc = new Map();
  const near = (v, t) => Math.abs(v - t) <= 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x += 2) {
      const o = (y * w + x) * 3;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      const isBar = near(r, 0) && near(g, 255) && b % 20 <= 2;
      const isGl = near(r, 255) && near(g, 0) && b % 20 <= 2;
      if (!isBar && !isGl) continue;
      const idx = Math.round(b / 20);
      if (!slotHeights[idx]) continue;
      const a = acc.get(idx) ?? { barTop: Infinity, barX0: Infinity, barX1: -1, gl: [] };
      if (isBar) {
        a.barTop = Math.min(a.barTop, y);
        a.barX0 = Math.min(a.barX0, x);
        a.barX1 = Math.max(a.barX1, x);
      } else a.gl.push([x, y]);
      acc.set(idx, a);
    }
  }
  const out = [];
  for (const [idx, a] of acc) {
    if (!Number.isFinite(a.barTop)) continue;
    const hDev = slotHeights[idx] * scale;
    if (a.barTop < 4 || a.barTop + hDev > h - 4) continue; // only fully visible slots
    const x0 = a.barX0 + 4 * scale;
    const x1 = a.barX1 - 4 * scale;
    let gBottom = -1;
    let gTop = Infinity;
    for (const [x, y] of a.gl) {
      if (x < x0 || x > x1) continue;
      if (y > gBottom) gBottom = y;
      if (y < gTop) gTop = y;
    }
    if (gBottom < 0) {
      out.push({ idx, drift: null, note: 'no GL under the slot' });
      continue;
    }
    // Glued: the GL bottom edge meets the slot bottom. Clipped: the GL starts under the bar but stops early at the
    // canvas edge (overscan ran out); that is coverage, reported apart from misplacement. Anything else is shifted.
    const bottomErr = (gBottom + 1 - (a.barTop + hDev)) / scale;
    const topUnderBar = gTop >= a.barTop - scale && gTop <= a.barTop + 4 * scale;
    if (Math.abs(bottomErr) < 0.5) out.push({ idx, drift: 0, cls: 'glued' });
    else if (topUnderBar && bottomErr < 0) out.push({ idx, drift: 0, cls: 'clipped', clipPx: Number((-bottomErr).toFixed(1)) });
    else out.push({ idx, drift: Number(bottomErr.toFixed(2)), cls: 'shifted', gTop, barTop: a.barTop });
  }
  return out;
}

async function scenario(name, base, dumpDir) {
  const b = await browser(name);
  const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 1, hasTouch: true, isMobile: name === 'chromium' });
  const page = await ctx.newPage();
  await page.goto(`${base}/bench/?debug=drift&tier=lite`, { waitUntil: 'load' });
  await waitSettled(page, 15000);
  await page.waitForFunction(() => window.__stage.glState === 'ready', null, { polling: 100, timeout: 15000 });
  const slotHeights = await page.evaluate(() => Object.fromEntries(window.__stage.slots().filter((s) => s.fixture === 'quad').map((s) => [Number(document.querySelector(`[data-gl-id="${s.id}"]`).dataset.glIndex), s.h])));
  const before = await page.evaluate(() => ({ reallocs: window.__stage.stats.reallocs, coarse: matchMedia('(pointer: coarse)').matches, tier: window.__stage.tier }));
  const frames = [];
  let resized = false;
  if (name === 'chromium') {
    const cdp = await ctx.newCDPSession(page);
    cdp.on('Page.screencastFrame', (f) => {
      frames.push(Buffer.from(f.data, 'base64'));
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
    });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    const drag = async (from, step) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: from }] });
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: from + i * step }] });
        await sleep(8);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    for (let pass = 0; pass < 2; pass++) {
      await drag(760, -50);
      await sleep(150);
      if (!resized) {
        await page.setViewportSize({ width: VIEW.width, height: VIEW.height - 80 });
        resized = true;
      }
      await sleep(900);
      await drag(120, 50);
      await sleep(900);
    }
    await cdp.send('Page.stopScreencast');
  } else {
    // WebKit snapshots are not presented frames, and WebKit's Windows build can present a moved canvas with its
    // previous buffer until the next draw (measured: the stage re-presents for 3 frames after a re-anchor for this).
    // Each capture waits two frame boundaries (a frame, then a task, twice), so it sees what WebKit settles on.
    const frameBoundary = () => page.evaluate(() => new Promise((r) => window.requestAnimationFrame(() => setTimeout(() => window.requestAnimationFrame(() => setTimeout(r, 0)), 0))));
    // The fling as its per-frame displacements: 24 steps decaying from 240 px (about 2000 px in all), down then up,
    // with the 80 px height change after the 6th step.
    const steps = Array.from({ length: 24 }, (_, k) => Math.round(240 * 0.89 ** k));
    for (const dir of [1, -1]) {
      for (let k = 0; k < steps.length; k++) {
        await page.evaluate((dy) => window.scrollBy(0, dy), dir * steps[k]);
        if (!resized && k === 6) {
          await page.setViewportSize({ width: VIEW.width, height: VIEW.height - 80 });
          resized = true;
        }
        await frameBoundary();
        frames.push(await page.screenshot());
      }
    }
  }
  await sleep(300);
  const after = await page.evaluate(() => ({ reallocs: window.__stage.stats.reallocs, renders: window.__stage.stats.draws }));
  const samples = [];
  let worst = null;
  for (let i = 0; i < frames.length; i++) {
    const f = await decode(frames[i]);
    for (const s of analyse(f, slotHeights, f.w / VIEW.width)) {
      samples.push({ ...s, frame: i });
      if (s.drift !== null && (!worst || Math.abs(s.drift) > Math.abs(worst.drift))) worst = { ...s, frame: i };
    }
  }
  if (dumpDir && worst) await sharp(frames[worst.frame]).toFile(`${dumpDir}/drift-${name}-worst.png`);
  await ctx.close();
  const measured = samples.filter((s) => s.drift !== null);
  const maxDriftPx = measured.length ? Math.max(...measured.map((s) => Math.abs(s.drift))) : null;
  const missing = samples.filter((s) => s.drift === null).length;
  const reallocOnHeight = after.reallocs - before.reallocs;
  const histogram = {};
  for (const s of measured) histogram[s.drift] = (histogram[s.drift] || 0) + 1;
  const clipped = measured.filter((s) => s.cls === 'clipped');
  const maxClipPx = clipped.length ? Math.max(...clipped.map((s) => s.clipPx)) : 0;
  return {
    browser: name, input: name === 'chromium' ? 'touch fling (CDP touch events), screencast frames' : 'fling as 24 decaying per-frame scroll steps on a touch context, captured at frame boundaries', toolbarChangePx: 80,
    frames: frames.length, samples: measured.length, maxDriftPx, clippedSamples: clipped.length, maxClipPx, missing, reallocOnHeight, coarse: before.coarse, tier: before.tier, histogram, worst,
    pass: measured.length > 0 && maxDriftPx < 0.5 && missing === 0 && reallocOnHeight === 0,
  };
}

export async function run(opts = {}) {
  const browsers = String(opts.browsers || 'chromium,webkit').split(',');
  const srv = await serve();
  const rows = [];
  try {
    for (const name of browsers) rows.push(await scenario(name, srv.base, opts.dump));
  } finally {
    await srv.close();
  }
  return { schema: 1, instrument: 'drift', pass: rows.every((r) => r.pass), rows, summary: rows.map((r) => `${r.browser}: ${r.samples} samples over ${r.frames} frames, max drift ${r.maxDriftPx} px, reallocs on height change ${r.reallocOnHeight}`).join(' | ') };
}

await cliMain(import.meta.url, run);
