#!/usr/bin/env node
// W-S2 fixtures (#14 spec v1 rows A1, L2, and the tokens-only rebuild of L1). Fixtures build in a scratch copy of the
// repo, name themselves fixtures and use programmatic covers; content/*.json is never edited, here or there.
//   A1   /fixture-a1/: three placeholder entries with a sourced cover (a PNG this script writes), one with cover '',
//        one whose cover fails to load. In the enlargements, the sheet and the List: a cover shows the cover with its
//        token title and frame code; cover '' shows its seeded strip; a failed cover is the undeveloped print with
//        "Image didn't load." in the sheet and the enlargements, and no added text in its List row.
//   L2   /fixture-n5/ .. /fixture-n8/: 5, 6, 7 and 8 projects, no empty frame, at D2, T2 and P2 (Sheet).
//   L1   --tokens alt: the same scratch build with fixed altered layout.* values; tests/w-s2/layout.mjs then runs on it
//        with those tokens (the frames must follow them).
//   The tree it runs from is never written: its chunk manifest (node_modules/.cache/portfolio-build, which tests/w-s1
//   glBytes and bytes.mjs read) must be byte-identical after the run, else the run fails (and puts it back). The plant
//   'sharedcache' junctions the whole node_modules again (round 1's gate F4) to show that check failing.
// Usage: node tests/w-s2/fixtures.mjs [--tokens alt] [--keep] [--out <dir>] [--plant cover|literal|sharedcache]
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { ROOT, closeBrowsers, cliOpts, newContext, serve, waitSettled } from '../harness/lib.mjs';

const o = cliOpts();
const alt = String(o.tokens ?? '') === 'alt';
/** The altered layout.* values of the tokens-only rebuild (fixed, so a run is repeatable). */
export const ALT_LAYOUT = { enlargementsPctOfContent: { 'B1-B2': [64, 58, 60], B3: [48, 40, 42], 'B4-B5': [30, 25, 22], maxPx: 560 }, sheetColumns: { 'B1-B2': 2, B3: 2, 'B4-B5': 3 }, minPrintPx: 150, phoneSheet: 'alternate columns offset 30px, seeded tilt up to 1deg' };

// ---------------------------------------------------------------- the scratch copy
const plant = o.plant ? String(o.plant) : null;
const MANIFEST = join(ROOT, 'node_modules/.cache/portfolio-build/vite-manifest.json');
const manifestBefore = existsSync(MANIFEST) ? readFileSync(MANIFEST) : null;
const dir = mkdtempSync(join(tmpdir(), 'w-s2-fixtures-'));
for (const f of ['src', 'content', 'public', 'scripts', 'assets-src', 'astro.config.mjs', 'package.json', 'tsconfig.json']) if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(dir, f), { recursive: true });
// The tree's packages, one junction per entry, under the scratch copy's OWN node_modules: the build writes its chunk
// manifest (node_modules/.cache/portfolio-build) and Vite its cache (.vite) there, so a fixtures run never touches the
// tree it ran from (a junction of the whole folder rewrote a build-once tree's manifest: gate F4, #14 round 1).
if (plant === 'sharedcache') symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
else {
  mkdirSync(join(dir, 'node_modules'));
  for (const e of readdirSync(join(ROOT, 'node_modules'))) if (e !== '.cache' && e !== '.vite') symlinkSync(join(ROOT, 'node_modules', e), join(dir, 'node_modules', e), 'junction');
}
// Negative controls, planted in the scratch copy's source only: 'cover' (the print ignores its cover and always shows the
// strip; A1 must fail) and 'literal' (the B4-B5 shares are literals, not layout.*; the tokens-only rebuild must fail).
if (plant === 'cover') {
  const f = join(dir, 'src/components/print/Print.astro');
  writeFileSync(f, readFileSync(f, 'utf8').replace('const cover = p.cover;', "const cover = '';"));
}
if (plant === 'literal') {
  const f = join(dir, 'src/sections/work/Work.astro');
  writeFileSync(f, readFileSync(f, 'utf8').replace("--s45:${share('B4-B5', i)}", '--s45:${[0.34, 0.27, 0.24][i]}'));
}
if (alt) {
  const t = JSON.parse(readFileSync(join(dir, 'content/tokens.json'), 'utf8'));
  Object.assign(t.layout, ALT_LAYOUT);
  writeFileSync(join(dir, 'content/tokens.json'), JSON.stringify(t, null, 2));
}
/** A programmatic cover: a 360 x 480 PNG of diagonal bands (no camera, no model; generated here). */
function png(w, h, seed) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const v = ((x + y + seed * 40) >> 5) % 4;
      const i = y * (w * 3 + 1) + 1 + x * 3;
      raw[i] = 60 + v * 45;
      raw[i + 1] = 90 + ((v * 30 + seed * 50) % 120);
      raw[i + 2] = 140 - v * 20;
    }
  }
  const crc = (b) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
mkdirSync(join(dir, 'public/fixtures'), { recursive: true });
for (const k of [1, 2, 3]) writeFileSync(join(dir, `public/fixtures/cover-${k}.png`), png(360, 480, k));
const page = (name, body) =>
  writeFileSync(
    join(dir, `src/pages/${name}.astro`),
    `---
// FIXTURE (tests/w-s2/fixtures.mjs, scratch copy only): ${name}.
import Base from '../layouts/Base.astro';
import Work from '../sections/work/Work.astro';
import Sheet from '../sections/sheet/Sheet.astro';
import { content } from '../lib/content/index.ts';
const fx = (i, extra = {}) => { const b = content.projects[i % content.projects.length]; const frame = (i + 1) + 'A'; return { ...b, slug: 'fixture-' + (i + 1), frame, linkName: frame + ', ' + b.title, href: '/work/' + b.slug + '/', ...extra }; };
${body}
---
<Base title="Fixture ${name}" path="/${name}/" page="home" noindex={true}>
  <Work picks={picks} />
  <Sheet projects={projects} enlarged={picks} />
</Base>
`,
  );
page('fixture-a1', `const projects = [fx(0, { cover: '/fixtures/cover-1.png' }), fx(1, { cover: '/fixtures/cover-2.png' }), fx(2, { cover: '' }), fx(3, { cover: '/fixtures/cover-3.png' }), fx(4, { cover: '/fixtures/missing.png' })];\nconst picks = [projects[0], projects[2], projects[4]];`);
for (const n of [5, 6, 7, 8]) page(`fixture-n${n}`, `const projects = Array.from({ length: ${n} }, (_, i) => fx(i));\nconst picks = projects.slice(0, 3);`);
execFileSync(process.execPath, ['scripts/build/tokens.mjs'], { cwd: dir, stdio: 'pipe' });
execFileSync(process.execPath, ['scripts/build/images.mjs'], { cwd: dir, stdio: 'pipe' });
execFileSync(process.execPath, ['node_modules/astro/bin/astro.mjs', 'build'], { cwd: dir, stdio: 'pipe' });
console.log(`fixtures: built ${dir}${alt ? ' with the altered layout.* tokens' : ''}`);

// ---------------------------------------------------------------- checks
const fails = {};
const note = (row, m) => (fails[row] ??= []).push(m);
const rows = {};
if (alt) {
  // The tokens-only rebuild: the layout instrument, on this dist, with these tokens.
  let out = '';
  try {
    out = execFileSync(process.execPath, [join(ROOT, 'tests/w-s2/layout.mjs'), '--dist', join(dir, 'dist'), '--tokens', join(dir, 'src/lib/tokens.js'), '--profiles', 'D1,D2,T2,P2,Z-P2', ...(o.out ? ['--out', String(o.out)] : [])], { encoding: 'utf8' });
  } catch (e) {
    out = String(e.stdout);
    note('L1', 'the frames do not follow the altered tokens');
  }
  rows.tokensOnly = out.trim().split('\n');
} else {
  const srv = await serve(join(dir, 'dist'));
  try {
    for (const prof of ['D2', 'T2', 'P2']) {
      for (const view of ['sheet', 'list']) {
        const ctx = await newContext(prof, 'reduced');
        const p = await ctx.newPage();
        await p.goto(`${srv.base}/fixture-a1/?view=${view}`, { waitUntil: 'load' });
        await waitSettled(p, 12000);
        // List prints load lazily: bring every row into view first, as a visitor scrolling the List does.
        for (let k = 0; k < 6; k++) {
          await p.evaluate((k) => document.querySelectorAll('[data-sheet-list] .row, [data-print]')[k * 2]?.scrollIntoView({ block: 'center' }), k);
          await p.waitForTimeout(150);
        }
        await p.waitForTimeout(400);
        const r = await p.evaluate((view) => {
          const box = view === 'list' ? '[data-sheet-list] .row' : '[data-print="sheet"]';
          const take = (el) => {
            const img = el.querySelector('img[data-poster]');
            const use = el.querySelector('svg[data-poster] use');
            const vis = (x) => x && x.offsetParent !== null;
            return {
              name: el.getAttribute('aria-label') ?? el.querySelector('.print-name')?.textContent.replace(/\s+/g, ' ').trim(),
              cover: img ? { src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, alt: img.getAttribute('alt'), shown: vis(img) && getComputedStyle(img).opacity !== '0' } : null,
              strip: use ? use.getAttribute('href') : null,
              failed: el.closest('[data-print], .row')?.querySelector('[data-failed]') !== null || el.hasAttribute('data-failed') || !!el.querySelector('.print[data-failed]'),
              failedText: [...el.querySelectorAll('.print-failed')].filter((x) => getComputedStyle(x).display !== 'none').map((x) => x.textContent),
              veil: [...el.querySelectorAll('.print-veil')].some((v) => getComputedStyle(v).opacity === '1'),
              text: el.textContent.replace(/\s+/g, ' ').trim(),
            };
          };
          return { view, items: [...document.querySelectorAll(box)].map(take), enl: [...document.querySelectorAll('[data-print="enl"]')].map(take) };
        }, view);
        rows[`a1-${prof}-${view}`] = r;
        const items = r.items;
        const check = (it, i, where) => {
          const want = ['/fixtures/cover-1.png', '/fixtures/cover-2.png', '', '/fixtures/cover-3.png', '/fixtures/missing.png'][i];
          if (!/^\d+A, \[PLACEHOLDER: [^\]]+\]$/.test(it.name ?? '')) note('A1', `${prof} ${where} ${i + 1}: name "${it.name}" is not '{frame}, {token title}'`);
          if (want === '') {
            if (!it.strip || it.cover) note('A1', `${prof} ${where} ${i + 1}: cover '' shows ${it.cover ? 'a cover' : 'nothing'}, not its strip`);
          } else if (want.includes('missing')) {
            if (!it.failed || !it.veil) note('A1', `${prof} ${where} ${i + 1}: a failed cover is not the undeveloped print (${JSON.stringify(it)})`);
            if (where === 'list' && it.failedText.length) note('A1', `${prof} list ${i + 1}: the failed List row gained text`);
            if (where !== 'list' && !it.failedText.includes("Image didn't load.")) note('A1', `${prof} ${where} ${i + 1}: no "Image didn't load."`);
          } else if (!it.cover || it.cover.src !== want || !it.cover.loaded || !it.cover.shown || it.cover.alt !== '') note('A1', `${prof} ${where} ${i + 1}: the sourced cover does not show (${JSON.stringify(it.cover)})`);
        };
        items.forEach((it, i) => check(it, i, view));
        if (view === 'sheet') r.enl.forEach((it, k) => check(it, [0, 2, 4][k], 'enlargement'));
        await ctx.close();
      }
      for (const n of [5, 6, 7, 8]) {
        const ctx = await newContext(prof, 'reduced');
        const p = await ctx.newPage();
        await p.goto(`${srv.base}/fixture-n${n}/?view=sheet`, { waitUntil: 'load' });
        await waitSettled(p, 12000);
        const r = await p.evaluate(() => {
          const items = [...document.querySelectorAll('[data-sheet-grid] > li')];
          return { count: items.length, empty: items.filter((li) => { const c = li.querySelector('.print-card'); return !c || c.offsetWidth < 1 || c.offsetHeight < 1 || !c.querySelector('[data-poster]'); }).length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        rows[`n${n}-${prof}`] = r;
        if (r.count !== n || r.empty || r.overflow) note('L2', `${prof} n=${n}: ${JSON.stringify(r)}`);
      }
    }
  } finally {
    await closeBrowsers();
    await srv.close();
  }
}
if (!o.keep) rmSync(dir, { recursive: true, force: true });
// The tree it ran from is untouched (gate F4).
const manifestAfter = existsSync(MANIFEST) ? readFileSync(MANIFEST) : null;
const treeIntact = manifestBefore === null ? manifestAfter === null : manifestAfter !== null && manifestBefore.equals(manifestAfter);
rows.treeManifest = { path: MANIFEST, intact: treeIntact, bytesBefore: manifestBefore?.length ?? null, bytesAfter: manifestAfter?.length ?? null };
if (!treeIntact) {
  note('tree', `the run rewrote ${MANIFEST} (${manifestBefore?.length} -> ${manifestAfter?.length} B); put back`);
  if (manifestBefore) writeFileSync(MANIFEST, manifestBefore);
}
const pass = Object.keys(fails).length === 0;
const summary = `${alt ? `tokens-only rebuild: ${fails.L1 ? 'FAIL' : 'the frames follow the altered layout.*'}` : `A1 ${fails.A1 ? 'fail' : 'pass'}, L2 counts ${fails.L2 ? 'fail' : 'pass'}`}; the tree's manifest ${treeIntact ? 'untouched' : 'REWRITTEN (put back)'}`;
if (o.out) {
  mkdirSync(String(o.out), { recursive: true });
  writeFileSync(join(String(o.out), `fixtures${alt ? '-tokens-alt' : ''}${plant ? `-plant-${plant}` : ''}.json`), JSON.stringify({ schema: 1, instrument: 'w-s2/fixtures', alt, plant, altLayout: alt ? ALT_LAYOUT : null, pass, summary, fails, rows }, null, 2));
}
console.log(`fixtures: ${pass ? 'PASS' : 'FAIL'}  ${summary}`);
for (const [k, v] of Object.entries(fails)) console.log(`  ${k}: ${v.slice(0, 4).join(' | ')}`);
process.exit(pass ? 0 : 1);
