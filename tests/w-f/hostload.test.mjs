// Measurement validity R2 and R3 as crew.mjs lighthouse applies them (#67): GPU-free, `node --test`. Every number
// comes from the json budgets block's host key; the planted runs are the shapes the request names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostSuspectReasons, readBudgets, setStep } from '../harness/lib.mjs';

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
