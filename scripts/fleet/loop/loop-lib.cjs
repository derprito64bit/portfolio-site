// Shared by launch.cjs, prior-from-journal.cjs and crew-loop.check.cjs: the config merge, the spec, the embedded-args
// line a launched crew-loop file ends with, and a loader that runs the template the way the Workflow tool does.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const HERE = __dirname;
const TEMPLATE = path.join(HERE, 'crew-loop.js');
const CONFIG = path.join(HERE, 'crew-config.json');
const MARK = 'function EMBEDDED_ARGS() { return ';
const TAIL = ' } // crew-loop args (config, spec, sealed prior), written by scripts/fleet/loop/launch.cjs or prior-from-journal.cjs; never edit this line';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
// Defaults merged with one crew's entry: objects merge one level deep (a crew's breaker.passes keeps the default
// breaker.timeboxMin), arrays and scalars replace.
function mergeCrew(config, key) {
  const crew = config.crews && config.crews[key];
  if (!crew) throw new Error(`no crew '${key}' in the config (crews: ${Object.keys(config.crews || {}).join(', ')})`);
  const out = {};
  for (const k of new Set([...Object.keys(config.defaults || {}), ...Object.keys(crew)])) {
    const d = config.defaults[k];
    const c = crew[k];
    out[k] = c === undefined ? d : isObj(d) && isObj(c) ? { ...d, ...c } : c;
  }
  return out;
}

const norm = (s) => String(s).replace(/\r\n?/g, '\n');
// The spec: the text of <spec.md> and its metadata { version, postedAt, commentUrl }; the hash is computed here.
function readSpec(mdPath, metaPath) {
  const text = norm(fs.readFileSync(mdPath, 'utf8')).trim();
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return { version: meta.version, postedAt: meta.postedAt, commentUrl: meta.commentUrl, path: mdPath.replace(/\\/g, '/'), sha256: crypto.createHash('sha256').update(text).digest('hex'), text };
}

// A script = the template text plus one appended data line (JSON is a JS expression; U+2028/2029 escaped so it stays one line).
function continuation(base, args) {
  const BS = String.fromCharCode(92);
  const data = JSON.stringify(args).replace(new RegExp(String.fromCharCode(0x2028), 'g'), BS + 'u2028').replace(new RegExp(String.fromCharCode(0x2029), 'g'), BS + 'u2029');
  return (base.endsWith('\n') ? base : base + '\n') + MARK + data + TAIL + '\n';
}
function split(src) {
  const i = src.lastIndexOf('\n' + MARK);
  if (i < 0) return { base: src, embedded: null };
  const line = src.slice(i + 1).replace(/\r?\n$/, '');
  if (line.includes('\n') || !line.endsWith(TAIL)) throw new Error('malformed EMBEDDED_ARGS line: it must be the last line of the file, exactly as launch.cjs wrote it');
  return { base: src.slice(0, i + 1), embedded: JSON.parse(line.slice(MARK.length, line.length - TAIL.length)) };
}

// The Workflow tool runs a script as an async function body with these globals.
function load(src) {
  const AF = Object.getPrototypeOf(async function () {}).constructor;
  return new AF('agent', 'parallel', 'pipeline', 'log', 'phase', 'args', 'budget', 'workflow', src.replace(/^export const meta/m, 'const meta'));
}
const parallel = (ts) => Promise.all(ts.map((t) => t().catch(() => null)));

// Words, not markup: markdown emphasis, list markers and runs of whitespace do not count when a quote is compared.
const words = (s) => norm(s).replace(/\*\*|__|`/g, '').replace(/^\s*[-*]\s+/gm, ' ').replace(/^\s*\d+\.\s+/gm, ' ').replace(/\s+/g, ' ').trim();

module.exports = { HERE, TEMPLATE, CONFIG, MARK, TAIL, mergeCrew, readSpec, continuation, split, load, parallel, words, norm };
