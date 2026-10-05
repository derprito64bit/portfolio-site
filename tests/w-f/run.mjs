// W-F acceptance run (issue #11): every check, instrument and GES-1 command, written to
// ../portfolio-evidence/wave3a/W-F/<sha7>/<role>/ with one aggregate manifest.json. Steps run in order; a failing step
// does not stop the others; the exit code is 1 if any step failed. Reference host only (real GPU).
// Usage: node tests/w-f/run.mjs [--role crew|gate] [--only name,name] [--skip name,name]
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, cliOpts, evidenceDir, item, writeManifest } from '../harness/lib.mjs';

const opts = cliOpts();
const role = String(opts.role || 'crew');
const dir = evidenceDir('W-F', 'wave3a', role);
mkdirSync(dir, { recursive: true });
const only = opts.only ? new Set(String(opts.only).split(',')) : null;
const skip = new Set(String(opts.skip || '').split(',').filter(Boolean));
const node = (...a) => [process.execPath, a];
const out = (f) => join(dir, f);

const STEPS = [
  ['check', ...node('scripts/check/run.mjs', '--log', out('check.log'), '--json', out('check.json'))],
  ['tokens-determinism', ...node('scripts/check/tokens-determinism.mjs', '--json', out('tokens-determinism.json'))],
  ['size-limit', ...node('node_modules/size-limit/bin.js', '--json'), { stdout: 'size-limit.json' }],
  ['unit', ...node('--test', 'tests/w-f/**/*.test.mjs'), { stdout: 'unit.log' }],
  ['build', ...node('tests/w-f/build.mjs', '--out', out('build.json'))],
  ['pregl', ...node('tests/w-f/pregl.mjs', '--out', out('pregl.json'))],
  ['stage', ...node('tests/w-f/stage.mjs', '--out', out('stage.json'))],
  ['m2', ...node('tests/w-f/m2.mjs', '--out', out('m2.json'))],
  ['fonts', ...node('tests/w-f/fonts.mjs', '--out', out('fonts.json'))],
  ['negatives', ...node('tests/w-f/negatives.mjs', '--out', out('negatives.json'))],
  ['h-console', ...node('tests/harness/console/run.mjs', '--out', out('console.json'))],
  ['h-counters', ...node('tests/harness/counters/run.mjs', '--out', out('counters.json'))],
  ['h-idle', ...node('tests/harness/idle/run.mjs', '--out', out('idle.json'))],
  ['h-swap', ...node('tests/harness/swap/run.mjs', '--out', out('swap.json'))],
  ['h-keyboard', ...node('tests/harness/keyboard/run.mjs', '--out', out('keyboard.json'))],
  // 5 Chromium runs (a one-in-four failure needs repeats to show; review item 5) and WebKit; the worst run is reported.
  ['h-drift', ...node('tests/harness/drift/run.mjs', '--repeat', '5', '--out', out('drift.json'))],
  ['h-gpu', ...node('tests/harness/gpu/run.mjs', '--out', out('gpu.json'))],
  ['h-spring', ...node('tests/harness/spring/run.mjs', '--out', out('spring-conformance.json'))],
  ['h-contrast', ...node('tests/harness/contrast/run.mjs', '--out', out('contrast.json'))],
  ['h-content', ...node('tests/harness/content/run.mjs', '--out', out('content.json'))],
  ['h-flash', ...node('tests/harness/flash/run.mjs', '--self-test', '--out', out('flash.json'))],
  ['h-overflow', ...node('tests/harness/overflow/run.mjs', '--profiles', 'all', '--out', out('overflow.json'))],
  ['shoot', ...node('scripts/crew.mjs', 'shoot', '--crew', 'W-F', '--role', role)],
  ['a11y', ...node('scripts/crew.mjs', 'a11y', '--crew', 'W-F', '--role', role)],
  // Timed: run it only in the final evidence step, holding the perf and blender lanes (budgets.md R1-R5). Exit 75 is
  // blocked (host), which is neither pass nor fail.
  ['lighthouse', ...node('scripts/crew.mjs', 'lighthouse', '--crew', 'W-F', '--role', role)],
];

function run(cmd, argv) {
  return new Promise((res) => {
    const p = spawn(cmd, argv, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: '0' } });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('close', (code) => res({ code, stdout, stderr }));
  });
}

const log = [];
for (const [name, cmd, argv, extra] of STEPS) {
  if ((only && !only.has(name)) || skip.has(name)) continue;
  const t0 = Date.now();
  const r = await run(cmd, argv);
  if (extra?.stdout) writeFileSync(out(extra.stdout), r.stdout);
  const tail = `${r.stdout}\n${r.stderr}`.trim().split('\n').slice(-6).join('\n');
  // Exit 75 is blocked (host): a timed step that could not be measured on a quiet host, neither pass nor fail.
  const entry = { step: name, pass: r.code === 0, ...(r.code === 75 ? { blocked: 'host' } : {}), seconds: Math.round((Date.now() - t0) / 1000), tail };
  log.push(entry);
  console.log(`${entry.blocked ? 'BLOCKED (host)' : entry.pass ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${String(entry.seconds).padStart(5)} s  ${tail.split('\n').pop()}`);
  writeFileSync(out('runlog.json'), `${JSON.stringify(log, null, 2)}\n`);
}

// Aggregate manifest: every evidence file at the top level, plus the GES-1 sub-manifests by reference.
const FILES = {
  'check.log': 'check-log', 'check.json': 'check', 'tokens-determinism.json': 'tokens-determinism', 'size-limit.json': 'size-limit',
  'unit.log': 'unit', 'build.json': 'build', 'pregl.json': 'pre-gl-js', 'stage.json': 'stage', 'm2.json': 'm2', 'fonts.json': 'fonts', 'negatives.json': 'negatives',
  'console.json': 'console', 'counters.json': 'counters', 'idle.json': 'idle', 'swap.json': 'swap', 'keyboard.json': 'keyboard',
  'drift.json': 'drift', 'gpu.json': 'gpu', 'spring-conformance.json': 'spring', 'contrast.json': 'contrast', 'content.json': 'content',
  'flash.json': 'flash', 'overflow.json': 'overflow', 'shoot/manifest.json': 'ges1-shoot', 'a11y/manifest.json': 'ges1-a11y',
  'lighthouse/manifest.json': 'ges1-lighthouse', 'runlog.json': 'runlog',
};
const stepOf = { 'check-log': 'check', 'size-limit': 'size-limit', 'pre-gl-js': 'pregl', 'ges1-shoot': 'shoot', 'ges1-a11y': 'a11y', 'ges1-lighthouse': 'lighthouse', unit: 'unit' };
const items = Object.entries(FILES)
  .filter(([f]) => existsSync(out(f)))
  .map(([f, kind]) => {
    let pass = true;
    try {
      const j = JSON.parse(readFileSync(out(f), 'utf8'));
      if (typeof j.pass === 'boolean') pass = j.pass;
      else if (typeof j.failed === 'number') pass = j.failed === 0;
      else if (Array.isArray(j)) pass = kind === 'runlog' ? j.every((s) => s.pass) : j.every((x) => x.passed !== false);
      else if (Array.isArray(j.results)) pass = j.results.every((x) => x.pass);
    } catch {
      const step = log.find((s) => s.step === (stepOf[kind] ?? kind));
      pass = step ? step.pass : true;
    }
    const blocked = log.find((s) => s.step === (stepOf[kind] ?? kind))?.blocked;
    return item(dir, f, { kind, route: null, profile: null, mode: null, tier: null, pass: blocked ? null : pass, ...(blocked ? { blocked } : {}), metrics: {} });
  });
// The host load of the timed set (#67): from the Lighthouse manifest when this run took one.
let hostLoad = {};
try {
  const lh = JSON.parse(readFileSync(out('lighthouse/manifest.json'), 'utf8'));
  hostLoad = { benchmarkIndex: lh.host?.benchmarkIndex ?? null, cpuBusyPct: lh.host?.cpuBusyPct ?? null, gpu3dPct: lh.host?.gpu3dPct ?? null, source: 'lighthouse/manifest.json' };
} catch {
  hostLoad = {};
}
await writeManifest(dir, items, { crew: 'W-F', hostLoad, fields: { command: 'tests/w-f/run.mjs', role, steps: log.map((s) => ({ step: s.step, pass: s.pass, ...(s.blocked ? { blocked: s.blocked } : {}), seconds: s.seconds })) } });
const failed = log.filter((s) => !s.pass && !s.blocked);
const blocked = log.filter((s) => s.blocked);
console.log(`\nw-f: ${log.length - failed.length - blocked.length}/${log.length} steps passed${blocked.length ? `, ${blocked.length} blocked (host)` : ''}; evidence ${dir}`);
process.exit(failed.length ? 1 : blocked.length ? 75 : 0);
