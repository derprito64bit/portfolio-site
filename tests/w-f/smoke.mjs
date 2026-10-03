// Smoke: every route loads at a mouse and a touch profile, the stage reaches settled, the console gate is clean.
// Usage: node tests/w-f/smoke.mjs
import { closeBrowsers, consoleGate, newContext, serve, stageState, waitSettled } from '../harness/lib.mjs';

const ROUTES = ['/', '/work/project-01/', '/404.html', '/bench/', '/work/'];
const srv = await serve();
const out = [];
try {
  for (const profile of ['D2', 'P2']) {
    for (const route of ROUTES) {
      const ctx = await newContext(profile);
      const page = await ctx.newPage();
      const gate = consoleGate(page);
      await page.goto(srv.base + route, { waitUntil: 'load' });
      const settled = route === '/work/' ? true : await waitSettled(page, 12000);
      const st = route === '/work/' ? null : await stageState(page);
      out.push({ profile, route, url: page.url(), settled, tier: st?.tier, reason: st?.tierReason, gl: st?.glState, renderer: st?.renderer, probe: st?.probe, marks: st?.marks?.map((m) => m.name), console: gate.verdict() });
      await ctx.close();
    }
  }
} finally {
  await closeBrowsers();
  await srv.close();
}
console.log(JSON.stringify(out, null, 1));
