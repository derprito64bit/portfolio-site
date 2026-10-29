#!/usr/bin/env node
// tokens.mjs determinism (W-F acceptance, W-V0a outputs list): two runs in separate processes give identical SHA-256
// for both outputs (tokens.css, tokens.js); the Manor seam files are retired (D-049).
// Usage: node scripts/check/tokens-determinism.mjs [--json report.json]
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(ROOT, 'scripts/build/tokens.mjs');
const OUTPUTS = ['tokens.css', 'tokens.js'];
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
  runs.push({ files });
  rmSync(dir, { recursive: true, force: true });
}

const problems = [];
for (const n of OUTPUTS) {
  if (!runs[0].files[n] || !runs[1].files[n]) problems.push(`${n}: missing`);
  else if (runs[0].files[n].sha256 !== runs[1].files[n].sha256) problems.push(`${n}: differs between runs`);
}
const extra = Object.keys(runs[0].files).filter((n) => !OUTPUTS.includes(n));
if (extra.length) problems.push(`unexpected outputs: ${extra.join(', ')}`);

const report = { schema: 2, check: 'tokens-determinism', runs: 2, outputs: runs[0].files, identical: problems.length === 0, problems };
const i = process.argv.indexOf('--json');
if (i > 0) writeFileSync(process.argv[i + 1], `${JSON.stringify(report, null, 2)}\n`);
if (problems.length) {
  console.error(`tokens-determinism: ${problems.join('; ')}`);
  process.exit(1);
}
console.log(`tokens-determinism: ${OUTPUTS.length} outputs identical over 2 runs`);
