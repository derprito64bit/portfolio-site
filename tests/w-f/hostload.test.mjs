// Measurement validity R1, R2, R3 and R5 as crew.mjs lighthouse applies them (#67): GPU-free, `node --test`. Every
// number comes from the json budgets block (the host key and the Lighthouse budgets); the planted runs are the shapes
// the request and the round-1 review name. Negative control: HOSTLOAD_LIB=<a mutated copy of lib.mjs in
// tests/harness/> runs these tests against it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lib = await import(process.env.HOSTLOAD_LIB ? new URL(`../harness/${process.env.HOSTLOAD_LIB}`, import.meta.url).href : '../harness/lib.mjs');
const { hostSuspectReasons, readBudgets, setStep } = lib;

const host = readBudgets().host;
const base = host.benchmarkIndex.baseline;
const ratio = host.benchmarkIndex.suspectBelowRatio;
const clear = { exitCode: 0, json: { verdict: 'clear', reasons: [] } };
const flagged = { exitCode: 75, json: { verdict: 'flagged', reasons: ['foreign process blender (pid 10) at 40% > foreignCpuPctMax 10.1%'] } };
const incomplete = { exitCode: 75, json: { verdict: 'incomplete', reasons: ['head gap 7.2 s from the start of process 9 to the first valid sample > 5 s'] } };

test('the host key is calibrated (a baseline, a ratio and an extra-run limit)', () => {
  assert.equal(typeof base, 'number');
  assert.equal(typeof ratio, 'number');
  assert.equal(typeof host.rules.extraRunsPerSetMax, 'number');
});

test('a clean run: benchmarkIndex at the baseline and a clear watch', () => {
  assert.deepEqual(hostSuspectReasons({ benchmarkIndex: base, watch: clear }, host), []);
  assert.deepEqual(hostSuspectReasons({ benchmarkIndex: Math.ceil(ratio * base), watch: clear }, host), []);
});

test('planted: a benchmarkIndex under the ratio is host-suspect with the R2 reason', () => {
  const r = hostSuspectReasons({ benchmarkIndex: Math.floor(ratio * base) - 1, watch: clear }, host);
  assert.equal(r.length, 1);
  assert.match(r[0], /host-suspect \(R2\): benchmarkIndex \d+ < /);
});

test('planted: a -Watch file with a flagged process, or an incomplete one, is host-suspect', () => {
  assert.match(hostSuspectReasons({ benchmarkIndex: base, watch: flagged }, host)[0], /-Watch flagged \(exit 75\): foreign process blender/);
  assert.match(hostSuspectReasons({ benchmarkIndex: base, watch: incomplete }, host)[0], /-Watch incomplete/);
});

test('a run with no watch file, or no benchmarkIndex, is host-suspect (missing data never reads as quiet)', () => {
  assert.match(hostSuspectReasons({ benchmarkIndex: base, watch: null }, host)[0], /no hostload -Watch file/);
  assert.match(hostSuspectReasons({ benchmarkIndex: null, watch: clear }, host)[0], /no lhr\.environment\.benchmarkIndex/);
});

test('an uncalibrated host key (null baseline) cannot clear any run', () => {
  const uncal = { ...host, benchmarkIndex: { baseline: null, suspectBelowRatio: null } };
  assert.match(hostSuspectReasons({ benchmarkIndex: base, watch: clear }, uncal)[0], /no calibrated benchmarkIndex baseline/);
});

const runs = (pattern) => [...pattern].map((c) => ({ suspect: c === 's' ? ['host-suspect'] : [] }));
const extra = host.rules.extraRunsPerSetMax;

test('R3: clean runs reach the count; a suspect run is replaced, not counted', () => {
  assert.deepEqual(setStep(runs('ccccc'), 5, extra), { next: 'done', clean: 5, replaced: 0 });
  assert.deepEqual(setStep(runs('cscc'), 5, extra), { next: 'run', clean: 3, replaced: 1 });
  assert.deepEqual(setStep(runs('csccsc'), 5, extra).next, 'run');
  assert.deepEqual(setStep(runs('cscccsc'), 5, extra), { next: 'done', clean: 5, replaced: 2 });
});

test('planted: a set short of clean runs after the extra-run limit is blocked (host)', () => {
  const s = setStep(runs('s'.repeat(extra + 1)), 5, extra);
  assert.equal(s.next, 'blocked');
  assert.match(s.why, /blocked \(host\), R3/);
  // At the limit exactly, the set may still finish with clean runs.
  assert.equal(setStep(runs('s'.repeat(extra)), 5, extra).next, 'run');
});

test('R5 grows a set: the same rule with the near-budget run count', () => {
  assert.equal(setStep(runs('ccccc'), host.rules.nearBudgetRuns, extra).next, 'run');
  assert.equal(setStep(runs('c'.repeat(host.rules.nearBudgetRuns)), host.rules.nearBudgetRuns, extra).next, 'done');
});

// ---- R5 and R1 as written (round-1 review must-fix crew-mjs-r1-r5, items a to e)
const site = readBudgets().site;
const rules = host.rules;
const mobile = lib.lighthouseBudget(site, 'mobile');
/** A clean run comfortably inside every budget, with `over` fields replaced. */
const good = (run, over = {}) => ({ run, performance: 0.99, accessibility: 1, bestPractices: 1, lcp: 0.5 * mobile.lcp, tbt: 0.3 * mobile.tbt, cls: 0, fcp: 1000, ...over });
const five = (over = {}) => [1, 2, 3, 4, 5].map((n) => good(n, n === 3 ? over : {}));

test('the Lighthouse budget comes from the block: minimums for scores, maximums for LCP, TBT and CLS', () => {
  assert.equal(mobile.accessibility, site.lighthouse.a11yMin / 100);
  assert.equal(mobile.bestPractices, site.lighthouse.bestPracticesMin / 100);
  assert.equal(mobile.performance, site.lighthouse.perfMobileMin / 100);
  assert.equal(lib.lighthouseBudget(site, 'desktop').performance, site.lighthouse.perfDesktopMin / 100);
  assert.equal(mobile.lcp, site.lcpMs.mobile);
});

test('(a) planted: one clean run below a11yMin, or below bestPracticesMin, grows the set to nearBudgetRuns', () => {
  const a11y = lib.r5Grow(five({ accessibility: mobile.accessibility - 0.04 }), mobile, rules, 5);
  assert.equal(a11y.grow, true);
  assert.equal(a11y.to, rules.nearBudgetRuns);
  assert.match(a11y.why, /accessibility/);
  const bp = lib.r5Grow(five({ bestPractices: mobile.bestPractices - 0.03 }), mobile, rules, 5);
  assert.equal(bp.grow, true);
  assert.match(bp.why, /bestPractices/);
  assert.equal(lib.r5Grow(five({ performance: mobile.performance - 0.01 }), mobile, rules, 5).grow, true);
});
test('(a) planted: a clean run above a maximum, or a median near one, grows the set; a quiet set does not', () => {
  assert.equal(lib.r5Grow(five({ tbt: mobile.tbt + 54 }), mobile, rules, 5).grow, true);
  const nearTbt = [1, 2, 3, 4, 5].map((n) => good(n, { tbt: (rules.nearBudgetPct / 100) * mobile.tbt + 1 }));
  assert.match(lib.r5Grow(nearTbt, mobile, rules, 5).why, /median at or above/);
  assert.equal(lib.r5Grow(five(), mobile, rules, 5).grow, false);
  // A set already at nearBudgetRuns never grows again.
  assert.equal(lib.r5Grow(five({ accessibility: 0.9 }), mobile, rules, rules.nearBudgetRuns).grow, false);
});

test('(b) planted: the summary reports the worst run and the count past budget', () => {
  const ten = Array.from({ length: 10 }, (_, i) => good(i + 1, { performance: 0.9 + i / 100 }));
  ten[6] = { ...ten[6], tbt: mobile.tbt + 54 };
  ten[8] = { ...ten[8], accessibility: mobile.accessibility - 0.04, lcp: mobile.lcp + 10 };
  const s = lib.lighthouseSetSummary(ten, mobile);
  assert.equal(s.worstRun, 1); // the lowest performance score
  assert.deepEqual(s.worst.tbt, { run: 7, value: mobile.tbt + 54 });
  assert.deepEqual(s.worst.accessibility, { run: 9, value: mobile.accessibility - 0.04 });
  assert.deepEqual(s.worst.lcp, { run: 9, value: mobile.lcp + 10 });
  assert.equal(s.pastBudget.count, 2);
  assert.deepEqual(s.pastBudget.runs.map((r) => r.run), [7, 9]);
  assert.deepEqual([...s.pastBudget.runs[1].past].sort(), ['accessibility', 'lcp']);
});

test('(c) planted: the median of 10 is the median of all 10, not the better of the two middle runs', () => {
  const scores = [0.8, 0.82, 0.84, 0.86, 0.88, 0.9, 0.92, 0.94, 0.96, 0.98];
  const s = lib.lighthouseSetSummary(scores.map((p, i) => good(i + 1, { performance: p })), mobile);
  assert.ok(Math.abs(s.medians.performance - 0.89) < 1e-9, `median ${s.medians.performance}`);
  assert.equal(s.medianRun.performance, 0.88); // the lower of the two middle runs represents the set
  // Odd counts keep the middle run.
  const odd = lib.lighthouseSetSummary(scores.slice(0, 5).map((p, i) => good(i + 1, { performance: p })), mobile);
  assert.equal(odd.medians.performance, 0.84);
  assert.equal(odd.medianRun.performance, 0.84);
  // Every metric's median is over all runs (TBT of 10: the mean of the two middle values).
  const tbts = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(lib.lighthouseSetSummary(tbts.map((t, i) => good(i + 1, { tbt: t })), mobile).medians.tbt, 55);
});

const busy = { exitCode: 75, verdict: 'busy', file: 'hostload-x-pre.json' };
const clearTry = { exitCode: 0, verdict: 'clear', file: 'hostload-x-pre-retry2.json' };
test('(d) planted: a busy precheck try that a retry cleared is a wait, not a blocked (host) item', () => {
  const items = lib.precheckItems([{ tries: [busy, { ...busy, file: 'r1' }, clearTry] }]);
  assert.deepEqual(items.map((i) => [i.pass, i.blocked ?? null, i.waited ?? false]), [[null, null, true], [null, null, true], [true, null, false]]);
  assert.equal(items.filter((i) => i.blocked).length, 0);
});
test('(d) planted: a precheck that never cleared blocks the set on its last try; a broken tool blocks at once', () => {
  const items = lib.precheckItems([{ tries: [busy, { ...busy, file: 'r1' }] }, { tries: [{ exitCode: 2, verdict: null, file: 'p2' }] }]);
  assert.deepEqual(items.map((i) => i.blocked ?? null), [null, 'host', 'host']);
});

const md = readFileSync(new URL('../../docs/agents/budgets.md', import.meta.url), 'utf8');
test("(e) R1's wait defaults to the minutes R1 names (30), read from budgets.md, not to 0", () => {
  assert.match(md, /check again for up to 30 minutes/);
  assert.equal(lib.precheckWaitMin(undefined, host, md), 30);
  assert.equal(lib.precheckWaitMin(undefined, host, md.replace('up to 30 minutes', 'up to 20 minutes')), 20);
  assert.equal(lib.precheckWaitMin(undefined, { ...host, rules: { ...host.rules, precheckWaitMin: 12 } }, md), 12);
  assert.equal(lib.precheckWaitMin('0', host, md), 0); // an explicit --precheck-wait 0 still means no wait
  assert.throws(() => lib.precheckWaitMin(undefined, host, md.replace(/check again for up to 30 minutes/, 'check again later')), /names no wait/);
});

test('(e) planted: a busy precheck waits while a retry fits in the wait, then blocks; uncalibrated and a broken tool block at once', () => {
  const wait = 30 * 60000;
  assert.equal(lib.precheckNext({ exitCode: 0, verdict: 'clear' }, 0, wait), 'run');
  assert.equal(lib.precheckNext({ exitCode: 75, verdict: 'busy' }, 0, wait), 'wait');
  assert.equal(lib.precheckNext({ exitCode: 75, verdict: 'incomplete' }, 28 * 60000, wait), 'wait');
  assert.equal(lib.precheckNext({ exitCode: 75, verdict: 'busy' }, 29.5 * 60000, wait), 'blocked');
  assert.equal(lib.precheckNext({ exitCode: 75, verdict: 'busy' }, 0, 0), 'blocked'); // --precheck-wait 0
  assert.equal(lib.precheckNext({ exitCode: 75, verdict: 'uncalibrated' }, 0, wait), 'blocked');
  assert.equal(lib.precheckNext({ exitCode: 2, verdict: null }, 0, wait), 'blocked');
});

test('(a)-(e) wiring: crew.mjs lighthouse uses these rules, and run.mjs passes no wait of its own', () => {
  const crew = readFileSync(new URL('../../scripts/crew.mjs', import.meta.url), 'utf8');
  for (const fn of ['lighthouseBudget(', 'r5Grow(', 'lighthouseSetSummary(', 'precheckItems(', 'precheckNext(', "precheckWaitMin(o['precheck-wait']"]) assert.ok(crew.includes(`lib.${fn}`), `crew.mjs calls lib.${fn}`);
  assert.doesNotMatch(crew, /precheck-wait'\]\) \|\| 0/);
  assert.doesNotMatch(crew, /sorted\[Math\.floor\(sorted\.length \/ 2\)\]/);
  const run = readFileSync(new URL('./run.mjs', import.meta.url), 'utf8');
  const lhStep = run.split('\n').find((l) => l.includes("['lighthouse'"));
  assert.ok(lhStep && !/precheck-wait/.test(lhStep), "run.mjs's lighthouse step takes R1's default wait");
});
