// Shared harness library (GES-1, W-D030). Every instrument in tests/harness/* and scripts/crew.mjs uses it.
// Browsers: Chromium runs as the installed Chrome (channel 'chrome', new headless, real GPU) on the reference host and
// as Playwright's Chromium in CI; WebKit is Playwright's. Audio is always muted. Pages come from scripts/serve-dist.mjs.
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from '@playwright/test';
import { startServer } from '../../scripts/serve-dist.mjs';
import budgetsCjs from '../../scripts/check/budgets.cjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** The json budgets block of docs/agents/budgets.md (readBudgets) and one number from it by path (budget). */
export const { readBudgets, budget } = budgetsCjs;
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
/**
 * The shared browsers. Three Chromium variants for single checks: 'chromium-no3d' (--disable-3d-apis: WebGL2's
 * constructor exists, no context can be made, #61), 'chromium-scrollbars' (classic scrollbars that take room,
 * without Playwright's --hide-scrollbars, #59) and 'chromium-bfcache' (the back/forward cache on: Playwright launches
 * Chromium with --disable-back-forward-cache, so Back is otherwise always a fresh load).
 */
export async function browser(name = 'chromium') {
  if (launched.has(name)) return launched.get(name);
  const chrome = (extra = {}) => chromium.launch({ headless: true, args: [...ARGS, ...(extra.args ?? [])], ...(extra.ignoreDefaultArgs ? { ignoreDefaultArgs: extra.ignoreDefaultArgs } : {}), ...(CI || process.env.PW_BUNDLED ? {} : { channel: 'chrome' }) });
  const b = name === 'webkit'
    ? await webkit.launch({ headless: true })
    : name === 'chromium-no3d'
      ? await chrome({ args: ['--disable-3d-apis'] })
      : name === 'chromium-scrollbars'
        ? await chrome({ ignoreDefaultArgs: ['--hide-scrollbars'] })
        : name === 'chromium-bfcache'
          ? await chrome({ ignoreDefaultArgs: ['--disable-back-forward-cache'] })
          : await chrome();
  launched.set(name, b);
  return b;
}
export async function closeBrowsers() {
  for (const b of launched.values()) await b.close().catch(() => {});
  launched.clear();
}

export async function newContext(profileName, mode = 'auto', extra = {}) {
  const p = PROFILES[profileName];
  const b = await browser(extra.browser ?? p.browser);
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
// W-D030's words, as amended (Orchestrator ruling on #11, 6020160705; decisions.md W-D030 (amended)): GL_INVALID and
// CONTEXT_LOST are prefixes. Real messages carry them as GL_INVALID_OPERATION, GL_INVALID_ENUM or CONTEXT_LOST_WEBGL,
// where the literal \bGL_INVALID\b never matches ('_' is a word character), so the literal form would let every one
// of them through below the error level.
export const CONSOLE_RE = /\b(error|exception|uncaught|failed|GL_INVALID\w*|CONTEXT_LOST\w*|VALIDATE_STATUS)\b/i;

/** True for a zero-padded YYYY-MM-DD that names a real calendar day. */
export function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
/**
 * Lines no allowlist entry may match. An entry is tested against one whole line of a message (anchored), so one that
 * matches any of these (nothing, whitespace, one character, a bare word, a generic sentence, another compiler warning,
 * three's log prefixes with and without their trailing space and with a real warning after them, a long line) would let
 * unrelated text through: it is too broad to be an allowlist line.
 */
export const ALLOW_BREADTH_PROBES = [
  '', ' ', 'x', '0', 'warning', 'Warning: something happened', 'THREE.WebGLProgram: Program Info Log:',
  'THREE.WebGLProgram: Program Info Log: ', 'THREE.WebGLRenderer: ', 'THREE.WebGLRenderer: an unrelated warning',
  'THREE.WebGLProgram: Program Info Log: (1,1): warning X3571: pow(f, e) will not work for negative f',
  'THREE.WebGLRenderer: Texture marked for update but no image data found.',
  'THREE.WebGLRenderer: A WebGL context could not be created. Reason: Web page caused context loss and was blocked',
  '(1,1): warning X3571: pow(f, e) will not work for negative f',
  '(12,3-40): warning X3557: loop only executes for 1 iteration(s), forcing loop to unroll',
  'The quick brown fox jumps over the lazy dog', 'x'.repeat(240), 'x'.repeat(241), 'x'.repeat(4096),
  `${'A long, unrelated warning line from some library, repeated. '.repeat(20).trim()}`,
];
/**
 * Unrelated text an entry's regex must not accept around its own diagnostic (round-3 must-fix allowlist-breadth; W-D030:
 * an entry lists one diagnostic, not any line that names its code). validateAllowEntry puts each of these before and
 * after every example line and around the literal alone; a regex that matches any such line could pass a line that only
 * mentions the code (three's own 'Texture marked for update but no image data found. (see warning X4122)', a library's
 * 'see warning X4122 in the docs'), so it throws at load. Lines are trimmed before they are judged, so there is no
 * whitespace-only text here.
 */
export const ALLOW_WRAP_BEFORE = ['x', 'x '.repeat(30).trim(), 'warning ', 'THREE.WebGLRenderer: ', 'THREE.WebGLRenderer: Texture marked for update but no image data found. (see ', 'Some library: deprecated option used; see '];
export const ALLOW_WRAP_AFTER = ['x', ` ${'x '.repeat(30).trim()}`, ')', ' in the docs', '. (see the console)'];
export function allowWrapProbes(literal, lines) {
  const out = [];
  for (const b of ALLOW_WRAP_BEFORE) {
    out.push(b + literal);
    for (const a of ALLOW_WRAP_AFTER) out.push(b + literal + a);
    for (const l of lines) out.push(b + l);
  }
  for (const a of ALLOW_WRAP_AFTER) {
    out.push(literal + a);
    for (const l of lines) out.push(l + a);
  }
  return out;
}
/** The lines of a console message an allowlist entry is judged on: trimmed, blank lines dropped. */
export const messageLines = (text) => String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
/** The shortest `literal` an entry may name (W-D030 allowlist; round-2 should-fix S3). */
export const ALLOW_LITERAL_MIN = 10;

/**
 * The dated allowlist (W-D030: regex, reason, added-by, expiry), checked for form, not only presence: a malformed
 * entry throws, so every gate built on it fails loudly instead of letting an entry stay in force.
 * - regex, reason, addedBy, literal and example are non-empty strings; the regex compiles and is anchored to one whole
 *   line here;
 * - expiry is a zero-padded YYYY-MM-DD that names a real day (so the comparison with `today` is a date comparison);
 * - the regex matches none of ALLOW_BREADTH_PROBES (a catch-all such as '.', '.*', '.{241,}' or 'warning.*' throws);
 * - `literal` is the fixed text every allowed line must contain (round-2 should-fix S3: breadth is not left to a probe
 *   list alone): at least ALLOW_LITERAL_MIN characters with a digit in it (a diagnostic code such as 'warning X4122'),
 *   found in no probe line, and a line passes the entry only when it matches the regex AND contains the literal;
 * - `example` (one real message) must have every line match the entry, contain the literal, and hold no CONSOLE_RE word;
 * - the regex matches no line that puts unrelated text before or after the example's lines or the literal
 *   (allowWrapProbes: '.*warning X4122.*' and its bounded forms throw).
 * Every new entry is reviewed (tests/harness/README.md). Returns the entries still in force on `today`; an expired
 * entry stops matching.
 */
export function loadAllowlist(today = new Date().toISOString().slice(0, 10), file = join(ROOT, 'tests/harness/console-allow.json')) {
  if (!isIsoDate(today)) throw new Error(`console allowlist: today '${today}' is not a YYYY-MM-DD date`);
  if (!existsSync(file)) return [];
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(doc?.allow)) throw new Error(`console allowlist ${file}: "allow" must be an array`);
  return doc.allow.map((a, i) => validateAllowEntry(a, i)).filter((a) => a.expiry >= today);
}
export function validateAllowEntry(a, i = 0) {
  const where = `console allowlist entry ${i}`;
  for (const k of ['regex', 'reason', 'addedBy', 'expiry', 'literal', 'example']) {
    if (typeof a?.[k] !== 'string' || !a[k].trim()) throw new Error(`${where}: "${k}" must be a non-empty string`);
  }
  if (!isIsoDate(a.expiry)) throw new Error(`${where}: expiry '${a.expiry}' is not a zero-padded YYYY-MM-DD date`);
  let re;
  try {
    re = new RegExp(`^(?:${a.regex})$`);
  } catch (e) {
    throw new Error(`${where}: regex does not compile (${e.message})`);
  }
  const hit = ALLOW_BREADTH_PROBES.find((p) => re.test(p));
  if (hit !== undefined) throw new Error(`${where}: regex /${a.regex}/ is too broad (it matches the probe line ${JSON.stringify(hit.slice(0, 60))})`);
  const lit = a.literal;
  if (lit.length < ALLOW_LITERAL_MIN || !/\d/.test(lit)) throw new Error(`${where}: literal '${lit}' must be at least ${ALLOW_LITERAL_MIN} characters with a digit (a diagnostic code)`);
  const probeHit = ALLOW_BREADTH_PROBES.find((p) => p.includes(lit));
  if (probeHit !== undefined) throw new Error(`${where}: literal '${lit}' is too generic (the probe line ${JSON.stringify(probeHit.slice(0, 60))} holds it)`);
  if (CONSOLE_RE.test(lit)) throw new Error(`${where}: literal '${lit}' holds a W-D030 failure word, which no entry can allow`);
  const lines = messageLines(a.example);
  if (!lines.length || !lines.every((l) => re.test(l))) throw new Error(`${where}: its example does not match the regex line by line`);
  if (!lines.every((l) => l.includes(lit))) throw new Error(`${where}: its example does not hold the literal '${lit}' on every line`);
  if (CONSOLE_RE.test(a.example)) throw new Error(`${where}: its example holds a W-D030 failure word, which no entry can allow`);
  // Breadth around the literal: unrelated text before or after the diagnostic must not match (allowWrapProbes).
  const wrapHit = allowWrapProbes(lit, lines).find((p) => re.test(p));
  if (wrapHit !== undefined) throw new Error(`${where}: regex /${a.regex}/ is too broad around its literal (it matches ${JSON.stringify(wrapHit.slice(0, 90))}, unrelated text around the diagnostic)`);
  return { ...a, re, allows: (line) => re.test(line) && line.includes(lit) };
}

/**
 * The console types that are error level (W-D030): Playwright reports a failed console.assert as 'assert', which
 * DevTools and Web Inspector both show as an error.
 */
export const ERROR_LEVELS = new Set(['error', 'assert']);
/**
 * The browser's echo of a 4xx/5xx response (Chromium and WebKit word it the same), built from the response itself: its
 * status and its own status text (the server's reason phrase, 'Not Found' from serve-dist). Only this exact text, as the
 * WHOLE message, is the echo; the parentheses hold nothing but that response's status text (round-3 must-fix
 * console-gate-error-level: free text there was never judged).
 */
export const responseEcho = (status, statusText) => `Failed to load resource: the server responded with a status of ${status} (${statusText})`;

/**
 * Attach the console gate to a page. Collects every console level (with the message's source URL), pageerror,
 * requestfailed and every response of 400 or more. verdict() fails on error-level messages (ERROR_LEVELS), page errors,
 * failed requests, unexpected statuses, any message with a CONSOLE_RE word (whatever the allowlist says: W-D030), and
 * warnings that are not wholly allowlisted: a warning passes only when every line of it matches an entry, so a
 * multi-line log (three logs a program's whole info log in one warning) cannot carry another warning through on an
 * allowed line. expectStatus lets a test accept a known status for a URL (the 404 route itself); the browser's echo of
 * that response is skipped only when it is the whole message, its status is the expected one and its source URL is a
 * response that status was expected for. `allow` replaces the allowlist (tests of the gate itself).
 */
export function consoleGate(page, { expectStatus = [], allow = loadAllowlist() } = {}) {
  const events = [];
  page.on('console', (m) => {
    let url = '';
    try {
      url = m.location?.()?.url ?? '';
    } catch {
      url = '';
    }
    events.push({ channel: 'console', level: m.type(), text: m.text(), url });
  });
  page.on('pageerror', (e) => events.push({ channel: 'pageerror', level: 'error', text: String(e?.stack || e) }));
  page.on('requestfailed', (r) => {
    const why = r.failure()?.errorText ?? '';
    if (/ERR_ABORTED/.test(why) && r.resourceType() !== 'document') return; // navigation cancels in-flight fetches by design
    events.push({ channel: 'requestfailed', level: 'error', text: `${r.method()} ${r.url()} ${why}` });
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    const expected = expectStatus.some((e) => e.status === r.status() && e.url.test(r.url()));
    let statusText = '';
    try {
      statusText = typeof r.statusText === 'function' ? String(r.statusText() ?? '') : '';
    } catch {
      statusText = '';
    }
    events.push({ channel: 'response', level: expected ? 'info' : 'error', text: `${r.status()} ${r.url()}`, status: r.status(), statusText, url: r.url(), expected });
  });
  return {
    events,
    verdict() {
      const failures = [];
      const expectedResponses = events.filter((e) => e.channel === 'response' && e.expected);
      /**
       * The echo of an expected response: exactly responseEcho(that status, that response's own status text) as the
       * whole message, from that response's URL, and the status text itself holds no W-D030 word (it is judged too).
       */
      const expectedEcho = (e) => e.url !== '' && expectedResponses.some((r) => r.url === e.url && e.text === responseEcho(r.status, r.statusText) && !CONSOLE_RE.test(r.statusText));
      const wholly = (text) => {
        const lines = messageLines(text);
        return lines.length > 0 && lines.every((l) => allow.some((a) => a.allows(l)));
      };
      for (const e of events) {
        if (e.channel === 'response' && e.expected) continue;
        if (e.channel === 'console' && expectedEcho(e)) continue;
        if (e.channel !== 'console') failures.push({ ...e, why: e.channel });
        else if (ERROR_LEVELS.has(e.level)) failures.push({ ...e, why: 'error level' });
        else if (CONSOLE_RE.test(e.text)) failures.push({ ...e, why: 'W-D030 failure word' });
        else if ((e.level === 'warning' || e.level === 'warn') && !wholly(e.text)) failures.push({ ...e, why: 'warning not wholly allowlisted' });
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

// ---------------------------------------------------------------- host load (budgets.md Measurement validity, #67)
const median = (xs) => {
  const s = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
export { median };

/** scripts/fleet/hostload.ps1 of this checkout (R1's precheck and R2's watch); null where it cannot run (not Windows). */
export const HOSTLOAD = process.platform === 'win32' ? join(ROOT, 'scripts/fleet/hostload.ps1') : null;

/**
 * Run hostload.ps1 with `args` (['-Out', f] for a precheck, ['-Watch', pid, '-Out', f] for a watch) and resolve with
 * { exitCode, json, file, stderr }. Exit 0 is clear, 75 is blocked (host: busy, flagged, incomplete, no-data or
 * uncalibrated), anything else (2: usage or read error) is a broken tool, which also counts as blocked (host).
 * Returns the child too, so a caller can start a watch and wait for it later.
 */
export function startHostload(args, { budgetsFile } = {}) {
  if (!HOSTLOAD || !existsSync(HOSTLOAD)) {
    return { child: null, done: Promise.resolve({ exitCode: null, json: null, file: null, stderr: `hostload.ps1 unavailable on ${process.platform}` }) };
  }
  const out = args[args.indexOf('-Out') + 1];
  const argv = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', HOSTLOAD, ...args.map(String), ...(budgetsFile ? ['-Budgets', budgetsFile] : [])];
  const child = spawn('powershell.exe', argv, { cwd: ROOT, windowsHide: true });
  let stderr = '';
  let stdout = '';
  child.stderr.on('data', (d) => (stderr += d));
  child.stdout.on('data', (d) => (stdout += d));
  const done = new Promise((res) => child.on('close', (code) => {
    let json = null;
    try {
      json = out && existsSync(out) ? JSON.parse(readFileSync(out, 'utf8').replace(/^﻿/, '')) : null;
    } catch {
      json = null;
    }
    res({ exitCode: code, json, file: out ?? null, stderr: (stderr || (code !== 0 && code !== 75 ? stdout : '')).trim().slice(-600) });
  }));
  return { child, done };
}

/**
 * R2: why a timed run is host-suspect, or [] when it is clean. `host` is the json budgets block's host key.
 * - its benchmarkIndex is below host.benchmarkIndex.suspectBelowRatio x host.benchmarkIndex.baseline;
 * - its -Watch file did not exit 0 (a flagged process, part of the run unwatched, missing samples), or is missing;
 * - the host key cannot judge it (a null baseline or ratio: uncalibrated).
 */
export function hostSuspectReasons({ benchmarkIndex, watch }, host) {
  const reasons = [];
  const base = host?.benchmarkIndex?.baseline;
  const ratio = host?.benchmarkIndex?.suspectBelowRatio;
  if (typeof base !== 'number' || typeof ratio !== 'number') reasons.push('host-suspect (R2): the host key has no calibrated benchmarkIndex baseline');
  else if (typeof benchmarkIndex !== 'number' || !Number.isFinite(benchmarkIndex)) reasons.push('host-suspect (R2): no lhr.environment.benchmarkIndex');
  else if (benchmarkIndex < ratio * base) reasons.push(`host-suspect (R2): benchmarkIndex ${benchmarkIndex} < ${ratio} x baseline ${base} (${Math.round(ratio * base * 10) / 10})`);
  if (!watch) reasons.push('host-suspect (R2): no hostload -Watch file for this run');
  else if (watch.exitCode !== 0) {
    const why = (watch.json?.reasons ?? []).slice(0, 3).join('; ') || watch.stderr || `exit ${watch.exitCode}`;
    reasons.push(`host-suspect (R2): -Watch ${watch.json?.verdict ?? 'failed'} (exit ${watch.exitCode}): ${why}`);
  }
  return reasons;
}

/**
 * R3 and R5 for one timed set, as a pure step function. `runs` are the runs so far, each { suspect: [reasons] };
 * `need` the clean runs the set must reach; `extraMax` the host key's extraRunsPerSetMax. Returns what to do next:
 * 'run' (take another run), 'done' (enough clean runs) or 'blocked' (the extra runs are spent, R3).
 */
export function setStep(runs, need, extraMax) {
  const clean = runs.filter((r) => !r.suspect.length).length;
  const replaced = runs.length - clean;
  if (clean >= need) return { next: 'done', clean, replaced };
  if (replaced > extraMax) return { next: 'blocked', clean, replaced, why: `only ${clean} of ${need} clean runs after ${replaced} host-suspect runs (extraRunsPerSetMax ${extraMax}): blocked (host), R3` };
  return { next: 'run', clean, replaced };
}

/**
 * The Lighthouse budget a run is judged on, from the json budgets block: maximums (lcp, tbt, cls) and minimums
 * (performance, accessibility, bestPractices; scores 0 to 1).
 */
export function lighthouseBudget(site, ff) {
  return {
    performance: (ff === 'mobile' ? site.lighthouse.perfMobileMin : site.lighthouse.perfDesktopMin) / 100,
    accessibility: site.lighthouse.a11yMin / 100,
    bestPractices: site.lighthouse.bestPracticesMin / 100,
    lcp: site.lcpMs[ff], tbt: site.tbtMs, cls: site.clsMax,
  };
}
const LH_MAX = ['lcp', 'tbt', 'cls'];
const LH_MIN = ['performance', 'accessibility', 'bestPractices'];
/** R5: the budgets one run is past: above a maximum or below a minimum. */
export function pastBudget(run, budget) {
  return [...LH_MAX.filter((k) => run[k] > budget[k]), ...LH_MIN.filter((k) => run[k] < budget[k])];
}
/**
 * R5 for a set that reached its run count: grow it to host.rules.nearBudgetRuns when a clean median is at or above
 * nearBudgetPct of a maximum, or any clean run is past a budget (above a maximum or below a minimum).
 */
export function r5Grow(clean, budget, rules, need) {
  if (need >= rules.nearBudgetRuns) return { grow: false };
  const near = rules.nearBudgetPct / 100;
  const nearMax = LH_MAX.filter((k) => median(clean.map((r) => r[k])) >= near * budget[k]);
  const past = clean.filter((r) => pastBudget(r, budget).length);
  if (!nearMax.length && !past.length) return { grow: false };
  const why = past.length
    ? `${past.length} clean run(s) past a budget (${[...new Set(past.flatMap((r) => pastBudget(r, budget)))].join(', ')})`
    : `a median at or above ${rules.nearBudgetPct}% of a maximum (${nearMax.join(', ')})`;
  return { grow: true, from: need, to: rules.nearBudgetRuns, why };
}
/**
 * The set's report over its clean runs (R3: replaced runs never count; R5: the median of all, the worst run and the
 * count past budget). Every metric's median is the median of all clean runs (the mean of the two middle values for an
 * even count). The median run (its renderer, tier and LCP element) is the lower-scoring of the two middle runs for an
 * even count, never the better one. The worst run is the lowest performance score (ties: the slowest LCP); `worst`
 * also gives each metric's worst value and its run.
 */
export function lighthouseSetSummary(clean, budget) {
  if (!clean.length) return { medians: null, medianRun: null, worst: null, worstRun: null, pastBudget: { count: 0, runs: [] } };
  const keys = [...LH_MIN, ...LH_MAX, 'fcp'];
  const medians = Object.fromEntries(keys.map((k) => [k, median(clean.map((r) => r[k]))]));
  const byScore = [...clean].sort((a, b) => a.performance - b.performance || b.lcp - a.lcp);
  const medianRun = byScore[Math.ceil(byScore.length / 2) - 1];
  const worstOf = (k, max) => clean.reduce((w, r) => ((max ? r[k] > w[k] : r[k] < w[k]) ? r : w), clean[0]);
  const worst = Object.fromEntries([...LH_MAX.map((k) => [k, true]), ...LH_MIN.map((k) => [k, false])].map(([k, max]) => {
    const r = worstOf(k, max);
    return [k, { run: r.run, value: r[k] }];
  }));
  const past = clean.map((r) => ({ run: r.run, past: pastBudget(r, budget) })).filter((x) => x.past.length);
  return { medians, medianRun, worst, worstRun: byScore[0].run, pastBudget: { count: past.length, runs: past } };
}
/**
 * The manifest items of a set's prechecks (R1). A busy try that a later try of the same precheck cleared is a wait,
 * not a blocked (host) item; only the last try of a precheck that never cleared blocks the set.
 */
export function precheckItems(prechecks) {
  return prechecks.flatMap((p) => p.tries.map((t, i) => {
    const last = i === p.tries.length - 1;
    if (t.exitCode === 0) return { ...t, pass: true };
    if (!last) return { ...t, pass: null, waited: true };
    return { ...t, pass: null, blocked: 'host' };
  }));
}
/**
 * R1 after one precheck try: 'run' (exit 0), 'wait' (exit 75 and another try still fits in the wait) or 'blocked'.
 * A broken tool (any other exit) and an uncalibrated host key block at once: waiting cannot change either (the
 * brief's MISSING TOOLS rule).
 */
export function precheckNext({ exitCode, verdict }, elapsedMs, waitMs, retryMs = 60000) {
  if (exitCode === 0) return 'run';
  if (exitCode !== 75 || verdict === 'uncalibrated') return 'blocked';
  return elapsedMs + retryMs <= waitMs ? 'wait' : 'blocked';
}
/**
 * R1's wait: "Exit 75 ... means wait and check again for up to 30 minutes". The block's host.rules.precheckWaitMin when
 * it has one, else the minutes R1's sentence in budgets.md names; --precheck-wait overrides both (0 = no wait).
 */
export function precheckWaitMin(option, host = readBudgets().host, md = readFileSync(join(ROOT, 'docs/agents/budgets.md'), 'utf8')) {
  if (option !== undefined && option !== true && Number.isFinite(Number(option))) return Number(option);
  if (typeof host?.rules?.precheckWaitMin === 'number') return host.rules.precheckWaitMin;
  const m = md.match(/\*\*R1, precheck\.\*\*[^\n]*?check again for up to (\d+) minutes/);
  if (!m) throw new Error("precheckWaitMin: budgets.md R1 names no wait ('check again for up to N minutes') and host.rules has no precheckWaitMin");
  return Number(m[1]);
}

/** Host facts for the GES-1 manifest (cores describe the host, never a tier input), with the set's host load (#67):
 * benchmarkIndex (the median of the clean timed runs), cpuBusyPct and gpu3dPct (the precheck's medians); null when
 * the command took no timed set. */
export async function hostInfo(load = {}) {
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
  return {
    os: `${os.type()} ${os.release()}`, gpuRenderer: gpu.renderer, graphicsDeviceType: gpu.type, displayHz: hz, cores: os.cpus().length,
    benchmarkIndex: load.benchmarkIndex ?? null, cpuBusyPct: load.cpuBusyPct ?? null, gpu3dPct: load.gpu3dPct ?? null,
    ...(load.source ? { hostLoadSource: load.source } : {}),
  };
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
  return { chrome, webkit: wk, playwright: ver('@playwright/test'), lighthouse: readBudgets().site.protocol.lighthouseVersion, axe: ver('axe-core'), node: process.version };
}

export const AGENT = { model: 'claude-opus-5-5', effort: 'xhigh' };

/**
 * Build a GES-1 manifest for the given items and write it. `extra.host` and `extra.tools` replace the probed host and
 * tool fields (crew.mjs --stub only: a test run measures nothing, so it launches no browser to describe the host).
 */
export async function writeManifest(dir, items, extra = {}) {
  const manifest = {
    schema: 1,
    track: 'W',
    crew: extra.crew ?? 'W-F',
    sha: gitSha(),
    createdAt: new Date().toISOString(),
    host: extra.host ?? (await hostInfo(extra.hostLoad)),
    tools: extra.tools ?? (await toolVersions()),
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
