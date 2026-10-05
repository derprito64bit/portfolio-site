// The console gate's dated allowlist (#54 item 3): GPU-free, `node --test tests/w-f/console-allow.test.mjs`.
// The X4122 entry lets ANGLE's HLSL note through as a warning, and nothing else: not the same text as an error, not
// another compiler warning, not after its expiry, and not with the allowlist main had before (empty).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { consoleGate, loadAllowlist } from '../harness/lib.mjs';

const X4122 = 'THREE.WebGLProgram: Program Info Log: (210,81-129): warning X4122: sum of 0.996094 and -2.98545e-017 cannot be represented accurately in double precision';

/** A stand-in page: emits console messages the way Playwright's page does. */
function fakePage(messages) {
  const page = new EventEmitter();
  return {
    page,
    flush: () => messages.forEach(([type, text]) => page.emit('console', { type: () => type, text: () => text })),
  };
}
function verdict(messages, opts) {
  const { page, flush } = fakePage(messages);
  const gate = consoleGate(page, opts);
  flush();
  return gate.verdict();
}

test('the allowlist holds the X4122 entry with a reason, an owner and an expiry of 2027-01-01', () => {
  const allow = loadAllowlist('2026-10-05');
  const e = allow.find((a) => a.regex === 'warning X4122\\b');
  assert.ok(e, 'X4122 entry present');
  assert.equal(e.expiry, '2027-01-01');
  assert.ok(e.reason.length > 20 && e.addedBy);
});

test("three's X4122 program-log warning passes the gate", () => {
  assert.equal(verdict([['warning', X4122]]).pass, true);
});

test('negative: with the allowlist main had (empty) the same warning fails the gate', () => {
  assert.equal(verdict([['warning', X4122]], { allow: [] }).pass, false);
});

test('negative: the same text as an error still fails (errors are never allowlisted)', () => {
  assert.equal(verdict([['error', X4122]]).pass, false);
});

test('negative: another compiler warning, or X41220, still fails', () => {
  assert.equal(verdict([['warning', X4122.replace('X4122', 'X3557')]]).pass, false);
  assert.equal(verdict([['warning', X4122.replace('X4122:', 'X41220:')]]).pass, false);
});

test('negative: after its expiry the entry stops matching', () => {
  assert.equal(verdict([['warning', X4122]], { allow: loadAllowlist('2027-01-02') }).pass, false);
});
