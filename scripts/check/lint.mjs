#!/usr/bin/env node
// Source lint (W-F). No ESLint on the allowlist, so the rules that matter are checked directly:
// - exactly one requestAnimationFrame call site in src/ (the ticker, W-D002);
// - no reads of navigator.hardwareConcurrency or maxTouchPoints in src/ (W-D017);
// - src/styles/tokens.css and src/lib/tokens.js match content/tokens.json (tokens.mjs --check);
// - no banned phrase and no em or en dash in src/ or content/ copy;
// - every JSON file in content/ parses.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANNED, DASHES } from '../../src/lib/content/validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const rel = (f) => relative(ROOT, f).replaceAll('\\', '/');
const problems = [];
const report = {};

const src = walk(join(ROOT, 'src')).filter((f) => /\.(ts|js|mjs|astro)$/.test(f) && !f.endsWith('.d.ts'));
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// rAF: count call sites (identifier followed by a call), comments excluded.
const raf = [];
const forbidden = [];
for (const f of src) {
  const code = strip(readFileSync(f, 'utf8'));
  for (const m of code.matchAll(/\brequestAnimationFrame\s*\(/g)) raf.push(`${rel(f)}:${code.slice(0, m.index).split('\n').length}`);
  for (const m of code.matchAll(/\b(hardwareConcurrency|maxTouchPoints)\b/g)) forbidden.push(`${rel(f)}:${code.slice(0, m.index).split('\n').length} ${m[1]}`);
}
report.rafCallSites = raf;
report.forbiddenReads = forbidden;
if (raf.length !== 1) problems.push(`requestAnimationFrame call sites in src/: ${raf.length} (exactly 1, the ticker): ${raf.join(', ')}`);
if (forbidden.length) problems.push(`tier code must not read core or touch-point counts: ${forbidden.join(', ')}`);

// Tokens outputs are current.
try {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build/tokens.mjs'), '--check'], { stdio: 'pipe' });
  report.tokens = 'current';
} catch (e) {
  problems.push(String(e.stderr || e.message).trim());
}

// Copy hygiene in source and content. The gate scripts that hold the banned list are exempt.
const EXEMPT = new Set(['src/lib/content/validate.js']);
const copyFiles = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'content'))].filter((f) => /\.(ts|js|mjs|astro|css|json|md)$/.test(f) && !EXEMPT.has(rel(f)));
for (const f of copyFiles) {
  const text = readFileSync(f, 'utf8');
  const banned = text.match(BANNED);
  BANNED.lastIndex = 0;
  if (banned) problems.push(`${rel(f)}: banned phrase(s) ${[...new Set(banned)].join(', ')}`);
  if (DASHES.test(text)) problems.push(`${rel(f)}: em or en dash`);
  DASHES.lastIndex = 0;
}
for (const f of walk(join(ROOT, 'content')).filter((x) => x.endsWith('.json'))) {
  try {
    JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    problems.push(`${rel(f)}: ${e.message}`);
  }
}

if (process.argv.includes('--json')) console.log(JSON.stringify({ ...report, problems }, null, 2));
if (problems.length) {
  console.error(`lint: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`lint: 1 rAF call site (${raf[0]}); 0 core or touch-point reads; tokens current; ${copyFiles.length} files clean`);
