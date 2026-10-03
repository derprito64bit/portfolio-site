// Drift instrument (W-D013, W-D030): is GL glued to its DOM slot while the page moves fast, and in the very frame where
// a viewport height change moves the layout?
// Ported from the w-scroll Wave 1b drift harness after a read. On /bench/?debug=drift each fixture slot has a 3 px DOM
// bar rgb(0, 255, 20i) on top and a GL quad rgb(255, 0, 20i) of exactly the slot's size underneath. On every presented
// frame, for every fully visible slot, both edges are measured in CSS px:
//   top error    = first GL row under the bar - (bar top + 3 px)      (> 0: GL starts late)
//   bottom error = GL bottom edge - (bar top + slot height)           (< 0: GL stops early)
// Both within 0.5 px: glued. One edge glued and GL missing at the other: clipped at that edge (the canvas edge cut it,
// so coverage, not position; reported per edge as clipTopPx and clipBottomPx). Anything else: shifted (drift).
//   Chromium: CDP screencast frames (what the compositor presented) during dispatched touch flings, including
//             reversals: a drag against a running fling, where a canvas with no slack behind it would open a top gap.
//   WebKit:   Playwright has no touch gestures for WebKit, so the fling is a smooth programmatic scroll on a touch
//             (coarse pointer) context, and frames are page screenshots taken through it.
// The toolbar: mid-fling the viewport loses 80 px of height and later gets it back, each time while a quad is fully in
// view. Playwright's emulated change also moves svh and lvh, so the 50svh row above the quads moves every quad 40 px in
// the document (a layout shift, unlike a real toolbar; the shift is reported per resize as slotMovePx). The 50svh row
// stays on purpose: it is the layout-shift case. Three checks:
//   1. the frame at the resize (Chromium): the first well-formed screencast frame at the new size must be glued, in at
//      least 2 resizes per run. Frames whose decoded size matches neither viewport at the capture scale (a surface
//      caught mid-resize) are skipped and listed by index; more than one per resize, or any outside a resize, fails;
//   2. the resize probe (every resize, both engines): a ResizeObserver created after the stage's runs right after the
//      stage's callback in the frame where layout changed, before paint, and reads where GL drew each fully visible
//      quad (readPixels on the not yet composited buffer) against the quad's DOM box. GL must already be there. The
//      screencast keeps about 1 frame in 3 at 238 Hz, so this is the check that sees every frame at a resize;
//   3. on a coarse pointer the height change must not reallocate the canvas buffer (__stage.stats.reallocs).
// Re-anchors are reported by scroll step (review item 4: the rail re-anchors on every frame above about 53 px per frame
// at 390 x 844).
// Usage: npm run h:drift -- [--browsers chromium,webkit] [--repeat N] [--out drift.json] [--dump dir]
//                           [--dist dir] [--plant defer-ro]
//   --repeat N  runs the Chromium scenario N times (the WebKit scenario is programmatic and runs once); the summary
//               reports the worst run. --plant defer-ro is the negative control: every ResizeObserver callback waits
//               for the next task, so the stage re-measures after the frame is painted (the pre-fix behaviour).
import { resolve } from 'node:path';
import sharp from 'sharp';
import { browser, cliMain, serve, sleep, waitSettled } from '../lib.mjs';

const VIEW = { width: 390, height: 844 };
const TOOLBAR = 80;
const BAR = 3;

export async function decode(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** Per frame and per visible slot index: both GL edges against the DOM slot, in CSS px. */
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
    const topErr = Number(((gTop - (a.barTop + BAR * scale)) / scale).toFixed(2));
    const bottomErr = Number(((gBottom + 1 - (a.barTop + hDev)) / scale).toFixed(2));
    const topOk = Math.abs(topErr) < 0.5;
    const bottomOk = Math.abs(bottomErr) < 0.5;
    if (topOk && bottomOk) out.push({ idx, drift: 0, cls: 'glued', topErr, bottomErr });
    else if (bottomOk && topErr > 0) out.push({ idx, drift: 0, cls: 'clipped', edge: 'top', clipTopPx: topErr, topErr, bottomErr });
    else if (topOk && bottomErr < 0) out.push({ idx, drift: 0, cls: 'clipped', edge: 'bottom', clipBottomPx: -bottomErr, topErr, bottomErr });
    else out.push({ idx, drift: Math.abs(topErr) > Math.abs(bottomErr) ? topErr : bottomErr, cls: 'shifted', topErr, bottomErr, gTop, barTop: a.barTop });
  }
  return out;
}

/** Which viewport a frame shows: 'pre' or 'post' when its decoded size is that viewport at the capture scale. */
export function sizeClass(w, h, preH, postH, scale) {
  const is = (vw, vh) => Math.abs(w - Math.round(vw * scale)) <= 1 && Math.abs(h - Math.round(vh * scale)) <= 1;
  if (is(VIEW.width, postH)) return 'post';
  if (is(VIEW.width, preH)) return 'pre';
  return 'malformed';
}

/** The planted defect (negative control): ResizeObserver callbacks run a task late, after the frame is painted. */
export const PLANT_DEFER_RO = '(() => { const RO = window.ResizeObserver; window.__RO0 = RO; window.ResizeObserver = class extends RO { constructor(cb) { super((e, o) => setTimeout(() => cb(e, o), 0)); } }; })();';

/**
 * In-page helpers, installed after load (harness code, not site code):
 *  - the resize probe (check 2 above);
 *  - band(): resolves on the first scroll event at which a quad's top sits in [lo, hi] while scrolling in `dir`;
 *  - a scroll-event recorder of [t, scrollY, reanchors] for the re-anchor rate (scroll events, so no extra rAF).
 */
function installProbe() {
  const RO = window.__RO0 || window.ResizeObserver;
  const round2 = (n) => Math.round(n * 100) / 100;
  const quads = () => [...document.querySelectorAll('[data-gl-fixture="quad"]')];
  const docTops = () => quads().map((el) => round2(el.getBoundingClientRect().top + window.scrollY));
  const near = (v, t) => Math.abs(v - t) <= 2;
  function glCheck() {
    const renderer = window.__stage.gl?.renderer;
    const canvas = document.getElementById('gl');
    if (!renderer || !canvas) return { quads: [], error: 'no GL' };
    const gl = renderer.getContext();
    const cr = canvas.getBoundingClientRect();
    const bw = gl.drawingBufferWidth;
    const bh = gl.drawingBufferHeight;
    const kx = bw / cr.width;
    const ky = bh / cr.height;
    const col = new Uint8Array(4 * bh);
    const out = [];
    for (const el of quads()) {
      const b = el.getBoundingClientRect();
      if (b.top < 4 || b.bottom > window.innerHeight - 4) continue; // fully visible only, as the frame analyser
      const idx = Number(el.dataset.glIndex);
      gl.readPixels(Math.floor((b.left + b.width / 2 - cr.left) * kx), 0, 1, bh, gl.RGBA, gl.UNSIGNED_BYTE, col);
      let lo = -1;
      let hi = -1;
      for (let row = 0; row < bh; row++) {
        const o = row * 4;
        if (near(col[o], 255) && near(col[o + 1], 0) && near(col[o + 2], 20 * idx)) {
          if (lo < 0) lo = row;
          hi = row;
        }
      }
      if (lo < 0) {
        out.push({ idx, domTop: round2(b.top), gl: null, glued: false, note: 'no GL drawn in this frame' });
        continue;
      }
      const glTop = cr.top + (bh - 1 - hi) / ky;
      const glBottom = cr.top + (bh - lo) / ky;
      const topErr = round2(glTop - b.top);
      const bottomErr = round2(glBottom - b.bottom);
      out.push({ idx, domTop: round2(b.top), domBottom: round2(b.bottom), glTop: round2(glTop), glBottom: round2(glBottom), topErr, bottomErr, glued: Math.abs(topErr) < 0.5 && Math.abs(bottomErr) < 0.5 });
    }
    return { quads: out, canvasTop: round2(cr.top), buffer: [bw, bh] };
  }
  const state = { armed: null, results: [], rec: [], recording: false };
  new RO(() => {
    const a = state.armed;
    if (!a || window.innerHeight === a.fromH) return;
    state.armed = null;
    const after = docTops();
    const st = window.__stage;
    state.results.push({
      seq: a.seq, fromH: a.fromH, toH: window.innerHeight, scrollYBefore: a.scrollY, scrollY: round2(window.scrollY), msAfterArm: Math.round(performance.now() - a.t),
      wallMs: performance.timeOrigin + performance.now(),
      slotMovePx: after.map((t, i) => round2(t - a.before[i])),
      layoutRenders: st.stats.layoutRenders - a.layoutRenders,
      ...glCheck(),
    });
  }).observe(document.body);
  let lastY = window.scrollY;
  let pending = null;
  addEventListener('scroll', () => {
    const y = window.scrollY;
    const dir = Math.sign(y - lastY);
    lastY = y;
    if (state.recording) state.rec.push([Math.round(performance.now() * 10) / 10, round2(y), window.__stage.stats.reanchors]);
    if (!pending || dir !== pending.dir) return;
    for (const el of quads()) {
      const top = el.getBoundingClientRect().top;
      if (top >= pending.lo && top <= pending.hi) {
        const p = pending;
        pending = null;
        clearTimeout(p.timer);
        const s = arm(); // armed here, in the scroll event, so the resize call follows with the least latency
        p.resolve({ seq: s, idx: Number(el.dataset.glIndex), top: round2(top), scrollY: round2(y) });
        return;
      }
    }
  }, { passive: true });
  let seq = 0;
  function arm() {
    state.armed = { seq: ++seq, fromH: window.innerHeight, scrollY: round2(window.scrollY), before: docTops(), layoutRenders: window.__stage.stats.layoutRenders, t: performance.now() };
    return seq;
  }
  window.__driftProbe = {
    state,
    arm,
    /** Resolves (and arms the probe) at the first scroll event in `dir` with a quad's top in [lo, hi]; null on timeout. */
    band(lo, hi, dir, timeout) {
      return new Promise((res) => {
        pending = { lo, hi, dir, resolve: res, timer: setTimeout(() => { pending = null; res(null); }, timeout) };
      });
    },
    /** The first quad with its top at or below lo and its bottom at or above hi (viewport px), or null. */
    inView(lo, hi) {
      for (const el of quads()) {
        const r = el.getBoundingClientRect();
        if (r.top >= lo && r.bottom <= hi) return { idx: Number(el.dataset.glIndex), top: round2(r.top) };
      }
      return null;
    },
    frameMs() {
      return new Promise((res) => {
        const t = [];
        const f = (ts) => { t.push(ts); if (t.length < 31) window.requestAnimationFrame(f); else { const d = t.slice(1).map((v, i) => v - t[i]).sort((x, y) => x - y); res(Math.round(d[15] * 100) / 100); } };
        window.requestAnimationFrame(f);
      });
    },
  };
}

/**
 * Re-anchors by scroll step (review item 4), from the scroll-event recorder. A scroll event fires once per frame that
 * scrolled, so the step between two events is the scroll per frame, the quantity the rail's LEAD compares with its
 * slack. Each bucket gives the re-anchors per frame, per second while scrolling at that step, and the speed it means.
 */
function reanchorRates(rec, frameMs, view) {
  // A step v re-anchors on every frame once v + LEAD (2) x v exceeds the room ahead: the slack less the TRAIL share
  // the rail keeps behind. With the toolbar out (844 px) the slack is 211 px; with it collapsed (764 px), 291 px.
  const threshold = (H) => {
    const slack = Math.max(0, view.Hc - H);
    const px = Math.round(((slack - Math.round(slack * 0.25)) / 3) * 10) / 10;
    return { H, slack, pxPerFrame: px, pxPerSAtThisRate: Math.round((px * 1000) / frameMs), pxPerSAt60Hz: Math.round(px * 60) };
  };
  const everyFrame = [threshold(VIEW.height), threshold(VIEW.height - TOOLBAR)];
  const everyFramePx = everyFrame[0].pxPerFrame;
  const edges = [0, 10, 25, everyFramePx, 100, Infinity];
  const buckets = edges.slice(0, -1).map((lo, i) => ({ pxPerFrame: edges[i + 1] === Infinity ? `${lo}+` : `${lo}-${edges[i + 1]}`, lo, hi: edges[i + 1], ms: 0, px: 0, frames: 0, reanchors: 0 }));
  let peak = 0;
  for (let i = 1; i < rec.length; i++) {
    const dt = rec[i][0] - rec[i - 1][0];
    if (dt <= 0 || dt > 100) continue; // a pause between gestures, not a scroll
    const dy = Math.abs(rec[i][1] - rec[i - 1][1]);
    peak = Math.max(peak, (dy / dt) * 1000);
    const b = buckets.find((x) => dy >= x.lo && dy < x.hi);
    b.ms += dt;
    b.px += dy;
    b.frames++;
    b.reanchors += rec[i][2] - rec[i - 1][2];
  }
  return {
    frameMs, canvasHc: view.Hc, peakPxPerS: Math.round(peak), reanchorEveryFrameAbove: everyFrame,
    buckets:buckets.map(({ pxPerFrame, ms, px, frames, reanchors }) => ({
      pxPerFrame, frames, reanchors, perFrame: frames ? Math.round((reanchors / frames) * 100) / 100 : null,
      seconds: Math.round(ms) / 1000, perSecond: ms ? Math.round((reanchors / ms) * 10000) / 10 : null, meanPxPerS: ms ? Math.round((px / ms) * 1000) : null,
    })),
  };
}

async function openBench(name, base, plant) {
  const b = await browser(name);
  const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 1, hasTouch: true, isMobile: name === 'chromium' });
  if (plant === 'defer-ro') await ctx.addInitScript({ content: PLANT_DEFER_RO });
  const page = await ctx.newPage();
  await page.goto(`${base}/bench/?debug=drift&tier=lite`, { waitUntil: 'load' });
  await waitSettled(page, 15000);
  await page.waitForFunction(() => window.__stage.glState === 'ready', null, { polling: 100, timeout: 15000 });
  await page.evaluate(installProbe);
  const slotHeights = await page.evaluate(() => Object.fromEntries(window.__stage.slots().filter((s) => s.fixture === 'quad').map((s) => [Number(document.querySelector(`[data-gl-id="${s.id}"]`).dataset.glIndex), s.h])));
  const before = await page.evaluate(() => ({ reallocs: window.__stage.stats.reallocs, coarse: matchMedia('(pointer: coarse)').matches, tier: window.__stage.tier, view: { ...window.__stage.view } }));
  const frameMs = await page.evaluate(() => window.__driftProbe.frameMs());
  return { ctx, page, slotHeights, before, frameMs };
}

/** Resize-probe verdict for one resize: GL was drawn where every fully visible quad is, in the frame layout moved. */
function probeVerdict(p) {
  if (!p) return { ok: false, why: 'the probe did not fire (no layout change seen)' };
  if (!p.quads.length) return { ok: false, why: 'no fully visible quad in the resize frame' };
  const bad = p.quads.filter((q) => !q.glued);
  return bad.length ? { ok: false, why: `GL off its slot in the resize frame: ${bad.map((q) => `#${q.idx} top ${q.topErr ?? 'none'} bottom ${q.bottomErr ?? 'none'}`).join(', ')}` } : { ok: true };
}

async function chromiumScenario(base, opts) {
  const { ctx, page, slotHeights, before, frameMs } = await openBench('chromium', base, opts.plant);
  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ buf: Buffer.from(f.data, 'base64'), ts: f.metadata?.timestamp ? f.metadata.timestamp * 1000 : null });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await page.evaluate(() => { window.__driftProbe.state.recording = true; });
  await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
  const drag = async (from, step) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: from }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: from + i * step }] });
      await sleep(8);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  // The first well-formed frame at the new size after a resize call, and its samples.
  const firstAtNewSize = async (r) => {
    for (let t = 0; t < 40; t++) {
      for (let i = r.startIdx; i < frames.length; i++) {
        const f = await decode(frames[i].buf);
        const cls = sizeClass(f.w, f.h, r.fromH, r.toH, f.w / VIEW.width);
        if (cls === 'post') return { idx: i, samples: analyse(f, slotHeights, f.w / VIEW.width).filter((s) => s.drift !== null) };
      }
      await sleep(25);
    }
    return { idx: null, samples: [] };
  };

  // The toolbar, mid-fling: collapse (-80) on a fling down, expand (+80) on a fling up, each fired while a quad is fully
  // in view. At least 4 resizes, and more (up to 12) until 3 resize probes saw a quad and 2 frames at the resize were
  // captured with a quad in them.
  const resizes = [];
  let h = VIEW.height;
  let tries = 0;
  let covered = 0;
  let probed = 0;
  while (resizes.length < 12 && (resizes.length < 4 || covered < 2 || probed < 3) && tries < 30) {
    tries++;
    const shrink = h === VIEW.height;
    // Start where the fling has room: a fling down needs page below it, a fling up page above it.
    const y = await page.evaluate(() => [window.scrollY, document.documentElement.scrollHeight - window.innerHeight]);
    if (shrink && y[0] > y[1] - 2600) await drag(120, 50).then(() => sleep(1500));
    if (!shrink && y[0] < 2600) await drag(760, -50).then(() => sleep(1500));
    await drag(shrink ? 760 : 120, shrink ? -50 : 50);
    // After touchEnd, in the fling: fire while a quad will still be whole after the 40 px svh shift and whatever the
    // fling adds before the resize lands (0 to about 150 px). The scroll event that sees it arms the probe.
    const band = shrink ? [200, 340, 1] : [-30, 60, -1];
    const at = await page.evaluate(([lo, hi, dir]) => window.__driftProbe.band(lo, hi, dir, 2500), band);
    if (!at) {
      await sleep(600);
      continue;
    }
    const toH = shrink ? VIEW.height - TOOLBAR : VIEW.height;
    const r = { kind: shrink ? 'collapse' : 'expand', fromH: h, toH, seq: at.seq, quadAtTrigger: at, startIdx: frames.length };
    await page.setViewportSize({ width: VIEW.width, height: toH });
    h = toH;
    resizes.push(r);
    await sleep(700);
    if ((await firstAtNewSize(r)).samples.length) covered++;
    const p = await page.evaluate((s) => window.__driftProbe.state.results.find((x) => x.seq === s) ?? null, r.seq);
    if (p && p.quads.length) probed++;
    await sleep(300);
  }
  // Reversals: a drag against a running fling, both ways (the gate saw a 10 px top gap at one).
  for (let k = 0; k < 3; k++) {
    await drag(760, -50);
    await sleep(120);
    await drag(120, 50);
    await sleep(120);
    await drag(760, -50);
    await sleep(900);
  }
  await cdp.send('Page.stopScreencast');
  await sleep(300);
  const probe = await page.evaluate(() => ({ results: window.__driftProbe.state.results, rec: window.__driftProbe.state.rec, stats: { ...window.__stage.stats }, view: { ...window.__stage.view } }));
  const after = { reallocs: probe.stats.reallocs };
  await ctx.close();

  // Size every frame against the viewport it should show, then analyse the well-formed ones. A resize's window runs
  // from the call to its first well-formed frame at the new size; a malformed frame there is a surface caught
  // mid-resize and is skipped.
  const scale = (await sharp(frames[0].buf).metadata()).width / VIEW.width;
  const samples = [];
  const skipped = [];
  const sizes = {};
  for (let i = 0; i < frames.length; i++) {
    let k = -1;
    for (let j = 0; j < resizes.length; j++) if (resizes[j].startIdx <= i) k = j;
    const r = resizes[k];
    const f = await decode(frames[i].buf);
    const key = `${f.w}x${f.h}`;
    sizes[key] = (sizes[key] || 0) + 1;
    const cls = sizeClass(f.w, f.h, r ? r.fromH : VIEW.height, r ? r.toH : VIEW.height, scale);
    if (cls === 'malformed') {
      skipped.push({ frame: i, size: key, resize: r && r.atIdx === undefined ? k : null });
      continue;
    }
    if (r && r.atIdx === undefined && cls === 'post') r.atIdx = i;
    for (const s of analyse(f, slotHeights, f.w / VIEW.width)) samples.push({ ...s, frame: i });
  }
  // The frame at each resize: the first well-formed screencast frame at the new size. The screencast keeps about 1
  // frame in 3 at 238 Hz, so this is the first presented frame of the new layout only some of the time; the row gives
  // its swap time after the probe's layout callback (8 to 13 ms where the planted one-frame lag showed, about 250 ms
  // where Chrome held presentation through the resize). The probe is the per-resize check; these frames back it up.
  const resizeRows = resizes.map((r, k) => {
    const p = probe.results.find((x) => x.seq === r.seq) ?? null;
    const at = r.atIdx === undefined ? [] : samples.filter((s) => s.frame === r.atIdx && s.drift !== null);
    const swapAfterLayoutMs = r.atIdx !== undefined && frames[r.atIdx].ts && p ? Math.round((frames[r.atIdx].ts - p.wallMs) * 10) / 10 : null;
    const verdict = probeVerdict(p);
    return {
      kind: r.kind, fromH: r.fromH, toH: r.toH, quadAtTrigger: r.quadAtTrigger, framesFrom: r.startIdx, frameAtResize: r.atIdx ?? null,
      swapAfterLayoutMs,
      skippedFrames: skipped.filter((s) => s.resize === k).map((s) => s.frame),
      atResize: { samples: at.length, glued: at.filter((s) => s.cls === 'glued').length, classes: at.map((s) => `${s.idx}:${s.cls}${s.cls === 'glued' ? '' : `(${s.topErr},${s.bottomErr})`}`) },
      slotMovePx: p?.slotMovePx ?? null, scrollYBefore: p?.scrollYBefore ?? null, scrollYAfter: p?.scrollY ?? null,
      probe: p ? { quads: p.quads, layoutRenders: p.layoutRenders, canvasTop: p.canvasTop, msAfterArm: p.msAfterArm } : null, probeOk: verdict.ok, probeWhy: verdict.why ?? null,
    };
  });
  return summarise({
    browser: 'chromium', input: 'touch fling (CDP touch events), screencast frames', frames, samples, skipped, sizes, resizeRows, before, after, frameMs,
    reanchor: reanchorRates(probe.rec, frameMs, probe.view), layoutRenders: probe.stats.layoutRenders, plant: opts.plant ?? null,
    dump: opts.dump,
  });
}

async function webkitScenario(base, opts) {
  const { ctx, page, slotHeights, before, frameMs } = await openBench('webkit', base, opts.plant);
  await page.evaluate(() => { window.__driftProbe.state.recording = true; });
  // WebKit snapshots are not presented frames, and WebKit's Windows build can present a moved canvas with its
  // previous buffer until the next draw (measured: the stage re-presents for 3 frames after a re-anchor for this).
  // Each capture waits two frame boundaries (a frame, then a task, twice), so it sees what WebKit settles on. The frame
  // at the resize itself is checked by the resize probe.
  const frameBoundary = () => page.evaluate(() => new Promise((r) => window.requestAnimationFrame(() => setTimeout(() => window.requestAnimationFrame(() => setTimeout(r, 0)), 0))));
  // The fling as its per-frame displacements: 24 steps decaying from 240 px (about 2000 px in all), down then up. The
  // toolbar collapses on the way down and expands on the way up, at the first step (from the 4th) with a quad in view.
  const steps = Array.from({ length: 24 }, (_, k) => Math.round(240 * 0.89 ** k));
  const frames = [];
  const resizes = [];
  let h = VIEW.height;
  for (const dir of [1, -1]) {
    let done = false;
    for (let k = 0; k < steps.length; k++) {
      await page.evaluate((dy) => window.scrollBy(0, dy), dir * steps[k]);
      const toH = dir > 0 ? VIEW.height - TOOLBAR : VIEW.height;
      // The resize moves the quads 40 px with svh (up on a collapse, down on an expand): pick a quad that stays whole.
      const fits = dir > 0 ? [48, VIEW.height - TOOLBAR + 32] : [8, VIEW.height - 48];
      if (!done && k >= 3 && (await page.evaluate(([lo, hi]) => window.__driftProbe.inView(lo, hi), fits))) {
        const seq = await page.evaluate(() => window.__driftProbe.arm());
        resizes.push({ kind: dir > 0 ? 'collapse' : 'expand', fromH: h, toH, seq, startIdx: frames.length, atIdx: null });
        await page.setViewportSize({ width: VIEW.width, height: toH });
        h = toH;
        done = true;
      }
      await frameBoundary();
      frames.push({ buf: await page.screenshot(), ts: null });
    }
  }
  await sleep(300);
  const probe = await page.evaluate(() => ({ results: window.__driftProbe.state.results, rec: window.__driftProbe.state.rec, stats: { ...window.__stage.stats }, view: { ...window.__stage.view } }));
  await ctx.close();
  const scale = (await sharp(frames[0].buf).metadata()).width / VIEW.width;
  const samples = [];
  const skipped = [];
  const sizes = {};
  for (let i = 0; i < frames.length; i++) {
    const r = [...resizes].reverse().find((x) => i >= x.startIdx);
    const f = await decode(frames[i].buf);
    const key = `${f.w}x${f.h}`;
    sizes[key] = (sizes[key] || 0) + 1;
    if (sizeClass(f.w, f.h, r ? r.fromH : VIEW.height, r ? r.toH : VIEW.height, scale) === 'malformed') {
      skipped.push({ frame: i, size: key, resize: r && i === r.startIdx ? resizes.indexOf(r) : null });
      continue;
    }
    if (r && r.atIdx === null) r.atIdx = i;
    for (const s of analyse(f, slotHeights, f.w / VIEW.width)) samples.push({ ...s, frame: i });
  }
  const resizeRows = resizes.map((r, k) => {
    const p = probe.results.find((x) => x.seq === r.seq) ?? null;
    const verdict = probeVerdict(p);
    const at = r.atIdx === null ? [] : samples.filter((s) => s.frame === r.atIdx && s.drift !== null);
    return {
      kind: r.kind, fromH: r.fromH, toH: r.toH, framesFrom: r.startIdx, frameAtResize: r.atIdx, contiguous: null, skippedFrames: skipped.filter((s) => s.resize === k).map((s) => s.frame),
      atResize: { samples: at.length, glued: at.filter((s) => s.cls === 'glued').length, classes: at.map((s) => `${s.idx}:${s.cls}`), note: 'a screenshot two frame boundaries after the resize; the resize frame itself is the probe' },
      slotMovePx: p?.slotMovePx ?? null, scrollYBefore: p?.scrollYBefore ?? null, scrollYAfter: p?.scrollY ?? null,
      probe: p ? { quads: p.quads, layoutRenders: p.layoutRenders, canvasTop: p.canvasTop } : null, probeOk: verdict.ok, probeWhy: verdict.why ?? null,
    };
  });
  return summarise({
    browser: 'webkit', input: 'fling as 24 decaying per-frame scroll steps on a touch context, captured at frame boundaries', frames, samples, skipped, sizes, resizeRows, before, after: { reallocs: probe.stats.reallocs }, frameMs,
    reanchor: reanchorRates(probe.rec, frameMs, probe.view), layoutRenders: probe.stats.layoutRenders, plant: opts.plant ?? null, screenshotsOnly: true,
    dump: opts.dump,
  });
}

async function summarise(x) {
  const { samples, skipped, resizeRows } = x;
  const measured = samples.filter((s) => s.drift !== null);
  const maxDriftPx = measured.length ? Math.max(...measured.map((s) => Math.abs(s.drift))) : null;
  const missing = samples.filter((s) => s.drift === null).length;
  const reallocOnHeight = x.after.reallocs - x.before.reallocs;
  const histogram = {};
  for (const s of measured) histogram[s.drift] = (histogram[s.drift] || 0) + 1;
  const clipped = measured.filter((s) => s.cls === 'clipped');
  const clipTop = clipped.filter((s) => s.edge === 'top');
  const clipBottom = clipped.filter((s) => s.edge === 'bottom');
  const shifted = measured.filter((s) => s.cls === 'shifted');
  let worst = null;
  for (const s of measured) if (!worst || Math.abs(s.drift) > Math.abs(worst.drift)) worst = s;
  if (x.dump && worst) await sharp(x.frames[worst.frame].buf).toFile(`${x.dump}/drift-${x.browser}-worst.png`);
  // Skipped frames: at most one per resize, none outside a resize.
  const skippedOutside = skipped.filter((s) => s.resize === null);
  const skippedPerResizeOk = resizeRows.every((r) => r.skippedFrames.length <= 1);
  const resizeFramesCovered = resizeRows.filter((r) => r.atResize.samples > 0);
  const resizeFramesGlued = resizeFramesCovered.every((r) => r.atResize.glued === r.atResize.samples);
  // Every resize's probe fired; every quad it saw was glued; at least 2 resizes had a quad in view.
  const probed = resizeRows.filter((r) => r.probe && r.probe.quads.length);
  const probesOk = resizeRows.length > 0 && resizeRows.every((r) => r.probe) && probed.every((r) => r.probeOk) && probed.length >= 2;
  const checks = {
    drift: measured.length > 0 && maxDriftPx < 0.5,
    missing: missing === 0,
    noRealloc: reallocOnHeight === 0,
    skippedFrames: skippedOutside.length === 0 && skippedPerResizeOk,
    // Chromium: the first presented-frame capture at the new size, with a quad in it, in at least 2 resizes, all glued.
    // WebKit's screenshots are not presented frames, so its frame at the resize is the probe's.
    frameAtResize: x.screenshotsOnly ? true : resizeFramesCovered.length >= 2 && resizeFramesGlued,
    resizeProbe: probesOk,
  };
  return {
    browser: x.browser, input: x.input, toolbarChangePx: TOOLBAR, plant: x.plant, frameMs: x.frameMs,
    frames: x.frames.length, frameSizes: x.sizes, samples: measured.length, maxDriftPx, shiftedSamples: shifted.length,
    clipTopSamples: clipTop.length, maxClipTopPx: clipTop.length ? Math.max(...clipTop.map((s) => s.clipTopPx)) : 0,
    clipBottomSamples: clipBottom.length, maxClipBottomPx: clipBottom.length ? Math.max(...clipBottom.map((s) => s.clipBottomPx)) : 0,
    clipped: clipped.map((s) => ({ frame: s.frame, idx: s.idx, edge: s.edge, px: s.clipTopPx ?? s.clipBottomPx })),
    skipped, skippedOutsideResize: skippedOutside.length,
    resizes: resizeRows, resizesProbed: probed.length, resizeFramesCaptured: resizeFramesCovered.length,
    layoutRenders: x.layoutRenders, missing, reallocOnHeight, coarse: x.before.coarse, tier: x.before.tier, histogram, worst,
    reanchor: x.reanchor, checks, pass: Object.values(checks).every(Boolean),
  };
}

/**
 * The resize probe alone, at rest (negatives.mjs): quad 1 at 200 px, then the toolbar collapses and expands. Returns
 * one verdict per resize; with plant 'defer-ro' every one must fail, without it every one must pass.
 */
export async function resizeProbeOnly(base, plant = null) {
  const { ctx, page } = await openBench('chromium', base, plant);
  try {
    await page.evaluate(() => {
      const el = document.querySelector('[data-gl-fixture="quad"]');
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 200);
    });
    await waitSettled(page, 8000);
    for (const toH of [VIEW.height - TOOLBAR, VIEW.height]) {
      await page.evaluate(() => window.__driftProbe.arm());
      await page.setViewportSize({ width: VIEW.width, height: toH });
      await sleep(500);
    }
    const results = await page.evaluate(() => window.__driftProbe.state.results);
    return results.map((p) => ({ fromH: p.fromH, toH: p.toH, slotMovePx: p.slotMovePx[0], layoutRenders: p.layoutRenders, quads: p.quads.map((q) => ({ idx: q.idx, topErr: q.topErr, bottomErr: q.bottomErr })), ...probeVerdict(p) }));
  } finally {
    await ctx.close();
  }
}

export async function run(opts = {}) {
  const browsers = String(opts.browsers || 'chromium,webkit').split(',');
  const repeat = Math.max(1, Number(opts.repeat) || 1);
  const srv = await serve(opts.dist ? resolve(String(opts.dist)) : undefined);
  const rows = [];
  try {
    for (const name of browsers) {
      for (let i = 0; i < (name === 'chromium' ? repeat : 1); i++) {
        const r = name === 'chromium' ? await chromiumScenario(srv.base, opts) : await webkitScenario(srv.base, opts);
        rows.push({ run: i + 1, ...r });
      }
    }
  } finally {
    await srv.close();
  }
  const by = (name) => rows.filter((r) => r.browser === name);
  // The worst run: a failing run before a passing one, then the largest drift.
  const worstOf = (rs) => [...rs].sort((a, b) => Number(a.pass) - Number(b.pass) || (b.maxDriftPx ?? Infinity) - (a.maxDriftPx ?? Infinity))[0] ?? null;
  const perBrowser = browsers.map((name) => {
    const rs = by(name);
    const w = worstOf(rs);
    const probes = rs.flatMap((r) => r.resizes);
    return {
      browser: name, runs: rs.length, passed: rs.filter((r) => r.pass).length, worstRun: w?.run ?? null, worstDriftPx: w?.maxDriftPx ?? null,
      resizes: probes.length, probesWithQuad: probes.filter((p) => p.probe && p.probe.quads.length).length, probesGlued: probes.filter((p) => p.probeOk).length,
      resizeFramesCaptured: rs.reduce((n, r) => n + r.resizeFramesCaptured, 0),
      resizeFramesGlued: probes.filter((p) => p.atResize.samples > 0 && p.atResize.glued === p.atResize.samples).length,
      slotMovePx: [...new Set(probes.flatMap((p) => p.slotMovePx ?? []))],
    };
  });
  return {
    schema: 2, instrument: 'drift', plant: opts.plant ?? null, repeat, pass: rows.every((r) => r.pass), perBrowser, rows,
    summary: perBrowser.map((b) => `${b.browser}: ${b.passed}/${b.runs} runs pass, worst drift ${b.worstDriftPx} px (run ${b.worstRun}); resize probes glued ${b.probesGlued}/${b.probesWithQuad} (of ${b.resizes} resizes); frames at the resize glued ${b.resizeFramesGlued}/${b.resizeFramesCaptured}; slots moved ${b.slotMovePx.join(', ')} px at the resize`).join(' | '),
  };
}

await cliMain(import.meta.url, run);
