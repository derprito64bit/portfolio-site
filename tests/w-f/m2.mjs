// W-F milestone m2 acceptance (#11's D-023 amendment and the bundled requests). Reference host only (real GPU).
//   door       the built home page ends on Awards and medals and the footer: no door section, no 'The Manor' nav item,
//              no game call to action; the nav is Work and Contact; and a grep of src/, scripts/ and tests/ finds none of
//              the strings the plan lists (read from docs/direction/front-door-plan.md, so this file holds none of them)
//   noWebgl    #61 item 3: Chromium --disable-3d-apis (WebGL2's constructor exists, no context): data-tier is static,
//              data-cam camera and data-hero still before first paint, and never anything else; 0 console failures;
//              on / print 1's still is visible when first paint is reported (read in the FCP callback: opacity 1,
//              visibility visible, a non-zero box with transforms); the noWebglControl (plants I, J and K: the still
//              is at opacity 0, hidden or at scale 0 at first paint, whole at the end) must fail
//   withGl     the same probe leaves real GL alone: mouse profiles full (or a logged probe demotion), touch lite; a
//              session that starts on the 404 boots GL after a Swup visit to /, and never after a Swup visit that lands
//              on the 404 again (W-D029: GL off, no script fetched; Chromium and WebKit)
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
//              (counters' motion-end window), and it settles again when restored (Chromium and WebKit), judged only
//              after the stage has ticked for the restore and 400 ms have passed; the zeroControl (kept awake once
//              restored) must fail
//   hooks      #54 item 2 under #14 ruling 2: a chunk loaded after stage:gl-start registers develop through
//              __stage.registerEffect and hands other ids to `next` (the no-op: take, then give); a second
//              registration chains and falls through on undefined; __stage.markDirty re-measures; __stage.take and
//              give borrow and hand back a slot's pixels for an impl that serves its own ids
//   flush      perf row 26: on a history Back to the top of / (full tier: D2, D3, WebKit D3) the camera's first frame
//              comes before the first stage:idle and the stage sleeps once in 4 s (the stage flushes its context each
//              frame; at 7a2d0df the camera's program link waited for the detach and woke the stage again at D2)
//   withGl also holds the in-flight 404 rows (round-3 must-fix s2-404-gl-boot); zero's window opens at the motion end
//              + 1 s + max(2 frames, 34 ms) (ruling 6030949628 item 2)
// Usage: node tests/w-f/m2.mjs [--out m2.json] [--dist <dir>] [--only door,noWebgl,...]
//   --dist runs the browser checks against another build (the negative controls run them on main's dist).
import sharp from 'sharp';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
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
/**
 * A fixed-string grep of every file under `dirs` (node_modules skipped), whatever its type: the bytes are searched, so
 * a .py, .ps1, .sh, .svg or .glsl file counts as much as a .ts (round-1 review, Breaker 1.3 #2: a file-type allowlist
 * let 7 tracked files go unread). Returns { files, hits }.
 */
export function grepTree(dirs, needles, root = ROOT) {
  const hits = [];
  let files = 0;
  const walk = (d) => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? (f === 'node_modules' ? [] : walk(p)) : [p];
  });
  for (const dir of dirs) {
    for (const file of walk(join(root, dir))) {
      const buf = readFileSync(file);
      files++;
      for (const n of needles) if (buf.includes(n)) hits.push({ file: relative(root, file).replaceAll('\\', '/'), needle: n });
    }
  }
  return Object.assign(hits, { files });
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
  // The grep's own control: the same needles planted in a .py, a .ps1 and a .sh file of a scratch tree must be found.
  const scratch = mkdtempSync(join(tmpdir(), 'door-grep-'));
  const planted = { 'scripts/x/build.py': needles[0], 'scripts/x/lane.ps1': needles[1], 'tests/x/make.sh': needles.join('\n') };
  for (const [f, text] of Object.entries(planted)) {
    mkdirSync(dirname(join(scratch, f)), { recursive: true });
    writeFileSync(join(scratch, f), `# planted\n${text}\n`);
  }
  const control = grepTree(['scripts', 'tests'], needles, scratch);
  rmSync(scratch, { recursive: true, force: true });
  const controlCaught = needles.every((n) => control.some((h) => h.needle === n)) && control.some((h) => h.file.endsWith('.py')) && control.some((h) => h.file.endsWith('.ps1'));
  return { needles, filesRead: grep.files, grep: [...grep], control: { hits: [...control], caught: controlCaught }, rows, pass: grep.length === 0 && grep.files > 0 && controlCaught && rows.every((r) => r.pass) };
}

// ---------------------------------------------------------------- noWebgl (#61 item 3)
/**
 * Records every change of the tier, camera and hero attributes and first contentful paint, from document start, and
 * what first paint showed (Breaker 2.3 #4): in the FCP observer's callback, the attributes and print 1's still opacity
 * as computed then (a still that fades in after first paint reads 0 there, though it ends at 1).
 */
const ATTR_INIT = `(() => {
  const log = (window.__attrLog = []);
  window.__fcp = null;
  window.__atFcp = null;
  const snap = () => {
    const h = document.documentElement;
    const still = document.querySelector('.hero-still');
    const cs = still ? getComputedStyle(still) : null;
    const box = still ? still.getBoundingClientRect() : null; // transforms included (a scale(0) still has no box)
    return { t: performance.now(), tier: h.dataset.tier ?? null, cam: h.dataset.cam ?? null, hero: h.dataset.hero ?? null, stillOpacity: cs ? cs.opacity : null, stillVisibility: cs ? cs.visibility : null, stillBox: box ? [Math.round(box.width), Math.round(box.height)] : null };
  };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') { window.__fcp = e.startTime; window.__atFcp = snap(); } }).observe({ type: 'paint', buffered: true }); } catch (e) {}
  new MutationObserver((recs) => {
    const t = performance.now();
    for (const r of recs) if (r.target === document.documentElement) log.push({ attr: r.attributeName, value: r.target.getAttribute(r.attributeName), t });
  }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-tier', 'data-cam', 'data-hero'] });
})();`;

/**
 * Every way into the site with no WebGL2 context (#61 item 3 as amended by the Orchestrator, 5982885690; Breakers 1.1
 * #2 and 1.3 #1): / at eight profiles, a project page, ?tier=lite and ?tier=full (an override cannot make WebGL2
 * exist), the 404 (a page without GL), a Swup visit from the 404 to /, a second full load in the same session (the
 * probe's failure is kept, ion.webgl2 = '0') and, at D2 and S1, a first load in a session that cached a working answer
 * (ion.webgl2 = '1': round-5 must-fix n1-cached-webgl2). Static with reason no-webgl2 before first paint, never anything
 * else, GL off, and 0 console failures; on / by a full load, data-cam camera and print 1's still too.
 */
async function noWebgl(base, only = null) {
  const rows = [];
  const cases = only ?? [
    ...['D1', 'D2', 'D3', 'S1', 'T1', 'T2', 'P1', 'P2'].map((p) => [p, '/', 'load']),
    ['D2', '/work/project-01/', 'load'], ['P2', '/work/project-01/', 'load'],
    ['D2', '/?tier=full', 'load'], ['S1', '/?tier=full', 'load'], ['D2', '/?tier=lite', 'load'], ['P2', '/?tier=lite', 'load'],
    ['D2', '/404.html', 'load'], ['P2', '/404.html', 'load'],
    ['D2', '/404.html', 'swup-home'], ['P2', '/404.html', 'swup-home'],
    ['D2', '/work/project-01/', 'second-load'],
    // A session that cached a working answer earlier (ion.webgl2 = '1') and can no longer make a context: a GPU process
    // blocked after crashes, tabs restored with hardware acceleration off (round-5 must-fix n1-cached-webgl2).
    ['D2', '/', 'cached-1'], ['S1', '/', 'cached-1'],
  ];
  for (const [profile, route, kind] of cases) {
    const ctx = await newContext(profile, 'auto', { browser: 'chromium-no3d' });
    await ctx.addInitScript({ content: ATTR_INIT });
    if (kind === 'cached-1') {
      // Seeded once, before the head script of the first load runs.
      await ctx.addInitScript({ content: "try { if (!sessionStorage.getItem('m2.seeded')) { sessionStorage.setItem('ion.webgl2', '1'); sessionStorage.setItem('m2.seeded', '1'); } } catch (e) {}" });
    }
    const page = await ctx.newPage();
    const gate = consoleGate(page);
    if (kind === 'second-load') {
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
    }
    await page.goto(base + route, { waitUntil: 'load' });
    await waitSettled(page, 15000);
    if (kind === 'swup-home') {
      await page.click('a.site-mark');
      await page.waitForFunction(() => location.pathname === '/' && document.documentElement.dataset.page === 'home', null, { polling: 100, timeout: 10000 });
      await waitSettled(page, 15000);
    }
    await sleep(800); // a GL boot would have run by now (full: an idle callback after FCP)
    const s = await page.evaluate(() => {
      const h = document.documentElement;
      const still = document.querySelector('.hero-still');
      let cached = null;
      try { cached = sessionStorage.getItem('ion.webgl2'); } catch (e) { cached = 'blocked'; }
      return {
        path: location.pathname + location.search,
        constructorExists: typeof window.WebGL2RenderingContext === 'function',
        contextNow: Boolean(document.createElement('canvas').getContext('webgl2')),
        tier: h.dataset.tier, cam: h.dataset.cam ?? null, hero: h.dataset.hero ?? null,
        reason: window.__stage?.tierReason ?? null, glState: window.__stage?.glState ?? null,
        stillOpacity: still ? getComputedStyle(still).opacity : null, cached,
        fcp: window.__fcp, atFcp: window.__atFcp, log: window.__attrLog,
      };
    });
    const v = gate.verdict();
    await ctx.close();
    const after = s.fcp === null ? s.log : s.log.filter((e) => e.t > s.fcp);
    const tiers = s.log.filter((e) => e.attr === 'data-tier').map((e) => e.value);
    // The hero's first-paint attributes on a full load of / (a Swup arrival on / leaves the hero unlaid on main too:
    // W-S1's, recorded only).
    const hero = (kind === 'load' || kind === 'cached-1') && route.startsWith('/') && route.split('?')[0] === '/';
    rows.push({
      profile, route, kind, ...s, consoleFailures: v.failures.map((f) => `${f.channel}/${f.level}: ${f.text.slice(0, 160)}`), changesAfterFcp: after,
      pass: s.constructorExists && !s.contextNow && s.fcp !== null && s.tier === 'static' && tiers.every((t) => t === 'static') && (kind === 'swup-home' || after.length === 0)
        && s.reason === 'no-webgl2' && s.glState === 'off' && s.cached === '0' && v.pass
        // On / the hero's state at first paint (read in the FCP callback, Breaker 2.3 #4) and at the end.
        // Print 1's still is visible at first paint: opaque, not hidden, and with a box (Breaker 3.1 #2: opacity alone
        // let a hidden or scale(0) still through).
        && (!hero || (s.atFcp?.tier === 'static' && s.atFcp.cam === 'camera' && s.atFcp.hero === 'still' && s.atFcp.stillOpacity === '1'
          && s.atFcp.stillVisibility === 'visible' && s.atFcp.stillBox?.[0] > 0 && s.atFcp.stillBox?.[1] > 0
          && s.cam === 'camera' && s.hero === 'still' && s.stillOpacity === '1' && !s.log.some((e) => e.attr === 'data-hero' && e.value === 'eject'))),
    });
  }
  return { rows, pass: rows.length > 0 && rows.every((r) => r.pass) };
}

/**
 * First-paint plants on print 1's still, each whole again by the end: I fades in from opacity 0 (Breaker 2.3 #4); J is
 * visibility hidden for its first 1.5 s and K scale(0) for its first 1.5 s (Breaker 3.1 #2). The / rows must catch each
 * at FCP.
 */
const STILL_PLANTS = {
  I: '<style data-plant="I">.hero-still{animation:m2-plant-i 1.5s 300ms both}@keyframes m2-plant-i{from{opacity:0}to{opacity:1}}</style>',
  J: '<style data-plant="J">.hero-still{animation:m2-plant-j 1ms 1500ms both}@keyframes m2-plant-j{from{visibility:hidden}to{visibility:visible}}</style>',
  K: '<style data-plant="K">.hero-still{animation:m2-plant-k 1ms 1500ms both}@keyframes m2-plant-k{from{transform:scale(0)}to{transform:none}}</style>',
};
async function noWebglPlants(dist) {
  const out = {};
  for (const [id, css] of Object.entries(STILL_PLANTS)) {
    const dir = mkdtempSync(join(tmpdir(), `m2-plant-${id.toLowerCase()}-`));
    try {
      cpSync(dist, dir, { recursive: true });
      const home = join(dir, 'index.html');
      const html = readFileSync(home, 'utf8');
      if (!html.includes('</head>')) throw new Error(`plant ${id}: index.html has no </head>`);
      writeFileSync(home, html.replace('</head>', `${css}</head>`));
      const srv = await serve(dir);
      try {
        const r = await noWebgl(srv.base, [['D2', '/', 'load'], ['S1', '/', 'load']]);
        // Caught when a row fails on what first paint showed while its end state is whole.
        const atFcpWhole = (x) => x.atFcp?.stillOpacity === '1' && x.atFcp.stillVisibility === 'visible' && x.atFcp.stillBox?.[0] > 0;
        const caught = r.rows.some((x) => !x.pass && !atFcpWhole(x) && x.stillOpacity === '1');
        out[id] = { rows: r.rows.map((x) => ({ profile: x.profile, pass: x.pass, atFcp: x.atFcp, end: { opacity: x.stillOpacity } })), caught };
      } finally {
        await srv.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  return { plants: out, pass: Object.values(out).every((p) => p.caught) };
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
  // A session that starts on a page without GL (the 404) boots GL once a Swup visit lands on a page with GL (round-1
  // should-fix: scheduleGL ran once at load and never again).
  for (const profile of ['D2', 'P2']) {
    const ctx = await newContext(profile);
    const page = await ctx.newPage();
    const gate = consoleGate(page);
    await page.goto(`${base}/404.html`, { waitUntil: 'load' });
    await waitSettled(page, 15000);
    const before = await page.evaluate(() => window.__stage.glState);
    await page.click('a.site-mark');
    await page.waitForFunction(() => location.pathname === '/' && document.documentElement.dataset.page === 'home', null, { polling: 100, timeout: 10000 });
    const booted = await page.waitForFunction(() => window.__stage.glState === 'ready', null, { polling: 100, timeout: 12000 }).then(() => true, () => false);
    const s = await page.evaluate(() => ({ glState: window.__stage.glState, tier: window.__stage.tier, marks: window.__stage.marks().filter((m) => m.name === 'stage:gl-start').map((m) => m.detail) }));
    const v = gate.verdict();
    await ctx.close();
    rows.push({ profile, swupFrom404: true, before, ...s, consolePass: v.pass, pass: before === 'off' && booted && s.glState === 'ready' && v.pass });
  }
  // ...and never on a page that opts out (W-D029; round-2 must-fix s2-404-gl-boot): a Swup visit from the 404 to
  // another missing URL lands on the 404 again, and GL stays off with no script fetched. Chromium and WebKit, mouse
  // (full) and touch (lite: 7 s covers the 5 s timer and its idle second).
  for (const [profile, engine] of [['D2', null], ['P2', null], ['D3', 'webkit'], ['WK-P2', null]]) {
    const ctx = await newContext(profile, 'auto', engine ? { browser: engine } : {});
    const page = await ctx.newPage();
    const missing = '/work/no-such-print/';
    const gate = consoleGate(page, { expectStatus: [{ status: 404, url: new RegExp(`${missing.replaceAll('/', '\\/')}$`) }] });
    await page.goto(`${base}/404.html`, { waitUntil: 'load' });
    await waitSettled(page, 15000);
    const before = await page.evaluate(() => ({ glState: window.__stage.glState, glPage: document.documentElement.dataset.glPage }));
    const scripts = [];
    page.on('request', (r) => { if (r.resourceType() === 'script' || /\.m?js(\?|$)/.test(r.url())) scripts.push(r.url().replace(base, '')); });
    await page.evaluate((href) => {
      const a = document.createElement('a');
      a.href = href;
      a.id = 'm2-missing';
      a.textContent = 'a print that is not there';
      document.querySelector('main').append(a);
    }, missing);
    await page.click('#m2-missing');
    const arrived = await page.waitForFunction((p) => location.pathname === p && !document.getElementById('m2-missing') && document.documentElement.dataset.page === 'notfound', missing, { polling: 50, timeout: 10000 }).then(() => true, () => false);
    const atArrival = await page.evaluate(() => ({ glPage: document.documentElement.dataset.glPage, mainGlPage: document.getElementById('main')?.dataset.glPage ?? null, h1: document.querySelector('main h1')?.textContent.trim() ?? null }));
    const states = [];
    for (let t = 0; t < 7000; t += 250) {
      states.push(await page.evaluate(() => window.__stage.glState));
      await sleep(250);
    }
    const s = await page.evaluate(() => ({ glState: window.__stage.glState, glStarts: window.__stage.marks().filter((m) => m.name === 'stage:gl-start').length }));
    const v = gate.verdict();
    await ctx.close();
    rows.push({
      profile: engine ? `${profile}@${engine}` : profile, swup404to404: true, before, arrived, atArrival, statesSeen: [...new Set(states)], ...s, scriptsAfterLoad: scripts,
      consolePass: v.pass, consoleFailures: v.failures.map((f) => `${f.channel}/${f.level}: ${f.text.slice(0, 160)}`),
      pass: before.glState === 'off' && before.glPage === 'off' && arrived && atArrival.glPage === 'off' && states.every((x) => x === 'off')
        && s.glState === 'off' && s.glStarts === 0 && scripts.length === 0 && v.pass,
    });
  }
  rows.push(...(await inFlight404(base)));
  return { rows, pass: rows.every((r) => r.pass) };
}

/**
 * A proxy in front of the dist that holds the responses whose path matches `re` for `ms` (a slow network for one chunk;
 * no Playwright routing, so WebKit's console stays the page's own). Returns { base, close }.
 */
export async function holdingProxy(target, re, ms) {
  const { createServer, request } = await import('node:http');
  const t = new URL(target);
  const server = createServer((req, res) => {
    const go = () => {
      const up = request({ host: t.hostname, port: t.port, path: req.url, method: req.method, headers: { ...req.headers, host: t.host } }, (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      });
      up.on('error', () => res.destroy());
      req.pipe(up);
    };
    if (re.test(req.url ?? '')) setTimeout(go, ms);
    else go();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

/** Records every WebGL context the page creates on the stage canvas, with the page's path and opt-out at that moment. */
const CONTEXT_LOG = `(() => {
  const log = (window.__ctxLog = []);
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const had = this.__ctx ?? null;
    const c = gc.call(this, type, attrs);
    if (this.id === 'gl' && /webgl/.test(String(type)) && c && !had) log.push({ path: location.pathname, glPage: document.documentElement.dataset.glPage ?? null, t: Math.round(performance.now()) });
    if (c) this.__ctx = c;
    return c;
  };
})();`;

/**
 * A GL boot in flight when a Swup visit lands on the 404 (round-3 must-fix s2-404-gl-boot, Breaker 3.2 #1; W-D029: the
 * 404 has no WebGL). The gl chunk (the boot's dynamic import) is held HOLD_MS by a proxy (long enough for the visit to
 * land, short enough that WebKit's 'preloaded but not used within a few seconds of load' note on the chunk's own
 * modulepreload, which the hold alone causes, stays out of the console); once glState is 'booting', a
 * Swup visit goes to a missing URL. On the 404: no WebGL context is created on the stage canvas, glState ends 'off',
 * no stage:gl-ready, Lenis off, the console clean; then a Swup visit back to / boots GL (ready). Variant back404
 * (Breaker 3.2): a full load of the missing URL, its 'Back to the work' link (a Swup visit to /), and Back while GL
 * boots. Chromium and WebKit, full (mouse) and lite (touch, where the boot starts on the hero print's near observer).
 */
const HOLD_MS = 1500;
async function inFlight404(base) {
  const rows = [];
  const proxy = await holdingProxy(base, /^\/_astro\/gl\.[^/]*\.js/, HOLD_MS);
  const missing = '/work/no-such-print/';
  try {
    for (const [profile, engine, variant] of [['D2', null, 'visit'], ['P2', null, 'visit'], ['D3', 'webkit', 'visit'], ['WK-P2', null, 'visit'], ['D2', null, 'back404'], ['D3', 'webkit', 'back404']]) {
      const ctx = await newContext(profile, 'auto', engine ? { browser: engine } : {});
      await ctx.addInitScript({ content: CONTEXT_LOG });
      const page = await ctx.newPage();
      const gate = consoleGate(page, { expectStatus: [{ status: 404, url: new RegExp(`${missing.replaceAll('/', '\\/')}$`) }] });
      let r = {};
      try {
        if (variant === 'visit') {
          await page.goto(`${proxy.base}/`, { waitUntil: 'load' });
        } else {
          await page.goto(`${proxy.base}${missing}`, { waitUntil: 'load' });
          await page.click('main a[href="/"]');
          await page.waitForFunction(() => location.pathname === '/' && document.documentElement.dataset.page === 'home', null, { polling: 50, timeout: 10000 });
        }
        const booting = await page.waitForFunction(() => window.__stage?.glState === 'booting', null, { polling: 20, timeout: 12000 }).then(() => true, () => false);
        if (variant === 'visit') {
          await page.evaluate((href) => {
            const a = document.createElement('a');
            a.href = href;
            a.id = 'm2-missing';
            a.textContent = 'a print that is not there';
            document.querySelector('main').append(a);
          }, missing);
          await page.click('#m2-missing');
        } else {
          await page.goBack();
        }
        const arrived = await page.waitForFunction((p) => location.pathname === p && document.documentElement.dataset.page === 'notfound', missing, { polling: 20, timeout: 10000 }).then(() => true, () => false);
        const atArrival = await page.evaluate(() => ({ glState: window.__stage.glState, glPage: document.documentElement.dataset.glPage }));
        // The held chunk arrives HOLD_MS after it was asked for: watch well past it.
        await sleep(HOLD_MS + 2500);
        const on404 = await page.evaluate(() => ({
          glState: window.__stage.glState, ctxOn404: window.__ctxLog.filter((c) => c.glPage === 'off'), contexts: window.__ctxLog,
          glReady: window.__stage.marks().filter((m) => m.name === 'stage:gl-ready').length, standDowns: window.__stage.stats.standDowns ?? null,
          lenis: document.documentElement.classList.contains('lenis'), gl: window.__stage.gl ? 'set' : null, settled: window.__stage.settled,
        }));
        const v = gate.verdict();
        // Then a Swup visit to / boots GL.
        await page.click('a.site-mark');
        await page.waitForFunction(() => location.pathname === '/' && document.documentElement.dataset.page === 'home', null, { polling: 50, timeout: 10000 });
        const bootedAfter = await page.waitForFunction(() => window.__stage.glState === 'ready', null, { polling: 100, timeout: 15000 }).then(() => true, () => false);
        r = {
          booting, arrived, atArrival, on404, bootedAfter, consolePass: v.pass, consoleFailures: v.failures.map((f) => `${f.channel}/${f.level}: ${f.text.slice(0, 160)}`),
          pass: booting && arrived && on404.glState === 'off' && on404.ctxOn404.length === 0 && on404.glReady === 0 && !on404.lenis && on404.gl === null && on404.settled === true && v.pass && bootedAfter,
        };
      } catch (e) {
        r = { pass: false, error: String(e?.message || e).slice(0, 300) };
      }
      await ctx.close();
      rows.push({ profile: engine ? `${profile}@${engine}` : profile, inFlight404: variant, ...r });
    }
  } finally {
    await proxy.close();
  }
  return rows;
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
    const s = await page.evaluate(GRID_READ);
    await ctx.close();
    rows.push(gridRow(profile, s, b));
  }
  // A fractional layout width (round-5 must-fix canvas-grid-fractional-width; Breaker 4.2 #6): a real display at 125% or
  // 175% scaling, or browser zoom, lays #rail out at a fractional CSS width while view.W (#rail's clientWidth) is a whole
  // number. Emulated DSF keeps whole CSS widths, so the page runs in an iframe of fractional CSS width instead, in
  // Chromium and WebKit; the canvas must still be laid out at exactly W.
  const frac = [];
  for (const [profile, engine, fw] of [['D2', 'chromium', 801.3], ['D2', 'chromium', 1351.43], ['D3', 'webkit', 801.3], ['D3', 'webkit', 1235.57]]) {
    const ctx = await newContext(profile, 'auto', { browser: engine });
    const page = await ctx.newPage();
    let s;
    try {
      await page.goto(`${base}/404.html`, { waitUntil: 'load' });
      await page.evaluate(({ src, fw }) => {
        document.body.innerHTML = '';
        const f = document.createElement('iframe');
        f.id = 'frac';
        f.src = src;
        f.style.cssText = `display:block;border:0;margin:0;inline-size:${fw}px;block-size:700px`;
        document.body.append(f);
      }, { src: `${base}/bench/`, fw });
      await page.waitForFunction(() => {
        const w = document.getElementById('frac')?.contentWindow;
        return w?.__stage?.glState === 'ready' && w.__stage.settled === true;
      }, null, { polling: 100, timeout: 20000 });
      const frame = page.frames().find((fr) => fr.url().includes('/bench/'));
      s = { ...(await frame.evaluate(GRID_READ)), frameWidth: await page.evaluate(() => document.getElementById('frac').getBoundingClientRect().width) };
    } catch (e) {
      s = { error: String(e?.message || e).slice(0, 200) };
    }
    await ctx.close();
    frac.push({ ...gridRow(`${profile}@${engine} iframe ${fw}px`, s, b), fractional: s.railW !== undefined && s.railW !== Math.round(s.railW) });
  }
  return { rows, fractional: frac, pass: rows.every((r) => r.pass) && frac.length > 0 && frac.every((r) => r.pass && r.fractional) };
}
/** The canvas grid as laid out: view.W, #rail's fractional width, the canvas's laid-out box and its buffer. */
const GRID_READ = () => {
  const c = document.getElementById('gl');
  const v = window.__stage.view;
  const r = c.getBoundingClientRect();
  return { tier: window.__stage.tier, W: v.W, Hc: v.Hc, dpr: v.dpr, width: c.width, height: c.height, cssW: r.width, cssH: r.height, railW: c.parentElement.getBoundingClientRect().width, stats: { canvasW: window.__stage.stats.canvasW, canvasH: window.__stage.stats.canvasH, canvasPx: window.__stage.stats.canvasPx } };
};
/**
 * One buffer pixel is exactly 1 / view.dpr CSS px both ways (#59 item 3 as delivered, 5987181829): the buffer over W
 * and over Hc is view.dpr, and the canvas is laid out at exactly W x Hc (boxes lay out in 1/64 px units), so the buffer
 * over the laid-out box is view.dpr too. Within the tier's pixel cap; the stage's stats match the buffer.
 */
function gridRow(profile, s, b) {
  if (s.error) return { profile, ...s, pass: false };
  const kx = s.width / s.W;
  const ky = s.height / s.Hc;
  const kxBox = s.width / s.cssW;
  const capPx = budget(`site.canvasMpx.${s.tier}`, b) * 1e6;
  const LAYOUT_UNIT = 1 / 64 + 1e-6;
  return {
    profile, ...s, kx, ky, kxBox, xErr: Math.abs(kx - s.dpr), yErr: Math.abs(ky - s.dpr), boxErr: Math.abs(kxBox - s.dpr), capPx,
    pass: Math.abs(kx - s.dpr) < 1e-6 && Math.abs(ky - s.dpr) < 1e-6 && Math.abs(s.cssW - s.W) <= LAYOUT_UNIT && Math.abs(kxBox - s.dpr) < 1e-6
      && Math.abs(s.cssH - s.Hc) <= LAYOUT_UNIT && s.width * s.height <= capPx && s.stats.canvasW === s.width && s.stats.canvasH === s.height,
  };
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
async function zero(base, opts = {}) {
  const rows = [];
  for (const profile of opts.profiles ?? ['D2', 'WK-P2']) {
    for (const axis of opts.axes ?? ['width', 'height']) {
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
      // The control's plant (zeroControl): once the frame has an area again, something keeps the stage awake for good.
      if (opts.plant === 'restore-awake') {
        await frame.evaluate(() => addEventListener('resize', () => {
          if (innerWidth > 0 && innerHeight > 0 && !window.__awake) window.__awake = setInterval(() => window.__stage.invalidate(), 100);
        }));
      }
      const ticksBefore = await frame.evaluate(() => window.__stage.stats.ticks);
      const restoredAt = Date.now();
      await page.evaluate((axis) => { document.getElementById('probe').style[axis] = axis === 'width' ? '1200px' : '800px'; }, axis);
      // First the stage must see the restore (a tick after it, within 2 s) and 400 ms must pass: `settled` is still true
      // from before the resize reaches the frame, so waiting for it at once proved nothing (the perf gate's round-2 note:
      // it returned in 3 to 6 ms).
      const sawRestore = await frame.waitForFunction((t) => window.__stage.stats.ticks > t, ticksBefore, { polling: 20, timeout: 2000 }).then(() => true, () => false);
      if (Date.now() - restoredAt < 400) await sleep(400 - (Date.now() - restoredAt));
      const settledAfter = await frame.waitForFunction(() => window.__stage.settled, null, { polling: 100, timeout: 8000 }).then(() => true, () => false);
      await sleep(200);
      const restored = await geo();
      const v = gate.verdict();
      await ctx.close();
      rows.push({
        profile, axis, browser: PROFILES[profile].browser, plant: opts.plant ?? null, atZero, window: { pass: win.pass, bound: win.bound, afterMotion: win.afterMotion, uncappedInWindow: win.uncappedInWindow, stageInWindow: win.stageInWindow }, sawRestore, settledAfter, restored,
        drewAfterRestore: restored.draws > atZero.draws, consoleFailures: v.failures.map((f) => `${f.channel}/${f.level}: ${f.text.slice(0, 160)}`),
        // In WebKit, GL drawing nothing after a collapse and restore is pre-existing (main 5955491 too, Breaker 1.3):
        // recorded, not asserted (nor is its tick after the restore).
        pass: atZero.finite && win.pass && atZero.settled && settledAfter && restored.finite && v.pass && (PROFILES[profile].browser !== 'chromium' || (sawRestore && restored.draws > atZero.draws)),
      });
    }
  }
  return { rows, pass: rows.length > 0 && rows.every((r) => r.pass) };
}

// ---------------------------------------------------------------- hooks (#54 item 2)
/**
 * #14 ruling 2 (5990469145): W-S2 registers 'develop' through window.__stage.registerEffect from a chunk it loads after
 * stage:gl-start, and gives other ids the no-op without importing src/stage. On / at D2 (GL ready):
 * - a module loaded from a blob URL after the stage:gl-start mark registers develop for project-01 and hands every
 *   other id to `next` (the no-op: project-02 is taken, then given, focus stays, the result is the final state);
 * - a second registration (W-C2 may re-register) serves project-04, returns undefined for the rest and falls through to
 *   the first; a later develop of project-01 still reaches the first impl;
 * - __stage.markDirty re-measures on the next frame.
 */
async function hooks(base) {
  const ctx = await newContext('D2');
  const page = await ctx.newPage();
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__stage?.glState === 'ready', null, { polling: 100, timeout: 20000 });
  await waitSettled(page, 15000);
  const r = await page.evaluate(async () => {
    const s = window.__stage;
    const types = { registerEffect: typeof s.registerEffect, markDirty: typeof s.markDirty };
    if (types.registerEffect !== 'function' || types.markDirty !== 'function') return { types };
    const glStart = performance.getEntriesByName('stage:gl-start').length > 0;
    // The W-S2 stand-in: an ES module chunk loaded after stage:gl-start, touching only window.__stage.
    const ws2 = `window.__devCalls = [];
      window.__stage.registerEffect('develop', async (id, opts, next) => {
        window.__devCalls.push({ by: 'w-s2', id, hasNext: typeof next === 'function' });
        if (id !== 'project-01') return next(id, opts);
        return { id, d: 1, developed: true, by: 'w-s2' };
      });
      export const at = performance.now();`;
    const url = URL.createObjectURL(new Blob([ws2], { type: 'text/javascript' }));
    const mod = await import(url);
    const gs = performance.getEntriesByName('stage:gl-start')[0]?.startTime ?? Infinity;
    const el2 = document.querySelector('[data-gl-id="project-02"]');
    const classLog = [];
    // Each class change, by whether is-gl was there before it: take is false (added), give is true (removed).
    const mo = new MutationObserver((recs) => { for (const m of recs) classLog.push(/\bis-gl\b/.test(m.oldValue || '')); });
    mo.observe(el2, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    el2.focus();
    const focusBefore = document.activeElement;
    const own = await s.effects.develop('project-01', { trigger: 'm2' });
    const other = await s.effects.develop('project-02', { trigger: 'm2' });
    await new Promise((res) => setTimeout(res, 0));
    mo.disconnect();
    // W-C2 re-registers: serves project-04, falls through (undefined) for everything else.
    s.registerEffect('develop', (id) => (id === 'project-04' ? { id, d: 1, developed: true, by: 'w-c2' } : undefined));
    const c2 = await s.effects.develop('project-04');
    const through = await s.effects.develop('project-01');
    const before = s.stats.measuresInTick;
    s.markDirty();
    await new Promise((res) => setTimeout(res, 120));
    // An impl that serves its own ids takes the slot's pixels and gives them back through __stage.take and give, with
    // no import of src/stage (round-2 should-fix S8, the perf gate's row 6 note).
    const el3 = document.querySelector('[data-gl-id="project-03"]');
    const takeGive = typeof s.take === 'function' && typeof s.give === 'function'
      ? (() => { s.take('project-03'); const on = el3.classList.contains('is-gl'); s.give('project-03'); return { on, off: !el3.classList.contains('is-gl') }; })()
      : null;
    return {
      types: { ...types, take: typeof s.take, give: typeof s.give }, glStart, loadedAfterGlStart: mod.at > gs, own, other, c2, through, calls: window.__devCalls,
      handback: classLog, focusKept: document.activeElement === focusBefore, isGlAfter: el2.classList.contains('is-gl'),
      measuresInTick: s.stats.measuresInTick - before, takeGive,
    };
  });
  await ctx.close();
  const ok = r.types.registerEffect === 'function' && r.types.markDirty === 'function' && r.glStart && r.loadedAfterGlStart
    && r.own?.by === 'w-s2' && r.other?.id === 'project-02' && r.other?.developed === true && !r.other?.by
    && r.handback?.join(',') === 'false,true' && r.focusKept && r.isGlAfter === false
    && r.c2?.by === 'w-c2' && r.through?.by === 'w-s2' && r.calls?.every((c) => c.hasNext)
    && r.measuresInTick >= 1 && r.takeGive?.on === true && r.takeGive?.off === true;
  return { ...r, pass: Boolean(ok) };
}

/**
 * The second wake after an arrival (perf row 26, ruling 6030949628 item 1), by its named cause. On the D2 history Back
 * to the top of / (a hash with no target, the arrival the perf gate measured), the camera's kept print program, linked
 * from a timer, completed only about 90 ms after the ticker had detached (its link sat unflushed while the ticker ran
 * frames that issued no GL), so the camera's first frame (hero:cam-ready) came after the first stage:idle and woke the
 * stage a second time. With the stage flushing its context each frame the camera is ready inside the first active
 * period: hero:cam-ready before the first stage:idle after the arrival, and one sleep in the 4 s after it. The full
 * tier only (lite boots GL on intent, so a first sleep before the boot is by design). 7a2d0df fails it 9 of 10.
 */
async function flush(base) {
  const rows = [];
  for (const [profile, engine] of [['D2', null], ['D3', null], ['D3', 'webkit']]) {
    for (let rep = 0; rep < 3; rep++) {
      const ctx = await newContext(profile, 'auto', engine ? { browser: engine } : {});
      const page = await ctx.newPage();
      await page.goto(`${base}/#arrival`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      await page.goto(`${base}/work/project-02/`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      await page.goBack({ waitUntil: 'load' });
      await waitSettled(page, 15000);
      await sleep(4000);
      const r = await page.evaluate(() => {
        const m = performance.getEntriesByType('mark');
        const at = (name) => m.find((x) => x.name === name)?.startTime ?? null;
        return { tier: window.__stage.tier, nav: performance.getEntriesByType('navigation')[0]?.type ?? null, camReady: at('hero:cam-ready'), firstIdle: at('stage:idle'), sleeps: window.__stage.stats.sleeps };
      });
      await ctx.close();
      const round = (x) => (x === null ? null : Math.round(x));
      rows.push({
        profile: engine ? `${profile}@${engine}` : profile, rep, ...r, camReady: round(r.camReady), firstIdle: round(r.firstIdle),
        pass: r.tier === 'full' && r.nav === 'back_forward' && r.camReady !== null && r.firstIdle !== null && r.camReady < r.firstIdle && r.sleeps === 1,
      });
    }
  }
  return { rows, pass: rows.length > 0 && rows.every((r) => r.pass) };
}

const CHECKS = { door, noWebgl, withGl, present, grid, aspect, gutter, zero, hooks, flush };

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
    // The restore control (the perf gate's round-2 note): a plant that keeps the stage awake once the frame is restored
    // must fail zero's "settles again when restored".
    if ((!only || only.has('zero')) && !opts['no-controls']) {
      out.zeroControl = await zero(srv.base, { profiles: ['D2'], axes: ['width'], plant: 'restore-awake' }).catch((e) => ({ error: String(e), rows: [] }));
      out.zeroControl.caught = out.zeroControl.rows?.some((r) => !r.pass && r.sawRestore && !r.settledAfter) ?? false;
      out.zeroControl.pass = out.zeroControl.caught;
    }
    // The first-paint controls (Breaker 2.3 #4 plant I, Breaker 3.1 #2 plants J and K): copies of the dist whose print 1
    // still is invisible at first paint (opacity 0, visibility hidden, scale 0) and whole at the end must fail
    // noWebgl's / rows.
    if ((!only || only.has('noWebgl')) && !opts['no-controls']) {
      out.noWebglControl = await noWebglPlants(opts.dist ? resolve(String(opts.dist)) : join(ROOT, 'dist')).catch((e) => ({ error: String(e), plants: {}, pass: false }));
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
