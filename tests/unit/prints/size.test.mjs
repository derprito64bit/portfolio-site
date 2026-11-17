// W-V1 A6: the size rule (src/lib/prints/size.ts, D-044), every branch. GPU-free: `npm run test:unit`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as REAL from '../../../src/lib/prints/size.ts';
import { capClass, fallback, ladder, rungsFor, srcset, widest } from '../../../src/lib/prints/ladder.ts';

const SRC = fileURLToPath(new URL('../../../src/lib/prints/', import.meta.url));
/** Every rule below runs on the real module and on each mutant (the negative controls at the end). */
const RULES = [];
const rule = (name, fn) => { RULES.push([name, fn]); test(name, () => fn(REAL)); };

const near = (a, b, msg, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} != ${b}`);

rule('buckets by aspect, both edges of every band', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  assert.equal(bucketOf(0.79), 'portrait');
  assert.equal(bucketOf(0.8), 'square');
  assert.equal(bucketOf(1), 'square');
  assert.equal(bucketOf(1.25), 'square');
  assert.equal(bucketOf(1.2501), 'landscape');
  assert.equal(bucketOf(1.7), 'landscape');
  assert.equal(bucketOf(1.7001), 'wide');
});

rule('slots: wide 12, landscape 7, square 5, portrait 4; under 0.5 MP: 4', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  assert.equal(sizePrint({ w: 2560, h: 1080 }).span, 12);
  assert.equal(sizePrint({ w: 1920, h: 1200 }).span, 7);
  assert.equal(sizePrint({ w: 1080, h: 1080 }).span, 5);
  assert.equal(sizePrint({ w: 1170, h: 2532 }).span, 4);
  assert.equal(sizePrint({ w: 800, h: 600 }).span, 4, 'a small landscape (0.48 MP) gets 4');
  assert.equal(sizePrint({ w: 1000, h: 500 }).span, 12, 'exactly 0.5 MP is not small');
  assert.equal(sizePrint({ w: 999, h: 500 }).span, 4, 'just under 0.5 MP is small');
});

rule('f = 0.62 + 0.38 s, s = clamp(log2(px / 0.5 MP) / 4, 0, 1)', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  near(sizeScore(250_000), 0, 's clamps at 0');
  near(sizeScore(500_000), 0, 's is 0 at 0.5 MP');
  near(sizeScore(1_000_000), 0.25, 's at 1 MP');
  near(sizeScore(8_000_000), 1, 's is 1 at 8 MP');
  near(sizeScore(40_000_000), 1, 's clamps at 1');
  near(fill(500_000), 0.62, 'f at s = 0');
  near(fill(8_000_000), 1, 'f at s = 1');
  near(sizePrint({ w: 1920, h: 1200 }).f, 0.62 + 0.38 * (Math.log2((1920 * 1200) / 500_000) / 4), 'f for 1920 x 1200');
});

rule('scale: hero takes f = 1 and the widest slot (6, centred, for portrait and square); detail x 0.7', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  const lh = sizePrint({ w: 1920, h: 1200, scale: 'hero' });
  assert.deepEqual([lh.hero, lh.span, lh.f], [true, 12, 1]);
  const wh = sizePrint({ w: 4000, h: 1000, scale: 'hero' });
  assert.deepEqual([wh.span, wh.f], [12, 1]);
  const sh = sizePrint({ w: 1080, h: 1080, scale: 'hero' });
  assert.deepEqual([sh.span, sh.f], [6, 1]);
  const ph = sizePrint({ w: 3024, h: 4032, scale: 'hero' });
  assert.deepEqual([ph.span, ph.f], [6, 1]);
  const small = sizePrint({ w: 800, h: 600, scale: 'hero' });
  assert.equal(small.span, 12, 'a hero ignores the small-slot rule');
  const d = sizePrint({ w: 2560, h: 1080, scale: 'detail' });
  near(d.f, fill(2560 * 1080) * 0.7, 'detail multiplies f by 0.7');
  assert.equal(d.span, 12, 'detail keeps the slot');
  assert.equal(sizePrint({ w: 2560, h: 1080, scale: 'normal' }).hero, false);
});

rule('aspect clamps to 9:21 .. 21:9; extremes letterbox, never crop', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  const wide = sizePrint({ w: 4000, h: 1000 });
  near(wide.ar, AR_MAX, 'a 4:1 frame clamps to 21:9');
  assert.equal(wide.letterbox, true);
  const tall = sizePrint({ w: 500, h: 2000 });
  near(tall.ar, AR_MIN, 'a 1:4 frame clamps to 9:21');
  assert.equal(tall.letterbox, true);
  const ok = sizePrint({ w: 1170, h: 2532 });
  assert.equal(ok.letterbox, false);
  near(ok.ar, 1170 / 2532, 'inside the limits the frame keeps the image aspect');
});

rule('an entry without a size is 3:2 (ABSENT) at s = 0', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  assert.deepEqual(sizeOf({ w: 0, h: 0 }), { w: ABSENT.w, h: ABSENT.h });
  assert.deepEqual(sizeOf({ w: 1920, h: 0 }), { w: ABSENT.w, h: ABSENT.h });
  const p = sizePrint({ w: 0, h: 0 });
  near(p.r, 1.5, '3:2');
  assert.equal(p.bucket, 'landscape');
});

rule('the first print is the hero with 9 or more prints, not with 8; an explicit detail is never made the hero', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  const eight = pack(Array.from({ length: AUTO_HERO_AT - 1 }, () => ({ w: 1920, h: 1200 })));
  assert.equal(eight[0].hero, false);
  const nine = pack(Array.from({ length: AUTO_HERO_AT }, () => ({ w: 1920, h: 1200 })));
  assert.equal(nine[0].hero, true);
  assert.equal(nine[1].hero, false);
  const detailFirst = pack([{ w: 1920, h: 1200, scale: 'detail' }, ...Array.from({ length: 8 }, () => ({ w: 1920, h: 1200 }))]);
  assert.equal(detailFirst[0].hero, false);
});

rule('pack: rows in content order; a gap is filled only by the next print', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  // 7 then 7 cannot share a row; the 4 after them joins the second 7, never the first
  const p = pack([{ w: 1920, h: 1200 }, { w: 1920, h: 1200 }, { w: 1170, h: 2532 }]);
  assert.deepEqual(p.map((x) => x.row), [0, 1, 1]);
  // 4 + 4 + 4 fill a row; the next 4 starts a new one
  const q = pack(Array.from({ length: 4 }, () => ({ w: 1170, h: 2532 })));
  assert.deepEqual(q.map((x) => x.row), [0, 0, 0, 1]);
  assert.deepEqual(q.map((x) => x.col), [1, 5, 9, 1]);
  // a hero is alone in its row even when it would fit
  const h = pack([{ w: 1170, h: 2532 }, { w: 1080, h: 1080, scale: 'hero' }, { w: 1170, h: 2532 }]);
  assert.deepEqual(h.map((x) => x.row), [0, 1, 2]);
  assert.equal(h[1].col, 4, 'a 6-column hero is centred');
  assert.equal(h[1].justify, 'center');
  // a 12-column print is alone too
  const w = pack([{ w: 1170, h: 2532 }, { w: 2560, h: 1080 }]);
  assert.deepEqual(w.map((x) => x.row), [0, 1]);
  for (const x of [...p, ...q, ...h, ...w]) assert.ok(x.col >= 1 && x.col + x.span - 1 <= COLS, 'inside 12 columns');
});

rule('pack: the zigzag drops every second print in a row; spare columns go between; lone prints alternate sides', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  const p = pack([{ w: 1920, h: 1200 }, { w: 1170, h: 2532 }]);
  assert.deepEqual(p.map((x) => x.drop), [false, true]);
  assert.deepEqual(p.map((x) => x.col), [1, 9], 'first at 1, last ends at 12');
  assert.deepEqual(p.map((x) => x.justify), ['start', 'end']);
  const three = pack([{ w: 800, h: 600 }, { w: 800, h: 600 }, { w: 800, h: 600 }]);
  assert.deepEqual(three.map((x) => x.drop), [false, true, false]);
  assert.deepEqual(three.map((x) => x.justify), ['start', 'center', 'end']);
  const lone = pack([{ w: 1080, h: 1080 }, { w: 2560, h: 1080 }, { w: 1080, h: 1080 }, { w: 2560, h: 1080 }, { w: 1080, h: 1080 }]);
  assert.deepEqual(lone.map((x) => x.col), [1, 1, 8, 1, 1]);
  assert.deepEqual(lone.map((x) => x.justify), ['start', 'center', 'end', 'center', 'start']);
  assert.ok(lone.every((x) => !x.drop), 'a lone print never drops');
});

rule('widthFrac = span / 12 x f; frameWidth = min(widthFrac x roll, 80 svh x aspect); phone widths', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  const [p] = pack([{ w: 1920, h: 1200 }]);
  near(p.widthFrac, (7 / 12) * p.f, 'widthFrac');
  near(frameWidth(p, 1384, 900, false), Math.min(p.widthFrac * 1384, 0.8 * 900 * 1.6), 'desktop width');
  const [tall] = pack([{ w: 1170, h: 2532 }]);
  near(frameWidth(tall, 1384, 900, false), 0.8 * 900 * (1170 / 2532), 'a tall print is held by 80 svh');
  near(frameWidth(tall, 358, 844, true), Math.min(0.56 * 358, 0.7 * 844 * (1170 / 2532)), 'phone width');
  assert.equal(phoneFrac(sizePrint({ w: 2560, h: 1080 })), 1);
  assert.equal(phoneFrac(sizePrint({ w: 1920, h: 1200 })), 1);
  assert.equal(phoneFrac(sizePrint({ w: 1080, h: 1080 })), 0.72);
  assert.equal(phoneFrac(sizePrint({ w: 1170, h: 2532 })), 0.56);
  assert.equal(phoneFrac(sizePrint({ w: 1080, h: 1080, scale: 'hero' })), 1);
  near(phoneFrac(sizePrint({ w: 1080, h: 1080, scale: 'detail' })), 0.72 * 0.7, 'detail on a phone');
  const sides = pack(Array.from({ length: 3 }, () => ({ w: 1170, h: 2532 })));
  assert.deepEqual(sides.map((x) => x.phoneSide), ['left', 'right', 'left']);
  assert.match(sizesAttr(p), /^\(max-width: 759px\) calc\(\(100vw - 32px\) \* 1\), \(min-width: 1736px\) \d+px, calc\(\(100vw - 56px\) \* 0\.\d+\)$/);
});

rule('ladder: 480, 800, 1280, 1920, never upscaled; class tokens by rung, first print, extreme and poster', (S) => {
  const { ABSENT, AR_MAX, AR_MIN, AUTO_HERO_AT, COLS, bucketOf, fill, frameWidth, pack, phoneFrac, sizeOf, sizePrint, sizeScore, sizesAttr } = S;
  assert.deepEqual(rungsFor(4000), [480, 800, 1280, 1920]);
  assert.deepEqual(rungsFor(1080), [480, 800]);
  assert.deepEqual(rungsFor(800), [480, 800]);
  assert.deepEqual(rungsFor(300), [300], 'an image under 480 keeps its width');
  assert.equal(capClass(480, 1920, 1200), 'small');
  assert.equal(capClass(800, 1920, 1200), 'mid');
  assert.equal(capClass(1280, 1920, 1200), 'large');
  assert.equal(capClass(1280, 1920, 1200, { first: true }), 'first');
  assert.equal(capClass(1280, 4000, 1000), 'extreme');
  assert.equal(capClass(800, 1000, 2100), 'extreme');
  assert.equal(capClass(480, 1280, 720, { poster: true }), 'poster');
  const files = ladder('/m/', 'a', 1920, 1200);
  assert.deepEqual(files.map((f) => f.h), [300, 500, 800, 1200]);
  assert.equal(srcset(files, 'avif'), '/m/a-small-480.avif 480w, /m/a-mid-800.avif 800w, /m/a-large-1280.avif 1280w, /m/a-large-1920.avif 1920w');
  assert.equal(fallback(files), '/m/a-mid-800.webp');
  assert.equal(widest(files, 'avif'), '/m/a-large-1920.avif');
});

// fix-pass B5
// f19: in a full row (no spare column) f gives up GAP_COLS / 2 per inner side, so neighbours never touch (the 8 px focus
// ring and the 7 px AF brackets need room); a row with spare columns already has a whole column between its prints and
// keeps D-044's f. A print's drawn extent in columns: it starts at col - 1, plus its slack before it (none when start-
// justified, half when centred, all when end-justified).
const extent = (p) => { const left = p.col - 1 + (p.justify === 'start' ? 0 : p.justify === 'center' ? (p.span * (1 - p.f)) / 2 : p.span * (1 - p.f)); return { left, right: left + p.span * p.f }; };
rule('pack: neighbours in a row keep at least GAP_COLS between them; rows with room keep their f', (S) => {
  const { GAP_COLS, pack, sizePrint } = S;
  assert.ok((GAP_COLS * 704) / 12 >= 12, 'at the 704 px minimum roll the gap clears the 8 px ring');
  const P = { w: 3024, h: 4032 }, Q = { w: 3024, h: 3024 }, L = { w: 4032, h: 3024 };
  for (const r of [[P, P, P], [Q, L], [L, Q], [Q, P], [L, P]]) {
    const p = pack(r);
    for (let k = 1; k < p.length; k++) {
      if (p[k].row !== p[k - 1].row) continue;
      const gap = extent(p[k]).left - extent(p[k - 1]).right;
      assert.ok(gap >= GAP_COLS - 1e-9, `${r.map((x) => `${x.w}x${x.h}`).join(' + ')}: ${gap} columns between prints ${k} and ${k + 1}`);
    }
  }
  assert.deepEqual(pack([L, P]).map((x) => x.f), [1, 1], 'a 7 + 4 row has a spare column: f stays 1');
  const room = [{ w: 1920, h: 1200 }, { w: 1170, h: 2532 }];
  pack(room).forEach((p, k) => near(p.f, sizePrint(room[k]).f, `a row with room keeps D-044's f (print ${k + 1})`));
});

// Negative controls: one planted defect per branch class; the rules above must fail on every one.
const MUTANTS = [
  ['square band loses its upper edge', 'if (r <= 1.25) return', 'if (r < 1.25) return'],
  ['small images keep their bucket slot', 'px < SMALL_PX ? 4 : SLOT[bucket]', 'SLOT[bucket]'],
  ['portrait hero spans 12', "bucket === 'portrait' || bucket === 'square' ? 6 : COLS", 'COLS'],
  ['detail does not shrink', "(detail ? 0.7 : 1)", '1'],
  ['auto hero only above 9', 'prints.length >= AUTO_HERO_AT', 'prints.length > AUTO_HERO_AT'],
  ['rows overfill', 'if (cur.length && (alone || used + s.span > COLS))', 'if (cur.length && alone)'],
  ['no zigzag', 'k % 2 === 1, i)', 'false, i)'],
  ['no aspect clamp', 'const ar = clamp(r, AR_MIN, AR_MAX);', 'const ar = r;'],
  ['s over 3 stops', 'Math.log2(px / SMALL_PX) / 4', 'Math.log2(px / SMALL_PX) / 3'],
  ['phone portrait 60%', 'portrait: 0.56', 'portrait: 0.6'],
  ['lone prints never alternate', 'if (lone % 2 === 1) {', 'if (false) {'],
  // fix-pass B5: f19
  ['full rows touch', 'const fMax = tight ? 1 - (inner * GAP_COLS) / 2 / spans[k] : 1;', 'const fMax = 1;'],
  ['rows with room are capped too', 'const tight = spare < gaps;', 'const tight = true;'],
  ['no gutter constant', 'export const GAP_COLS = 0.25;', 'export const GAP_COLS = 0;'],
];
test('negative controls: every mutant of size.ts fails the rules', async () => {
  const src = readFileSync(join(SRC, 'size.ts'), 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'wv1-size-'));
  try {
    for (const [name, from, to] of MUTANTS) {
      assert.ok(src.includes(from), `mutant "${name}": the planted line is in size.ts`);
      const file = join(dir, `size-${MUTANTS.findIndex((m) => m[0] === name)}.ts`);
      writeFileSync(file, src.replace(from, to));
      const M = await import(pathToFileURL(file).href);
      const failed = RULES.filter(([, fn]) => { try { fn(M); return false; } catch { return true; } }).map(([n]) => n);
      assert.ok(failed.length > 0, `mutant "${name}" passed every rule`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
