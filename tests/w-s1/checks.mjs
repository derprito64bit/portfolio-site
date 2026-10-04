// W-S1 acceptance checks (issue #13 with Amendments A1 and A2), one function per acceptance line. Each returns
// { pass, ... } and never throws for a failed expectation (only for a broken harness). run.mjs runs them and writes the
// JSON evidence. Durations and budgets come from the tokens (A2: no literal duration or budget here).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { durations, heroTimeline, springs } from '../../src/lib/tokens.js';
import { H, WAIT, context, heroAtRest, heroRects, median, open, profile, rectsIntersect, sleep } from './lib.mjs';

const GES = ['D1', 'D2', 'D3', 'T1', 'T2', 'P1', 'P2', 'S1', 'S2'];
const MOUSE = (p) => profile(p).input === 'mouse';
/** The acceptance lines' own numbers that no token holds (W-D012's guards, the delayed-GL line, budgets.md). */
const SPEC = {
  /** "With the GL chunk delayed 3 s via page.route, a developed print 1 is visible by FCP + 2.6 s". */
  delayGlMs: 3000,
  printVisibleAfterFcpMs: 2600,
  /** budgets.md: no automatic motion over 5 s. */
  motionCapMs: 5000,
  /** budgets.md: pre-GL JS <= 35 kB gz from the network log. */
  preGlBytes: 35_000,
  /** budgets.md: GL chunk (three, addons, anime, stage GL, effects) <= 185 kB gz. */
  glBytes: 185_000,
  /** A2: the head script stays under 0.8 kB. */
  headScriptBytes: 800,
  /** Mean diff of a poster against the first GL frame (gate line 5), in 8-bit levels. */
  parityMax: 4,
};
const GL_CHUNK = /\/_astro\/gl\.[^/]+\.js$/;
/** The built client chunk that holds a source module (Vite manifest written by astro.config.mjs). */
function chunkOf(module) {
  const m = JSON.parse(readFileSync(join(H.ROOT, 'node_modules/.cache/portfolio-build/vite-manifest.json'), 'utf8'));
  return Object.values(m).find((c) => c.modules.includes(module))?.file ?? null;
}

// The state of the first screen at the first contentful paint, recorded by a paint observer in the page, and the
// final LCP candidate. The camera at first paint is the drawing (data-cam='drawing': its strokes loaded and its ground
// shown) or the finished-camera poster.
const FCP_PROBE = () => {
  window.__w1 = { fcp: null, lcp: [], heroShift: 0, shifts: [], camSeen: [] };
  // Init scripts run before <html> exists: watch the document itself (subtree) for data-cam on the root.
  const seeCam = () => {
    const c = document.documentElement?.dataset.cam ?? null;
    if (window.__w1.camSeen.at(-1) !== c) window.__w1.camSeen.push(c);
  };
  new MutationObserver(seeCam).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-cam'] });
  document.addEventListener('readystatechange', seeCam);
  // Layout shifts with a source inside the hero (the nav and the sections below are not the hero's).
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      const src = e.sources.filter((s) => s.node && (s.node.nodeType === 1 ? s.node : s.node.parentElement)?.closest?.('.hero'));
      if (!src.length) continue;
      window.__w1.heroShift += e.value;
      window.__w1.shifts.push({ t: Math.round(e.startTime), v: e.value, src: src.map((s) => ({ n: s.node.nodeType === 1 ? s.node.className || s.node.tagName : '#text', p: [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round), c: [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round) })) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  const vis = (el) => {
    if (!el) return { ok: false, why: 'missing' };
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const inView = b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth;
    let o = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    const img = el.tagName === 'IMG' ? el.complete && el.naturalWidth > 0 : true;
    return { ok: inView && o > 0.99 && cs.visibility === 'visible' && cs.display !== 'none' && img, inView, opacity: o, loaded: img, rect: [b.x, b.y, b.width, b.height].map(Math.round) };
  };
  new PerformanceObserver((l) => {
    const e = l.getEntriesByName('first-contentful-paint')[0];
    if (!e || window.__w1.fcp) return;
    const q = (s) => document.querySelector(s);
    const html = document.documentElement;
    const drawing = html.dataset.cam === 'drawing';
    const lines = vis(q('.hero-lines'));
    const ground = vis(q('.hero-ground'));
    window.__w1.fcp = {
      t: e.startTime,
      cam: html.dataset.cam ?? null,
      h1: vis(q('h1')),
      lineSlot: vis(q('.hero-line .ph') || q('.hero-line')),
      cta: vis(q('.hero-cta a')),
      strip: vis(q('[data-camera-strip]')),
      camera: drawing ? { ok: lines.ok && ground.ok, drawing: true, lines, ground } : { ...vis(q('.hero-poster')), drawing: false },
      print: vis(q('[data-hero-print] img.hero-still')),
    };
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__w1.lcp.push({ t: e.startTime, size: e.size, el: e.element ? e.element.tagName.toLowerCase() + (e.element.dataset?.lcp ? `[data-lcp=${e.element.dataset.lcp}]` : '') + (e.element.className ? `.${String(e.element.className).split(' ')[0]}` : '') : null });
  }).observe({ type: 'largest-contentful-paint', buffered: true });
};

// The LCP sizes the page reports for the h1 (its name's text), the camera poster and print 1's still, in px^2.
const LCP_AREAS = () => {
  const h1 = document.querySelector('h1');
  const range = document.createRange();
  let h1Text = 0;
  for (const n of h1.childNodes) {
    if (n.nodeType !== 3 || !n.textContent.trim()) continue;
    range.selectNodeContents(n);
    for (const b of range.getClientRects()) h1Text += b.width * b.height;
  }
  const area = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? b.width * b.height : 0; };
  return { h1Text: Math.round(h1Text), poster: Math.round(area('[data-hero-camera]')), print: Math.round(area('[data-hero-print] img.hero-still')) };
};

/** The made stills in the print slot: each absolutely positioned, the slot's size within 10%, inside the first screen. */
const PLACEMENT = () => {
  const slot = document.querySelector('[data-hero-print]');
  const sr = slot.getBoundingClientRect();
  return [...slot.querySelectorAll('img.hero-still')].map((img) => {
    const b = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const w = img.offsetWidth / slot.offsetWidth;
    const h = img.offsetHeight / slot.offsetHeight;
    const inScreen = b.left >= -8 && b.top >= -8 && b.right <= innerWidth + 8 && b.bottom <= innerHeight + 8;
    const ok = cs.position === 'absolute' && Math.abs(w - 1) <= 0.1 && Math.abs(h - 1) <= 0.1 && inScreen && Number(cs.opacity) > 0.99;
    return { slug: img.dataset.slug ?? 'print-1', ok, position: cs.position, size: [Math.round(w * 1000) / 1000, Math.round(h * 1000) / 1000], rect: [b.x, b.y, b.width, b.height].map(Math.round), slot: [sr.x, sr.y, sr.width, sr.height].map(Math.round), inScreen, opacity: Number(cs.opacity) };
  });
};

/** 1. FCP shows the h1, the line slot, the CTA, the strip and the camera (the drawing on the first visit, else the
 *  poster); the LCP element per profile (never the camera), with the camera below 85% of the h1's LCP area (mouse) or
 *  of the larger of the h1 and print 1 (touch), and no layout shift in the hero. A second pass holds every web font
 *  back 800 ms (the h1 paints in its fallback face first): the LCP element must not change and nothing may shift. */
export async function fcp(base, { profiles = [...GES, 'WK-P2', 'WK-T2'], lateFont = ['D1', 'D2', 'D3', 'T2', 'P2'] } = {}) {
  const rows = [];
  const late = { match: /\.woff2(\?|$)/, handler: async (r) => { await sleep(800); await r.continue(); } };
  for (const [p, route] of [...profiles.map((x) => [x, null]), ...lateFont.map((x) => [x, late])]) {
    const { page, ctx } = await open(base, p, 'auto', { init: FCP_PROBE, ...(route ? { route } : {}) });
    await page.waitForFunction(() => window.__w1?.fcp, null, { timeout: 10000 }).catch(() => {});
    // Until the hero rests (print 1 handed back to its still on the full tier): a still that appears late must not
    // take the LCP from the h1 either.
    await heroAtRest(page).catch(() => {});
    await sleep(route ? 1200 : 600);
    const r = await page.evaluate(() => window.__w1);
    const areas = await page.evaluate(LCP_AREAS);
    await ctx.close();
    const f = r?.fcp;
    const shown = route ? true : f && ['h1', 'lineSlot', 'cta', 'strip', 'camera'].every((k) => f[k]?.ok);
    const last = r?.lcp?.at(-1)?.el ?? null;
    const lcpOk = MOUSE(p) ? /^h1/.test(last ?? '') : /^h1/.test(last ?? '') || /data-lcp=print-1/.test(last ?? '');
    const cameraLcp = (r?.lcp ?? []).filter((e) => /hero-(poster|lines)/.test(e.el ?? ''));
    const ref = MOUSE(p) ? areas.h1Text : Math.max(areas.h1Text, areas.print);
    const posterShare = ref ? Math.round((areas.poster / ref) * 1000) / 1000 : null;
    const capOk = posterShare !== null && posterShare <= 0.851;
    const heroShift = Math.round((r?.heroShift ?? 0) * 1e5) / 1e5;
    const stillOk = heroShift < 0.001;
    rows.push({ profile: p, lateFont: Boolean(route), pass: Boolean(shown && lcpOk && capOk && stillOk && !cameraLcp.length), shown, cam: f?.cam, lcpElement: last, lcpOk, cameraLcp, areas, posterShare, capOk, heroShift, stillOk, shifts: r?.shifts, lcp: r?.lcp, ...(route ? {} : { fcp: f }) });
  }
  return { pass: rows.every((r) => r.pass), rows };
}

/** A2. First paint follows W-D012, at every profile in auto, reduced, static and JS off, plus a reload, a /#sheet
 *  arrival and a Back arrival: the drawing only on a first visit with motion full and tier full or lite; otherwise the
 *  finished camera from first paint with no swap (data-cam never 'drawing'); JS off shows the finished camera. The
 *  head script is measured under 0.8 kB. Shots hold the GL chunk and the camera poster back, so they show first paint. */
export async function firstPaint(base, { out, profiles = GES } = {}) {
  const html = readFileSync(join(H.ROOT, 'dist/index.html'), 'utf8');
  const head = [...html.matchAll(/<script>([^<]*ion\.hero[^<]*)<\/script>/g)].map((m) => m[1])[0] ?? '';
  const headBytes = Buffer.byteLength(head);
  const hold = async (route) => { await sleep(6000); await route.continue().catch(() => {}); };
  const rows = [];
  const visit = async (p, mode, { url = '/', js = true, before } = {}) => {
    const ctx = await context(p, mode === 'reduced' ? 'reduced' : 'auto', js ? {} : { context: { javaScriptEnabled: false } });
    const page = await ctx.newPage();
    if (js) await page.addInitScript(FCP_PROBE);
    if (before) await before(page);
    await page.route(GL_CHUNK, hold);
    // On a first visit the poster is held too, so lite's crossfade cannot start before the shot.
    if (mode === 'auto' && url === '/') await page.route(/\/posters\/camera\/camera-[^/]+\.(avif|webp)$/, hold);
    const q = mode === 'static' ? (url.includes('?') ? '&' : '?') + 'tier=static' : '';
    const [path, hash] = url.split('#');
    // Not 'load': that waits for the held images. First paint, the fonts, then a beat.
    await page.goto(`${base}${path}${q}${hash ? `#${hash}` : ''}`, { waitUntil: js ? 'domcontentloaded' : 'load' });
    if (js) await page.waitForFunction(() => window.__w1?.fcp, null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await sleep(300);
    return { page, ctx };
  };
  const read = async (page) => page.evaluate(() => {
    const vis = (s) => { const e = document.querySelector(s); if (!e) return false; const cs = getComputedStyle(e); const b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.5 && b.width > 0 && !(e.closest('.hero-drawing') && getComputedStyle(e.closest('.hero-drawing')).display === 'none'); };
    const loaded = (s) => { const e = document.querySelector(s); return Boolean(e && e.complete && e.naturalWidth > 0); };
    return { cam: document.documentElement.dataset.cam ?? null, hero: document.documentElement.dataset.hero ?? null, camSeen: window.__w1?.camSeen ?? null, fcpCam: window.__w1?.fcp?.cam ?? null, drawingShown: vis('.hero-lines') && vis('.hero-ground'), posterShown: (vis('.hero-poster') && loaded('.hero-poster')) || (vis('.hero-poster-noscript') && loaded('.hero-poster-noscript')) || Boolean(window.__hero?.live) };
  });
  const record = async (name, p, mode, expect, page, ctx) => {
    const s = await read(page);
    if (out) await page.screenshot({ path: `${out}/${name}.png` });
    await ctx.close();
    const drawingOk = expect === 'drawing' ? s.fcpCam === 'drawing' && s.drawingShown : true;
    const cameraOk = expect === 'camera' ? s.fcpCam === 'camera' && !(s.camSeen ?? []).includes('drawing') && !s.drawingShown && s.posterShown : true;
    const jsOffOk = expect === 'none' ? s.cam === null && !s.drawingShown && s.posterShown : true;
    rows.push({ name, profile: p, mode, expect, ...s, pass: drawingOk && cameraOk && jsOffOk });
  };
  for (const p of profiles) {
    for (const mode of ['auto', 'reduced', 'static']) {
      const { page, ctx } = await visit(p, mode);
      await record(`${p}-${mode}`, p, mode, mode === 'auto' ? 'drawing' : 'camera', page, ctx);
    }
    const { page, ctx } = await visit(p, 'auto', { js: false });
    await record(`${p}-jsoff`, p, 'jsoff', 'none', page, ctx);
  }
  for (const p of ['D2', 'P2']) {
    // A reload in the same session, once the opening has started (ion.hero written).
    {
      const ctx = await context(p, 'auto');
      const page = await ctx.newPage();
      await page.addInitScript(FCP_PROBE);
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => sessionStorage.getItem('ion.hero'), null, { timeout: 15000 }).catch(() => {});
      await page.reload({ waitUntil: 'load' });
      await sleep(600);
      await record(`${p}-reload`, p, 'reload', 'camera', page, ctx);
    }
    // An anchor arrival in a fresh session.
    {
      const { page, ctx } = await visit(p, 'auto', { url: '/#sheet' });
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(200);
      await record(`${p}-hash`, p, 'hash', 'camera', page, ctx);
    }
    // Back: away from home before the opening could start, then back (a back_forward navigation, or a page restored
    // from the back/forward cache, whose 'back' guard cuts to the end state).
    {
      const ctx = await context(p, 'auto');
      const page = await ctx.newPage();
      await page.addInitScript(FCP_PROBE);
      await page.route(GL_CHUNK, hold);
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.goto(`${base}/work/project-01/`, { waitUntil: 'load' });
      await page.goBack({ waitUntil: 'load' });
      await sleep(800);
      const nav = await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type ?? null);
      const s = await read(page);
      if (out) await page.screenshot({ path: `${out}/${p}-back.png` });
      await ctx.close();
      const pass = s.cam === 'camera' && !s.drawingShown;
      rows.push({ name: `${p}-back`, profile: p, mode: 'back', expect: 'camera', navigationType: nav, ...s, pass });
    }
  }
  return { pass: rows.every((r) => r.pass) && headBytes > 0 && headBytes < SPEC.headScriptBytes, headScriptBytes: headBytes, rows };
}

/** 2. Wordmark: one line at default spacing; never smaller as the width grows at a fixed height; text spacing and
 *  200% zoom clip nothing and overflow 0. */
export async function wordmark(base) {
  const lines = [];
  for (const p of [...GES, 'W960', 'L844']) {
    const { page, ctx } = await open(base, p);
    await page.evaluate(() => document.fonts.ready);
    lines.push({ profile: p, ...(await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      const fs = parseFloat(getComputedStyle(h1).fontSize);
      const range = document.createRange();
      range.selectNodeContents(h1);
      const tops = new Set([...range.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.top)));
      return { fontSize: fs, lines: tops.size, scrollW: h1.scrollWidth, clientW: h1.clientWidth };
    })) });
    await ctx.close();
  }
  const oneLine = lines.every((l) => l.lines === 1);
  const heights = [...new Set([...GES, 'W960', 'L844'].map((p) => profile(p).viewport.height))];
  const sweeps = [];
  const ctx = await context('D2');
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  for (const h of heights) {
    let best = 0;
    let worst = 1;
    const sizes = [];
    for (let w = 320; w <= 1920; w += 40) {
      await page.setViewportSize({ width: w, height: h });
      const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('h1')).fontSize));
      sizes.push([w, Math.round(fs * 10) / 10]);
      if (best > 0) worst = Math.min(worst, fs / best);
      best = Math.max(best, fs);
    }
    sweeps.push({ height: h, worstRatio: Math.round(worst * 1000) / 1000, pass: worst >= 0.95, sizes });
  }
  await ctx.close();
  const SPACING = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-block-end:2em!important}';
  const stress = [];
  for (const [p, spacing] of [['D2', true], ['P2', true], ['S2', true], ['Z-D2', false], ['Z-P2', false]]) {
    const { page: pg, ctx: c } = await open(base, p);
    if (spacing) await pg.addStyleTag({ content: SPACING });
    await pg.evaluate(() => document.fonts.ready);
    await sleep(450);
    const r = await pg.evaluate(() => {
      const clipped = [...document.querySelectorAll('.hero *')].filter((e) => {
        const cs = getComputedStyle(e);
        return /hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY) && !e.classList.contains('sr-only') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1);
      }).map((e) => e.className);
      const h1 = document.querySelector('h1');
      return { clipped, overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth, h1Overflow: h1.scrollWidth - h1.clientWidth };
    });
    stress.push({ profile: p, spacing, ...r, pass: r.clipped.length === 0 && r.overflowPx === 0 });
    await c.close();
  }
  return { pass: oneLine && sweeps.every((s) => s.pass) && stress.every((s) => s.pass), oneLine, lines, sweeps, stress };
}

/** Samples __stage.bounds('hero-print').gl on every frame of the page (the acceptance's own log). */
const BOUNDS_LOG = () => {
  window.__noFly = [];
  const tick = () => {
    const b = window.__stage?.bounds?.('hero-print')?.gl;
    if (b) window.__noFly.push({ t: Math.round(performance.now()), x: b.x, y: b.y, w: b.w, h: b.h });
    if (window.__noFly.length < 20000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/** 3. First screen: the whole camera and print 1 in the viewport, the lens never covered, print size rules, no text
 *  over a GL rect at rest, and the flight never crosses the h1, lede or CTA (the __stage.bounds log, every frame).
 *  844 x 390: the line's 50%-of-content-width rule cannot hold in a 390 px tall viewport; the row is reported
 *  BLOCKED pending the orchestrator's ruling (never exempted here), with the rule the manager proposed measured. */
export async function firstScreen(base, { profiles = ['D1', 'D2', 'D3', 'S1', 'T1', 'T2', 'P1', 'P2', 'S2', 'L844'] } = {}) {
  const rows = [];
  for (const p of profiles) {
    const { page, ctx } = await open(base, p, 'auto', { init: BOUNDS_LOG });
    await heroAtRest(page).catch(() => {});
    const g = await heroRects(page);
    const flight = await page.evaluate(() => window.__noFly.slice());
    const textOverGl = await page.evaluate(() => {
      const slots = [...document.querySelectorAll('[data-gl]')].map((s) => s.getBoundingClientRect()).filter((r) => r.width && r.height);
      const hits = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || el.closest('[data-gl]') || el.closest('.sr-only, [aria-hidden="true"]')) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) for (const s of slots) if (r.width && r.right > s.left && r.left < s.right && r.bottom > s.top && r.top < s.bottom) hits.push(n.textContent.trim().slice(0, 40));
      }
      return hits;
    });
    await ctx.close();
    const inView = (r) => r && r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= g.vw + 0.5 && r.y + r.h <= g.vh + 0.5;
    const lens = { cx: g.camera.x + g.lens.x * g.camera.w, cy: g.camera.y + g.lens.y * g.camera.h, r: 0.17 * g.camera.w };
    const lensClear = g.print.x + g.print.w <= lens.cx - lens.r || g.print.y >= lens.cy + lens.r || g.print.x >= lens.cx + lens.r;
    const narrow = g.vw < 1024;
    const landscapePhone = g.vh <= 500 && g.vw > g.vh;
    const windowW = (g.printLayoutW * 46) / 54;
    const widthRule = g.printLayoutW >= 0.5 * g.contentW - 0.5;
    const sizeRule = narrow && !landscapePhone ? widthRule : landscapePhone ? widthRule : windowW >= 220;
    const proposed = landscapePhone ? { rule: 'print 1 at least 50% of the small viewport height (manager, round 1)', printH: Math.round(g.print.h), viewportH: g.vh, pass: g.print.h >= 0.5 * g.vh } : null;
    const noFly = [g.h1, g.line, g.cta];
    const crossings = flight.filter((b) => noFly.some((r) => rectsIntersect(r, { x: b.x, y: b.y, w: b.w, h: b.h })));
    const rest = inView(g.camera) && inView(g.print) && lensClear && textOverGl.length === 0 && crossings.length === 0;
    const pass = rest && sizeRule;
    const status = pass ? 'PASS' : landscapePhone && rest && !widthRule ? 'BLOCKED' : 'FAIL';
    rows.push({ profile: p, pass, status, cameraInView: inView(g.camera), printInView: inView(g.print), lensClear, sizeRule, widthRule, proposed, printW: g.printLayoutW, contentW: g.contentW, windowW: Math.round(windowW), textOverGl, boundsFrames: flight.length, crossings: crossings.slice(0, 5), geometry: g });
  }
  const blocked = rows.filter((r) => r.status === 'BLOCKED').map((r) => r.profile);
  return { pass: rows.every((r) => r.pass), status: rows.every((r) => r.pass) ? 'PASS' : rows.every((r) => r.pass || r.status === 'BLOCKED') ? 'BLOCKED' : 'FAIL', blocked, rows };
}

/** 4a. hero:readable minus stage:gl-ready, median of 3 cold loads (a fresh browser each), against the token budget
 *  (budgetAfterGlReady, the drawing included on this first full-tier visit). */
export async function readable(base, { loads = 3, profileName = 'D2' } = {}) {
  const runs = [];
  for (let i = 0; i < loads; i++) {
    await H.closeBrowsers();
    const { page, ctx } = await open(base, profileName);
    await page.waitForFunction(() => performance.getEntriesByName('hero:readable').length || document.documentElement.dataset.hero === 'done', null, { timeout: 15000 }).catch(() => {});
    const m = await page.evaluate(() => {
      const t = (n) => performance.getEntriesByName(n, 'mark')[0]?.startTime ?? null;
      return { glReady: t('stage:gl-ready'), camReady: t('hero:cam-ready'), t0: t('hero:t0'), readable: t('hero:readable'), cam: document.documentElement.dataset.cam, renderer: window.__stage?.gl?.rendererName ?? null, guards: performance.getEntriesByType('mark').filter((x) => x.name.startsWith('hero:guard')).map((x) => x.name) };
    });
    await ctx.close();
    runs.push({ ...m, t0AfterGlReady: m.t0 !== null && m.glReady !== null ? Math.round(m.t0 - m.glReady) : null, delta: m.readable !== null && m.glReady !== null ? Math.round(m.readable - m.glReady) : null });
  }
  await H.closeBrowsers();
  const deltas = runs.map((r) => r.delta).filter((d) => d !== null);
  const med = median(deltas);
  return { pass: deltas.length === loads && med <= heroTimeline.budgetAfterGlReady, medianMs: med, budgetMs: heroTimeline.budgetAfterGlReady, earliestMs: heroTimeline.readableAfterGlReady, runs };
}

/** 4b. With the GL chunk delayed 3 s, a developed print 1 is visible by FCP + 2.6 s: it appears when the late guard
 *  fires, not at the end of the drawing's crossfade; the drawing then crossfades to the finished camera. */
export async function delayedGl(base, { profileName = 'D2', out } = {}) {
  const ctx = await context(profileName);
  const page = await ctx.newPage();
  await page.route(GL_CHUNK, async (route) => {
    await sleep(SPEC.delayGlMs);
    await route.continue();
  });
  await page.addInitScript(() => {
    window.__dg = { fcp: null, visibleAt: null, guardAt: null, camAt: null };
    new PerformanceObserver((l) => {
      const e = l.getEntriesByName('first-contentful-paint')[0];
      if (e) window.__dg.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name.startsWith('hero:guard') && window.__dg.guardAt === null) window.__dg.guardAt = e.startTime;
    }).observe({ type: 'mark', buffered: true });
    new MutationObserver(() => {
      if (document.documentElement?.dataset.cam === 'camera' && window.__dg.camAt === null) window.__dg.camAt = performance.now();
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-cam'] });
    const poll = () => {
      const img = document.querySelector('[data-hero-print] img.hero-still');
      if (img && img.complete && Number(getComputedStyle(img).opacity) > 0.99 && !img.closest('.is-gl')) {
        window.__dg.visibleAt = performance.now();
        return;
      }
      setTimeout(poll, 16);
    };
    addEventListener('DOMContentLoaded', poll);
  });
  const frames = [];
  const shoot = async () => {
    for (let i = 0; i < 18; i++) {
      const t = await page.evaluate(() => Math.round(performance.now())).catch(() => null);
      if (out && t !== null) {
        await page.screenshot({ path: `${out}/delayed-gl-${String(t).padStart(5, '0')}.png` }).catch(() => {});
        frames.push(t);
      }
      await sleep(250);
    }
  };
  await page.goto(`${base}/`, { waitUntil: 'commit' });
  await shoot();
  await page.waitForFunction(() => window.__dg.visibleAt !== null, null, { timeout: 8000 }).catch(() => {});
  await sleep(durations.heroDrawingFade + 300);
  const r = await page.evaluate(() => ({ ...window.__dg, hero: document.documentElement.dataset.hero, cam: document.documentElement.dataset.cam, session: sessionStorage.getItem('ion.hero'), guard: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('hero:guard')).map((m) => m.name) }));
  if (out) await page.screenshot({ path: `${out}/delayed-gl-${profileName}-end.png` });
  await ctx.close();
  const budget = r.fcp !== null ? r.fcp + SPEC.printVisibleAfterFcpMs : null;
  // The still is there when the guard fires (within a frame or two), not a crossfade later.
  const atGuard = r.guardAt !== null && r.visibleAt !== null && r.visibleAt - r.guardAt < durations.heroDrawingFade / 2;
  return { pass: r.visibleAt !== null && budget !== null && r.visibleAt <= budget && atGuard && r.cam === 'camera' && r.session === '1', fcp: r.fcp, visibleAt: r.visibleAt, guardAt: r.guardAt, camAt: r.camAt, budget, atGuard, hero: r.hero, cam: r.cam, session: r.session, guard: r.guard, frames };
}

/** 4c. The first keydown, focusin or pointerdown jumps the intro to its end state; and (A2) a guard that fires
 *  mid-drawing ends on the finished camera with print 1 developed and 'ion.hero' set, and a reload in the same
 *  session paints the finished camera with no swap. */
export async function inputGuard(base, { profileName = 'D2' } = {}) {
  const rows = [];
  for (const kind of ['keydown', 'focusin', 'pointerdown']) {
    const { page, ctx } = await open(base, profileName);
    // Wait for the eject sequence to be under way (the drawing done, the print in flight), then interrupt it.
    await page.waitForFunction(() => performance.getEntriesByName('hero:t0').length > 0, null, { timeout: 15000 }).catch(() => {});
    await sleep(durations.heroDrawingClay + durations.heroDrawingDevelop + heroTimeline.flight);
    const before = await page.evaluate(() => ({ hero: document.documentElement.dataset.hero, flying: Boolean(window.__hero?.flying) }));
    if (kind === 'keydown') await page.keyboard.press('Shift');
    if (kind === 'focusin') await page.evaluate(() => document.querySelector('.hero-cta a').focus());
    if (kind === 'pointerdown') await page.mouse.click(20, (await page.viewportSize()).height - 20);
    await sleep(300);
    const after = await page.evaluate(() => {
      const img = document.querySelector('[data-hero-print] img.hero-still');
      return { hero: document.documentElement.dataset.hero, flying: Boolean(window.__hero?.flying), stillOpacity: Number(getComputedStyle(img).opacity), guard: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('hero:guard')).map((m) => m.name) };
    });
    await ctx.close();
    rows.push({ kind, before, after, pass: before.hero === 'eject' && after.hero === 'done' && !after.flying && after.stillOpacity > 0.99 });
  }
  // Mid-drawing: a key press while GL develops the camera out of the drawing.
  const mid = {};
  {
    const ctx = await context(profileName);
    const page = await ctx.newPage();
    await page.addInitScript(FCP_PROBE);
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => performance.getEntriesByName('hero:t0').length > 0, null, { timeout: 15000 }).catch(() => {});
    await sleep(durations.heroDrawingClay + durations.heroDrawingDevelop / 4);
    mid.before = await page.evaluate(() => ({ cam: document.documentElement.dataset.cam, drawing: window.__hero?.drawingState }));
    await page.keyboard.press('Shift');
    await sleep(60);
    mid.stillAtGuard = await page.evaluate(() => Number(getComputedStyle(document.querySelector('[data-hero-print] img.hero-still')).opacity));
    await sleep(durations.heroDrawingFade + 200);
    mid.after = await page.evaluate(() => ({ cam: document.documentElement.dataset.cam, drawing: window.__hero?.drawingState, hero: document.documentElement.dataset.hero, session: sessionStorage.getItem('ion.hero'), still: Number(getComputedStyle(document.querySelector('[data-hero-print] img.hero-still')).opacity), live: window.__hero?.live, log: (window.__motionLog ?? []).filter((e) => e.kind === 'drawing').map((e) => e.id) }));
    await page.reload({ waitUntil: 'load' });
    await sleep(600);
    mid.reload = await page.evaluate(() => ({ fcpCam: window.__w1?.fcp?.cam ?? null, camSeen: window.__w1?.camSeen ?? null, hero: document.documentElement.dataset.hero }));
    await ctx.close();
    mid.pass = mid.before.cam === 'drawing' && mid.before.drawing === 'running' && mid.stillAtGuard > 0.99 && mid.after.cam === 'camera' && mid.after.drawing === 'done' && mid.after.session === '1' && mid.after.still > 0.99 && mid.after.live === true && mid.reload.fcpCam === 'camera' && !(mid.reload.camSeen ?? []).includes('drawing');
  }
  return { pass: rows.every((r) => r.pass) && mid.pass, rows, midDrawing: mid };
}

async function raw(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
const meanDiff = (A, B) => {
  let sum = 0;
  for (let i = 0; i < A.data.length; i++) sum += Math.abs(A.data[i] - B.data[i]);
  return sum / A.data.length;
};

/** 5. Poster vs first GL frame (mean diff <= 4/255) on the real camera slot, Chromium and WebKit; pose drift across a
 *  40% hero scroll; and the drawing's own hand-over at T0 (the first-paint drawing against GL's first frame of it). */
export async function parity(base, { profiles = [...GES, 'X1180', 'X600', 'WK-P2', 'WK-T2'], out } = {}) {
  const rows = [];
  for (const p of profiles) {
    // The poster this tier shows before GL: the same page with the GL chunk held back, so the poster stays up.
    const sctx = await context(p, 'reduced');
    const spage = await sctx.newPage();
    await spage.route(GL_CHUNK, async (route) => {
      await sleep(20000);
      await route.continue().catch(() => {});
    });
    await spage.goto(`${base}/`, { waitUntil: 'load' });
    await spage.evaluate(() => document.fonts.ready);
    await spage.waitForFunction(() => document.querySelector('.hero-poster')?.complete, null, { timeout: 8000 });
    await sleep(300);
    const clip = await spage.evaluate(() => {
      const b = document.querySelector('[data-hero-camera]').getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    });
    const posterSrc = await spage.evaluate(() => document.querySelector('.hero-poster').currentSrc.split('/').pop());
    const a = await spage.screenshot({ clip });
    await sctx.close();
    // The first GL frame: reduced motion (no intro), the camera live and the poster faded out.
    const g = await open(base, p, 'reduced');
    await g.page.waitForFunction(() => document.querySelector('[data-hero-camera]')?.classList.contains('is-gl'), null, { timeout: 15000 }).catch(() => {});
    await sleep(600);
    const live = await g.page.evaluate(() => Boolean(window.__hero?.live));
    const b = await g.page.screenshot({ clip });
    await g.ctx.close();
    const mean = meanDiff(await raw(a), await raw(b));
    if (out) {
      await sharp(a).toFile(`${out}/parity-${p}-poster.png`);
      await sharp(b).toFile(`${out}/parity-${p}-gl.png`);
    }
    rows.push({ profile: p, browser: profile(p).browser, mean: Math.round(mean * 1000) / 1000, live, pass: live && mean <= SPEC.parityMax, posterSrc, slot: clip });
  }
  // The drawing's hand-over at T0 (D2, full tier, manual clock): before T0 the DOM drawing on its DOM ground; at T0 the
  // same strokes over GL's ground and the body in the ground's tone. The two must be the same picture.
  const handover = {};
  {
    const ctx = await context('D2');
    const page = await ctx.newPage();
    await page.goto(`${base}/?t=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__hero && window.__hero.flying, null, { timeout: 20000 });
    await page.evaluate(() => document.fonts.ready);
    const clip = await page.evaluate(() => {
      const b = document.querySelector('[data-hero-camera]').getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    });
    const before = await page.screenshot({ clip });
    await page.evaluate(() => window.__stage.seek(0));
    await page.evaluate(() => window.__stage.seek(0));
    const at = await page.screenshot({ clip });
    handover.state = await page.evaluate(() => ({ drawing: window.__hero.drawingState, ground: getComputedStyle(document.querySelector('.hero-ground')).opacity }));
    await ctx.close();
    handover.mean = Math.round(meanDiff(await raw(before), await raw(at)) * 1000) / 1000;
    handover.pass = handover.state.drawing === 'running' && handover.mean <= SPEC.parityMax;
    if (out) {
      await sharp(before).toFile(`${out}/handover-D2-drawing.png`);
      await sharp(at).toFile(`${out}/handover-D2-t0.png`);
    }
  }
  // Pose drift: the camera's projected box and angle across a 40% scroll of the hero (D2).
  const { page, ctx } = await open(base, 'D2', 'reduced');
  await page.waitForFunction(() => document.querySelector('[data-hero-camera]')?.classList.contains('is-gl'), null, { timeout: 15000 }).catch(() => {});
  await sleep(450);
  const at = async () => page.evaluate(() => {
    const b = window.__stage.bounds('camera');
    return { slot: b.slot, gl: b.gl };
  });
  const top = await at();
  const heroH = await page.evaluate(() => document.querySelector('[data-hero-section]').offsetHeight);
  await page.evaluate((y) => window.scrollTo(0, y), Math.round(heroH * 0.4));
  await sleep(500);
  const scrolled = await at();
  await ctx.close();
  const rel = (x) => ({ dx: x.gl.x - x.slot.x, dy: x.gl.y - x.slot.y, w: x.gl.w, h: x.gl.h, a: x.gl.angleDeg });
  const r0 = rel(top);
  const r1 = rel(scrolled);
  const drift = { angleDeg: Math.abs(r0.a - r1.a), px: Math.max(Math.abs(r0.dx - r1.dx), Math.abs(r0.dy - r1.dy), Math.abs(r0.w - r1.w), Math.abs(r0.h - r1.h)) };
  return { pass: rows.every((r) => r.pass) && drift.angleDeg < 1 && handover.pass, rows, handover, drift, top, scrolled };
}

/** 6. The strip: group 'Camera', targets >= 44 px without overlap at P2 touch, arrows = taps, swipe scrolls, tap prints;
 *  every made still is placed in print 1's slot (1 to 4 presses, through the stack trim). */
/** A viewport point on the camera that hit-tests to the camera (not print 1, not a drag hit area). */
const CAMERA_SPOT = () => {
  const cam = document.querySelector('[data-hero-camera]');
  const b = cam.getBoundingClientRect();
  for (const fy of [0.5, 0.35, 0.65, 0.2, 0.8]) {
    for (const fx of [0.6, 0.75, 0.45, 0.9, 0.3]) {
      const x = Math.round(b.left + fx * b.width);
      const y = Math.round(b.top + fy * b.height);
      const el = document.elementFromPoint(x, y);
      if (el && cam.contains(el) && !el.closest('[data-drag]')) return { x, y };
    }
  }
  return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
};

/** The hero's print state: the made stills, the newest one's opacity, GL's hold on the prints, the status, the tier. */
const PRINT_STATE = () => {
  const imgs = [...document.querySelectorAll('[data-hero-print] img.hero-still')];
  const last = imgs.at(-1);
  return {
    stills: imgs.length,
    lastSlug: last?.dataset.slug ?? 'print-1',
    lastOpacity: last ? Number(getComputedStyle(last).opacity) : null,
    flying: Boolean(window.__hero?.flying),
    fx: document.querySelector('[data-hero-section]').hasAttribute('data-fx'),
    printIsGl: document.querySelector('[data-hero-print]').classList.contains('is-gl'),
    status: document.getElementById('status')?.textContent ?? '',
    tier: document.documentElement.dataset.tier,
    tierLog: (window.__stage?.tierLog ?? []).map((e) => `${e.tier}:${e.reason}@${e.at}`),
    governorSteps: window.__stage?.stats?.governorSteps ?? null,
  };
};

/**
 * A press `delay` ms after the camera went GL (__hero.live), then the next press. Options: `demoteAt` forces the tier
 * to static that long after the first press (mid-flight); `failDecode` makes the next print's GL copy fail to decode
 * (a throw inside printNext). Each press must end on its end state: the made still visible, GL let go of the prints
 * (no flight, no data-fx), the status naming it; the next press then prints too (W-D012: presses are never lost).
 */
export async function pressRow(base, p, { delay = 0, demoteAt = null, failDecode = false, run = 1 } = {}) {
  const { page, ctx } = await open(base, p);
  const touch = !MOUSE(p);
  // A point on the camera that the camera itself receives (print 1 overlaps the grip side by design, W-D009).
  const spot = touch ? await page.evaluate(CAMERA_SPOT) : null;
  const press = () => (touch ? page.touchscreen.tap(spot.x, spot.y) : page.click('[data-shutter]'));
  // On the full tier the opening runs first; a press waits for it (an early press is a guard, inputGuard's line).
  if (!touch) await heroAtRest(page).catch(() => {});
  const live = await page.waitForFunction(() => window.__hero?.live, null, { timeout: WAIT.patience }).then(() => true, () => false);
  const liveAt = await page.evaluate(() => performance.now());
  await sleep(delay);
  if (failDecode) {
    // Only images outside the document fail: the camera's GL copies (stillTexture), not the page's own.
    await page.evaluate(() => {
      const decode = (window.__decode = HTMLImageElement.prototype.decode);
      HTMLImageElement.prototype.decode = function () {
        return this.isConnected ? decode.call(this) : Promise.reject(new DOMException('test: no decode', 'EncodingError'));
      };
    });
  }
  const pressedAt = await page.evaluate(() => performance.now());
  await press();
  let demoted = null;
  if (demoteAt !== null) {
    await sleep(demoteAt);
    demoted = await page.evaluate(() => ({ during: { flying: Boolean(window.__hero?.flying), fx: document.querySelector('[data-hero-section]').hasAttribute('data-fx') }, changed: window.__stage.demote('static', 'test') }));
  }
  await sleep(demoteAt !== null ? WAIT.fade + WAIT.settle : WAIT.press);
  const first = await page.evaluate(PRINT_STATE);
  if (failDecode) await page.evaluate(() => { HTMLImageElement.prototype.decode = window.__decode; });
  await press();
  await sleep(first.tier === 'static' ? WAIT.fade + WAIT.settle : WAIT.press);
  const second = await page.evaluate(PRINT_STATE);
  const placement = await page.evaluate(PLACEMENT);
  await ctx.close();
  const ended = (s) => s.lastOpacity === 1 && !s.flying && !s.fx && !s.printIsGl && /Printed/.test(s.status);
  const pass = live && ended(first) && first.stills === 2 && ended(second) && second.stills === 3 && second.lastSlug !== first.lastSlug && second.status !== first.status && placement.every((x) => x.ok) && (demoteAt === null || (demoted?.during.flying && second.tier === 'static'));
  return { profile: p, run, delayMs: delay, demoteAtMs: demoteAt, failDecode, live, pressedAfterLiveMs: Math.round(pressedAt - liveAt), demoted, first, second, placement, pass };
}

export async function strip(base) {
  const { page, ctx } = await open(base, 'P2');
  await page.evaluate(() => document.fonts.ready);
  const group = await page.getByRole('group', { name: 'Camera' }).count();
  const targets = await page.evaluate(() => [...document.querySelectorAll('[data-camera-strip] button, [data-camera-strip] input')].map((e) => {
    const b = e.getBoundingClientRect();
    return { name: e.value || e.textContent.trim(), x: b.x, y: b.y, w: b.width, h: b.height };
  }));
  const small = targets.filter((t) => t.w < 44 || t.h < 44);
  const overlaps = [];
  for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
    const a = targets[i];
    const b = targets[j];
    if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) overlaps.push([a.name, b.name]);
  }
  const state = () => page.evaluate(() => ({
    lens: document.querySelector('input[name="camera-lens"]:checked').value,
    look: document.querySelector('input[name="camera-look"]:checked').value,
    readout: [...document.querySelectorAll('[data-readout]')].map((e) => e.textContent).join(' | '),
  }));
  await page.tap('input[name="camera-lens"][value="135"]');
  await page.tap('input[name="camera-look"][value="cyanotype"]');
  const tapped = await state();
  await ctx.close();
  const k = await open(base, 'P2');
  await k.page.focus('input[name="camera-lens"]:checked');
  await k.page.keyboard.press('ArrowRight');
  await k.page.keyboard.press('ArrowRight');
  await k.page.focus('input[name="camera-look"]:checked');
  for (let i = 0; i < 4; i++) await k.page.keyboard.press('ArrowRight');
  const keyed = await k.page.evaluate(() => ({
    lens: document.querySelector('input[name="camera-lens"]:checked').value,
    look: document.querySelector('input[name="camera-look"]:checked').value,
    readout: [...document.querySelectorAll('[data-readout]')].map((e) => e.textContent).join(' | '),
  }));
  const cam = await k.page.evaluate(() => {
    const b = document.querySelector('[data-hero-camera]').getBoundingClientRect();
    return { x: b.x + b.width * 0.85, y: b.y + b.height / 2 };
  });
  const cdp = await k.ctx.newCDPSession(k.page);
  const y0 = await k.page.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cam.x, y: cam.y }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cam.x, y: cam.y - i * 24 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1500);
  const y1 = await k.page.evaluate(() => scrollY);
  await k.page.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);
  await k.page.waitForFunction(() => !window.__hero || window.__hero.live, null, { timeout: 8000 }).catch(() => {});
  // Taps on the camera press the shutter: each makes the next print (GL ejects it on lite), announced and placed.
  const presses = [];
  for (let n = 1; n <= 4; n++) {
    const before = await k.page.evaluate(() => document.querySelectorAll('[data-hero-print] img.hero-still').length);
    await k.page.tap('[data-hero-camera]', { position: { x: 20, y: 20 } });
    await sleep(heroTimeline.developed + durations.glHandback + 600);
    const after = await k.page.evaluate(() => ({ stills: document.querySelectorAll('[data-hero-print] img.hero-still').length, status: document.getElementById('status')?.textContent ?? '' }));
    const placement = await k.page.evaluate(PLACEMENT);
    presses.push({ n, before, after, placement, pass: after.stills === Math.min(before + 1, 3) && /Printed/.test(after.status) && placement.every((x) => x.ok) });
  }
  await k.ctx.close();
  // Early taps (gate, round 2: on WebKit lite a tap within about 0.7 s of the camera going GL was lost when the
  // governor dropped the tier mid-flight). Taps at 0, 3/8 and 7/8 of an eject after __hero.live, twice each.
  const early = [];
  for (const p of ['WK-P2', 'WK-T2']) for (const f of EARLY_TAPS) for (let run = 1; run <= 2; run++) early.push(await pressRow(base, p, { delay: f * durations.eject, run }));
  // The tier forced to static mid-flight (Chromium and WebKit), and a print whose GL copy fails to decode.
  const dropped = [];
  for (const p of ['P2', 'WK-P2']) dropped.push(await pressRow(base, p, { demoteAt: MID_FLIGHT }));
  const thrown = [await pressRow(base, 'P2', { failDecode: true })];
  const same = tapped.lens === keyed.lens && tapped.look === keyed.look && tapped.readout === keyed.readout;
  const pass = group === 1 && small.length === 0 && overlaps.length === 0 && same && y1 - y0 > 100 && presses.every((p) => p.pass) && [...early, ...dropped, ...thrown].every((r) => r.pass);
  return { pass, group, targets: targets.length, small, overlaps, tapped, keyed, identical: same, swipeScrolledPx: y1 - y0, presses, early, dropped, thrown };
}
/** Fractions of an eject after the camera goes GL: the window where early taps were lost (gate, round 2). */
const EARLY_TAPS = [0, 3 / 8, 7 / 8];
/** After a press: the print is in the air (the flight's start plus half the time to its landing dip). */
const MID_FLIGHT = heroTimeline.flight - heroTimeline.shutter + (heroTimeline.landingDip - heroTimeline.flight) / 2;

/** 7. __motionLog overshoots (measured) within +-0.5 points of the table; the opening's phases logged in order and
 *  all automatic motion under 5 s; holding Space or Enter on the shutter: <= 1 flash a second. */
export async function motion(base) {
  const table = Object.fromEntries(Object.entries(springs).map(([k, v]) => [k, v.overshootPct]));
  const { page, ctx } = await open(base, 'D2');
  await page.waitForFunction(() => performance.getEntriesByName('hero:developed').length > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(500);
  const marks = await page.evaluate(() => Object.fromEntries(['hero:t0', 'hero:developed'].map((n) => [n, performance.getEntriesByName(n)[0]?.startTime ?? null])));
  await page.click('input[name="camera-lens"][value="85"]');
  await page.click('input[name="camera-look"][value="vivid"]');
  await sleep(1200);
  await page.click('[data-shutter]');
  await sleep(heroTimeline.developed + 1000);
  const log = await page.evaluate(() => window.__motionLog.slice());
  await ctx.close();
  const springRows = log.filter((e) => e.spring && table[e.spring] !== undefined && e.to !== e.from).map((e) => {
    const os = Math.max(0, ((e.peak - e.to) / (e.to - e.from)) * 100);
    return { id: e.id, spring: e.spring, measured: Boolean(e.measured), overshootPct: Math.round(os * 100) / 100, table: table[e.spring], ok: Math.abs(os - table[e.spring]) <= 0.5 };
  });
  const kinds = new Set(springRows.map((r) => r.spring));
  // The opening: clay, then silver, black, amber (each starts no earlier than the one before), and the lines fading.
  const phase = (id) => log.find((e) => e.id === `hero:drawing:${id}`);
  const order = ['clay', 'silver', 'black', 'amber'].map(phase);
  const phasesOk = order.every(Boolean) && Boolean(phase('lines-fade')) && order.every((p, i) => i === 0 || p.t0 >= order[i - 1].t0) && order[3].t1 >= order[2].t1;
  // All automatic motion: from T0 to print 1's handback.
  const automaticMs = marks['hero:t0'] !== null && marks['hero:developed'] !== null ? Math.round(marks['hero:developed'] - marks['hero:t0'] + durations.glHandback) : null;
  const capOk = automaticMs !== null && automaticMs < SPEC.motionCapMs;
  const holds = [];
  for (const scheme of ['light', 'dark']) {
    for (const key of ['Space', 'Enter']) {
      const h = await open(base, 'D2', 'auto', { colorScheme: scheme });
      await h.page.waitForFunction(() => performance.getEntriesByName('hero:developed').length > 0 || document.documentElement.dataset.hero === 'done', null, { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      await h.page.focus('[data-shutter]');
      const cdp = await h.ctx.newCDPSession(h.page);
      const code = key === 'Space' ? { key: ' ', code: 'Space', windowsVirtualKeyCode: 32 } : { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
      const t0 = await h.page.evaluate(() => performance.now());
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...code, text: key === 'Space' ? ' ' : '\r' });
      const end = Date.now() + 5000;
      while (Date.now() < end) {
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...code, autoRepeat: true, text: key === 'Space' ? ' ' : '\r' });
        await sleep(33);
      }
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...code });
      await sleep(heroTimeline.developed + 1000);
      const flashes = await h.page.evaluate((from) => window.__motionLog.filter((e) => e.kind === 'flash' && e.t0 >= from).map((e) => e.t0), t0);
      await h.ctx.close();
      let worst = 0;
      for (const f of flashes) worst = Math.max(worst, flashes.filter((g) => g >= f && g < f + 1000).length);
      holds.push({ scheme, key, flashes: flashes.length, worstPerSecond: worst, pass: worst <= 1 });
    }
  }
  const measuredOk = springRows.filter((r) => r.spring === 'settle' || r.id.includes(':dip')).every((r) => r.measured);
  const pass = springRows.length > 0 && springRows.every((r) => r.ok) && ['press', 'detent', 'settle'].every((k) => kinds.has(k)) && measuredOk && phasesOk && capOk && holds.every((h) => h.pass);
  return { pass, springs: springRows, kinds: [...kinds], measuredOk, phases: order.concat(phase('lines-fade')), phasesOk, automaticMs, capMs: SPEC.motionCapMs, capOk, holds, log };
}

/** 7b. Seeked filmstrip of the opening (?t=0) for the WCAG 2.3.1 flash analyser, in both schemes; frames on disk. */
export async function flashFilm(base, { out, profileName = 'D2', scheme = 'light', fps = 60, save = [] } = {}) {
  const { analyse } = await import('../harness/flash/analyse.mjs');
  const ms = durations.heroDrawingClay + durations.heroDrawingDevelop + heroTimeline.landingDip;
  const ctx = await context(profileName, 'auto', { colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto(`${base}/?t=0`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hero && window.__hero.flying, null, { timeout: 20000 });
  const frames = [];
  for (let i = 0; i <= (ms * fps) / 1000; i++) {
    const t = (i * 1000) / fps;
    await page.evaluate((x) => window.__stage.seek(x), t);
    const buf = await page.screenshot();
    if (out && save.includes(Math.round(t))) await sharp(buf).toFile(`${out}/film-${profileName}-${scheme}-${String(Math.round(t)).padStart(4, '0')}.png`);
    const { data, info } = await sharp(buf).resize({ width: 512 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    frames.push({ data, width: info.width, height: info.height, channels: info.channels });
  }
  await ctx.close();
  const r = analyse(frames, fps);
  return { pass: r.pass, scheme, profile: profileName, ms, ...r };
}

/** 8. Reduced motion and static: print 1 developed at FCP, the finished camera from first paint (no drawing), a
 *  shutter press swaps prints with a 200 ms fade, every made still placed (1 to 4 presses), 0 px shift vs auto. */
export async function reducedStatic(base) {
  const rows = [];
  for (const p of ['D2', 'P2', 'T2', 'S1']) {
    const geo = {};
    for (const mode of ['auto', 'reduced', 'static']) {
      const { page, ctx } = await open(base, p, mode, { init: FCP_PROBE });
      await page.waitForFunction(() => window.__w1?.fcp, null, { timeout: 10000 }).catch(() => {});
      if (mode === 'auto') await heroAtRest(page).catch(() => {});
      else await sleep(800);
      const g = await heroRects(page);
      const fcp = await page.evaluate(() => window.__w1.fcp);
      const camSeen = await page.evaluate(() => window.__w1.camSeen);
      let swap = null;
      const presses = [];
      if (mode !== 'auto') {
        await page.click('[data-shutter]');
        await sleep(60);
        swap = await page.evaluate(() => {
          const imgs = document.querySelectorAll('[data-hero-print] img.hero-still');
          const img = imgs[imgs.length - 1];
          const anims = img.getAnimations().map((a) => ({ duration: a.effect.getTiming().duration, props: a.effect.getKeyframes().map((k) => Object.keys(k).filter((x) => !['offset', 'computedOffset', 'easing', 'composite'].includes(x))).flat() }));
          return { stills: imgs.length, anims, flying: Boolean(window.__hero?.flying), fx: document.querySelector('[data-hero-section]').hasAttribute('data-fx') };
        });
        await sleep(durations.reduced + 100);
        presses.push({ n: 1, placement: await page.evaluate(PLACEMENT) });
        for (let n = 2; n <= 4; n++) {
          await page.click('[data-shutter]');
          await sleep(durations.reduced + 100);
          presses.push({ n, placement: await page.evaluate(PLACEMENT) });
        }
      }
      geo[mode] = { g, printAtFcp: fcp?.print, camAtFcp: fcp?.cam, camSeen, swap, presses: presses.map((x) => ({ ...x, pass: x.placement.length === Math.min(x.n + 1, 3) && x.placement.every((s) => s.ok) })) };
      await ctx.close();
    }
    const keys = ['h1', 'line', 'cta', 'camera', 'print', 'strip'];
    const shift = (a, b) => Math.max(...keys.map((k) => Math.max(Math.abs(a[k].x - b[k].x), Math.abs(a[k].y - b[k].y), Math.abs(a[k].w - b[k].w), Math.abs(a[k].h - b[k].h))));
    const shiftReduced = shift(geo.auto.g, geo.reduced.g);
    const shiftStatic = shift(geo.auto.g, geo.static.g);
    const fade = (s) => s && s.anims.some((a) => a.duration === durations.reduced && a.props.includes('opacity')) && !s.flying && !s.fx;
    const noDrawing = (m) => geo[m].camAtFcp === 'camera' && !(geo[m].camSeen ?? []).includes('drawing');
    const placed = (m) => geo[m].presses.length === 4 && geo[m].presses.every((x) => x.pass);
    const pass = geo.reduced.printAtFcp?.ok && geo.static.printAtFcp?.ok && noDrawing('reduced') && noDrawing('static') && fade(geo.reduced.swap) && fade(geo.static.swap) && placed('reduced') && placed('static') && shiftReduced <= 0.5 && shiftStatic <= 0.5;
    rows.push({ profile: p, pass: Boolean(pass), shiftReducedPx: shiftReduced, shiftStaticPx: shiftStatic, reduced: { printAtFcp: geo.reduced.printAtFcp, camAtFcp: geo.reduced.camAtFcp, swap: geo.reduced.swap, presses: geo.reduced.presses }, static: { printAtFcp: geo.static.printAtFcp, camAtFcp: geo.static.camAtFcp, swap: geo.static.swap, presses: geo.static.presses } });
  }
  // The tier dropping to static during a flight (full on D2, lite on P2): the flying print ends on its still at
  // once, and the next press prints with the static fade.
  const dropped = [];
  for (const p of ['D2', 'P2']) dropped.push(await pressRow(base, p, { demoteAt: MID_FLIGHT }));
  return { pass: rows.every((r) => r.pass) && dropped.every((r) => r.pass), rows, dropped };
}

/** Pre-GL bytes (budgets.md) from the network log, with the hero on the page: the JavaScript delivered before
 *  stage:gl-start at D2 (full) and P2 (lite), and the camera chunk, three and the camera model never requested
 *  before it (review must-fix 4: size-limit's static closure cannot see the hero's dynamic imports). */
export async function preGl(base, { runs = 3 } = {}) {
  const camChunk = chunkOf('src/gl/camera/index.ts');
  const rows = [];
  for (const p of ['D2', 'P2']) {
    for (let i = 0; i < runs; i++) {
      await H.closeBrowsers();
      const ctx = await context(p);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      const reqs = new Map();
      cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, type: e.type }));
      cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.type = e.type; });
      cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength; });
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.waitForFunction(() => ['ready', 'failed'].includes(window.__stage?.glState), null, { timeout: 15000 }).catch(() => {});
      await sleep(1500);
      const t = await page.evaluate(() => ({ glStart: performance.getEntriesByName('stage:gl-start')[0]?.startTime ?? null, resources: performance.getEntriesByType('resource').map((r) => ({ url: r.name, start: r.startTime })) }));
      await ctx.close();
      const startOf = (url) => t.resources.find((r) => r.url === url)?.start ?? Infinity;
      const scripts = [...reqs.values()].filter((r) => r.type === 'Script' && r.bytes);
      const before = scripts.filter((r) => t.glStart === null || startOf(r.url) < t.glStart);
      const bytes = before.reduce((n, r) => n + r.bytes, 0);
      const early = [...reqs.values()].filter((r) => (r.url.includes(camChunk ?? '\0') || /three\.module|camera_xt_lod\d\.glb/.test(r.url)) && startOf(r.url) < (t.glStart ?? Infinity)).map((r) => r.url.replace(base, ''));
      rows.push({ profile: p, run: i + 1, glStartMs: t.glStart === null ? null : Math.round(t.glStart), preGlBytes: bytes, early, scripts: scripts.map((r) => ({ url: r.url.replace(base, ''), bytes: r.bytes, startedMs: Math.round(startOf(r.url)), preGL: before.includes(r) })), pass: t.glStart !== null && bytes > 0 && bytes <= SPEC.preGlBytes && early.length === 0 });
    }
  }
  await H.closeBrowsers();
  return { pass: rows.every((r) => r.pass), cameraChunk: camChunk, budgetBytes: SPEC.preGlBytes, rows };
}

/** The built chunks that are GL code by budgets.md's list (three and its addons, anime, stage GL, src/gl: effects and
 *  the camera), from the Vite manifest; W-F's /bench/ tools are never on the home page. */
function glChunks() {
  const m = JSON.parse(readFileSync(join(H.ROOT, 'node_modules/.cache/portfolio-build/vite-manifest.json'), 'utf8'));
  const gl = (mod) => /^(node_modules\/(three|animejs)\/|src\/stage\/gl\/|src\/gl\/)/.test(mod) && !/src\/stage\/gl\/(bench|fixtures)\.ts$/.test(mod);
  return Object.values(m).filter((c) => c.modules.some(gl)).map((c) => ({ file: c.file, modules: c.modules.filter(gl) }));
}

/** budgets.md's GL chunk (review round 2 must-fix 3: the camera chunk counts). Every GL script in the network log of a
 *  first full-tier visit (D2) up to hero:readable, summed as delivered (gzip bodies from the harness server), plus each
 *  file's gzip -9 size; fails over the budget. 3 cold loads. */
export async function glBytes(base, { runs = 3 } = {}) {
  const { gzipSync } = await import('node:zlib');
  const chunks = glChunks();
  const isGl = (url) => chunks.some((c) => url.endsWith(`/${c.file}`));
  const rows = [];
  for (let i = 0; i < runs; i++) {
    await H.closeBrowsers();
    const ctx = await context('D2');
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    const reqs = new Map();
    cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url }));
    // The body as delivered: everything received minus the response headers.
    cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.head = e.response.encodedDataLength; });
    cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength - (r.head ?? 0); });
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => performance.getEntriesByName('hero:readable').length > 0, null, { timeout: WAIT.patience }).catch(() => {});
    const t = await page.evaluate(() => ({ readable: performance.getEntriesByName('hero:readable')[0]?.startTime ?? null, resources: performance.getEntriesByType('resource').map((r) => ({ url: r.name, start: r.startTime })) }));
    await ctx.close();
    const startOf = (url) => t.resources.find((r) => r.url === url)?.start ?? Infinity;
    const scripts = [...reqs.values()].filter((r) => r.bytes && isGl(r.url) && startOf(r.url) < (t.readable ?? Infinity));
    const files = scripts.map((r) => {
      const file = r.url.replace(`${base}/`, '');
      return { file, deliveredBytes: r.bytes, gzip9Bytes: gzipSync(readFileSync(join(H.ROOT, 'dist', file)), { level: 9 }).length };
    });
    const delivered = files.reduce((n, f) => n + f.deliveredBytes, 0);
    const gzip9 = files.reduce((n, f) => n + f.gzip9Bytes, 0);
    rows.push({ run: i + 1, readableMs: t.readable === null ? null : Math.round(t.readable), deliveredBytes: delivered, gzip9Bytes: gzip9, files, pass: t.readable !== null && files.some((f) => /camera\./.test(f.file)) && Math.max(delivered, gzip9) <= SPEC.glBytes });
  }
  await H.closeBrowsers();
  return { pass: rows.every((r) => r.pass), budgetBytes: SPEC.glBytes, chunks, rows };
}

/** A2. On lite, the drawing's crossfade never makes the finished-camera poster the LCP element: the LCP stays the h1
 *  or print 1's still (5-run LCP element log, P2 and T2). */
export async function liteLcp(base, { runs = 5, profiles = ['P2', 'T2'] } = {}) {
  const rows = [];
  for (const p of profiles) {
    for (let i = 0; i < runs; i++) {
      const { page, ctx } = await open(base, p, 'auto', { init: FCP_PROBE });
      await page.waitForFunction(() => document.documentElement.dataset.cam === 'camera', null, { timeout: 8000 }).catch(() => {});
      await sleep(800);
      const r = await page.evaluate(() => ({ lcp: window.__w1.lcp, camSeen: window.__w1.camSeen, tier: document.documentElement.dataset.tier, crossfade: (window.__motionLog ?? []).find((e) => e.id === 'hero:drawing:crossfade') ?? null }));
      await ctx.close();
      const last = r.lcp.at(-1)?.el ?? null;
      const poster = r.lcp.filter((e) => /hero-(poster|lines)/.test(e.el ?? ''));
      rows.push({ profile: p, run: i + 1, tier: r.tier, lcpElement: last, lcp: r.lcp, crossfade: Boolean(r.crossfade), camSeen: r.camSeen, pass: r.tier === 'lite' && Boolean(r.crossfade) && poster.length === 0 && (/^h1/.test(last ?? '') || /data-lcp=print-1/.test(last ?? '')) });
    }
  }
  return { pass: rows.every((r) => r.pass), rows };
}

/** A2: no literal duration or budget in src/ or tests/w-s1/: the hero drawing durations and heroTimelineMs values do
 *  not appear as numbers in the hero's code (comments aside); they are read from the tokens. */
export async function tokensOnly() {
  const files = ['src/sections/hero/hero.ts', 'src/sections/hero/layout.ts', 'src/sections/hero/Hero.astro', 'src/gl/camera/index.ts', 'src/gl/camera/drawing.ts', 'src/gl/effects/develop/index.ts', 'src/gl/effects/develop/camera.ts', 'tests/w-s1/checks.mjs', 'tests/w-s1/lib.mjs', 'tests/w-s1/run.mjs'];
  const values = [durations.heroDrawingClay, durations.heroDrawingDevelop, durations.heroDrawingFade, heroTimeline.readableAfterGlReady, heroTimeline.budgetAfterGlReady, heroTimeline.developed, heroTimeline.readable, heroTimeline.landingDip, heroTimeline.flight, heroTimeline.developStart, heroTimeline.eject];
  const hits = [];
  for (const f of files) {
    const code = readFileSync(join(H.ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const v of values) {
      for (const m of code.matchAll(new RegExp(`(?<![\\w.])${v}(?![\\w.])`, 'g'))) {
        // Not a time: a font weight, a viewport or profile size (X1180, width: 1180).
        if (/(font(-weight)?:\s*|width:\s*|height:\s*|X)$/.test(code.slice(Math.max(0, m.index - 14), m.index))) continue;
        hits.push({ file: f, value: v, line: code.slice(0, m.index).split('\n').length, text: code.slice(Math.max(0, m.index - 30), m.index + 10).replace(/\s+/g, ' ') });
      }
    }
  }
  return { pass: hits.length === 0, values, hits };
}

/** 9. Hero wet GPU <= 1.5x the prototype median at D2: /bench/ hero3 (the prototype's wet stand-in) against the
 *  hero's own develop shader at the same size, 5 fresh loads each, renderer string recorded. */
export async function gpu(base, { loads = 5 } = {}) {
  const proto = [];
  const hero = [];
  let renderer = null;
  for (let i = 0; i < loads; i++) {
    const c = await context('D2');
    const pg = await c.newPage();
    await pg.goto(`${base}/bench/`, { waitUntil: 'load' });
    await pg.waitForFunction(() => window.__bench, null, { timeout: 15000 });
    const r = await pg.evaluate(() => window.__bench.run({ scenario: 'hero3', warmup: 30, frames: 60 }));
    proto.push(r.medianMs);
    renderer = r.renderer;
    await c.close();
    const { page, ctx } = await open(base, 'D2', 'reduced');
    await page.waitForFunction(() => window.__hero && document.querySelector('[data-hero-camera]')?.classList.contains('is-gl'), null, { timeout: 15000 });
    await sleep(300);
    const h = await page.evaluate(() => window.__hero.bench({ warmup: 30, frames: 60 }));
    hero.push(h.medianMs);
    await ctx.close();
  }
  const pm = median(proto);
  const hm = median(hero);
  const valid = renderer && !H.SOFTWARE_RENDERER.test(renderer);
  return { pass: Boolean(valid) && hm <= 1.5 * pm, renderer, valid, prototypeMedianMs: pm, heroMedianMs: hm, ratio: Math.round((hm / pm) * 1000) / 1000, proto, hero };
}

/** Evidence: seeked hero filmstrips on the manual clock (?t=0). Full: the opening (drawing, clay, the develop) and
 *  the W-D012 keys of the eject sequence after it. Reduced: a shutter press and its 200 ms fade. Frames on disk plus
 *  one contact sheet per strip. */
export async function filmstrips(base, { out, profileName = 'D2' } = {}) {
  const strips = [];
  {
    const D = durations.heroDrawingClay + durations.heroDrawingDevelop;
    const T = heroTimeline;
    const drawingKeys = [0, durations.heroDrawingClay / 2, durations.heroDrawingClay, durations.heroDrawingClay + durations.heroDrawingDevelop * 0.15, durations.heroDrawingClay + durations.heroDrawingDevelop * 0.3, durations.heroDrawingClay + durations.heroDrawingDevelop * 0.5, durations.heroDrawingClay + durations.heroDrawingDevelop * 0.75];
    const seqKeys = [T.brackets, T.shutter, T.flash, T.eject, T.developStart, T.flight, T.landingDip, T.readable, T.developed, T.developed + durations.glHandback + 100].map((k) => D + k);
    const keys = [...drawingKeys, ...seqKeys].map(Math.round);
    const ctx = await context(profileName, 'auto');
    const page = await ctx.newPage();
    await page.goto(`${base}/?t=0`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__hero && window.__hero.flying, null, { timeout: 20000 });
    const files = [];
    for (const t of keys) {
      await page.evaluate((x) => window.__stage.seek(x), t);
      await page.evaluate((x) => window.__stage.seek(x), t);
      const f = `${out}/full-${profileName}-${String(t).padStart(4, '0')}.png`;
      await page.screenshot({ path: f });
      files.push(f);
    }
    await ctx.close();
    strips.push({ mode: 'full', keys, files });
  }
  {
    const keys = [0, 0.25, 0.5, 0.75, 1, 1.3].map((f) => Math.round(f * durations.reduced));
    const ctx = await context(profileName, 'reduced');
    const page = await ctx.newPage();
    await page.goto(`${base}/?t=0`, { waitUntil: 'load' });
    await sleep(2500);
    await page.click('[data-shutter]');
    const files = [];
    for (const t of keys) {
      await page.evaluate((x) => window.__stage.seek(x), t);
      const f = `${out}/reduced-${profileName}-${String(t).padStart(4, '0')}.png`;
      await page.screenshot({ path: f });
      files.push(f);
    }
    await ctx.close();
    strips.push({ mode: 'reduced', keys, files });
  }
  for (const s of strips) {
    const tiles = await Promise.all(s.files.map((f) => sharp(f).resize({ width: 480 }).toBuffer()));
    const meta = await sharp(tiles[0]).metadata();
    const cols = 4;
    const rows = Math.ceil(tiles.length / cols);
    await sharp({ create: { width: 480 * cols, height: meta.height * rows, channels: 3, background: '#808080' } })
      .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * 480, top: Math.floor(i / cols) * meta.height })))
      .png()
      .toFile(`${out}/filmstrip-${s.mode}-${profileName}.png`);
  }
  return { pass: strips.every((s) => s.files.length === s.keys.length), strips: strips.map((s) => ({ mode: s.mode, keys: s.keys, frames: s.files.length })) };
}
