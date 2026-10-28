#!/usr/bin/env node
// W-S2 bytes (B1, B2, B3), GPU-free, from a built dist/ and its chunk manifest:
//   B1 GL: the spec's instrument, tests/w-s1 glBytes (every GL chunk a first D2 visit loads up to hero:readable, the
//      larger of delivered and gzip -9, 3 cold loads), run from the tree on its own dist. W-S2's cap is 186,700 B; a
//      figure from there to 187,000 B is accepted, and W-S3's 300 B reserve shrinks by the difference; over 187,000 B
//      fails (Orchestrator ruling 6462781328, item 1). glVerdict is pass, accepted or fail; glReserveLeft is what is
//      left of W-S3's reserve. The per-file gzip sum over the manifest's GL chunks is kept as information (glFiles),
//      and so is every non-GL chunk a GL chunk imports (glImportsUncounted: glBytes' module filter leaves them out,
//      the judge's queue item glbytes-helper-split).
//   B2 pre-GL on /: the spec's instrument, tests/w-f/pregl.mjs (the encoded script bytes the network delivered before
//      stage:gl-start, at D2 and P2), run from each tree on its own dist; W-S2 adds at most 3.0 kB over its merge-base.
//      (Round 1 summed gzip -9 per file instead and read +2,775 B where pregl.mjs read +3,052 B: breaker 1.1.) The
//      size-limit group sum is kept as information (preGlGzip9).
//   B3 home HTML: dist/index.html gzip -6 (information until W-F-m3).
// Usage: node tests/w-s2/bytes.mjs [--root <tree>] [--base <tree of the merge-base>] [--out <dir>]  (a browser suite: B2)
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const ROOT = resolve(opt('--root', join(import.meta.dirname, '../..')));
const BASE = opt('--base', null);
export const GL_CAP = 186700;
export const GL_CEILING = 187000;
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
  // Non-GL chunks that only GL chunks import (the manifest's imports name files, as `file` does).
  const all = Object.values(manifest);
  const isGl = (c) => c.modules.some(GL_MOD);
  const uncounted = all.filter((c) => !isGl(c) && !c.isEntry && all.some((i) => (i.imports ?? []).includes(c.file)) && all.every((i) => !(i.imports ?? []).includes(c.file) || isGl(i))).map((c) => {
    const b = readFileSync(join(root, 'dist', c.file));
    return { file: c.file, modules: c.modules, gzip6: gzipSync(b, { level: 6 }).length };
  });
  const glFiles = Math.max(sum('gzip6'), sum('gzip9'));
  const require = createRequire(join(root, 'package.json'));
  // size-limit's own group arithmetic, without running size-limit: the pre-GL closure of / gzipped as one file each.
  const { pageScripts, sizeGroups } = require(join(root, 'scripts/check/size-groups.cjs'));
  const groups = sizeGroups(Object.values(manifest), pageScripts(join(root, 'dist')));
  const home = groups.preGL.find((g) => g.name === '/' || g.name.startsWith('/ ') || g.name === '/index.html') ?? groups.preGL[0];
  const preGl = home.files.reduce((n, f) => n + gzipSync(readFileSync(join(root, 'dist', f)), { level: 9 }).length, 0);
  const html = gzipSync(readFileSync(join(root, 'dist/index.html')), { level: 6 }).length;
  return { glFiles, files, uncounted, preGlGzip9: preGl, preGlGroup: home.name, homeHtmlBytes: html, ...pregl(root), ...glBytes(root) };
}

/** tests/w-s1 glBytes from that tree on that tree's dist. */
function glBytes(root) {
  const tmp = mkdtempSync(join(tmpdir(), 'w-s2-gl-'));
  try {
    try {
      execFileSync(process.execPath, [join(root, 'tests/w-s1/run.mjs'), '--only', 'glBytes', '--out', tmp], { cwd: root, stdio: 'pipe' });
    } catch {
      /* over its own budget it exits 1; the rows are read below either way */
    }
    const r = JSON.parse(readFileSync(join(tmp, 'glBytes.json'), 'utf8'));
    const runs = (r.rows ?? []).map((x) => Math.max(x.deliveredBytes, x.gzip9Bytes));
    if (!runs.length || runs.some((n) => !(n > 0))) throw new Error(`glBytes gave no rows: ${JSON.stringify(r).slice(0, 300)}`);
    return { glBytes: Math.max(...runs), glRuns: runs };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** tests/w-f/pregl.mjs from that tree on that tree's dist (one order case: the bytes rows are what B2 reads). */
function pregl(root) {
  const tmp = mkdtempSync(join(tmpdir(), 'w-s2-pregl-'));
  const out = join(tmp, 'pregl.json');
  try {
    try {
      execFileSync(process.execPath, [join(root, 'tests/w-f/pregl.mjs'), '--out', out, '--cases', 'D2:/', '--repeat', '1'], { cwd: root, stdio: 'pipe' });
    } catch {
      /* its order verdict is not this instrument's; the bytes rows are read below either way */
    }
    const r = JSON.parse(readFileSync(out, 'utf8'));
    const by = Object.fromEntries((r.rows ?? []).map((x) => [x.profile, x.preGLBytes]));
    if (!by.D2 || !by.P2) throw new Error(`pregl.mjs gave no bytes rows: ${JSON.stringify(r).slice(0, 300)}`);
    return { preGlBytes: Math.max(by.D2, by.P2), preGlByProfile: by };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const now = measure(ROOT);
const base = BASE ? measure(resolve(BASE)) : null;
const out = {
  schema: 1,
  instrument: 'w-s2/bytes',
  glCap: GL_CAP,
  glInstrument: 'tests/w-s1 glBytes (max of delivered and gzip -9, the largest of 3 cold D2 loads)',
  gl: now.glBytes,
  glRuns: now.glRuns,
  glBase: base?.glBytes ?? null,
  glDelta: base ? now.glBytes - base.glBytes : null,
  glCeiling: GL_CEILING,
  glVerdict: now.glBytes <= GL_CAP ? 'pass' : now.glBytes <= GL_CEILING ? 'accepted' : 'fail',
  glReserveLeft: Math.min(300, GL_CEILING - now.glBytes),
  glPass: now.glBytes <= GL_CEILING,
  glImportsUncounted: now.uncounted,
  glFiles: now.glFiles,
  preGlInstrument: 'tests/w-f/pregl.mjs (delivered, before stage:gl-start; the larger of D2 and P2)',
  preGl: now.preGlBytes,
  preGlByProfile: now.preGlByProfile,
  preGlBase: base?.preGlBytes ?? null,
  preGlBaseByProfile: base?.preGlByProfile ?? null,
  preGlDelta: base ? now.preGlBytes - base.preGlBytes : null,
  preGlDeltaByProfile: base ? Object.fromEntries(Object.keys(now.preGlByProfile).map((k) => [k, now.preGlByProfile[k] - base.preGlByProfile[k]])) : null,
  preGlPass: base ? Object.keys(now.preGlByProfile).every((k) => now.preGlByProfile[k] - base.preGlByProfile[k] <= PREGL_DELTA_MAX) : null,
  preGlGzip9: now.preGlGzip9,
  preGlGzip9Base: base?.preGlGzip9 ?? null,
  homeHtml: now.homeHtmlBytes,
  homeHtmlBase: base?.homeHtmlBytes ?? null,
  homeHtmlDelta: base ? now.homeHtmlBytes - base.homeHtmlBytes : null,
  files: now.files,
};
out.pass = out.glPass && out.preGlPass !== false;
out.summary = `GL ${out.gl} B (${out.glVerdict}: cap ${GL_CAP}, ceiling ${GL_CEILING}; W-S3's reserve left ${out.glReserveLeft} B; uncounted GL imports ${now.uncounted.reduce((n, u) => n + u.gzip6, 0)} B); pre-GL / ${out.preGl} B${base ? ` (${out.preGlDelta >= 0 ? '+' : ''}${out.preGlDelta} over the base, max +${PREGL_DELTA_MAX})` : ''}; home HTML ${out.homeHtml} B${base ? ` (${out.homeHtmlDelta >= 0 ? '+' : ''}${out.homeHtmlDelta})` : ''}`;
const dir = opt('--out', null);
if (dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'bytes.json'), JSON.stringify(out, null, 2));
}
console.log(`bytes: ${out.pass ? 'PASS' : 'FAIL'}  ${out.summary}`);
process.exit(out.pass ? 0 : 1);
