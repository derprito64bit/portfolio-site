// The console gate's dated allowlist (#54 item 3, W-D030): GPU-free, `node --test tests/w-f/console-allow.test.mjs`.
// The X4122 entry lets ANGLE's HLSL note through as a warning, and nothing else:
// - not the same text as an error, not another compiler warning, not after its expiry, not with main's empty list;
// - not when the same warning carries another line (three logs a program's whole info log in one console.warn), and
//   never a W-D030 failure word, whatever the allowlist says;
// - a malformed entry (a non-date or unpadded expiry, a missing field, a catch-all regex) throws instead of matching.
// Negative control: ALLOW_LIB=<a copy of the pre-fix lib.mjs in tests/harness/> runs these tests against it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lib = await import(process.env.ALLOW_LIB ? new URL(`../harness/${process.env.ALLOW_LIB}`, import.meta.url).href : '../harness/lib.mjs');
const { consoleGate, loadAllowlist } = lib;

const X4122 = 'THREE.WebGLProgram: Program Info Log: (210,81-129): warning X4122: sum of 0.996094 and -2.98545e-017 cannot be represented accurately in double precision';
const X4122_LINE = '(211,9-60): warning X4122: sum of 0.5 and -1.2e-017 cannot be represented accurately in double precision';
const TODAY = '2026-10-05';

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
  const gate = consoleGate(page, { allow: loadAllowlist(TODAY), ...opts });
  flush();
  return gate.verdict();
}
/** loadAllowlist on a planted file holding `entries`. */
const dir = mkdtempSync(join(tmpdir(), 'allow-'));
let n = 0;
function planted(entries, today = TODAY) {
  const file = join(dir, `allow-${n++}.json`);
  writeFileSync(file, JSON.stringify({ allow: entries }));
  return loadAllowlist(today, file);
}
const entry = (over) => ({ regex: 'warning X9999: planted note', reason: 'a planted entry for the gate test', addedBy: 'test', expiry: '2026-12-31', ...over });

test('the allowlist holds the X4122 entry with a reason, an owner and an expiry of 2027-01-01', () => {
  const e = loadAllowlist(TODAY).find((a) => /X4122/.test(a.regex));
  assert.ok(e, 'X4122 entry present');
  assert.equal(e.expiry, '2027-01-01');
  assert.ok(e.reason.length > 20 && e.addedBy);
});

test("three's X4122 program-log warning passes the gate, with one note or several", () => {
  assert.equal(verdict([['warning', X4122]]).pass, true);
  assert.equal(verdict([['warning', `${X4122}\n${X4122_LINE}\n`]]).pass, true);
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

// ---- one message, several lines (Breaker 1.1 #1, manager must-fix console-allowlist-bypass)
const combined = {
  'X4122 plus a warning X3571 line': `${X4122}\n(12,5-30): warning X3571: pow(f, e) will not work for negative f`,
  'X4122 plus a warning X3557 line': `${X4122}\n(40,1): warning X3557: loop only executes for 1 iteration(s), forcing loop to unroll`,
  'X4122 plus error X3004 (validation failed)': `${X4122}\n(88,3): error X3004: undeclared identifier (program validation failed)`,
  'X4122 plus CONTEXT_LOST_WEBGL': `${X4122}\nWebGL: CONTEXT_LOST_WEBGL: loseContext: context lost`,
  'X4122 plus program validation failed': `${X4122}\nprogram validation failed`,
  'an unrelated GL_INVALID_OPERATION warning quoting X4122': 'GL_INVALID_OPERATION: glDrawArrays: (see warning X4122 note)',
  'X4122 with trailing text on its line': `${X4122} and then something else`,
};
for (const [name, text] of Object.entries(combined)) {
  test(`negative: ${name} fails in one warning`, () => {
    assert.equal(verdict([['warning', text]]).pass, false);
  });
}

test('negative: a W-D030 failure word fails at any level, even on a line an entry allows', () => {
  const allowWord = planted([entry({ regex: 'warning X9999: planted note(?: failed)?' })]);
  assert.equal(verdict([['warning', 'warning X9999: planted note failed']], { allow: allowWord }).pass, false);
  assert.equal(verdict([['log', 'Uncaught exception in hook']]).pass, false);
});

test('negative: GL_INVALID_* and CONTEXT_LOST_* fail below the error level (W-D030 words read as prefixes)', () => {
  assert.equal(verdict([['info', 'WebGL: CONTEXT_LOST_WEBGL: loseContext: context lost']]).pass, false);
  assert.equal(verdict([['log', '[.WebGL-0x1]GL_INVALID_OPERATION: glDrawArrays: no program']]).pass, false);
  assert.equal(verdict([['info', 'GL_INVALID_ENUM : glTexParameteri']]).pass, false);
});

// ---- entries checked for form (Breaker 1.2 #2, manager must-fix console-allowlist-validation)
test('control: an ISO expiry already past is dropped and the planted warning fails', () => {
  const allow = planted([entry({ expiry: '2026-09-01' })]);
  assert.equal(allow.length, 0);
  assert.equal(verdict([['warning', 'warning X9999: planted note']], { allow }).pass, false);
});
test('control: an ISO expiry in force lets exactly its line through', () => {
  const allow = planted([entry()]);
  assert.equal(verdict([['warning', 'warning X9999: planted note']], { allow }).pass, true);
  assert.equal(verdict([['warning', 'an unrelated warning']], { allow }).pass, false);
});
for (const expiry of ['2026-9-1', 'never', 'permanent', 'TBD', '9999', '2026-13-45', '2026-02-30', '2026-10-5', ' 2026-12-31', '2026/12/31', '20261231']) {
  test(`negative: expiry ${JSON.stringify(expiry)} throws`, () => {
    assert.throws(() => planted([entry({ expiry })]), /expiry/);
  });
}
for (const regex of ['.', '.*', '.+', '[\\s\\S]*', 'warning.*', '(?:)', '\\S+', '.*X\\d+.*', 'THREE\\..*', '\\(\\d+,\\d+(?:-\\d+)?\\): warning X\\d+: .*']) {
  test(`negative: catch-all regex ${JSON.stringify(regex)} throws`, () => {
    assert.throws(() => planted([entry({ regex })]), /too broad/);
  });
}
for (const field of ['regex', 'reason', 'addedBy', 'expiry']) {
  test(`negative: a missing or blank ${field} throws`, () => {
    assert.throws(() => planted([entry({ [field]: undefined })]), new RegExp(field));
    assert.throws(() => planted([entry({ [field]: '  ' })]), new RegExp(field));
  });
}
test('negative: a regex that does not compile, a non-array list and a malformed today throw', () => {
  assert.throws(() => planted([entry({ regex: 'warning X9999: (' })]), /compile/);
  const file = join(dir, 'not-array.json');
  writeFileSync(file, JSON.stringify({ allow: { regex: 'x' } }));
  assert.throws(() => loadAllowlist(TODAY, file), /array/);
  assert.throws(() => planted([entry()], '2026-10-5'), /today/);
});
test('negative: an example that the regex does not match, or that holds a failure word, throws', () => {
  assert.throws(() => planted([entry({ example: 'warning X9998: planted note' })]), /example/);
  assert.throws(() => planted([entry({ regex: 'warning X9999: planted note(?: failed)?', example: 'warning X9999: planted note failed' })]), /failure word/);
});
test('the shipped file loads (every entry well formed) on today and on its last day', () => {
  assert.ok(loadAllowlist(TODAY).length >= 1);
  assert.ok(loadAllowlist('2027-01-01').length >= 1);
});
