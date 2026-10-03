// Idle instrument (budgets.md "Idle"): main-thread cost at rest. After the page settles and 1 s passes with no
// input, CDP Performance metrics over 3 s give task and script ms per second; stage ticks and renders must not move.
// Reported with the display refresh rate, since rAF-driven cost scales with it. Chromium only (CDP).
// Usage: npm run h:idle -- [--profiles D2,P2] [--routes /,/work/project-01/,/bench/] [--out idle.json]
import { cliMain, hostInfo, newContext, serve, sleep, waitSettled } from '../lib.mjs';

export async function run(opts = {}) {
  const profiles = String(opts.profiles || 'D2,P2').split(',');
  const routes = String(opts.routes || '/,/work/project-01/,/bench/').split(',');
  const host = await hostInfo();
  const srv = await serve();
  const rows = [];
  try {
    for (const profile of profiles) {
      for (const route of routes) {
        const ctx = await newContext(profile);
        const page = await ctx.newPage();
        await page.goto(srv.base + route, { waitUntil: 'load' });
        await waitSettled(page, 12000);
        await sleep(1000);
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Performance.enable');
        const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
        const s0 = await page.evaluate(() => ({ ...window.__stage.stats }));
        const m0 = await metrics();
        await sleep(3000);
        const m1 = await metrics();
        const s1 = await page.evaluate(() => ({ ...window.__stage.stats }));
        const secs = 3;
        const row = {
          profile, route,
          taskMsPerSec: Number((((m1.TaskDuration - m0.TaskDuration) * 1000) / secs).toFixed(3)),
          scriptMsPerSec: Number((((m1.ScriptDuration - m0.ScriptDuration) * 1000) / secs).toFixed(3)),
          ticks: s1.ticks - s0.ticks,
          renders: s1.draws - s0.draws,
        };
        row.pass = row.taskMsPerSec <= 1 && row.ticks === 0 && row.renders === 0;
        rows.push(row);
        await ctx.close();
      }
    }
  } finally {
    await srv.close();
  }
  return { schema: 1, instrument: 'idle', pass: rows.every((r) => r.pass), displayHz: host.displayHz, renderer: host.gpuRenderer, rows, summary: `${host.displayHz} Hz; worst ${Math.max(...rows.map((r) => r.taskMsPerSec))} ms/s task time at rest; ticks and renders at rest: ${rows.reduce((n, r) => n + r.ticks + r.renders, 0)}` };
}

await cliMain(import.meta.url, run);
