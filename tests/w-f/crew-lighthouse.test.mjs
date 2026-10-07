// crew.mjs lighthouse end to end on planted host and Lighthouse results (round-2 should-fix S2, Breaker 2.1 #2): the
// set loop as it runs for real, not its text. GPU-free: `crew.mjs lighthouse --stub <file>` takes hostload's precheck
// and -Watch results and the Lighthouse reports from a file and runs R1's wait on a virtual clock; everything else
// (R1, R3, R5, the medians, the verdict, the manifest items and the exit code) is the command itself.
//   R1  a busy precheck waits and the set runs once it clears (the busy tries are waits, never blocked items); one that
//       never clears within the wait blocks the set (exit 75)
//   R3  a host-suspect run (benchmarkIndex under the ratio) is replaced and never enters the medians
//   R5  a clean set near a maximum grows to nearBudgetRuns after a fresh precheck
//   verdict  a median under the performance minimum fails the set (exit 1); a clean set within budget passes (exit 0)
// Every number comes from the json budgets block. Negative control: CREW_SCRIPT=<a mutated copy of crew.mjs placed in
// scripts/> runs these tests against it (mutants: tests/w-f/crew-lighthouse.mutants.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lighthouseBudget, median, readBudgets } from '../harness/lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CREW = process.env.CREW_SCRIPT ? resolve(ROOT, 'scripts', process.env.CREW_SCRIPT) : join(ROOT, 'scripts/crew.mjs');
const b = readBudgets();
const rules = b.host.rules;
const RUNS = b.site.protocol.lighthouseRuns;
const BASE = b.host.benchmarkIndex.baseline;
const SUSPECT = Math.floor(b.host.benchmarkIndex.suspectBelowRatio * BASE) - 10;
const budget = { mobile: lighthouseBudget(b.site, 'mobile'), desktop: lighthouseBudget(b.site, 'desktop') };

const clear = { exitCode: 0, json: { verdict: 'clear', reasons: [], cpuBusyPct: { median: 3 }, gpu3dPct: { median: 1 } } };
const busy = { exitCode: 75, json: { verdict: 'busy', reasons: ['cpu median 48% > cpuBusyPctMax (planted)'], cpuBusyPct: { median: 48 }, gpu3dPct: { median: 1 } } };

/** A Lighthouse report with every field crew.mjs reads; by default well inside every budget for `ff`. */
function lhr(ff, x = {}) {
  const v = { perf: Math.min(1, budget[ff].performance + 0.03), a11y: 1, bp: 1, seo: 1, lcp: Math.round(0.4 * budget[ff].lcp), tbt: Math.round(0.2 * budget[ff].tbt), cls: 0, fcp: 700, bench: BASE, renderer: 'ANGLE (planted, Direct3D11)', ...x };
  const glStart = v.glStart ?? v.fcp + 100;
  return {
    environment: { benchmarkIndex: v.bench },
    categories: { performance: { score: v.perf }, accessibility: { score: v.a11y }, 'best-practices': { score: v.bp }, seo: { score: v.seo } },
    audits: {
      'user-timings': { details: { items: [{ name: `stage:renderer=${v.renderer}` }, { name: `stage:tier=${ff === 'mobile' ? 'lite' : 'full'}:detect` }, { name: 'stage:gl-start', startTime: glStart }] } },
      'lcp-breakdown-insight': { details: { type: 'list', items: [{ type: 'node', selector: 'main#main > section.hero > div > h1#hero-title', snippet: '<h1 id="hero-title" class="wordmark">' }] } },
      metrics: { details: { items: [{ observedFirstContentfulPaint: v.fcp }] } },
      'network-requests': { details: { items: [{ url: 'http://127.0.0.1:1/_astro/gl.planted.js', networkRequestTime: glStart + 50 }] } },
      'largest-contentful-paint': { numericValue: v.lcp },
      'cumulative-layout-shift': { numericValue: v.cls },
      'total-blocking-time': { numericValue: v.tbt },
      'first-contentful-paint': { numericValue: v.fcp },
    },
  };
}
const watchClear = { exitCode: 0, json: { verdict: 'clear', reasons: [] } };
const runs = (ff, list) => list.map((x) => ({ lhr: lhr(ff, x), watch: watchClear }));
const fine = { mobile: runs('mobile', [{}]), desktop: runs('desktop', [{}]) };

/** Run crew.mjs lighthouse on `stub`; returns its exit code, both set summaries and the manifest. */
function crew(stub, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'crew-lh-'));
  try {
    const file = join(dir, 'stub.json');
    writeFileSync(file, JSON.stringify(stub));
    const out = join(dir, 'out');
    const r = spawnSync(process.execPath, [CREW, 'lighthouse', '--routes', '/', '--crew', 'W-F', '--out', out, '--stub', file, ...extra], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    const read = (n) => (existsSync(join(out, n)) ? JSON.parse(readFileSync(join(out, n), 'utf8')) : null);
    return { status: r.status, out: `${r.stdout}\n${r.stderr}`.slice(-1500), mobile: read('home-mobile-summary.json'), desktop: read('home-desktop-summary.json'), manifest: read('manifest.json') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const prechecksOf = (m, profile) => m.items.filter((i) => i.kind === 'hostload-precheck' && i.profile === profile);

test('control: a clear host and runs inside every budget pass after exactly the set run count (exit 0)', () => {
  const r = crew({ prechecks: [clear], runs: fine });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.mobile.pass, true);
  assert.equal(r.mobile.runs.length, RUNS);
  assert.equal(r.mobile.grew, null);
  assert.equal(r.mobile.blocked, null);
  assert.equal(r.manifest.items.filter((i) => i.blocked).length, 0);
  assert.equal(r.manifest.stub, true);
});

test('R5: a clean set with a median at or above nearBudgetPct of a maximum grows to nearBudgetRuns after a fresh precheck', () => {
  const tbt = Math.ceil((rules.nearBudgetPct / 100) * budget.mobile.tbt) + 1;
  assert.ok(tbt < budget.mobile.tbt, 'the planted TBT is near the budget, not past it');
  const r = crew({ prechecks: [clear], runs: { mobile: runs('mobile', [{ tbt }]), desktop: fine.desktop } });
  assert.equal(r.status, 0, r.out);
  assert.deepEqual([r.mobile.grew?.from, r.mobile.grew?.to], [RUNS, rules.nearBudgetRuns]);
  assert.equal(r.mobile.runs.length, rules.nearBudgetRuns);
  assert.equal(r.mobile.prechecks.length, 2, 'R5 takes a fresh precheck before it grows the set');
  assert.match(r.mobile.prechecks[1].tries[0].file, /-pre-r5\.json$/);
  assert.equal(r.desktop.grew, null);
});

test("R5: the growth's fresh precheck is real: a busy host then blocks the set (exit 75)", () => {
  const tbt = Math.ceil((rules.nearBudgetPct / 100) * budget.mobile.tbt) + 1;
  const r = crew({ prechecks: [clear, busy, clear], runs: { mobile: runs('mobile', [{ tbt }]), desktop: fine.desktop } }, ['--precheck-wait', '0']);
  assert.equal(r.status, 75, r.out);
  assert.match(r.mobile.blocked, /^R5 precheck busy/);
  assert.equal(r.mobile.pass, null);
  assert.equal(r.mobile.runs.length, RUNS);
  assert.equal(r.desktop.pass, true);
});

test('R1: a busy precheck waits; once it clears the set runs, and the busy tries are waits, not blocked items', () => {
  const r = crew({ prechecks: [busy, busy, clear], runs: fine });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.mobile.blocked, null);
  assert.equal(r.mobile.prechecks[0].tries.length, 3);
  assert.equal(r.mobile.runs.length, RUNS);
  const items = prechecksOf(r.manifest, 'mobile');
  assert.equal(items.filter((i) => i.waited).length, 2);
  assert.equal(items.filter((i) => i.blocked).length, 0);
  assert.equal(r.manifest.items.filter((i) => i.blocked).length, 0);
});

test('R1: a precheck that never clears within the wait blocks the set (blocked host, exit 75, no run taken)', () => {
  const r = crew({ prechecks: [busy], runs: fine }, ['--precheck-wait', '3']);
  assert.equal(r.status, 75, r.out);
  assert.match(r.mobile.blocked, /^precheck busy/);
  assert.equal(r.mobile.pass, null);
  assert.equal(r.mobile.runs.length, 0);
  assert.equal(r.mobile.prechecks[0].tries.length, 4, 'tries at 0, 1, 2 and 3 minutes of a 3-minute wait');
  assert.equal(prechecksOf(r.manifest, 'mobile').filter((i) => i.blocked === 'host').length, 1);
});

test('R3: a host-suspect run is replaced by an extra run and never enters the medians', () => {
  const tbts = [20, 140, 30, 40, 50, 60];
  const r = crew({ prechecks: [clear], runs: { mobile: runs('mobile', tbts.map((tbt, i) => (i === 1 ? { tbt, bench: SUSPECT, perf: 0.5 } : { tbt }))), desktop: fine.desktop } });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.mobile.runs.length, RUNS + 1);
  assert.deepEqual(r.mobile.replaced.map((x) => x.run), [2]);
  assert.deepEqual(r.mobile.clean, [1, 3, 4, 5, 6]);
  assert.equal(r.mobile.medians.tbt, median([20, 30, 40, 50, 60]));
  assert.equal(r.mobile.medians.performance, Math.min(1, budget.mobile.performance + 0.03));
  assert.equal(r.mobile.pass, true);
});

test('verdict: a median under the performance minimum fails the set (exit 1), after R5 grows it', () => {
  const r = crew({ prechecks: [clear], runs: { mobile: runs('mobile', [{ perf: budget.mobile.performance - 0.05 }]), desktop: fine.desktop } });
  assert.equal(r.status, 1, r.out);
  assert.equal(r.mobile.pass, false);
  assert.equal(r.mobile.runs.length, rules.nearBudgetRuns);
  assert.equal(r.desktop.pass, true);
});

// ---- round-3 should-fix S2 (Breaker 3.1 #1): every rule of the verdict and the report is pinned, so taking any one
// out of crew.mjs fails a test here (crew-lighthouse.mutants.mjs holds the 10 mutants; each must be caught).
const failsOn = (name, mobileRuns) => test(`verdict: ${name} fails the set (exit 1)`, () => {
  const r = crew({ prechecks: [clear], runs: { mobile: runs('mobile', mobileRuns), desktop: fine.desktop } });
  assert.equal(r.status, 1, r.out);
  assert.equal(r.mobile.pass, false);
  assert.equal(r.desktop.pass, true);
  assert.equal(r.manifest.items.find((i) => i.kind === 'lighthouse' && i.profile === 'mobile').pass, false);
});
failsOn('a median accessibility under a11yMin', [{ a11y: budget.mobile.accessibility - 0.05 }]);
failsOn('a median best practices under bestPracticesMin', [{ bp: budget.mobile.bestPractices - 0.05 }]);
failsOn('a median TBT past its maximum', [{ tbt: budget.mobile.tbt + 20 }]);
failsOn('a median LCP past its maximum', [{ lcp: budget.mobile.lcp + 200 }]);
failsOn("a median CLS above 0 (inside budgets.md's limit: #11 asks for CLS 0)", [{ cls: budget.mobile.cls / 2 }]);
failsOn('the GL chunk starting before first contentful paint (D-005)', [{ glStart: 300, fcp: 700 }]);
failsOn('an invalid run (a software renderer)', [{ renderer: 'SwiftShader (planted)' }]);

test('report: the summary and the manifest carry the worst run and the count past budget (R5)', () => {
  // Ten clean runs (one past the TBT maximum grows the set), the third the worst on TBT and the only one past budget.
  const tbts = [20, 30, budget.mobile.tbt + 40, 40, 50, 25, 35, 45, 55, 15];
  const r = crew({ prechecks: [clear], runs: { mobile: runs('mobile', tbts.map((tbt) => ({ tbt }))), desktop: fine.desktop } });
  assert.equal(r.status, 0, r.out);
  assert.equal(r.mobile.runs.length, rules.nearBudgetRuns);
  assert.deepEqual(r.mobile.worst.tbt, { run: 3, value: budget.mobile.tbt + 40 });
  assert.equal(r.mobile.pastBudget.count, 1);
  assert.deepEqual(r.mobile.pastBudget.runs.map((x) => x.run), [3]);
  assert.equal(typeof r.mobile.worstRun, 'number');
  const m = r.manifest.items.find((i) => i.kind === 'lighthouse' && i.profile === 'mobile').metrics;
  assert.deepEqual(m.worst.tbt, { run: 3, value: budget.mobile.tbt + 40 });
  assert.equal(m.pastBudgetCount, 1);
  assert.equal(m.worstRun, r.mobile.worstRun);
});

test('R3: more host-suspect runs than extraRunsPerSetMax block the set (exit 75), never pass it', () => {
  const max = rules.extraRunsPerSetMax;
  const list = [...Array.from({ length: max + 1 }, () => ({ bench: SUSPECT })), {}];
  const r = crew({ prechecks: [clear], runs: { mobile: runs('mobile', list), desktop: fine.desktop } });
  assert.equal(r.status, 75, r.out);
  assert.match(r.mobile.blocked, /R3/);
  assert.equal(r.mobile.pass, null);
  assert.equal(r.mobile.runs.length, max + 1);
});
