// Where the open project's frame lands (moved out of main.ts, W-V1): the subject of a scene, scene and frame-fraction
// coordinates, and the zoom centre that puts the subject at the open view's focus point (desktop: right of the column,
// phone: above the text). main.ts (the AF box, the zoom in) and project/cold.ts (the frame behind a cold page) share it.
import type { Rect } from '../gl/engine';
import type { Scene } from '../scenes';

export type Pt = { x: number; y: number };
export type Pt3 = { x: number; y: number; z: number };

export const isPhoneW = (w: number) => w < 760;
export const apertureOf = (f: number) => 1.4 / Math.pow(f, 0.8);
export const noiseOf = (iso: number) => 0.012 + Math.log2(iso / 160) * 0.0055;

export function halfOf(r: Rect) { const a = r.w / Math.max(1, r.h); return a >= 1 ? { x: a, y: 1 } : { x: 1, y: 1 / a }; }

/** The frame's subject: the largest solid shape on the focus plane. */
export function subjectOf(s: Scene): Pt3 {
  let best: Pt3 | null = null, area = 0;
  for (let i = 0; i < s.ns; i++) {
    const o = i * 20, z = s.shapes[o + 6];
    const a = s.shapes[o + 2] * s.shapes[o + 3];
    if (Math.abs(z - s.focus) < 0.035 && s.shapes[o + 11] >= 0.9 && s.shapes[o + 19] === 0 && s.shapes[o + 7] !== 3 && a > area) {
      area = a; best = { x: s.shapes[o], y: s.shapes[o + 1], z };
    }
  }
  return best ?? { x: s.glass[0], y: s.glass[1], z: s.focus };
}
export function sceneToFrac(q: Pt, r: Rect): Pt {
  const h = halfOf(r);
  return { x: Math.max(0.08, Math.min(0.92, (q.x / h.x + 1) / 2)), y: Math.max(0.1, Math.min(0.9, (1 - q.y / h.y) / 2)) };
}
export function fracToScene(f: Pt, r: Rect): Pt {
  const h = halfOf(r);
  return { x: (f.x * 2 - 1) * h.x, y: (1 - f.y * 2) * h.y };
}

/** The full-screen rect of the open view. */
export const openRect = (): Rect => ({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });

/** The zoom centre that lands the subject `sub` on the open view's focus point at `zoom`. */
export function zoomCentre(sub: Pt, zoom: number): Pt {
  const target = isPhoneW(window.innerWidth) ? { x: 0.5, y: 0.27 } : { x: 0.68, y: 0.5 };
  const T = fracToScene(target, openRect());
  // the subject S lands on T at the final zoom: T = zc + (S - zc) * zoom
  return { x: (T.x - sub.x * zoom) / (1 - zoom), y: (T.y - sub.y * zoom) / (1 - zoom) };
}

/** The zoom of the landed open view for a frame rect `from` (the 23 to 56 mm travel; a phone zooms less). */
export const openZoom = (from: Rect) => (isPhoneW(window.innerWidth) ? 1.45 : Math.max(1.3, (56 / 23) / (window.innerWidth / Math.max(1, from.w))));

/** The landed open view's frame state (the end of the zoom), for a scene and its subject. */
export function landedState(s: Scene, sub: Pt3, zoom: number) {
  const zc = zoomCentre(sub, zoom);
  const phone = isPhoneW(window.innerWidth);
  return {
    rect: openRect(), zoom, zcx: zc.x, zcy: zc.y, dolly: 0.08, focus: sub.z, aperture: apertureOf(s.fnum) * 1.6,
    radius: 0, rim: 0, vig: 0.38, nd: phone ? 0.9 : 1, ndv: phone ? 1 : 0, noise: noiseOf(s.iso), alpha: 1, mix: 1,
    peak: 0, parx: 0, pary: 0, roll: 0, tilt: 0, ca: 0, smear: 0, zebra: 0, poolAmt: 0, eyeOn: false,
  };
}
