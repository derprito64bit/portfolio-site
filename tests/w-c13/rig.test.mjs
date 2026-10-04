// W-C13 rig acceptance (m1, kept through m2): every W-D019 pivot, marker and material is found in three r186, with
// the original transforms; m2 adds the X-T5's own controls, the decals and the strap to the same contract.
// GPU-free (CI). Run: node --test tests/w-c13/
//
// "Original transforms" are checked twice: against assets-src/3d/camera_xt/rig.json (written from the raw Blender
// exports by scripts/build/glb/rig.mjs) and against the raw exports themselves, loaded in the same three r186.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Box3, REVISION } from "three";
import { buildRig, LODS, SPEC } from "../../scripts/build/glb/rig.mjs";
import { loadGlb, meshesOf } from "./lib/load-glb.mjs";
import { bestRingGapDeg, RING } from "./lib/ring.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rig = JSON.parse(readFileSync(join(repo, "assets-src/3d/camera_xt/rig.json"), "utf8"));
const EXACT = 1e-7;      // node transforms are stored as floats and never touched by the optimizer
const PLACE = 5e-5;      // 0.05 mm: 14-bit position quantization over the largest part is about 0.009 mm

const close = (a, b, tol, what) =>
  a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) <= tol, `${what}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`));

test("three is r186 (deps.md: three 0.186.1)", () => {
  assert.equal(REVISION, "186");
});

test("rig.json is current with the raw exports and the shipped GLBs", () => {
  const { rig: fresh, errors } = buildRig();
  assert.deepEqual(errors, []);
  assert.deepEqual(JSON.parse(JSON.stringify(fresh)), rig, "run node scripts/build/glb/rig.mjs");
});

for (const [lod, def] of Object.entries(LODS)) {
  describe(`${lod} (public/models/${def.file})`, () => {
    let shipped, raw;
    before(async () => {
      shipped = await loadGlb(join(repo, "public/models", def.file));
      raw = await loadGlb(join(repo, "assets-src/3d/camera_xt/export", def.file));
    });

    test("every pivot, marker and decal is found, with its original transform and parent", () => {
      const names = [...def.pivots, ...SPEC.markers, ...SPEC.decals];
      assert.equal(Object.keys(rig.lods[lod].nodes).length, names.length);
      for (const name of names) {
        const o = shipped.scene.getObjectByName(name);
        assert.ok(o, `${name} missing`);
        const want = rig.lods[lod].nodes[name];
        close(o.position.toArray(), want.translation, EXACT, `${name} translation`);
        close(o.quaternion.toArray(), want.rotation, EXACT, `${name} rotation`);
        close(o.scale.toArray(), want.scale, EXACT, `${name} scale`);
        assert.equal(o.parent === shipped.scene ? null : o.parent.name, want.parent, `${name} parent`);
        const r = raw.scene.getObjectByName(name);
        close(o.matrixWorld.elements, r.matrixWorld.elements, EXACT, `${name} world matrix vs raw export`);
      }
    });

    test("pivots are empties that carry their own part, so turning one moves only that part", () => {
      for (const name of def.pivots) {
        const o = shipped.scene.getObjectByName(name);
        assert.ok(!o.isMesh, `${name} must be an empty`);
        if (SPEC.pivots[name].part === false) continue;          // a hinge whose child carries the part
        assert.ok(o.getObjectByName(`${name}_mesh`), `${name}_mesh must be a child of ${name}`);
      }
      for (const name of SPEC.markers) {
        const o = shipped.scene.getObjectByName(name);
        assert.equal(meshesOf(o).length, 0, `${name} is a marker and holds no geometry`);
      }
    });

    test("every rig material is found by name; Manor slots are flat apart from the lettering atlas", () => {
      const mats = new Map(meshesOf(shipped.scene).map((m) => [m.material.name, m.material]));
      for (const m of def.materials) assert.ok(mats.has(m), `material ${m} missing`);
      if (lod !== "manor") {
        assert.equal(mats.get("cam_leather").normalMap?.userData.mimeType, "image/webp", "cam_leather keeps its WebP normal map");
        assert.equal(mats.get("cam_leather").map?.userData.mimeType, "image/webp", "cam_leather keeps its WebP colour map");
        for (const n of mats.keys()) assert.ok(n.startsWith("cam_"), `${n}: web materials are cam_*`);
      } else {
        assert.deepEqual([...mats.keys()].sort(), [...def.materials].sort(), "Manor slots");
        for (const [n, m] of mats) if (n !== "mat_lettering") assert.equal(m.map, null, `${n} is a flat slot`);
      }
    });

    test("every part sits where Blender put it (world bounds within 0.05 mm of the raw export)", () => {
      const names = new Set();
      raw.scene.traverse((o) => (o.name === "body" || o.name === "lugs" || o.name.endsWith("_mesh") ||
        SPEC.decals.includes(o.name)) && names.add(o.name));
      assert.ok(names.has("body") && names.has("lugs"), "body and lugs");
      for (const name of names) {
        const s = shipped.scene.getObjectByName(name), r = raw.scene.getObjectByName(name);
        assert.ok(s && r, `${name} missing`);
        const a = new Box3().setFromObject(s, true), b = new Box3().setFromObject(r, true);
        close(a.min.toArray(), b.min.toArray(), PLACE, `${name} min`);
        close(a.max.toArray(), b.max.toArray(), PLACE, `${name} max`);
      }
    });

    // A part spins (or is pressed) about its pivot's axis only if the axis is the axis of its turned body: some ring
    // of at least 8 of the part's vertices lies on one circle round the axis (radii within 4 micrometres) with no
    // angular gap over 45 degrees (lib/ring.mjs). Tabs, fins and engravings never form such a ring; an off-axis pivot
    // spreads every ring over twice its offset (the negative control moves dial_shutter's part 0.3 mm and fails).
    // Tilt verbs hinge on an edge and are not checked here.
    test("spin and press axes are the axes of their turned part (a full ring of vertices round the axis)", () => {
      for (const name of def.pivots) {
        const verb = SPEC.pivots[name];
        if (verb.verb !== "spin" && verb.verb !== "press") continue;
        const gap = bestRingGapDeg(shipped.scene.getObjectByName(name), verb.axis);
        assert.ok(gap <= RING.maxGapDeg + 1e-6, `${name}: no full ring of vertices round its ${verb.verb} axis (best gap ${gap.toFixed(1)} deg)`);
      }
    });
  });
}

test("verbs keep W-D019's names and values (W-S1 and W-C14 read them from rig.json)", () => {
  assert.equal(rig.spec.pivots.dial_look.detents, 5);
  assert.equal(rig.spec.pivots.dial_look.stepDeg, 30);
  assert.equal(rig.spec.pivots.shutter_button.travelM, 0.0012);
  assert.deepEqual(rig.spec.markers, ["print_exit", "lens_mount", "strap_left", "strap_right"]);
  assert.deepEqual([...rig.spec.materials].sort(), ["cam_amber", "cam_black_metal", "cam_glass", "cam_leather",
    "cam_lettering", "cam_paint", "cam_rubber", "cam_silver"]);
  for (const name of ["dial_ev", "dial_look", "dial_shutter", "lens", "lens_aperture_ring", "lens_focus_ring", "shutter_button"]) {
    assert.ok(rig.spec.pivots[name], `m1 pivot ${name}`);
  }
  assert.deepEqual(rig.spec.decals, ["mark_fujifilm", "mark_xt5", "strap_tag"]);
});

test("the shutter and EV dials carry the X-T5's real stops (no provisional detents left from m1)", () => {
  const sh = rig.spec.pivots.dial_shutter, ev = rig.spec.pivots.dial_ev;
  assert.equal(sh.stops.length, sh.detents);
  assert.deepEqual(sh.stops.map((s) => s.label).slice(0, 3), ["A", "B", "T"]);
  assert.ok(sh.stops.some((s) => s.label === "8000"));
  assert.deepEqual(ev.stops.map((s) => s.label), ["0", "+1", "+2", "+3", "C", "-3", "-2", "-1"]);
  for (const s of [...sh.stops, ...ev.stops]) assert.ok(s.deg >= 0 && s.deg < 360);
});
