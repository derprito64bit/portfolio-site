#!/usr/bin/env node
// Writes a launchable crew-loop file for one crew (PLAN.md tooling item): the reviewed template plus ONE appended
// EMBEDDED_ARGS line holding the crew's merged config (crew-config.json defaults + its entry) and its versioned spec.
// Workflow scripts cannot read files, so this is how the knobs and the spec reach the loop.
// Usage: node scripts/fleet/loop/launch.cjs <crew> --spec <spec.md> --spec-meta <meta.json> --out <dir> [--config <crew-config.json>] [--allow-draft]
//   meta.json: { "version": "v1", "postedAt": "<ISO time of the spec's Orchestrator comment>", "commentUrl": "<its URL>" }
//   --allow-draft is for the check's own fixtures only; a real launch never passes it.
// Then it runs crew-loop.check.cjs on the written file (LAUNCH READY is required before the launch) and prints the call:
//   Workflow({ scriptPath: '<dir>/crew-loop.<crew>.js' }) with NO args.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TEMPLATE, CONFIG, mergeCrew, readSpec, continuation } = require('./loop-lib.cjs');

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  else pos.push(argv[i]);
}
const die = (m) => {
  console.error(`launch: ${m}`);
  process.exit(2);
};
const crew = pos[0];
if (!crew || !flags.spec || !flags['spec-meta'] || !flags.out) die('usage: launch.cjs <crew> --spec <spec.md> --spec-meta <meta.json> --out <dir> [--config <crew-config.json>]');
const config = JSON.parse(fs.readFileSync(flags.config || CONFIG, 'utf8'));
const cfg = mergeCrew(config, crew);
if (cfg.draft && !flags['allow-draft']) die(`crew ${crew} is a draft in the config (${cfg.draft}); fill its entry through an orchestrator PR first`);
delete cfg.draft;
const spec = readSpec(flags.spec, flags['spec-meta']);
if (spec.text.length > cfg.limits.specChars) die(`the spec is ${spec.text.length} chars, over limits.specChars ${cfg.limits.specChars}`);
fs.mkdirSync(flags.out, { recursive: true });
const args = { crew, cfg, spec };
const file = path.join(flags.out, `crew-loop.${crew}.js`);
fs.writeFileSync(file, continuation(fs.readFileSync(TEMPLATE, 'utf8'), args));
fs.writeFileSync(path.join(flags.out, `launch-args.${crew}.json`), `${JSON.stringify(args, null, 2)}\n`);
console.log(`launch: wrote ${file} (spec ${spec.version}, ${spec.text.length} chars, sha256 ${spec.sha256.slice(0, 12)})`);
const pass = ['offline', 'allow-unmerged'].filter((k) => flags[k]).map((k) => `--${k}`);
let out = '';
try {
  out = execFileSync(process.execPath, [path.join(__dirname, 'crew-loop.check.cjs'), file, ...pass], { encoding: 'utf8' });
} catch (e) {
  out = `${e.stdout || ''}${e.stderr || ''}`;
}
process.stdout.write(out);
if (pass.length) {
  console.log('launch: a test launch (--offline or --allow-unmerged): never launch this file');
  process.exit(/^ALL CHECKS OK/m.test(out) ? 0 : 1);
}
if (!/^LAUNCH READY$/m.test(out)) {
  console.error('launch: the check did not print LAUNCH READY; do not launch');
  process.exit(1);
}
console.log(`next: Workflow({ scriptPath: '${file.replace(/\\/g, '/')}' }) with NO args`);
