// Shared harness library (GES-1, W-D030). Every instrument in tests/harness/* and scripts/crew.mjs uses it.
// Browsers: Chromium runs as the installed Chrome (channel 'chrome', new headless, real GPU) on the reference host and
// as Playwright's Chromium in CI; WebKit is Playwright's. Audio is always muted. Pages come from scripts/serve-dist.mjs.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { startServer } from '../../scripts/serve-dist.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const CI = Boolean(process.env.CI);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- GES-1 device profiles (W-D030)
const mouse = (width, height, dpr) => ({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: false, isMobile: false, input: 'mouse' });
const touch = (width, height, dpr, isMobile) => ({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true, isMobile, input: 'touch' });
export const PROFILES = {
  D1: { ...mouse(1920, 1080, 1), browser: 'chromium' },
  D2: { ...mouse(1440, 900, 2), browser: 'chromium' },
  D3: { ...mouse(1280, 800, 1), browser: 'chromium' },
  T1: { ...touch(1024, 1366, 2, false), browser: 'chromium' },
  T2: { ...touch(768, 1024, 2, false), browser: 'chromium' },
  P1: { ...touch(430, 932, 3, true), browser: 'chromium' },
  P2: { ...touch(390, 844, 3, true), browser: 'chromium' },
  'WK-P2': { ...touch(390, 844, 3, true), browser: 'webkit' },
  'WK-T2': { ...touch(768, 1024, 2, false), browser: 'webkit' },
  S1: { ...mouse(1366, 640, 1), browser: 'chromium' },
  S2: { ...touch(390, 664, 3, true), browser: 'chromium' },
  R1: { ...touch(320, 640, 2, true), browser: 'chromium', only: ['static', 'axe'] },
  // 200% zoom: half the CSS viewport at twice the device pixels.
  'Z-D2': { ...mouse(720, 450, 4), browser: 'chromium', zoom: 2 },
  'Z-P2': { ...touch(195, 422, 6, true), browser: 'chromium', zoom: 2 },
};
export const MODES = ['auto', 'static', 'reduced'];
/** The tier each profile must report in auto mode: mouse full (or a logged probe demotion), touch lite. */
export const expectedTier = (p) => (PROFILES[p].input === 'mouse' ? 'full' : 'lite');

export function routeUrl(base, route, mode, extra = '') {
  const q = new URLSearchParams(extra);
  if (mode === 'static') q.set('tier', 'static');
  const s = q.toString();
  return `${base}${route}${s ? `?${s}` : ''}`;
}

// ---------------------------------------------------------------- browsers
const ARGS = ['--mute-audio', '--autoplay-policy=user-gesture-required', '--ignore-gpu-blocklist'];
const launched = new Map();
export async function browser(name = 'chromium') {
  if (launched.has(name)) return launched.get(name);
  const b = name === 'webkit'
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ headless: true, args: ARGS, ...(CI || process.env.PW_BUNDLED ? {} : { channel: 'chrome' }) });
  launched.set(name, b);
  return b;
}
export async function closeBrowsers() {
  for (const b of launched.values()) await b.close().catch(() => {});
  launched.clear();
}

export async function newContext(profileName, mode = 'auto', extra = {}) {
  const p = PROFILES[profileName];
  const b = await browser(p.browser);
  return b.newContext({
    viewport: p.viewport,
    deviceScaleFactor: p.deviceScaleFactor,
    hasTouch: p.hasTouch,
    isMobile: p.browser === 'webkit' ? false : p.isMobile,
    reducedMotion: mode === 'reduced' ? 'reduce' : 'no-preference',
    colorScheme: extra.colorScheme ?? 'light',
    forcedColors: extra.forcedColors ?? 'none',
    serviceWorkers: 'block',
    ...extra.context,
  });
}

// ---------------------------------------------------------------- server
export async function serve(root = join(ROOT, 'dist')) {
  if (!existsSync(join(root, 'index.html'))) throw new Error(`harness: ${root} has no index.html; run npm run build`);
  const server = await startServer({ root, port: 0, quiet: true });
  const { port } = server.address();
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

// ---------------------------------------------------------------- console gate (W-D030)
export const CONSOLE_RE = /\b(error|exception|uncaught|failed|GL_INVALID|CONTEXT_LOST|VALIDATE_STATUS)\b/i;
export function loadAllowlist() {
  const file = join(ROOT, 'tests/harness/console-allow.json');
  const list = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).allow : [];
  const today = new Date().toISOString().slice(0, 10);
  return list.filter((a) => !a.expiry || a.expiry >= today).map((a) => ({ ...a, re: new RegExp(a.regex) }));
}

/**
 * Attach the console gate to a page. Collects every console level, pageerror, requestfailed and every response of 400
 * or more. verdict() fails on errors, page errors, failed requests, unexpected statuses, regex hits and warnings that
 * are not on the dated allowlist. expectStatus lets a test accept a known status for a URL (the 404 route itself).
 */
export function consoleGate(page, { expectStatus = [] } = {}) {
  const allow = loadAllowlist();
  const events = [];
  page.on('console', (m) => events.push({ channel: 'console', level: m.type(), text: m.text() }));
  page.on('pageerror', (e) => events.push({ channel: 'pageerror', level: 'error', text: String(e?.stack || e) }));
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    if (/ERR_ABORTED/.test(why) && r.resourceType() !== 'document') return; // navigation cancels in-flight fetches by design
    events.push({ channel: 'requestfailed', level: 'error', text: `${r.method()} ${r.url()} ${why}` });
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    const expected = expectStatus.some((e) => e.status === r.status() && e.url.test(r.url()));
    events.push({ channel: 'response', level: expected ? 'info' : 'error', text: `${r.status()} ${r.url()}`, expected });
  });
  return {
    events,
    verdict() {
      const failures = [];
      const expectedStatuses = new Set(events.filter((e) => e.channel === 'response' && e.expected).map((e) => Number(e.text.split(' ')[0])));
      for (const e of events) {
        const allowed = allow.find((a) => a.re.test(e.text));
        if (e.channel === 'response' && e.expected) continue;
        // Chrome echoes every 4xx response to the console; an expected status covers its echo.
        const echo = e.channel === 'console' && e.text.match(/Failed to load resource: the server responded with a status of (\d+)/);
        if (echo && expectedStatuses.has(Number(echo[1]))) continue;
        if (e.channel !== 'console') failures.push(e);
        else if (e.level === 'error') failures.push(e);
        else if (CONSOLE_RE.test(e.text) && !allowed) failures.push(e);
        else if ((e.level === 'warning' || e.level === 'warn') && !allowed) failures.push(e);
      }
      return { pass: failures.length === 0, failures, events: events.length };
    },
  };
}

// ---------------------------------------------------------------- stage helpers
export async function waitSettled(page, timeout = 10000) {
  try {
    await page.waitForFunction(() => window.__stage && window.__stage.settled === true, null, { timeout, polling: 100 });
    return true;
  } catch {
    return false;
  }
}
export async function stageState(page) {
  return page.evaluate(() => {
    const s = window.__stage;
    if (!s) return null;
    return { tier: s.tier, tierReason: s.tierReason, tierLog: s.tierLog, motion: s.motion, glState: s.glState, settled: s.settled, stats: { ...s.stats }, marks: s.marks(), renderer: s.gl?.rendererName ?? null, probe: s.gl?.probe ?? null };
  });
}
export const SOFTWARE_RENDERER = /SwiftShader|llvmpipe|softpipe|Basic Render|Software/i;

// ---------------------------------------------------------------- the LCP element (W-D030, budgets.md)
/**
 * The LCP element of a Lighthouse report. Lighthouse 13 reports it as the node item of lcp-breakdown-insight; the
 * largest-contentful-paint-element audit (Lighthouse 12 and older) is the fallback. Null when neither has a node.
 */
export function lcpElementOf(lhr) {
  const insight = lhr?.audits?.['lcp-breakdown-insight']?.details?.items?.find((x) => x?.type === 'node');
  const legacy = lhr?.audits?.['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node;
  const node = insight ?? (legacy?.type === 'node' || legacy?.snippet ? legacy : null);
  if (!node) return null;
  return { source: insight ? 'lcp-breakdown-insight' : 'largest-contentful-paint-element', selector: node.selector ?? null, snippet: node.snippet ?? null, nodeLabel: node.nodeLabel ?? null };
}
const isH1 = (e) => /^<h1[\s>]/i.test(e.snippet ?? '') || /(^|[\s>])h1(?=[#.[:]|$)/i.test(String(e.selector ?? '').split('>').pop().trim());
/** Print 1's DOM still carries data-lcp="print-1" (the marker W-S1's hero puts on it); Lighthouse's snippet shows it. */
const isPrint1Still = (e) => /\bdata-lcp="print-1"/.test(e.snippet ?? '');
/**
 * budgets.md: the LCP element is the h1 on mouse profiles (Lighthouse desktop), or the h1 or print 1's still on touch
 * profiles (Lighthouse mobile). Returns { ok, why }.
 */
export function lcpElementVerdict(el, formFactor) {
  if (!el) return { ok: false, why: 'no LCP element in the report' };
  const ok = formFactor === 'desktop' ? isH1(el) : isH1(el) || isPrint1Still(el);
  return ok ? { ok: true, why: null } : { ok: false, why: `LCP element ${el.selector ?? el.snippet} is not ${formFactor === 'desktop' ? 'the h1' : "the h1 or print 1's still"}` };
}

// ---------------------------------------------------------------- evidence
export function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
export function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
  return path;
}
export function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
/**
 * The evidence root: EVIDENCE_ROOT, else the first portfolio-evidence folder beside the repo or beside any folder
 * above it (a crew worktree lives in ../portfolio-site.wt/<id>, two levels below the GitHub folder).
 */
export function evidenceRoot() {
  if (process.env.EVIDENCE_ROOT) return resolve(process.env.EVIDENCE_ROOT);
  for (let dir = resolve(ROOT, '..'); ; dir = dirname(dir)) {
    const candidate = join(dir, 'portfolio-evidence');
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return resolve(ROOT, '..', 'portfolio-evidence');
  }
}
export function evidenceDir(crew = 'W-F', wave = 'wave3a', role = 'crew') {
  return join(evidenceRoot(), wave, crew, gitSha().slice(0, 7), role);
}
export function cliOpts(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      out[k] = v ?? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true);
    } else out._.push(a);
  }
  return out;
}

/** Host facts for the GES-1 manifest (cores describe the host, never a tier input). */
export async function hostInfo() {
  const b = await browser('chromium');
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { renderer: 'none', type: 'none' };
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return { renderer, type: /Direct3D11|D3D11/.test(renderer) ? 'Direct3D11' : /Vulkan/.test(renderer) ? 'Vulkan' : /OpenGL/.test(renderer) ? 'OpenGL' : 'unknown' };
  });
  // Display refresh: median rAF interval over 60 frames in a blank page (harness page, not site code).
  const hz = await page.evaluate(() => new Promise((res) => {
    const t = [];
    const f = (ts) => { t.push(ts); if (t.length < 61) window.requestAnimationFrame(f); else { const d = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b); res(Math.round(1000 / d[30])); } };
    window.requestAnimationFrame(f);
  }));
  await ctx.close();
  return { os: `${os.type()} ${os.release()}`, gpuRenderer: gpu.renderer, graphicsDeviceType: gpu.type, displayHz: hz, cores: os.cpus().length };
}

export async function toolVersions() {
  const chrome = (await browser('chromium')).version();
  let wk = 'not run';
  try {
    wk = (await browser('webkit')).version();
  } catch {
    wk = 'unavailable';
  }
  const ver = (p) => {
    try {
      return JSON.parse(readFileSync(join(ROOT, 'node_modules', p, 'package.json'), 'utf8')).version;
    } catch {
      return 'missing';
    }
  };
  return { chrome, webkit: wk, playwright: ver('@playwright/test'), lighthouse: '13.5.0', axe: ver('axe-core'), node: process.version };
}

export const AGENT = { model: 'claude-opus-5-5', effort: 'xhigh' };

/** Build a GES-1 manifest for the given items and write it. */
export async function writeManifest(dir, items, extra = {}) {
  const manifest = {
    schema: 1,
    track: 'W',
    crew: extra.crew ?? 'W-F',
    sha: gitSha(),
    createdAt: new Date().toISOString(),
    host: await hostInfo(),
    tools: await toolVersions(),
    agent: AGENT,
    ...extra.fields,
    items,
  };
  return writeJson(join(dir, extra.name ?? 'manifest.json'), manifest);
}

/**
 * Standard instrument entry point: `node tests/harness/<name>/run.mjs [--out file.json] [...]`.
 * Runs `fn(opts)`, which returns { pass, ... }; writes the JSON when --out is given; exits 1 on FAIL.
 */
export async function cliMain(metaUrl, fn) {
  if (!process.argv[1] || resolve(process.argv[1]) !== fileURLToPath(metaUrl)) return;
  const opts = cliOpts();
  let result;
  try {
    result = await fn(opts);
  } catch (e) {
    result = { pass: false, error: String(e?.stack || e) };
  } finally {
    await closeBrowsers();
  }
  if (opts.out) writeJson(resolve(opts.out), result);
  const name = fileURLToPath(metaUrl).split(/[\\/]/).slice(-2, -1)[0];
  console.log(`${name}: ${result.pass ? 'PASS' : 'FAIL'}${result.summary ? `  ${result.summary}` : ''}${result.error ? `\n${result.error}` : ''}`);
  if (opts.verbose) console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.pass ? 0 : 1;
}

/** One manifest item for a file on disk. */
export function item(dir, relPath, fields) {
  const file = join(dir, relPath);
  return { path: relPath.replaceAll('\\', '/'), sha256: existsSync(file) ? sha256(readFileSync(file)) : null, ...fields };
}
