// W-C13 m2 acceptance (issue #16): "Bounding box without the lens matches 129.5 x 91.0 x 63.8 mm within 1%. Front,
// top and side orthographic silhouettes reach IoU >= 0.95 against masks committed in tests/w-c13/ref-masks/".
// GPU-free (CI): the shipped GLBs load in three r186 and their triangles are rasterised orthographically in refs mm.
//
// What each gate leaves out, and why:
//   bounding box  the lens (the brief), the strap lugs (the official 129.5 mm width is measured without them,
//                 references.json spec.dimensions_mm.note), and the accessories outside the camera's own shape:
//                 the strap and the hot-shoe cover
//   silhouettes   the lens, the strap and the hot-shoe cover: the reference renders are the bare body with the bare
//                 shoe; the lugs are in them, so the lugs stay in
// Set W_C13_EVIDENCE=<dir> to also write fidelity.json and the overlay PNGs (grey both, cyan model only, red
// reference only) there.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { LODS } from "../../scripts/build/glb/rig.mjs";
import { loadGlb } from "./lib/load-glb.mjs";
import { boxMm, iou, overlayPng, readMask, silhouette, trianglesMm, under } from "./lib/silhouette.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MASKS = join(repo, "tests/w-c13/ref-masks");
const meta = JSON.parse(readFileSync(join(MASKS, "masks.json"), "utf8"));
const refs = JSON.parse(readFileSync(join(repo, "assets-src/3d/camera_xt/data/references.json"), "utf8"));
const DIMS = refs.spec.dimensions_mm;                   // 129.5 x 91.0 x 63.8 (W x H x D)
const OUT_BBOX = ["lens", "lugs", "strap", "hot_shoe_cover"];
const OUT_SIL = ["lens", "strap", "hot_shoe_cover"];
const VIEWS = ["front", "top", "left", "right"];
const GATED = ["lod0", "lod1", "manor"];                // every LOD, the Manor one included
const evidence = process.env.W_C13_EVIDENCE;
const report = {};

test("the official dimensions are the brief's 129.5 x 91.0 x 63.8 mm", () => {
  assert.deepEqual([DIMS.width, DIMS.height, DIMS.depth], [129.5, 91.0, 63.8]);
});

for (const [lod, def] of Object.entries(LODS)) {
  describe(`${lod} (public/models/${def.file})`, () => {
    let scene;
    before(async () => {
      scene = (await loadGlb(join(repo, "public/models", def.file))).scene;
      report[lod] = { file: def.file, iou: {} };
    });

    test("bounding box without the lens is 129.5 x 91.0 x 63.8 mm within 1%", () => {
      const b = boxMm(scene, (o) => !under(o, OUT_BBOX));
      const want = [DIMS.width, DIMS.height, DIMS.depth];
      const err = b.size.map((s, i) => (s - want[i]) / want[i]);
      report[lod].bbox = { sizeMm: b.size.map((x) => +x.toFixed(2)), minMm: b.min.map((x) => +x.toFixed(2)),
        maxMm: b.max.map((x) => +x.toFixed(2)), errorPct: err.map((e) => +(100 * e).toFixed(2)) };
      err.forEach((e, i) => assert.ok(Math.abs(e) <= 0.01, `${"WHD"[i]} ${b.size[i].toFixed(2)} mm vs ${want[i]} (${(100 * e).toFixed(2)}%)`));
    });

    for (const view of VIEWS) {
      test(`${view} silhouette IoU against tests/w-c13/ref-masks/mask_${view}.png${GATED.includes(lod) ? " >= 0.95" : " (reported)"}`, async () => {
        const v = { ...meta.views[view], ppm: meta.ppm };
        const tris = trianglesMm(scene, (o) => !under(o, OUT_SIL));
        const model = silhouette(tris, v);
        const ref = await readMask(MASKS, view);
        assert.deepEqual([model.W, model.H], [ref.W, ref.H], "frame size");
        const r = iou(model.mask, ref.mask);
        report[lod].iou[view] = { iou: +r.iou.toFixed(4), modelOnlyPx: r.modelOnly, refOnlyPx: r.refOnly };
        if (evidence) {
          mkdirSync(join(evidence, "overlays"), { recursive: true });
          await overlayPng(model.mask, ref.mask, model.W, model.H, join(evidence, "overlays", `${lod}-${view}.png`));
        }
        if (GATED.includes(lod)) assert.ok(r.iou >= 0.95, `${view} IoU ${r.iou.toFixed(4)} < 0.95`);
      });
    }
  });
}

after(() => {
  if (!evidence) return;
  mkdirSync(evidence, { recursive: true });
  writeFileSync(join(evidence, "fidelity.json"), JSON.stringify({
    dims: DIMS, ppm: meta.ppm, bboxExcludes: OUT_BBOX, silhouetteExcludes: OUT_SIL, gated: GATED, limitIoU: 0.95,
    limitBboxPct: 1, lods: report,
  }, null, 1) + "\n");
});
