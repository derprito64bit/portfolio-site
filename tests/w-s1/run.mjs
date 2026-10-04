#!/usr/bin/env node
// W-S1 acceptance runner (issue #13). Build first (npm run build), on the reference host (RX 6700 XT).
//   node tests/w-s1/run.mjs [--only fcp,wordmark,...] [--out <dir>]
// Checks: fcp, wordmark, firstScreen, readable, delayedGl, inputGuard, parity, strip, motion, flashLight, flashDark,
// reducedStatic, gpu, filmstrips (evidence). Each writes <out>/<check>.json; the run writes <out>/summary.json and
// exits 1 on any FAIL.
// GL and timing checks are only valid on a real renderer and with no Blender job loading the CPU (tools.md).
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { H, writeJson } from './lib.mjs';
import * as C from './checks.mjs';

const opts = H.cliOpts();
const out = resolve(opts.out || join(H.evidenceDir('W-S1', 'wave3a', 'crew'), 'w-s1'));
mkdirSync(out, { recursive: true });
const ALL = ['fcp', 'wordmark', 'firstScreen', 'readable', 'delayedGl', 'inputGuard', 'parity', 'strip', 'motion', 'flashLight', 'flashDark', 'reducedStatic', 'gpu', 'filmstrips'];
const only = opts.only ? String(opts.only).split(',') : ALL;

const srv = await H.serve();
const summary = [];
try {
  for (const name of only) {
    const t = Date.now();
    let r;
    try {
      if (name === 'flashLight' || name === 'flashDark') {
        r = await C.flashFilm(srv.base, { out, scheme: name === 'flashLight' ? 'light' : 'dark', save: [0, 250, 367, 600, 1200, 1800] });
      } else if (name === 'delayedGl') {
        const dir = join(out, 'delayed-gl');
        mkdirSync(dir, { recursive: true });
        r = await C.delayedGl(srv.base, { out: dir });
      } else if (name === 'filmstrips') {
        const dir = join(out, 'filmstrips');
        mkdirSync(dir, { recursive: true });
        r = await C.filmstrips(srv.base, { out: dir });
      } else if (name === 'parity') {
        const dir = join(out, 'parity');
        mkdirSync(dir, { recursive: true });
        r = await C.parity(srv.base, { out: dir });
      } else r = await C[name](srv.base);
    } catch (e) {
      r = { pass: false, error: String(e?.stack || e) };
    }
    await H.closeBrowsers();
    writeJson(join(out, `${name}.json`), { check: name, sha: H.gitSha(), at: new Date().toISOString(), ms: Date.now() - t, ...r });
    summary.push({ check: name, pass: r.pass, ms: Date.now() - t, ...(r.error ? { error: r.error.split('\n')[0] } : {}) });
    console.log(`${name.padEnd(14)} ${r.pass ? 'PASS' : 'FAIL'}  ${Math.round((Date.now() - t) / 1000)} s${r.error ? `  ${r.error.split('\n')[0]}` : ''}`);
  }
} finally {
  await srv.close();
  await H.closeBrowsers();
}
writeJson(join(out, 'summary.json'), { sha: H.gitSha(), at: new Date().toISOString(), pass: summary.every((s) => s.pass), checks: summary });
process.exitCode = summary.every((s) => s.pass) ? 0 : 1;
