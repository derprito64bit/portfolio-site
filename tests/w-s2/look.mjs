#!/usr/bin/env node
// W-S2 look: shots of / at named stops for a crew's own eyes (not evidence; the gate re-shoots with crew.mjs shoot).
// Usage: node tests/w-s2/look.mjs --out <dir> [--profiles D2,P2] [--query view=list] [--dist <dir>]
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { closeBrowsers, cliOpts, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';

const o = cliOpts();
const out = String(o.out ?? 'look');
mkdirSync(out, { recursive: true });
const srv = await serve(o.dist ? String(o.dist) : undefined);
try {
  for (const p of String(o.profiles ?? 'D2,P2').split(',')) {
    const ctx = await newContext(p, o.mode ? String(o.mode) : 'auto');
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => ['error', 'warning'].includes(m.type()) && logs.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    await page.goto(`${srv.base}/${o.query ? `?${o.query}` : ''}`, { waitUntil: 'load' });
    await waitSettled(page, 12000);
    for (const stop of String(o.stops ?? 'work,sheet').split(',')) {
      await page.evaluate((id) => document.getElementById(id)?.closest('section')?.scrollIntoView({ block: 'start' }), stop);
      await sleep(Number(o.wait ?? 600));
      await page.screenshot({ path: join(out, `${p}-${stop}${o.full ? '-full' : ''}.png`), fullPage: false });
    }
    if (o.full) await page.screenshot({ path: join(out, `${p}-page.png`), fullPage: true });
    const info = await page.evaluate(() => ({
      tier: window.__stage?.tier,
      gl: window.__stage?.glState,
      view: document.querySelector('section.sheet')?.dataset.view,
      prints: document.documentElement.dataset.prints + '|' + document.documentElement.dataset.dev,
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      h: document.documentElement.scrollHeight,
    }));
    console.log(p, JSON.stringify(info), logs.slice(0, 8));
    await ctx.close();
  }
} finally {
  await closeBrowsers();
  await srv.close();
}
