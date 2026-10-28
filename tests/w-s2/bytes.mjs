#!/usr/bin/env node
// W-S2 bytes (B1, B2, B3), GPU-free, from a built dist/ and its chunk manifest:
//   B1 GL: the larger of gzip -6 (what scripts/serve-dist.mjs delivers) and gzip -9, summed over the chunks
//      tests/w-s1 glBytes counts (every chunk holding a GL-prefixed module), less /bench/'s; cap 186,700 B (#14 D-027).
//   B2 pre-GL on /: size-limit's 'pre-GL JS (/)' group (gzip); W-S2 adds at most 3.0 kB over its merge-base.
//   B3 home HTML: dist/index.html gzip -6 (information until W-F-m3).
// Usage: node tests/w-s2/bytes.mjs [--root <tree>] [--base <tree of the merge-base>] [--out <dir>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ROOT = resolve(opt('--root', join(import.meta.dirname, '../..')));
const BASE = opt('--base', null);
export const GL_CAP = 186700;
export const PREGL_DELTA_MAX = 3000;

const GL_MOD = (m) => /^(node_modules\/(three|animejs)\/|src\/stage\/gl\/|src\/gl\/)/.test(m) && !/src\/stage\/gl\/(bench|fixtures)\.ts$/.test(m);
export function measure(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'node_modules/.cache/portfolio-build/vite-manifest.json'), 'utf8'));
  const chunks = Object.values(manifest).filter((c) => c.modules.some(GL_MOD) && !c.modules.every((m) => /src\/stage\/gl\/(bench|fixtures)\.ts$|src\/gl\/camera\/bench\.ts$/.test(m)));
  const files = chunks.map((c) => {
    const b = readFileSync(join(root, 'dist', c.file));
    return { file: c.file, gzip6: gzipSync(b, { level: 6 }).length, gzip9: gzipSync(b, { level: 9 }).length };
  });
  const sum = (k) => files.reduce((n, f) => n + f[k], 0);
  const gl = Math.max(sum('gzip6'), sum('gzip9'));
  const require = createRequire(join(root, 'package.json'));
  // size-limit's own group arithmetic, without running size-limit: the pre-GL closure of / gzipped as one file each.
  const { pageScripts, sizeGroups } = require(join(root, 'scripts/check/size-groups.cjs'));
  const groups = sizeGroups(Object.values(manifest), pageScripts(join(root, 'dist')));
  const home = groups.preGL.find((g) => g.name === '/' || g.name.startsWith('/ ') || g.name === '/index.html') ?? groups.preGL[0];
  const preGl = home.files.reduce((n, f) => n + gzipSync(readFileSync(join(root, 'dist', f)), { level: 9 }).length, 0);
  const html = gzipSync(readFileSync(join(root, 'dist/index.html')), { level: 6 }).length;
  return { glBytes: gl, files, preGlBytes: preGl, preGlGroup: home.name, homeHtmlBytes: html };
}

const now = measure(ROOT);
const base = BASE ? measure(resolve(BASE)) : null;
const out = {
  schema: 1,
  instrument: 'w-s2/bytes',
  glCap: GL_CAP,
  gl: now.glBytes,
  glPass: now.glBytes <= GL_CAP,
  preGl: now.preGlBytes,
  preGlBase: base?.preGlBytes ?? null,
  preGlDelta: base ? now.preGlBytes - base.preGlBytes : null,
  preGlPass: base ? now.preGlBytes - base.preGlBytes <= PREGL_DELTA_MAX : null,
  homeHtml: now.homeHtmlBytes,
  homeHtmlBase: base?.homeHtmlBytes ?? null,
  homeHtmlDelta: base ? now.homeHtmlBytes - base.homeHtmlBytes : null,
  files: now.files,
};
out.pass = out.glPass && out.preGlPass !== false;
out.summary = `GL ${out.gl} B of ${GL_CAP}; pre-GL / ${out.preGl} B${base ? ` (${out.preGlDelta >= 0 ? '+' : ''}${out.preGlDelta} over the base, max +${PREGL_DELTA_MAX})` : ''}; home HTML ${out.homeHtml} B${base ? ` (${out.homeHtmlDelta >= 0 ? '+' : ''}${out.homeHtmlDelta})` : ''}`;
const dir = opt('--out', null);
if (dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'bytes.json'), JSON.stringify(out, null, 2));
}
console.log(`bytes: ${out.pass ? 'PASS' : 'FAIL'}  ${out.summary}`);
process.exit(out.pass ? 0 : 1);
