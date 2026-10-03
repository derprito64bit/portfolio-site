// Spring instrument (GPU-free, W-D010, W-C3's acceptance): every spring in the one table, stepped with synthetic dt
// at 30, 60 and 144 Hz and at 60 Hz with one 50 ms hitch. Overshoot within +-0.5 points of the table, settle to 2%
// within +-15 ms (interpolated crossing), max |x - analytic| <= 1e-6. Writes spring-conformance rows (the shared
// schema with the Manor's EditMode test).
// Usage: npm run h:spring -- [--impl path/to/module.mjs] [--out spring-conformance.json]
//   --impl: a module exporting step(state, target, hz, zeta, dt) (default: the exact reference).
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { springs } from '../../../src/lib/tokens.js';
import { analytic, stepExact } from './reference.mjs';
import { cliMain } from '../lib.mjs';

function simulate(step, hz, zeta, rateHz, hitchAtMs = -1) {
  const s = { x: 0, v: 0 };
  const dt = 1 / rateHz;
  let t = 0;
  let peak = 0;
  let err = 0;
  let lastOut = 0;
  let prev = { t: 0, x: 0 };
  let hitched = false;
  while (t < 3) {
    let d = dt;
    if (hitchAtMs > 0 && !hitched && t * 1000 >= hitchAtMs) {
      d = 0.05;
      hitched = true;
    }
    step(s, 1, hz, zeta, d);
    t += d;
    err = Math.max(err, Math.abs(s.x - analytic(hz, zeta, t)));
    peak = Math.max(peak, s.x);
    const outside = Math.abs(1 - s.x) > 0.02;
    const prevOutside = Math.abs(1 - prev.x) > 0.02;
    if (prevOutside && !outside) {
      // Interpolate the crossing of the 2% band between the previous and this sample.
      const band = prev.x > 1 ? 1.02 : 0.98;
      const f = (band - prev.x) / (s.x - prev.x || 1);
      lastOut = prev.t + f * (t - prev.t);
    }
    if (outside) lastOut = t;
    prev = { t, x: s.x };
  }
  return { overshootPct: (peak - 1) * 100, settle2Ms: lastOut * 1000, maxAbsErr: err };
}

export async function run(opts = {}) {
  const step = opts.impl ? (await import(pathToFileURL(resolve(opts.impl)).href)).step : stepExact;
  const integrator = opts.impl ? String(opts.impl) : 'exact (tests/harness/spring/reference.mjs)';
  const rows = [];
  const failures = [];
  for (const [name, s] of Object.entries(springs)) {
    for (const [rateHz, hitch] of [[30, -1], [60, -1], [144, -1], [60, 100]]) {
      const r = simulate(step, s.hz, s.zeta, rateHz, hitch);
      const row = {
        door: 'W', integrator, spring: name, hz: s.hz, zeta: s.zeta, rateHz: hitch > 0 ? '60+50msHitch' : rateHz,
        overshootPct: Number(r.overshootPct.toFixed(3)), settle2Ms: Number(r.settle2Ms.toFixed(1)), maxAbsErr: r.maxAbsErr,
      };
      const okOs = Math.abs(row.overshootPct - s.overshootPct) <= 0.5;
      const okSettle = Math.abs(row.settle2Ms - s.settle2Ms) <= 15;
      const okErr = row.maxAbsErr <= 1e-6;
      row.pass = okOs && okSettle && okErr;
      if (!row.pass) failures.push(`${name} @ ${row.rateHz}: overshoot ${row.overshootPct} vs ${s.overshootPct}, settle ${row.settle2Ms} vs ${s.settle2Ms}, err ${row.maxAbsErr}`);
      rows.push(row);
    }
  }
  return { schema: 1, instrument: 'spring', pass: failures.length === 0, rows, failures, summary: `${rows.length} runs (4 springs x 30/60/144 Hz and a 50 ms hitch), ${failures.length} outside tolerance` };
}

await cliMain(import.meta.url, run);
