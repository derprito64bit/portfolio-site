// media-caps (W-V0a): passes with no media, and fails on an oversized fixture (the negative control). GPU-free:
// `node --test tests/w-f/media-caps.test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { checkMedia, classOf } from '../../scripts/check/media-caps.mjs';

const require = createRequire(import.meta.url);
const { budget, readBudgets } = require('../../scripts/check/budgets.cjs');
const b = readBudgets();
const cap = (k) => budget(`site.media.capBytes.${k}`, b);

function fixture(files, html = '') {
  const dist = mkdtempSync(join(tmpdir(), 'media-caps-'));
  mkdirSync(join(dist, 'media'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), html);
  writeFileSync(join(dist, 'favicon.ico'), Buffer.alloc(500_000)); // root icons are exempt
  for (const [name, bytes] of Object.entries(files)) writeFileSync(join(dist, name), Buffer.alloc(bytes));
  return dist;
}
const run = (dist) => checkMedia({ dist, manifests: [] });

test('no media: passes, and counts nothing', () => {
  const dist = fixture({});
  const r = run(dist);
  rmSync(dist, { recursive: true, force: true });
  assert.deepEqual(r, { problems: [], images: 0, lqips: 0 });
});

test('files at or under their class cap pass', () => {
  const dist = fixture({
    'media/a-small-1.avif': cap('small'),
    'media/a-mid-1.webp': cap('mid'),
    'media/a-large-1.avif': cap('large'),
    'media/a-first-1.avif': cap('firstPrint'),
    'media/a-extreme-1.avif': cap('extreme'),
    'media/a-poster-1.avif': cap('poster'),
  });
  const r = run(dist);
  rmSync(dist, { recursive: true, force: true });
  assert.deepEqual(r.problems, []);
  assert.equal(r.images, 6);
});

test('negative control: one byte over a cap fails, per class', () => {
  for (const [cls, key] of [['small', 'small'], ['mid', 'mid'], ['large', 'large'], ['first', 'firstPrint'], ['extreme', 'extreme'], ['poster', 'poster']]) {
    const dist = fixture({ [`media/a-${cls}-1.avif`]: cap(key) + 1 });
    const r = run(dist);
    rmSync(dist, { recursive: true, force: true });
    assert.equal(r.problems.length, 1, `${cls}: one problem`);
    assert.match(r.problems[0], new RegExp(`over the ${cls} cap`));
  }
});

test('negative control: an oversized file with no class token is held to the large cap', () => {
  const dist = fixture({ 'media/plain.webp': cap('large') + 1 });
  const r = run(dist);
  rmSync(dist, { recursive: true, force: true });
  assert.equal(r.problems.length, 1);
  assert.match(r.problems[0], /no class token/);
});

test('negative control: JPEG or PNG in the page fails', () => {
  const dist = fixture({ 'media/a-small-1.jpg': 10, 'media/a-small-2.png': 10 });
  const r = run(dist);
  rmSync(dist, { recursive: true, force: true });
  assert.equal(r.problems.length, 2);
});

test('negative control: an LQIP over its cap fails; one at the cap passes', () => {
  const uri = (n) => `data:image/webp;base64,${Buffer.alloc(n, 1).toString('base64')}`;
  const bad = fixture({}, `<img src="${uri(cap('lqip') + 1)}">`);
  const ok = fixture({}, `<img src="${uri(cap('lqip'))}">`);
  const rb = run(bad);
  const ro = run(ok);
  rmSync(bad, { recursive: true, force: true });
  rmSync(ok, { recursive: true, force: true });
  assert.equal(rb.problems.length, 1);
  assert.match(rb.problems[0], /LQIP/);
  assert.deepEqual(ro.problems, []);
  assert.equal(ro.lqips, 1);
});

test('the class comes from the name', () => {
  assert.equal(classOf('x/cover-480-small-ab12.avif'), 'small');
  assert.equal(classOf('x/y-poster.avif'), 'poster');
  assert.equal(classOf('x/posters-1.avif'), null); // needs a separator on both sides
  assert.equal(classOf('x/plain.webp'), null);
});
