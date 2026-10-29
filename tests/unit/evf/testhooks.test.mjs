// D-055 both ways: the test hooks (window.__vf, window.__vfEngine) and the engine's frame counters exist only under
// ?vf-test. GPU-free: `npm run test:unit` (node --test; Node strips the types of src/evf/*.ts as it imports them).
// The same checks run on the real module and on four mutants (always on, always off, an engine global without the
// parameter, counters without the parameter); each mutant must fail them, so the checks cannot pass vacuously.
// The built page is checked too: tests/smoke/gating.spec.mjs (no __vf* global on plain /).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTestMode, testHooks, TEST_PARAM } from '../../../src/evf/testhooks.ts';
import { CHANNELS, newCounts } from '../../../src/evf/gl/stats.ts';

const API = ['go', 'openProject', 'closeProject', 'lower', 'raise', 'setSim', 'state', 'pos'];
const controls = () => Object.fromEntries(API.map((k) => [k, () => k]));
const fakeEngine = () => ({ stats: { frames: 7, scene: 6, composite: 5, eyepiece: 1, readback: 2 } });

/** Throws unless `impl` (testHooks' signature) gates both ways. */
function bothWays(impl) {
  // Without the parameter: no global, no counters, every hook a no-op.
  for (const search of ['', '?', '?x=1', '?vf-testx', '?x=vf-test', '?VF-TEST', '?vf_test']) {
    const win = {};
    const h = impl(win, search, () => 0);
    assert.equal(h.stats, false, `${JSON.stringify(search)}: the engine must be built without counters`);
    h.engine(fakeEngine());
    h.attach(controls(), () => fakeEngine());
    assert.deepEqual(Object.getOwnPropertyNames(win), [], `${JSON.stringify(search)}: no global may attach`);
  }
  // With it: both globals, the concept's API plus stats() and resetStats(), counters on.
  for (const search of ['?vf-test', '?vf-test=1', '?a=1&vf-test', '?vf-test=']) {
    let t = 1000;
    const win = {};
    const h = impl(win, search, () => t);
    assert.equal(h.stats, true, `${search}: the engine must be built with counters`);
    const e = fakeEngine();
    h.engine(e);
    const c = controls();
    h.attach(c, () => e);
    assert.deepEqual(Object.getOwnPropertyNames(win).sort(), ['__vf', '__vfEngine'], `${search}: both globals attach`);
    assert.equal(win.__vfEngine, e);
    assert.deepEqual(Object.keys(win.__vf).sort(), [...API, 'stats', 'resetStats'].sort(), `${search}: the API shape`);
    for (const k of API) assert.equal(win.__vf[k], c[k], `${search}: ${k} is the page's own function`);
    t = 1500;
    assert.deepEqual(win.__vf.stats(), { ...e.stats, ms: 500, engine: true });
    win.__vf.resetStats();
    t = 1600;
    assert.deepEqual(win.__vf.stats(), { frames: 0, scene: 0, composite: 0, eyepiece: 0, readback: 0, ms: 100, engine: true });
  }
}

test('isTestMode reads the query only: the parameter name, any value, nothing else', () => {
  assert.equal(TEST_PARAM, 'vf-test');
  for (const s of ['?vf-test', '?vf-test=1', '?vf-test=0', '?a=1&vf-test', 'vf-test']) assert.equal(isTestMode(s), true, s);
  for (const s of ['', '?', '?vf-testx', '?x=vf-test', '?VF-TEST', '#vf-test', '?vf_test']) assert.equal(isTestMode(s), false, s);
});

test('testHooks gates both ways (D-055)', () => bothWays(testHooks));

test('off, testHooks allocates nothing: every call returns the same frozen no-op hooks', () => {
  assert.ok(Object.isFrozen(testHooks({}, '')));
  assert.equal(testHooks({}, ''), testHooks({}, '?x=1'));
});

test('on the flat-frame path (no engine) stats() reads zeros and engine: false', () => {
  const win = {};
  const h = testHooks(win, '?vf-test', () => 0);
  h.attach(controls(), () => null);
  assert.deepEqual(win.__vf.stats(), { frames: 0, scene: 0, composite: 0, eyepiece: 0, readback: 0, ms: 0, engine: false });
  win.__vf.resetStats(); // no engine: still safe
});

test('the counters: one integer per channel plus frames, zeroed, a fresh object per engine', () => {
  assert.deepEqual(CHANNELS, ['scene', 'composite', 'eyepiece', 'readback']);
  const a = newCounts();
  assert.deepEqual(a, { frames: 0, scene: 0, composite: 0, eyepiece: 0, readback: 0 });
  assert.notEqual(a, newCounts());
});

// Negative controls: each mutant breaks one direction, and bothWays must reject it.
const MUTANTS = {
  'always on (the parameter ignored)': (win, _s, now) => testHooks(win, '?vf-test', now),
  'always off (the parameter ignored)': (win, _s, now) => testHooks(win, '', now),
  'the engine global attaches without the parameter': (win, s, now) => {
    const h = testHooks(win, s, now);
    return h.stats ? h : { ...h, engine: (e) => { win.__vfEngine = e; } };
  },
  'counters on without the parameter': (win, s, now) => {
    const h = testHooks(win, s, now);
    return h.stats ? h : { ...h, stats: true };
  },
};
for (const [name, impl] of Object.entries(MUTANTS)) {
  test(`negative control: bothWays rejects the mutant "${name}"`, () => {
    assert.throws(() => bothWays(impl), assert.AssertionError);
  });
}
