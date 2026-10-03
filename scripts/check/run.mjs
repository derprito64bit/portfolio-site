#!/usr/bin/env node
// npm run check (W-F acceptance): build, astro check (0 errors), lint, ownership, deps, size-limit, ph-gate, CSS lint,
// stacking-context scan, tokens determinism. Every step runs even after a failure, so one run shows everything that
// is wrong; the exit code is 1 if any step failed. GPU-free: this is what CI runs.
// Usage: node scripts/check/run.mjs [--skip build] [--log check.log] [--json check.json]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const skip = new Set(args.flatMap((a, i) => (a === '--skip' ? args[i + 1].split(',') : [])));
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const node = (script, ...rest) => [process.execPath, [join(ROOT, script), ...rest]];

// In a GitHub pull request the checkout is detached; the crew comes from the head branch name.
const headRef = process.env.GITHUB_HEAD_REF || '';
const ownershipArgs = headRef.startsWith('crew/') ? ['--crew', headRef.slice(5).toUpperCase()] : [];

const STEPS = [
  ['build', ...node('node_modules/astro/bin/astro.mjs', 'build'), { pre: [node('scripts/build/tokens.mjs'), node('scripts/build/images.mjs')] }],
  ['astro check', ...node('node_modules/astro/bin/astro.mjs', 'check')],
  ['lint', ...node('scripts/check/lint.mjs')],
  ['ownership', ...node('scripts/check/ownership.mjs', ...ownershipArgs)],
  ['deps', ...node('scripts/check/deps.mjs')],
  ['size-limit', ...node('node_modules/size-limit/bin.js')],
  ['ph-gate', ...node('scripts/check/ph-gate.mjs')],
  ['css lint', ...node('scripts/check/css-lint.mjs')],
  ['stacking-context scan', ...node('scripts/check/stacking.mjs')],
  ['tokens determinism', ...node('scripts/check/tokens-determinism.mjs')],
];

function run(cmd, argv) {
  return new Promise((res) => {
    const p = spawn(cmd, argv, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0' } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => res({ code, out }));
  });
}

const branch = process.env.GITHUB_HEAD_REF || (await run('git', ['rev-parse', '--abbrev-ref', 'HEAD'])).out.trim();
const results = [];
let log = '';
for (const [name, cmd, argv, extra] of STEPS) {
  if (skip.has(name.split(' ')[0])) continue;
  const t0 = Date.now();
  let res;
  if (name === 'ownership' && !/^crew\//.test(branch)) {
    res = { code: 0, out: `skipped: ${branch} is not a crew/<id> branch` };
  } else {
    for (const [c, a] of extra?.pre ?? []) {
      const pre = await run(c, a);
      log += pre.out;
      if (pre.code) res = pre;
    }
    if (!res) res = await run(cmd, argv);
  }
  // astro check prints its own summary; 0 errors is the bar even when warnings exist.
  const pass = res.code === 0 && !(name === 'astro check' && !/- 0 errors/.test(res.out.replace(/\x1b\[[0-9;]*m/g, '')));
  const ms = Date.now() - t0;
  results.push({ step: name, pass, ms });
  const tail = res.out.trim().split('\n').slice(-8).join('\n');
  const line = `${pass ? 'PASS' : 'FAIL'}  ${name.padEnd(22)} ${String(ms).padStart(6)} ms`;
  console.log(line);
  if (!pass) console.log(tail.replace(/^/gm, '      '));
  log += `\n===== ${line}\n${res.out}\n`;
}

const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\ncheck: ${failed.length} of ${results.length} steps failed: ${failed.map((f) => f.step).join(', ')}` : `\ncheck: all ${results.length} steps passed`);
if (opt('--log')) writeFileSync(opt('--log'), log);
if (opt('--json')) writeFileSync(opt('--json'), `${JSON.stringify({ schema: 1, branch, node: process.version, results }, null, 2)}\n`);
process.exit(failed.length ? 1 : 0);
