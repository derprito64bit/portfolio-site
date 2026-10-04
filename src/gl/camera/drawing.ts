// The camera develop patch, hook half (D-024, #13 A1 and A2; fx-playbook section 4). Owner: W-S1 (v1); passes to
// W-C14 (#19), who carries it onto later models. The GLSL is src/gl/effects/develop/camera.ts (W-S1, then W-C2).
//
// On the full tier's first visit the hero opens on the X-T5 line drawing (a DOM poster over an undeveloped ground).
// From T0 the GL camera develops out of it, in the order A1 fixes:
//   1. clay (heroDrawingClay): the untextured body in the ground's tone fills the lines;
//   2. the silver top plate and dials first,
//   3. then black metal and leatherette,
//   4. the amber accents and the shutter button last; the ground (the veil) clears and the lines fade with it
//      (heroDrawingDevelop, on the W-D011 develop curve).
// The patch hooks every cam_* material through onBeforeCompile with one program cache key, so materials of one type
// share a program; the shutter button's materials are cloned so it can develop last. The uniform names are frozen
// (camera.ts). At uCamDev = 1 the patch is identity, and finish() leaves it there for good.
import { CustomBlending, Mesh, OneFactor, OneMinusSrcAlphaFactor, PlaneGeometry, ShaderMaterial, Vector3 } from 'three';
import type * as Develop from '../effects/develop/index.ts';
import { durations } from '../../lib/tokens.js';

/** The phase timing, from the tokens (no literal durations, A2). */
export const drawingTiming = {
  clay: durations.heroDrawingClay,
  develop: durations.heroDrawingDevelop,
  fade: durations.heroDrawingFade,
  get total(): number {
    return durations.heroDrawingClay + durations.heroDrawingDevelop;
  },
};

/** Material groups: 0 silver (first), 1 black metal and leatherette, 2 amber and the shutter (last). */
const SILVER = /^cam_(silver|chrome|lens_silver|lens_ridge|shoe|satin_mid|satin_collar|gunmetal|bayonet$|pin|contact)/;
const AMBER = /^cam_(amber|accent|lamp|gold)/;
export function groupOf(material: string): 0 | 1 | 2 {
  if (AMBER.test(material)) return 2;
  if (SILVER.test(material)) return 0;
  return 1;
}

/** The develop windows in camera.ts (start, span, plus up to 0.18 of light-first and noise delay), as develop
 *  values: when each group's front starts and when its last pixel is developed. */
const WINDOWS: Record<string, [number, number]> = {
  silver: [0, 0.63],
  black: [0.2, 0.83],
  amber: [0.55, 1],
  lines: [0.08, 0.84],
};

/** ms after the develop's start at which the develop value reaches d (the inverse of d = 1 - (1 - t)^2.4). */
function msAt(d: number): number {
  return drawingTiming.develop * (1 - Math.pow(1 - Math.min(1, Math.max(0, d)), 1 / 2.4));
}

/** The phases for __motionLog (W-D030 schema; no spring), starting at stage time t0. */
export function drawingPhases(t0: number, trigger: string) {
  const c = drawingTiming.clay;
  const rows = [{ id: 'hero:drawing:clay', from: 0, to: 1, t0, t1: t0 + c }];
  for (const [name, [a, b]] of Object.entries(WINDOWS)) {
    rows.push({ id: `hero:drawing:${name === 'lines' ? 'lines-fade' : name}`, from: 0, to: 1, t0: t0 + c + msAt(a), t1: t0 + c + msAt(b) });
  }
  return rows.map((r) => ({ ...r, t0: Math.round(r.t0), t1: Math.round(r.t1), kind: 'drawing', spring: null, trigger, peak: r.to, settle2Ms: null }));
}

/** Display-space rgb (0..1) of a CSS hex colour (#rrggbb). */
export function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.trim().replace('#', ''), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class CameraDrawing {
  /** Shared by every patched material and the ground. Frozen names (camera.ts). */
  readonly uniforms = {
    uCamClay: { value: 0 },
    uCamDev: { value: 0 },
    uCamFade: { value: 0 },
    uCamGround: { value: new Vector3() },
  };
  readonly ground: any;
  /** Materials hooked, and whether every patch found its anchor (false: the drawing is skipped, A1 fallback). */
  hooked = 0;
  failed = false;
  private finished = false;
  private readonly dev: typeof Develop;

  constructor(dev: typeof Develop, ground: [number, number, number]) {
    this.dev = dev;
    this.uniforms.uCamGround.value.set(...ground);
    this.ground = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        uniforms: { uCamDev: this.uniforms.uCamDev, uCamFade: this.uniforms.uCamFade, uCamGround: this.uniforms.uCamGround },
        vertexShader: dev.GROUND_VERT,
        fragmentShader: dev.GROUND_FRAG,
        // In the opaque list (drawn first by renderOrder, under the body), yet blended: premultiplied 'over' by hand,
        // since three only blends its NormalBlending for transparent materials, which it draws after every opaque one.
        transparent: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        blendSrcAlpha: OneFactor,
        blendDstAlpha: OneMinusSrcAlphaFactor,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.ground.frustumCulled = false;
    this.ground.renderOrder = -10;
  }

  /** Hook every material of the model (before its programs compile). */
  patch(model: any): void {
    const shutter = model.getObjectByName('shutter_button');
    const clones = new Map<any, any>();
    model.traverse((o: any) => {
      if (!o.isMesh) return;
      let inShutter = false;
      for (let p = o; p; p = p.parent) if (p === shutter) inShutter = true;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      const next = list.map((m: any) => {
        if (!inShutter) return this.hook(m, groupOf(m.name ?? ''));
        if (!clones.has(m)) clones.set(m, this.hook(m.clone(), 2));
        return clones.get(m);
      });
      o.material = Array.isArray(o.material) ? next : next[0];
    });
  }

  private hook(m: any, group: number): any {
    if (m.userData.ionCam !== undefined) return m;
    m.userData.ionCam = group;
    const shared = this.uniforms;
    m.onBeforeCompile = (shader: any) => {
      const src = this.dev.patchCameraFragment(shader.fragmentShader);
      if (!src) {
        this.failed = true;
        return;
      }
      Object.assign(shader.uniforms, shared, { uCamGroup: { value: group } });
      shader.fragmentShader = src;
    };
    m.customProgramCacheKey = () => 'ion-cam-develop-1';
    m.needsUpdate = true;
    this.hooked++;
    return m;
  }

  /** The develop at `rel` ms after T0 (seekable: a pure function of time). */
  at(rel: number): void {
    if (this.finished) return;
    const t = drawingTiming;
    this.uniforms.uCamClay.value = Math.min(1, Math.max(0, rel / t.clay));
    this.uniforms.uCamDev.value = this.dev.developCurve((rel - t.clay) / t.develop);
  }

  /** A guard's crossfade, f from 0 to 1 (the develop holds where it was). */
  crossfade(f: number): void {
    if (!this.finished) this.uniforms.uCamFade.value = Math.min(1, Math.max(0, f));
  }

  /** The finished camera: the patch is identity from here on, and the ground is gone. */
  finish(): void {
    this.finished = true;
    this.uniforms.uCamClay.value = 1;
    this.uniforms.uCamDev.value = 1;
    this.uniforms.uCamFade.value = 1;
    this.ground.visible = false;
  }

  get done(): boolean {
    return this.finished;
  }

  /** The develop value now (0 before T0, 1 when finished). */
  get value(): number {
    return this.uniforms.uCamDev.value;
  }

  dispose(): void {
    this.ground.geometry.dispose();
    this.ground.material.dispose();
  }
}
