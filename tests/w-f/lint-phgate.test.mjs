// Negative controls for lint (the rAF file allowlist) and ph-gate (tokens outside .ph, an unmarked token in content).
// GPU-free: `node --test tests/w-f/lint-phgate.test.mjs`. Everything runs on temp copies; no tracked file is edited.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateContent } from '../../src/lib/content/validate.js';

const ROOT = resolve(import.meta.dirname, '../..');
const node = (script, ...args) => spawnSync(process.execPath, [join(ROOT, script), ...args], { cwd: ROOT, encoding: 'utf8' });
const tmp = () => mkdtempSync(join(tmpdir(), 'wf-neg-'));

test('lint: the real tree passes, so the allow-listed files (src/evf/gl/engine.ts, src/evf/main.ts) are accepted', () => {
  const r = node('scripts/check/lint.mjs');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /rAF mentions, all in the allowlist/);
});

test('lint: a planted requestAnimationFrame in a file outside the allowlist fails', () => {
  const dir = tmp();
  try {
    mkdirSync(join(dir, 'evf'), { recursive: true });
    writeFileSync(join(dir, 'evf', 'planted.ts'), 'export const loop = () => requestAnimationFrame(loop);\n');
    const r = node('scripts/check/lint.mjs', '--src', dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /requestAnimationFrame outside the allowlist/);
    assert.match(r.stderr, /planted\.ts/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lint: a clean source tree passes the rAF rule', () => {
  const dir = tmp();
  try {
    writeFileSync(join(dir, 'clean.ts'), 'export const x = 1;\n');
    assert.equal(node('scripts/check/lint.mjs', '--src', dir).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const page = (body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title><meta name="robots" content="noindex"></head><body>${body}</body></html>`;
function phgate(body) {
  const dist = tmp();
  try {
    writeFileSync(join(dist, 'index.html'), page(body));
    return node('scripts/check/ph-gate.mjs', '--dist', dist);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}

test('ph-gate: a token inside a .ph slot passes the page checks', () => {
  const r = phgate('<p><span class="ph">[PLACEHOLDER: x]</span></p>');
  assert.equal(r.status, 0, r.stderr);
});

test('ph-gate: a planted token outside .ph fails', () => {
  const r = phgate('<p>[PLACEHOLDER: x]</p>');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /\.ph|slot|outside/i);
});

test('ph-gate: a planted unmarked placeholder word in a page fails', () => {
  const r = phgate('<p>Placeholder copy</p>');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /malformed or unmarked/);
});

test('ph-gate content rules: an unmarked token in a confirmed content entry fails', () => {
  const read = (f) => JSON.parse(readFileSync(join(ROOT, 'content', f), 'utf8'));
  const input = { projects: read('projects.json'), honours: read('honours.json'), profile: read('profile.json'), lookIds: read('tokens.json').filmLooks.ids };
  assert.deepEqual(validateContent(input).errors, [], 'the real content is valid');
  const bad = structuredClone(input);
  bad.projects.projects[0].placeholder = false; // confirmed, but the entry still holds tokens
  const { errors } = validateContent(bad);
  assert.ok(errors.length > 0, 'a confirmed entry that holds a token is an error');
  assert.ok(errors.some((e) => /token|placeholder/i.test(e)), errors.slice(0, 3).join(' | '));
});
