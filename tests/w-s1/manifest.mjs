#!/usr/bin/env node
// GES-1 manifest for W-S1's crew evidence (W-D030): one manifest.json over everything a round wrote into
// ../portfolio-evidence/<wave>/W-S1/<sha7>/<role>/ (the acceptance suite, the node tests, check and ownership logs,
// the crew.mjs shoot, a11y and Lighthouse manifests, the W-F harness re-run). It only reads and hashes; the steps run
// before it (see the PR body for the commands).
//   node tests/w-s1/manifest.mjs [--role crew] [--wave wave3a] [--issue 13] [--pr 53]
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import os from 'node:os';
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
  steps.push({ step: 'acceptance-summary', pass: summary.pass, blocked: summary.checks.filter((c) => c.status === 'BLOCKED').map((c) => c.check) });
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
// crew.mjs and the W-F harness keep their own manifests: each becomes one item with its counts.
for (const [sub, kind] of [['shoot', 'ges1:shoot'], ['a11y', 'ges1:a11y'], ['lighthouse', 'ges1:lighthouse'], ['w-f-harness', 'w-f-harness']]) {
  const f = [join(dir, sub, 'manifest.json'), join(dir, sub, 'summary.json')].find(existsSync);
  if (!f) continue;
  const m = json(f);
  const list = m?.items ?? m?.steps ?? [];
  const failed = list.filter((i) => i.pass === false).length;
  const pass = m?.pass ?? failed === 0;
  items.push({ path: rel(f), sha256: sha256(f), kind, route: '/', pass, metrics: { items: list.length, failed } });
  steps.push({ step: kind, pass, items: list.length, failed });
}
const gl = summary ? json(join(suite, 'gpu.json')) : null;
const manifest = {
  schema: 1,
  track: 'W',
  crew: 'W-S1',
  sha: H.gitSha(),
  createdAt: new Date().toISOString(),
  host: { os: `${os.type()} ${os.release()}`, gpuRenderer: gl?.renderer ?? null, graphicsDeviceType: /D3D11/.test(gl?.renderer ?? '') ? 'Direct3D11' : null, cores: os.cpus().length },
  agent: { model: 'claude-opus-5-5', effort: 'xhigh' },
  command: 'tests/w-s1/run.mjs + node --test tests/w-s1 + scripts/check/run.mjs + scripts/check/ownership.mjs --crew W-S1 + scripts/crew.mjs shoot|a11y|lighthouse --routes / + tests/w-f/run.mjs (moved to w-f-harness/)',
  role,
  issue: Number(opts.issue || 13),
  pr: Number(opts.pr || 53),
  steps,
  items,
};
writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest: ${items.length} items, ${items.filter((i) => i.pass === false).length} failed, ${steps.length} steps -> ${join(dir, 'manifest.json')}`);
