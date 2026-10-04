// Orthographic silhouettes and bounding boxes of a loaded camera (three r186 scene), GPU-free, for the m2 fidelity
// gates: every triangle of the selected meshes is projected onto the view plane in refs millimetres and filled at
// pixel centres, then enclosed holes are filled (as the reference masks are, tests/w-c13/ref-masks/make_masks.py).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { Box3, Vector3 } from "three";

export const AXIS = { X: 0, Y: 1, Z: 2 };

/** True when o or one of its ancestors is named in `names`. */
export function under(o, names) {
  for (let p = o; p; p = p.parent) if (names.includes(p.name)) return true;
  return false;
}

/** World-space triangles (mm) of the meshes under root that pass keep(mesh). */
export function trianglesMm(root, keep) {
  root.updateMatrixWorld(true);
  const out = [];
  const v = new Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !keep(o)) return;
    const pos = o.geometry.attributes.position;
    const idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    const P = new Float64Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).multiplyScalar(1000);
      P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z;
    }
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
      out.push([P[a * 3], P[a * 3 + 1], P[a * 3 + 2], P[b * 3], P[b * 3 + 1], P[b * 3 + 2], P[c * 3], P[c * 3 + 1], P[c * 3 + 2]]);
    }
  });
  return out;
}

/** Bounding box (mm) of the meshes under root that pass keep(mesh): { min: [x, y, z], max: [x, y, z], size }. */
export function boxMm(root, keep) {
  root.updateMatrixWorld(true);
  const box = new Box3();
  root.traverse((o) => o.isMesh && keep(o) && box.expandByObject(o, true));
  const min = box.min.toArray().map((x) => x * 1000), max = box.max.toArray().map((x) => x * 1000);
  return { min, max, size: max.map((x, i) => x - min[i]) };
}

/** Binary silhouette (Uint8Array, row-major, row 0 = top of the frame) of triangles on a view frame. */
export function silhouette(tris, view) {
  const { h, v, hRange: [h0, h1], vRange: [v0, v1], ppm } = view;
  const W = Math.round((h1 - h0) * ppm), H = Math.round((v1 - v0) * ppm);
  const m = new Uint8Array(W * H);
  const ih = AXIS[h], iv = AXIS[v];
  for (const t of tris) {
    // pixel coordinates (column, row) of the three corners; pixel centres sit at +0.5
    const x = [0, 1, 2].map((k) => (t[k * 3 + ih] - h0) * ppm);
    const y = [0, 1, 2].map((k) => (v1 - t[k * 3 + iv]) * ppm);
    const area = (x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0]);
    if (Math.abs(area) < 1e-12) continue;
    const s = Math.sign(area);
    const c0 = Math.max(0, Math.floor(Math.min(...x))), c1 = Math.min(W - 1, Math.ceil(Math.max(...x)));
    const r0 = Math.max(0, Math.floor(Math.min(...y))), r1 = Math.min(H - 1, Math.ceil(Math.max(...y)));
    for (let r = r0; r <= r1; r++) {
      const py = r + 0.5;
      for (let c = c0; c <= c1; c++) {
        const px = c + 0.5;
        const e0 = s * ((x[1] - x[0]) * (py - y[0]) - (y[1] - y[0]) * (px - x[0]));
        const e1 = s * ((x[2] - x[1]) * (py - y[1]) - (y[2] - y[1]) * (px - x[1]));
        const e2 = s * ((x[0] - x[2]) * (py - y[2]) - (y[0] - y[2]) * (px - x[2]));
        if (e0 >= 0 && e1 >= 0 && e2 >= 0) m[r * W + c] = 1;
      }
    }
  }
  return { mask: fillHoles(m, W, H), W, H };
}

/** Fills enclosed holes: everything not 4-connected to the frame border through empty pixels becomes set. */
export function fillHoles(m, W, H) {
  const outside = new Uint8Array(W * H);
  const stack = [];
  const push = (i) => { if (!m[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let c = 0; c < W; c++) { push(c); push((H - 1) * W + c); }
  for (let r = 0; r < H; r++) { push(r * W); push(r * W + W - 1); }
  while (stack.length) {
    const i = stack.pop(), r = (i / W) | 0, c = i - r * W;
    if (c > 0) push(i - 1);
    if (c < W - 1) push(i + 1);
    if (r > 0) push(i - W);
    if (r < H - 1) push(i + W);
  }
  const out = new Uint8Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

export async function readMask(dir, view) {
  const { data, info } = await sharp(readFileSync(join(dir, `mask_${view}.png`))).greyscale().raw()
    .toBuffer({ resolveWithObject: true });
  const m = new Uint8Array(info.width * info.height);
  for (let i = 0; i < m.length; i++) m[i] = data[i * info.channels] > 127 ? 1 : 0;
  return { mask: m, W: info.width, H: info.height };
}

export function iou(a, b) {
  let inter = 0, uni = 0, aOnly = 0, bOnly = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) uni++;
    if (a[i] && !b[i]) aOnly++;
    if (!a[i] && b[i]) bOnly++;
  }
  return { iou: inter / uni, modelOnly: aOnly, refOnly: bOnly };
}

/** RGB overlay: both grey, model only cyan, reference only red (as the modeller's compare sheets). */
export async function overlayPng(model, ref, W, H, file) {
  const px = Buffer.alloc(W * H * 3, 255);
  for (let i = 0; i < W * H; i++) {
    const c = model[i] && ref[i] ? [150, 150, 150] : model[i] ? [0, 170, 220] : ref[i] ? [230, 40, 40] : null;
    if (c) { px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2]; }
  }
  await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
}
