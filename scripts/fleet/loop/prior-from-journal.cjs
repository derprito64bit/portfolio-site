#!/usr/bin/env node
// Builds every crew-loop continuation from the run's journal, so no prior is ever retyped (one changed character fails
// the seal). It replays the journal through the launched file's OWN loop(): each agent call gets its recorded result by
// label, the first call with none gets null (and so does its retry), and loop() returns exactly the state it returned
// live, or the died-state it would have returned (resume step, finished stages, hist, the digest, the queue, the grant,
// the seal). Works whether the run returned or ended without a return value (usage limit, restart, a hung agent).
// Usage: node scripts/fleet/loop/prior-from-journal.cjs <launched.js> <journal.jsonl> --write <next.js>
//          [--grant code=1[,evidence=1]] [--refresh <crew-config.json>] [--spec <spec.md> --spec-meta <meta.json>] [--out <prior.json>]
//   --grant    rounds to ADD (loop() adds them to the grant already sealed into the prior).
//   --refresh  re-merges the crew's entry from that config (a ruling that changed a knob); id, issue and repo may not change.
//   --spec     a newer spec version (with its --spec-meta) for the continuation.
// Then: node scripts/fleet/loop/crew-loop.check.cjs <next.js> must print LAUNCH READY; Workflow({ scriptPath: <next.js> }) with NO args.
const fs = require('fs');
const path = require('path');
const { mergeCrew, readSpec, continuation, split, load, parallel } = require('./loop-lib.cjs');

async function replay(src, journalText) {
  const fn = load(src);
  const lines = journalText.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const labelOf = {};
  const byLabel = {};
  for (const x of lines) if (x.type === 'started') labelOf[x.key] = x.label;
  for (const x of lines) if (x.type === 'result' && x.key in labelOf) byLabel[labelOf[x.key]] = x.result;
  const trace = [];
  const logs = [];
  const agent = async (prompt, o) => {
    const has = Object.prototype.hasOwnProperty.call(byLabel, o.label);
    trace.push(has ? o.label : `${o.label} (no recorded result: the continuation resumes here)`);
    return has ? byLabel[o.label] : null;
  };
  const res = await fn(agent, parallel, null, (m) => logs.push(m), () => {}, undefined, {}, null);
  const unused = Object.keys(byLabel).filter((l) => !trace.includes(l));
  return { res, trace, logs, unused };
}

const parseGrant = (s) => Object.fromEntries(String(s).split(',').filter(Boolean).map((p) => { const [k, v] = p.split('='); return [k.trim(), Number(v)]; }));

module.exports = { replay, parseGrant };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  const [script, journal] = pos;
  if (!script || !journal) {
    console.error('usage: prior-from-journal.cjs <launched.js> <journal.jsonl> --write <next.js> [--grant code=1] [--refresh <crew-config.json>] [--spec <md> --spec-meta <json>] [--out <prior.json>]');
    process.exit(2);
  }
  const src = fs.readFileSync(script, 'utf8');
  const { base, embedded } = split(src);
  if (!embedded) {
    console.error('ERROR: the script has no EMBEDDED_ARGS line; pass the file launch.cjs (or an earlier continuation) wrote');
    process.exit(2);
  }
  replay(src, fs.readFileSync(journal, 'utf8')).then(({ res, trace, unused }) => {
    console.log('replayed:', trace.join(' -> '));
    if (unused.length) {
      console.error('ERROR: recorded results the replay never asked for (the wrong script for this journal?):', unused.join(', '));
      process.exit(1);
    }
    console.log(`status ${res.status}, round ${res.round}${res.resume ? `, resume at ${res.resume} (${res.pendingKind} round)` : ''}`);
    if (res.status === 'approved') {
      console.log('the run was approved; nothing to continue');
      return;
    }
    if (flags.out) fs.writeFileSync(flags.out, JSON.stringify(res));
    if (!flags.write) {
      console.log('NOTE: pass --write <next.js> for a launchable continuation');
      return;
    }
    const next = { crew: embedded.crew, cfg: embedded.cfg, spec: embedded.spec, prior: res };
    if (flags.refresh) {
      const cfg = mergeCrew(JSON.parse(fs.readFileSync(flags.refresh, 'utf8')), embedded.crew);
      delete cfg.draft;
      for (const k of ['id', 'issue', 'repo']) if (cfg[k] !== embedded.cfg[k]) { console.error(`ERROR: --refresh may not change ${k} (${embedded.cfg[k]} -> ${cfg[k]}); the crew's identity is sealed into the prior`); process.exit(2); }
      next.cfg = cfg;
    }
    if (flags.spec) next.spec = readSpec(flags.spec, flags['spec-meta']);
    if (flags.grant) next.grant = parseGrant(flags.grant);
    if (['cap', 'stalled'].includes(res.status) && !flags.grant) console.log('WARNING: the run ended at a cap or a stall; without --grant the continuation ends again at once');
    fs.writeFileSync(flags.write, continuation(base, next));
    console.log(`continuation written to ${flags.write}${flags.refresh ? ' (config refreshed)' : ''}${flags.spec ? ` (spec ${next.spec.version})` : ''}`);
    console.log(`next: node ${path.join(__dirname, 'crew-loop.check.cjs')} ${flags.write}, then Workflow({ scriptPath: '${flags.write.replace(/\\/g, '/')}' }) with NO args`);
  }).catch((e) => {
    console.error('replay failed:', e.message);
    process.exit(1);
  });
}
