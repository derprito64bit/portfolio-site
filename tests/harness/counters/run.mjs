// Counters instrument (W-F acceptance, budgets.md "Idle"): with gate-owned counters (init.js via addInitScript),
//  1. idle: 0 rAF callbacks and 0 draws from 1 s to 4 s after the last input, matching __stage.stats (ticks, drawCalls);
//  2. match: over an active window (a scroll with GL drawing) the gate's counts equal __stage.stats exactly;
//  3. scroll: 0 getBoundingClientRect calls inside rAF over a 10 s scroll.
// Usage: npm run h:counters -- [--profiles D2,P2] [--routes /,/bench/] [--out counters.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, cliMain, newContext, serve, sleep, waitSettled } from '../lib.mjs';

const INIT = readFileSync(join(ROOT, 'tests/harness/counters/init.js'), 'utf8');
const snap = (page) => page.evaluate(() => ({ gate: { ...window.__gateCounters, deps: Object.values(window.__gateCounters.rafByDependency).reduce((x, y) => x + y, 0) }, stage: { ticks: window.__stage.stats.ticks, drawCalls: window.__stage.stats.drawCalls, draws: window.__stage.stats.draws }, now: performance.now() }));
// Polling by interval, never by rAF: the harness must not add frames to the counts it reads.
const waitUntil = (page, t) => page.waitForFunction((x) => performance.now() >= x, t, { polling: 50, timeout: 10000 });
const diff = (a, b) => ({
  gate: { raf: b.gate.raf - a.gate.raf, rafFromDependencies: b.gate.deps - a.gate.deps, draws: b.gate.draws - a.gate.draws, rectReadsInRaf: b.gate.rectReadsInRaf - a.gate.rectReadsInRaf },
  stage: { ticks: b.stage.ticks - a.stage.ticks, drawCalls: b.stage.drawCalls - a.stage.drawCalls, renders: b.stage.draws - a.stage.draws },
  ms: Math.round(b.now - a.now),
});

export async function run(opts = {}) {
  const profiles = String(opts.profiles || 'D2,P2').split(',');
  const routes = String(opts.routes || '/,/bench/').split(',');
  const srv = await serve();
  const rows = [];
  try {
    for (const profile of profiles) {
      for (const route of routes) {
        const ctx = await newContext(profile);
        await ctx.addInitScript({ content: INIT });
        const page = await ctx.newPage();
        await page.goto(srv.base + route, { waitUntil: 'load' });
        await waitSettled(page, 12000);
        await sleep(300);

        // 1. idle window: last input, then 1 s to 4 s after it.
        const { width, height } = page.viewportSize();
        await page.mouse.move(width / 2, height / 2);
        await page.mouse.move(width / 2 + 40, height / 2 + 10);
        await page.keyboard.press('Shift');
        const tInput = await page.evaluate(() => performance.now());
        await waitUntil(page, tInput + 1000);
        const a = await snap(page);
        await waitUntil(page, tInput + 4000);
        const b = await snap(page);
        const idle = diff(a, b);
        const idlePass = idle.gate.raf === 0 && idle.gate.draws === 0 && idle.stage.ticks === 0 && idle.stage.drawCalls === 0;

        // 2. active window: the gate and the stage must agree frame for frame.
        const c = await snap(page);
        for (let i = 0; i < 10; i++) {
          await page.mouse.wheel(0, i < 5 ? 240 : -240);
          await sleep(60);
        }
        await waitSettled(page, 8000);
        const d = await snap(page);
        const active = diff(c, d);
        const matchPass = active.gate.raf - active.gate.rafFromDependencies === active.stage.ticks && active.gate.draws === active.stage.drawCalls && active.gate.raf > 0;

        // 3. a 10 s scroll: no layout reads inside the ticker.
        const e = await snap(page);
        const t0 = Date.now();
        let dir = 1;
        while (Date.now() - t0 < 10000) {
          const y = await page.evaluate(() => [window.scrollY, document.documentElement.scrollHeight - window.innerHeight]);
          if (y[0] >= y[1] - 10) dir = -1;
          if (y[0] <= 10) dir = 1;
          await page.mouse.wheel(0, 180 * dir);
          await sleep(40);
        }
        await waitSettled(page, 8000);
        const f = await snap(page);
        const scroll = diff(e, f);
        const scrollPass = scroll.gate.rectReadsInRaf === 0;

        rows.push({ profile, route, tier: await page.evaluate(() => window.__stage.tier), idle, idlePass, active, matchPass, scroll, scrollPass, pass: idlePass && matchPass && scrollPass });
        await ctx.close();
      }
    }
  } finally {
    await srv.close();
  }
  const pass = rows.every((r) => r.pass);
  return {
    schema: 1, instrument: 'counters', pass, rows,
    summary: rows.map((r) => `${r.profile} ${r.route}: idle raf ${r.idle.gate.raf} draws ${r.idle.gate.draws}; active raf ${r.active.gate.raf}=${r.active.stage.ticks} draws ${r.active.gate.draws}=${r.active.stage.drawCalls}; scroll rect-in-raf ${r.scroll.gate.rectReadsInRaf}`).join(' | '),
  };
}

await cliMain(import.meta.url, run);
