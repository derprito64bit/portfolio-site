#!/usr/bin/env node
// W-S2 bytes (B1, B2, B3), from a built tree (its dist/ and its chunk manifest):
//   B1 GL (owner D-035; Orchestrator ruling 6464777023): tests/w-s1 glBytes (every GL chunk a first D2 visit loads up to
//      hero:readable, the larger of delivered and gzip -9, 3 cold loads) plus every other chunk of the GL group, that is
//      every chunk only GL chunks import, statically or dynamically: scripts/check/size-groups.cjs' GL closure, the one
//      size-limit's GL row measures (from the GL entries, minus pre-GL chunks and W-F's /bench/-only chunks, which a
//      visit to / never loads). Each such chunk counts at the larger of its gzip -6 bytes (what scripts/serve-dist.mjs
//      delivers: gzipSync at level 6) and its gzip -9 bytes. Per glBytes run: the run's figure plus every GL-group chunk
//      that run did not count; B1 is the largest run. The budget is the tree's own site.glChunkKbGz (budgets.md; 187.6 kB
//      gz since D-035), W-S3 keeps its 300 B reserve, so W-S2's cap is the budget minus 300 B, and over the cap fails:
//      nothing between the cap and the budget is accepted for W-S2 (D-035). Round 3's instrument judged glBytes alone
//      and only listed the 269 B posters helper (the judge's must-fix gate-b1-gl).
//   B2 pre-GL on /: the spec's instrument, tests/w-f/pregl.mjs (the encoded script bytes the network delivered before
//      stage:gl-start, at D2 and P2), run from each tree on its own dist; W-S2 adds at most 3.0 kB over its merge-base.
//      (Round 1 summed gzip -9 per file instead and read +2,775 B where pregl.mjs read +3,052 B: breaker 1.1.) The
//      size-limit group sum is kept as information (preGlGzip9).
//   B3 home HTML: dist/index.html gzip -6 (information until W-F-m3).
// Negative control: --plant glonly grows the GL-group chunk that no glBytes run counts (the posters helper) by an
//   incompressible JS comment, in memory (no tree is edited), until B1 sits midway between the cap and the budget, the
//   band D-035 no longer accepts. glBytes is untouched, so only the GL-only term moves: it must exit 1. A plant that does
//   not land there exits 3.
// Exit: 0 pass, 1 fail, 2 the instrument broke, 3 a plant did not land.
// Usage: node tests/w-s2/bytes.mjs [--root <tree>] [--base <tree of the merge-base>] [--plant glonly] [--out <dir>]
//   (a browser suite: glBytes and pregl.mjs load pages)
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
const PLANT = opt('--plant', null);
/** W-S3's GL reserve (D-027, kept by D-035): W-S2's cap is the GL budget minus this. */
export const W_S3_RESERVE = 300;
export const PREGL_DELTA_MAX = 3000;

const gz = (buf) => {
  const gzip6 = gzipSync(buf, { level: 6 }).length;
  const gzip9 = gzipSync(buf, { level: 9 }).length;
  return { gzip6, gzip9, bytes: Math.max(gzip6, gzip9) };
};
const sumBytes = (list) => list.reduce((n, f) => n + f.bytes, 0);

/** The GL budget and W-S2's cap from that tree's own budgets.md (site.glChunkKbGz), never a literal. */
export function glLimits(root) {
  const { budget } = createRequire(join(root, 'package.json'))(join(root, 'scripts/check/budgets.cjs'));
  const glBudget = Math.round(budget('site.glChunkKbGz') * 1000); // kB to bytes, as budgets.md counts them
  return { glBudget, glCap: glBudget - W_S3_RESERVE };
}

/** B1 per glBytes run: the run's figure plus each GL-group chunk the run did not count (`over` swaps in planted bytes). */
function b1Runs(rows, group, over = {}) {
  return rows.map((r) => {
    const counted = new Set(r.files.map((f) => f.file));
    const glOnly = group.filter((f) => !counted.has(f.file)).map((f) => (f.file in over ? { ...f, bytes: over[f.file], planted: true } : f));
    const glBytesRun = Math.max(r.deliveredBytes, r.gzip9Bytes);
    return { run: r.run, glBytes: glBytesRun, counted: [...counted], glOnly, glOnlyBytes: sumBytes(glOnly), b1: glBytesRun + sumBytes(glOnly) };
  });
}

export function measure(root, { plant = null } = {}) {
  const dist = join(root, 'dist');
  const manifest = JSON.parse(readFileSync(join(root, 'node_modules/.cache/portfolio-build/vite-manifest.json'), 'utf8'));
  const chunks = Object.values(manifest);
  const byFile = new Map(chunks.map((c) => [c.file, c]));
  const require = createRequire(join(root, 'package.json'));
  const { pageScripts, sizeGroups } = require(join(root, 'scripts/check/size-groups.cjs'));
  const groups = sizeGroups(chunks, pageScripts(dist));
  const group = groups.gl.map((file) => ({ file, modules: byFile.get(file)?.modules ?? [], ...gz(readFileSync(join(dist, file))) }));
  const gl = glBytes(root);
  const limits = glLimits(root);
  let runs = b1Runs(gl.rows, group);
  // GL-group chunks that no glBytes run counted: the GL-only term's chunks (the posters helper at c9e4014).
  const neverCounted = group.filter((f) => runs.every((r) => r.glOnly.some((o) => o.file === f.file)));
  const planted = plant === 'glonly' ? plantGlOnly(root, neverCounted, runs, limits) : null;
  if (planted?.landed) runs = b1Runs(gl.rows, group, { [planted.file]: planted.plantedBytes });
  const top = runs.reduce((a, r) => (r.b1 > a.b1 ? r : a));
  // size-limit's own group arithmetic, without running size-limit: the pre-GL closure of / gzipped as one file each.
  const home = groups.preGL.find((g) => g.name === '/' || g.name.startsWith('/ ') || g.name === '/index.html') ?? groups.preGL[0];
  const preGl = home.files.reduce((n, f) => n + gzipSync(readFileSync(join(dist, f)), { level: 9 }).length, 0);
  const html = gzipSync(readFileSync(join(dist, 'index.html')), { level: 6 }).length;
  return {
    ...limits,
    b1: top.b1,
    top,
    runs,
    group,
    groupSum: sumBytes(group),
    groupClosureOnly: groups.glByClosureOnly,
    planted,
    preGlGzip9: preGl,
    preGlGroup: home.name,
    homeHtmlBytes: html,
    ...pregl(root),
  };
}

/** The plant: an incompressible comment (seeded, so the same every run) appended to the largest never-counted GL-group
 *  chunk, grown until B1 reaches the midpoint of the cap and the budget. */
function plantGlOnly(root, neverCounted, runs, { glBudget, glCap }) {
  const target = neverCounted.toSorted((a, b) => b.bytes - a.bytes)[0];
  if (!target) return { landed: false, why: 'no GL-group chunk is left uncounted by glBytes: nothing to plant into' };
  const goal = Math.round((glCap + glBudget) / 2);
  const need = goal - Math.max(...runs.map((r) => r.b1));
  if (need <= 0) return { landed: false, why: `B1 is already at or over ${goal} B` };
  const orig = readFileSync(join(root, 'dist', target.file));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let seed = 14;
  const rnd = () => ((seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) | 0) >>> 0) % alphabet.length;
  const pool = Array.from({ length: 20000 }, () => alphabet[rnd()]).join('');
  let n = need;
  let bytes = target.bytes;
  for (; n <= pool.length; n += 4) {
    bytes = gz(Buffer.concat([orig, Buffer.from(`\n/*${pool.slice(0, n)}*/\n`)])).bytes;
    if (bytes - target.bytes >= need) break;
  }
  return { landed: bytes - target.bytes >= need, file: target.file, commentChars: n, goal, cleanBytes: target.bytes, plantedBytes: bytes, added: bytes - target.bytes };
}

/** tests/w-s1 glBytes from that tree on that tree's dist: its rows, each with the files it counted. */
function glBytes(root) {
  const tmp = mkdtempSync(join(tmpdir(), 'w-s2-gl-'));
  try {
    try {
      execFileSync(process.execPath, [join(root, 'tests/w-s1/run.mjs'), '--only', 'glBytes', '--out', tmp], { cwd: root, stdio: 'pipe' });
    } catch {
      /* over its own budget it exits 1; the rows are read below either way */
    }
    const r = JSON.parse(readFileSync(join(tmp, 'glBytes.json'), 'utf8'));
    const rows = r.rows ?? [];
    if (!rows.length || rows.some((x) => !(Math.max(x.deliveredBytes, x.gzip9Bytes) > 0) || !Array.isArray(x.files) || !x.files.length)) throw new Error(`glBytes gave no rows: ${JSON.stringify(r).slice(0, 300)}`);
    return { rows };
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

let code = 0;
try {
  if (PLANT && PLANT !== 'glonly') throw new Error(`unknown --plant ${PLANT} (glonly)`);
  const now = measure(ROOT, { plant: PLANT });
  const base = BASE ? measure(resolve(BASE)) : null;
  const out = {
    schema: 2,
    instrument: 'w-s2/bytes',
    root: ROOT,
    glInstrument: 'B1 = tests/w-s1 glBytes (max of delivered and gzip -9; 3 cold D2 loads) + every GL-group chunk (size-groups.cjs GL closure) that run did not count, each max(gzip -6, gzip -9); the largest run (D-035, ruling 6464777023)',
    glBudget: now.glBudget,
    glCap: now.glCap,
    gl: now.b1,
    glBytesOnly: now.top.glBytes,
    glOnly: now.top.glOnly,
    glOnlyBytes: now.top.glOnlyBytes,
    glRuns: now.runs.map(({ run, glBytes: g, glOnlyBytes, b1 }) => ({ run, glBytes: g, glOnlyBytes, b1 })),
    glRunsDetail: now.runs,
    glBase: base?.b1 ?? null,
    glBaseDetail: base ? { glBytes: base.top.glBytes, glOnly: base.top.glOnly } : null,
    glDelta: base ? now.b1 - base.b1 : null,
    glVerdict: now.b1 <= now.glCap ? 'pass' : 'fail',
    glHeadroom: now.glCap - now.b1,
    glPass: now.b1 <= now.glCap,
    glGroup: now.group,
    glGroupSum: now.groupSum,
    glGroupClosureOnly: now.groupClosureOnly,
    plant: now.planted,
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
  };
  out.pass = out.glPass && out.preGlPass !== false;
  const sign = (n) => `${n >= 0 ? '+' : ''}${n}`;
  const parts = out.glOnly.map((f) => `${f.file} ${f.bytes}${f.planted ? ' planted' : ''}`).join(', ');
  out.summary = `B1 GL ${out.gl} B (${out.glVerdict}: cap ${out.glCap} = budget ${out.glBudget} - W-S3's ${W_S3_RESERVE}; glBytes ${out.glBytesOnly} + GL-only ${out.glOnlyBytes} [${parts}]; headroom ${out.glHeadroom} B${base ? `; ${sign(out.glDelta)} over the base` : ''}); pre-GL / ${out.preGl} B${base ? ` (${sign(out.preGlDelta)} over the base, max +${PREGL_DELTA_MAX})` : ''}; home HTML ${out.homeHtml} B${base ? ` (${sign(out.homeHtmlDelta)})` : ''}${out.plant ? `; PLANT glonly: ${out.plant.landed ? `${out.plant.file} +${out.plant.added} B` : `did not land (${out.plant.why ?? 'too short'})`}` : ''}`;
  // A plant must land in the band D-035 no longer accepts, and through the GL-only term alone.
  const landed = !out.plant || (out.plant.landed && out.gl > out.glCap && out.gl <= out.glBudget && out.glBytesOnly <= out.glCap);
  out.plantLanded = out.plant ? landed : null;
  const dir = opt('--out', null);
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, PLANT ? `bytes-plant-${PLANT}.json` : 'bytes.json'), JSON.stringify(out, null, 2));
  }
  console.log(`bytes: ${!landed ? 'PLANT DID NOT LAND' : out.pass ? 'PASS' : 'FAIL'}  ${out.summary}`);
  code = !landed ? 3 : out.pass ? 0 : 1;
} catch (e) {
  console.error(`bytes: ERROR (the instrument broke, exit 2): ${e?.stack ?? e}`);
  code = 2;
}
process.exit(code);
