// The idle check's rules (tests/harness/idle/run.mjs), GPU-free: rates, the limit tables, the trace window and the
// trace cross-check, each with the planted value that must fail. The end-to-end negative control (a page kept drawing
// must fail) is `npm run h:idle -- --plant hot`, which needs a browser and a GPU.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THRESHOLDS, crossCheck, overLimits, rates, traceWindow } from '../../harness/idle/run.mjs';

const SEGMENTS = ['intro', 'evf', 'intro-hidden', 'evf-hidden', 'intro-reduced', 'evf-reduced'];
const KEYS = ['frames', 'scene', 'composite', 'eyepiece', 'readback', 'infiniteAnimations'];

test('thresholds.json: every table names a known segment and known keys with numbers', () => {
  for (const table of ['assert', 'd053']) {
    for (const [seg, limits] of Object.entries(THRESHOLDS[table])) {
      if (seg === 'mainThreadMsPerSecMax') continue;
      assert.ok(SEGMENTS.includes(seg), `${table}.${seg} is not a segment`);
      for (const [k, v] of Object.entries(limits)) {
        assert.ok(KEYS.includes(k), `${table}.${seg}.${k} is not a channel`);
        assert.equal(typeof v, 'number', `${table}.${seg}.${k}`);
      }
    }
  }
  assert.equal(THRESHOLDS.traceCrossCheck, true);
  // the stops hold now: hidden and reduced draw nothing (W-V0b measured them)
  for (const seg of ['intro-hidden', 'evf-hidden', 'intro-reduced', 'evf-reduced']) assert.equal(THRESHOLDS.assert[seg].frames, 0, seg);
});

test('rates: counts over the window in frames per second, one decimal', () => {
  assert.deepEqual(rates({ frames: 301, scene: 300, composite: 300, eyepiece: 0, readback: 3, ms: 10000 }), { frames: 30.1, scene: 30, composite: 30, eyepiece: 0, readback: 0.3 });
  assert.deepEqual(rates({ frames: 5, scene: 5, composite: 5, eyepiece: 5, readback: 5, ms: 0 }), { frames: 0, scene: 0, composite: 0, eyepiece: 0, readback: 0 });
});

test('overLimits: a channel past its maximum fails, a missing key is not judged', () => {
  const r = { frames: 30.1, scene: 30.1, composite: 30.1, eyepiece: 0, readback: 0 };
  assert.deepEqual(overLimits(r, THRESHOLDS.assert.evf, 0), []);
  assert.deepEqual(overLimits({ ...r, frames: 31 }, THRESHOLDS.assert.evf, 0), ['frames 31 fps > 30.5']);
  assert.deepEqual(overLimits({ ...r, readback: 0.1 }, THRESHOLDS.assert.evf, 0), ['readback 0.1 fps > 0']);
  assert.deepEqual(overLimits(r, THRESHOLDS.assert.evf, 1), ['1 infinite animations > 0']);
  assert.deepEqual(overLimits({ ...r, frames: 240 }, {}, 9), []);
  assert.deepEqual(overLimits({ frames: 0.1, scene: 0, composite: 0, eyepiece: 0, readback: 0 }, THRESHOLDS.assert['evf-hidden'], 0), ['frames 0.1 fps > 0']);
});

const ev = (name, ts, extra = {}) => ({ name, ts, pid: 7, tid: 1, ph: 'X', dur: 0, ...extra });
const TRACE = [
  { name: 'thread_name', ph: 'M', pid: 7, tid: 1, args: { name: 'CrRendererMain' } },
  { name: 'thread_name', ph: 'M', pid: 7, tid: 2, args: { name: 'Compositor' } },
  ev('FireAnimationFrame', 500), // before the window
  ev('idle:start', 1_000_000, { ph: 'R' }),
  ev('FireAnimationFrame', 1_100_000), ev('FireAnimationFrame', 1_200_000), ev('FireAnimationFrame', 1_300_000, { pid: 9 }),
  ev('Paint', 1_150_000),
  ev('RunTask', 1_100_000, { dur: 2000 }), ev('RunTask', 1_200_000, { dur: 3000 }), ev('RunTask', 1_250_000, { dur: 9000, tid: 2 }),
  ev('idle:end', 2_000_000, { ph: 'R' }),
  ev('FireAnimationFrame', 2_100_000), // after it
];

test('traceWindow: only the marked window, only the page renderer, main-thread tasks only', () => {
  assert.deepEqual(traceWindow(TRACE), { seconds: 1, rafCallbacks: 2, rafPerSec: 2, paints: 1, paintsPerSec: 1, mainThreadMsPerSec: 5 });
  assert.ok(traceWindow(TRACE.filter((e) => e.name !== 'idle:end')).error);
});

test('crossCheck: more engine frames than rAF callbacks is a miscount', () => {
  const tr = traceWindow(TRACE);
  assert.deepEqual(crossCheck(2, tr), []);
  assert.deepEqual(crossCheck(3, tr), ['trace cross-check: 3 engine frames > 2 rAF callbacks']);
  assert.deepEqual(crossCheck(99, null), []);
});
