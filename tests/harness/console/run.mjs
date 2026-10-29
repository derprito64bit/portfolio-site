// Console instrument (W-D030, rt-verify B2). Two parts:
//   fixtures  five injected faults (throw, rejection, 404, failed request, shader error); the gate must catch 5 of 5,
//             and report the channel that caught each (GPU-free: CI runs this with --fixtures-only);
//   routes    the gate over the built routes at D2 and P2 (the home page is driven through raise, frames, open and close), which must be clean.
// Usage: npm run h:console -- [--fixtures-only] [--out console.json]
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { CI, CONSOLE_RE, NO3D, ROOT, cliMain, consoleGate, newContext, serve, sleep, waitSettled } from '../lib.mjs';

// '/' is also driven through the Viewfinder's own inputs: raise, step through frames, open a project, close, lower.
const FIXTURES = join(ROOT, 'tests/harness/console/fixtures');
const FAULTS = [
  { file: 'throw.html', expect: 'pageerror' },
  { file: 'rejection.html', expect: 'pageerror' },
  { file: '404.html', expect: 'response' },
  { file: 'failed-request.html', expect: 'requestfailed' },
  { file: 'shader-error.html', expect: 'console' },
];
const ROUTES = [
  { route: '/', expectStatus: [] },
  { route: '/404.html', expectStatus: [] },
  { route: '/nope/', expectStatus: [{ status: 404, url: /\/nope\/$/ }] },
];

function fixtureServer() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    const file = path.startsWith('/vendor/') ? join(ROOT, 'node_modules/three/build', path.slice(8)) : join(FIXTURES, path);
    if (!existsSync(file) || path === '/') {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) })));
}

export async function run(opts = {}) {
  const fixtures = [];
  const fx = await fixtureServer();
  try {
    for (const f of opts['routes-only'] ? [] : FAULTS) {
      const ctx = await newContext('D2', 'auto', { browser: 'chromium' }); // the fixtures need WebGL even when NO3D is set
      const page = await ctx.newPage();
      const gate = consoleGate(page);
      await page.goto(`${fx.base}/${f.file}`, { waitUntil: 'load' });
      await sleep(600);
      const v = gate.verdict();
      const channels = [...new Set(v.failures.map((x) => x.channel))];
      fixtures.push({ fault: f.file.replace('.html', ''), caught: !v.pass, expectedChannel: f.expect, channels, byExpectedChannel: channels.includes(f.expect), sample: v.failures[0]?.text.slice(0, 160) ?? null });
      await ctx.close();
    }
  } finally {
    await fx.close();
  }
  const caught = fixtures.filter((f) => f.caught).length;

  const routes = [];
  if (!opts['fixtures-only']) {
    const srv = await serve();
    try {
      for (const profile of ['D2', 'P2']) {
        for (const r of ROUTES) {
          const ctx = await newContext(profile);
          const page = await ctx.newPage();
          const gate = consoleGate(page, { expectStatus: r.expectStatus });
          await page.goto(srv.base + r.route, { waitUntil: 'load' });
          await waitSettled(page);
          // Software GL in CI renders the engine at 1 to 4 fps, so there the home page is only loaded; with H_NO3D (flat
          // frames, fast) or a real GPU it is driven through raise, frames, open and close.
          if (r.route === '/' && (!CI || NO3D)) {
            for (const [key, wait] of [['Enter', 2500], ['ArrowRight', 900], ['ArrowRight', 900], ['Enter', 2500], ['Escape', 1500], ['Escape', 2500]]) {
              await page.keyboard.press(key);
              await sleep(wait);
            }
          } else await sleep(500);
          const v = gate.verdict();
          // With H_NO3D the page's own flat-frame notice is expected; any other warning or error still fails.
          if (NO3D) {
            v.failures = v.failures.filter((x) => !/^(\[viewfinder\] WebGL unavailable, using flat frames|unable to create webgl context)/.test(x.text));
            v.pass = v.failures.length === 0;
          }
          routes.push({ profile, route: r.route, pass: v.pass, events: v.events, failures: v.failures.map((x) => `${x.channel}/${x.level}: ${x.text.slice(0, 200)}`) });
          await ctx.close();
        }
      }
    } finally {
      await srv.close();
    }
  }
  const routesClean = routes.every((r) => r.pass);
  return {
    schema: 1, instrument: 'console', pass: (opts['routes-only'] || caught === FAULTS.length) && routesClean, regex: CONSOLE_RE.source,
    fixtures, caught: `${caught}/${FAULTS.length}`, routes,
    summary: `faults caught ${caught}/${FAULTS.length}${routes.length ? `; routes clean ${routes.filter((r) => r.pass).length}/${routes.length}` : ''}`,
  };
}

await cliMain(import.meta.url, run);
