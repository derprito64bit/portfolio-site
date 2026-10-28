#!/usr/bin/env node
// Cost line per round (PLAN.md operating model item 6; system review 2026-10-13, flaw 10): the API-equivalent cost of a
// crew-loop workflow run's agents, per round and per stage, from their transcripts. An estimate: the subscription
// meter's formula is not published.
// Usage: node scripts/fleet/cost-line.mjs <workflow transcript dir> [--round <n>] [--json]
//   The dir holds journal.jsonl and agent-<id>.jsonl (the Workflow tool's transcript folder for one run).
// Tokens: assistant lines are one per content block and share a requestId with the same usage, so each request counts
// once; input, cache reads and cache writes (5-minute and 1-hour) come from that usage; output is the final count where
// a line carries a stop_reason, else the largest streamed snapshot (so output is a lower bound).
// Prices ($ per million tokens; claude-api skill, cached 2026-10-06): Opus 5.5 4 / 20, cache read 0.20; Sonnet 5.5 2 / 10,
// cache read 0.20; Haiku 5.5 0.10 / 0.50, cache read 0.01; cache writes 1.25x input (5 minutes) and 2x input (1 hour).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PRICES = {
  opus: { in: 4, cr: 0.2, out: 20 },
  sonnet: { in: 2, cr: 0.2, out: 10 },
  haiku: { in: 0.1, cr: 0.01, out: 0.5 },
};
const priceOf = (model) => PRICES[/haiku/.test(model || '') ? 'haiku' : /sonnet/.test(model || '') ? 'sonnet' : 'opus'];

const argv = process.argv.slice(2);
const dir = argv.find((a) => !a.startsWith('--'));
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
if (!dir || !existsSync(join(dir, 'journal.jsonl'))) {
  console.error('usage: cost-line.mjs <workflow transcript dir with journal.jsonl> [--round <n>] [--json]');
  process.exit(2);
}
const lines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// agentId -> label, from the journal's started lines.
const labelOf = {};
for (const x of lines(join(dir, 'journal.jsonl'))) if (x.type === 'started' && x.agentId) labelOf[x.agentId] = x.label;

function agentCost(file) {
  const reqs = new Map();
  for (const d of lines(file)) {
    if (d.type !== 'assistant') continue;
    const m = d.message || {};
    const id = d.requestId || m.id;
    if (!id) continue;
    const u = m.usage || {};
    const r = reqs.get(id) || { model: m.model, in: u.input_tokens || 0, cr: u.cache_read_input_tokens || 0, cc: u.cache_creation_input_tokens || 0, cc1h: (u.cache_creation && u.cache_creation.ephemeral_1h_input_tokens) || 0, out: 0, final: null };
    r.out = Math.max(r.out, u.output_tokens || 0);
    if (m.stop_reason) r.final = u.output_tokens || 0;
    reqs.set(id, r);
  }
  const t = { usd: 0, in: 0, cr: 0, cw: 0, out: 0, model: null };
  for (const r of reqs.values()) {
    const p = priceOf(r.model);
    const out = r.final ?? r.out;
    const cc5 = Math.max(0, r.cc - r.cc1h);
    t.usd += (r.in * p.in + r.cr * p.cr + cc5 * p.in * 1.25 + r.cc1h * p.in * 2 + out * p.out) / 1e6;
    t.in += r.in;
    t.cr += r.cr;
    t.cw += r.cc;
    t.out += out;
    t.model = t.model || r.model;
  }
  return t;
}

const stageOf = (label) => (/:([a-z]+)#/.exec(label) || [null, 'crew'])[1];
const rounds = {};
for (const f of readdirSync(dir).filter((n) => /^agent-.*\.jsonl$/.test(n))) {
  const id = f.slice(6, -6);
  const label = labelOf[id] || `(unlabelled ${id})`;
  const round = Number((/#(\d+)/.exec(label) || [])[1]) || 0;
  const c = agentCost(join(dir, f));
  const r = (rounds[round] = rounds[round] || { usd: 0, stages: {}, agents: 0, tokens: { in: 0, cr: 0, cw: 0, out: 0 } });
  r.usd += c.usd;
  r.agents++;
  const s = stageOf(label);
  r.stages[s] = (r.stages[s] || 0) + c.usd;
  for (const k of ['in', 'cr', 'cw', 'out']) r.tokens[k] += c[k];
}
const total = Object.values(rounds).reduce((a, r) => a + r.usd, 0);
const want = opt('--round');
const fmt = (n) => `$${n.toFixed(n < 10 ? 2 : 0)}`;
const M = (n) => `${(n / 1e6).toFixed(1)}M`;
if (argv.includes('--json')) {
  console.log(JSON.stringify({ total, rounds }, null, 2));
  process.exit(0);
}
for (const [n, r] of Object.entries(rounds).sort((a, b) => a[0] - b[0])) {
  if (want && String(n) !== String(want)) continue;
  console.log(`cost: round ${n} ~${fmt(r.usd)} (${Object.entries(r.stages).map(([s, v]) => `${s} ${fmt(v)}`).join(', ')}; ${r.agents} agents; tokens in ${M(r.tokens.in)}, cache read ${M(r.tokens.cr)}, cache write ${M(r.tokens.cw)}, out >= ${M(r.tokens.out)})`);
}
console.log(`cost: run total so far ~${fmt(total)} (API-equivalent estimate; output tokens are a lower bound)`);
