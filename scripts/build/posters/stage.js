// stage.js (W-C13): the camera stage's framing contract, shared by the poster renderer and the live stage.
// Browser ES module; imports only three (bare specifiers, so Vite and an import map both resolve it).
//
// One pose per band (tokens.stage.poses) fixes the camera's orientation; its vertical FOV is 28 degrees
// (tokens.stage.fovDeg). computeFraming() then only pans and dollies the camera (never turns it) until the model
// sits centred in the frame with an even margin, and sets the frame's aspect to the model's. With that aspect fixed
// per band:
//   - the poster is that frame rendered at any size, and
//   - the live stage renders the same camera into the slot's contain-fit rectangle of that aspect (containRect).
// The picture is then the same at every slot size: it only scales, like <img style="object-fit: contain">.
// The pose never depends on the viewport or the scroll (W-D013).
import { Box3, MathUtils, Matrix4, Quaternion, Sphere, Vector3 } from "three";

/** Viewpoint direction for a pose: yaw turns toward +X (the camera's own left), pitch looks down from above. */
export function viewDirection(pose) {
  const yaw = MathUtils.degToRad(pose.yawDeg), pitch = MathUtils.degToRad(pose.pitchDeg);
  return new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
}

/**
 * Computes one band's framing from a loaded model (use LOD0: every LOD shares its silhouette and pivots).
 * margin: the empty band around the model on every side, as a fraction of the frame height.
 * Returns plain JSON: the entry posters.json stores and applyFraming() reads.
 */
export function computeFraming(root, pose, { fovDeg = 28, margin = 0.06 } = {}) {
  root.updateMatrixWorld(true);
  const box = new Box3().setFromObject(root, true);
  const center = box.getCenter(new Vector3());
  const radius = box.getBoundingSphere(new Sphere()).radius;
  const tanHalf = Math.tan(MathUtils.degToRad(fovDeg) / 2);
  const dir = viewDirection(pose);
  const rot = new Matrix4().lookAt(dir, new Vector3(), new Vector3(0, 1, 0)); // camera looks down -dir, +Y up
  const quaternion = new Quaternion().setFromRotationMatrix(rot);
  const toCam = new Matrix4().extractRotation(rot).transpose();
  const pts = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pts.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  });
  // Camera-space offset (pan x, pan y, dolly z) from the model centre; refine until the projection is centred and
  // its height fills the frame minus the margin. Converges in a few steps; 24 leaves it exact to float precision.
  const off = new Vector3(0, 0, radius / Math.sin(Math.atan(tanHalf)));
  const local = pts.map((p) => p.clone().sub(center).applyMatrix4(toCam));
  let bounds;
  for (let k = 0; k < 24; k++) {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of local) {
      const z = off.z - p.z, u = (p.x - off.x) / z, v = (p.y - off.y) / z;
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    bounds = { u0, u1, v0, v1 };
    off.x += ((u0 + u1) / 2) * off.z;
    off.y += ((v0 + v1) / 2) * off.z;
    off.z *= (v1 - v0) / 2 / (tanHalf * (1 - 2 * margin));
  }
  const pad = tanHalf * 2 * margin;
  const aspect = ((bounds.u1 - bounds.u0) / 2 + pad) / tanHalf;
  const position = center.clone().add(off.clone().applyMatrix4(new Matrix4().extractRotation(rot)));
  const r = (n) => +n.toFixed(7);
  return {
    pose: { yawDeg: pose.yawDeg, pitchDeg: pose.pitchDeg },
    fovDeg,
    aspect: r(aspect),
    position: position.toArray().map(r),
    quaternion: quaternion.toArray().map(r),
    near: r(off.z - radius * 1.5), far: r(off.z + radius * 1.5),
  };
}

/** Sets a PerspectiveCamera to a framing entry from posters.json. Call again only when the entry changes. */
export function applyFraming(camera, f) {
  camera.fov = f.fovDeg;
  camera.aspect = f.aspect;
  camera.near = Math.max(f.near, 1e-4);
  camera.far = f.far;
  camera.position.fromArray(f.position);
  camera.quaternion.fromArray(f.quaternion);
  camera.clearViewOffset();
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

/**
 * The contain-fit rectangle of a framing's aspect inside a slot, in whole device pixels (WebGL viewports are
 * integers). x and y are measured from the slot's top-left. Use it for setViewport and setScissor (flip y for GL).
 */
export function containRect(slotW, slotH, aspect) {
  let w = slotW, h = slotW / aspect;
  if (h > slotH) { h = slotH; w = slotH * aspect; }
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  return { x: Math.round((slotW - w) / 2), y: Math.round((slotH - h) / 2), width: w, height: h };
}

/**
 * The LOD rule: tokens.stage.lod (LOD0 at 600 device px of projected width and wider) under D-021, which keeps the
 * ultra-detailed LOD0 (100k tris, 800 kB gz) to the full tier: the lite tier always draws LOD1, and the static
 * tier draws nothing (its posters are the LOD0 set, posterSet()).
 */
export function pickLod(deviceWidth, tier) {
  return tier === "full" && deviceWidth >= 600 ? 0 : 1;
}

/**
 * Which poster set a slot shows before GL, so the poster is the frame GL will draw: the set of the LOD that
 * pickLod() gives for the contain rectangle at the canvas's effective DPR. The static tier has no GL frame to
 * match and always shows the sharpest set, LOD0.
 *   entry: posters.json bands[band]; glDpr: the stage canvas's effective DPR (tier cap and pixel cap applied).
 */
export function posterSet(entry, { slotW, slotH, glDpr, tier }) {
  if (tier === "static") return { lod: 0, files: entry.posters.lod0 };
  const lod = pickLod(containRect(Math.round(slotW * glDpr), Math.round(slotH * glDpr), entry.aspect).width, tier);
  return { lod, files: entry.posters[`lod${lod}`] };
}

/**
 * The poster of a set to show: the file whose width is nearest, by ratio, to the GL frame's device width (the
 * contain width in CSS px times the canvas's effective DPR), so the poster carries the detail GL will draw, no more
 * and no less (W-S1's hero picks the same way). A phone's lite canvas renders at DPR 1.5, so its poster is not the
 * 3x one a srcset would pick.
 */
export function posterFile(files, containCssW, glDpr) {
  const need = containCssW * glDpr;
  return files.reduce((best, f) => (Math.abs(Math.log(f.w / need)) < Math.abs(Math.log(best.w / need)) ? f : best));
}
