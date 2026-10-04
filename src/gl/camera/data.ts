// The camera's numbers from its two contracts, cut down at build time to the fields the hero camera reads: each band's
// framing from posters.json (W-C13's stage.js computeFraming), and the exit slot and the two pivots it moves from
// rig.json. Hero.astro calls cameraData() while the page is built and writes the result into the page as JSON
// (data-hero-camera-data); the camera chunk reads it there (readCameraData), so neither contract ships in the GL
// JavaScript (budgets.md: the GL chunk, review round 2 must-fix 3). Swapping in W-C14's model changes neither file's
// shape, so this stays as it is.
export type Band = 'split' | 'stacked' | 'phone';
export interface Framing {
  fovDeg: number;
  aspect: number;
  position: number[];
  quaternion: number[];
  near: number;
  far: number;
}
export interface CameraData {
  bands: Record<Band, Framing>;
  /** print_exit's translation (a root node, so its position): known before the model loads. */
  exit: [number, number, number];
  /** The shutter button's travel in metres and the Look dial's detent step in degrees (rig.json spec.pivots). */
  shutterTravelM: number;
  lookStepDeg: number;
}

interface PostersJson {
  bands: Record<Band, Framing>;
}
interface RigJson {
  spec: { pivots: Record<string, { stepDeg?: number; travelM?: number }> };
  lods: { lod0: { nodes: Record<string, { translation: [number, number, number] }> } };
}

/** Build time: the subset of posters.json and rig.json the camera reads. Throws when a contract lacks a field. */
export function cameraData(posters: unknown, rig: unknown): CameraData {
  const p = posters as PostersJson;
  const r = rig as RigJson;
  const pick = (f: Framing): Framing => ({ fovDeg: f.fovDeg, aspect: f.aspect, position: f.position, quaternion: f.quaternion, near: f.near, far: f.far });
  const bands = { split: pick(p.bands.split), stacked: pick(p.bands.stacked), phone: pick(p.bands.phone) };
  const exit = r.lods.lod0.nodes.print_exit?.translation;
  const travel = r.spec.pivots.shutter_button?.travelM;
  const step = r.spec.pivots.dial_look?.stepDeg;
  if (!exit || travel === undefined || step === undefined) throw new Error('camera data: rig.json lacks print_exit, shutter_button.travelM or dial_look.stepDeg');
  return { bands, exit, shutterTravelM: travel, lookStepDeg: step };
}

/** Run time: the data Hero.astro wrote into the hero. */
export function readCameraData(hero: HTMLElement): CameraData {
  const el = hero.querySelector('script[data-hero-camera-data]') ?? document.querySelector('script[data-hero-camera-data]');
  return JSON.parse(el?.textContent || 'null') as CameraData;
}
