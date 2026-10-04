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
  ['build', ...node('tests/w-f/build.mjs', '--out', out('build.json'))],
  ['pregl', ...node('tests/w-f/pregl.mjs', '--out', out('pregl.json'))],
  ['stage', ...node('tests/w-f/stage.mjs', '--out', out('stage.json'))],
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
  ['lighthouse', ...node('scripts/crew.mjs', 'lighthouse', '--crew', 'W-F', '--role', role, '--runs', '5')],
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
  const entry = { step: name, pass: r.code === 0, seconds: Math.round((Date.now() - t0) / 1000), tail };
  log.push(entry);
  console.log(`${entry.pass ? 'PASS' : 'FAIL'}  ${name.padEnd(20)} ${String(entry.seconds).padStart(5)} s  ${tail.split('\n').pop()}`);
  writeFileSync(out('runlog.json'), `${JSON.stringify(log, null, 2)}\n`);
}

// Aggregate manifest: every evidence file at the top level, plus the GES-1 sub-manifests by reference.
const FILES = {
  'check.log': 'check-log', 'check.json': 'check', 'tokens-determinism.json': 'tokens-determinism', 'size-limit.json': 'size-limit',
  'build.json': 'build', 'pregl.json': 'pre-gl-js', 'stage.json': 'stage', 'fonts.json': 'fonts', 'negatives.json': 'negatives',
  'console.json': 'console', 'counters.json': 'counters', 'idle.json': 'idle', 'swap.json': 'swap', 'keyboard.json': 'keyboard',
  'drift.json': 'drift', 'gpu.json': 'gpu', 'spring-conformance.json': 'spring', 'contrast.json': 'contrast', 'content.json': 'content',
  'flash.json': 'flash', 'overflow.json': 'overflow', 'shoot/manifest.json': 'ges1-shoot', 'a11y/manifest.json': 'ges1-a11y',
  'lighthouse/manifest.json': 'ges1-lighthouse', 'runlog.json': 'runlog',
};
const stepOf = { 'check-log': 'check', 'size-limit': 'size-limit', 'pre-gl-js': 'pregl', 'ges1-shoot': 'shoot', 'ges1-a11y': 'a11y', 'ges1-lighthouse': 'lighthouse' };
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
    return item(dir, f, { kind, route: null, profile: null, mode: null, tier: null, pass, metrics: {} });
  });
await writeManifest(dir, items, { crew: 'W-F', fields: { command: 'tests/w-f/run.mjs', role, steps: log.map((s) => ({ step: s.step, pass: s.pass, seconds: s.seconds })) } });
const failed = log.filter((s) => !s.pass);
console.log(`\nw-f: ${log.length - failed.length}/${log.length} steps passed; evidence ${dir}`);
process.exit(failed.length ? 1 : 0);
