#!/usr/bin/env node
// The crew tool (W-F, GES-1 / W-D030). Every W crew uses it the same way.
//   node scripts/crew.mjs open <id>            worktree ../portfolio-site.wt/<id> on crew/<id> (no tracking of main)
//   node scripts/crew.mjs check                 npm run check plus the ownership check for this branch's crew
//   node scripts/crew.mjs shoot [opts]          viewport shots at named scroll stops after __stage.settled, per route,
//                                               GES-1 profile and mode, with the console gate, the tier assertion and
//                                               overflow; writes a GES-1 manifest
//   node scripts/crew.mjs a11y [opts]           axe (D2, T2, P2 x auto, static, reduced, dark), the keyboard walk with
//                                               ring coverage, text spacing, forced colours, dark scheme, an
//                                               accessibility-tree snapshot per route and the text-over-GL check
//   node scripts/crew.mjs lighthouse [opts]     Lighthouse 13.5.0, 5 runs per form factor, median by score, valid
//                                               only on a real renderer at the expected tier and with the LCP element
//                                               budgets.md names (the h1 on desktop; the h1 or print 1's still on
//                                               mobile); every run must request GL after the observed FCP (D-005), and
//                                               the medians must meet the LCP, TBT and CLS budgets (budgets.md)
// Options: --routes /,/work/project-01/,/404.html  --profiles D1,D2,...  --modes auto,static,reduced
//          --crew W-F  --wave wave3a  --role crew|gate  --out <dir>
// Evidence goes to ../portfolio-evidence/<wave>/<crew>/<sha7>/<role>/<command>/ with manifest.json. Any failed item
// makes the command exit 1.
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...rest] = process.argv.slice(2);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

function opts(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else o._.push(argv[i]);
  }
  return o;
}
const o = opts(rest);
const list = (v, d) => String(v ?? d).split(',').map((s) => s.trim()).filter(Boolean);
const branch = () => git('rev-parse', '--abbrev-ref', 'HEAD');
const crewId = () => (o.crew ? String(o.crew) : branch().startsWith('crew/') ? branch().slice(5).toUpperCase() : 'W-F');

// ---------------------------------------------------------------- open
function open(id) {
  if (!id) throw new Error('usage: crew.mjs open <id>');
  const name = id.toLowerCase();
  const dir = resolve(ROOT, '..', 'portfolio-site.wt', name);
  if (existsSync(dir)) {
    console.log(`open: ${dir} exists`);
    return 0;
  }
  git('fetch', 'origin');
  const remote = spawnSync('git', ['rev-parse', '--verify', '--quiet', `origin/crew/${name}`], { cwd: ROOT }).status === 0;
  if (remote) {
    git('worktree', 'add', dir, '-b', `crew/${name}`, '--no-track', `origin/crew/${name}`);
  } else {
    git('worktree', 'add', dir, '-b', `crew/${name}`, '--no-track', 'origin/main');
  }
  console.log(`open: ${dir} on crew/${name} (from ${remote ? `origin/crew/${name}` : 'origin/main'}); first push: git push -u origin crew/${name}`);
  return 0;
}

// ---------------------------------------------------------------- check
function check() {
  const crew = crewId();
  const r1 = spawnSync(process.execPath, [join(ROOT, 'scripts/check/run.mjs'), ...(o.log ? ['--log', o.log] : []), ...(o.json ? ['--json', o.json] : [])], { cwd: ROOT, stdio: 'inherit' });
  const r2 = spawnSync(process.execPath, [join(ROOT, 'scripts/check/ownership.mjs'), '--crew', crew], { cwd: ROOT, stdio: 'inherit' });
  return r1.status || r2.status ? 1 : 0;
}

// ---------------------------------------------------------------- shared
async function harness() {
  return import('../tests/harness/lib.mjs');
}
function outDir(lib, name) {
  const dir = o.out ? resolve(String(o.out)) : join(lib.evidenceDir(crewId(), String(o.wave || 'wave3a'), String(o.role || 'crew')), name);
  mkdirSync(dir, { recursive: true });
  return dir;
}
const slug = (route) => (route === '/' ? 'home' : route.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-'));

/** Named scroll stops (W-D030) that exist on the page: top, #work, each enlargement, #sheet, #honours, footer. */
async function stops(page) {
  return page.evaluate(() => {
    const out = [{ name: 'top', y: 0 }];
    const at = (el) => Math.max(0, Math.round(el.getBoundingClientRect().top + scrollY - 16));
    const add = (name, sel) => { const el = document.querySelector(sel); if (el) out.push({ name, y: at(el) }); };
    add('work', '#work');
    document.querySelectorAll('#work ~ * [data-gl-id], #work ~ ol [data-gl-id]').forEach((el, i) => out.push({ name: `enlargement-${i + 1}`, y: at(el) }));
    add('sheet', '#sheet');
    add('honours', '#honours');
    out.push({ name: 'footer', y: Math.max(0, document.documentElement.scrollHeight - innerHeight) });
    const seen = new Set();
    return out.filter((s) => (seen.has(s.name) ? false : seen.add(s.name)));
  });
}

// ---------------------------------------------------------------- shoot
async function shoot() {
  const lib = await harness();
  const { measure } = await import('../tests/harness/overflow/run.mjs');
  const dir = outDir(lib, 'shoot');
  const routes = list(o.routes, '/,/work/project-01/,/404.html');
  const profiles = list(o.profiles, Object.keys(lib.PROFILES).join(','));
  const modes = list(o.modes, lib.MODES.join(','));
  const srv = await lib.serve();
  const items = [];
  try {
    for (const profile of profiles) {
      for (const mode of modes) {
        if (lib.PROFILES[profile].only && !lib.PROFILES[profile].only.includes(mode)) continue;
        for (const route of routes) {
          const ctx = await lib.newContext(profile, mode);
          const page = await ctx.newPage();
          const gate = lib.consoleGate(page, { expectStatus: route === '/404.html' ? [] : [] });
          await page.goto(lib.routeUrl(srv.base, route, mode), { waitUntil: 'load' });
          const settled = await lib.waitSettled(page, 10000);
          const st = await lib.stageState(page);
          const wantTier = mode === 'static' ? 'static' : lib.expectedTier(profile);
          const tierOk = st && (st.tier === wantTier || (wantTier === 'full' && st.tier === 'lite' && st.tierReason === 'probe'));
          const base = `${slug(route)}/${profile}-${mode}`;
          mkdirSync(join(dir, slug(route)), { recursive: true });
          for (const s of await stops(page)) {
            await page.evaluate((y) => window.scrollTo(0, y), s.y);
            const ok = await lib.waitSettled(page, 10000);
            const file = `${base}-${s.name}.png`;
            await page.screenshot({ path: join(dir, file) });
            items.push(lib.item(dir, file, { kind: 'shot', route, profile, mode, tier: st?.tier ?? null, pass: ok, metrics: { stop: s.name, scrollY: s.y, settled: ok } }));
          }
          if (mode === 'static' || mode === 'reduced') {
            const file = `${base}-full.png`;
            await page.screenshot({ path: join(dir, file), fullPage: true });
            items.push(lib.item(dir, file, { kind: 'shot-full', route, profile, mode, tier: st?.tier ?? null, pass: true, metrics: {} }));
          }
          const ovf = await measure(page);
          const verdict = gate.verdict();
          const logFile = `${base}-console.json`;
          lib.writeJson(join(dir, logFile), { verdict, events: gate.events });
          items.push(lib.item(dir, logFile, { kind: 'console', route, profile, mode, tier: st?.tier ?? null, pass: verdict.pass, metrics: { failures: verdict.failures.length } }));
          items.push({ kind: 'page', path: null, sha256: null, route, profile, mode, tier: st?.tier ?? null, pass: settled && tierOk && ovf.maxOverflowPx === 0 && ovf.offenders.length === 0, metrics: { settled, expectedTier: wantTier, tierReason: st?.tierReason ?? null, renderer: st?.renderer ?? null, overflowPx: ovf.maxOverflowPx, overflowOffenders: ovf.offenders } });
          await ctx.close();
        }
      }
    }
  } finally {
    await srv.close();
  }
  return finish(lib, dir, items, 'shoot');
}

// ---------------------------------------------------------------- a11y
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const TEXT_SPACING = '*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-block-end:2em!important}';

async function a11y() {
  const lib = await harness();
  const { AxeBuilder } = await import('@axe-core/playwright');
  const { walk } = await import('../tests/harness/keyboard/run.mjs');
  const { measure } = await import('../tests/harness/overflow/run.mjs');
  const dir = outDir(lib, 'a11y');
  const routes = list(o.routes, '/,/work/project-01/,/404.html');
  const srv = await lib.serve();
  const items = [];
  try {
    // 1. axe at D2, T2 and P2 in auto, static, reduced and dark. W fails on any violation, and on any
    //    color-contrast 'incomplete' in static.
    for (const profile of list(o.profiles, 'D2,T2,P2')) {
      for (const mode of ['auto', 'static', 'reduced', 'dark']) {
        for (const route of routes) {
          const ctx = await lib.newContext(profile, mode === 'dark' ? 'auto' : mode, mode === 'dark' ? { colorScheme: 'dark' } : {});
          const page = await ctx.newPage();
          await page.goto(lib.routeUrl(srv.base, route, mode === 'dark' ? 'auto' : mode), { waitUntil: 'load' });
          await lib.waitSettled(page, 10000);
          const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
          const contrastIncomplete = r.incomplete.filter((x) => x.id === 'color-contrast');
          const file = `axe/${slug(route)}-${profile}-${mode}.json`;
          lib.writeJson(join(dir, file), { violations: r.violations, incomplete: r.incomplete.map((x) => ({ id: x.id, nodes: x.nodes.map((n) => ({ target: n.target, why: n.any.map((a) => a.message).join(' | ') })) })), passes: r.passes.length, testEngine: r.testEngine });
          items.push(lib.item(dir, file, { kind: 'axe', route, profile, mode, tier: null, pass: r.violations.length === 0 && !(mode === 'static' && contrastIncomplete.length), metrics: { violations: r.violations.length, incomplete: r.incomplete.length, contrastIncomplete: contrastIncomplete.length } }));
          await ctx.close();
        }
      }
    }
    // 2. Per route at D2 and P2: keyboard walk with ring coverage, text spacing, forced colours, dark scheme, the
    //    accessibility tree, and no visible text box over a GL slot at rest.
    for (const profile of ['D2', 'P2']) {
      for (const route of routes) {
        const ctx = await lib.newContext(profile);
        const page = await ctx.newPage();
        await page.goto(srv.base + route, { waitUntil: 'load' });
        await lib.waitSettled(page, 10000);
        const tree = await page.locator('body').ariaSnapshot();
        const treeFile = `tree/${slug(route)}-${profile}.yml`;
        mkdirSync(join(dir, 'tree'), { recursive: true });
        writeFileSync(join(dir, treeFile), tree);
        items.push(lib.item(dir, treeFile, { kind: 'a11y-tree', route, profile, mode: 'auto', tier: null, pass: tree.length > 0, metrics: { lines: tree.split('\n').length } }));
        const textOverGl = await page.evaluate(() => {
          const slots = [...document.querySelectorAll('[data-gl]')].map((s) => s.getBoundingClientRect());
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
        items.push({ kind: 'text-over-gl', path: null, sha256: null, route, profile, mode: 'auto', tier: null, pass: textOverGl.length === 0, metrics: { hits: textOverGl } });
        const stopsWalked = await walk(page);
        const walkFile = `keyboard/${slug(route)}-${profile}.json`;
        lib.writeJson(join(dir, walkFile), stopsWalked);
        items.push(lib.item(dir, walkFile, { kind: 'keyboard-walk', route, profile, mode: 'auto', tier: null, pass: stopsWalked.length > 0 && stopsWalked.every((s) => s.pass), metrics: { stops: stopsWalked.length, minRing: Math.min(...stopsWalked.filter((s) => s.coverage !== null).map((s) => s.coverage)) } }));
        await ctx.close();

        // Text spacing (WCAG 1.4.12): no clipped text and no overflow.
        const ts = await lib.newContext(profile);
        const tp = await ts.newPage();
        await tp.goto(srv.base + route, { waitUntil: 'load' });
        await tp.addStyleTag({ content: TEXT_SPACING });
        await lib.waitSettled(tp, 10000);
        const clipped = await tp.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => { const cs = getComputedStyle(e); return /hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY) && !e.classList.contains('sr-only') && !e.closest('#rail') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1); }).map((e) => e.tagName.toLowerCase() + '.' + e.className));
        const ovf = await measure(tp);
        const tsFile = `spacing/${slug(route)}-${profile}.png`;
        mkdirSync(join(dir, 'spacing'), { recursive: true });
        await tp.screenshot({ path: join(dir, tsFile), fullPage: true });
        items.push(lib.item(dir, tsFile, { kind: 'text-spacing', route, profile, mode: 'auto', tier: null, pass: clipped.length === 0 && ovf.maxOverflowPx === 0, metrics: { clipped, overflowPx: ovf.maxOverflowPx } }));
        await ts.close();

        // Forced colours: the focus ring stays visible (an outline, not only a box-shadow).
        const fc = await lib.newContext(profile, 'auto', { forcedColors: 'active' });
        const fp = await fc.newPage();
        await fp.goto(srv.base + route, { waitUntil: 'load' });
        await lib.waitSettled(fp, 10000);
        await fp.keyboard.press('Tab');
        await fp.keyboard.press('Tab');
        const ring = await fp.evaluate(() => { const cs = getComputedStyle(document.activeElement); return { style: cs.outlineStyle, width: cs.outlineWidth, el: document.activeElement.tagName }; });
        const fcFile = `forced/${slug(route)}-${profile}.png`;
        mkdirSync(join(dir, 'forced'), { recursive: true });
        await fp.screenshot({ path: join(dir, fcFile) });
        items.push(lib.item(dir, fcFile, { kind: 'forced-colors', route, profile, mode: 'auto', tier: null, pass: ring.style !== 'none' && parseFloat(ring.width) >= 2, metrics: ring }));
        await fc.close();

        // Dark scheme: a shot and the overflow check.
        const dk = await lib.newContext(profile, 'auto', { colorScheme: 'dark' });
        const dp = await dk.newPage();
        await dp.goto(srv.base + route, { waitUntil: 'load' });
        await lib.waitSettled(dp, 10000);
        const dkFile = `dark/${slug(route)}-${profile}.png`;
        mkdirSync(join(dir, 'dark'), { recursive: true });
        await dp.screenshot({ path: join(dir, dkFile), fullPage: true });
        const dovf = await measure(dp);
        items.push(lib.item(dir, dkFile, { kind: 'dark', route, profile, mode: 'auto', tier: null, pass: dovf.maxOverflowPx === 0, metrics: { overflowPx: dovf.maxOverflowPx } }));
        await dk.close();
      }
    }
  } finally {
    await srv.close();
  }
  return finish(lib, dir, items, 'a11y');
}

// ---------------------------------------------------------------- lighthouse
function runAsync(cmd, args) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: ROOT });
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d));
    p.stdout.on('data', () => {});
    p.on('close', (status) => res({ status, stderr }));
  });
}

const GL_CHUNK = /\/_astro\/(gl|three\.[a-z]+)\.[\w-]+\.js$/;
async function lighthouse() {
  const lib = await harness();
  const { startServer } = await import('./serve-dist.mjs');
  const dir = outDir(lib, 'lighthouse');
  const routes = list(o.routes, '/');
  const runs = Number(o.runs) || 5;
  const port = 4391;
  const server = await startServer({ root: join(ROOT, 'dist'), port, quiet: true });
  const items = [];
  try {
    for (const route of routes) {
      for (const ff of ['mobile', 'desktop']) {
        const reports = [];
        for (let i = 0; i < runs; i++) {
          const file = join(dir, `${slug(route)}-${ff}-${i + 1}.json`);
          const args = ['-y', 'lighthouse@13.5.0', `http://127.0.0.1:${port}${route}`, '--output=json', `--output-path=${file}`, '--chrome-flags=--headless=new --mute-audio', '--quiet', '--only-categories=performance,accessibility,best-practices,seo', ...(ff === 'desktop' ? ['--preset=desktop'] : [])];
          // npm's own npx script under this Node, so no shell splits the --chrome-flags value. Async, because the
          // server Lighthouse loads runs in this process: a blocking spawn would starve it.
          const npx = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
          const r = await runAsync(existsSync(npx) ? process.execPath : 'npx', existsSync(npx) ? [npx, ...args] : args);
          if (r.status !== 0 || !existsSync(file)) throw new Error(`lighthouse failed: ${r.stderr?.slice(-400)}`);
          const lhr = JSON.parse(readFileSync(file, 'utf8'));
          const timings = lhr.audits['user-timings']?.details?.items?.map((x) => x.name) ?? [];
          const renderer = timings.find((n) => n.startsWith('stage:renderer='))?.slice(15) ?? null;
          const tier = timings.find((n) => n.startsWith('stage:tier='))?.slice(11).split(':')[0] ?? null;
          // A run is valid on a real renderer at the expected tier, with the LCP element budgets.md names (W-D030).
          const lcpElement = lib.lcpElementOf(lhr);
          const lcpCheck = lib.lcpElementVerdict(lcpElement, ff);
          const invalid = [
            !renderer || lib.SOFTWARE_RENDERER.test(renderer) ? `renderer ${renderer ?? 'missing'}` : null,
            tier !== (ff === 'mobile' ? 'lite' : 'full') ? `tier ${tier ?? 'missing'}` : null,
            lcpCheck.why,
          ].filter(Boolean);
          const valid = invalid.length === 0;
          // D-005: the GL chunk loads after first paint. Observed FCP and the user-timing mark share the navigation
          // clock; network-requests times start at the document request, which is at or after navigation start.
          const observedFcp = lhr.audits.metrics?.details?.items?.[0]?.observedFirstContentfulPaint ?? null;
          const glMarkMs = lhr.audits['user-timings']?.details?.items?.find((x) => x.name === 'stage:gl-start')?.startTime ?? null;
          const glReqs = (lhr.audits['network-requests']?.details?.items ?? []).filter((x) => GL_CHUNK.test(new URL(x.url).pathname));
          const glRequestMs = glReqs.length ? Math.min(...glReqs.map((x) => x.networkRequestTime ?? x.rendererStartTime)) : null;
          const glAfterFcp = observedFcp !== null && glMarkMs !== null && glRequestMs !== null && glMarkMs > observedFcp && glRequestMs > observedFcp;
          reports.push({
            run: i + 1, file: `${slug(route)}-${ff}-${i + 1}.json`, valid, invalid, renderer, tier, observedFcp, glMarkMs, glRequestMs, glAfterFcp,
            performance: lhr.categories.performance.score, accessibility: lhr.categories.accessibility.score, bestPractices: lhr.categories['best-practices'].score, seo: lhr.categories.seo?.score ?? null,
            lcp: lhr.audits['largest-contentful-paint'].numericValue, cls: lhr.audits['cumulative-layout-shift'].numericValue, tbt: lhr.audits['total-blocking-time'].numericValue, fcp: lhr.audits['first-contentful-paint'].numericValue,
            lcpElement, lcpElementOk: lcpCheck.ok,
          });
        }
        const sorted = [...reports].sort((a, b) => a.performance - b.performance);
        const median = sorted[Math.floor(sorted.length / 2)];
        const need = ff === 'mobile' ? 0.9 : 0.95;
        // budgets.md: LCP <= 2.5 s mobile and <= 2.0 s desktop, TBT <= 150 ms, CLS <= 0.02; each a median over the runs.
        const med = (k) => [...reports].map((r) => r[k]).sort((a, b) => a - b)[Math.floor(reports.length / 2)];
        const budget = { lcp: ff === 'mobile' ? 2500 : 2000, tbt: 150, cls: 0.02 };
        const medians = { lcp: med('lcp'), tbt: med('tbt'), cls: med('cls'), fcp: med('fcp') };
        const budgetPass = medians.lcp <= budget.lcp && medians.tbt <= budget.tbt && medians.cls <= budget.cls;
        const glOrderPass = reports.every((r) => r.glAfterFcp);
        const summaryFile = `${slug(route)}-${ff}-summary.json`;
        lib.writeJson(join(dir, summaryFile), { route, formFactor: ff, runs: reports, median, medians, budget, budgetPass, glOrderPass });
        for (const r of reports) items.push(lib.item(dir, r.file, { kind: 'lighthouse-run', route, profile: ff, mode: 'auto', tier: r.tier, pass: r.valid && r.glAfterFcp, metrics: { performance: r.performance, accessibility: r.accessibility, cls: r.cls, lcp: Math.round(r.lcp), lcpElement: r.lcpElement?.selector ?? null, lcpElementOk: r.lcpElementOk, invalid: r.invalid, renderer: r.renderer, observedFcp: r.observedFcp, glMarkMs: r.glMarkMs === null ? null : Math.round(r.glMarkMs), glRequestMs: r.glRequestMs === null ? null : Math.round(r.glRequestMs), glAfterFcp: r.glAfterFcp } }));
        items.push(lib.item(dir, summaryFile, { kind: 'lighthouse', route, profile: ff, mode: 'auto', tier: median.tier, pass: reports.every((r) => r.valid) && median.performance >= need && median.accessibility === 1 && median.cls === 0 && budgetPass && glOrderPass, metrics: { medianPerformance: median.performance, accessibility: median.accessibility, bestPractices: median.bestPractices, cls: median.cls, medianLcp: Math.round(medians.lcp), medianTbt: Math.round(medians.tbt), medianFcp: Math.round(medians.fcp), lcpBudget: budget.lcp, budgetPass, glAfterFcpRuns: reports.filter((r) => r.glAfterFcp).length, runs: reports.length, renderer: median.renderer, lcpElement: median.lcpElement?.selector ?? null, lcpElementOkRuns: reports.filter((r) => r.lcpElementOk).length } }));
      }
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
  return finish(lib, dir, items, 'lighthouse');
}

async function finish(lib, dir, items, name) {
  const failed = items.filter((i) => !i.pass);
  const path = await lib.writeManifest(dir, items, { crew: crewId(), fields: { command: name, failed: failed.length } });
  await lib.closeBrowsers();
  console.log(`${name}: ${items.length} items, ${failed.length} failed; manifest ${path}`);
  for (const f of failed.slice(0, 20)) console.log(`  FAIL ${f.kind} ${f.route} ${f.profile} ${f.mode} ${JSON.stringify(f.metrics).slice(0, 200)}`);
  return failed.length ? 1 : 0;
}

const commands = { open: () => open(o._[0]), check, shoot, a11y, lighthouse };
if (!commands[command]) {
  console.error('usage: node scripts/crew.mjs open <id> | check | shoot | a11y | lighthouse [--routes ...] [--profiles ...] [--modes ...]');
  process.exit(2);
}
process.exitCode = await commands[command]();
