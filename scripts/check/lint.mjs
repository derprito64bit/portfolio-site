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
 * Comments out, everything else kept, line numbers kept (round-5 should-fix S9, Breaker 4.2 #5: the old regex strip
 * took '//' inside a string such as 'a//b' for a comment and dropped the rest of the line, hiding a requestAnimationFrame
 * or a navigator read after it). A small scanner: strings ('', "", template literals with ${} nesting) and regex
 * literals are skipped as text, so only real comments go; a comment's characters become spaces and its newlines stay.
 * In .astro markup a '//' right after ':' (a URL in prose) is not a comment, as before. A string the scanner opens by
 * mistake (an apostrophe in prose) ends at its line's end, and since strings are kept, a mistake can only keep text.
 */
function stripComments(t) {
  let out = '';
  let i = 0;
  const n = t.length;
  const tpl = []; // brace depth inside each open ${ }
  let mode = 'code';
  let prev = ''; // the last significant character in code (for a regex literal vs a division)
  let word = ''; // the last identifier in code
  const REGEX_AFTER = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
  const REGEX_WORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = t[i];
    const d = t[i + 1];
    if (mode === 'code') {
      if (c === '/' && d === '/' && t[i - 1] !== ':') {
        const end = t.indexOf('\n', i);
        const stop = end < 0 ? n : end;
        out += blank(t.slice(i, stop));
        i = stop;
        continue;
      }
      if (c === '/' && d === '*') {
        const end = t.indexOf('*/', i + 2);
        const stop = end < 0 ? n : end + 2;
        out += blank(t.slice(i, stop));
        i = stop;
        continue;
      }
      if (c === "'" || c === '"') mode = c;
      else if (c === '`') mode = 'tpl';
      else if (c === '/' && (REGEX_AFTER.has(prev) || REGEX_WORDS.has(word))) mode = 'regex';
      else if (c === '{' && tpl.length) tpl[tpl.length - 1]++;
      else if (c === '}' && tpl.length) {
        if (tpl[tpl.length - 1] === 0) {
          tpl.pop();
          mode = 'tpl';
        } else tpl[tpl.length - 1]--;
      }
      if (/[A-Za-z0-9_$]/.test(c)) word = /[A-Za-z0-9_$]/.test(t[i - 1] ?? '') ? word + c : c;
      else if (!/\s/.test(c)) word = '';
      if (!/\s/.test(c)) prev = c;
      out += c;
      i++;
      continue;
    }
    // Inside a string, a template's text or a regex literal: kept as it is.
    out += c;
    i++;
    if (c === '\\') {
      if (i < n) out += t[i++];
      continue;
    }
    if (mode === "'" || mode === '"') {
      if (c === mode || c === '\n') mode = 'code';
    } else if (mode === 'tpl') {
      if (c === '`') mode = 'code';
      else if (c === '$' && t[i] === '{') {
        out += t[i++];
        tpl.push(0);
        mode = 'code';
      }
    } else if (mode === 'regex') {
      if (c === '[') mode = 'regexClass';
      else if (c === '/' || c === '\n') mode = 'code';
    } else if (mode === 'regexClass') {
      if (c === ']') mode = 'regex';
      else if (c === '\n') mode = 'code';
    }
    if (mode === 'code') {
      prev = 'x'; // a string or a regex ends an expression: a '/' after it divides
      word = '';
    }
  }
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
  const code = stripComments(readFileSync(f, 'utf8'));
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
