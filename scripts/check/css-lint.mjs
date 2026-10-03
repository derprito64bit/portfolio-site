#!/usr/bin/env node
// CSS lint (W-D013, W-D030), over every stylesheet and <style> block in src/ and the built CSS in dist/:
// - no dvh/dvw/dvmin/dvmax in layouts that hold [data-gl] slots (toolbar rule; svh for minimum heights);
// - no vw widths or offsets on boxes outside the tokens (vw ignores the scrollbar and overflows);
// - no overflow-x hidden or clip on html, body or :root (it hides overflow instead of fixing it).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)])) : []);
const TOKENS_FILE = 'src/styles/tokens.css';
const BOX_PROPS = /^(inline-size|block-size|width|height|min-width|max-width|min-inline-size|max-inline-size|left|right|top|bottom|inset(-[a-z-]+)?|margin(-[a-z-]+)?|padding(-[a-z-]+)?|translate|transform|flex-basis|grid-template-columns|gap|column-gap)$/;

/** Split CSS into (selector, declarations) pairs, ignoring comments and at-rule wrappers. */
function rules(css) {
  const out = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}@;]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) out.push({ selector: m[1].trim(), body: m[2] });
  return out;
}
function decls(body) {
  return body.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const i = d.indexOf(':');
    return { prop: d.slice(0, i).trim().toLowerCase(), value: d.slice(i + 1).trim() };
  });
}

const problems = [];
function lint(file, css) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const isTokens = rel === TOKENS_FILE;
  for (const r of rules(css)) {
    for (const d of decls(r.body)) {
      if (/\b\d*\.?\d+dv(h|w|min|max)\b/.test(d.value)) problems.push(`${rel}: ${r.selector} { ${d.prop}: ${d.value} } uses dynamic viewport units (use svh or lvh)`);
      if (!isTokens && !d.prop.startsWith('--') && BOX_PROPS.test(d.prop) && /\b\d*\.?\d+vw\b/.test(d.value)) problems.push(`${rel}: ${r.selector} { ${d.prop}: ${d.value} } sizes or offsets a box in vw outside the tokens`);
      if (/^overflow(-x)?$/.test(d.prop) && /\b(hidden|clip)\b/.test(d.value) && r.selector.split(',').some((s) => /^(html|body|:root)\b/.test(s.trim().replace(/^:where\(|\)$/g, '')))) problems.push(`${rel}: ${r.selector} { ${d.prop}: ${d.value} } hides overflow on the root`);
    }
  }
}

const sources = walk(join(ROOT, 'src')).filter((f) => /\.(css|astro)$/.test(f));
for (const f of sources) {
  const text = readFileSync(f, 'utf8');
  if (f.endsWith('.css')) lint(f, text);
  else for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) lint(f, m[1]);
}
const built = walk(join(ROOT, 'dist')).filter((f) => f.endsWith('.html') || f.endsWith('.css'));
for (const f of built) {
  const text = readFileSync(f, 'utf8');
  if (f.endsWith('.css')) lint(f, text);
  else for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) lint(f, m[1].replace(/:root\{[^}]*--gutter[^}]*\}/, ''));
}

if (problems.length) {
  console.error(`css-lint: ${problems.length} problem(s):\n  ${[...new Set(problems)].join('\n  ')}`);
  process.exit(1);
}
console.log(`css-lint: ${sources.length} source and ${built.length} built files; no dvh, no vw boxes outside tokens, no root overflow hiding`);
