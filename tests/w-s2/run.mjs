#!/usr/bin/env node
// W-S2's evidence run: every W-S2 instrument and its negative controls, plus the shared harness rows the spec names
// (drift in Chromium and WebKit, idle, keyboard), one after another (one browser suite at a time), into --out.
// It needs a built dist/ in this tree (or a build-once tree as the cwd) and, for the byte deltas, --base <a built tree
// of the merge-base>. Each step writes its own JSON; summary.json lists every step's exit code and its first line.
// Exit: 0 when every step passed and every plant failed, else 1.
// Usage: node tests/w-s2/run.mjs --out <dir> [--base <tree>] [--only bytes,layout,...] [--skip harness]
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, cliOpts } from '../harness/lib.mjs';

const o = cliOpts();
const out = String(o.out ?? join(ROOT, 'w-s2-evidence'));
mkdirSync(out, { recursive: true });
const only = o.only ? new Set(String(o.only).split(',')) : null;
const skip = new Set(String(o.skip ?? '').split(','));
const t = (f) => join(ROOT, 'tests/w-s2', f);
const steps = [
  ['bytes', [t('bytes.mjs'), ...(o.base ? ['--base', String(o.base)] : []), '--out', out]],
  ['layout', [t('layout.mjs'), '--out', out]],
  ['motion-chromium', [t('motion.mjs'), '--out', out]],
  ['motion-webkit', [t('motion.mjs'), '--browser', 'webkit', '--only', 'l3,once,toggle,swap,rest', '--out', out]],
  ['strip', [t('strip.mjs'), '--out', out]],
  ['filmstrip', [t('filmstrip.mjs'), '--out', join(out, 'filmstrip')]],
  ['fixtures', [t('fixtures.mjs'), '--out', out]],
  ['fixtures-tokens-alt', [t('fixtures.mjs'), '--tokens', 'alt', '--out', out]],
  ['harness-drift', [join(ROOT, 'tests/harness/drift/run.mjs'), '--browsers', 'chromium,webkit', '--out', join(out, 'drift.json')]],
  ['harness-idle', [join(ROOT, 'tests/harness/idle/run.mjs'), '--routes', '/', '--out', join(out, 'idle.json')]],
  ['harness-keyboard', [join(ROOT, 'tests/harness/keyboard/run.mjs'), '--out', join(out, 'keyboard.json')]],
];
// Negative controls: each must exit 1.
const plants = [
  ...[['share', 'D1'], ['cols', 'D2'], ['track', 'D2'], ['offset', 'P2'], ['tilt', 'D2'], ['caption', 'D2'], ['swell', 'P2'], ['overflow', 'D2'], ['contact', 'P2'], ['names', 'D2']].map(([p, prof]) => [`plant-layout-${p}`, [t('layout.mjs'), '--plant', p, '--profiles', prof, '--out', out]]),
  ...[['flash', 'l3'], ['duration', 'l3'], ['early', 'l3'], ['twice', 'once'], ['handback', 'toggle'], ['swap', 'swap'], ['focuslift', 'hover'], ['tilt', 'm1'], ['rest', 'rest']].map(([p, step]) => [`plant-motion-${p}`, [t('motion.mjs'), '--plant', p, '--only', step, '--out', out]]),
  ['plant-filmstrip-frozen', [t('filmstrip.mjs'), '--plant', 'frozen', '--out', join(out, 'filmstrip-plant-frozen')]],
  ['plant-strip-canvas', [t('strip.mjs'), '--plant', 'canvas', '--out', out]],
  ['plant-strip-bytes', [t('strip.mjs'), '--plant', 'bytes', '--out', out]],
  ['plant-fixtures-cover', [t('fixtures.mjs'), '--plant', 'cover', '--out', out]],
  ['plant-fixtures-literal', [t('fixtures.mjs'), '--tokens', 'alt', '--plant', 'literal', '--out', out]],
];
const rows = [];
for (const [name, argv] of [...steps, ...plants]) {
  if (only && !only.has(name) && !only.has(name.split('-')[0])) continue;
  if (skip.has(name.split('-')[0]) || skip.has(name)) continue;
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--no-warnings', ...argv], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  const line = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').find((l) => /PASS|FAIL/.test(l)) ?? `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').pop();
  const plant = name.startsWith('plant-');
  const ok = plant ? r.status === 1 : r.status === 0;
  rows.push({ name, exit: r.status, ok, ms: Date.now() - t0, line });
  console.log(`${ok ? 'ok  ' : 'BAD '} ${name} (exit ${r.status}${plant ? ', a plant must fail' : ''}): ${line}`);
}
const pass = rows.every((r) => r.ok);
writeFileSync(join(out, 'summary.json'), JSON.stringify({ schema: 1, suite: 'w-s2/run', pass, rows }, null, 2));
console.log(`w-s2 run: ${pass ? 'PASS' : 'FAIL'}  ${rows.filter((r) => r.ok).length}/${rows.length} as expected`);
process.exit(pass ? 0 : 1);
