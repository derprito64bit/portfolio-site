// The camera develop patch (D-024): GPU-free checks. node --test tests/w-s1/patch.test.mjs
// - every replace() of the GLSL patch finds its anchor in three's own lit fragment shaders (a three upgrade that
//   moves <colorspace_fragment> fails here, not as a camera that never develops);
// - the frozen uniform names are declared once each;
// - the phase timing comes from the tokens and the phases run in A1's order;
// - the material groups put silver first and the amber accents last.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShaderLib } from 'three';
import { CAMERA_MAIN, CAMERA_PARS, GROUND_FRAG, patchCameraFragment } from '../../src/gl/effects/develop/camera.ts';
import { drawingPhases, drawingTiming, groupOf } from '../../src/gl/camera/drawing.ts';
import { durations, heroTimeline } from '../../src/lib/tokens.js';

const FROZEN = ['uCamClay', 'uCamDev', 'uCamFade', 'uCamGroup', 'uCamGround'];

for (const lib of ['physical', 'standard']) {
  test(`patch anchors in three's ${lib} fragment shader`, () => {
    const out = patchCameraFragment(ShaderLib[lib].fragmentShader);
    assert.ok(out, 'patchCameraFragment returned null');
    assert.ok(out.includes(CAMERA_MAIN), 'the develop block is in');
    assert.ok(out.indexOf(CAMERA_PARS) < out.indexOf('void main()'), 'declarations before main()');
    assert.ok(out.indexOf('#include <colorspace_fragment>') < out.indexOf(CAMERA_MAIN), 'after the colour-space encode');
  });
}

test('a shader without the anchor is refused', () => {
  assert.equal(patchCameraFragment('void main() { gl_FragColor = vec4(1.0); }'), null);
});

test('frozen uniform names are declared once each', () => {
  for (const name of FROZEN) assert.equal(CAMERA_PARS.split(`uniform `).filter((l) => new RegExp(`\\b${name}\\b`).test(l.split(';')[0])).length, 1, name);
  for (const name of ['uCamDev', 'uCamFade', 'uCamGround']) assert.ok(GROUND_FRAG.includes(name), `ground uses ${name}`);
});

test('timing from the tokens; the eject sequence starts after clay and develop', () => {
  assert.equal(drawingTiming.clay, durations.heroDrawingClay);
  assert.equal(drawingTiming.develop, durations.heroDrawingDevelop);
  assert.equal(drawingTiming.fade, durations.heroDrawingFade);
  assert.equal(drawingTiming.total, durations.heroDrawingClay + durations.heroDrawingDevelop);
  // budgets.md: readable at gl-ready + t0AfterGlReady + drawing + readable, within the budget.
  assert.ok(heroTimeline.t0AfterGlReady + drawingTiming.total + heroTimeline.readable <= heroTimeline.budgetAfterGlReady);
  assert.equal(heroTimeline.readableAfterGlReady, heroTimeline.t0AfterGlReady + drawingTiming.total + heroTimeline.readable);
});

test('phases in A1 order: clay, silver, black, amber; lines fade with the veil', () => {
  const rows = drawingPhases(0, 'test');
  const at = (id) => rows.find((r) => r.id === `hero:drawing:${id}`);
  const order = ['clay', 'silver', 'black', 'amber'].map(at);
  assert.ok(order.every(Boolean));
  for (let i = 1; i < order.length; i++) assert.ok(order[i].t0 >= order[i - 1].t0, `${order[i].id} starts after ${order[i - 1].id}`);
  assert.ok(order[3].t1 >= order[2].t1 && order[3].t1 <= drawingTiming.total, 'amber ends last, within the develop');
  assert.ok(at('lines-fade'));
});

test('material groups', () => {
  assert.equal(groupOf('cam_silver'), 0);
  assert.equal(groupOf('cam_silver_dial_top'), 0);
  assert.equal(groupOf('cam_lens_silver'), 0);
  assert.equal(groupOf('cam_black_metal'), 1);
  assert.equal(groupOf('cam_leather'), 1);
  assert.equal(groupOf('cam_amber'), 2);
  assert.equal(groupOf('cam_lamp'), 2);
});
