// W-C13 m2 acceptance (issue #16, D-011, W-D006, W-D019): "mark_fujifilm, mark_xt5 and strap_tag are found on LOD0,
// LOD1 and the Manor LOD". The marks are decal quads that sample one alpha-tested lettering atlas (albedo + normal on
// the web LODs; mat_lettering on the Manor LOD); FUJIFILM sits on the hump's front face, X-T5 on the top plate's
// front face, and the [d64] tag on the grip-side strap anchor (never on the body, W-D006).
// GPU-free (CI). Run: node --test tests/w-c13/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Box3, Vector3 } from "three";
import { LODS, SPEC } from "../../scripts/build/glb/rig.mjs";
import { loadGlb, meshesOf } from "./lib/load-glb.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LOGOS = JSON.parse(readFileSync(join(repo, "assets-src/3d/camera_xt/data/logos.json"), "utf8"));
const LIFT = 0.05;                                   // mm above the face (build_camera.py)
const FACE = { mark_fujifilm: 15.25, mark_xt5: LOGOS["X-T5"].plane_z };   // refs Z of the hump / top plate front
const LOGO = { mark_fujifilm: "FUJIFILM", mark_xt5: "X-T5" };

function logoBox(name) {
  const pts = LOGOS[name].polys.flatMap(([ext, holes]) => [ext, ...holes]).flat();
  return { x: [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))],
    y: [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))] };
}

const mmBox = (o) => {
  const b = new Box3().setFromObject(o, true);
  return { min: b.min.toArray().map((x) => x * 1000), max: b.max.toArray().map((x) => x * 1000) };
};

for (const [lod, def] of Object.entries(LODS)) {
  describe(`${lod} (public/models/${def.file})`, () => {
    let scene;
    before(async () => {
      scene = (await loadGlb(join(repo, "public/models", def.file))).scene;
      scene.updateMatrixWorld(true);
    });

    test("mark_fujifilm, mark_xt5 and strap_tag are found, each an empty carrying its decal quad", () => {
      for (const name of SPEC.decals) {
        const o = scene.getObjectByName(name);
        assert.ok(o, `${name} missing`);
        assert.ok(!o.isMesh, `${name} is an empty`);
        const m = meshesOf(o);
        assert.equal(m.length, 1, `${name} holds one primitive`);
        assert.equal(m[0].geometry.index.count / 3, 2, `${name} is a 2-triangle quad`);
      }
      assert.equal(scene.getObjectByName("strap_tag").parent.name, "strap", "strap_tag rides on the strap");
    });

    test(`the decals use ${def.lettering}: the lettering atlas, alpha-tested (MASK, cutoff 0.5)`, () => {
      for (const name of SPEC.decals) {
        const mat = meshesOf(scene.getObjectByName(name))[0].material;
        assert.equal(mat.name, def.lettering);
        assert.equal(mat.map?.userData.mimeType, "image/webp", "atlas albedo is WebP");
        assert.equal(mat.alphaTest, 0.5, "alpha-tested");
        assert.equal(mat.transparent, false, "not blended");
        if (lod !== "manor") assert.equal(mat.normalMap?.userData.mimeType, "image/webp", "atlas normal is WebP");
      }
    });

    test("FUJIFILM sits on the hump front and X-T5 on the top plate front, over the traced marks, facing out", () => {
      for (const name of ["mark_fujifilm", "mark_xt5"]) {
        const o = scene.getObjectByName(name);
        const b = mmBox(o);
        const lb = logoBox(LOGO[name]);
        assert.ok(Math.abs(b.min[2] - (FACE[name] + LIFT)) < 0.02 && Math.abs(b.max[2] - (FACE[name] + LIFT)) < 0.02,
          `${name} at Z ${b.min[2].toFixed(3)}..${b.max[2].toFixed(3)}, face ${FACE[name]} + ${LIFT}`);
        assert.ok(b.min[0] <= lb.x[0] && b.max[0] >= lb.x[1] && b.min[1] <= lb.y[0] && b.max[1] >= lb.y[1],
          `${name} quad covers the traced ${LOGO[name]}`);
        assert.ok(b.max[0] - b.min[0] - (lb.x[1] - lb.x[0]) < 1.0, `${name} quad hugs the mark (margin < 0.5 mm a side)`);
        const mesh = meshesOf(o)[0];
        const n = new Vector3().fromBufferAttribute(mesh.geometry.attributes.normal, 0).transformDirection(mesh.matrixWorld);
        assert.ok(n.z > 0.99, `${name} faces +Z (front)`);
      }
    });

    test("the [d64] tag is on the grip-side anchor (outside the body, facing -X), never on the body", () => {
      const tag = scene.getObjectByName("strap_tag");
      const b = mmBox(tag);
      const body = mmBox(scene.getObjectByName("body"));
      assert.ok(b.max[0] < body.min[0], `strap_tag X ${b.max[0].toFixed(2)} is outside the body (${body.min[0].toFixed(2)})`);
      const mesh = meshesOf(tag)[0];
      const n = new Vector3().fromBufferAttribute(mesh.geometry.attributes.normal, 0).transformDirection(mesh.matrixWorld);
      assert.ok(n.x < -0.99, "strap_tag faces -X (the grip side the hero poses show)");
      const strapRight = scene.getObjectByName("strap_right").getWorldPosition(new Vector3()).multiplyScalar(1000);
      assert.ok(Math.abs((b.min[2] + b.max[2]) / 2 - strapRight.z) < 1.0 && b.max[1] < strapRight.y,
        "strap_tag hangs below the grip-side eyelet");
    });

    test("decal UVs stay inside the atlas", () => {
      for (const name of SPEC.decals) {
        const uv = meshesOf(scene.getObjectByName(name))[0].geometry.attributes.uv;
        for (let i = 0; i < uv.count; i++) {
          assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1, `${name} uv ${i}`);
        }
      }
    });
  });
}
