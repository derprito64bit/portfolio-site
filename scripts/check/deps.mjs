#!/usr/bin/env node
// Deps check (rules.web.md rule 4): every package in package.json is in docs/agents/deps.md at an allowed version,
// pinned exactly, and nothing on the REJECTED row is installed (in package.json or anywhere in the lockfile).
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
const md = readFileSync(join(ROOT, 'docs/agents/deps.md'), 'utf8');

/** name -> allowed version text from the table's first two columns. */
const allowed = new Map();
const rejected = new Set();
for (const line of md.split('\n')) {
  const cells = line.split('|').map((c) => c.trim());
  if (cells.length < 4 || cells[1] === 'Package' || /^-+$/.test(cells[1])) continue;
  if (cells[1].startsWith('REJECTED')) {
    for (const name of cells[1].replace(/^REJECTED:\s*/, '').split(',')) rejected.add(name.trim().replace(/ packages$/, ''));
    continue;
  }
  // "@astrojs/check + typescript" with "0.9.x / 6.0.x"
  const names = cells[1].split('+').map((n) => n.replace(/\(.*\)/, '').trim());
  const versions = cells[2].split('/').map((v) => v.trim());
  names.forEach((n, i) => allowed.set(n, versions[i] ?? versions[0]));
}

function versionOk(want, have) {
  if (!want) return false;
  if (/pin at W-F install/i.test(want)) return /^\d+\.\d+\.\d+$/.test(have);
  const w = want.replace(/\(exact\)/, '').trim();
  if (/x$/.test(w)) return have.startsWith(w.replace(/x$/, ''));
  return w === have;
}

const problems = [];
const deps = { ...pkg.dependencies, ...pkg.devDependencies };
for (const [name, version] of Object.entries(deps)) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) problems.push(`${name}@${version}: pin an exact version`);
  if (!allowed.has(name)) problems.push(`${name}: not in docs/agents/deps.md (file a request with a decision id)`);
  else if (!versionOk(allowed.get(name), version)) problems.push(`${name}@${version}: deps.md allows ${allowed.get(name)}`);
}
const installed = Object.keys(lock.packages || {}).map((p) => p.replace(/^.*node_modules\//, ''));
for (const r of rejected) {
  if (r.startsWith('@fontsource')) {
    if (installed.some((n) => n.startsWith('@fontsource'))) problems.push('@fontsource packages are rejected');
  } else if (installed.includes(r)) problems.push(`${r}: on the REJECTED row of deps.md`);
}

if (problems.length) {
  console.error(`deps: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`deps: ${Object.keys(deps).length} packages, all on the allowlist and pinned; ${rejected.size} rejected names absent`);
