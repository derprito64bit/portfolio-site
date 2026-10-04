#!/usr/bin/env node
// GES-1 manifest for W-S1's crew evidence (W-D030): one manifest.json over everything a round wrote into
// ../portfolio-evidence/<wave>/W-S1/<sha7>/<role>/ (the acceptance suite, the node tests, check and ownership logs,
// the crew.mjs shoot, a11y and Lighthouse manifests, the W-F harness re-run). It only reads and hashes; the steps run
// before it (see the PR body for the commands).
//   node tests/w-s1/manifest.mjs [--role crew] [--wave wave3a] [--issue 13] [--pr 53] [--carry <sha7>]
// --carry <sha7>: a round that changes no input of the build carries <sha7>'s crew.mjs shoot, a11y and Lighthouse and
// its W-F harness run instead of re-running them. The proof is dist-identity.json in this folder (dist-hash.mjs at this
// SHA against <sha7>'s build): a carried item names the SHA it ran at, and fails unless the two builds are identical.
// The W-F harness: when it holds rerun-lighthouse/ (its Lighthouse step re-run at the same SHA), that rerun is the
// harness's Lighthouse result, and the first pass's Lighthouse items are listed as superseded.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { H } from './lib.mjs';

const opts = H.cliOpts();
const role = String(opts.role || 'crew');
const dir = H.evidenceDir('W-S1', String(opts.wave || 'wave3a'), role);
if (!existsSync(dir)) throw new Error(`manifest: no evidence at ${dir}`);
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const rel = (f) => relative(dir, f).replaceAll('\\', '/');
const json = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const items = [];
const steps = [];

// The acceptance suite: one item per check, plus its frames.
const suite = join(dir, 'w-s1');
const summary = json(join(suite, 'summary.json'));
if (summary) {
  items.push({ path: 'w-s1/summary.json', sha256: sha256(join(suite, 'summary.json')), kind: 'acceptance-summary', route: '/', pass: summary.pass, metrics: { checks: summary.checks.length, statuses: Object.fromEntries(summary.checks.map((c) => [c.check, c.status ?? (c.pass ? 'PASS' : 'FAIL')])) } });
  steps.push({ step: 'acceptance-summary', pass: summary.pass, failed: summary.checks.filter((c) => !c.pass).map((c) => c.check) });
  for (const c of summary.checks) {
    const f = join(suite, `${c.check}.json`);
    if (existsSync(f)) items.push({ path: rel(f), sha256: sha256(f), kind: `w-s1:${c.check}`, route: '/', pass: c.pass, metrics: { ms: c.ms, status: c.status } });
  }
  for (const f of walk(suite).filter((x) => /\.png$/.test(x))) {
    const kind = /filmstrip|full-|reduced-/.test(f) ? 'filmstrip' : /delayed-gl/.test(f) ? 'delayed-gl-frame' : /parity|handover/.test(f) ? 'poster-parity-frame' : /first-paint/.test(f) ? 'first-paint-shot' : /film-/.test(f) ? 'flash-frame' : 'frame';
    items.push({ path: rel(f), sha256: sha256(f), kind, route: '/', pass: true });
  }
}
// Logs and node tests.
for (const [file, kind, re] of [['check.log', 'check', /all \d+ steps passed/], ['ownership.log', 'ownership', /inside W-S1's globs/], ['node-tests.log', 'node-tests', /ℹ fail 0/]]) {
  const f = join(dir, file);
  if (!existsSync(f)) continue;
  const pass = re.test(readFileSync(f, 'utf8'));
  items.push({ path: file, sha256: sha256(f), kind, pass });
  steps.push({ step: kind, pass });
}
// What a carried run stands on: this SHA's build against the carried SHA's, file by file (dist-hash.mjs).
const carry = opts.carry ? String(opts.carry) : null;
const carryDir = carry ? join(dir, '..', '..', carry, role) : null;
const identity = json(join(dir, 'dist-identity.json'));
const distIdentical = Boolean(identity?.identical && identity.sha === H.gitSha() && carry && identity.against?.sha?.startsWith(carry));
if (identity) {
  items.push({ path: 'dist-identity.json', sha256: sha256(join(dir, 'dist-identity.json')), kind: 'dist-identity', pass: distIdentical, metrics: { sha: identity.sha, tree: identity.tree, files: identity.files, against: identity.against?.sha ?? null, againstTree: identity.against?.tree ?? null, differ: identity.differ?.length ?? null } });
  steps.push({ step: 'dist-identity', pass: distIdentical, against: identity.against?.sha ?? null });
}
// crew.mjs and the W-F harness keep their own manifests: each becomes one item with its counts.
for (const [sub, kind] of [['shoot', 'ges1:shoot'], ['a11y', 'ges1:a11y'], ['lighthouse', 'ges1:lighthouse'], ['w-f-harness', 'w-f-harness']]) {
  const own = [join(dir, sub, 'manifest.json'), join(dir, sub, 'summary.json')].find(existsSync);
  const carried = !own && carryDir ? [join(carryDir, sub, 'manifest.json'), join(carryDir, sub, 'summary.json')].find(existsSync) : null;
  const f = own ?? carried;
  if (!f) continue;
  const m = json(f);
  let list = m?.items ?? m?.steps ?? [];
  const metrics = {};
  let rerunPass = null;
  if (kind === 'w-f-harness') {
    const rf = join(dirname(f), 'rerun-lighthouse', 'manifest.json');
    const rerun = existsSync(rf) ? json(rf) : null;
    if (rerun) {
      // The first pass's Lighthouse step and its run log give way to the rerun's.
      const superseded = new Set(['ges1-lighthouse', 'runlog']);
      // Listed as the first pass's result, not as items: the rerun is the harness's result.
      metrics.superseded = list.filter((i) => superseded.has(i.kind)).map((i) => ({ path: i.path, firstPass: i.pass ? 'PASS' : 'FAIL' }));
      list = [...list.filter((i) => !superseded.has(i.kind)), ...rerun.items.map((i) => ({ ...i, path: `rerun-lighthouse/${i.path}` }))];
      metrics.lighthouse = rel(join(dirname(rf), 'lighthouse', 'manifest.json'));
      // The valid run's medians, one item of their own.
      const lhDir = join(dirname(rf), 'lighthouse');
      const lm = json(join(lhDir, 'manifest.json'));
      const forms = {};
      for (const form of ['mobile', 'desktop']) {
        const s = json(join(lhDir, `home-${form}-summary.json`));
        if (!s) continue;
        forms[form] = { lcp: Math.round(s.medians?.lcp ?? s.median?.lcp), tbt: s.medians?.tbt ?? s.median?.tbt, cls: s.medians?.cls ?? s.median?.cls, lcpElement: s.median?.lcpElement?.selector ?? null, validRuns: s.runs?.filter((r) => r.valid).length ?? null, budgetPass: s.budgetPass, glOrderPass: s.glOrderPass };
      }
      rerunPass = Boolean(lm) && (lm.items ?? []).every((i) => i.pass !== false) && Object.keys(forms).length === 2 && Object.values(forms).every((x) => x.budgetPass && x.glOrderPass && x.validRuns === 5);
      items.push({ path: metrics.lighthouse, sha256: sha256(join(lhDir, 'manifest.json')), kind: 'w-f-harness:lighthouse', route: '/', pass: rerunPass && (!carried || distIdentical), metrics: { sha: lm?.sha ?? null, runsPerForm: 5, ...forms, ...(carried ? { carriedFrom: lm?.sha ?? carry, distIdentical } : {}) } });
    }
  }
  const failed = list.filter((i) => i.pass === false).length;
  let pass = rerunPass === null ? (m?.pass ?? failed === 0) : rerunPass && failed === 0;
  if (carried) {
    metrics.carriedFrom = m?.sha ?? carry;
    metrics.distIdentical = distIdentical;
    pass = pass && distIdentical;
  }
  items.push({ path: rel(f), sha256: sha256(f), kind, route: '/', pass, metrics: { items: list.length, failed, ...metrics } });
  steps.push({ step: kind, pass, items: list.length, failed, ...(carried ? { carriedFrom: metrics.carriedFrom } : {}) });
}
// Probes beyond the acceptance rows (probes/*.json): informational, so their pass is null, never a verdict.
const probes = join(dir, 'probes');
if (existsSync(probes)) {
  for (const f of walk(probes).filter((x) => /\.json$/.test(x))) {
    const p = json(f);
    items.push({ path: rel(f), sha256: sha256(f), kind: 'probe', route: '/', pass: null, metrics: { note: p?.note ?? null, rows: p?.rows?.map((r) => ({ profile: r.profile, status: r.status })) ?? null } });
  }
}
const gl = summary ? json(join(suite, 'gpu.json')) : null;
// GES-1's host and tools fields, from the harness (a blank page's WebGL renderer and refresh rate; browser versions).
let host;
let tools;
try {
  host = await H.hostInfo();
  tools = await H.toolVersions();
} finally {
  await H.closeBrowsers();
}
const manifest = {
  schema: 1,
  track: 'W',
  crew: 'W-S1',
  sha: H.gitSha(),
  createdAt: new Date().toISOString(),
  host: { ...host, suiteRenderer: gl?.renderer ?? null },
  tools,
  agent: H.AGENT,
  command: 'tests/w-s1/run.mjs + node --test tests/w-s1 + scripts/check/run.mjs + scripts/check/ownership.mjs --crew W-S1 + scripts/crew.mjs shoot|a11y|lighthouse --routes / + tests/w-f/run.mjs (moved to w-f-harness/)' + (carry ? ` + tests/w-s1/dist-hash.mjs against ${carry} (carried: ${carry}'s shoot, a11y, lighthouse and w-f-harness)` : ''),
  ...(carry ? { carriedFrom: { sha: carry, dir: rel(carryDir), distIdentical } } : {}),
  role,
  issue: Number(opts.issue || 13),
  pr: Number(opts.pr || 53),
  steps,
  items,
};
writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest: ${items.length} items, ${items.filter((i) => i.pass === false).length} failed, ${steps.length} steps -> ${join(dir, 'manifest.json')}`);
