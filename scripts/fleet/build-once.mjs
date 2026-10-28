#!/usr/bin/env node
// Build each commit once (system review 2026-10-13, flaw 11; PLAN.md tooling item): the verifiers of a round reuse one
// install and build of the head SHA, checked by hash, instead of each running npm ci and npm run build.
//
// Usage:
//   node scripts/fleet/build-once.mjs <sha> [--max 240]   make sure <sha> is built; prints the tree and the dist hash when ready
//   node scripts/fleet/build-once.mjs <sha> --verify      re-hash the tree's dist and compare it with build.json (exit 1 on a mismatch)
//   node scripts/fleet/build-once.mjs --list              list the builds
// <sha> is any commit in this repo, a merge-tree commit included (git commit-tree <tree> -p origin/main -p <head>).
//
// A build lives in <builds>\<sha7>\: tree\ (a detached git worktree at <sha>, with node_modules and dist), build.json
// ({ status, sha, distHash, files, builtAt, node }), build.log and builder.pid. <builds> is %FLEET_BUILDS%, else
// portfolio-site.wt\_builds beside the main checkout. The first caller starts a detached builder (npm ci, then npm run
// build), which waits while another agent holds the perf lane (PROTOCOL section 9: no npm ci or build during a timed
// set); every caller then waits at most --max s (clamped to 270, the wait rule) for it.
// Exit: 0 ready (or verified); 75 still building or waiting for the perf lane (call again); 1 the build failed (see
// build.log) or the hash does not match; 2 usage.
// Never edit a build tree. Run harnesses from it (their servers take port 0, so verifiers can share it) and write
// evidence elsewhere (--out <your evidence folder>).
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clampSec } from './wait-rule.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }).trim();
const MAIN = dirname(resolve(ROOT, git('rev-parse', '--path-format=absolute', '--git-common-dir')));
const BUILDS = process.env.FLEET_BUILDS || join(dirname(MAIN), 'portfolio-site.wt', '_builds');
const LANE = join(ROOT, 'scripts', 'fleet', 'lane.ps1');

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  else pos.push(argv[i]);
}
const die = (code, m) => {
  console.log(m);
  process.exit(code);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

/** sha256 over every dist file's relative path and content, in path order: one hash names the whole build output. */
export function distHash(dist) {
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const files = walk(dist).map((f) => relative(dist, f).replaceAll('\\', '/')).sort();
  const h = createHash('sha256');
  for (const f of files) h.update(`${f}\0${createHash('sha256').update(readFileSync(join(dist, f))).digest('hex')}\n`);
  return { hash: h.digest('hex'), files: files.length };
}

if (flags.list) {
  if (!existsSync(BUILDS)) die(0, `no builds in ${BUILDS}`);
  for (const d of readdirSync(BUILDS).sort()) {
    const b = readJson(join(BUILDS, d, 'build.json'));
    console.log(`${d}  ${b ? `${b.status} ${b.sha || ''} ${b.distHash ? b.distHash.slice(0, 12) : ''} ${b.builtAt || ''}` : 'no build.json'}`);
  }
  process.exit(0);
}

const ref = pos[0];
if (!ref) die(2, 'usage: build-once.mjs <sha> [--max 240] [--verify] | --list');
let sha;
try {
  sha = git('rev-parse', '--verify', `${ref}^{commit}`);
} catch {
  die(2, `build-once: ${ref} is not a commit in ${MAIN} (git fetch first?)`);
}
const dir = join(BUILDS, sha.slice(0, 7));
const tree = join(dir, 'tree');
const meta = join(dir, 'build.json');
const log = join(dir, 'build.log');
const pidFile = join(dir, 'builder.pid');

// ---- the detached builder ---------------------------------------------------------------------------------------
if (flags.builder) {
  const write = (o) => writeFileSync(meta, `${JSON.stringify({ sha, node: process.version, ...o }, null, 2)}\n`);
  const step = (name, cmd, args, cwd) => {
    write({ status: 'building', step: name });
    const r = spawnSync(cmd, args, { cwd, stdio: ['ignore', openSync(log, 'a'), openSync(log, 'a')], shell: process.platform === 'win32' });
    if (r.status !== 0) {
      write({ status: 'failed', step: name, code: r.status });
      process.exit(1);
    }
  };
  // No npm ci or build while another agent's timed set runs (the perf lane); re-check every 30 s.
  for (;;) {
    const st = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', LANE, 'status'], { encoding: 'utf8' });
    const held = /^perf\s+held by/m.test(st.stdout || '');
    if (!held) break;
    write({ status: 'waiting-perf', step: 'lane', lane: (st.stdout.match(/^perf.*$/m) || [''])[0] });
    await sleep(30000);
  }
  if (!existsSync(join(tree, '.git'))) {
    rmSync(tree, { recursive: true, force: true });
    try {
      git('worktree', 'prune');
      git('worktree', 'add', '--detach', tree, sha);
    } catch (e) {
      write({ status: 'failed', step: 'worktree', error: String(e.message).slice(0, 400) });
      process.exit(1);
    }
  }
  step('npm ci', 'npm', ['ci', '--no-audit', '--no-fund'], tree);
  step('npm run build', 'npm', ['run', 'build'], tree);
  const { hash, files } = distHash(join(tree, 'dist'));
  write({ status: 'ok', step: 'done', distHash: hash, files, tree, builtAt: new Date().toISOString() });
  process.exit(0);
}

// ---- a caller -----------------------------------------------------------------------------------------------------
mkdirSync(dir, { recursive: true });
const ready = (b) => {
  console.log(`build-once: READY ${sha}\n  tree: ${b.tree}\n  dist: ${join(b.tree, 'dist')}\n  distHash: ${b.distHash} (${b.files} files, built ${b.builtAt})`);
  process.exit(0);
};

if (flags.verify) {
  const b = readJson(meta);
  if (!b || b.status !== 'ok') die(75, `build-once: ${sha.slice(0, 7)} is not built yet (${b ? b.status : 'no build.json'}); run build-once.mjs ${sha.slice(0, 7)} first`);
  const now = distHash(join(b.tree, 'dist'));
  if (now.hash !== b.distHash) die(1, `build-once: MISMATCH for ${sha.slice(0, 7)}: dist hashes to ${now.hash} (${now.files} files), build.json says ${b.distHash} (${b.files}). Someone wrote into the build; do not rest a verdict on it.`);
  die(0, `build-once: VERIFIED ${sha.slice(0, 7)} dist ${now.hash} (${now.files} files)`);
}

const maxMs = clampSec(flags.max) * 1000;
const t0 = Date.now();
let started = false;
for (;;) {
  const b = readJson(meta);
  if (b && b.status === 'ok' && existsSync(join(b.tree, 'dist'))) ready(b);
  if (b && b.status === 'failed') die(1, `build-once: FAILED ${sha.slice(0, 7)} at ${b.step} (exit ${b.code ?? '?'}); see ${log}. Delete ${dir} to retry after a fix.`);
  const pid = Number(existsSync(pidFile) ? readFileSync(pidFile, 'utf8') : 0);
  if (!pid || !alive(pid)) {
    if (started) die(1, `build-once: the builder for ${sha.slice(0, 7)} died without a result; see ${log}`);
    // Claim the start atomically: two callers at once start one builder.
    try {
      mkdirSync(join(dir, '.start'));
    } catch {
      await sleep(2000);
      if (existsSync(pidFile) && alive(Number(readFileSync(pidFile, 'utf8')))) continue;
      rmSync(join(dir, '.start'), { recursive: true, force: true });
      continue;
    }
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), sha, '--builder'], { detached: true, stdio: 'ignore', windowsHide: true });
    writeFileSync(pidFile, String(child.pid));
    child.unref();
    rmSync(join(dir, '.start'), { recursive: true, force: true });
    started = true;
    console.log(`build-once: started builder pid ${child.pid} for ${sha.slice(0, 7)} (log ${log})`);
  }
  if (Date.now() - t0 + 5000 > maxMs) break;
  await sleep(5000);
}
const b = readJson(meta);
die(75, `build-once: NOT YET: ${sha.slice(0, 7)} is ${b ? `${b.status} (${b.step})` : 'starting'} after ${Math.round((Date.now() - t0) / 1000)} s (exit 75): call it again`);
