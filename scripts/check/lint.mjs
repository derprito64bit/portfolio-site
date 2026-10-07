#!/usr/bin/env node
// Source lint (W-F). No ESLint on the allowlist, so the rules that matter are checked directly:
// - exactly one mention of requestAnimationFrame in src/ (the ticker's call site, W-D002), in any form;
// - no reads of navigator.hardwareConcurrency or maxTouchPoints in src/ (W-D017), direct or computed;
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

// --src <dir> lints another source tree for these two rules (the negative control plants forms in a scratch copy).
const srcArg = process.argv.indexOf('--src');
const SRC = srcArg > 0 ? resolve(process.argv[srcArg + 1]) : join(ROOT, 'src');
const src = walk(SRC).filter((f) => /\.(ts|js|mjs|astro)$/.test(f) && !f.endsWith('.d.ts'));
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// rAF: every mention of the name counts, not only a call (round-3 should-fix S9, Breaker 3.3 #4: .bind, ?.(), .call,
// a destructured alias and a computed 'requestAnimation' + 'Frame' all reach it without 'requestAnimationFrame('),
// comments excluded. Core and touch-point counts: the names anywhere (identifiers and strings), and any use of
// navigator other than a plain dotted property read (navigator.connection): a computed read, a cast, destructuring,
// an alias or passing navigator on would all reach them by a name built at run time.
const raf = [];
const forbidden = [];
const RAF_RE = /requestAnimation/g;
const FORBIDDEN_RE = /\b(hardwareConcurrency|maxTouchPoints)\b|\bnavigator\b(?!\s*\??\.\s*[A-Za-z_$])/g;
for (const f of src) {
  const code = strip(readFileSync(f, 'utf8'));
  const line = (i) => code.slice(0, i).split('\n').length;
  const where = rel(f).startsWith('..') ? f.replaceAll('\\', '/') : rel(f);
  for (const m of code.matchAll(RAF_RE)) raf.push(`${where}:${line(m.index)}`);
  for (const m of code.matchAll(FORBIDDEN_RE)) forbidden.push(`${where}:${line(m.index)} ${m[0].trim()}`);
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
