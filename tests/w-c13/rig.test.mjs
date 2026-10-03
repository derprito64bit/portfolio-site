// W-C13 m1 acceptance: every W-D019 pivot, marker and material is found in three r186, with the original transforms.
// GPU-free (CI). Run: node --test tests/w-c13/
//
// "Original transforms" are checked twice: against assets-src/3d/camera_xt/rig.json (written from the raw Blender
// exports by scripts/build/glb/rig.mjs) and against the raw exports themselves, loaded in the same three r186.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Box3, REVISION, Vector3 } from "three";
import { buildRig, LODS, SPEC } from "../../scripts/build/glb/rig.mjs";
import { loadGlb, meshesOf } from "./lib/load-glb.mjs";

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

    test("every pivot and marker is found, with its original transform and parent", () => {
      const names = [...def.pivots, ...SPEC.markers];
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
        assert.ok(o.getObjectByName(`${name}_mesh`), `${name}_mesh must be a child of ${name}`);
      }
      for (const name of SPEC.markers) {
        const o = shipped.scene.getObjectByName(name);
        assert.equal(meshesOf(o).length, 0, `${name} is a marker and holds no geometry`);
      }
    });

    test("every material is found by name", () => {
      const names = new Set(meshesOf(shipped.scene).map((m) => m.material.name));
      for (const m of def.materials) assert.ok(names.has(m), `material ${m} missing`);
      assert.equal(names.size, def.materials.length, `unexpected materials: ${[...names]}`);
      if (lod !== "manor") {
        const leather = meshesOf(shipped.scene).find((m) => m.material.name === "cam_leather").material;
        assert.equal(leather.normalMap?.userData.mimeType, "image/webp", "cam_leather keeps its WebP normal map");
        const glass = meshesOf(shipped.scene).find((m) => m.material.name === "cam_glass").material;
        assert.ok(glass.isMeshPhysicalMaterial && glass.clearcoat > 0, "cam_glass keeps KHR_materials_clearcoat");
      } else {
        for (const m of meshesOf(shipped.scene)) assert.equal(m.material.map, null, "Manor slots are flat (no textures)");
      }
    });

    test("every part sits where Blender put it (world bounds within 0.05 mm of the raw export)", () => {
      const rawParts = [];
      raw.scene.traverse((o) => (o.name === "body" || o.name.endsWith("_mesh")) && rawParts.push(o));
      assert.equal(rawParts.length, def.pivots.length + 1, "the body plus one part per pivot");
      for (const r of rawParts) {
        const s = shipped.scene.getObjectByName(r.name);
        assert.ok(s, `${r.name} missing`);
        const a = new Box3().setFromObject(s, true), b = new Box3().setFromObject(r, true);
        close(a.min.toArray(), b.min.toArray(), PLACE, `${r.name} min`);
        close(a.max.toArray(), b.max.toArray(), PLACE, `${r.name} max`);
      }
    });

    // The first primitive of each part is its turned body (knurled dial ring, button cap, lens ring); engravings,
    // ticks and the look-dial notch come after it and are deliberately off-axis, so they are left out.
    test("spin and press axes pass through their part (within 0.1 mm)", () => {
      for (const name of def.pivots) {
        const verb = SPEC.pivots[name];
        if (!verb.axis) continue;
        const pivot = shipped.scene.getObjectByName(name);
        const turned = meshesOf(pivot.getObjectByName(`${name}_mesh`))[0];
        turned.geometry.computeBoundingBox();
        const box = turned.geometry.boundingBox.clone()
          .applyMatrix4(pivot.matrixWorld.clone().invert().multiply(turned.matrixWorld));
        const c = box.getCenter(new Vector3());
        const off = c.clone().sub(new Vector3(...verb.axis).multiplyScalar(c.dot(new Vector3(...verb.axis))));
        assert.ok(off.length() <= 1e-4, `${name}: part centre is ${(off.length() * 1000).toFixed(3)} mm off its axis`);
      }
    });
  });
}

test("verbs match W-D019: dial_look has 5 detents, the shutter travels 1.2 mm", () => {
  assert.equal(rig.spec.pivots.dial_look.detents, 5);
  assert.equal(rig.spec.pivots.shutter_button.travelM, 0.0012);
  assert.deepEqual(rig.spec.markers, ["print_exit", "lens_mount", "strap_left", "strap_right"]);
  assert.deepEqual([...rig.spec.materials].sort(), ["cam_amber", "cam_black_metal", "cam_glass", "cam_leather",
    "cam_lettering", "cam_paint", "cam_rubber", "cam_silver"]);
  assert.deepEqual(Object.keys(rig.spec.pivots).sort(), ["dial_ev", "dial_look", "dial_shutter", "lens",
    "lens_aperture_ring", "lens_focus_ring", "shutter_button"]);
});
