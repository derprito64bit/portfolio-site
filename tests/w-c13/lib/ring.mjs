// Does a part turn about its pivot's axis? A turned part (dial, ring, button, gear) has rings of vertices at one
// radius round that axis. This finds the best such ring among a part's vertices, in the pivot's own frame.
import { Vector3 } from "three";
import { meshesOf } from "./load-glb.mjs";

export const RING = { windowM: 4e-6, minAngles: 8, maxGapDeg: 45 };

/**
 * Smallest angular gap (degrees) of any ring of >= RING.minAngles distinct vertex angles whose radii from the axis
 * agree within RING.windowM (4 micrometres: 14-bit quantization of a dial is ~1.5). 360 when there is none.
 * A centred revolve of 8 or more steps gives 360 / steps; an off-axis pivot spreads every ring over twice the offset.
 */
export function bestRingGapDeg(pivot, axis) {
  pivot.updateMatrixWorld(true);
  const toPivot = pivot.matrixWorld.clone().invert();
  const a = new Vector3(...axis).normalize();
  const u = Math.abs(a.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const w = new Vector3().crossVectors(a, u).normalize();
  u.crossVectors(w, a).normalize();
  const pts = [];
  for (const m of meshesOf(pivot.getObjectByName(`${pivot.name}_mesh`))) {
    const pos = m.geometry.attributes.position, M = toPivot.clone().multiply(m.matrixWorld), v = new Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(M);
      const r = v.clone().sub(a.clone().multiplyScalar(v.dot(a)));
      if (r.length() > 1e-4) pts.push([r.length(), Math.atan2(r.dot(w), r.dot(u))]);
    }
  }
  pts.sort((p, q) => p[0] - q[0]);
  let best = 2 * Math.PI;
  for (let i = 0, j = 0; i < pts.length; i++) {
    while (pts[j][0] < pts[i][0] - RING.windowM) j++;
    if (i - j + 1 < RING.minAngles) continue;
    const t = [...new Set(pts.slice(j, i + 1).map(([, x]) => +x.toFixed(3)))].sort((p, q) => p - q);
    if (t.length < RING.minAngles) continue;
    let gap = t[0] + 2 * Math.PI - t[t.length - 1];
    for (let k = 1; k < t.length; k++) gap = Math.max(gap, t[k] - t[k - 1]);
    best = Math.min(best, gap);
  }
  return (best * 180) / Math.PI;
}

export const isTurnedAbout = (pivot, axis) => bestRingGapDeg(pivot, axis) <= RING.maxGapDeg + 1e-6;
