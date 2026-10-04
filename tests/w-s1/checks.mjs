// W-S1 acceptance checks (issue #13), one function per acceptance line. Each returns { pass, ... } and never throws
// for a failed expectation (only for a broken harness). run.mjs runs them and writes the JSON evidence.
import sharp from 'sharp';
import { H, context, heroAtRest, heroRects, median, open, profile, rectsIntersect } from './lib.mjs';

const GES = ['D1', 'D2', 'D3', 'T1', 'T2', 'P1', 'P2', 'S1', 'S2'];
const MOUSE = (p) => profile(p).input === 'mouse';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The state of the first screen at the first contentful paint, recorded by a paint observer in the page, and the
// final LCP candidate.
const FCP_PROBE = () => {
  window.__w1 = { fcp: null, lcp: [] };
  const vis = (el) => {
    if (!el) return { ok: false, why: 'missing' };
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const inView = b.width > 0 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth;
    let o = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
    const img = el.tagName === 'IMG' ? el.complete && el.naturalWidth > 0 : true;
    return { ok: inView && o > 0.99 && cs.visibility === 'visible' && img, inView, opacity: o, loaded: img, rect: [b.x, b.y, b.width, b.height].map(Math.round) };
  };
  new PerformanceObserver((l) => {
    const e = l.getEntriesByName('first-contentful-paint')[0];
    if (!e || window.__w1.fcp) return;
    const q = (s) => document.querySelector(s);
    window.__w1.fcp = {
      t: e.startTime,
      h1: vis(q('h1')),
      lineSlot: vis(q('.hero-line .ph') || q('.hero-line')),
      cta: vis(q('.hero-cta a')),
      strip: vis(q('[data-camera-strip]')),
      poster: vis(q('.hero-poster')),
      print: vis(q('[data-hero-print] img.hero-still')),
    };
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__w1.lcp.push({ t: e.startTime, size: e.size, el: e.element ? e.element.tagName.toLowerCase() + (e.element.dataset?.lcp ? `[data-lcp=${e.element.dataset.lcp}]` : '') + (e.element.className ? `.${String(e.element.className).split(' ')[0]}` : '') : null });
  }).observe({ type: 'largest-contentful-paint', buffered: true });
};

/** 1. FCP shows the h1, the line slot, the CTA, the strip and the camera poster; the LCP element per profile. */
export async function fcp(base, { profiles = [...GES, 'WK-P2', 'WK-T2'] } = {}) {
  const rows = [];
  for (const p of profiles) {
    const { page, ctx } = await open(base, p, 'auto', { init: FCP_PROBE });
    await page.waitForFunction(() => window.__w1?.fcp, null, { timeout: 10000 }).catch(() => {});
    await sleep(1500);
    const r = await page.evaluate(() => window.__w1);
    await ctx.close();
    const f = r?.fcp;
    const shown = f && ['h1', 'lineSlot', 'cta', 'strip', 'poster'].every((k) => f[k]?.ok);
    const last = r?.lcp?.at(-1)?.el ?? null;
    const lcpOk = MOUSE(p) ? /^h1/.test(last ?? '') : /^h1/.test(last ?? '') || /data-lcp=print-1/.test(last ?? '');
    rows.push({ profile: p, pass: Boolean(shown && lcpOk), shown, lcpElement: last, lcpOk, fcp: f });
  }
  return { pass: rows.every((r) => r.pass), rows };
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
  // One line box; the brackets' 0.07em rest offset may hang past the h1's own box into the gutter (by design), so
  // the page overflow below is the clipping test, not the h1's scroll width.
  const oneLine = lines.every((l) => l.lines === 1);
  // Monotonic: at each fixed height, sweep the width up and require the size never to drop by more than 5%.
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
  // Text spacing (WCAG 1.4.12) and 200% zoom: no clipped text, overflow 0.
  const SPACING = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-block-end:2em!important}';
  const stress = [];
  for (const [p, spacing] of [['D2', true], ['P2', true], ['S2', true], ['Z-D2', false], ['Z-P2', false]]) {
    const { page: pg, ctx: c } = await open(base, p);
    if (spacing) await pg.addStyleTag({ content: SPACING });
    await pg.evaluate(() => document.fonts.ready);
    await sleep(400);
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

/** 3. First screen: the whole camera and print 1 in the viewport, the lens never covered, print size rules, no text
 *  over a GL rect at rest, and the flight never crosses the h1, lede or CTA. */
export async function firstScreen(base, { profiles = ['D1', 'D2', 'D3', 'S1', 'T1', 'T2', 'P1', 'P2', 'S2', 'L844'] } = {}) {
  const rows = [];
  for (const p of profiles) {
    const { page, ctx } = await open(base, p);
    await heroAtRest(page).catch(() => {});
    const g = await heroRects(page);
    const flight = await page.evaluate(() => (window.__hero ? window.__hero.flightLog.slice() : []));
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
    // The lens disc: centred on the projected lens front, about a fifth of the camera's width in radius.
    const lens = { cx: g.camera.x + g.lens.x * g.camera.w, cy: g.camera.y + g.lens.y * g.camera.h, r: 0.17 * g.camera.w };
    const lensClear = g.print.x + g.print.w <= lens.cx - lens.r || g.print.y >= lens.cy + lens.r || g.print.x >= lens.cx + lens.r;
    const narrow = g.vw < 1024;
    const landscapePhone = g.vh <= 500 && g.vw > g.vh;
    const windowW = (g.printLayoutW * 46) / 54;
    const sizeRule = narrow && !landscapePhone ? g.printLayoutW >= 0.5 * g.contentW - 0.5 : landscapePhone ? null : windowW >= 220;
    const noFly = [g.h1, g.line, g.cta];
    const crossings = flight.filter((b) => noFly.some((r) => rectsIntersect(r, { x: b.x, y: b.y, w: b.w, h: b.h })));
    const pass = inView(g.camera) && inView(g.print) && lensClear && sizeRule !== false && textOverGl.length === 0 && crossings.length === 0;
    rows.push({ profile: p, pass, cameraInView: inView(g.camera), printInView: inView(g.print), lensClear, sizeRule, printW: g.printLayoutW, contentW: g.contentW, windowW: Math.round(windowW), textOverGl, flightFrames: flight.length, crossings: crossings.slice(0, 5), geometry: g });
  }
  return { pass: rows.every((r) => r.pass), rows };
}

/** 4a. hero:readable minus stage:gl-ready, median of 3 cold loads (a fresh browser each). */
export async function readable(base, { loads = 3, profileName = 'D2' } = {}) {
  const runs = [];
  for (let i = 0; i < loads; i++) {
    await H.closeBrowsers();
    const { page, ctx } = await open(base, profileName);
    await page.waitForFunction(() => performance.getEntriesByName('hero:readable').length || document.documentElement.dataset.hero === 'done', null, { timeout: 15000 }).catch(() => {});
    const m = await page.evaluate(() => {
      const t = (n) => performance.getEntriesByName(n, 'mark')[0]?.startTime ?? null;
      return { glReady: t('stage:gl-ready'), t0: t('hero:t0'), readable: t('hero:readable'), camReady: t('hero:cam-ready'), renderer: window.__stage?.gl?.rendererName ?? null };
    });
    await ctx.close();
    runs.push({ ...m, delta: m.readable !== null && m.glReady !== null ? Math.round(m.readable - m.glReady) : null });
  }
  await H.closeBrowsers();
  const deltas = runs.map((r) => r.delta).filter((d) => d !== null);
  const med = median(deltas);
  return { pass: deltas.length === loads && med <= 2100, medianMs: med, budgetMs: 2100, runs };
}

/** 4b. With the GL chunk delayed 3 s, a developed print 1 is visible by FCP + 2.6 s. */
export async function delayedGl(base, { profileName = 'D2', out } = {}) {
  const ctx = await context(profileName);
  const page = await ctx.newPage();
  await page.route(/\/_astro\/gl\.[^/]+\.js$/, async (route) => {
    await sleep(3000);
    await route.continue();
  });
  await page.addInitScript(() => {
    window.__dg = { fcp: null, visibleAt: null };
    new PerformanceObserver((l) => {
      const e = l.getEntriesByName('first-contentful-paint')[0];
      if (e) window.__dg.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
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
  // The recording: frames every 250 ms from navigation until GL has arrived and the camera is live.
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
  const r = await page.evaluate(() => ({ ...window.__dg, hero: document.documentElement.dataset.hero, guard: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('hero:guard')).map((m) => m.name) }));
  if (out) await page.screenshot({ path: `${out}/delayed-gl-D2-end.png` });
  await ctx.close();
  const budget = r.fcp !== null ? r.fcp + 2600 : null;
  return { pass: r.visibleAt !== null && budget !== null && r.visibleAt <= budget, fcp: r.fcp, visibleAt: r.visibleAt, budget, hero: r.hero, guard: r.guard, frames };
}

/** 4c. The first keydown, focusin or pointerdown jumps the intro to its end state. */
export async function inputGuard(base, { profileName = 'D2' } = {}) {
  const rows = [];
  for (const kind of ['keydown', 'focusin', 'pointerdown']) {
    const { page, ctx } = await open(base, profileName);
    // Wait for the run to be under way (T0 passed, the print in flight), then interrupt it.
    await page.waitForFunction(() => performance.getEntriesByName('hero:t0').length > 0, null, { timeout: 15000 }).catch(() => {});
    await sleep(700);
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
  return { pass: rows.every((r) => r.pass), rows };
}

async function raw(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** 5. Poster vs first GL frame (mean diff <= 4/255) on the real camera slot; pose drift across a 40% hero scroll. */
export async function parity(base, { profiles = [...GES, 'X1180', 'X600'], out } = {}) {
  const rows = [];
  for (const p of profiles) {
    // The poster this tier shows before GL: the same page with the GL chunk held back, so the poster stays up.
    const sctx = await context(p, 'reduced');
    const spage = await sctx.newPage();
    await spage.route(/\/_astro\/gl\.[^/]+\.js$/, async (route) => {
      await sleep(20000);
      await route.continue().catch(() => {});
    });
    await spage.goto(`${base}/`, { waitUntil: 'load' });
    const s = { page: spage, ctx: sctx };
    await s.page.evaluate(() => document.fonts.ready);
    await s.page.waitForFunction(() => document.querySelector('.hero-poster')?.complete, null, { timeout: 8000 });
    await sleep(300);
    const clip = await s.page.evaluate(() => {
      const b = document.querySelector('[data-hero-camera]').getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
    });
    const posterSrc = await s.page.evaluate(() => document.querySelector('.hero-poster').currentSrc.split('/').pop());
    const a = await s.page.screenshot({ clip });
    await s.ctx.close();
    // The first GL frame: reduced motion (no intro), the camera live and the poster faded out.
    const g = await open(base, p, 'reduced');
    await g.page.waitForFunction(() => document.querySelector('[data-hero-camera]')?.classList.contains('is-gl'), null, { timeout: 15000 }).catch(() => {});
    await sleep(600);
    const b = await g.page.screenshot({ clip });
    await g.ctx.close();
    const A = await raw(a);
    const B = await raw(b);
    let sum = 0;
    for (let i = 0; i < A.data.length; i++) sum += Math.abs(A.data[i] - B.data[i]);
    const mean = sum / A.data.length;
    if (out) {
      await sharp(a).toFile(`${out}/parity-${p}-poster.png`);
      await sharp(b).toFile(`${out}/parity-${p}-gl.png`);
    }
    rows.push({ profile: p, mean: Math.round(mean * 1000) / 1000, pass: mean <= 4, posterSrc, slot: clip });
  }
  // Pose drift: the camera's projected box and angle across a 40% scroll of the hero (D2).
  const { page, ctx } = await open(base, 'D2', 'reduced');
  await page.waitForFunction(() => document.querySelector('[data-hero-camera]')?.classList.contains('is-gl'), null, { timeout: 15000 }).catch(() => {});
  await sleep(400);
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
  return { pass: rows.every((r) => r.pass) && drift.angleDeg < 1, rows, drift, top, scrolled };
}

/** 6. The strip: group 'Camera', targets >= 44 px without overlap at P2 touch, arrows = taps, swipe scrolls, tap prints. */
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
  // Taps: 135 mm, then Cyanotype.
  await page.tap('input[name="camera-lens"][value="135"]');
  await page.tap('input[name="camera-look"][value="cyanotype"]');
  const tapped = await state();
  await ctx.close();
  // Keys on a fresh page: from 50 mm two steps right, from Standard four steps right.
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
  // A vertical swipe on the camera stage scrolls the page (touch-action is never taken).
  const cam = await k.page.evaluate(() => {
    const b = document.querySelector('[data-hero-camera]').getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  const cdp = await k.ctx.newCDPSession(k.page);
  const y0 = await k.page.evaluate(() => scrollY);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cam.x, y: cam.y }] });
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cam.x, y: cam.y - i * 24 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(1500); // the fling settles
  const y1 = await k.page.evaluate(() => scrollY);
  await k.page.evaluate(() => window.scrollTo(0, 0));
  await sleep(800);
  await k.page.waitForFunction(() => !window.__hero || window.__hero.live, null, { timeout: 8000 }).catch(() => {});
  // A tap on the camera presses the shutter: the next print is made and announced.
  const before = await k.page.evaluate(() => document.querySelectorAll('[data-hero-print] img.hero-still').length);
  await k.page.tap('[data-hero-camera]', { position: { x: 20, y: 20 } });
  await sleep(4500);
  const after = await k.page.evaluate(() => ({ stills: document.querySelectorAll('[data-hero-print] img.hero-still').length, status: document.getElementById('status')?.textContent ?? '' }));
  await k.ctx.close();
  const same = tapped.lens === keyed.lens && tapped.look === keyed.look && tapped.readout === keyed.readout;
  const pass = group === 1 && small.length === 0 && overlaps.length === 0 && same && y1 - y0 > 100 && after.stills === before + 1 && /Printed/.test(after.status);
  return { pass, group, targets: targets.length, small, overlaps, tapped, keyed, identical: same, swipeScrolledPx: y1 - y0, tap: { before, after } };
}

/** 7. __motionLog overshoots within +-0.5 points of the table; holding Space or Enter on the shutter: <= 1 flash a second. */
export async function motion(base) {
  const table = { press: 4.6, detent: 9.5, settle: 1.1, lag: 2.8 };
  const { page, ctx } = await open(base, 'D2');
  await page.waitForFunction(() => performance.getEntriesByName('hero:developed').length > 0, null, { timeout: 15000 }).catch(() => {});
  await sleep(500);
  // Exercise every verb once more: a press, a Lens detent, a Look detent.
  await page.click('input[name="camera-lens"][value="85"]');
  await page.click('input[name="camera-look"][value="vivid"]');
  await sleep(1200);
  await page.click('[data-shutter]');
  await sleep(4500);
  const log = await page.evaluate(() => window.__motionLog.slice());
  await ctx.close();
  const springRows = log.filter((e) => e.spring && table[e.spring] !== undefined && e.to !== e.from).map((e) => {
    const os = Math.max(0, ((e.peak - e.to) / (e.to - e.from)) * 100);
    return { id: e.id, spring: e.spring, overshootPct: Math.round(os * 100) / 100, table: table[e.spring], ok: Math.abs(os - table[e.spring]) <= 0.5 };
  });
  const kinds = new Set(springRows.map((r) => r.spring));
  // Holding a key on the shutter for 5 s, in both schemes: no 1000 ms window holds more than one flash.
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
      await sleep(4500);
      const flashes = await h.page.evaluate((from) => window.__motionLog.filter((e) => e.kind === 'flash' && e.t0 >= from).map((e) => e.t0), t0);
      await h.ctx.close();
      let worst = 0;
      for (const f of flashes) worst = Math.max(worst, flashes.filter((g) => g >= f && g < f + 1000).length);
      holds.push({ scheme, key, flashes: flashes.length, worstPerSecond: worst, pass: worst <= 1 });
    }
  }
  const pass = springRows.length > 0 && springRows.every((r) => r.ok) && ['press', 'detent', 'settle'].every((k) => kinds.has(k)) && holds.every((h) => h.pass);
  return { pass, springs: springRows, kinds: [...kinds], holds, log };
}

/** 7b. Seeked filmstrip of the intro (?t=0) for the WCAG 2.3.1 flash analyser, in both schemes; frames on disk. */
export async function flashFilm(base, { out, profileName = 'D2', scheme = 'light', ms = 2000, fps = 60, save = [] } = {}) {
  const { analyse } = await import('../harness/flash/analyse.mjs');
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
  return { pass: r.pass, scheme, profile: profileName, ...r };
}

/** 8. Reduced motion and static: print 1 developed at FCP, a shutter press swaps with a 200 ms fade, 0 px shift vs auto. */
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
      let swap = null;
      if (mode !== 'auto') {
        await page.click('[data-shutter]');
        await sleep(60);
        swap = await page.evaluate(() => {
          const imgs = document.querySelectorAll('[data-hero-print] img.hero-still');
          const img = imgs[imgs.length - 1];
          const anims = img.getAnimations().map((a) => ({ duration: a.effect.getTiming().duration, props: a.effect.getKeyframes().map((k) => Object.keys(k).filter((x) => !['offset', 'computedOffset', 'easing', 'composite'].includes(x))).flat() }));
          return { stills: imgs.length, anims, flying: Boolean(window.__hero?.flying), fx: document.querySelector('[data-hero-section]').hasAttribute('data-fx') };
        });
      }
      geo[mode] = { g, printAtFcp: fcp?.print, swap };
      await ctx.close();
    }
    const keys = ['h1', 'line', 'cta', 'camera', 'print', 'strip'];
    const shift = (a, b) => Math.max(...keys.map((k) => Math.max(Math.abs(a[k].x - b[k].x), Math.abs(a[k].y - b[k].y), Math.abs(a[k].w - b[k].w), Math.abs(a[k].h - b[k].h))));
    const shiftReduced = shift(geo.auto.g, geo.reduced.g);
    const shiftStatic = shift(geo.auto.g, geo.static.g);
    const fade = (s) => s && s.anims.some((a) => a.duration === 200 && a.props.includes('opacity')) && !s.flying && !s.fx;
    const pass = geo.reduced.printAtFcp?.ok && geo.static.printAtFcp?.ok && fade(geo.reduced.swap) && fade(geo.static.swap) && shiftReduced <= 0.5 && shiftStatic <= 0.5;
    rows.push({ profile: p, pass: Boolean(pass), shiftReducedPx: shiftReduced, shiftStaticPx: shiftStatic, reduced: { printAtFcp: geo.reduced.printAtFcp, swap: geo.reduced.swap }, static: { printAtFcp: geo.static.printAtFcp, swap: geo.static.swap } });
  }
  return { pass: rows.every((r) => r.pass), rows };
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
