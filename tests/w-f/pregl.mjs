// Pre-GL JS (budgets.md): the JavaScript the network delivered before the stage:gl-start mark, summed from the
// network log (encoded bytes over gzip from serve-dist), on the home page at D2 (full) and P2 (lite). <= 35 kB gz.
// Usage: node tests/w-f/pregl.mjs [--out pregl.json]
import { cliMain, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';

export async function run() {
  const srv = await serve();
  const rows = [];
  try {
    for (const profile of ['D2', 'P2']) {
      const ctx = await newContext(profile);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      const reqs = new Map();
      cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, { url: e.request.url, type: e.type, start: e.timestamp }));
      cdp.on('Network.responseReceived', (e) => { const r = reqs.get(e.requestId); if (r) { r.type = e.type; r.encoding = e.response.headers['content-encoding'] || e.response.headers['Content-Encoding'] || ''; } });
      cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.end = e.timestamp; } });
      await page.goto(`${srv.base}/`, { waitUntil: 'load' });
      await waitSettled(page, 15000);
      await sleep(500);
      // Bytes come from the CDP network log; the before/after split uses Resource Timing, which shares the page clock
      // with the stage:gl-start mark (CDP timestamps run on another clock).
      const timing = await page.evaluate(() => ({
        glStart: performance.getEntriesByName('stage:gl-start')[0]?.startTime ?? null,
        resources: performance.getEntriesByType('resource').map((r) => ({ url: r.name, start: r.startTime })),
      }));
      const startOf = (url) => timing.resources.find((r) => r.url === url)?.start ?? Infinity;
      const all = [...reqs.values()].filter((r) => r.type === 'Script' && r.bytes);
      const before = all.filter((r) => timing.glStart === null || startOf(r.url) < timing.glStart);
      const sum = before.reduce((n, r) => n + r.bytes, 0);
      rows.push({ profile, glStartMs: timing.glStart, scripts: all.map((r) => ({ url: r.url.replace(srv.base, ''), bytes: r.bytes, encoding: r.encoding, startedMs: Math.round(startOf(r.url)), preGL: before.includes(r) })), preGLBytes: sum, pass: sum <= 35_000 && sum > 0 });
      await ctx.close();
    }
  } finally {
    await srv.close();
  }
  return { schema: 1, suite: 'w-f/pre-gl-js', pass: rows.every((r) => r.pass), rows, summary: rows.map((r) => `${r.profile}: ${(r.preGLBytes / 1000).toFixed(2)} kB (gzip, encoded) before stage:gl-start at ${r.glStartMs === null ? 'no GL' : `${Math.round(r.glStartMs)} ms`}`).join(', ') };
}

await cliMain(import.meta.url, run);
