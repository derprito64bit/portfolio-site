// ion-spring v1 conformance (W-D010, W-D030 motion: "a spring unit test"). GPU-free: node --test.
// The exact step must give the table's overshoot and 2% settle time at 30, 60 and 144 Hz and through a 50 ms hitch,
// and stay on the analytic curve (the trajectory depends only on time, not on the frame rate).
// Writes spring-conformance.json rows when SPRING_CONFORMANCE_OUT is set (the seam shared with the Manor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { springs } from '../../src/lib/tokens.js';
import { Spring, overshootPct, params, sampleStep, stepExact } from '../../src/motion/spring/index.ts';

const NAMES = ['press', 'detent', 'settle', 'lag'];
const RATES = [30, 60, 144];
const rows = [];

for (const name of NAMES) {
  test(`${name}: analytic overshoot matches the table`, () => {
    assert.ok(Math.abs(overshootPct(params(name)) - springs[name].overshootPct) <= 0.05, `${overshootPct(params(name))} vs ${springs[name].overshootPct}`);
  });
  for (const rate of RATES) {
    test(`${name} at ${rate} Hz: overshoot and settle within tolerance, on the analytic curve`, () => {
      const r = sampleStep(name, rate);
      rows.push({ door: 'W', integrator: 'ion-spring exact', spring: name, hz: springs[name].hz, zeta: springs[name].zeta, rateHz: rate, overshootPct: r.overshootPct, settle2Ms: r.settle2Ms, maxAbsErr: r.maxAbsErr });
      assert.ok(Math.abs(r.overshootPct - springs[name].overshootPct) <= 0.1, `overshoot ${r.overshootPct}`);
      assert.ok(Math.abs(r.settle2Ms - springs[name].settle2Ms) <= 2, `settle2 ${r.settle2Ms} vs ${springs[name].settle2Ms}`);
      assert.ok(r.maxAbsErr < 1e-9, `drift from the analytic curve ${r.maxAbsErr}`);
    });
  }
  test(`${name}: a 50 ms hitch does not change the curve`, () => {
    const r = sampleStep(name, 60, { hitchMs: 50, hitchAt: 4 });
    rows.push({ door: 'W', integrator: 'ion-spring exact', spring: name, hz: springs[name].hz, zeta: springs[name].zeta, rateHz: '60+hitch50', overshootPct: r.overshootPct, settle2Ms: r.settle2Ms, maxAbsErr: r.maxAbsErr });
    assert.ok(Math.abs(r.overshootPct - springs[name].overshootPct) <= 0.1);
    assert.ok(r.maxAbsErr < 1e-9);
  });
}

test('retarget keeps velocity (interruptible)', () => {
  const s = new Spring('settle', 0).to(100);
  for (let i = 0; i < 6; i++) s.step(1 / 60);
  const v = s.velocity;
  assert.ok(v > 0);
  s.to(0);
  assert.equal(s.velocity, v);
  assert.equal(s.step(1 / 60), true);
});

test('set() snaps with no motion', () => {
  const s = new Spring('press', 0).to(1);
  s.step(1 / 60);
  s.set(1);
  assert.equal(s.atRest, true);
  assert.equal(s.step(1 / 60), false);
  assert.equal(s.value, 1);
});

test('stepExact composes: two half steps equal one full step', () => {
  for (const name of NAMES) {
    const p = params(name);
    const [a, b] = stepExact(1, -3, 0.01, p);
    const [c, d] = stepExact(a, b, 0.01, p);
    const [e, f] = stepExact(1, -3, 0.02, p);
    assert.ok(Math.abs(c - e) < 1e-12 && Math.abs(d - f) < 1e-9);
  }
});

test.after(() => {
  if (process.env.SPRING_CONFORMANCE_OUT) writeFileSync(process.env.SPRING_CONFORMANCE_OUT, `${JSON.stringify({ schema: 1, rows }, null, 2)}\n`);
});
