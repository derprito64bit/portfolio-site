// W-V1 A3 and A4: content model v3 (D-042) and the image ladder (D-056). GPU-free: `npm run test:unit`.
//   - validate fails on each D-042 case (a non-placeholder media without a file, a video without a poster, audio without
//     captions, an honour naming a missing project) and on the v3 field rules; the real content passes;
//   - the file wins over a typed size (src/lib/content/prints.ts);
//   - images.mjs derives AVIF and WebP at 480, 800, 1280 and 1920, never upscaled, with an LQIP of 300 B or less, and
//     the build without originals keeps the committed manifest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from '../../../src/lib/content/validate.js';
import { printsOf } from '../../../src/lib/content/prints.ts';
import { main as imagesMain, derive } from '../../../scripts/build/images.mjs';
import { plan, chartSvg } from '../../../scripts/build/media-fixtures.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(ROOT, 'content', f), 'utf8'));
const base = () => ({ projects: read('projects.json'), honours: read('honours.json'), profile: read('profile.json'), lookIds: read('tokens.json').filmLooks.ids, media: { media: {} } });

/** A confirmed project with one real image whose file is in the manifest: valid. */
function confirmed() {
  const input = base();
  const p = input.projects.projects[0];
  Object.assign(p, {
    title: 'Real title', role: 'Real role', year: '2025', blurb: 'Real blurb.', body: ['Real body.'], kind: 'software', placeholder: false, source: 'owner-facts.md#test',
  });
  p.media = [{ type: 'image', src: `media/${p.slug}/shot.png`, w: 1920, h: 1200, alt: 'A screenshot.', caption: 'One caption.', poster: '', captions: '', audio: false, decorative: false, scale: 'normal', loop: false, placeholder: false }];
  input.media = { media: { [`media/${p.slug}/shot.png`]: { type: 'image', w: 1920, h: 1200, files: [], lqip: '' } } };
  return input;
}
const errorsOf = (input) => validateContent(input).errors;
const has = (errs, re) => assert.ok(errs.some((e) => re.test(e)), `expected ${re} in:\n  ${errs.join('\n  ')}`);

test('the real content, and a confirmed project with its file, are valid', () => {
  assert.deepEqual(errorsOf(base()), []);
  assert.deepEqual(errorsOf(confirmed()), []);
});

test('D-042: a non-placeholder media without a file fails', () => {
  const a = confirmed();
  a.media.media = {};
  has(errorsOf(a), /D-042: a non-placeholder media without a file/);
  const b = confirmed();
  b.projects.projects[0].media[0].src = '';
  has(errorsOf(b), /non-placeholder media without a file|empty src on a confirmed project/);
});

test('D-042: a video without a poster fails', () => {
  const a = confirmed();
  const p = a.projects.projects[0];
  p.media[0] = { ...p.media[0], type: 'video', src: `media/${p.slug}/clip.mp4`, poster: '' };
  a.media.media[`media/${p.slug}/clip.mp4`] = { type: 'video', file: '/media/x.mp4' };
  has(errorsOf(a), /D-042: a video without a poster/);
  p.media[0].poster = `media/${p.slug}/clip.png`;
  has(errorsOf(a), /D-042: the poster has no file/);
  a.media.media[`media/${p.slug}/clip.png`] = { type: 'poster', w: 1280, h: 720, files: [], lqip: '' };
  assert.deepEqual(errorsOf(a), [], 'with a poster and its file the video is valid');
});

test('D-042: audio without captions fails', () => {
  const a = confirmed();
  const p = a.projects.projects[0];
  p.media[0] = { ...p.media[0], type: 'video', src: `media/${p.slug}/clip.mp4`, poster: `media/${p.slug}/clip.png`, audio: true, captions: '' };
  a.media.media[`media/${p.slug}/clip.mp4`] = { type: 'video', file: '/media/x.mp4' };
  a.media.media[`media/${p.slug}/clip.png`] = { type: 'poster', w: 1280, h: 720, files: [], lqip: '' };
  has(errorsOf(a), /needs captions/);
  // a placeholder clip with audio fails the same way
  const b = base();
  const m = b.projects.projects.find((x) => x.media.some((y) => y.type === 'video')).media.find((y) => y.type === 'video');
  m.audio = true;
  m.loop = false;
  has(errorsOf(b), /needs captions/);
});

test('D-042: an honour naming a missing project fails', () => {
  const a = base();
  a.honours.awards[0].project = 'project-99';
  has(errorsOf(a), /unknown project slug/);
});

test('v3 fields: whole w and h together, a known scale, loop on video only and silent, src under its project', () => {
  const m = (f) => { const a = base(); f(a.projects.projects[0].media[0], a); return errorsOf(a); };
  has(m((x) => { x.w = 19.5; }), /whole number/);
  has(m((x) => { x.w = -1; }), /whole number/);
  has(m((x) => { x.h = 0; }), /declared together/);
  has(m((x) => { x.scale = 'huge'; }), /one of hero, normal, detail/);
  has(m((x) => { x.loop = true; }), /loop applies to video only/);
  has(m((x) => { delete x.placeholder; }), /missing/);
  const c = confirmed();
  c.projects.projects[0].media[0].src = 'media/project-02/shot.png';
  has(errorsOf(c), /media\/project-01\/<file>/);
  const d = base();
  const v = d.projects.projects.find((x) => x.media.some((y) => y.type === 'video')).media.find((y) => y.type === 'video');
  v.audio = true;
  has(errorsOf(d), /no audio track/);
});

test('the file wins over a typed size; placeholders keep their declared size and use the test chart ladder', () => {
  const media = [
    { type: 'image', src: 'media/p/a.png', w: 1000, h: 1000, alt: 'a', caption: '', poster: '', captions: '', audio: false, decorative: false, scale: 'normal', loop: false, placeholder: false },
    { type: 'image', src: '', w: 1170, h: 2532, alt: '[PLACEHOLDER: x]', caption: '', poster: '', captions: '', audio: false, decorative: false, scale: 'normal', loop: false, placeholder: true },
    { type: 'image', src: '', w: 0, h: 0, alt: '[PLACEHOLDER: x]', caption: '', poster: '', captions: '', audio: false, decorative: false, scale: 'normal', loop: false, placeholder: true },
    { type: 'video', src: '', w: 1280, h: 720, alt: '[PLACEHOLDER: x]', caption: '', poster: '', captions: '', audio: false, decorative: false, scale: 'normal', loop: true, placeholder: true },
  ];
  const manifest = { media: { 'media/p/a.png': { type: 'image', w: 2560, h: 1080, files: [{ rung: 480, h: 203, cls: 'small', avif: '/media/p/a-small-480.avif', webp: '/media/p/a-small-480.webp' }], lqip: 'data:image/webp;base64,AA==' } } };
  const fixtures = { entries: { 'p/02': { w: 1170, h: 2532, lqip: 'data:image/webp;base64,BB==' }, 'p/04': { w: 1280, h: 720, lqip: 'data:image/webp;base64,CC==' } } };
  const prints = printsOf('p', media, manifest, fixtures);
  assert.deepEqual([prints[0].w, prints[0].h], [2560, 1080], 'the real file size, not the typed 1000 x 1000');
  assert.equal(prints[0].size.bucket, 'wide');
  assert.equal(prints[0].files[0].avif, '/media/p/a-small-480.avif');
  assert.deepEqual([prints[1].w, prints[1].h], [1170, 2532]);
  assert.equal(prints[1].files[0].avif, '/media/fixtures/p/02-small-480.avif');
  assert.deepEqual([prints[2].w, prints[2].h], [1200, 800], 'no size and no file: 3:2');
  assert.equal(prints[2].files, null, 'no chart rendered: a typed placeholder box');
  assert.equal(prints[3].files[0].cls, 'poster');
  assert.equal(prints[3].loop, true);
  assert.deepEqual(prints.map((p) => p.lqip !== ''), [true, true, false, false], 'LQIP inline for the first 3 prints only (the third has none)');
  assert.deepEqual(prints.map((p) => p.id), ['print-01', 'print-02', 'print-03', 'print-04']);
});

test('images.mjs: the ladder from MEDIA_SRC, never upscaled, LQIP <= 300 B; without originals the manifest stands', async () => {
  const sharp = (await import('sharp')).default;
  sharp.cache(false); // Windows: libvips keeps files open while cached, which blocks the cleanup
  const dir = mkdtempSync(join(tmpdir(), 'wv1-images-'));
  try {
    const src = join(dir, 'assets');
    mkdirSync(join(src, 'p'), { recursive: true });
    await sharp({ create: { width: 1000, height: 2200, channels: 3, background: '#335577' } }).png().toFile(join(src, 'p', 'tall.png'));
    await sharp({ create: { width: 2400, height: 1500, channels: 3, background: '#775533' } }).withMetadata({ orientation: 6 }).jpeg().toFile(join(src, 'p', 'turned.jpg'));
    const projects = [{ slug: 'p', media: [
      { type: 'image', src: 'media/p/tall.png', w: 10, h: 10, placeholder: false },
      { type: 'image', src: 'media/p/turned.jpg', w: 0, h: 0, placeholder: false },
      { type: 'image', src: '', w: 800, h: 600, placeholder: true },
    ] }];
    const out = join(dir, 'public');
    const m = await derive({ projects, mediaSrc: src, outDir: out });
    const tall = m.media['media/p/tall.png'];
    assert.deepEqual([tall.w, tall.h], [1000, 2200], 'the real size');
    assert.deepEqual(tall.files.map((f) => f.rung), [480, 800], 'never upscaled past 1000');
    assert.deepEqual(tall.files.map((f) => f.cls), ['small', 'extreme'], 'the first print, taller than 1:2: extreme');
    const turned = m.media['media/p/turned.jpg'];
    assert.deepEqual([turned.w, turned.h], [1500, 2400], 'EXIF orientation 6 swaps the sides');
    assert.deepEqual(turned.files.map((f) => f.rung), [480, 800, 1280]);
    const written = readdirSync(join(out, 'p')).sort();
    assert.equal(written.length, (2 + 3) * 2, 'AVIF and WebP for every rung');
    assert.ok(written.every((f) => /\.(avif|webp)$/.test(f)), 'no JPEG or PNG in the output');
    for (const f of written.filter((x) => x.endsWith('.webp'))) {
      const meta = await sharp(join(out, 'p', f)).metadata();
      assert.equal(meta.exif, undefined, `${f} carries no EXIF`);
      assert.ok(meta.width <= 1500, `${f} is not upscaled`);
    }
    for (const e of [tall, turned]) assert.ok(Buffer.from(e.lqip.split(',')[1], 'base64').length <= 300, 'LQIP <= 300 B');
    assert.equal(m.media['media/p/'], undefined, 'placeholders are not derived');

    // the build with no originals keeps the committed manifest
    const root = join(dir, 'repo');
    mkdirSync(join(root, 'content'), { recursive: true });
    mkdirSync(join(root, 'src/lib/content'), { recursive: true });
    writeFileSync(join(root, 'content/projects.json'), JSON.stringify({ projects }));
    const manifest = join(root, 'src/lib/content/media.json');
    writeFileSync(manifest, `${JSON.stringify(m, null, 2)}\n`);
    const before = readFileSync(manifest, 'utf8');
    const line = await imagesMain({ root, mediaSrc: join(dir, 'nowhere'), manifest, outDir: join(root, 'public/media') });
    assert.match(line, /the committed media\.json stands/);
    assert.equal(readFileSync(manifest, 'utf8'), before, 'unchanged');
    assert.equal(existsSync(join(root, 'public/media')), false, 'nothing derived');
    writeFileSync(manifest, '{"schema":1,"media":{}}\n');
    await assert.rejects(imagesMain({ root, mediaSrc: join(dir, 'nowhere'), manifest, check: true }), /lacks media\/p\/tall\.png/);
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* a temp dir; the OS reaps it */ }
  }
});

test('media-fixtures: one chart per placeholder image or video, D-045 counts, the size in the chart', () => {
  const projects = read('projects.json').projects;
  assert.deepEqual(projects.map((p) => p.media.length), [6, 1, 2, 4, 8, 12, 3, 0], 'D-045 counts');
  const charts = plan(projects);
  assert.equal(charts.length, 36);
  const p6 = charts.filter((c) => c.slug === 'project-06');
  assert.deepEqual(p6.filter((c) => c.poster).map((c) => c.n), [2, 5, 9], 'loop videos at 06: 2, 5, 9');
  assert.deepEqual(charts.filter((c) => c.slug === 'project-02').map((c) => c.poster), [true], '02: 1 is a loop video');
  const svg = chartSvg({ W: 480, H: 300, w: 1920, h: 1200, n: 1, tint: '#7A1F2B', poster: false, loop: false });
  assert.match(svg, /1920 × 1200/);
  assert.equal(chartSvg({ W: 480, H: 300, w: 1920, h: 1200, n: 1, tint: '#7A1F2B', poster: false, loop: false }), svg, 'deterministic');
});

// Negative controls: each D-042 rule removed from a copy of validate.js; the input that rule guards must then pass, so
// the tests above (which demand the error) would fail on that mutant.
test('negative controls: every D-042 rule, removed, lets its bad input through', async () => {
  const { pathToFileURL } = await import('node:url');
  const src = readFileSync(join(ROOT, 'src/lib/content/validate.js'), 'utf8');
  const noFile = () => { const a = confirmed(); a.media.media = {}; return a; };
  const noPoster = () => { const a = confirmed(); const p = a.projects.projects[0]; p.media[0] = { ...p.media[0], type: 'video', src: `media/${p.slug}/clip.mp4`, poster: '' }; a.media.media[`media/${p.slug}/clip.mp4`] = { type: 'video' }; return a; };
  const noCaptions = () => { const b = base(); const m = b.projects.projects.find((x) => x.media.some((y) => y.type === 'video')).media.find((y) => y.type === 'video'); m.audio = true; m.loop = false; return b; };
  const badHonour = () => { const a = base(); a.honours.awards[0].project = 'project-99'; return a; };
  const MUTANTS = [
    ['no file', 'if (m.placeholder === false && !hasFile(m.src)) err(', 'if (false) err(', noFile, /without a file/],
    ['no poster', "if (m.type !== 'image' && m.placeholder === false && !m.poster) err(", 'if (false) err(', noPoster, /without a poster/],
    ['no captions', "if (m.type === 'video' && m.audio && !/\\.vtt$/i.test(m.captions || '')) err(", 'if (false) err(', noCaptions, /captions/],
    ['no honour check', 'if (h.project && !projectSlugs.has(h.project)) err(', 'if (false) err(', badHonour, /unknown project slug/],
  ];
  const dir = mkdtempSync(join(tmpdir(), 'wv1-validate-'));
  try {
    for (const [name, from, to, input, re] of MUTANTS) {
      assert.ok(src.includes(from), `${name}: the rule is in validate.js`);
      const file = join(dir, `validate-${name.replace(/\W+/g, '-')}.js`);
      writeFileSync(file, src.replace(from, to));
      const M = await import(pathToFileURL(file).href);
      assert.ok(validateContent(input()).errors.some((e) => re.test(e)), `${name}: the real rule catches it`);
      assert.ok(!M.validateContent(input()).errors.some((e) => re.test(e)), `${name}: the mutant lets it through`);
    }
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ }
  }
});

// fix-pass B5
// f24: a model is copied like a video and sized by its poster (D-042: a video's size comes from its poster; types are
// image, video and model). The poster is 16:9, never the 3:2 fallback, so the size assertion means something.
test('D-042: a confirmed model derives from its .glb and poster, validates, and its print is sized by the poster', async () => {
  const sharp = (await import('sharp')).default;
  sharp.cache(false); // Windows: libvips keeps files open while cached, which blocks the cleanup
  const input = confirmed();
  const p = input.projects.projects[0];
  p.media = [{ type: 'model', src: `media/${p.slug}/m.glb`, poster: `media/${p.slug}/m.png`, w: 0, h: 0, alt: 'A model.', caption: '', captions: '', audio: false, decorative: false, scale: 'normal', loop: false, placeholder: false }];
  const glbKey = `media/${p.slug}/m.glb`;
  const pngKey = `media/${p.slug}/m.png`;
  const dir = mkdtempSync(join(tmpdir(), 'wv1-model-'));
  try {
    const mediaSrc = join(dir, 'assets');
    mkdirSync(join(mediaSrc, p.slug), { recursive: true });
    writeFileSync(join(mediaSrc, p.slug, 'm.glb'), Buffer.from('glTF\x02\x00\x00\x00'));
    await sharp({ create: { width: 1600, height: 900, channels: 3, background: '#446688' } }).png().toFile(join(mediaSrc, p.slug, 'm.png'));
    const outDir = join(dir, 'public');
    const m = await derive({ projects: input.projects.projects, mediaSrc, outDir });
    const glb = m.media[glbKey];
    assert.equal(glb?.type, 'model', 'the .glb is in the manifest as a model');
    assert.match(glb.file, new RegExp(`^/media/${p.slug}/m-[0-9a-f]{10}\.glb$`), 'copied under its own extension');
    assert.ok(existsSync(join(outDir, p.slug, basename(glb.file))), 'the .glb is written to public/media');
    assert.equal(glb.poster, pngKey);
    assert.equal(m.media[pngKey]?.type, 'poster');
    assert.deepEqual([m.media[pngKey].w, m.media[pngKey].h], [1600, 900], "the poster's real size");
    assert.deepEqual(validateContent({ ...input, media: m }).errors, [], 'a confirmed model with its files is valid');
    const pv = printsOf(p.slug, p.media, m, null)[0];
    assert.deepEqual([pv.w, pv.h], [1600, 900], "sized by its poster, not the 3:2 fallback");
    assert.notEqual(pv.files, null, "the poster's ladder, not a typed placeholder box");
    assert.equal(pv.video, '', 'playback stays video-only: no .glb in <video data-src>');
    assert.equal(pv.type, 'model');
    const noPoster = { media: { ...m.media } };
    delete noPoster.media[pngKey];
    has(validateContent({ ...input, media: noPoster }).errors, /D-042: the poster has no file/);
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* a temp dir; the OS reaps it */ }
  }
});

// f12: a confirmed clip's .vtt is copied through the build, listed in media.json, and reaches the print as a site URL,
// only for a clip with audio (validate allows captions on a silent clip, which then shows none).
test("D-042: a video's captions file reaches the page", async () => {
  const sharp = (await import('sharp')).default;
  sharp.cache(false);
  const dir = mkdtempSync(join(tmpdir(), 'wv1-captions-'));
  try {
    const src = join(dir, 'src');
    mkdirSync(join(src, 'p'), { recursive: true });
    writeFileSync(join(src, 'p', 'clip.mp4'), Buffer.from('not really an mp4'));
    writeFileSync(join(src, 'p', 'clip.vtt'), 'WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n');
    await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#335577' } }).png().toFile(join(src, 'p', 'clip.png'));
    const clip = { type: 'video', src: 'media/p/clip.mp4', poster: 'media/p/clip.png', captions: 'media/p/clip.vtt', audio: true, loop: false, placeholder: false, w: 0, h: 0, scale: 'normal', alt: 'a', caption: '', decorative: false };
    const projects = [{ slug: 'p', media: [clip] }];
    const out = join(dir, 'public');
    const m = await derive({ projects, mediaSrc: src, outDir: out });
    const vtt = m.media['media/p/clip.vtt'];
    assert.equal(vtt?.type, 'captions', 'the .vtt is in the manifest');
    assert.match(vtt.file, /^\/media\/p\/clip-[0-9a-f]{10}\.vtt$/);
    assert.ok(existsSync(join(out, 'p', basename(vtt.file))), 'the .vtt is written to public/media');
    assert.equal(m.media['media/p/clip.mp4']?.type, 'video', 'the video stays');
    assert.equal(m.media['media/p/clip.png']?.type, 'poster', 'the poster stays');
    assert.equal(printsOf('p', projects[0].media, m, null)[0].captions, vtt.file, "the print carries the .vtt's site URL");
    assert.equal(printsOf('p', [{ ...clip, audio: false }], m, null)[0].captions, '', 'a silent clip shows no captions');
    assert.equal(printsOf('p', [{ ...clip, captions: '' }], m, null)[0].captions, '', 'no captions, none');
    const noVtt = { media: { ...m.media } };
    delete noVtt.media['media/p/clip.vtt'];
    assert.equal(printsOf('p', [clip], noVtt, null)[0].captions, '', 'no manifest entry: never the authoring path');
    const quiet = await derive({ projects: [{ slug: 'p', media: [{ ...clip, captions: '', audio: false }] }], mediaSrc: src, outDir: out });
    assert.deepEqual(Object.keys(quiet.media).sort(), ['media/p/clip.mp4', 'media/p/clip.png'], 'empty captions add no key');
  } finally {
    try { rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* a temp dir; the OS reaps it */ }
  }
});

test('f12: captions sit under their project, and a confirmed clip names a captions file that exists', () => {
  const a = confirmed();
  const p = a.projects.projects[0];
  p.media[0] = { ...p.media[0], type: 'video', src: `media/${p.slug}/clip.mp4`, poster: `media/${p.slug}/clip.png`, audio: true, captions: 'media/project-99/clip.vtt' };
  a.media.media[`media/${p.slug}/clip.mp4`] = { type: 'video', file: '/media/x.mp4' };
  a.media.media[`media/${p.slug}/clip.png`] = { type: 'poster', w: 1280, h: 720, files: [], lqip: '' };
  has(errorsOf(a), new RegExp(`media/${p.slug}/<file>\\.vtt`));
  p.media[0].captions = `media/${p.slug}/clip.vtt`;
  has(errorsOf(a), /captions file has no file/);
  a.media.media[`media/${p.slug}/clip.vtt`] = { type: 'captions', file: '/media/x.vtt' };
  assert.deepEqual(errorsOf(a), [], 'with its captions file the clip is valid');
});
