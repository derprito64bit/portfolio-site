// W-V1 A1, A4 and A15 on the built dist/ (GPU-free; npm run build first): `npm run test:w-v1-dist`.
//   A1   /work/<slug>/ for every project, whole without JS: h1, meta (role, year, tools), blurb, body, the roll, an empty
//        #honours slot, previous and next links; each print a <figure> with an <img> (width, height, srcset, sizes from
//        its width fraction, alt) or a typed placeholder box, and its caption strip; noindex with a placeholder; no EVF
//        markup.
//   A4   every srcset file exists in AVIF and WebP, on the 480/800/1280/1920 ladder and never wider than the source; the
//        LQIP (300 B or less) inline for the first 3 prints only; nothing of the fixtures in git.
//   A15  the LCP candidate (the first print's img: data-lcp="print-1", fetchpriority="high", never lazy); size-limit has
//        a JS (150 kB) and an HTML (16 kB) row for every /work/<slug>/, and an inflated project page fails its HTML row.
// The checks are plain functions of a page's HTML, so the negative controls at the end run them on planted pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(import.meta.dirname, '../..');
const DIST = join(ROOT, 'dist');
const MANIFEST = join(ROOT, 'node_modules/.cache/portfolio-build/vite-manifest.json');
const built = existsSync(join(DIST, 'work/project-01/index.html')) && existsSync(MANIFEST);
const projects = JSON.parse(readFileSync(join(ROOT, 'content/projects.json'), 'utf8')).projects;
const RUNGS = [480, 800, 1280, 1920];
const attr = (tag, name) => { const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag); return m ? m[1].replace(/&amp;/g, '&') : null; };

/** Every A1, A4 and A15 problem with one project page; [] when it is whole. */
export function pageProblems(html, p, i, { dist = DIST, total = projects.length } = {}) {
  const out = [];
  const need = (ok, msg) => { if (!ok) out.push(msg); };
  const label = `Project ${String(i + 1).padStart(2, '0')}`;
  need(new RegExp(`<h1[^>]*>${label}</h1>`).test(html), 'h1 with the label');
  for (const k of ['Role', 'Year', 'Tools']) need(new RegExp(`<dt class="mono">${k}</dt>`).test(html), `meta ${k}`);
  need(/class="pj__blurb"/.test(html), 'blurb');
  need((html.match(/<div class="pj__body">([\s\S]*?)<\/div>/)?.[1].match(/<p>/g) ?? []).length === p.body.length, 'body paragraphs');
  need(/<section class="roll"[^>]*data-roll/.test(html), 'the roll');
  need(/<div class="pj__honours" id="honours" data-honours><\/div>/.test(html), 'an empty #honours slot');
  const prev = projects[(i - 1 + total) % total].slug, next = projects[(i + 1) % total].slug;
  need(new RegExp(`<a href="/work/${prev}/" rel="prev"`).test(html) && new RegExp(`<a href="/work/${next}/" rel="next"`).test(html), 'previous and next links');
  need(/<meta name="robots" content="noindex"/.test(html) === p.placeholder, 'noindex exactly when a placeholder');
  need(!/id="(evf|intro)"|<canvas|data-raise|class="frame"/.test(html), 'no EVF markup');
  const figs = [...html.matchAll(/<figure class="print"([^>]*)>([\s\S]*?)<\/figure>/g)];
  need(figs.length === p.media.length, `${figs.length} figures for ${p.media.length} media`);
  if (!p.media.length) need(/class="roll__empty"><span class="ph">\[PLACEHOLDER: media\]<\/span>/.test(html), 'an empty roll says [PLACEHOLDER: media]');
  figs.forEach(([, fattrs, body], k) => {
    const n = k + 1;
    const at = `#print-${String(n).padStart(2, '0')}`;
    const img = /<img\b[^>]*>/.exec(body)?.[0];
    const box = /class="print__box"><span class="ph">\[PLACEHOLDER: [^\]]+\]<\/span>/.test(body);
    need(Boolean(img) || box, `${at}: an img or a typed placeholder box`);
    need(/<figcaption class="print__strip"><span class="print__n">\d\d<\/span><span class="print__cap">/.test(body), `${at}: the caption strip`);
    need((/--lqip:url\(data:image\/webp;base64,[A-Za-z0-9+/=]+\)/.test(fattrs)) === (k < 3), `${at}: the LQIP inline for the first 3 only`);
    const lq = /--lqip:url\(data:image\/webp;base64,([A-Za-z0-9+/=]+)\)/.exec(fattrs);
    if (lq) need(Buffer.from(lq[1], 'base64').length <= 300, `${at}: LQIP <= 300 B`);
    if (!img) return;
    const w = Number(attr(img, 'width')), h = Number(attr(img, 'height'));
    need(w > 0 && h > 0, `${at}: width and height`);
    const wf = Number(attr(`<x${fattrs}>`, 'data-wf')), pf = Number(attr(`<x${fattrs}>`, 'data-pf'));
    const sizes = attr(img, 'sizes') ?? '';
    need(sizes.includes(`* ${Math.round(wf * 1000) / 1000})`) && sizes.includes(`* ${Math.round(pf * 1000) / 1000})`), `${at}: sizes from its width fraction (${sizes})`);
    need(attr(img, 'alt') !== null && (attr(img, 'alt') !== '' || p.media[k].decorative), `${at}: alt`);
    const sets = { webp: attr(img, 'srcset'), avif: attr(/<source type="image\/avif"[^>]*>/.exec(body)?.[0] ?? '', 'srcset') };
    for (const [fmt, set] of Object.entries(sets)) {
      need(Boolean(set), `${at}: a ${fmt} srcset`);
      for (const part of (set ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
        const [url, d] = part.split(/\s+/);
        const rung = Number(d.replace('w', ''));
        need(url.endsWith(`.${fmt}`), `${at}: ${url} is ${fmt}`);
        need(RUNGS.includes(rung) || (rung === w && w < 480), `${at}: ${rung} is a ladder rung`);
        need(rung <= w, `${at}: ${rung} never wider than the source ${w}`);
        need(existsSync(join(dist, url)), `${at}: ${url} exists in dist`);
      }
    }
    const lcp = k === 0;
    need((attr(img, 'data-lcp') === 'print-1') === lcp, `${at}: data-lcp="print-1" on the first print only`);
    if (lcp) need(attr(img, 'fetchpriority') === 'high' && attr(img, 'loading') !== 'lazy', `${at}: the first print is fetchpriority high, never lazy`);
    else need(attr(img, 'loading') === 'lazy', `${at}: lazy below the first print`);
  });
  return out;
}

test('A1, A4, A15: every /work/<slug>/ page is whole and its media is on the ladder', { skip: !built && 'needs npm run build' }, () => {
  projects.forEach((p, i) => {
    const file = join(DIST, 'work', p.slug, 'index.html');
    assert.ok(existsSync(file), `${file} built`);
    assert.deepEqual(pageProblems(readFileSync(file, 'utf8'), p, i), [], p.slug);
  });
});

test('A4: the fixtures are build output only (never in git), and media.json is the generated manifest', () => {
  const r = spawnSync('git', ['ls-files', 'public/media', 'dist'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.stdout.split('\n').filter((l) => /fixtures/.test(l)).length, 0, 'no fixture in git');
  const m = JSON.parse(readFileSync(join(ROOT, 'src/lib/content/media.json'), 'utf8'));
  assert.equal(m.schema, 1);
  assert.match(m.note, /generated by scripts\/build\/images\.mjs/);
});

function sizeLimit(dist) {
  const r = spawnSync(process.execPath, [join(ROOT, 'node_modules/size-limit/bin.js'), '--json'], {
    cwd: ROOT, env: { ...process.env, PORTFOLIO_DIST: dist, PORTFOLIO_MANIFEST: MANIFEST }, encoding: 'utf8',
  });
  let rows = [];
  try { rows = JSON.parse(r.stdout); } catch { /* the failure is in stderr */ }
  return { code: r.status, rows, err: r.stderr };
}

test('A15: size-limit holds a 150 kB JS row and a 16 kB HTML row for every project page; an inflated page fails its row', { skip: !built && 'needs npm run build' }, () => {
  const { budget, readBudgets } = require('../../scripts/check/budgets.cjs');
  const b = readBudgets();
  assert.equal(budget('site.bytesGz.totalJsProject', b), 150000);
  assert.equal(budget('site.bytesGz.htmlProject', b), 16000);
  process.env.PORTFOLIO_DIST = DIST;
  const rows = require('../../.size-limit.cjs');
  for (const p of projects) {
    const js = rows.find((r) => r.name === `total JS (/work/${p.slug}/)`);
    const html = rows.find((r) => r.name === `HTML (/work/${p.slug}/)`);
    assert.equal(js?.limit, '150000 B', `${p.slug}: the JS row`);
    assert.equal(html?.limit, '16000 B', `${p.slug}: the HTML row`);
  }
  const dir = mkdtempSync(join(tmpdir(), 'wv1-size-'));
  try {
    cpSync(DIST, dir, { recursive: true });
    const ok = sizeLimit(dir);
    assert.equal(ok.code, 0, `the untouched copy passes: ${ok.err}`);
    const f = join(dir, 'work/project-06/index.html');
    writeFileSync(f, `${readFileSync(f, 'utf8')}<!-- ${randomBytes(16000).toString('base64')} -->`);
    const bad = sizeLimit(dir);
    assert.notEqual(bad.code, 0, 'the inflated copy fails');
    assert.deepEqual(bad.rows.filter((r) => r.passed === false).map((r) => r.name), ['HTML (/work/project-06/)']);
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* a temp dir */ }
  }
});

// Negative controls: each planted defect in a real page must be reported.
test('negative controls: the page checks catch each planted defect', { skip: !built && 'needs npm run build' }, () => {
  const i = 5, p = projects[i];
  const real = readFileSync(join(DIST, 'work', p.slug, 'index.html'), 'utf8');
  const plants = [
    ['no h1', (h) => h.replace(/<h1([^>]*)>/, '<h2$1>').replace('</h1>', '</h2>'), /h1/],
    ['a lost figure', (h) => h.replace(/<figure class="print"[\s\S]*?<\/figure>/, ''), /figures for/],
    ['an img without width', (h) => h.replace(/(<img\b[^>]*?)\swidth="\d+"/, '$1'), /width and height/],
    ['a lazy first print', (h) => h.replace('fetchpriority="high"', 'loading="lazy"'), /fetchpriority high/],
    ['an LQIP on print 4', (h) => h.replace(/(<figure class="print" id="print-04"[^>]*style=")/, '$1--lqip:url(data:image/webp;base64,AAAA);'), /first 3 only/],
    ['an upscaled rung', (h) => h.replace(/03-mid-800\.webp 800w/, '03-mid-800.webp 1920w'), /never wider|ladder rung/],
    ['a missing file', (h) => h.replace('01-small-480.avif', '01-small-481.avif'), /exists in dist/],
    ['honours not empty', (h) => h.replace('data-honours></div>', 'data-honours><p>x</p></div>'), /#honours/],
    ['EVF markup', (h) => h.replace('<main', '<canvas></canvas><main'), /no EVF markup/],
    ['no noindex', (h) => h.replace('<meta name="robots" content="noindex">', ''), /noindex/],
    ['no strip', (h) => h.replace('<figcaption class="print__strip">', '<figcaption>'), /caption strip/],
  ];
  assert.deepEqual(pageProblems(real, p, i), [], 'the real page is clean');
  for (const [name, plant, re] of plants) {
    const bad = plant(real);
    assert.notEqual(bad, real, `${name}: the plant applies`);
    const found = pageProblems(bad, p, i);
    assert.ok(found.some((x) => re.test(x)), `${name}: caught (got ${JSON.stringify(found)})`);
  }
});
