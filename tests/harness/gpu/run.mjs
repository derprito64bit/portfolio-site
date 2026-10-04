// GPU instrument (W-D030): the committed bench on /bench/. Fresh load per run, 30 warm-up frames, K = 60 timed
// frames with readPixels fences, median of 5 loads, ms per frame at the real canvas size, renderer string recorded.
// A software renderer makes the run INVALID (budgets compare only on a real GPU; the reference is the RX 6700 XT).
// Usage: npm run h:gpu -- [--scenario sheet8|hero3] [--profile D2] [--loads 5] [--out gpu.json]
import { SOFTWARE_RENDERER, cliMain, newContext, serve, waitSettled } from '../lib.mjs';

export async function run(opts = {}) {
  const scenarios = String(opts.scenario || 'sheet8,hero3').split(',');
  const profile = opts.profile || 'D2';
  const loads = Number(opts.loads) || 5;
  const srv = await serve();
  const out = [];
  try {
    for (const scenario of scenarios) {
      const runs = [];
      for (let i = 0; i < loads; i++) {
        const ctx = await newContext(profile);
        const page = await ctx.newPage();
        await page.goto(`${srv.base}/bench/`, { waitUntil: 'load' });
        await waitSettled(page, 15000);
        await page.waitForFunction(() => window.__bench, null, { polling: 100, timeout: 15000 });
        runs.push(await page.evaluate((s) => window.__bench.run({ scenario: s, warmup: 30, frames: 60 }), scenario));
        await ctx.close();
      }
      const medians = runs.map((r) => r.medianMs).sort((a, b) => a - b);
      const renderer = runs[0].renderer;
      out.push({ scenario, profile, loads, renderer, valid: !SOFTWARE_RENDERER.test(renderer), tier: runs[0].tier, canvas: runs[0].canvas, dpr: runs[0].dpr, medianOfMediansMs: medians[Math.floor(medians.length / 2)], medians, shader: runs[0].shader });
    }
  } finally {
    await srv.close();
  }
  return { schema: 1, instrument: 'gpu', pass: out.every((r) => r.valid), results: out, summary: out.map((r) => `${r.scenario} ${r.medianOfMediansMs} ms/frame at ${r.canvas.w}x${r.canvas.h} (${r.valid ? 'valid' : 'INVALID renderer'})`).join('; ') };
}

await cliMain(import.meta.url, run);
