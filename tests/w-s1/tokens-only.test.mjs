// The tokensOnly scanner flags what A2 forbids and passes what it allows (round 2 review: the check must not report
// PASS on a line the code does not meet). GPU-free: node --test. The fixtures are built from the tokens, so this file
// holds no literal duration itself (tokensOnly scans tests/w-s1 too).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durations, heroTimeline } from '../../src/lib/tokens.js';
import { scanTimeLiterals } from './checks.mjs';
import { loadBudgets } from './budgets.mjs';

const B = loadBudgets();
const scan = (src) => scanTimeLiterals([{ file: 'fixture.ts', src }]);

// The round-2 literals the gate and the manager found, rebuilt from their values, and the other forms of a time.
const BAD = [
  ['key', `const LATE_GUARD_MS = ${heroTimeline.lateGlAfterFcp};`],
  ['e3', `setTimeout(reveal, ${heroTimeline.revealSafetyAfterHead / 1000}e3);`],
  ['key', `const ROLL_TAIL = ${heroTimeline.rollerTracksEnd - heroTimeline.flight}; const tailMs = ${durations.glHandback};`],
  ['token', `if (rel >= seq + heroTimeline.developed + ${durations.posterFade}) done();`],
  ['unit', `transition: color ${durations.listToggle}ms var(--ease-out);`],
  ['unit', `transition: opacity ${durations.reduced / 1000}s linear;`],
  ['timer', `await sleep(${durations.eject});`],
  ['timer', `setTimeout(() => flash(), ${durations.flash});`],
  ['key', `await page.waitForFunction(ok, null, { timeout: ${5 * heroTimeline.budgetAfterGlReady} });`],
  ['key', `const SPEC = { delayGlMs: ${B.delayGlMs}, motionCapMs: ${B.motionCapMs} };`],
  ['clock', `const end = Date.now() + ${5 * durations.flashMinGap};`],
  ['budget', `const pass = bytes <= ${B.preGlBytes};`],
  ['budget', `ok = gzipBytes <= ${B.glBytes};`],
  // Round 3 (gate and manager, A2-5): the flash window written as a literal offset of a comparison's operand, exactly
  // as it stood in checks.mjs, and the same form on the left side.
  ['compare', `for (const f of flashes) worst = Math.max(worst, flashes.filter((g) => g >= f && g < f + ${durations.flashMinGap}).length);`],
  ['compare', `if (t0 - ${durations.shutter} > pressedAt) late();`],
];
const GOOD = [
  'setTimeout(fn, 0);',
  'await sleep(WAIT.settle);',
  'await sleep(2 * WAIT.settle);',
  'setTimeout(release, durations.glHandback);',
  'const ms = seconds * 1000;',
  'const kb = bytes / 1000;',
  'for (let i = 0; i < 24; i++) step();',
  "transition: color var(--dur-list-toggle) var(--ease-out);",
  'transition-duration: 0s !important;',
  `// a comment may say ${durations.eject} ms`,
  'const end = Date.now() + 5 * durations.flashMinGap;',
  // The compare rule: the token, small offsets, arrows, shifts and scientific notation are not offsets.
  'for (const f of flashes) worst = Math.max(worst, flashes.filter((g) => g >= f && g < f + durations.flashMinGap).length);',
  'const ok = b.right <= innerWidth + 8 && b.left >= -8;',
  'const xs = ys.map((v) => v + 16);',
  'seed = (seed * 31 + code) >>> 0;',
  'if (Math.abs(travel) < 1e-12) return 0;',
];

for (const [rule, src] of BAD) {
  test(`flags ${rule}: ${src}`, () => {
    const r = scan(src);
    assert.ok(r.hits.some((h) => h.rule === rule), JSON.stringify(r.hits));
  });
}
for (const src of GOOD) {
  test(`passes: ${src}`, () => {
    const r = scan(src);
    assert.equal(r.hits.length, 0, JSON.stringify(r.hits));
  });
}
test('a marked size is listed as exempt, not passed silently', () => {
  const r = scan(`rowH = Math.max(avail, ${durations.posterFade}); // not a time: CSS px`);
  assert.equal(r.hits.length, 0);
  assert.equal(r.exempt.length, 1);
  assert.equal(r.exempt[0].reason, 'CSS px');
});
