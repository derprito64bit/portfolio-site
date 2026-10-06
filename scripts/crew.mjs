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
//   node scripts/crew.mjs lighthouse [opts]     Lighthouse (the budgets block's version and run count) per form
//                                               factor, medians over the clean runs, valid only on a real
//                                               renderer at the expected tier and with the LCP element budgets.md names
//                                               (the h1 on desktop; the h1 or print 1's still on mobile); every run
//                                               must request GL after the observed FCP (D-005), and the medians must
//                                               meet the Lighthouse, LCP, TBT and CLS budgets; host load per
//                                               Measurement validity R1-R5 (hostload.ps1 precheck and -Watch, #67)
// Options: --routes /,/work/project-01/,/404.html  --profiles D1,D2,...  --modes auto,static,reduced
//          --crew W-F  --wave wave3a  --role crew|gate  --out <dir>
//          lighthouse: --runs n  --budgets <budgets.md>  --precheck-wait <min>  --plant bench-low:<n|all>,watch-flagged:<n|all>,a11y-low:<n|all>
//                      --stub <file> (tests only: planted hostload and Lighthouse results, see STUB below)
// Evidence goes to ../portfolio-evidence/<wave>/<crew>/<sha7>/<role>/<command>/ with manifest.json. Any failed item
// makes the command exit 1; otherwise a blocked (host) item makes it exit 75.
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
          items.push({ kind: 'page', path: null, sha256: null, route, profile, mode, tier: st?.tier ?? null, pass: settled && tierOk && ovf.maxOverflowPx <= lib.budget('site.layout.overflowPx') && ovf.offenders.length === 0, metrics: { settled, expectedTier: wantTier, tierReason: st?.tierReason ?? null, renderer: st?.renderer ?? null, overflowPx: ovf.maxOverflowPx, overflowOffenders: ovf.offenders } });
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
          items.push(lib.item(dir, file, { kind: 'axe', route, profile, mode, tier: null, pass: r.violations.length <= lib.budget('site.zero.axeViolationsWcag') && !(mode === 'static' && contrastIncomplete.length), metrics: { violations: r.violations.length, incomplete: r.incomplete.length, contrastIncomplete: contrastIncomplete.length } }));
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
        items.push(lib.item(dir, tsFile, { kind: 'text-spacing', route, profile, mode: 'auto', tier: null, pass: clipped.length === 0 && ovf.maxOverflowPx <= lib.budget('site.layout.overflowPx'), metrics: { clipped, overflowPx: ovf.maxOverflowPx } }));
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
        items.push(lib.item(dir, dkFile, { kind: 'dark', route, profile, mode: 'auto', tier: null, pass: dovf.maxOverflowPx <= lib.budget('site.layout.overflowPx'), metrics: { overflowPx: dovf.maxOverflowPx } }));
        await dk.close();
      }
    }
  } finally {
    await srv.close();
  }
  return finish(lib, dir, items, 'a11y');
}


// ---------------------------------------------------------------- lighthouse
// Every number comes from the json budgets block (docs/agents/budgets.md, or --budgets <file>), never a literal, and
// every set follows "Measurement validity" R1-R5 (#67), with the host key's thresholds:
//   R1  hostload.ps1's precheck before each set (route x form factor) and again before an R5 extension. Exit 75 is
//       re-checked every minute for up to R1's wait (30 minutes, read from budgets.md; --precheck-wait <min>
//       overrides it); a precheck that never clears makes the set blocked (host), never pass or fail. A busy try that
//       a retry cleared is recorded as a wait, not as blocked.
//   R2  each run runs in its own node worker (the server and Lighthouse, as the host key was calibrated), watched by
//       hostload.ps1 -Watch; a run whose benchmarkIndex is under the ratio, or whose -Watch file does not exit 0, is
//       host-suspect and invalid with the reason.
//   R3  a host-suspect run is replaced, never averaged in, at most host.rules.extraRunsPerSetMax per set; a set that
//       cannot reach its run count with clean runs is blocked (host).
//   R5  a set whose median is at or above host.rules.nearBudgetPct of a maximum, or with a clean run past a budget
//       (above a maximum or below a minimum), grows to host.rules.nearBudgetRuns after a fresh precheck; the summary
//       reports the median of all clean runs, the worst run and the count past budget (lib.lighthouseSetSummary).
// Test hooks (negative controls): --plant bench-low:<run|all> lowers a run's benchmarkIndex under the ratio;
// --plant watch-flagged:<run|all> replaces its -Watch result with a flagged foreign process; --plant a11y-low:<run|all>
// puts its accessibility score under a11yMin (R5 must grow the set).
function runAsync(cmd, args, input = null) {
  return new Promise((res) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: [input === null ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    let stderr = '';
    p.stderr.on('data', (d) => (stderr += d));
    p.stdout.on('data', () => {});
    p.on('close', (status) => res({ status, stderr }));
  });
}

/** The worker: serve dist/ in this process, wait for 'go' on stdin (the watch is sampling by then), run Lighthouse. */
async function lhRun() {
  const { startServer } = await import('./serve-dist.mjs');
  const b = (await harness()).readBudgets(o.budgets ? resolve(String(o.budgets)) : undefined);
  const server = await startServer({ root: join(ROOT, 'dist'), port: 0, quiet: true });
  const { port } = server.address();
  await new Promise((res) => {
    let buf = '';
    process.stdin.on('data', (d) => { buf += d; if (buf.includes('go')) res(); });
    process.stdin.on('end', res);
  });
  const args = ['-y', `lighthouse@${b.site.protocol.lighthouseVersion}`, `http://127.0.0.1:${port}${o.route}`, '--output=json', `--output-path=${o.file}`, '--chrome-flags=--headless=new --mute-audio', '--quiet', '--only-categories=performance,accessibility,best-practices,seo', ...(o.ff === 'desktop' ? ['--preset=desktop'] : [])];
  // npm's own npx script under this Node, so no shell splits the --chrome-flags value. Async, because the server
  // Lighthouse loads runs in this process: a blocking spawn would starve it.
  const npx = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  const r = await runAsync(existsSync(npx) ? process.execPath : 'npx', existsSync(npx) ? [npx, ...args] : args);
  await new Promise((res) => server.close(res));
  if (r.status !== 0) process.stderr.write(r.stderr.slice(-400));
  return r.status ?? 1;
}

const GL_CHUNK = /\/_astro\/(gl|three\.[a-z]+)\.[\w-]+\.js$/;
const plantSpec = (kind) => {
  const p = String(o.plant || '').split(',').find((x) => x.startsWith(`${kind}:`));
  return p ? p.slice(kind.length + 1) : null;
};
const planted = (kind, n) => {
  const s = plantSpec(kind);
  return s !== null && (s === 'all' || s.split('+').map(Number).includes(n));
};

/**
 * --stub <file> (tests only, never a measurement): the hostload precheck and -Watch results and the Lighthouse reports
 * come from a JSON file instead of PowerShell and Lighthouse ({ prechecks: [{exitCode, json}], runs: { mobile: [{lhr,
 * watch}], desktop: [...] } }, each list taken in order, its last entry repeated), and R1's wait runs on a virtual
 * clock. Everything else is this command as it runs for real, so tests/w-f/hostload.test.mjs drives the whole set
 * loop (R1, R3, R5, the summary, the manifest items and the exit code) with planted runs (round-2 should-fix S2).
 */
const STUB = o.stub ? JSON.parse(readFileSync(resolve(String(o.stub)), 'utf8')) : null;
const stubNext = (list) => (list.length > 1 ? list.shift() : list[0]);
let virtualMs = 0;
const clock = STUB ? { now: () => virtualMs, sleep: async (ms) => { virtualMs += ms; } } : { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

/** One Lighthouse run in a watched worker. Resolves with its report fields, host load and R2 verdict. */
async function lighthouseRun(lib, dir, b, route, ff, n) {
  const base = `${slug(route)}-${ff}-${n}`;
  const file = join(dir, `${base}.json`);
  const watchFile = join(dir, `hostload-${base}-watch.json`);
  let w;
  if (STUB) {
    const s = stubNext(STUB.runs[ff]);
    writeFileSync(file, JSON.stringify(s.lhr));
    w = s.watch ?? { exitCode: null, json: null };
    if (w.json) writeFileSync(watchFile, JSON.stringify(w.json));
  } else {
    const child = spawn(process.execPath, [join(ROOT, 'scripts/crew.mjs'), 'lh-run', '--route', route, '--ff', ff, '--file', file, ...(o.budgets ? ['--budgets', String(o.budgets)] : [])], { cwd: ROOT, stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    const exited = new Promise((res) => child.on('close', res));
    const watch = lib.startHostload(['-Watch', child.pid, '-Out', watchFile, '-MaxMinutes', 15], { budgetsFile: o.budgets ? resolve(String(o.budgets)) : undefined });
    await lib.sleep(watch.child ? 3000 : 0); // hostload's first sample lands within its 5 s head-gap bound
    child.stdin.end('go\n');
    const [status, done] = await Promise.all([exited, watch.done]);
    w = done;
    if (status !== 0 || !existsSync(file)) throw new Error(`lighthouse failed (run ${n}): ${stderr.slice(-400)}`);
  }
  const lhr = JSON.parse(readFileSync(file, 'utf8'));
  let benchmarkIndex = lhr.environment?.benchmarkIndex ?? null;
  const plantedFields = [];
  if (planted('bench-low', n)) {
    benchmarkIndex = Math.floor((b.host?.benchmarkIndex?.baseline ?? 1000) * (b.host?.benchmarkIndex?.suspectBelowRatio ?? 1) * 0.5);
    plantedFields.push('benchmarkIndex');
  }
  let watchResult = w.exitCode === null && !w.json ? null : w;
  if (planted('watch-flagged', n)) {
    watchResult = { exitCode: 75, stderr: '', json: { verdict: 'flagged', reasons: ['foreign process planted.exe (pid 4242) at 55% > foreignCpuPctMax (planted)'] } };
    plantedFields.push('watch');
  }
  // R5's minimums, end to end: a planted accessibility score just under a11yMin must grow the set to nearBudgetRuns.
  let accessibility = lhr.categories.accessibility.score;
  if (planted('a11y-low', n)) {
    accessibility = Math.round((b.site.lighthouse.a11yMin - 4)) / 100;
    plantedFields.push('accessibility');
  }
  const suspect = lib.hostSuspectReasons({ benchmarkIndex, watch: watchResult }, b.host);
  const timings = lhr.audits['user-timings']?.details?.items?.map((x) => x.name) ?? [];
  const renderer = timings.find((x) => x.startsWith('stage:renderer='))?.slice(15) ?? null;
  const tier = timings.find((x) => x.startsWith('stage:tier='))?.slice(11).split(':')[0] ?? null;
  // A run is valid on a real renderer at the expected tier, with the LCP element budgets.md names (W-D030), on a host
  // that was quiet for it (R2).
  const lcpElement = lib.lcpElementOf(lhr);
  const lcpCheck = lib.lcpElementVerdict(lcpElement, ff);
  const invalid = [
    !renderer || lib.SOFTWARE_RENDERER.test(renderer) ? `renderer ${renderer ?? 'missing'}` : null,
    tier !== (ff === 'mobile' ? 'lite' : 'full') ? `tier ${tier ?? 'missing'}` : null,
    lcpCheck.why,
    ...suspect,
  ].filter(Boolean);
  // D-005: the GL chunk loads after first paint. Observed FCP and the user-timing mark share the navigation clock;
  // network-requests times start at the document request, which is at or after navigation start.
  const observedFcp = lhr.audits.metrics?.details?.items?.[0]?.observedFirstContentfulPaint ?? null;
  const glMarkMs = lhr.audits['user-timings']?.details?.items?.find((x) => x.name === 'stage:gl-start')?.startTime ?? null;
  const glReqs = (lhr.audits['network-requests']?.details?.items ?? []).filter((x) => GL_CHUNK.test(new URL(x.url).pathname));
  const glRequestMs = glReqs.length ? Math.min(...glReqs.map((x) => x.networkRequestTime ?? x.rendererStartTime)) : null;
  const glAfterFcp = observedFcp !== null && glMarkMs !== null && glRequestMs !== null && glMarkMs > observedFcp && glRequestMs > observedFcp;
  return {
    run: n, file: `${base}.json`, watchFile: existsSync(watchFile) ? `hostload-${base}-watch.json` : null, watchVerdict: watchResult?.json?.verdict ?? null, watchExit: watchResult?.exitCode ?? null,
    benchmarkIndex, suspect, planted: plantedFields, valid: invalid.length === 0, invalid, renderer, tier, observedFcp, glMarkMs, glRequestMs, glAfterFcp,
    performance: lhr.categories.performance.score, accessibility, bestPractices: lhr.categories['best-practices'].score, seo: lhr.categories.seo?.score ?? null,
    lcp: lhr.audits['largest-contentful-paint'].numericValue, cls: lhr.audits['cumulative-layout-shift'].numericValue, tbt: lhr.audits['total-blocking-time'].numericValue, fcp: lhr.audits['first-contentful-paint'].numericValue,
    lcpElement, lcpElementOk: lcpCheck.ok,
  };
}

/**
 * R1: the precheck. While it exits 75 it is taken again every minute until R1's wait is spent (lib.precheckWaitMin:
 * the block's host.rules.precheckWaitMin, else R1's own sentence, 30 minutes; --precheck-wait <min> overrides it and 0
 * means no wait). An exit other than 0 or 75 is a broken tool: blocked at once.
 */
/** How often a busy precheck is taken again (a polling interval, not a budget). */
const PRECHECK_RETRY_MS = 60000;
async function precheck(lib, dir, name) {
  const waitMs = lib.precheckWaitMin(o['precheck-wait'], lib.readBudgets(o.budgets ? resolve(String(o.budgets)) : undefined).host) * 60000;
  const t0 = clock.now();
  const tries = [];
  for (let k = 0; ; k++) {
    const file = join(dir, `hostload-${name}${k ? `-retry${k}` : ''}.json`);
    let r;
    if (STUB) {
      const s = stubNext(STUB.prechecks);
      writeFileSync(file, JSON.stringify(s.json ?? {}));
      r = { exitCode: s.exitCode, json: s.json ?? null, stderr: s.stderr ?? '', file };
    } else {
      r = await lib.startHostload(['-Out', file], { budgetsFile: o.budgets ? resolve(String(o.budgets)) : undefined }).done;
    }
    tries.push({ file: r.file ? r.file.slice(dir.length + 1) : null, at: new Date().toISOString(), exitCode: r.exitCode, verdict: r.json?.verdict ?? null, reasons: r.json?.reasons ?? (r.stderr ? [r.stderr] : []), cpuBusyPct: r.json?.cpuBusyPct?.median ?? null, gpu3dPct: r.json?.gpu3dPct?.median ?? null });
    // 0 clear; 75 busy, flagged, incomplete or no-data: wait; uncalibrated, or any other exit (a broken tool): blocked.
    const next = lib.precheckNext({ exitCode: r.exitCode, verdict: r.json?.verdict ?? null }, clock.now() - t0, waitMs, PRECHECK_RETRY_MS);
    if (next !== 'wait') return { ok: next === 'run', last: tries[tries.length - 1], tries, waitedMin: Math.round((clock.now() - t0) / 6000) / 10 };
    await clock.sleep(PRECHECK_RETRY_MS);
  }
}

async function lighthouse() {
  const lib = await harness();
  const dir = outDir(lib, 'lighthouse');
  const b = lib.readBudgets(o.budgets ? resolve(String(o.budgets)) : undefined);
  const site = b.site;
  const rules = b.host?.rules ?? {};
  const routes = list(o.routes, '/');
  const runs = Number(o.runs) || site.protocol.lighthouseRuns;
  const items = [];
  const loads = [];
  for (const route of routes) {
    for (const ff of ['mobile', 'desktop']) {
      const name = `${slug(route)}-${ff}`;
      const budget = lib.lighthouseBudget(site, ff);
      const pre = [await precheck(lib, dir, `${name}-pre`)];
      const reports = [];
      let need = runs;
      let blocked = pre[0].ok ? null : `precheck ${pre[0].last.verdict ?? `exit ${pre[0].last.exitCode}`}: ${pre[0].last.reasons.slice(0, 3).join('; ')}`;
      let grew = null;
      while (!blocked) {
        const step = lib.setStep(reports.map((r) => ({ suspect: r.suspect })), need, rules.extraRunsPerSetMax ?? 0);
        if (step.next === 'blocked') {
          blocked = step.why;
          break;
        }
        if (step.next === 'done') {
          // R5: near a budget, or a clean run past one (above a maximum or below a minimum), the set grows to
          // nearBudgetRuns after a fresh precheck.
          const r5 = lib.r5Grow(reports.filter((r) => !r.suspect.length), budget, rules, need);
          if (r5.grow && !o['no-r5']) {
            grew = { from: r5.from, to: r5.to, why: r5.why };
            need = r5.to;
            const again = await precheck(lib, dir, `${name}-pre-r5`);
            pre.push(again);
            if (!again.ok) blocked = `R5 precheck ${again.last.verdict ?? `exit ${again.last.exitCode}`}: ${again.last.reasons.slice(0, 3).join('; ')}`;
            continue;
          }
          break;
        }
        reports.push(await lighthouseRun(lib, dir, b, route, ff, reports.length + 1));
      }
      const clean = reports.filter((r) => !r.suspect.length);
      const replaced = reports.filter((r) => r.suspect.length).map((r) => ({ run: r.run, reasons: r.suspect }));
      // Medians over the clean runs only (R3: a host-suspect run is never averaged in); R5's report: the median of
      // all clean runs, the worst run and the count past budget.
      const sum = lib.lighthouseSetSummary(clean, budget);
      const { medians } = sum;
      const median = sum.medianRun;
      const budgetPass = Boolean(medians) && medians.lcp <= budget.lcp && medians.tbt <= budget.tbt && medians.cls <= budget.cls;
      const glOrderPass = clean.every((r) => r.glAfterFcp);
      // The clear precheck the set ran after (a wait's busy tries describe the host before the set, not during it).
      const ran = pre[0].tries.find((t) => t.exitCode === 0) ?? pre[0].last;
      const load = { benchmarkIndex: lib.median(clean.map((r) => r.benchmarkIndex)), cpuBusyPct: ran.cpuBusyPct, gpu3dPct: ran.gpu3dPct };
      loads.push(load); // a blocked set still records the precheck that blocked it
      const summaryFile = `${name}-summary.json`;
      // #11's stub-home line asks for CLS 0 (the median), inside budgets.md's CLS limit.
      const pass = blocked ? null : clean.every((r) => r.valid) && medians.performance >= budget.performance && medians.accessibility >= budget.accessibility && medians.bestPractices >= budget.bestPractices && medians.cls === 0 && budgetPass && glOrderPass;
      lib.writeJson(join(dir, summaryFile), { route, formFactor: ff, budgetsFrom: o.budgets ?? 'docs/agents/budgets.md', budget, need, grew, prechecks: pre, blocked, runs: reports, clean: clean.map((r) => r.run), replaced, medians, medianRun: median?.run ?? null, worstRun: sum.worstRun, worst: sum.worst, pastBudget: sum.pastBudget, budgetPass, glOrderPass, hostLoad: load, pass });
      for (const r of reports) {
        const suspect = r.suspect.length > 0;
        items.push(lib.item(dir, r.file, {
          kind: 'lighthouse-run', route, profile: ff, mode: 'auto', tier: r.tier,
          // A replaced run is neither pass nor fail (R3): it is listed with its reason and left out of the medians.
          pass: suspect ? null : r.valid && r.glAfterFcp, ...(suspect ? { replaced: true } : {}),
          metrics: { performance: r.performance, accessibility: r.accessibility, cls: r.cls, lcp: Math.round(r.lcp), tbt: Math.round(r.tbt), benchmarkIndex: r.benchmarkIndex, watch: r.watchFile, watchVerdict: r.watchVerdict, hostSuspect: r.suspect, planted: r.planted, lcpElement: r.lcpElement?.selector ?? null, lcpElementOk: r.lcpElementOk, invalid: r.invalid, renderer: r.renderer, observedFcp: r.observedFcp, glMarkMs: r.glMarkMs === null ? null : Math.round(r.glMarkMs), glRequestMs: r.glRequestMs === null ? null : Math.round(r.glRequestMs), glAfterFcp: r.glAfterFcp },
        }));
      }
      // R1: a busy try that a retry cleared is a wait (pass null, no blocked); only a precheck that never cleared blocks.
      for (const t of lib.precheckItems(pre)) {
        if (!t.file) continue;
        items.push(lib.item(dir, t.file, { kind: 'hostload-precheck', route, profile: ff, mode: 'auto', tier: null, pass: t.pass, ...(t.blocked ? { blocked: t.blocked } : {}), ...(t.waited ? { waited: true } : {}), metrics: { exitCode: t.exitCode, verdict: t.verdict, reasons: t.reasons, cpuBusyPct: t.cpuBusyPct, gpu3dPct: t.gpu3dPct, at: t.at } }));
      }
      items.push(lib.item(dir, summaryFile, {
        kind: 'lighthouse', route, profile: ff, mode: 'auto', tier: median?.tier ?? null, pass, ...(blocked ? { blocked: 'host' } : {}),
        metrics: {
          blocked, need, grew, cleanRuns: clean.length, replaced: replaced.length,
          medianPerformance: medians?.performance ?? null, accessibility: medians?.accessibility ?? null, bestPractices: medians?.bestPractices ?? null, cls: medians?.cls ?? null,
          medianLcp: medians ? Math.round(medians.lcp) : null, medianTbt: medians ? Math.round(medians.tbt) : null, medianFcp: medians ? Math.round(medians.fcp) : null,
          worstRun: sum.worstRun, worst: sum.worst, pastBudgetCount: sum.pastBudget.count, pastBudget: sum.pastBudget.runs,
          budget, budgetPass, glAfterFcpRuns: clean.filter((r) => r.glAfterFcp).length, medianRun: median?.run ?? null, renderer: median?.renderer ?? null, lcpElement: median?.lcpElement?.selector ?? null, lcpElementOkRuns: clean.filter((r) => r.lcpElementOk).length, ...load,
        },
      }));
    }
  }
  const hostLoad = {
    benchmarkIndex: lib.median(loads.map((l) => l.benchmarkIndex)), cpuBusyPct: lib.median(loads.map((l) => l.cpuBusyPct)), gpu3dPct: lib.median(loads.map((l) => l.gpu3dPct)),
    source: 'benchmarkIndex: the median of the sets\' clean-run medians; cpuBusyPct and gpu3dPct: the median of the sets\' precheck medians',
  };
  return finish(lib, dir, items, 'lighthouse', hostLoad);
}

/** Exit 1 on any failed item; else 75 when an item is blocked (host); else 0. A replaced run (pass null) is neither. */
async function finish(lib, dir, items, name, hostLoad = {}) {
  const failed = items.filter((i) => i.pass === false || (i.pass !== true && i.pass !== null));
  const blocked = items.filter((i) => i.blocked === 'host');
  const replaced = items.filter((i) => i.replaced);
  const stubbed = STUB ? { host: { stub: true, ...hostLoad }, tools: { stub: true }, name: 'manifest.json' } : {};
  const path = await lib.writeManifest(dir, items, { crew: crewId(), hostLoad, ...stubbed, fields: { command: name, failed: failed.length, blocked: blocked.length, replaced: replaced.length, ...(STUB ? { stub: true } : {}) } });
  await lib.closeBrowsers();
  console.log(`${name}: ${items.length} items, ${failed.length} failed, ${blocked.length} blocked (host), ${replaced.length} replaced; manifest ${path}`);
  for (const f of failed.slice(0, 20)) console.log(`  FAIL ${f.kind} ${f.route} ${f.profile} ${f.mode} ${JSON.stringify(f.metrics).slice(0, 200)}`);
  for (const f of blocked.slice(0, 20)) console.log(`  BLOCKED (host) ${f.kind} ${f.route} ${f.profile} ${JSON.stringify(f.metrics).slice(0, 240)}`);
  return failed.length ? 1 : blocked.length ? 75 : 0;
}

const commands = { open: () => open(o._[0]), check, shoot, a11y, lighthouse, 'lh-run': lhRun };
if (!commands[command]) {
  console.error('usage: node scripts/crew.mjs open <id> | check | shoot | a11y | lighthouse [--routes ...] [--profiles ...] [--modes ...] [--runs n] [--budgets file] [--precheck-wait min]');
  process.exit(2);
}
process.exitCode = await commands[command]();
