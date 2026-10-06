// Negative control for tests/w-f/crew-lighthouse.test.mjs (round-2 should-fix S2): each mutant undoes one rule at the
// place crew.mjs applies it, while every lib.* call stays in the text (Breaker 2.1 #2's five mutants, plus two more).
// Each mutant is written to a temporary copy beside crew.mjs (scripts/crew.mutant.tmp.mjs, deleted afterwards), the
// test runs against it (CREW_SCRIPT), and the mutant must make it fail. Usage:
//   node tests/w-f/crew-lighthouse.mutants.mjs [--out crew-lighthouse-mutants.json]
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, cliMain } from '../harness/lib.mjs';

export const MUTANTS = {
  'R5 never grows (a)': ["if (r5.grow && !o['no-r5']) {", 'if (r5.grow && false) {'],
  'R5 grows without a fresh precheck': ["const again = await precheck(lib, dir, `${name}-pre-r5`);", 'const again = pre[0];'],
  'R1 never waits (e)': ["if (next !== 'wait') return {", 'if (true) return {'],
  'R3 suspect runs averaged in': ['const clean = reports.filter((r) => !r.suspect.length);\n      const replaced', 'const clean = reports;\n      const replaced'],
  'R3 no extra run for a suspect one': ["const step = lib.setStep(reports.map((r) => ({ suspect: r.suspect })), need, rules.extraRunsPerSetMax ?? 0);", 'const step = lib.setStep(reports.map(() => ({ suspect: [] })), need, rules.extraRunsPerSetMax ?? 0);'],
  'R1 busy-then-cleared try marked blocked (d)': ['...(t.blocked ? { blocked: t.blocked } : {})', "...(t.exitCode !== 0 ? { blocked: 'host' } : {})"],
  'pass ignores the median performance minimum': ['medians.performance >= budget.performance &&', 'true &&'],
};

export async function run() {
  const file = join(ROOT, 'scripts/crew.mjs');
  const tmp = join(ROOT, 'scripts/crew.mutant.tmp.mjs');
  const orig = readFileSync(file, 'utf8');
  const out = {};
  try {
    for (const [name, [from, to]] of Object.entries(MUTANTS)) {
      const hits = orig.split(from).length - 1;
      if (hits !== 1) {
        out[name] = { applied: false, hits, caught: false };
        continue;
      }
      writeFileSync(tmp, orig.replace(from, to));
      const r = spawnSync(process.execPath, ['--test', 'tests/w-f/crew-lighthouse.test.mjs'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, CREW_SCRIPT: 'crew.mutant.tmp.mjs' }, timeout: 600000 });
      const n = (k) => Number(new RegExp(`ℹ ${k} (\\d+)`).exec(r.stdout)?.[1] ?? NaN);
      out[name] = { applied: true, from, to, exitCode: r.status, pass: n('pass'), fail: n('fail'), caught: r.status !== 0 && n('fail') > 0 };
    }
  } finally {
    rmSync(tmp, { force: true });
  }
  // The control: the unmutated script passes the same test.
  const clean = spawnSync(process.execPath, ['--test', 'tests/w-f/crew-lighthouse.test.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
  const control = { exitCode: clean.status, pass: clean.status === 0 };
  const rows = Object.values(out);
  return { schema: 1, suite: 'w-f/crew-lighthouse-mutants', control, mutants: out, pass: control.pass && rows.length > 0 && rows.every((m) => m.applied && m.caught), summary: Object.entries(out).map(([k, m]) => `${k}: ${m.caught ? 'caught' : 'MISSED'}`).join('; ') };
}

await cliMain(import.meta.url, run);
