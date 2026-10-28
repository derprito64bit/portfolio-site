#!/usr/bin/env node
// Detached perf queue (PLAN.md operating model item 3; system review 2026-10-13, flaws 2, 3 and 9). Timed rows run once
// per PR at the approval candidate, from a queue that no agent blocks on: a small agent starts it and waits on it in
// calls of at most 270 s (the wait rule), so a long set never makes an agent re-read its context.
//
// Usage:
//   node scripts/fleet/perfq.mjs start --plan <plan.json> --out <dir> --agent <id>   start or resume the queue; returns at once
//   node scripts/fleet/perfq.mjs wait --out <dir> [--max 240]                        wait for it to end (touches the heartbeat)
//   node scripts/fleet/perfq.mjs status --out <dir>                                  print the summary (touches the heartbeat)
//   node scripts/fleet/perfq.mjs stop --out <dir>                                    kill the runner and its children, release the lanes
// plan.json: { "sha": "<head>", "tree": "<a build-once tree>", "heartbeatMin": 15, "busyWaitMin": 30,
//   "sets": [{ "id": "TBT-m", "row": "<the budgets.md row>", "cmd": ["node", "scripts/crew.mjs", "lighthouse", "--out", "{out}"],
//              "cwd": "{tree}", "precheck": true, "watch": false, "confirmFails": true, "result": "manifest.json" }] }
//   In cmd, cwd and result, {out} is the attempt's folder, {tree} the plan's tree and {n} the attempt number. result names
//   the file (relative to the attempt's folder unless absolute) the command writes when it measured; an exit 1 without it
//   is a crash (a tool error: blocked), never a fail. A watched set starts its command 3 s after its hostload -Watch
//   (through perfq.mjs exec), so the watch's head gap holds.
//
// The runner takes the perf lane, then the blender lane (budgets.md MEASURING), with its own pid in each lane file. Per
// set not already finished in <out>\status.json it: renews both lanes (and every 10 minutes while a set runs); runs a
// hostload precheck (exit 0 needed; busy means blocked, rerun: it re-checks every 60 s for busyWaitMin minutes, then the
// set is blocked); runs the command, under hostload -Watch when watch is true (a host-suspect watch replaces the
// attempt, R3, at most twice); and records exit 0 pass, 1 fail, 75 blocked by the host. A fail is run again as a second
// clean set (R4: both are kept); it counts as fail only when it reproduces, otherwise it is a flake (to the #91 queue).
// The heartbeat (<out>\heartbeat, touched by start, wait and status) is the agent's pulse: older than heartbeatMin
// minutes means the agent died, so the runner kills its set, releases the lanes and stops (state orphaned). A later
// start resumes: sets that passed, failed or flaked are kept; pending, running and blocked ones run again. An exit 75
// from the command re-checks the host and reruns it, at most twice, then the set is blocked.
// States: starting, waiting-lane, running, done, blocked (a set stayed blocked), orphaned, stopped, failed (tool error).
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clampSec } from './wait-rule.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LANE = join(HERE, 'lane.ps1');
const HOSTLOAD = join(HERE, 'hostload.ps1');
const TERMINAL = ['done', 'blocked', 'orphaned', 'stopped', 'failed'];
const KEPT = ['pass', 'fail', 'flake'];

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  else pos.push(argv[i]);
}
const cmd = pos[0];
const die = (code, m) => {
  console.log(m);
  process.exit(code);
};
// exec: the delay wrapper a watched set runs under (perfq.mjs exec --delay <ms> -- <command...>): it waits, runs the
// command as its child with inherited output, and exits with its code, so the watch sees the whole run from its start.
if (cmd === 'exec') {
  const dash = argv.indexOf('--');
  const rest = argv.slice(dash + 1);
  await new Promise((r) => setTimeout(r, Number(flags.delay) || 3000));
  const c = spawn(rest[0] === 'node' ? process.execPath : rest[0], rest.slice(1), { stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' && rest[0] !== 'node' && !/\.(exe|com)$/i.test(rest[0]) });
  c.on('error', () => process.exit(2));
  c.on('close', (code) => process.exit(code ?? 2));
  await new Promise(() => {});
}
if (!cmd || !flags.out || flags.out === true) die(2, 'usage: perfq.mjs start --plan <plan.json> --out <dir> --agent <id> | wait|status|stop --out <dir> [--max 240]');
const OUT = resolve(flags.out);
const STATUS = join(OUT, 'status.json');
const HEART = join(OUT, 'heartbeat');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const alive = (pid) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};
const touch = (f) => {
  if (!existsSync(f)) closeSync(openSync(f, 'a'));
  const now = new Date();
  utimesSync(f, now, now);
};
const ps = (file, args) => spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], { encoding: 'utf8' });
const killTree = (pid) => pid && spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });

function summary(st) {
  if (!st) return 'perfq: no status.json yet';
  const sets = Object.entries(st.sets || {});
  const lines = sets.map(([id, s]) => {
    const last = (s.attempts || []).slice(-1)[0];
    return `  ${id.padEnd(10)} ${String(s.status).padEnd(8)} attempts ${(s.attempts || []).length}${last ? ` (last: ${last.kind} exit ${last.exit}${last.watchExit !== undefined ? `, watch exit ${last.watchExit}` : ''})` : ''}${s.reason ? `; ${s.reason}` : ''}`;
  });
  return `perfq: ${st.state} at ${st.sha ? st.sha.slice(0, 7) : '?'} (runner pid ${st.pid || 'none'}${alive(st.pid) ? ', alive' : ''}; updated ${st.updatedAt})${st.note ? `; ${st.note}` : ''}\n${lines.join('\n')}\n  results: ${OUT}\\sets\\<id>\\<n>\\ (each attempt's log and outputs) and ${STATUS}`;
}

// ---- start / wait / status / stop --------------------------------------------------------------------------------
if (cmd === 'status') {
  if (existsSync(OUT)) touch(HEART);
  die(0, summary(readJson(STATUS)));
}
if (cmd === 'stop') {
  const st = readJson(STATUS);
  if (!st) die(0, 'perfq: nothing to stop');
  // Only a live, unfinished runner is killed: an ended runner's pid may belong to another process by now.
  if (!alive(st.pid) || TERMINAL.includes(st.state)) die(0, `perfq: the runner is not running (state ${st.state}); nothing to stop`);
  killTree(st.pid);
  if (st.current) {
    killTree(st.current.pid);
    killTree(st.current.watchPid);
  }
  for (const lane of ['blender', 'perf']) ps(LANE, ['release', lane, '-Agent', st.agent]);
  writeFileSync(STATUS, `${JSON.stringify({ ...st, state: 'stopped', current: null, updatedAt: new Date().toISOString(), note: 'stopped by perfq.mjs stop' }, null, 2)}\n`);
  die(0, `perfq: stopped (runner ${st.pid}); lanes released for ${st.agent}`);
}
if (cmd === 'wait') {
  const maxMs = clampSec(flags.max) * 1000;
  const t0 = Date.now();
  for (;;) {
    touch(HEART);
    const st = readJson(STATUS);
    if (st && TERMINAL.includes(st.state)) die(0, `${summary(st)}\nperfq: ENDED (${st.state})`);
    if (st && !alive(st.pid) && !TERMINAL.includes(st.state)) die(1, `${summary(st)}\nperfq: the runner died without ending (state ${st.state}); run start again to resume`);
    if (Date.now() - t0 + 10000 > maxMs) die(75, `${summary(st)}\nperfq: NOT YET after ${Math.round((Date.now() - t0) / 1000)} s (exit 75): call wait again`);
    await sleep(10000);
  }
}
if (cmd === 'start') {
  if (!flags.agent || flags.agent === true) die(2, 'perfq start: pass --agent <your role id> (the lane holder name)');
  mkdirSync(OUT, { recursive: true });
  const planPath = join(OUT, 'plan.json');
  if (flags.plan && flags.plan !== true) {
    const plan = readJson(resolve(flags.plan));
    if (!plan || !plan.sha || !Array.isArray(plan.sets) || !plan.sets.length) die(2, `perfq start: ${flags.plan} is not a plan ({ sha, tree, sets: [...] })`);
    const old = readJson(planPath);
    if (old && old.sha !== plan.sha) die(2, `perfq start: ${OUT} holds a queue for ${old.sha}; use a new --out for ${plan.sha}`);
    writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  }
  if (!existsSync(planPath)) die(2, 'perfq start: no plan.json in --out; pass --plan');
  const st = readJson(STATUS);
  if (st && alive(st.pid) && !TERMINAL.includes(st.state)) die(0, `perfq: already running (pid ${st.pid}); use wait\n${summary(st)}`);
  touch(HEART);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), 'run', '--out', OUT, '--agent', flags.agent], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  die(0, `perfq: started runner pid ${child.pid} for ${OUT}; now call: node ${fileURLToPath(import.meta.url)} wait --out ${OUT}`);
}
if (cmd !== 'run') die(2, `perfq: unknown command ${cmd}`);

// ---- the runner ---------------------------------------------------------------------------------------------------
const plan = readJson(join(OUT, 'plan.json'));
const agent = flags.agent;
const heartMs = (plan.heartbeatMin || 15) * 60000;
const busyMs = (plan.busyWaitMin || 30) * 60000;
const prev = readJson(STATUS);
const st = {
  state: 'starting',
  pid: process.pid,
  agent,
  sha: plan.sha,
  startedAt: new Date().toISOString(),
  updatedAt: null,
  note: prev ? `resumed (previous state ${prev.state})` : '',
  current: null,
  sets: {},
};
for (const s of plan.sets) {
  const old = prev && prev.sets && prev.sets[s.id];
  st.sets[s.id] = old && KEPT.includes(old.status) ? old : { status: 'pending', attempts: (old && old.attempts) || [] };
}
const save = () => {
  st.updatedAt = new Date().toISOString();
  writeFileSync(STATUS, `${JSON.stringify(st, null, 2)}\n`);
};
const heartOk = () => existsSync(HEART) && Date.now() - statSync(HEART).mtimeMs < heartMs;
const release = () => ['blender', 'perf'].forEach((l) => ps(LANE, ['release', l, '-Agent', agent]));
const finish = (state, note) => {
  st.state = state;
  st.current = null;
  if (note) st.note = note;
  release();
  save();
  process.exit(0);
};
const orphaned = () => finish('orphaned', `the heartbeat is older than ${plan.heartbeatMin || 15} min: the agent that owns this queue died; start again to resume`);
save();

// Lanes: perf first, then blender (blocks new Blender jobs and waits out a running one), each with this pid.
async function takeLanes() {
  for (const lane of ['perf', 'blender']) {
    for (;;) {
      if (!heartOk()) orphaned();
      const r = ps(LANE, ['acquire', lane, '-Agent', agent, '-ProcessId', String(process.pid), '-TimeoutMinutes', '4']);
      if (r.status === 0) break;
      if (r.status !== 75) finish('failed', `lane.ps1 acquire ${lane} exited ${r.status}: ${`${r.stdout}${r.stderr}`.trim().slice(0, 300)}`);
      st.state = 'waiting-lane';
      st.note = `waiting for the ${lane} lane: ${String(r.stdout).trim().split(/\r?\n/).slice(-1)[0]}`;
      save();
    }
  }
}
const renew = () => ['perf', 'blender'].forEach((l) => ps(LANE, ['renew', l, '-Agent', agent]));

// Runs one process to its end; kills it (and its watch) when the heartbeat goes stale.
function runProc(file, args, cwd, logFile) {
  return new Promise((res) => {
    const fd = openSync(logFile, 'a');
    const p = spawn(file, args, { cwd, stdio: ['ignore', fd, fd], windowsHide: true, shell: process.platform === 'win32' && !/\.(exe|com)$/i.test(file) && file !== process.execPath });
    p.on('error', (e) => res({ code: -1, error: e.message }));
    p.on('close', (code) => res({ code }));
    st.current = { ...(st.current || {}), pid: p.pid };
    save();
  });
}

async function precheck(id, n) {
  const t0 = Date.now();
  for (let i = 1; ; i++) {
    if (!heartOk()) orphaned();
    renew();
    const out = join(OUT, 'hostload', `${id}-${n}-pre-${i}.json`);
    const r = ps(HOSTLOAD, ['-Out', out]);
    if (r.status === 0) return { ok: true, file: out };
    if (r.status !== 75) return { ok: false, tool: true, file: out, why: `hostload exited ${r.status}: ${`${r.stdout}${r.stderr}`.trim().slice(0, 300)}` };
    if (Date.now() - t0 > busyMs) return { ok: false, file: out, why: `host busy for ${plan.busyWaitMin || 30} min (blocked, rerun): ${String(r.stdout).trim().split(/\r?\n/)[0]}` };
    st.note = `set ${id}: host busy (${String(r.stdout).trim().split(/\r?\n/)[0]}); re-checking in 60 s`;
    save();
    await sleep(60000);
  }
}

const fill = (x, vars) => String(x).replace(/\{(out|tree|n)\}/g, (_, k) => vars[k]);

async function attempt(set, kind) {
  const s = st.sets[set.id];
  const n = s.attempts.length + 1;
  const dir = join(OUT, 'sets', set.id, String(n));
  mkdirSync(dir, { recursive: true });
  const vars = { out: dir, tree: plan.tree || '', n };
  const a = { n, kind, startedAt: new Date().toISOString(), log: join(dir, 'run.log'), out: dir };
  s.attempts.push(a);
  if (set.precheck !== false) {
    const pc = await precheck(set.id, n);
    a.pre = pc.file;
    if (!pc.ok) {
      a.exit = 75;
      a.endedAt = new Date().toISOString();
      save();
      return { blocked: true, why: pc.why };
    }
  }
  st.current = { set: set.id, attempt: n, kind };
  save();
  let [file, ...args] = set.cmd.map((x) => fill(x, vars));
  if (set.watch) {
    args = [fileURLToPath(import.meta.url), 'exec', '--out', OUT, '--delay', '3000', '--', file, ...args];
    file = process.execPath;
  }
  const timer = setInterval(() => {
    if (!heartOk()) {
      killTree(st.current && st.current.pid);
      killTree(st.current && st.current.watchPid);
      orphaned();
    }
    renew();
  }, 60000);
  const run = runProc(file === 'node' ? process.execPath : file, args, set.cwd ? fill(set.cwd, vars) : plan.tree || process.cwd(), a.log);
  let watch = null;
  let settled = false;
  run.then(() => (settled = true));
  if (set.watch) {
    while (!st.current.pid && !settled) await sleep(50);
    const wf = join(dir, 'hostload-watch.json');
    watch = new Promise((res) => {
      const w = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', HOSTLOAD, '-Watch', String(st.current.pid), '-Out', wf], { stdio: 'ignore', windowsHide: true });
      st.current.watchPid = w.pid;
      save();
      w.on('close', (code) => res({ code, file: wf }));
    });
  }
  const r = await run;
  const w = watch && st.current && st.current.watchPid ? await watch : null;
  clearInterval(timer);
  a.exit = r.code;
  if (r.error) a.error = r.error;
  if (w) {
    a.watch = w.file;
    a.watchExit = w.code;
  }
  a.endedAt = new Date().toISOString();
  st.current = null;
  save();
  // An exit 1 that wrote no result is a crash, not a measured fail.
  const resultFile = set.result ? (/^[a-z]:|^[\\/]/i.test(fill(set.result, vars)) ? fill(set.result, vars) : join(dir, fill(set.result, vars))) : null;
  if (r.code === 1 && resultFile && !existsSync(resultFile)) {
    a.crash = `exit 1 with no ${set.result}`;
    save();
    return { code: 2, suspect: false };
  }
  return { code: r.code, suspect: !!w && w.code !== 0 };
}

async function runSet(set) {
  const s = st.sets[set.id];
  s.status = 'running';
  s.reason = '';
  save();
  let replaced = 0;
  let busy = 0;
  const once = async (kind) => {
    for (;;) {
      const r = await attempt(set, kind);
      if (r.blocked) return { blocked: r.why };
      if (r.suspect) {
        if (++replaced > 2) return { blocked: 'hostload -Watch flagged three attempts in a row (host-suspect runs are replaced, never averaged: R3)' };
        continue;
      }
      if (r.code === 75) {
        if (++busy > 2) return { blocked: 'the command reported the host busy (exit 75) three times' };
        const pc = await precheck(set.id, `${s.attempts.length}-rerun`);
        if (!pc.ok) return { blocked: pc.why || 'the command reported the host busy (exit 75)' };
        continue;
      }
      return { code: r.code };
    }
  };
  const first = await once('set');
  if (first.blocked) return Object.assign(s, { status: 'blocked', reason: first.blocked });
  if (first.code === 0) return Object.assign(s, { status: 'pass' });
  if (first.code !== 1) {
    const crash = (s.attempts.slice(-1)[0] || {}).crash;
    return Object.assign(s, { status: 'blocked', reason: crash ? `a crash (${crash}): a tool error, never a fail` : `the command exited ${first.code} (neither pass 0, fail 1 nor host 75): a tool error` });
  }
  if (set.confirmFails === false) return Object.assign(s, { status: 'fail', reason: 'failed (no confirming set asked)' });
  const second = await once('confirm');
  if (second.blocked) return Object.assign(s, { status: 'blocked', reason: `the first set failed; the confirming set was blocked: ${second.blocked}` });
  return second.code === 1
    ? Object.assign(s, { status: 'fail', reason: 'failed and reproduced in a second clean set (R4)' })
    : Object.assign(s, { status: 'flake', reason: `failed once, then the second clean set exited ${second.code}: a single-set flake (queue it, never a must-fix)` });
}

await takeLanes();
st.state = 'running';
st.note = '';
save();
for (const set of plan.sets) {
  if (KEPT.includes(st.sets[set.id].status)) continue;
  await runSet(set);
  save();
}
const blocked = Object.values(st.sets).some((s) => s.status === 'blocked');
finish(blocked ? 'blocked' : 'done', blocked ? 'a set stayed blocked by the host: blocked, rerun (start again later; finished sets are kept)' : 'every set ended');
