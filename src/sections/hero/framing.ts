// Build-time projections of the camera's rig markers into each band's poster frame (W-S1). The posters and the live
// stage share posters.json's framing, so a marker's position in the poster is a constant per band: the flash centre
// (the lens), the drag hit areas (the Look dial and the lens ring) and the eject exit are placed in the DOM from these
// numbers, before GL exists and on the static tier. Runs in Astro's frontmatter (Node), with three's maths only.
import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';

export interface Framing {
  fovDeg: number;
  aspect: number;
  position: number[];
  quaternion: number[];
  near: number;
  far: number;
}

/** A marker in poster space: x and y as fractions of the poster's width and height (top-left origin). */
export interface Pt {
  x: number;
  y: number;
}

/** Project a model-space point (metres, the rig's axes) through a band's framing. */
export function project(f: Framing, p: [number, number, number]): Pt {
  const view = new Matrix4().compose(new Vector3().fromArray(f.position), new Quaternion().fromArray(f.quaternion), new Vector3(1, 1, 1)).invert();
  const v = new Vector3(...p).applyMatrix4(view);
  const tan = Math.tan(MathUtils.degToRad(f.fovDeg) / 2);
  const ndcY = v.y / (-v.z * tan);
  const ndcX = v.x / (-v.z * tan * f.aspect);
  return { x: Math.round(((ndcX + 1) / 2) * 1e4) / 1e4, y: Math.round(((1 - ndcY) / 2) * 1e4) / 1e4 };
}

/** Rig markers (rig.json, LOD0 node translations). The m2 model keeps the same names and pivots. */
export interface Rig {
  lens_mount: [number, number, number];
  dial_look: [number, number, number];
  print_exit: [number, number, number];
  shutter_button: [number, number, number];
}

/** Where the flash, the hit areas and the eject sit in one band's poster. */
export function bandMarks(f: Framing, rig: Rig) {
  // The lens front: the mount moved forward along +Z (the lens looks +Z) by the m1 barrel's length.
  const lensFront: [number, number, number] = [rig.lens_mount[0], rig.lens_mount[1], rig.lens_mount[2] + 0.042];
  return {
    lens: project(f, lensFront),
    look: project(f, rig.dial_look),
    exit: project(f, rig.print_exit),
    shutter: project(f, rig.shutter_button),
  };
}
