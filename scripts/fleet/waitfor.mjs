#!/usr/bin/env node
// Clamped waits for agents (owner rule 2026-10-27, PLAN.md "Waits and context"): no tool call blocks longer than 270 s,
// because the prompt cache lives 5 minutes and a longer block makes the next wake re-read the agent's whole context.
// Every mode waits at most --max seconds (default 240, never more than 270) and then exits; call it again while it exits 75.
// Anything longer (perf sets, installs, builds) runs detached: scripts/fleet/perfq.mjs and scripts/fleet/build-once.mjs.
//
// Usage:
//   node scripts/fleet/waitfor.mjs file <path> <regex> [--after <n>] [--show <regex>] [--lines 8]
//        until more than <n> lines of <path> match <regex> (default <n>: the count when the call starts; the file may not exist yet)
//   node scripts/fleet/waitfor.mjs pid <pid>                          until the process exits
//   node scripts/fleet/waitfor.mjs exists <path>                      until the path exists
//   node scripts/fleet/waitfor.mjs checks <pr> [--repo <owner/name>]  until every check on the PR has finished (replaces gh pr checks --watch)
//   node scripts/fleet/waitfor.mjs cmd -- <command> [args...]         until the command exits 0 (re-run every --every s)
// Options: --max <s> (default 240, clamped to 1..270)  --every <s> (poll interval; default 5, checks and cmd 20)
//          --heartbeat <file> (touched at every poll, for a detached queue that stops when its agent dies)
// Exit: 0 the condition holds; 75 not yet (call again); 1 it failed for good (checks: a check failed or was cancelled;
//       cmd: never, it keeps polling); 2 usage. The last line printed always says which, so a log reader needs no exit code.
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, utimesSync } from 'node:fs';
import { clampSec, MAX_SEC } from './wait-rule.mjs';

const argv = process.argv.slice(2);
const dash = argv.indexOf('--');
const head = dash >= 0 ? argv.slice(0, dash) : argv;
const tail = dash >= 0 ? argv.slice(dash + 1) : [];
const flags = {};
const pos = [];
for (let i = 0; i < head.length; i++) {
  if (head[i].startsWith('--')) flags[head[i].slice(2)] = head[i + 1] !== undefined && !head[i + 1].startsWith('--') ? head[++i] : true;
  else pos.push(head[i]);
}
const usage = (m) => {
  console.error(`waitfor: ${m}\nusage: waitfor.mjs file <path> <regex> | pid <pid> | exists <path> | checks <pr> [--repo o/n] | cmd -- <command...> [--max s] [--every s] [--heartbeat file]`);
  process.exit(2);
};
const [mode, a1, a2] = pos;
if (!mode) usage('name a mode');
if (flags.max !== undefined && Number(flags.max) > MAX_SEC) console.log(`waitfor: --max ${flags.max} clamped to ${MAX_SEC} s (the 270 s wait rule)`);
const maxMs = clampSec(flags.max) * 1000;
const everyMs = Math.max(1, Number(flags.every) || (mode === 'checks' || mode === 'cmd' ? 20 : 5)) * 1000;
const t0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function touch(file) {
  if (!file || file === true) return;
  try {
    if (!existsSync(file)) closeSync(openSync(file, 'a'));
    const now = new Date();
    utimesSync(file, now, now);
  } catch {
    /* a heartbeat that cannot be written must not end the wait */
  }
}

// PowerShell's *> writes UTF-16LE with a BOM; everything else here is UTF-8.
function readText(file) {
  const b = readFileSync(file);
  return b[0] === 0xff && b[1] === 0xfe ? b.toString('utf16le').slice(1) : b.toString('utf8');
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

// One poll: { done: bool, ok?: bool, say: string }.
let probe;
if (mode === 'file') {
  if (!a1 || !a2) usage('file needs <path> <regex>');
  const rx = new RegExp(a2, 'm');
  const count = () => (existsSync(a1) ? readText(a1).split(/\r?\n/).filter((l) => rx.test(l)).length : 0);
  const after = flags.after !== undefined ? Number(flags.after) : count();
  const show = new RegExp(flags.show && flags.show !== true ? flags.show : '.');
  const lines = Number(flags.lines) || 8;
  probe = () => {
    const n = count();
    const shown = existsSync(a1) ? readText(a1).split(/\r?\n/).filter((l) => show.test(l)).slice(-lines).map((l) => l.slice(0, 300)) : [];
    return { done: n > after, ok: true, say: `${shown.join('\n')}${shown.length ? '\n' : ''}matches: ${n} (waited for more than ${after}; pass --after ${n} next time)` };
  };
} else if (mode === 'pid') {
  const pid = Number(a1);
  if (!Number.isInteger(pid) || pid <= 0) usage('pid needs a process id');
  probe = () => (alive(pid) ? { done: false, say: `process ${pid} still running` } : { done: true, ok: true, say: `process ${pid} has exited` });
} else if (mode === 'exists') {
  if (!a1) usage('exists needs a path');
  probe = () => (existsSync(a1) ? { done: true, ok: true, say: `${a1} exists` } : { done: false, say: `${a1} does not exist yet` });
} else if (mode === 'checks') {
  if (!a1) usage('checks needs a PR number or URL');
  const repo = flags.repo && flags.repo !== true ? flags.repo : 'derprito64bit/portfolio-site';
  probe = () => {
    let rows;
    try {
      rows = JSON.parse(execFileSync('gh', ['pr', 'checks', String(a1), '-R', repo, '--json', 'name,state,bucket'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (e) {
      // gh exits 8 while checks are pending and 1 when one failed, but prints the JSON either way.
      const out = String(e.stdout || '');
      try {
        rows = JSON.parse(out);
      } catch {
        return { done: false, say: `gh pr checks failed: ${String(e.stderr || e.message).trim().slice(0, 200)}` };
      }
    }
    if (!rows.length) return { done: false, say: 'no checks reported yet' };
    const pending = rows.filter((r) => r.bucket === 'pending');
    const bad = rows.filter((r) => r.bucket === 'fail' || r.bucket === 'cancel');
    const list = (xs) => xs.map((r) => `${r.name} (${r.state})`).join(', ');
    if (pending.length) return { done: false, say: `${pending.length} of ${rows.length} checks pending: ${list(pending)}` };
    if (bad.length) return { done: true, ok: false, say: `checks finished; failed: ${list(bad)}` };
    return { done: true, ok: true, say: `all ${rows.length} checks passed: ${list(rows)}` };
  };
} else if (mode === 'cmd') {
  if (!tail.length) usage('cmd needs -- <command> [args...]');
  probe = () => {
    const r = spawnSync(tail[0], tail.slice(1), { encoding: 'utf8', shell: process.platform === 'win32' && !/\.(exe|com)$/i.test(tail[0]) });
    const out = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/).slice(-4).join('\n');
    return r.status === 0 ? { done: true, ok: true, say: `${out}\ncommand exited 0` } : { done: false, say: `${out}\ncommand exited ${r.status}` };
  };
} else usage(`unknown mode ${mode}`);

let last;
for (;;) {
  touch(flags.heartbeat);
  last = probe();
  if (last.done) {
    console.log(last.say);
    console.log(last.ok ? 'waitfor: DONE (exit 0)' : 'waitfor: FAILED (exit 1)');
    process.exit(last.ok ? 0 : 1);
  }
  if (Date.now() - t0 + everyMs > maxMs) break;
  await sleep(everyMs);
}
console.log(last.say);
console.log(`waitfor: NOT YET after ${Math.round((Date.now() - t0) / 1000)} s (exit 75): call it again`);
process.exit(75);
