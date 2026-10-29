#!/usr/bin/env node
// Pre-launch check for a crew-loop file (PLAN.md tooling item: "Update crew-loop.check.js to match"). It replaces
// portfolio-evidence/loop-audit/crew-loop.check.js for the lean loop; its scenarios cover the lean rules only.
// Usage:
//   node scripts/fleet/loop/crew-loop.check.cjs <launched.js> [--template <crew-loop.js>] [--offline] [--allow-unmerged]
//   node scripts/fleet/loop/crew-loop.check.cjs --self-test [--offline]   (the template and crew-config.json alone; CI runs this)
// It checks, and prints LAUNCH READY only when all of it holds:
//   1. structure: the file is the reviewed template plus one EMBEDDED_ARGS line, and that template is origin/main's;
//   2. config and spec: the embedded config and spec pass the template's own validation (a stubbed run);
//   3. quotes, word for word: the owner's ruling against its #91 comment, PLAN.md's taxonomy lines against PLAN.md
//      (origin/main's), every spec quote written "<text>" [c<comment id>] against that comment, and the spec against
//      the Orchestrator comment it was posted as; a planted one-character change must fail each comparison;
//   4. scenarios: the lean rules on a stubbed loop, each with a NEGATIVE CONTROL: the same scenario run on a copy of the
//      template with that one rule disabled (a mutant) must fail; continuations rebuilt by prior-from-journal resume
//      at the right step, and a replay reproduces the live return;
//   5. prompts: every role prompt carries the 270 s wait rule, no blocking watch, -R on every gh command, sizes reported.
// --offline skips the GitHub comparisons (and so never prints LAUNCH READY).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TEMPLATE, CONFIG, mergeCrew, continuation, split, load, parallel, words } = require('./loop-lib.cjs');
const { replay } = require('./prior-from-journal.cjs');

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  else pos.push(argv[i]);
}
const SELF = !!flags['self-test'];
if (!SELF && !pos[0]) {
  console.error('usage: crew-loop.check.cjs <launched.js> [--template <crew-loop.js>] [--offline] [--allow-unmerged] | --self-test [--offline]');
  process.exit(2);
}
const REPO_ROOT = path.resolve(__dirname, '../../..');
const TPL_PATH = flags.template && flags.template !== true ? flags.template : TEMPLATE;
const TPL = fs.readFileSync(TPL_PATH, 'utf8');
const problems = [];
const notes = [];
const ok = [];
const gitShow = (p) => { try { return execFileSync('git', ['-C', REPO_ROOT, 'show', `origin/main:${p}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const ghJson = (p) => JSON.parse(execFileSync('gh', ['api', p], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));

// ---- 1. structure ------------------------------------------------------------------------------------------------
let EMB = null;
if (!SELF) {
  const src = fs.readFileSync(pos[0], 'utf8');
  const { base, embedded } = split(src);
  if (!embedded) problems.push('no EMBEDDED_ARGS line: launch the file launch.cjs or prior-from-journal.cjs wrote');
  if (base !== TPL) problems.push(`the template part differs from the reviewed template ${TPL_PATH}`);
  else ok.push('the template part is the reviewed template, byte for byte');
  EMB = embedded;
}
const onMain = gitShow('scripts/fleet/loop/crew-loop.js');
if (onMain === TPL) ok.push("the reviewed template is origin/main's scripts/fleet/loop/crew-loop.js");
else if (flags['allow-unmerged'] || SELF) notes.push("the reviewed template is not origin/main's copy yet (allowed: --allow-unmerged or --self-test)");
else problems.push("the reviewed template differs from origin/main's scripts/fleet/loop/crew-loop.js: merge the template change first");

// ---- fixtures for the scenarios ----------------------------------------------------------------------------------
const CONFIG_JSON = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const FIXED = JSON.parse((/^const FIXED = (\[[^\]]*\])/m.exec(TPL) || [])[1].replace(/'/g, '"'));
const JROWS = [{ id: 'J1', row: 'the stagger reads as one gesture', target: 7 }, { id: 'J2', row: 'the develop lands', target: 7 }];
const fixtureConfig = () => {
  const c = JSON.parse(JSON.stringify(CONFIG_JSON));
  c.crews.wx = {
    id: 'W-X', issue: 99, branch: 'crew/w-x', title: 'a fixture slice', slice: true, codePaths: ['src/x/**'],
    jury: { enabled: true, rows: JROWS },
    perf: { sets: [{ id: 'S1', row: 'mobile TBT', cmd: ['node', 'a.mjs'], paths: ['src/**'] }, { id: 'S2', row: 'GPU ratio', cmd: ['node', 'b.mjs'], paths: ['public/**'] }] },
    gate: { visitorPaths: 'the fixture paths', frames: 'the fixture probes', floors: '' },
  };
  return mergeCrew(c, 'wx');
};
const CFG = fixtureConfig();
const SPEC = { version: 'v1', sha256: 'f'.repeat(64), postedAt: '2026-10-27T00:00:00Z', commentUrl: 'https://github.com/derprito64bit/portfolio-site/issues/99#issuecomment-1', path: 'fixture.md', text: 'Fixture spec: row A1, the sheet develops.' };
const HEAD = (r) => `c0${String(r).padStart(5, '0')}def5678`;
const row = (item, status, blockedBy) => ({ item, status: status || 'pass', blockedBy: blockedBy || 'none', evidence: 'e', negative: 'n' });
const headIn = (p) => (/at the head ([0-9a-f]{7,})/.exec(p) || /approval candidate ([0-9a-f]{7,})/.exec(p) || [])[1] || 'none';
// The set ids in a perf prompt's plan.json (step 2 of its STEPS).
const setsIn = (p) => { const i = p.indexOf('plan.json: '); const j = p.indexOf('\n3. ', i); return i < 0 ? [] : [...p.slice(i, j < 0 ? undefined : j).matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]); };
const mf = (key, cls, extra) => Object.assign({ key, cls: cls || 'acceptance', text: `${key} fails`, citation: 'row A1', repro: 'src/x/a.ts:1', mainControl: '', oneTask: false }, extra || {});
const review = (verdict, items, extra) => Object.assign({ verdict, mustFixKind: items && items.length ? 'code' : 'none', mustFix: items || [], queued: [], breakerDispositions: [], needsRuling: [], specSeen: 'v1', notes: '', commentUrl: 'https://x/review' }, extra || {});
const ask = { line: 'A1', question: 'which band?', recommended: 'the token', evidence: 'e' };
const DEF = {
  crew: (r) => ({ branch: 'crew/w-x', sha: HEAD(r), prUrl: 'https://github.com/derprito64bit/portfolio-site/pull/999', pushed: true, specSeen: 'v1', changedFiles: ['src/x/a.ts'], acceptance: [row('A1')], needsRuling: [], knownIssues: [], handoff: false, handoffNote: '', summary: 's' }),
  gate: (r, l, p) => ({ pass: true, sha: headIn(p), mainSha: 'm000000', distHash: 'h', specSeen: 'v1', fixed: Object.fromEntries(FIXED.map((k) => [k, row(k)])), rows: [row('A1')], regressions: [], preExisting: [], failures: [], needsRuling: [], commentUrl: 'u' }),
  break: (r, l, p) => ({ sha: headIn(p), defects: [], triedClean: [], commentUrl: 'u' }),
  jury: (r, l, p) => ({ sha: headIn(p), rows: JROWS.map((x) => ({ id: x.id, score: x.target, target: x.target, evidence: 'e', fix: '' })), notes: '', commentUrl: 'u' }),
  judge: () => review('approve'),
  perf: (r, l, p) => ({ sha: headIn(p), state: 'done', rows: setsIn(p).map((id) => ({ id, status: 'pass', value: '100 ms', budget: '200 ms', evidence: 'e' })), notes: '', commentUrl: 'u' }),
  invest: () => ({ sha: 's', mainSha: 'm', rows: [], notes: '' }),
};
const typeOf = (l) => (/:gate#/.test(l) ? 'gate' : /:break#/.test(l) ? 'break' : /:jury#/.test(l) ? 'jury' : /:judge#/.test(l) ? 'judge' : /:perf#/.test(l) ? 'perf' : /:invest#/.test(l) ? 'invest' : 'crew');
const roundOf = (l) => Number((/#(\d+)/.exec(l) || [])[1]);

// Runs one scenario on a template text; records every call, prompt, result and log line.
async function run(tpl, sc, prior) {
  const calls = [];
  const prompts = {};
  const results = [];
  const logs = [];
  const script = continuation(tpl, Object.assign({ crew: 'wx', cfg: sc.cfg || CFG, spec: sc.spec || SPEC }, prior ? { prior } : {}, sc.grant ? { grant: sc.grant } : {}));
  const agent = async (prompt, o) => {
    calls.push(o.label);
    prompts[o.label] = prompt;
    const t = typeOf(o.label);
    const f = sc[t];
    let v = f ? f(roundOf(o.label), o.label, prompt) : undefined;
    if (v === undefined) v = DEF[t](roundOf(o.label), o.label, prompt);
    results.push([o.label, v]);
    return v;
  };
  let res = null;
  let err = null;
  try {
    res = await load(script)(agent, parallel, null, (m) => logs.push(m), () => {}, undefined, {}, null);
  } catch (e) {
    err = e.message;
  }
  return { res, err, calls, prompts, results, logs, script };
}
// A journal of a run, as the Workflow tool writes it (a null result is never recorded).
const journalOf = (x) => x.results.flatMap(([label, v], i) => [JSON.stringify({ type: 'started', key: `k${i}`, label }), ...(v ? [JSON.stringify({ type: 'result', key: `k${i}`, result: v })] : [])]).join('\n');
// Run 1, then the continuation prior-from-journal builds from run 1's journal.
async function runAndContinue(tpl, sc1, sc2) {
  const a = await run(tpl, sc1);
  if (!a.res) return { a, b: null, replayed: null };
  const rp = await replay(a.script, journalOf(a));
  const b = await run(tpl, sc2 || {}, rp.res);
  return { a, b, replayed: rp.res };
}

const has = (cond, msg) => (cond ? [] : [msg]);
const histOf = (x) => (x.res && x.res.hist) || [];
const called = (x, l) => x.calls.includes(l);

// ---- the scenarios, each with the mutants that must make it fail ------------------------------------------------
const MUT = {
  perfScope: ['const sets = (c.perf.sets || []).filter(s => !s.paths || hits(s.paths, files)) /*R:perfScope*/', 'const sets = (c.perf.sets || []) /*R:perfScope*/'],
  gatePassed: ["[!gatePassed(gate), 'the gate did not pass'],", "[false, 'the gate did not pass'],"],
  verdict: ["[review.verdict !== 'approve' && !(review.mustFix || []).length,", '[false && !(review.mustFix || []).length,'],
  cap: ['if (!resume && count(kind) >= cap[kind])', 'if (false && !resume && count(kind) >= cap[kind])'],
  stopEarly: ['if (n > 0 && last.length === n + 1 && last.every((x, i) => i === 0 || x >= last[i - 1]))', 'if (false)'],
  regressionControl: ["(trim(m.mainControl) ? '' : 'a regression with no main-SHA control')", "''"],
  rareEdge: ["(m.oneTask === true ? '' : 'a rare-edge item whose fix is more than one crew task')", "''"],
  budgetFromPerf: [": m.addedBy === 'perf' ? '' : 'a budget item not raised by a reproduced timed fail' /*R:budgetFromPerf*/", ": '' /*R:budgetFromPerf*/"],
  jury: ["items.push({ key, cls: 'design', text: r ?", "void ({ key, cls: 'design', text: r ?"],
  breakerRegression: ['if (proven(d)) { if (!items.some(m => m.key === key))', 'if (false) { if (!items.some(m => m.key === key))'],
  busyHostGate: ['if (hostOnly) {', 'if (false) {'],
  busyHostPerf: ["if (perf.state === 'blocked' || blockedRows.length) {", 'if (false) {'],
  perfValid: ['if (invalid) {', 'if (false) {'],
  investInconclusive: ['if (open.length) {', 'if (false) {'],
  dispositionMustFix: ["else if (citation) items.push({ key, cls: 'acceptance',", "else if (citation) void ({ key, cls: 'acceptance',"],
  gateFails: ["if (!items.some(m => m.key === key)) items.push({ key, cls: 'acceptance', text: `the gate fails:", "if (!items.some(m => m.key === key)) void ({ key, cls: 'acceptance', text: `the gate fails:"],
  shaOk: ["[!shaOk, 'a stage SHA differs from the crew head'],", "[false, 'a stage SHA differs from the crew head'],"],
  asksBlocker: ['[asks.length, `${asks.length} ruling(s) open`],', '[0, `${asks.length} ruling(s) open`],'],
  hostOnly: ["notPassing(gateRows).every(r => r.status === 'blocked' && r.blockedBy === 'host')", 'true'],
  flakeQueue: ["for (const r of perf.rows.filter(x => x.status === 'flake')) t.queued.push(", 'for (const r of []) t.queued.push('],
  verifyResume: ["'verify', { gate, breaks, breakDone, jury, tries })", "'verify', { gate, tries })"],
  judgeResume: ["return died('judge-died', 'judge', { gate, breaks, breakDone: true, jury, tries })", "return died('judge-died', 'crew', {})"],
  perfPreExisting: ["if (v && v.verdict === 'pre-existing')", 'if (false)'],
  handoff: ['for (let h = 1; work && work.handoff && h <= c.handoff.max; h++) {', 'for (let h = 1; false; h++) {'],
  ruling: ['if (asks.length && (!t.items.some(isCode) || asks.some(a => prevAsks.includes(a.line))))', 'if (false)'],
  breakerPasses: ['const passes = Math.min(c.breaker.maxPasses, c.breaker.passes + (hits(c.breaker.extraPassGlobs, files) ? 1 : 0))', 'const passes = c.breaker.passes'],
  specLimit: ['if (spec.text.length > c.limits.specChars) throw', 'if (false) throw'],
  seal: ['if (o.check !== seal(o)) throw', 'if (false) throw'],
  regressed: ['if (back) {', 'if (false) {'],
  evidenceKind: ["const nextKind = t.items.some(isCode) || !t.items.length ? 'code' : 'evidence'", "const nextKind = 'code'"],
  perfRegression: ['else t.items.push({ key: `budget-', 'else void ({ key: `budget-'],
};
const capCode = CFG.caps.code;
const SCENARIOS = [
  {
    name: 'approval: one round, the perf queue runs once at the candidate, only the sets the diff reaches',
    mut: ['perfScope'],
    go: (tpl) => run(tpl, {}),
    expect: (x) => [...has(x.res && x.res.status === 'approved' && x.res.round === 1, `status ${x.res && x.res.status} round ${x.res && x.res.round}`), ...has(x.calls.filter((l) => typeOf(l) === 'perf').length === 1, 'perf ran once'), ...has(setsIn(x.prompts['W-X:perf#1'] || '').join() === 'S1', `perf sets ${setsIn(x.prompts['W-X:perf#1'] || '')}`)],
  },
  {
    name: 'a gate that reports pass false blocks, even with every row passing and the judge approving',
    mut: ['gatePassed'],
    go: (tpl) => run(tpl, { gate: (r, l, p) => (r === 1 ? Object.assign(DEF.gate(r, l, p), { pass: false }) : undefined) }),
    expect: (x) => [...has(x.res && x.res.status === 'approved' && x.res.round === 2, `status ${x.res && x.res.status} round ${x.res && x.res.round}`), ...has(!called(x, 'W-X:perf#1'), 'perf ran on a failing gate')],
  },
  {
    name: 'a failing gate row is a must-fix of its own, even when the judge names none',
    mut: ['gateFails'],
    go: (tpl) => run(tpl, { gate: (r, l, p) => (r === 1 ? Object.assign(DEF.gate(r, l, p), { pass: false, rows: [row('A1 sheet columns', 'fail')], failures: ['A1 fails'] }) : undefined) }),
    expect: (x) => [...has((histOf(x)[0] || { mustFix: [] }).mustFix.some((m) => /^gate-a1-sheet-columns\|acceptance$/.test(m)), `round 1 must-fix ${(histOf(x)[0] || {}).mustFix}`), ...has(x.res && x.res.status === 'approved' && x.res.round === 2, `status ${x.res && x.res.status}`)],
  },
  {
    name: 'a stage that tested another commit blocks approval',
    mut: ['shaOk'],
    go: (tpl) => run(tpl, { break: (r, l, p) => (r === 1 ? Object.assign(DEF.break(r, l, p), { sha: 'deadbee0000000' }) : undefined) }),
    expect: (x) => has(x.res && x.res.status === 'approved' && x.res.round === 2, `status ${x.res && x.res.status} round ${x.res && x.res.round}`),
  },
  {
    name: 'an open ruling blocks approval even when the judge approves',
    mut: ['asksBlocker'],
    go: (tpl) => run(tpl, { judge: () => review('approve', [], { needsRuling: [ask] }) }),
    expect: (x) => has(x.res && x.res.status === 'needs-ruling', `status ${x.res && x.res.status}`),
  },
  {
    name: 'a gate with a failing row and a host-blocked row is judged, not sent back as host-blocked',
    mut: ['hostOnly'],
    go: (tpl) => run(tpl, { gate: (r, l, p) => (r === 1 ? Object.assign(DEF.gate(r, l, p), { pass: false, rows: [row('A1', 'fail')], failures: ['A1 fails'], fixed: Object.assign(DEF.gate(r, l, p).fixed, { lighthouse: row('lighthouse', 'blocked', 'host') }) }) : undefined) }),
    expect: (x) => has(x.res && x.res.status === 'approved' && called(x, 'W-X:judge#1'), `status ${x.res && x.res.status}; judge 1 ${called(x, 'W-X:judge#1')}`),
  },
  {
    name: 'a single-set perf flake goes to the queue and does not block',
    mut: ['flakeQueue'],
    go: (tpl) => run(tpl, { perf: (r, l, p) => Object.assign(DEF.perf(r, l, p), { rows: [{ id: 'S1', status: 'flake', value: '210 ms', budget: '200 ms', evidence: 'e' }] }) }),
    expect: (x) => [...has(x.res && x.res.status === 'approved' && x.res.round === 1, `status ${x.res && x.res.status}`), ...has(((x.res && x.res.queued) || []).some((q) => q.key === 'perf-flake-s1'), 'the flake was not queued')],
  },
  {
    name: 'a perf result for another commit, or missing a planned set, is perf-invalid, never an approval',
    mut: ['perfValid'],
    go: async (tpl) => ({ a: await run(tpl, { perf: (r, l, p) => Object.assign(DEF.perf(r, l, p), { sha: 'deadbee0000000' }) }), b: await run(tpl, { perf: (r, l, p) => Object.assign(DEF.perf(r, l, p), { rows: [] }) }) }),
    expect: ({ a, b }) => [...has(a.res && a.res.status === 'perf-invalid' && a.res.resume === 'perf', `stale sha: status ${a.res && a.res.status}`), ...has(b.res && b.res.status === 'perf-invalid', `no rows: status ${b.res && b.res.status}`)],
  },
  {
    name: 'an inconclusive main control is blocked, rerun: the continuation reruns only the investigator',
    mut: ['investInconclusive'],
    go: (tpl) => runAndContinue(tpl, { perf: (r, l, p) => Object.assign(DEF.perf(r, l, p), { rows: [{ id: 'S1', status: 'fail', value: '260 ms', budget: '200 ms', evidence: 'e' }] }), invest: () => ({ sha: 's', mainSha: 'm', rows: [{ id: 'S1', verdict: 'inconclusive', head: '260', main: '', evidence: 'main blocked' }], notes: '' }) }, { invest: () => ({ sha: 's', mainSha: 'm', rows: [{ id: 'S1', verdict: 'pre-existing', head: '260', main: '255', evidence: 'e' }], notes: '' }) }),
    expect: ({ a, b }) => [...has(a.res && a.res.status === 'host-blocked' && a.res.resume === 'perf', `run 1 status ${a.res && a.res.status}`), ...has(b && b.res && b.res.status === 'approved' && b.calls.join() === 'W-X:invest#1p1', `continuation calls ${b && b.calls}`)],
  },
  {
    name: 'a breaker defect the judge disposes must-fix, but leaves out of mustFix, still blocks',
    mut: ['dispositionMustFix'],
    go: (tpl) => run(tpl, { break: (r, l, p) => (r === 1 ? Object.assign(DEF.break(r, l, p), { defects: [{ title: 'Swell clips at 200%', cls: 'layout', refutes: 'L5', steps: 's', expected: 'L5', observed: 'o', evidence: 'e', visitorPath: false, mainResult: 'not-run', mainControl: 'n/a' }] }) : undefined), judge: (r) => (r === 1 ? review('approve', [], { breakerDispositions: [{ title: 'swell clips at 200% ', disposition: 'must-fix', reason: 'r' }] }) : undefined) }),
    expect: (x) => [...has(x.res && x.res.status === 'approved' && x.res.round === 2, `status ${x.res && x.res.status} round ${x.res && x.res.round}`), ...has((histOf(x)[0] || { mustFix: [] }).mustFix.includes('break-swell-clips-at-200|acceptance'), `round 1 must-fix ${(histOf(x)[0] || {}).mustFix}`)],
  },
  {
    name: 'a judge that dies resumes at the judge: the continuation reruns only the judge (and the perf queue)',
    mut: ['judgeResume'],
    go: (tpl) => runAndContinue(tpl, { judge: () => null }, {}),
    expect: ({ a, b }) => [...has(a.res && a.res.status === 'judge-died' && a.res.resume === 'judge', `run 1 status ${a.res && a.res.status}`), ...has(b && b.res && b.res.status === 'approved' && b.calls.join() === 'W-X:judge#1,W-X:perf#1', `continuation calls ${b && b.calls}`)],
  },
  {
    name: 'a changes verdict with no must-fix item blocks',
    mut: ['verdict'],
    go: (tpl) => run(tpl, { judge: (r) => (r === 1 ? review('changes') : undefined) }),
    expect: (x) => has(x.res && x.res.status === 'approved' && x.res.round === 2, `status ${x.res && x.res.status} round ${x.res && x.res.round}`),
  },
  {
    name: `the code cap (${capCode}) ends the run; no round past it starts`,
    mut: ['cap'],
    go: (tpl) => run(tpl, { judge: (r) => review('changes', Array.from({ length: Math.max(1, capCode + 1 - r) }, (_, i) => mf(`k${i}`))) }),
    expect: (x) => [...has(x.res && x.res.status === 'cap' && histOf(x).length === capCode, `status ${x.res && x.res.status}, ${histOf(x).length} rounds`), ...has(!called(x, `W-X#${capCode + 1}`), `round ${capCode + 1} started`)],
  },
  {
    name: 'stop early: the must-fix count has not fallen for stopEarly.flatRounds rounds',
    mut: ['stopEarly'],
    go: (tpl) => run(tpl, { cfg: Object.assign({}, CFG, { caps: { code: 6, evidence: 1 } }), judge: () => review('changes', [mf('k1'), mf('k2')]) }),
    expect: (x) => [...has(x.res && x.res.status === 'stalled' && histOf(x).length === CFG.stopEarly.flatRounds + 1, `status ${x.res && x.res.status}, ${histOf(x).length} rounds`)],
  },
  {
    name: 'evidence-only must-fix gives an evidence round; the evidence cap ends the run',
    mut: ['evidenceKind'],
    go: (tpl) => run(tpl, { judge: () => Object.assign(review('changes', [mf('ev1')]), { mustFixKind: 'evidence-only' }) }),
    expect: (x) => [...has(/EVIDENCE-ONLY/.test(x.prompts['W-X#2'] || ''), 'round 2 is not evidence-only'), ...has(x.res && x.res.status === 'cap' && x.res.nextKind === 'evidence' && histOf(x).map((h) => h.kind).join() === 'code,evidence', `status ${x.res && x.res.status} kinds ${histOf(x).map((h) => h.kind)}`)],
  },
  {
    name: 'taxonomy: a regression with no main-SHA control goes to the queue, not the must-fix list',
    mut: ['regressionControl'],
    go: (tpl) => run(tpl, { judge: () => review('changes', [mf('reg1', 'regression')]) }),
    expect: (x) => [...has(x.res && x.res.status === 'approved' && x.res.round === 1, `status ${x.res && x.res.status} round ${x.res && x.res.round}`), ...has(((x.res && x.res.queued) || []).some((q) => q.key === 'reg1'), 'reg1 not queued')],
  },
  {
    name: 'taxonomy: a rare-edge item whose fix is more than one crew task goes to the queue',
    mut: ['rareEdge'],
    go: (tpl) => run(tpl, { judge: () => review('changes', [mf('edge1', 'rare-edge')]) }),
    expect: (x) => has(x.res && x.res.status === 'approved' && x.res.round === 1, `status ${x.res && x.res.status} round ${x.res && x.res.round}`),
  },
  {
    name: 'taxonomy: a budget item the judge raises (not a reproduced timed fail) goes to the queue',
    mut: ['budgetFromPerf'],
    go: (tpl) => run(tpl, { judge: () => review('changes', [mf('tbt', 'budget')]) }),
    expect: (x) => has(x.res && x.res.status === 'approved' && x.res.round === 1, `status ${x.res && x.res.status} round ${x.res && x.res.round}`),
  },
  {
    name: 'a jury row below target is a design must-fix, even when the judge approves',
    mut: ['jury'],
    go: (tpl) => run(tpl, { jury: (r, l, p) => (r === 1 ? Object.assign(DEF.jury(r, l, p), { rows: [{ id: 'J1', score: 5, target: 7, evidence: 'e', fix: 'f' }, { id: 'J2', score: 7, target: 7, evidence: 'e', fix: '' }] }) : undefined) }),
    expect: (x) => [...has(x.res && x.res.status === 'approved' && x.res.round === 2, `status ${x.res && x.res.status} round ${x.res && x.res.round}`), ...has((histOf(x)[0] || { mustFix: [] }).mustFix.includes('design-j1|design'), `round 1 must-fix ${(histOf(x)[0] || {}).mustFix}`)],
  },
  {
    name: 'an undisposed breaker regression on a visitor path (main passes) blocks',
    mut: ['breakerRegression'],
    go: (tpl) => run(tpl, { break: (r, l, p) => (r === 1 ? Object.assign(DEF.break(r, l, p), { defects: [{ title: 'Back lands at y 0', cls: 'nav', refutes: 'A1', steps: 's', expected: 'A1', observed: 'o', evidence: 'e', visitorPath: true, mainResult: 'main-passes', mainControl: 'main holds the scroll: e2' }] }) : undefined) }),
    expect: (x) => has(x.res && x.res.status === 'approved' && x.res.round === 2, `status ${x.res && x.res.status} round ${x.res && x.res.round}`),
  },
  {
    name: 'a busy host at the gate: blocked, rerun; the continuation reruns the gate alone',
    mut: ['busyHostGate'],
    go: (tpl) => runAndContinue(tpl, { gate: (r, l, p) => Object.assign(DEF.gate(r, l, p), { pass: false, fixed: Object.assign(DEF.gate(r, l, p).fixed, { lighthouse: row('lighthouse', 'blocked', 'host') }) }) }, {}),
    expect: ({ a, b }) => [...has(a.res && a.res.status === 'host-blocked' && a.res.resume === 'verify', `run 1 status ${a.res && a.res.status}`), ...has(!called(a, 'W-X:judge#1'), 'the judge ran on a blocked gate'), ...has(b && b.res && b.res.status === 'approved' && b.calls.join() === 'W-X:gate#1g1,W-X:judge#1,W-X:perf#1', `continuation calls ${b && b.calls}`)],
  },
  {
    name: 'a busy host at the perf queue: blocked, rerun; the continuation reruns the queue alone',
    mut: ['busyHostPerf'],
    go: (tpl) => runAndContinue(tpl, { perf: (r, l, p) => Object.assign(DEF.perf(r, l, p), { state: 'blocked', rows: [{ id: 'S1', status: 'blocked', value: '', budget: '', evidence: 'e' }] }) }, {}),
    expect: ({ a, b }) => [...has(a.res && a.res.status === 'host-blocked' && a.res.resume === 'perf', `run 1 status ${a.res && a.res.status}`), ...has(b && b.res && b.res.status === 'approved' && b.calls.join() === 'W-X:perf#1p1', `continuation calls ${b && b.calls}`)],
  },
  {
    name: 'a reproduced perf fail that main shares is pre-existing: queued, approved',
    mut: ['perfPreExisting'],
    go: (tpl) => run(tpl, { perf: (r, l, p) => Object.assign(DEF.perf(r, l, p), { rows: [{ id: 'S1', status: 'fail', value: '260 ms', budget: '200 ms', evidence: 'e' }] }), invest: () => ({ sha: 's', mainSha: 'm', rows: [{ id: 'S1', verdict: 'pre-existing', head: '260', main: '255', evidence: 'e' }], notes: '' }) }),
    expect: (x) => [...has(x.res && x.res.status === 'approved' && x.res.round === 1, `status ${x.res && x.res.status} round ${x.res && x.res.round}`), ...has(((x.res && x.res.queued) || []).some((q) => q.key === 'perf-main-s1'), 'S1 not queued')],
  },
  {
    name: 'a reproduced perf regression is a budget must-fix; the next head is measured again',
    mut: ['perfRegression'],
    go: (tpl) => run(tpl, { perf: (r, l, p) => (r === 1 ? Object.assign(DEF.perf(r, l, p), { rows: [{ id: 'S1', status: 'fail', value: '260 ms', budget: '200 ms', evidence: 'e' }] }) : undefined), invest: () => ({ sha: 's', mainSha: 'm', rows: [{ id: 'S1', verdict: 'regression', head: '260', main: '150', evidence: 'e' }], notes: '' }) }),
    expect: (x) => [...has(x.res && x.res.status === 'approved' && x.res.round === 2, `status ${x.res && x.res.status} round ${x.res && x.res.round}`), ...has((histOf(x)[0] || { mustFix: [] }).mustFix.includes('budget-s1|budget'), `round 1 must-fix ${(histOf(x)[0] || {}).mustFix}`), ...has(called(x, 'W-X:perf#2'), 'round 2 was not measured')],
  },
  {
    name: 'a crew past its context limit hands off to a fresh crew agent in the same round',
    mut: ['handoff'],
    go: (tpl) => run(tpl, { crew: (r, l) => (l === 'W-X#1' ? Object.assign(DEF.crew(r), { handoff: true, handoffNote: 'done: A; left: B' }) : undefined) }),
    expect: (x) => [...has(called(x, 'W-X#1h1') && /HAND-OFF FROM THE PREVIOUS CREW AGENT/.test(x.prompts['W-X#1h1'] || ''), 'no hand-off agent'), ...has(x.res && x.res.status === 'approved' && x.res.round === 1, `status ${x.res && x.res.status}`)],
  },
  {
    name: 'an open ruling with no code must-fix ends the run as needs-ruling',
    mut: ['ruling'],
    go: (tpl) => run(tpl, { judge: () => review('changes', [], { needsRuling: [ask] }) }),
    expect: (x) => has(x.res && x.res.status === 'needs-ruling' && histOf(x).length === 1, `status ${x.res && x.res.status}, ${histOf(x).length} rounds`),
  },
  {
    name: 'a diff that touches the GL or navigation paths gets a second breaker pass',
    mut: ['breakerPasses'],
    go: (tpl) => run(tpl, { crew: (r) => Object.assign(DEF.crew(r), { changedFiles: ['src/evf/gl/engine.ts'] }) }),
    expect: (x) => has(called(x, 'W-X:break#1.1') && called(x, 'W-X:break#1.2'), `breaker calls ${x.calls.filter((l) => /break/.test(l))}`),
  },
  {
    name: 'a spec over limits.specChars is refused',
    mut: ['specLimit'],
    go: (tpl) => run(tpl, { spec: Object.assign({}, SPEC, { text: 'x'.repeat(CFG.limits.specChars + 1) }) }),
    expect: (x) => has(/over limits\.specChars/.test(x.err || ''), `err ${x.err}`),
  },
  {
    name: 'a tampered prior is refused (its seal)',
    mut: ['seal'],
    go: async (tpl) => {
      const a = await run(tpl, { judge: () => review('changes', [mf('k1')]), crew: (r) => (r === 2 ? null : undefined) });
      const prior = JSON.parse(JSON.stringify(a.res));
      if (prior.hist && prior.hist[0]) prior.hist[0].mustFixCount = 0;
      return run(tpl, {}, prior);
    },
    expect: (x) => has(/does not match its seal/.test(x.err || ''), `err ${x.err}`),
  },
  {
    name: "a crew head that returns to an earlier round's commit escalates",
    mut: ['regressed'],
    go: (tpl) => run(tpl, { cfg: Object.assign({}, CFG, { caps: { code: 6, evidence: 1 }, stopEarly: { flatRounds: 0 } }), crew: (r) => (r === 3 ? Object.assign(DEF.crew(r), { sha: HEAD(1) }) : undefined), judge: (r) => review('changes', [mf(`k${r}`)]) }),
    expect: (x) => has(x.res && x.res.status === 'escalate' && histOf(x).length === 2, `status ${x.res && x.res.status}, ${histOf(x).length} rounds`),
  },
  {
    name: 'a gate that dies resumes at verify; the continuation reruns only the gate (breaker and jury kept)',
    mut: ['verifyResume'],
    go: (tpl) => runAndContinue(tpl, { gate: () => null }, {}),
    expect: ({ a, b, replayed }) => [...has(a.res && a.res.status === 'gate-died' && a.res.resume === 'verify', `run 1 status ${a.res && a.res.status}`), ...has(replayed && replayed.check === a.res.check, 'the replay did not reproduce the live return'), ...has(b && b.res && b.res.status === 'approved' && b.calls.join() === 'W-X:gate#1,W-X:judge#1,W-X:perf#1', `continuation calls ${b && b.calls}`)],
  },
];

// ---- 5. prompt lint ------------------------------------------------------------------------------------------------
const WAIT = 'WAIT RULE (owner, 2026-10-27): no single tool call may block longer than 270 s';
function lint(label, prompt, repo) {
  const out = [];
  if (!prompt.includes(WAIT)) out.push(`${label}: no wait rule`);
  // The wait rule's own list of what never to run is not a command.
  const p = prompt.replace(/Never run gh pr checks --watch, gh run watch,[^.]*\./g, '');
  if (/--watch\b|gh run watch/.test(p)) out.push(`${label}: a blocking watch (--watch or gh run watch)`);
  if (/TimeoutMinutes (?:[5-9]|\d{2,})/.test(p)) out.push(`${label}: a lane wait over 4 minutes`);
  for (const m of p.matchAll(/\bgh\s+(pr|issue|run|label|release|workflow|search|repo|api)\b/g)) {
    const seg = p.slice(m.index, m.index + 260).split(/[;\n]| and the same| \(again| then /)[0];
    const okSeg = m[1] === 'api' ? seg.includes(`repos/${repo}`) || /repos\/\$\{|<repo>/.test(seg) : seg.includes(`-R ${repo}`);
    if (!okSeg && !/^gh (pr|api) command/.test(seg) && !/^gh command takes/.test(seg)) out.push(`${label}: gh without -R: ${seg.slice(0, 90)}`);
  }
  return out;
}

// ---- 3. quotes ---------------------------------------------------------------------------------------------------
async function quotes(cfg, spec) {
  const out = { ok: [], bad: [], skipped: [] };
  const plan = gitShow('PLAN.md') || fs.readFileSync(path.join(REPO_ROOT, 'PLAN.md'), 'utf8');
  const planWords = words(plan);
  for (const t of cfg.mustFix.taxonomy) (planWords.includes(words(t.quote)) ? out.ok : out.bad).push(`taxonomy quote (${t.label}) ${planWords.includes(words(t.quote)) ? 'is' : 'is NOT'} word for word in ${cfg.mustFix.taxonomySource}: "${t.quote.slice(0, 60)}..."`);
  // The negative control: a one-character change to a quote must not match.
  const planted = cfg.mustFix.taxonomy[0].quote.replace(/a/, 'e');
  (!planWords.includes(words(planted)) ? out.ok : out.bad).push(`negative control: a quote with one character changed ${planWords.includes(words(planted)) ? 'STILL matches (the comparison cannot fail)' : 'does not match'}`);
  if (flags.offline) {
    out.skipped.push('the #91 ruling, the spec quotes and the posted spec (--offline)');
    return out;
  }
  const commentBody = (id) => ghJson(`repos/${cfg.repo}/issues/comments/${id}`).body;
  const rid = (/issuecomment-(\d+)/.exec(cfg.mustFix.rulingUrl) || [])[1];
  const rbody = rid ? commentBody(rid) : '';
  (words(rbody) === words(cfg.mustFix.ruling) ? out.ok : out.bad).push(`the owner's ruling ${words(rbody) === words(cfg.mustFix.ruling) ? 'equals' : 'DIFFERS from'} #91 comment ${rid}, word for word`);
  (words(rbody) !== words(cfg.mustFix.ruling.replace(/W-S2/, 'W-S3')) ? out.ok : out.bad).push('negative control: a ruling with one word changed does not equal the comment');
  if (spec) {
    for (const m of spec.text.matchAll(/"([^"\n]{8,})" \[c(\d{6,})\]/g)) {
      const body = commentBody(m[2]);
      (words(body).includes(words(m[1])) ? out.ok : out.bad).push(`spec quote [c${m[2]}] ${words(body).includes(words(m[1])) ? 'is' : 'is NOT'} word for word in that comment: "${m[1].slice(0, 50)}..."`);
    }
    const sid = (/issuecomment-(\d+)/.exec(spec.commentUrl) || [])[1];
    const posted = sid ? words(commentBody(sid)) : '';
    (posted.includes(words(spec.text)) ? out.ok : out.bad).push(`the spec ${posted.includes(words(spec.text)) ? 'is' : 'is NOT'} the text of its Orchestrator comment ${sid}`);
  }
  return out;
}

(async () => {
  // 2. config and spec: a stubbed run of the launched file itself (every agent returns null).
  const prompts = {};
  if (EMB) {
    try {
      const res = await load(fs.readFileSync(pos[0], 'utf8'))(async (p, o) => { prompts[o.label] = p; return null; }, parallel, null, () => {}, () => {}, undefined, {}, null);
      ok.push(`the embedded config and spec validate (a stubbed run returned ${res.status})`);
    } catch (e) {
      problems.push(`the launched file does not run: ${e.message}`);
    }
    if (EMB.spec && EMB.cfg && EMB.spec.text.length > EMB.cfg.limits.specChars) problems.push('the spec is over limits.specChars');
  }
  // 4. scenarios on the template, then each mutant.
  const tplPrompts = {};
  let passed = 0;
  for (const s of SCENARIOS) {
    const x = await s.go(TPL);
    for (const r of [x, x.a, x.b].filter((y) => y && y.prompts)) Object.assign(tplPrompts, r.prompts);
    const f = s.expect(x);
    if (f.length) problems.push(`scenario '${s.name}' fails on the template: ${f.join('; ')}${x.err ? ` (error: ${x.err})` : ''}`);
    else passed++;
  }
  ok.push(`${passed} of ${SCENARIOS.length} scenarios pass on the template`);
  let killed = 0;
  let tried = 0;
  for (const [name, [find, repl]] of Object.entries(MUT)) {
    const n = TPL.split(find).length - 1;
    if (n !== 1) { problems.push(`mutant ${name}: its rule text occurs ${n} times in the template (must be once)`); continue; }
    const mt = TPL.replace(find, repl);
    const scs = SCENARIOS.filter((s) => s.mut.includes(name));
    if (!scs.length) { problems.push(`mutant ${name}: no scenario names it`); continue; }
    for (const s of scs) {
      tried++;
      const x = await s.go(mt);
      if (s.expect(x).length) killed++;
      else problems.push(`NEGATIVE CONTROL FAILED: scenario '${s.name}' still passes with mutant ${name} (the scenario cannot catch that rule)`);
    }
  }
  ok.push(`${killed} of ${tried} negative controls fail as they must (${Object.keys(MUT).length} mutants)`);
  // 5. prompts: the scenario prompts and the launched file's own.
  const all = Object.assign({}, tplPrompts, prompts);
  const repo = (EMB && EMB.cfg.repo) || CFG.repo;
  const lints = Object.entries(all).flatMap(([l, p]) => lint(l, p, repo));
  if (lints.length) problems.push(...[...new Set(lints)].slice(0, 20));
  else ok.push(`${Object.keys(all).length} prompts carry the wait rule, no blocking watch and -R on every gh command`);
  // The lint's negative controls: planted prompts it must flag.
  const plants = [['no wait rule, then gh pr view 5', 2], [`${WAIT}. Then run gh pr checks 5 -R ${repo} --watch`, 1], [`${WAIT}. acquire perf -TimeoutMinutes 45`, 1], [`${WAIT}. gh api repos/someone/else/pulls`, 1]];
  const missed = plants.filter(([p, n]) => lint('plant', p, repo).length < n);
  if (missed.length) problems.push(`NEGATIVE CONTROL FAILED: the prompt lint misses ${missed.length} planted prompt(s): ${missed.map(([p]) => p.slice(-40)).join(' | ')}`);
  else ok.push(`negative control: the prompt lint flags all ${plants.length} planted prompts`);
  const size = {};
  for (const [l, p] of Object.entries(all)) { const t = typeOf(l); size[t] = Math.max(size[t] || 0, p.length); }
  notes.push(`largest prompt per role (chars): ${Object.entries(size).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  // 3. quotes.
  const q = await quotes(EMB ? EMB.cfg : CONFIG_JSON.defaults, EMB ? EMB.spec : null).catch((e) => ({ ok: [], bad: [`quote check failed: ${e.message}`], skipped: [] }));
  ok.push(...q.ok);
  problems.push(...q.bad);
  notes.push(...q.skipped.map((s) => `not checked: ${s}`));

  for (const l of ok) console.log(`OK    ${l}`);
  for (const l of notes) console.log(`NOTE  ${l}`);
  for (const l of problems) console.log(`FAIL  ${l}`);
  // LAUNCH READY only online, on a launched file, with the template on origin/main. A test mode (--offline or
  // --allow-unmerged) exits 0 when every check it ran holds, and never prints LAUNCH READY.
  const test = flags.offline || flags['allow-unmerged'];
  console.log(problems.length ? `\n${problems.length} problem(s): NOT LAUNCH READY` : SELF ? '\nSELF-TEST OK (the template and crew-config.json)' : test ? '\nALL CHECKS OK in a test mode (--offline or --allow-unmerged): NOT LAUNCH READY' : '\nALL PATHS OK\nLAUNCH READY');
  process.exit(problems.length ? 1 : 0);
})();
