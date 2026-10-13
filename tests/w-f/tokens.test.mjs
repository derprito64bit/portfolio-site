// #62's shared tokens, checked against the locked sentences they come from (no literal here): GPU-free,
// `node --test tests/w-f/tokens.test.mjs`. On main before #62 durations.rollerTail and the flash export are missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../harness/lib.mjs';
import * as tokens from '../../src/lib/tokens.js';

const plan = readFileSync(join(ROOT, 'docs/direction/front-door-plan.md'), 'utf8');
const playbook = readFileSync(join(ROOT, 'docs/direction/fx-playbook.md'), 'utf8');
const css = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');

test("motion.durationsMs.rollerTail is fx-playbook section 2's tail: 'streaks end at eject end + N ms'", () => {
  const m = /streaks end at eject end \+ (\d+) ms/.exec(playbook);
  assert.ok(m, 'the sentence is in docs/direction/fx-playbook.md');
  assert.equal(tokens.durations.rollerTail, Number(m[1]));
  assert.match(css, new RegExp(`--dur-roller-tail: ${m[1]}ms;`));
});

test("motion.flash is W-D011's flash shape: 'peak P at +N ms'", () => {
  const m = /flash \d+ \(radial from the lens, peak ([\d.]+) at \+(\d+) ms/.exec(plan);
  assert.ok(m, "W-D011's flash sentence is in docs/direction/front-door-plan.md");
  assert.deepEqual({ ...tokens.flash }, { peakAtMs: Number(m[2]), peakOpacity: Number(m[1]) });
  assert.match(css, new RegExp(`--flash-peak-at: ${m[2]}ms;`));
  assert.match(css, new RegExp(`--flash-peak-opacity: ${m[1]};`));
});

test('the flash shape fits inside the flash: peakAtMs < durations.flash', () => {
  assert.ok(tokens.flash.peakAtMs > 0 && tokens.flash.peakAtMs < tokens.durations.flash);
});

test('no motion.heroGuardsMs keys (the hero guards live in heroTimelineMs, W-S1)', () => {
  const src = JSON.parse(readFileSync(join(ROOT, 'content/tokens.json'), 'utf8'));
  assert.equal(src.motion.heroGuardsMs, undefined);
  assert.equal(typeof tokens.heroTimeline.lateGlAfterFcp, 'number');
});
