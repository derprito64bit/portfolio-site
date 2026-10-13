// Pre-GL (budgets.md, D-005, W-D034).
//  1. bytes: the JavaScript the network delivered before the stage:gl-start mark, summed from the network log (encoded
//     bytes over gzip from serve-dist), on the home page at D2 (full) and P2 (lite). At most the json budgets block's
//     site.preGlJsKbGz.
//  2. order: on every tier and every boot path, first contentful paint comes before stage:gl-start and before the first
//     request for a GL chunk (gl.*.js, three.*.js), and stage:gl-start comes after the page could know about FCP (the
//     test records the first moment page script sees the FCP entry: a PerformanceObserver delivery or a
//     getEntriesByName call that returns it, as the stage's own check does). The static tier never starts GL. Each
//     GL case runs --repeat times (default 3). Fails if any run breaks the order, so the lite boot cannot slip back in
//     front of first paint when the hero lands.
// Usage: node tests/w-f/pregl.mjs [--out pregl.json] [--skip-bytes] [--repeat 3] [--cases D2:/,P2:/]
import { budget, cliMain, newContext, serve, sleep, waitSettled } from '../harness/lib.mjs';

const GL_CHUNK = /\/_astro\/(gl|three\.[a-z]+)\.[\w-]+\.js$/;

/** The order rule, pure so the self-test can exercise it. Times are ms on the page clock. */
export function orderVerdict(r) {
  if (r.tier === 'static') return r.glStart === null && r.glRequest === null ? 'pass' : 'GL started on the static tier';
  if (r.fcp === null) return 'no first-contentful-paint entry';
  if (r.glStart === null) return 'GL never started';
  if (r.glRequest === null) return 'no GL chunk request seen';
  if (!(r.glStart > r.fcp)) return `stage:gl-start at ${r.glStart} ms is not after FCP at ${r.fcp} ms`;
  if (!(r.glRequest > r.fcp)) return `GL chunk requested at ${r.glRequest} ms, not after FCP at ${r.fcp} ms`;
  if (r.fcpDelivered !== undefined && r.fcpDelivered !== null && !(r.glStart >= r.fcpDelivered)) return `stage:gl-start at ${r.glStart} ms came before the FCP entry was delivered at ${r.fcpDelivered} ms`;
  return 'pass';
}

const SELF_TEST = [
  [{ tier: 'lite', fcp: 100, glStart: 80, glRequest: 82 }, false],
  [{ tier: 'lite', fcp: 100, glStart: 120, glRequest: 99 }, false],
  [{ tier: 'full', fcp: 100, glStart: 100, glRequest: 101 }, false],
  [{ tier: 'lite', fcp: 100, glStart: null, glRequest: null }, false],
  [{ tier: 'static', fcp: 100, glStart: 300, glRequest: 301 }, false],
  [{ tier: 'lite', fcp: 100, glStart: 130, glRequest: 131 }, true],
  [{ tier: 'static', fcp: 100, glStart: null, glRequest: null }, true],
  [{ tier: 'lite', fcp: 100, fcpDelivered: 140, glStart: 120, glRequest: 121 }, false],
  [{ tier: 'lite', fcp: 100, fcpDelivered: 115, glStart: 120, glRequest: 121 }, true],
];

// Each case: profile, route, query, and an optional early touch on a [data-gl-boot] element at DOMContentLoaded
// (before first paint where the browser allows it), which exercises the lite touch path.
const CASES = [
  { profile: 'D2', route: '/', expect: 'full' },
  { profile: 'D2', route: '/work/project-01/', expect: 'full' },
  { profile: 'D2', route: '/bench/', expect: 'full' },
  { profile: 'D2', route: '/', query: 'tier=static', expect: 'static' },
  { profile: 'P2', route: '/', expect: 'lite' },
  { profile: 'P2', route: '/work/project-01/', expect: 'lite' },
  { profile: 'P2', route: '/bench/', expect: 'lite' },
  { profile: 'P2', route: '/', earlyTouch: true, expect: 'lite' },
  { profile: 'P2', route: '/', query: 'tier=static', expect: 'static' },
  { profile: 'T2', route: '/', expect: 'lite' },
  { profile: 'WK-P2', route: '/', expect: 'lite' },
  { profile: 'WK-P2', route: '/', earlyTouch: true, expect: 'lite' },
];

// Test-owned: when the FCP entry reaches page script (the earliest moment a page can act on first paint): the first
// of a PerformanceObserver delivery and a performance.getEntriesByName('first-contentful-paint') call that returns it
// (the stage's own check; an observer's callback task can run after it, behind frame work: measured 11 ms later on the
// P2 early-touch path).
const FCP_SEEN = `(() => {
  const seen = () => { if (window.__fcpDeliveredAt == null) window.__fcpDeliveredAt = performance.now(); };
  try {
    const get = performance.getEntriesByName.bind(performance);
    performance.getEntriesByName = function (name, type) {
      const r = get(name, type);
      if (name === 'first-contentful-paint' && r.length) seen();
      return r;
    };
    const po = new PerformanceObserver((list) => {
      if (!list.getEntriesByName('first-contentful-paint').length) return;
      seen();
      po.disconnect();
    });
    po.observe({ type: 'paint', buffered: true });
  } catch {}
})();`;

const EARLY_TOUCH = `document.addEventListener('DOMContentLoaded', () => {
  const el = document.createElement('div');
  el.setAttribute('data-gl-boot', 'test');
  document.body.prepend(el);
  window.__earlyTouchAt = performance.now();
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
}, { once: true });`;

async function bytes(srv) {
  const rows = [];
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
    rows.push({ profile, glStartMs: timing.glStart, scripts: all.map((r) => ({ url: r.url.replace(srv.base, ''), bytes: r.bytes, encoding: r.encoding, startedMs: Math.round(startOf(r.url)), preGL: before.includes(r) })), preGLBytes: sum, limitBytes: budget('site.preGlJsKbGz') * 1000, pass: sum <= budget('site.preGlJsKbGz') * 1000 && sum > 0 });
    await ctx.close();
  }
  return rows;
}

async function order(srv, cases, repeat) {
  const rows = [];
  for (const c of cases.flatMap((x) => Array.from({ length: x.expect === 'static' ? 1 : repeat }, (_, i) => ({ ...x, run: i + 1 })))) {
    const ctx = await newContext(c.profile);
    await ctx.addInitScript({ content: FCP_SEEN });
    if (c.earlyTouch) await ctx.addInitScript({ content: EARLY_TOUCH });
    const page = await ctx.newPage();
    await page.goto(`${srv.base}${c.route}${c.query ? `?${c.query}` : ''}`, { waitUntil: 'load' });
    // Lite may wait for its 5 s timer when no print slot is near; give every non-static case time to boot.
    if (c.expect !== 'static') {
      await page.waitForFunction(() => ['ready', 'failed'].includes(window.__stage?.glState), null, { polling: 100, timeout: 12000 }).catch(() => {});
    } else await sleep(1500);
    await waitSettled(page, 8000);
    const t = await page.evaluate((src) => {
      const re = new RegExp(src);
      const at = (name) => performance.getEntriesByName(name)[0]?.startTime ?? null;
      const gl = performance.getEntriesByType('resource').filter((r) => re.test(new URL(r.name).pathname));
      const why = performance.getEntriesByType('mark').find((m) => m.name.startsWith('stage:gl-start='))?.name.slice(15) ?? null;
      return {
        tier: window.__stage.tier, glState: window.__stage.glState, why,
        fcp: at('first-contentful-paint'), fcpDelivered: window.__fcpDeliveredAt ?? null, glStart: at('stage:gl-start'),
        glRequest: gl.length ? Math.min(...gl.map((r) => r.startTime)) : null,
        glChunks: gl.map((r) => ({ path: new URL(r.name).pathname, startMs: Math.round(r.startTime) })),
        domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventStart ?? null,
        earlyTouchAt: window.__earlyTouchAt ?? null,
      };
    }, GL_CHUNK.source);
    const verdict = orderVerdict(t);
    const tierOk = t.tier === c.expect;
    rows.push({
      ...c, ...t, verdict, tierOk,
      gapMs: t.fcp !== null && t.glStart !== null ? Math.round(t.glStart - t.fcp) : null,
      pass: verdict === 'pass' && tierOk && (c.expect === 'static' || t.glState === 'ready'),
    });
    await ctx.close();
  }
  return rows;
}

export async function run(opts = {}) {
  const selfTest = SELF_TEST.map(([r, want]) => ({ input: r, want, got: orderVerdict(r) === 'pass' })).map((x) => ({ ...x, pass: x.want === x.got }));
  const pick = opts.cases ? new Set(String(opts.cases).split(',')) : null;
  const cases = pick ? CASES.filter((c) => pick.has(`${c.profile}:${c.route}`)) : CASES;
  const srv = await serve();
  let rows = [];
  let orderRows = [];
  try {
    if (!opts['skip-bytes']) rows = await bytes(srv);
    orderRows = await order(srv, cases, Math.max(1, Number(opts.repeat) || 3));
  } finally {
    await srv.close();
  }
  const pass = rows.every((r) => r.pass) && orderRows.every((r) => r.pass) && selfTest.every((s) => s.pass);
  const fmt = (r) => `${r.profile} ${r.route}${r.query ? `?${r.query}` : ''}${r.earlyTouch ? ' +touch' : ''} #${r.run}: ${r.tier}, FCP ${r.fcp === null ? '-' : Math.round(r.fcp)} ms (delivered ${r.fcpDelivered === null ? '-' : Math.round(r.fcpDelivered)} ms), gl-start ${r.glStart === null ? '-' : `${Math.round(r.glStart)} ms (${r.why})`}, GL request ${r.glRequest === null ? '-' : `${Math.round(r.glRequest)} ms`}: ${r.verdict}`;
  return {
    schema: 2, suite: 'w-f/pre-gl', pass, rows, order: orderRows, selfTest,
    summary: [
      ...rows.map((r) => `${r.profile}: ${(r.preGLBytes / 1000).toFixed(2)} kB (gzip, encoded) before stage:gl-start at ${r.glStartMs === null ? 'no GL' : `${Math.round(r.glStartMs)} ms`}`),
      `order: ${orderRows.filter((r) => r.pass).length}/${orderRows.length} cases with FCP before GL`,
      `self-test ${selfTest.filter((s) => s.pass).length}/${selfTest.length}`,
    ].join(', '),
    detail: orderRows.map(fmt),
  };
}

await cliMain(import.meta.url, run);
