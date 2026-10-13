#!/usr/bin/env node
// Source lint (W-F). No ESLint on the allowlist, so the rules that matter are checked directly:
// - exactly one mention of requestAnimationFrame in src/ (the ticker's call site, W-D002), in any form or letter case;
// - no reads of navigator.hardwareConcurrency or maxTouchPoints in src/ (W-D017), direct or computed, through navigator,
//   clientInformation or a computed member of the global object;
// - src/styles/tokens.css and src/lib/tokens.js match content/tokens.json (tokens.mjs --check);
// - no banned phrase and no em or en dash in src/ or content/ copy;
// - every JSON file in content/ parses.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
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

/**
 * Comments out, everything else kept, line numbers kept. TypeScript's own parser finds the comments (round-6 must-fix
 * s9-lint-scanner, Breaker 5.1 #6 forms 5 and 6): round 5's hand scanner read a regex literal after an if condition's
 * ')' as a division, so the '//' inside it blanked the rest of the line, and it kept a '//' comment right after a ':' as
 * code, so a '/*' inside that comment blanked the lines after it; both hid live code. Here a comment is only what the
 * parser leaves as trivia: the leading and trailing comment ranges of every token of the parsed file (strings, template
 * text and regex literals are tokens, never trivia). A comment's characters become spaces and its newlines stay.
 * In an .astro file only the frontmatter and the <script> bodies are code and parsed so; the markup is kept whole, so a
 * '//' in prose (a URL) is never a comment and anything written in markup counts.
 */
function stripCode(t, kind) {
  const sf = ts.createSourceFile(kind === ts.ScriptKind.JS ? 'lint.js' : 'lint.ts', t, ts.ScriptTarget.Latest, true, kind);
  const ranges = new Map();
  const add = (list) => {
    for (const r of list ?? []) ranges.set(r.pos, r.end);
  };
  const visit = (node) => {
    // A JSDoc block is the leading trivia of its node's first token, found there; its own nodes are not walked.
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    add(ts.getLeadingCommentRanges(t, node.pos));
    add(ts.getTrailingCommentRanges(t, node.end));
    for (const child of node.getChildren(sf)) visit(child);
  };
  visit(sf);
  let out = '';
  let at = 0;
  for (const [pos, end] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (pos < at) continue;
    out += t.slice(at, pos) + t.slice(pos, end).replace(/[^\n]/g, ' ');
    at = end;
  }
  return out + t.slice(at);
}
function stripComments(t, file) {
  if (!file.endsWith('.astro')) return stripCode(t, /\.(m?js)$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  // The frontmatter (between the opening and closing '---' lines) and every <script> body, each stripped as TypeScript.
  const regions = [];
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(t);
  if (fm) regions.push([t.indexOf('\n') + 1, fm[1].length]);
  for (const m of t.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) regions.push([m.index + m[0].indexOf('>') + 1, m[1].length]);
  let out = t;
  for (const [start, len] of regions) out = out.slice(0, start) + stripCode(out.slice(start, start + len), ts.ScriptKind.TS) + out.slice(start + len);
  return out;
}

// rAF: every mention counts, not only a call (round-3 should-fix S9, Breaker 3.3 #4: .bind, ?.(), .call, a destructured
// alias and a computed 'requestAnimation' + 'Frame' all reach it without 'requestAnimationFrame('), in any letter case
// and either half of the name (round-5 should-fix S9, Breaker 4.2 #5: webkitRequestAnimationFrame, and the name split
// as 'request' + 'AnimationFrame'), comments excluded. Core and touch-point counts: the names anywhere (identifiers and
// strings), and any use of navigator (or its alias clientInformation) other than a plain dotted property read
// (navigator.connection): a computed read, a cast, destructuring, an alias or passing navigator on would all reach them
// by a name built at run time. A computed member of the global object itself (window[...], globalThis[...], self[...],
// a cast of one included) can reach either by a name built at run time, so it is flagged under both rules.
const raf = [];
const forbidden = [];
const computedGlobal = [];
const RAF_RE = /requestanimation|animationframe/gi;
const FORBIDDEN_RE = /\b(hardwareConcurrency|maxTouchPoints)\b|\b(navigator|clientInformation)\b(?!\s*\??\.\s*[A-Za-z_$])/g;
const GLOBAL_COMPUTED_RE = /\b(globalThis|window|self)\b(?:\s+as\s+[^)]*\))?\)?\s*(?:\?\.)?\s*\[/g;
for (const f of src) {
  const code = stripComments(readFileSync(f, 'utf8'), f);
  const line = (i) => code.slice(0, i).split('\n').length;
  const where = rel(f).startsWith('..') ? f.replaceAll('\\', '/') : rel(f);
  for (const m of code.matchAll(RAF_RE)) raf.push(`${where}:${line(m.index)}`);
  for (const m of code.matchAll(FORBIDDEN_RE)) forbidden.push(`${where}:${line(m.index)} ${m[0].trim()}`);
  for (const m of code.matchAll(GLOBAL_COMPUTED_RE)) computedGlobal.push(`${where}:${line(m.index)} ${m[0].replace(/\s+/g, ' ')}`);
}
report.rafCallSites = raf;
report.forbiddenReads = forbidden;
report.computedGlobals = computedGlobal;
if (raf.length !== 1) problems.push(`requestAnimationFrame call sites in src/: ${raf.length} (exactly 1, the ticker): ${raf.join(', ')}`);
if (forbidden.length) problems.push(`tier code must not read core or touch-point counts: ${forbidden.join(', ')}`);
if (computedGlobal.length) problems.push(`a computed member of the global object can reach requestAnimationFrame or core or touch-point counts: ${computedGlobal.join(', ')}`);

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
