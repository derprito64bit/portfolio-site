#!/usr/bin/env node
// Ownership check (PROTOCOL.md section 3): every file this branch changes must match the crew's globs in
// docs/agents/ownership.json. Run before every push. Exits 1 and lists each file outside the globs.
// Usage: node scripts/check/ownership.mjs [--crew W-F] [--base origin/main]
// The crew defaults to the branch name (crew/w-f -> W-F). W-F's one exception: new stub files for other crews'
// paths, recognised by their 'STUB by W-F' header, in W-F's own branch.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const crew = opt('--crew', branch.startsWith('crew/') ? branch.slice(5).toUpperCase() : null);
const base = opt('--base', 'origin/main');
if (!crew) {
  console.error(`ownership: not on a crew/<id> branch (${branch}); pass --crew <id>`);
  process.exit(2);
}

const owners = JSON.parse(readFileSync(join(ROOT, 'docs/agents/ownership.json'), 'utf8'));
const entry = Object.values(owners).find((track) => track && typeof track === 'object' && crew in track);
if (!entry) {
  console.error(`ownership: ${crew} has no entry in docs/agents/ownership.json`);
  process.exit(2);
}

/** Glob to RegExp: ** spans folders, * stays inside one, the rest is literal. */
export function globToRegExp(glob) {
  const g = glob.replace(/\s*\(.*\)\s*$/, '').trim();
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      re += '.*';
      i++;
      if (g[i + 1] === '/') i++;
    } else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const globs = entry[crew].filter((g) => !g.startsWith('fork:') && !/^Stub files|^SEED EXCEPTION/.test(g));
const patterns = globs.map(globToRegExp);
const stubException = crew === 'W-F';

const changed = new Map();
const addLines = (text) => {
  for (const line of text.split('\n').filter(Boolean)) {
    const [status, ...rest] = line.split('\t');
    changed.set(rest[rest.length - 1], status[0]);
  }
};
addLines(git('diff', '--name-status', '--no-renames', `${base}...HEAD`));
addLines(git('diff', '--name-status', '--no-renames', 'HEAD'));
for (const line of git('status', '--porcelain', '--untracked-files=all').split('\n').filter(Boolean)) {
  if (line.startsWith('??')) changed.set(line.slice(3), 'A');
}

const violations = [];
const stubs = [];
for (const [file, status] of [...changed].sort()) {
  if (patterns.some((p) => p.test(file))) continue;
  const path = join(ROOT, file);
  if (stubException && status === 'A' && existsSync(path) && readFileSync(path, 'utf8').includes('STUB by W-F')) {
    stubs.push(file);
    continue;
  }
  violations.push(`${status} ${file}`);
}

const summary = { crew, base, changed: changed.size, stubs: stubs.length, violations };
if (args.includes('--json')) console.log(JSON.stringify(summary, null, 2));
if (violations.length) {
  console.error(`ownership: ${violations.length} file(s) outside ${crew}'s globs:\n  ${violations.join('\n  ')}`);
  process.exit(1);
}
console.log(`ownership: ${changed.size} changed file(s) inside ${crew}'s globs${stubs.length ? ` (${stubs.length} stub file(s) for other crews)` : ''}`);
