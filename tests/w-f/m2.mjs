// W-F milestone m2 acceptance (#11's D-023 amendment and the bundled requests). Reference host only (real GPU).
//   door       the built home page ends on Awards and medals and the footer: no door section, no 'The Manor' nav item,
//              no game call to action; the nav is Work and Contact; and a grep of src/, scripts/ and tests/ finds none of
//              the strings the plan lists (read from docs/direction/front-door-plan.md, so this file holds none of them)
//   noWebgl    #61 item 3: Chromium --disable-3d-apis (WebGL2's constructor exists, no context): data-tier is static,
//              data-cam camera and data-hero still before first paint, and never anything else; 0 console failures
//   withGl     the same probe leaves real GL alone: mouse profiles full (or a logged probe demotion), touch lite
//   present    #61 item 1: a recoloured fixture, then the stage sleeps; the presented canvas shows the new colour, and
//              after an erase (every fixture hidden) the bare page (Chromium and WebKit); ?notail and ?notail=erase
//              turn the tails off for the controls
//   grid       #59 item 3 / #61 item 2: the canvas is a whole number of buffer pixels per 1 / dpr CSS px both ways
//   aspect     #31: a StageView with an aspect draws into the contain-fit rectangle of its slot; one without fills it
//   gutter     #59 item 1: with classic scrollbars every route keeps its gutter from the first frame; W-D013 as amended
//              (Orchestrator ruling on #11, 5992943706): the canvas width is #rail's laid-out width, equal to
//              body.clientWidth, not html.clientWidth (which leaves the gutter out on a page that does not scroll:
//              1440 against 1425 px); asserted with and without the gutter, with hidden scrollbars too, and the
//              control sized from html.clientWidth fails
//   zero       round-1 must-fix: an iframe collapsed to 0 px wide or tall keeps the geometry finite and the stage idle
//              (counters' motion-end window), and it settles again when restored (Chromium and WebKit)
//   hooks      #54 item 2: __stage.registerEffect plugs an effect in behind __stage.effects; __stage.markDirty re-measures
// Usage: node tests/w-f/m2.mjs [--out m2.json] [--dist <dir>] [--only door,noWebgl,...]
//   --dist runs the browser checks against another build (the negative controls run them on main's dist).
import sharp from 'sharp';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PROFILES, ROOT, browser, budget, cliMain, consoleGate, expectedTier, newContext, readBudgets, serve, sleep, waitSettled } from '../harness/lib.mjs';
import { INIT as COUNTERS_INIT, motionWindow } from '../harness/counters/run.mjs';
const { containRect } = await import('../../scripts/build/posters/stage.js');

// ---------------------------------------------------------------- door (D-023)
/** The strings the plan's W-F door removal says a grep must not find, read from the plan (no literal here). */
export function doorStrings() {
  const plan = readFileSync(join(ROOT, 'docs/direction/front-door-plan.md'), 'utf8');
  const m = /`tests\/` finds no ([\s\S]*?); at D2/.exec(plan);
  if (!m) throw new Error("m2: the plan's door-removal grep sentence is not in docs/direction/front-door-plan.md");
  const list = [...m[1].matchAll(/`([^`]+)`|'([^']+)'/g)].map((x) => x[1] ?? x[2]);
  if (list.length < 6) throw new Error(`m2: expected 6 strings in the plan's grep sentence, found ${list.length}`);
  return list;
}
export function grepTree(dirs, needles, root = ROOT) {
  const hits = [];
  const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? (f === 'node_modules' ? [] : walk(p)) : [p];
  });
  for (const dir of dirs) {
    for (const file of walk(join(root, dir))) {
      if (!/\.(astro|ts|tsx|js|mjs|cjs|json|css|md|html|ya?ml)$/.test(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const n of needles) if (text.includes(n)) hits.push({ file: relative(root, file).replaceAll('\\', '/'), needle: n });
    }
  }
  return hits;
}

async function door(base) {
  const needles = doorStrings();
  const grep = grepTree(['src', 'scripts', 'tests'], needles);
  const rows = [];
  for (const profile of ['D2', 'P2']) {
    for (const scheme of ['light', 'dark']) {
      const ctx = await newContext(profile, 'auto', { colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      const r = await page.evaluate((needles) => {
        const main = document.getElementById('main');
        const sections = [...main.children].filter((e) => e.tagName === 'SECTION');
        const last = sections[sections.length - 1];
        const afterMain = document.getElementById('swup').nextElementSibling;
        const nav = [...document.querySelectorAll('nav[aria-label="Site"] a')].map((a) => ({ name: a.textContent.trim(), href: a.getAttribute('href') }));
        const html = document.documentElement.outerHTML;
        // Any link into the game from the home page: its paths are fork-owned (/manor/, /play/, /arcade/).
        const gameLinks = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => /^\/(manor|play|arcade)(\/|$)/.test(h));
        const lastBox = last.getBoundingClientRect();
        const footBox = document.querySelector('.site-footer').getBoundingClientRect();
        return {
          sections: sections.map((s) => s.getAttribute('aria-labelledby') || s.className),
          lastSection: last.getAttribute('aria-labelledby'),
          afterMain: afterMain?.className ?? null,
          footerFollows: Math.abs(footBox.top - lastBox.bottom) < 1,
          nav,
          stringsInPage: needles.filter((n) => html.includes(n)),
          gameLinks,
          pageEnd: Math.round(document.documentElement.scrollHeight - (footBox.bottom + scrollY)),
        };
      }, needles);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await waitSettled(page, 8000);
      await ctx.close();
      rows.push({
        profile, scheme, ...r,
        pass: r.lastSection === 'honours' && r.afterMain === 'site-footer' && r.footerFollows && r.pageEnd === 0
          && r.nav.map((n) => n.name).join('|') === 'Work|Contact' && r.stringsInPage.length === 0 && r.gameLinks.length === 0,
      });
    }
  }
  return { needles, grep, rows, pass: grep.length === 0 && rows.every((r) => r.pass) };
}

// ---------------------------------------------------------------- noWebgl (#61 item 3)
/** Records every change of the tier, camera and hero attributes and first contentful paint, from document start. */
const ATTR_INIT = `(() => {
  const log = (window.__attrLog = []);
  window.__fcp = null;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__fcp = e.startTime; }).observe({ type: 'paint', buffered: true }); } catch (e) {}
  new MutationObserver((recs) => {
    const t = performance.now();
    for (const r of recs) if (r.target === document.documentElement) log.push({ attr: r.attributeName, value: r.target.getAttribute(r.attributeName), t });
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-tier', 'data-cam', 'data-hero'] });
})();`;

async function noWebgl(base) {
  const rows = [];
  const cases = [...['D1', 'D2', 'D3', 'S1', 'T1', 'T2', 'P1', 'P2'].map((p) => [p, '/']), ['D2', '/work/project-01/'], ['P2', '/work/project-01/']];
  for (const [profile, route] of cases) {
    const ctx = await newContext(profile, 'auto', { browser: 'chromium-no3d' });
    await ctx.addInitScript({ content: ATTR_INIT });
    const page = await ctx.newPage();
    const gate = consoleGate(page);
    await page.goto(base + route, { waitUntil: 'load' });
    await waitSettled(page, 15000);
    await sleep(800); // a GL boot would have run by now (full: an idle callback after FCP)
    const s = await page.evaluate(() => {
      const h = document.documentElement;
      const still = document.querySelector('.hero-still');
      return {
        constructorExists: typeof window.WebGL2RenderingContext === 'function',
        contextNow: Boolean(document.createElement('canvas').getContext('webgl2')),
        tier: h.dataset.tier, cam: h.dataset.cam ?? null, hero: h.dataset.hero ?? null,
        reason: window.__stage?.tierReason ?? null, glState: window.__stage?.glState ?? null,
        stillOpacity: still ? getComputedStyle(still).opacity : null,
        fcp: window.__fcp, log: window.__attrLog,
      };
    });
    const v = gate.verdict();
    await ctx.close();
    const after = s.fcp === null ? s.log : s.log.filter((e) => e.t > s.fcp);
    const tiers = s.log.filter((e) => e.attr === 'data-tier').map((e) => e.value);
    const hero = route === '/';
    rows.push({
      profile, route, ...s, consoleFailures: v.failures.map((f) => `${f.channel}/${f.level}: ${f.text.slice(0, 160)}`), changesAfterFcp: after,
      pass: s.constructorExists && !s.contextNow && s.fcp !== null && s.tier === 'static' && tiers.every((t) => t === 'static') && after.length === 0
        && s.reason === 'no-webgl2' && s.glState === 'off' && v.pass
        && (!hero || (s.cam === 'camera' && s.hero === 'still' && s.stillOpacity === '1' && !s.log.some((e) => e.attr === 'data-hero' && e.value === 'eject'))),
    });
  }
  return { rows, pass: rows.length > 0 && rows.every((r) => r.pass) };
}

async function withGl(base) {
  const rows = [];
  for (const profile of ['D2', 'S1', 'P2', 'T1']) {
    const ctx = await newContext(profile);
    const page = await ctx.newPage();
    const gate = consoleGate(page);
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await waitSettled(page, 15000);
    const s = await page.evaluate(() => ({ tier: window.__stage.tier, reason: window.__stage.tierReason, tierReasonAttr: document.documentElement.dataset.tierReason ?? null }));
    const v = gate.verdict();
    await ctx.close();
    const want = expectedTier(profile);
    rows.push({ profile, ...s, expected: want, consolePass: v.pass, pass: (s.tier === want || (want === 'full' && s.tier === 'lite' && s.reason === 'probe')) && s.tierReasonAttr === null && v.pass });
  }
  return { rows, pass: rows.every((r) => r.pass) };
}

// ---------------------------------------------------------------- present (#61 item 1)
const near = (a, b, tol = 4) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
async function sampleSlot(page, id) {
  const box = await page.evaluate((id) => {
    const r = document.querySelector(`[data-gl-id="${id}"]`).getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, id);
  // The lower middle of the quad, clear of its label.
  const clip = { x: Math.round(box.x + box.w * 0.3), y: Math.round(box.y + box.h * 0.6), width: Math.max(4, Math.round(box.w * 0.4)), height: Math.max(4, Math.round(box.h * 0.25)) };
  const { data, info } = await sharp(await page.screenshot({ clip })).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = [];
  for (let i = 0; i < data.length; i += 3) px.push([data[i], data[i + 1], data[i + 2]]);
  const med = (k) => px.map((p) => p[k]).sort((a, b) => a - b)[Math.floor(px.length / 2)];
  return { rgb: [med(0), med(1), med(2)], clip, size: [info.width, info.height] };
}

/**
 * Three recolours and then an erase (every fixture hidden, so the frame only clears what the canvas showed). After each,
 * the stage sleeps and the screenshot must show the new state: the new colour, then what the page shows with no canvas
 * at all (sampled last, with #gl hidden by CSS). `noTail`: '' (every tail on), 'all' (?notail) or 'erase' (?notail=erase).
 */
async function present(base, profiles = ['D2', 'P2', 'WK-P2', 'WK-T2'], noTail = '') {
  const rows = [];
  for (const profile of profiles) {
    const ctx = await newContext(profile);
    const page = await ctx.newPage();
    await page.goto(`${base}/bench/?tier=lite${noTail === 'all' ? '&notail' : noTail === 'erase' ? '&notail=erase' : ''}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__stage?.glState === 'ready' && window.__stage.fixtures, null, { polling: 100, timeout: 20000 });
    await page.evaluate(() => document.querySelector('[data-gl-id="fx-1"]').scrollIntoView({ block: 'center' }));
    await waitSettled(page, 10000);
    const steps = [];
    const settle = async (act, arg) => {
      const t0 = await page.evaluate(() => ({ sleeps: window.__stage.stats.sleeps, tail: window.__stage.stats.tailFrames }));
      await page.evaluate(act, arg);
      // The stage renders once, presents its tail, then sleeps after its idle detach: read what the canvas shows then.
      await page.waitForFunction((n) => window.__stage.stats.sleeps > n, t0.sleeps, { polling: 50, timeout: 10000 });
      await sleep(100);
      const shot = await sampleSlot(page, 'fx-1');
      const t1 = await page.evaluate(() => ({ tail: window.__stage.stats.tailFrames }));
      return { got: shot.rgb, tailFrames: t1.tail - t0.tail };
    };
    for (const rgb of [[250, 30, 30], [30, 30, 250], [30, 200, 30]]) {
      const s = await settle((c) => window.__stage.fixtures.tint('fx-1', ...c), rgb);
      steps.push({ step: 'tint', want: rgb, ...s, ok: near(s.got, rgb) });
    }
    if (await page.evaluate(() => typeof window.__stage.fixtures.hideAll === 'function')) {
      const s = await settle(() => window.__stage.fixtures.hideAll(true));
      await page.addStyleTag({ content: '#gl{visibility:hidden!important}' });
      await sleep(100);
      const ground = (await sampleSlot(page, 'fx-1')).rgb;
      steps.push({ step: 'erase', want: ground, ...s, ok: near(s.got, ground) && !near(s.got, [30, 200, 30]) });
    } else steps.push({ step: 'erase', ok: false, why: 'fixtures.hideAll is missing (pre-fix build)' });
    await ctx.close();
    rows.push({ profile, browser: PROFILES[profile].browser, noTail, steps, pass: steps.every((s) => s.ok) });
  }
  return { rows, pass: rows.every((r) => r.pass) };
}

// ---------------------------------------------------------------- grid (#59 item 3, #61 item 2)
async function grid(base) {
  const b = readBudgets();
  const rows = [];
  for (const profile of ['T1', 'T2', 'P1', 'P2', 'S2', 'D1', 'D2', 'D3', 'S1', 'WK-P2', 'WK-T2']) {
    const ctx = await newContext(profile);
    const page = await ctx.newPage();
    await page.goto(`${base}/bench/`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__stage?.glState === 'ready', null, { polling: 100, timeout: 20000 });
    await waitSettled(page, 10000);
    const s = await page.evaluate(() => {
      const c = document.getElementById('gl');
      const v = window.__stage.view;
      return { tier: window.__stage.tier, W: v.W, Hc: v.Hc, dpr: v.dpr, width: c.width, height: c.height, cssH: c.getBoundingClientRect().height, stats: { canvasW: window.__stage.stats.canvasW, canvasH: window.__stage.stats.canvasH, canvasPx: window.__stage.stats.canvasPx } };
    });
    await ctx.close();
    const kx = s.width / s.W;
    const ky = s.height / s.Hc;
    const capPx = budget(`site.canvasMpx.${s.tier}`, b) * 1e6;
    rows.push({
      profile, ...s, kx, ky, xErr: Math.abs(kx - s.dpr), yErr: Math.abs(ky - s.dpr), capPx,
      pass: Math.abs(kx - s.dpr) < 1e-6 && Math.abs(ky - s.dpr) < 1e-6 && Math.abs(s.cssH - s.Hc) <= 1 / 64 + 1e-6 /* boxes lay out in 1/64 px units */ && s.width * s.height <= capPx && s.stats.canvasW === s.width && s.stats.canvasH === s.height,
    });
  }
  return { rows, pass: rows.every((r) => r.pass) };
}

// ---------------------------------------------------------------- aspect (#31)
async function aspect(base) {
  const rows = [];
  for (const profile of ['D3', 'D2', 'T1', 'P2', 'WK-P2']) {
    const ctx = await newContext(profile);
    const page = await ctx.newPage();
    await page.goto(`${base}/bench/aspect/`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__stage?.glState === 'ready' && window.__stage.fixtures, null, { polling: 100, timeout: 20000 });
    await waitSettled(page, 10000);
    const info = await page.evaluate(() => ['fx-aspect-wide', 'fx-aspect-tall', 'fx-aspect-none'].map((id) => {
      const el = document.querySelector(`[data-gl-id="${id}"]`);
      const r = el.getBoundingClientRect();
      return { id, aspect: Number(el.dataset.glAspect) || null, box: { x: r.left, y: r.top, w: r.width, h: r.height }, viewport: window.__stage.fixtures.viewport(id), dpr: window.__stage.view.dpr, anchor: window.__stage.view.anchor, Hc: window.__stage.view.Hc, scrollY };
    }));
    const shot = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const scale = shot.info.width / page.viewportSize().width; // device px per CSS px
    await ctx.close();
    for (const v of info) {
      // Where GL drew: the bounding box of the fixture's flat green inside the slot (device px).
      const sx0 = Math.floor(v.box.x * scale), sy0 = Math.floor(v.box.y * scale), sx1 = Math.ceil((v.box.x + v.box.w) * scale), sy1 = Math.ceil((v.box.y + v.box.h) * scale);
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (let y = Math.max(0, sy0); y < Math.min(shot.info.height, sy1); y++) for (let x = Math.max(0, sx0); x < Math.min(shot.info.width, sx1); x++) {
        const o = (y * shot.info.width + x) * 3;
        if (Math.abs(shot.data[o] - 40) <= 3 && Math.abs(shot.data[o + 1] - 200) <= 3 && Math.abs(shot.data[o + 2] - 120) <= 3) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      const drawn = x1 >= 0 ? { x: x0 / scale - v.box.x, y: y0 / scale - v.box.y, w: (x1 - x0 + 1) / scale, h: (y1 - y0 + 1) / scale } : null;
      // Expected: the contain-fit rectangle of the slot's buffer box (W-C13's containRect), in CSS px from the slot.
      const bw = Math.round(v.box.w * v.dpr), bh = Math.round(v.box.h * v.dpr);
      const c = v.aspect ? containRect(bw, bh, v.aspect) : { x: 0, y: 0, width: bw, height: bh };
      const want = { x: c.x / v.dpr, y: c.y / v.dpr, w: c.width / v.dpr, h: c.height / v.dpr };
      const contain = v.aspect ?? 1.35; // the no-aspect control is held to the same contain rectangle and must fail it
      const cc = containRect(bw, bh, contain);
      const containWant = { x: cc.x / v.dpr, y: cc.y / v.dpr, w: cc.width / v.dpr, h: cc.height / v.dpr };
      const tol = 1 / scale + 1 / v.dpr; // a device pixel of the screenshot and a buffer pixel of the canvas
      const off = (a, w) => (a ? Math.max(Math.abs(a.x - w.x), Math.abs(a.y - w.y), Math.abs(a.w - w.w), Math.abs(a.h - w.h)) : Infinity);
      const vpOk = v.viewport && v.viewport.w === c.width && v.viewport.h === c.height;
      rows.push({
        profile, id: v.id, aspect: v.aspect, slot: v.box, viewport: v.viewport, drawn, expected: want, offPx: off(drawn, want), containOffPx: off(drawn, containWant), tolPx: tol,
        matchesContain: off(drawn, containWant) <= tol,
        pass: Boolean(vpOk) && off(drawn, want) <= tol && (v.aspect ? off(drawn, containWant) <= tol : off(drawn, containWant) > tol),
      });
    }
  }
  return { rows, pass: rows.length > 0 && rows.every((r) => r.pass) };
}

// ---------------------------------------------------------------- gutter (#59 item 1)
// The first frame's content width and every layout shift, from document start.
const FIRST_FRAME = `(() => {
  window.__ff = null;
  requestAnimationFrame(() => {
    const h = document.documentElement;
    window.__ff = { bodyWidth: document.body ? document.body.clientWidth : null, gutter: h.hasAttribute('data-gutter'), sg: getComputedStyle(h).scrollbarGutter };
  });
  window.__ls = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__ls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
})();`;
/** The head script cannot set data-gutter (the 'no gutter' variant of the classic-scrollbar rows). */
const NO_GUTTER = `(() => {
  const set = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (n, v) { if (n === 'data-gutter' && this === document.documentElement) return; return set.call(this, n, v); };
})();`;
/** Negative control: the stage sized from html.clientWidth (W-D013 as it read before the ruling). */
const RAIL_AS_HTML = `(() => {
  const d = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return this.id === 'rail' ? document.documentElement.clientWidth : d.get.call(this); } });
})();`;
/**
 * Classic scrollbars (Chrome without Playwright's --hide-scrollbars), with the head script's gutter and without it, and
 * hidden ones, every route: the gutter is set exactly where a scrollbar takes room, from the first frame, so the
 * content width at the first frame is the final one and nothing shifts. W-D013 as amended (Orchestrator ruling on #11,
 * 5992943706): the canvas width is the laid-out width of #rail, equal to body.clientWidth; html.clientWidth is only the
 * fallback when #rail has no box. Every GL row asserts stage W = #rail's box = body.clientWidth = the canvas's CSS
 * width, on pages that scroll and pages that do not (on a page that does not scroll, with the gutter, html.clientWidth
 * is 1440 against a 1425 px layout). The control (`plant`) sizes the stage from html.clientWidth and must fail there.
 */
async function gutter(base, plant = null) {
  const rows = [];
  const variants = plant ? [['chromium-scrollbars', true]] : [['chromium-scrollbars', true], ['chromium-scrollbars', false], ['chromium', true]];
  const routes = plant ? ['/work/project-01/', '/bench/aspect/'] : ['/', '/work/project-01/', '/404.html', '/bench/', '/bench/aspect/'];
  for (const [variant, headGutter] of variants) {
    for (const route of routes) {
      const ctx = await newContext('D2', 'auto', { browser: variant });
      await ctx.addInitScript({ content: FIRST_FRAME });
      if (!headGutter) await ctx.addInitScript({ content: NO_GUTTER });
      if (plant === 'rail-as-html') await ctx.addInitScript({ content: RAIL_AS_HTML });
      const page = await ctx.newPage();
      await page.goto(base + route, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      await page.waitForFunction(() => ['ready', 'off', 'failed'].includes(window.__stage?.glState), null, { polling: 100, timeout: 15000 }).catch(() => {});
      const s = await page.evaluate(() => {
        const h = document.documentElement;
        const p = document.createElement('div');
        p.style.cssText = 'position:absolute;top:-200px;width:100px;height:100px;overflow:scroll;visibility:hidden';
        document.body.append(p);
        const barPx = p.offsetWidth - p.clientWidth;
        p.remove();
        const c = document.getElementById('gl');
        return {
          barPx, gutter: h.hasAttribute('data-gutter'), sg: getComputedStyle(h).scrollbarGutter, scrolls: h.scrollHeight > innerHeight,
          clientWidth: h.clientWidth, bodyWidth: document.body.clientWidth, railBoxW: document.getElementById('rail').getBoundingClientRect().width, canvasCssW: c.getBoundingClientRect().width,
          glState: window.__stage?.glState ?? null, stageW: window.__stage?.view?.W ?? null, firstFrame: window.__ff, layoutShift: Math.round(window.__ls * 1e5) / 1e5,
        };
      });
      await ctx.close();
      const classic = s.barPx > 0;
      const glUp = s.glState === 'ready';
      const widthOk = !glUp || (s.stageW === s.railBoxW && s.railBoxW === s.bodyWidth && s.canvasCssW === s.bodyWidth);
      rows.push({
        variant, headGutter, route, ...s, widthOk, htmlDiffers: s.clientWidth !== s.bodyWidth,
        pass: (classic ? variant === 'chromium-scrollbars' : variant === 'chromium') && widthOk
          // Without the head script's gutter only the width rule is asserted (the page may shift when its bar appears).
          && (!headGutter || (s.gutter === classic && (classic ? s.sg === 'stable' : s.sg === 'auto')
            && s.firstFrame !== null && s.firstFrame.gutter === classic && s.firstFrame.bodyWidth === s.bodyWidth && s.layoutShift === 0)),
      });
    }
  }
  // The ruling's coverage: GL rows with classic scrollbars on a page that scrolls and one that does not, with and
  // without the gutter, and at least one where html.clientWidth differs from the layout (the case the rule decides).
  const gl = rows.filter((r) => r.glState === 'ready' && r.variant === 'chromium-scrollbars');
  const coverage = {
    scrollingWithGutter: gl.some((r) => r.headGutter && r.scrolls), stillWithGutter: gl.some((r) => r.headGutter && !r.scrolls),
    scrollingNoGutter: gl.some((r) => !r.headGutter && r.scrolls), stillNoGutter: gl.some((r) => !r.headGutter && !r.scrolls),
    htmlDiffers: gl.some((r) => r.htmlDiffers),
  };
  return { rows, coverage, pass: rows.every((r) => r.pass) && (plant ? true : Object.values(coverage).every(Boolean)) };
}

// ---------------------------------------------------------------- zero (round-1 must-fix zero-width-grid)
/**
 * /bench/?tier=lite in a 1200 x 800 iframe that collapses to 0 px wide, then to 0 px tall, then comes back, in
 * Chromium and WebKit. While collapsed, the stage's geometry stays finite (no Infinity dpr, no NaN Hc or anchor) and
 * the idle window holds (counters' motionWindow: the collapse is the last change, nothing presented within its bound,
 * 0 rAF and 0 draws in the window). Restored, the geometry is finite and the stage settles again.
 */
async function zero(base) {
  const rows = [];
  for (const profile of ['D2', 'WK-P2']) {
    for (const axis of ['width', 'height']) {
      const b = await browser(PROFILES[profile].browser);
      const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 1 });
      await ctx.addInitScript({ content: COUNTERS_INIT });
      const page = await ctx.newPage();
      const gate = consoleGate(page);
      await page.goto(`${base}/404.html`, { waitUntil: 'load' });
      await page.evaluate((src) => new Promise((res) => {
        const f = document.createElement('iframe');
        f.id = 'probe';
        f.style.cssText = 'position:fixed;left:0;top:0;width:1200px;height:800px;border:0;z-index:99;background:#fff';
        f.src = src;
        f.onload = res;
        document.body.prepend(f);
      }), `${base}/bench/?tier=lite`);
      const frame = await (await page.$('#probe')).contentFrame();
      await frame.waitForFunction(() => window.__stage?.glState === 'ready' && window.__stage.fixtures && window.__stage.settled, null, { polling: 100, timeout: 20000 });
      await frame.evaluate(() => { document.querySelector('[data-gl-id="fx-1"]').scrollIntoView({ block: 'center' }); window.__stage.invalidate(); });
      await frame.waitForFunction(() => window.__stage.settled, null, { polling: 100, timeout: 10000 }).catch(() => {});
      await sleep(300);
      const geo = () => frame.evaluate(() => {
        const v = { ...window.__stage.view };
        const s = window.__stage.stats;
        const nums = { ...Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === 'number')), canvasPx: s.canvasPx, canvasW: s.canvasW, canvasH: s.canvasH, statDpr: s.dpr };
        return { nums: Object.fromEntries(Object.entries(nums).map(([k, x]) => [k, Number.isFinite(x) ? Math.round(x * 1000) / 1000 : String(x)])), finite: Object.values(nums).every((x) => Number.isFinite(x)), draws: s.draws, settled: window.__stage.settled };
      });
      const since = await frame.evaluate(() => performance.now());
      await page.evaluate((axis) => { document.getElementById('probe').style[axis] = '0px'; }, axis);
      const win = await motionWindow(frame, since);
      const atZero = await geo();
      await page.evaluate((axis) => { document.getElementById('probe').style[axis] = axis === 'width' ? '1200px' : '800px'; }, axis);
      const settledAfter = await frame.waitForFunction(() => window.__stage.settled, null, { polling: 100, timeout: 8000 }).then(() => true, () => false);
      await sleep(200);
      const restored = await geo();
      const v = gate.verdict();
      await ctx.close();
      rows.push({
        profile, axis, browser: PROFILES[profile].browser, atZero, window: { pass: win.pass, bound: win.bound, afterMotion: win.afterMotion, stageInWindow: win.stageInWindow }, settledAfter, restored,
        drewAfterRestore: restored.draws > atZero.draws, consoleFailures: v.failures.map((f) => `${f.channel}/${f.level}: ${f.text.slice(0, 160)}`),
        // In WebKit, GL drawing nothing after a collapse and restore is pre-existing (main 5955491 too, Breaker 1.3):
        // recorded, not asserted.
        pass: atZero.finite && win.pass && atZero.settled && settledAfter && restored.finite && v.pass && (PROFILES[profile].browser !== 'chromium' || restored.draws > atZero.draws),
      });
    }
  }
  return { rows, pass: rows.length > 0 && rows.every((r) => r.pass) };
}

// ---------------------------------------------------------------- hooks (#54 item 2)
async function hooks(base) {
  const ctx = await newContext('D2');
  const page = await ctx.newPage();
  await page.goto(`${base}/bench/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stage?.glState === 'ready', null, { polling: 100, timeout: 20000 });
  await waitSettled(page, 10000);
  const r = await page.evaluate(async () => {
    const s = window.__stage;
    const types = { registerEffect: typeof s.registerEffect, markDirty: typeof s.markDirty };
    if (types.registerEffect !== 'function' || types.markDirty !== 'function') return { types };
    const calls = [];
    s.registerEffect('develop', async (id, opts) => { calls.push({ id, trigger: opts?.trigger ?? null }); return { id, d: 1, developed: true }; });
    const result = await s.effects.develop('fx-2', { trigger: 'm2-test' });
    const before = s.stats.measuresInTick;
    s.markDirty();
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return { types, calls, result, measuresInTick: s.stats.measuresInTick - before };
  });
  await ctx.close();
  return { ...r, pass: r.types.registerEffect === 'function' && r.types.markDirty === 'function' && r.calls?.length === 1 && r.calls[0].id === 'fx-2' && r.result?.developed === true && r.measuresInTick >= 1 };
}

const CHECKS = { door, noWebgl, withGl, present, grid, aspect, gutter, zero, hooks };

export async function run(opts = {}) {
  const only = opts.only ? new Set(String(opts.only).split(',')) : null;
  const srv = await serve(opts.dist ? resolve(String(opts.dist)) : join(ROOT, 'dist'));
  const out = {};
  try {
    for (const [name, fn] of Object.entries(CHECKS)) {
      if (only && !only.has(name)) continue;
      try {
        out[name] = await fn(srv.base);
      } catch (e) {
        out[name] = { pass: false, error: String(e?.stack || e).slice(0, 600) };
      }
    }
    // The present controls: the same check with the tails turned off (WebKit is where a canvas shows one frame late),
    // all of them (?notail) or only the one after an erase (?notail=erase).
    if ((!only || only.has('present')) && !opts['no-controls']) {
      out.presentControl = await present(srv.base, ['WK-P2', 'WK-T2'], 'all').catch((e) => ({ error: String(e), rows: [] }));
      out.eraseControl = await present(srv.base, ['WK-P2', 'WK-T2'], 'erase').catch((e) => ({ error: String(e), rows: [] }));
    }
    // The W-D013 control (ruling 5992943706): a stage sized from html.clientWidth fails on a page that does not scroll
    // under a classic-scrollbar gutter.
    if ((!only || only.has('gutter')) && !opts['no-controls']) {
      out.gutterControl = await gutter(srv.base, 'rail-as-html').catch((e) => ({ error: String(e), rows: [] }));
      out.gutterControl.caught = out.gutterControl.rows?.some((r) => !r.widthOk && !r.scrolls && r.gutter) ?? false;
      out.gutterControl.pass = out.gutterControl.caught;
    }
  } finally {
    await srv.close();
  }
  for (const [k, step] of [['presentControl', 'tint'], ['eraseControl', 'erase']]) {
    if (!out[k]) continue;
    // A control passes when its step fails without that tail on at least one WebKit row: the tail is what fixed it.
    out[k].caught = out[k].rows?.some((r) => r.steps.some((s) => s.step === step && !s.ok)) ?? false;
    out[k].pass = out[k].caught;
  }
  const parts = Object.entries(out);
  return { schema: 1, suite: 'w-f/m2', dist: opts.dist ?? 'dist', pass: parts.every(([, v]) => v.pass), ...out, summary: parts.map(([k, v]) => `${k} ${v.pass ? 'pass' : 'FAIL'}`).join(', ') };
}

await cliMain(import.meta.url, run);
