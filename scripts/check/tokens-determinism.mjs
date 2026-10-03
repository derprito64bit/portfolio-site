#!/usr/bin/env node
// tokens.mjs determinism (W-F acceptance): two runs in separate processes give identical SHA-256 for all five
// outputs; identity.json is JsonUtility-flat; can-enter-manor.js is <= 400 B.
// Usage: node scripts/check/tokens-determinism.mjs [--json report.json]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAN_ENTER_MANOR_MAX_BYTES, jsonUtilityFlat } from '../build/tokens.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(ROOT, 'scripts/build/tokens.mjs');
const runs = [];
for (let i = 0; i < 2; i++) {
  const dir = mkdtempSync(join(tmpdir(), `tokens-${i}-`));
  execFileSync(process.execPath, [script, '--out', dir], { stdio: 'pipe' });
  const files = Object.fromEntries(
    readdirSync(dir).sort().map((f) => {
      const buf = readFileSync(join(dir, f));
      return [f, { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length }];
    }),
  );
  const identity = JSON.parse(readFileSync(join(dir, 'identity.json'), 'utf8'));
  runs.push({ files, flat: jsonUtilityFlat(identity) });
  rmSync(dir, { recursive: true, force: true });
}

const names = ['tokens.css', 'tokens.js', 'manor-overlay.css', 'identity.json', 'can-enter-manor.js'];
const problems = [];
for (const n of names) {
  if (!runs[0].files[n] || !runs[1].files[n]) problems.push(`${n}: missing`);
  else if (runs[0].files[n].sha256 !== runs[1].files[n].sha256) problems.push(`${n}: differs between runs`);
}
if (runs[0].flat.length) problems.push(`identity.json is not JsonUtility-flat: ${runs[0].flat.join('; ')}`);
const guard = runs[0].files['can-enter-manor.js']?.bytes ?? Infinity;
if (guard > CAN_ENTER_MANOR_MAX_BYTES) problems.push(`can-enter-manor.js is ${guard} B (limit ${CAN_ENTER_MANOR_MAX_BYTES})`);

const report = { schema: 1, check: 'tokens-determinism', runs: 2, outputs: runs[0].files, identical: problems.length === 0, identityJsonUtilityFlat: runs[0].flat.length === 0, canEnterManorBytes: guard, problems };
const i = process.argv.indexOf('--json');
if (i > 0) writeFileSync(process.argv[i + 1], `${JSON.stringify(report, null, 2)}\n`);
if (problems.length) {
  console.error(`tokens-determinism: ${problems.join('; ')}`);
  process.exit(1);
}
console.log(`tokens-determinism: 5 outputs identical over 2 runs; identity.json flat; can-enter-manor.js ${guard} B`);
