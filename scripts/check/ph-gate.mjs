#!/usr/bin/env node
// ph-gate (W-D022, W-D023, W-D027): placeholder and copy gate over content/ and the built dist/.
// Fails on: invalid content (schema v2 rules), malformed or unmarked placeholder text, a token in a confirmed entry,
// a token rendered outside a .ph slot, a page holding a token without robots noindex, banned phrases, em or en
// dashes, duplicate document titles across routes, and identical link names pointing to different URLs on a page.
// Usage: node scripts/check/ph-gate.mjs [--dist dist] [--json report.json]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANNED, DASHES, MARKER, TOKEN, validateContent } from '../../src/lib/content/validate.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const DIST = resolve(ROOT, opt('--dist', 'dist'));
const problems = [];
const add = (where, msg) => problems.push(`${where}: ${msg}`);

// ---------- 1. content/ ----------
const read = (f) => JSON.parse(readFileSync(join(ROOT, 'content', f), 'utf8'));
const tokens = read('tokens.json');
const { errors } = validateContent({ projects: read('projects.json'), honours: read('honours.json'), worlds: read('worlds.json'), profile: read('profile.json'), lookIds: tokens.filmLooks.ids });
errors.forEach((e) => add('content', e));

// ---------- 2. dist/ ----------
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const attr = (tagText, name) => {
  const m = tagText.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decode(m[1] ?? m[2] ?? m[3] ?? '') : null;
};
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** Walk one page: text runs with their open-element stack, every <a>, the title and the robots meta. */
function walk(html) {
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|template)\b[\s\S]*?<\/\1>/gi, '');
  const re = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>|([^<]+)/g;
  const stack = [];
  const texts = [];
  const links = [];
  const attrs = [];
  let title = null;
  let m;
  while ((m = re.exec(body))) {
    if (m[3] !== undefined) {
      const text = decode(m[3]);
      if (text.trim()) {
        texts.push({ text, stack: stack.map((s) => s) });
        for (const a of stack) if (a.link) a.link.name += text;
        if (stack.some((s) => s.tag === 'title')) title = (title ?? '') + text;
      }
      continue;
    }
    const tag = m[1].toLowerCase();
    const raw = m[0];
    if (raw.startsWith('</')) {
      const i = stack.map((s) => s.tag).lastIndexOf(tag);
      if (i >= 0) stack.length = i;
      continue;
    }
    for (const name of ['alt', 'aria-label', 'title', 'content', 'placeholder']) {
      const v = attr(raw, name);
      if (v) attrs.push({ tag, name, value: v });
    }
    const cls = (attr(raw, 'class') || '').split(/\s+/);
    const hidden = attr(raw, 'aria-hidden') === 'true';
    const node = { tag, ph: cls.includes('ph'), hidden };
    if (tag === 'a' && attr(raw, 'href') !== null) {
      node.link = { href: attr(raw, 'href'), name: '', label: attr(raw, 'aria-label') };
      links.push(node.link);
    }
    if (tag === 'img' && node.link === undefined) {
      const alt = attr(raw, 'alt');
      for (const a of stack) if (a.link && alt) a.link.name += alt;
    }
    if (!VOID.has(tag) && !raw.endsWith('/>')) stack.push(node);
  }
  const robots = html.match(/<meta\s+name="robots"\s+content="([^"]*)"/i)?.[1] ?? '';
  return { texts, links, attrs, title: title?.trim() ?? null, robots };
}

const walkFiles = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walkFiles(join(d, f)) : [join(d, f)]));
if (!existsSync(DIST)) {
  add('dist', 'missing; run npm run build first');
} else {
  const titles = new Map();
  const pages = walkFiles(DIST).filter((f) => f.endsWith('.html'));
  for (const file of pages) {
    const route = `/${relative(DIST, file).split(sep).join('/')}`.replace(/index\.html$/, '');
    const html = readFileSync(file, 'utf8');
    const page = walk(html);
    const visible = page.texts.filter((t) => !t.stack.some((s) => s.tag === 'title' || s.tag === 'noscript'));
    const allText = [...visible.map((t) => t.text), ...page.attrs.map((a) => a.value), page.title ?? ''].join('\n');

    // Tokens: well-formed, marked, rendered as slots, and the page is noindex.
    const holdsToken = TOKEN.test(allText);
    TOKEN.lastIndex = 0;
    const markers = (allText.match(MARKER) || []).length;
    const tokenCount = (allText.match(TOKEN) || []).length;
    if (markers !== tokenCount) add(route, `${markers - tokenCount} malformed or unmarked placeholder marker(s)`);
    for (const t of visible) {
      if (!(t.text.match(TOKEN) || []).length) continue;
      if (!t.stack.some((s) => s.ph) && !t.stack.some((s) => s.hidden)) add(route, `token outside a .ph slot: "${t.text.trim().slice(0, 60)}"`);
    }
    if (holdsToken && !/noindex/i.test(page.robots)) add(route, 'holds a placeholder token but ships without robots noindex');

    // Copy hygiene.
    const banned = allText.match(BANNED);
    if (banned) add(route, `banned phrase(s): ${[...new Set(banned)].join(', ')}`);
    BANNED.lastIndex = 0;
    if (DASHES.test(allText)) add(route, 'em or en dash in copy');
    DASHES.lastIndex = 0;

    // Titles are unique across routes.
    if (!page.title) add(route, 'no document title');
    else if (titles.has(page.title)) add(route, `document title "${page.title}" duplicates ${titles.get(page.title)}`);
    else titles.set(page.title, route);

    // One name, one destination (per page).
    const byName = new Map();
    for (const l of page.links) {
      const name = (l.label || l.name).replace(/\s+/g, ' ').trim();
      if (!name) {
        add(route, `link to ${l.href} has no accessible name`);
        continue;
      }
      const target = new URL(l.href, `https://derprito64bit.github.io${route}`).href;
      const prev = byName.get(name);
      if (prev && prev !== target) add(route, `link name "${name}" points to ${prev} and ${target}`);
      byName.set(name, target);
    }
  }
  if (!pages.length) add('dist', 'no HTML pages');
}

// ---------- 3. Markdown copy in content/ ----------
for (const f of readdirSync(join(ROOT, 'content')).filter((x) => x.endsWith('.md'))) {
  const text = readFileSync(join(ROOT, 'content', f), 'utf8');
  if (BANNED.test(text)) add(`content/${f}`, 'banned phrase');
  BANNED.lastIndex = 0;
}

const report = { schema: 1, check: 'ph-gate', dist: relative(ROOT, DIST), problems };
const out = opt('--json', null);
if (out) writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
if (problems.length) {
  console.error(`ph-gate: ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('ph-gate: content valid; every token is marked, slotted and noindex; titles and link names unique; copy clean');
