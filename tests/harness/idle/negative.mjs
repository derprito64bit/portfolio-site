// The idle check's negative control (W-V0b fix pass), runnable in CI: the planted hot case (--plant hot keeps the engine
// drawing every frame from the EVF window on) must FAIL, and fail on the plant itself. Under reduced motion the EVF's
// limit is 0 frames, so any draw at all fails it, even on CI's software GL; the auto EVF segment (limit 32 fps) is
// reported. This exits 0 only when the planted run failed that way; a planted run that passes, or a crash, exits 1.
// Usage: npm run h:idle:negative -- [--profile G1] [--window 3] [--browsers chromium] [--out idle-negative.json]
import { closeBrowsers, cliOpts, writeJson } from '../lib.mjs';
import { run } from './run.mjs';

const opts = cliOpts();
let result;
try {
  result = await run({ profile: opts.profile, window: opts.window ?? 3, browsers: opts.browsers ?? 'chromium', plant: 'hot' });
} catch (e) {
  result = { pass: null, error: String(e?.stack || e) };
} finally {
  await closeBrowsers();
}
const failing = (result.rows ?? []).filter((r) => !r.pass);
const planted = failing.find((r) => r.segment === 'evf-reduced' && r.failures.some((f) => /^frames [\d.]+ fps > 0$/.test(f)));
const ok = result.planted === 'hot' && result.pass === false && Boolean(planted) && !result.error;
if (opts.out) writeJson(opts.out, { schema: 1, instrument: 'idle-negative', pass: ok, failingSegments: failing.map((r) => ({ browser: r.browser, segment: r.segment, failures: r.failures })), result });
console.log(ok
  ? `idle negative control: PASS  the planted hot run FAILED as it must (${failing.map((r) => `${r.browser} ${r.segment}: ${r.failures[0]}`).join('; ')})`
  : `idle negative control: FAIL  the planted run ${result.error ? `crashed: ${result.error.slice(0, 300)}` : result.pass ? 'PASSED: the idle check cannot fail' : `failed, but not on the plant (${failing.map((r) => r.segment).join(', ') || 'no failing segment'})`}`);
process.exitCode = ok ? 0 : 1;
