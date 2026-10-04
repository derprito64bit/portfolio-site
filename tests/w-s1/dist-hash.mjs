#!/usr/bin/env node
// Hashes the built site (dist/) file by file, and compares it with another build's listing. A round that changes no
// input of the build (only tests/w-s1) proves with it that the runs it carries from an earlier SHA (the W-F harness,
// Lighthouse, crew.mjs shoot and a11y) measured the same bytes it ships: manifest.mjs --carry reads the result.
//   npm run build && node tests/w-s1/dist-hash.mjs --out <listing.json> [--against <other listing.json>]
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { H } from './lib.mjs';

const opts = H.cliOpts();
const dist = join(H.ROOT, 'dist');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const list = walk(dist)
  .map((f) => ({ path: relative(dist, f).replaceAll('\\', '/'), bytes: statSync(f).size, sha256: createHash('sha256').update(readFileSync(f)).digest('hex') }))
  .sort((a, b) => a.path.localeCompare(b.path));
// One hash over the whole tree: every path with its content hash, in path order.
const tree = createHash('sha256').update(list.map((f) => `${f.path} ${f.sha256}`).join('\n')).digest('hex');
const result = { sha: H.gitSha(), at: new Date().toISOString(), files: list.length, bytes: list.reduce((s, f) => s + f.bytes, 0), tree };
if (opts.against) {
  const other = JSON.parse(readFileSync(String(opts.against), 'utf8'));
  const theirs = new Map(other.list.map((f) => [f.path, f.sha256]));
  const ours = new Map(list.map((f) => [f.path, f.sha256]));
  const differ = [...new Set([...theirs.keys(), ...ours.keys()])].filter((p) => theirs.get(p) !== ours.get(p)).sort();
  result.against = { sha: String(other.sha ?? 'unknown'), tree: other.tree, files: other.files, file: String(opts.against) };
  result.identical = differ.length === 0 && other.tree === tree;
  result.differ = differ;
}
result.list = list;
if (opts.out) writeFileSync(String(opts.out), `${JSON.stringify(result, null, 1)}\n`);
console.log(`dist: ${list.length} files, tree ${tree}${opts.against ? `; against ${result.against.sha.slice(0, 7)}: ${result.identical ? 'identical' : `${result.differ.length} files differ`}` : ''}`);
process.exitCode = opts.against && !result.identical ? 1 : 0;
