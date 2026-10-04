// The hero camera on GL (W-S1 v1, then W-C14). Loaded by the hero after GL starts booting (its own chunk).
// - The X-T5 (W-C13 m1 GLBs; m2 swaps in with the same rig names and pivots) in a stage-local view over its slot:
//   FOV 28 and one pose per band, from posters.json through stage.js applyFraming (W-D013, W-D019). The slot has the
//   framing's aspect, so the whole slot is the contain rectangle and the first GL frame is the poster (#31 worked
//   around). LOD by projected width on the full tier; LOD1 everywhere else (D-021).
// - The rig's verbs on ion-spring: the shutter presses (press), the Look dial and the focus ring step (detent).
// - Print 1 and every next print: posed in the camera's own 3D space (it leaves the real exit slot, hidden where the
//   body is in front of it), then drawn in the effects view, which renders after the camera view with the camera's
//   depth still in the buffer. It flies to its landing slot on the settle spring, dips on the detent spring, develops
//   (W-D016), and hands back to its DOM still.
// - The intro (W-D012) is a pure function of the stage clock from T0, so __stage.seek(ms) can film it.
// The stage is reached through the hooks the hero passes in (no import of src/stage: see sections/hero/bridge.ts).
import {
  Box3,
  CanvasTexture,
  HalfFloatType,
  LinearFilter,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NoColorSpace,
  OrthographicCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { applyFraming } from '../../../scripts/build/posters/stage.js';
import posters from '../../../public/posters/camera/posters.json';
import rig from '../../../assets-src/3d/camera_xt/rig.json';
import { applyLook } from './look.js';
import type * as Develop from '../effects/develop/index.ts';
import { Spring, overshootPct, params, stepExact, type SpringName } from '../../motion/spring/index.ts';
import { durations, heroTimeline } from '../../lib/tokens.js';
import type { Entity, FrameInfo, GLApi, StageView } from '../../stage/gl/index.ts';
import type { Slot } from '../../stage/slots.ts';

export interface QueueItem {
  slug: string;
  frame: string;
  look: string;
  name: string;
  still: string;
}
export interface IntroHooks {
  /** `at`: the stage time it fires at (the manual clock delays the DOM animation by it, so seeks show its phase). */
  closeBrackets(at?: number): void;
  flash(at?: number): boolean;
  handback(): void;
}
interface StageHooks {
  readonly view: { dpr: number; W: number; Hc: number };
  invalidate(): void;
}
export interface CameraOptions {
  hero: HTMLElement;
  lookIndex: number;
  lensIndex: number;
  stage(): unknown;
  onMark(name: string): void;
}
export interface CameraController {
  /** The camera is drawn by GL (the poster has handed over). */
  readonly live: boolean;
  setLens(index: number, trigger: string): void;
  setLook(index: number, trigger: string): void;
  press(trigger: string): void;
  printNext(item: QueueItem, addStill: () => HTMLImageElement | null): Promise<void>;
  intro(t0: number, hooks: IntroHooks): Promise<void>;
  finishIntro(): void;
  rebind(hero: HTMLElement): void;
}

type Band = 'split' | 'stacked' | 'phone';
type Framing = { fovDeg: number; aspect: number; position: number[]; quaternion: number[]; near: number; far: number };
const BANDS = posters.bands as unknown as Record<Band, Framing>;
const SPEC = (rig as unknown as { spec: { pivots: Record<string, { detents?: number; stepDeg?: number; travelM?: number }> } }).spec;
/** The exit slot from the rig contract (a root node, so its translation is its position): known before the model loads. */
const EXIT = (rig as unknown as { lods: { lod0: { nodes: { print_exit: { translation: [number, number, number] } } } } }).lods.lod0.nodes.print_exit.translation;
const PRINT_W = 0.054; // the instant print in metres (W-D006: 54 x 86 mm)
const PRINT_H = 0.086;
const RISE = 0.4 * PRINT_H; // how far the eject pushes the print out of the slot before the flight takes it
const PAD: [number, number] = [0.12, 0.09]; // shadow margin of the print quad, each side, as a share of the quad
const LAND_DEPTH = 0.1; // view-space depth of a landed print: in front of the body, beyond the near plane
const FOCUS_STEP_DEG = 24; // the focus ring turns this far per lens stop (W-C14 tunes the final verbs)
const html = document.documentElement;
const reduced = () => html.dataset.motion === 'reduced';
const tierNow = () => html.dataset.tier || 'static';
/** True on the manual clock (?t=): the intro is filmed by __stage.seek(ms), with T0 at stage time 0. */
const manualClock = new URLSearchParams(location.search).has('t');

// The develop shader is its own chunk (the effects budget, budgets.md, counts it alone), loaded with the model.
let develop: typeof Develop | null = null;
const developReady = import('../effects/develop/index.ts').then((m) => (develop = m));

// ---------------------------------------------------------------- loading
const cache = new Map<number, Promise<any>>();
let decoderReady: Promise<void> | null = null;
function loadModel(lod: 0 | 1): Promise<any> {
  if (!cache.has(lod)) {
    decoderReady ??= (async () => {
      await MeshoptDecoder.ready;
      // Decode in a worker, so no boot task blocks the main thread (W-D034).
      MeshoptDecoder.useWorkers?.(1);
    })();
    cache.set(
      lod,
      decoderReady.then(() => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`/models/camera_xt_lod${lod}.glb`)).then((g: any) => g.scene),
    );
  }
  return cache.get(lod) as Promise<any>;
}

/** The LOD rule (tokens.stage.lod, D-021): LOD0 when the slot is 600 device px or wider on the full tier, else LOD1. */
function lodFor(slotW: number, dpr: number, tier: string): 0 | 1 {
  return tier === 'full' && slotW * dpr >= 600 ? 0 : 1;
}
/** The full tier's effective DPR (tier.ts CAPS: DPR 2 and 4.5 Mpx over the riding canvas, 100lvh x 1.25). */
function estimateDpr(): number {
  const w = document.documentElement.clientWidth;
  const h = window.innerHeight * 1.25;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (w * h * dpr * dpr > 4.5e6) dpr = Math.sqrt(4.5e6 / (w * h));
  return dpr;
}
/** Start fetching the model the camera will draw while GL boots. */
export function prefetch(tier: string): void {
  void loadModel(posterLod() ?? lodFor(document.querySelector<HTMLElement>('[data-hero-camera]')?.offsetWidth ?? 0, estimateDpr(), tier)).catch(() => {});
}
/** The LOD of the poster on screen (heroPoster() applied the same rule): GL draws that LOD, so the hand-over matches. */
function posterLod(): 0 | 1 | null {
  const v = document.querySelector<HTMLElement>('.hero-poster')?.dataset.lod;
  return v === '0' ? 0 : v === '1' ? 1 : null;
}

function bandOf(hero: HTMLElement): Band {
  const b = hero.dataset.band;
  return b === 'split' || b === 'phone' ? b : 'stacked';
}

// ---------------------------------------------------------------- springs at known start times (seekable)
/** The value of a spring step from rest, `from` to `to`, `tau` seconds after it started. */
function springAt(name: SpringName, from: number, to: number, tau: number): number {
  if (tau <= 0) return from;
  return to + stepExact(from - to, 0, tau, params(name))[0];
}
const inOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

interface MotionRecord {
  id: string;
  kind: string;
  spring: string | null;
  trigger: string;
  t0: number;
  t1: number;
  from: number;
  to: number;
  peak: number;
  settle2Ms: number | null;
}
/** Append to window.__motionLog with the W-D030 schema. */
function logMotion(e: MotionRecord): void {
  const w = window as unknown as { __motionLog?: unknown[] };
  const log = (w.__motionLog ??= []);
  log.push({ ...e, tier: tierNow(), reduced: reduced() });
  if (log.length > 500) log.splice(0, log.length - 500);
}
/** A record for a spring step from rest, with its exact peak (the motion follows that analytic curve). */
function logAnalytic(id: string, kind: string, name: SpringName, trigger: string, t0: number, from: number, to: number): void {
  const p = params(name);
  logMotion({ id, kind, spring: name, trigger, t0: Math.round(t0), t1: Math.round(t0 + 600), from, to, peak: to + (to - from) * (overshootPct(p) / 100), settle2Ms: null });
}

/**
 * three r186's PMREM GGX convolution shader links with HLSL constant-folding notes on ANGLE's D3D11 backend
 * ("warning X4122: sum of 1 and -1.5e-017 cannot be represented accurately in double precision"); three echoes any
 * non-empty program log as console.warn. The note is benign (the program links and runs). While the environment is
 * built, exactly that message is passed on as console.info instead; any other warning, and every error, is untouched.
 * An allowlist entry is requested from W-F (tests/harness/console-allow.json) so this can go.
 */
async function quietX4122<T>(fn: () => Promise<T>): Promise<T> {
  const warn = console.warn;
  const benign = (args: unknown[]) => {
    const text = args.map((a) => String(a)).join('\n');
    if (!text.startsWith('THREE.WebGLProgram: Program Info Log:')) return false;
    const lines = text.replace('THREE.WebGLProgram: Program Info Log:', '').split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.length > 0 && lines.every((l) => /warning X4122\b/.test(l));
  };
  console.warn = (...args: unknown[]) => (benign(args) ? console.info('[hero] benign shader compiler note (X4122) from three PMREM') : warn(...args));
  try {
    return await fn();
  } finally {
    console.warn = warn;
  }
}

// ---------------------------------------------------------------- print textures (the DOM still's own pixels)
async function stillTexture(src: string, w: number, h: number): Promise<any> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(w));
  canvas.height = Math.max(2, Math.round(h));
  (canvas.getContext('2d') as CanvasRenderingContext2D).drawImage(img, 0, 0, canvas.width, canvas.height);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = NoColorSpace; // display-space maths: the still's sRGB bytes as they are (W-D016)
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

// ---------------------------------------------------------------- rects, exactly as W-F's render() places views
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
function viewRect(s: Slot | null, sy: number, dpr: number): Rect | null {
  if (!s || !s.w || !s.h) return null;
  const snap = (n: number) => Math.round(n * dpr) / dpr;
  return { x: snap(s.cx - s.w / 2 - window.scrollX), y: snap(s.cy - s.h / 2) - sy, w: snap(s.w), h: snap(s.h) };
}

// ---------------------------------------------------------------- a print posed in camera space
interface Pose {
  pos: any; // Vector3 in model space (metres)
  quat: any; // Quaternion
  w: number;
  h: number;
}
class GLPrint {
  readonly mesh: any;
  readonly material: any;
  pose: Pose | null = null;
  d = 1;
  shadow = 1;
  clip = false;
  constructor(scene: any, texture: any, lite: boolean, seed: number, order: number) {
    this.material = (develop as typeof Develop).createDevelopMaterial({ map: texture, lite, screenClip: true, clipBody: true, pad: PAD, seed });
    this.material.depthTest = true;
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  dispose(scene: any): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.uniforms.uMap.value?.dispose?.();
    this.material.dispose();
  }
}

interface Flight {
  print: GLPrint;
  /** Stage time of the shutter press that started it (the timeline's 120 ms mark). */
  t0: number;
  /** The DOM still it lands on and hands back to. */
  still: HTMLImageElement | null;
  landing: Pose | null;
  done: boolean;
  intro: boolean;
  resolve: () => void;
}

// ---------------------------------------------------------------- the controller
class HeroCamera implements CameraController {
  live = false;
  /** Projected print boxes during flights, for the no-fly check (tests/w-s1). */
  readonly flightLog: { t: number; x: number; y: number; w: number; h: number }[] = [];
  private hero: HTMLElement;
  private readonly gl: GLApi;
  private readonly stageHooks: () => StageHooks | null;
  private readonly onMark: (name: string) => void;
  private readonly camView: StageView;
  private readonly fxView: StageView;
  private model: any = null;
  private band: Band | null = null;
  private nodes: Record<string, { obj: any; pos: any; quat: any }> = {};
  private camSlot: Slot | null = null;
  private fxSlot: Slot | null = null;
  private printSlot: Slot | null = null;
  private readonly lookAt0: number;
  private readonly lensAt0: number;
  private readonly shutterSpring = new Spring('press', 0);
  private readonly lookSpring = new Spring('detent', 0);
  private readonly focusSpring = new Spring('detent', 0);
  private pending: { spring: Spring; id: string; kind: string; trigger: string; t0: number }[] = [];
  private readonly exitPos = new Vector3();
  private time = 0;
  private prints: GLPrint[] = [];
  private flying: Flight | null = null;
  private introHooks: IntroHooks | null = null;
  private introT0: number | null = null;
  private readonly introFired = new Set<string>();
  private readonly marked = new Set<string>();
  private readonly ready: Promise<void>;
  /** Lite anti-aliasing (no MSAA on the lite canvas, W-D017): the camera is drawn into a 4x MSAA target, tone-mapped
   *  and sRGB-encoded as the canvas would be (so samples resolve in the same space as the poster's), then composited
   *  onto its view by a quad; a depth-only proxy of the model keeps the print's occlusion. Redrawn only when the
   *  camera changes (scrolling reuses it: the projection is stage-local). */
  private aa: { scene: any; rt: any; quad: any; proxy: any; proxyNodes: Record<string, any>; dirty: boolean } | null = null;
  /** The print can fly before the camera's own programs are compiled: until then the poster (DOM, above GL) hides
   *  the part of the print that is inside the camera's silhouette, as the body's depth does afterwards. */
  private readonly printReady: Promise<unknown>;

  constructor(gl: GLApi, opts: CameraOptions) {
    this.gl = gl;
    this.hero = opts.hero;
    this.stageHooks = opts.stage as () => StageHooks | null;
    this.onMark = opts.onMark;
    this.lookAt0 = opts.lookIndex;
    this.lensAt0 = opts.lensIndex;
    this.camView = gl.createStageView('camera');
    this.camView.visible = false;
    // Created second, so it renders after the camera view, over it, with the camera's depth in the buffer.
    this.fxView = gl.createStageView('hero-fx');
    this.fxView.visible = false;
    this.band = bandOf(this.hero);
    applyFraming(this.camView.camera, BANDS[this.band]);
    this.exitPos.set(EXIT[0], EXIT[1], EXIT[2]);
    this.printReady = developReady;
    if (tierNow() !== 'full' && gl.renderer?.extensions?.has?.('EXT_color_buffer_float')) this.aa = this.createAA();
    this.ready = this.boot();
    gl.registerEntityFactory({
      match: (s: Slot) => s.id === 'camera' || s.id === 'hero-fx' || s.id === 'hero-print',
      create: (s: Slot) => this.entityFor(s.id),
    });
  }

  private dpr(): number {
    return this.stageHooks()?.view.dpr ?? 1;
  }
  private invalidate(): void {
    this.stageHooks()?.invalidate();
  }

  /** Thin entities: the stage owns their lifecycle (bind on scan, step and place each frame, snap on reduced motion). */
  private entityFor(id: string): Entity {
    const isCam = id === 'camera';
    return {
      id,
      persistent: true,
      bind: (slot: Slot) => {
        if (isCam) this.camSlot = slot;
        else if (id === 'hero-fx') this.fxSlot = slot;
        else this.printSlot = slot;
        this.invalidate();
      },
      unbind: () => {
        if (isCam) this.camSlot = null;
        else if (id === 'hero-fx') this.fxSlot = null;
        else this.printSlot = null;
      },
      step: isCam ? (dt: number, time: number) => this.step(dt, time) : undefined,
      place: isCam ? (f: FrameInfo) => this.place(f) : () => {},
      visible: () => (isCam ? Boolean(this.camSlot?.near && this.live) : false),
      dispose: () => {},
      snap: isCam ? () => this.snap() : undefined,
      bounds: isCam ? () => this.cameraBounds() : id === 'hero-print' ? () => this.printBounds() : undefined,
    };
  }

  // ------------------------------------------------------------ boot: model, look, first frame (never half-loaded)
  private async boot(): Promise<void> {
    this.band = bandOf(this.hero);
    const [model] = await Promise.all([loadModel(this.pickLod()), developReady]);
    this.mark('hero:cam-model');
    await new Promise((r) => setTimeout(r, 0));
    this.setModel(model);
    applyFraming(this.camView.camera, BANDS[this.band]);
    const renderer = this.gl.renderer;
    const scene = this.drawScene();
    // Every program compiles in parallel, off the main thread (look.js explains the stand-in environment).
    await quietX4122(() =>
      applyLook({
        renderer,
        scene,
        tier: tierNow(),
        compile: () => Promise.all([renderer.compileAsync(scene, this.camView.camera), this.aa ? renderer.compileAsync(this.camView.scene, this.camView.camera) : null]),
      }),
    );
    this.mark('hero:cam-look');
    await new Promise((r) => setTimeout(r, 0));
    this.model.traverse((o: any) => {
      if (!o.isMesh) return;
      for (const v of Object.values(o.material as object)) if ((v as any)?.isTexture) renderer.initTexture(v);
    });
    if (renderer.compileAsync) await renderer.compileAsync(scene, this.camView.camera);
    this.mark('hero:cam-ready');
    this.camView.visible = true;
    this.invalidate();
  }

  /** LOD by projected width (tokens.stage.lod): LOD0 at 600 device px and wider, full tier only (D-021). */
  private pickLod(): 0 | 1 {
    const fromPoster = posterLod();
    if (fromPoster !== null && tierNow() !== 'static') return tierNow() === 'full' ? fromPoster : 1;
    const w = this.hero.querySelector<HTMLElement>('[data-hero-camera]')?.offsetWidth ?? 0;
    return lodFor(w, this.stageHooks() ? this.dpr() : estimateDpr(), tierNow());
  }

  /** Where the model and its light live: the view's own scene, or the anti-aliasing target's scene on lite. */
  private drawScene(): any {
    return this.aa ? this.aa.scene : this.camView.scene;
  }

  private createAA() {
    const scene = new Scene();
    const rt = new WebGLRenderTarget(2, 2, { samples: 4, type: HalfFloatType, depthBuffer: true, colorSpace: SRGBColorSpace });
    // three tone-maps and encodes only for the screen or an XR target; flagged as one, this target gets exactly the
    // canvas's output (Neutral, sRGB), and its samples resolve in that space, as the antialiased poster's did.
    rt.isXRRenderTarget = true;
    const quad = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        uniforms: { tColor: { value: rt.texture } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: 'uniform sampler2D tColor; varying vec2 vUv; void main() { gl_FragColor = texture2D(tColor, vUv); }',
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    quad.frustumCulled = false;
    quad.renderOrder = -1;
    this.camView.scene.add(quad);
    return { scene, rt, quad, proxy: null, proxyNodes: {}, dirty: true };
  }

  /** Lite: redraw the camera into the MSAA target when it changed, then give the frame back to the stage untouched. */
  private drawAA(cam: Rect, f: FrameInfo): void {
    const aa = this.aa;
    if (!aa || !this.model) return;
    const r = this.gl.renderer;
    const dpr = this.dpr();
    const w = Math.max(2, Math.round(cam.w * dpr));
    const h = Math.max(2, Math.round(cam.h * dpr));
    if (aa.rt.width !== w || aa.rt.height !== h) {
      aa.rt.setSize(w, h);
      aa.dirty = true;
    }
    if (!aa.dirty) return;
    aa.dirty = false;
    const prev = r.getRenderTarget();
    r.setRenderTarget(aa.rt);
    r.clear();
    r.render(aa.scene, this.camView.camera);
    r.setRenderTarget(prev);
    // The stage's frame state, as render() left it before placing entities.
    r.setScissorTest(false);
    r.setViewport(0, 0, f.W, f.Hc);
  }

  private setModel(root: any): void {
    this.model = root;
    this.drawScene().add(root);
    if (this.aa) {
      // The depth proxy: the same geometry, depth only, posed with the rig, so the print hides behind the body.
      const depthOnly = new MeshBasicMaterial({ colorWrite: false });
      const proxy = root.clone(true);
      proxy.traverse((o: any) => {
        if (o.isMesh) o.material = depthOnly;
      });
      this.aa.proxy = proxy;
      for (const name of ['shutter_button', 'dial_look', 'lens_focus_ring']) this.aa.proxyNodes[name] = proxy.getObjectByName(name);
      this.camView.scene.add(proxy);
    }
    for (const name of ['shutter_button', 'dial_look', 'lens_focus_ring', 'print_exit']) {
      const obj = root.getObjectByName(name);
      if (obj) this.nodes[name] = { obj, pos: obj.position.clone(), quat: obj.quaternion.clone() };
    }
    root.updateMatrixWorld(true);
    this.nodes.print_exit?.obj.getWorldPosition(this.exitPos);
    this.applyRig();
  }

  // ------------------------------------------------------------ the rig's verbs (W-D019 pivots, rig.json spec)
  private applyRig(): void {
    const n = this.nodes;
    if (n.shutter_button) {
      const travel = SPEC.pivots.shutter_button?.travelM ?? 0.0012;
      n.shutter_button.obj.position.copy(n.shutter_button.pos).add(new Vector3(0, -travel * this.shutterSpring.value, 0));
    }
    if (n.dial_look) {
      const step = MathUtils.degToRad(SPEC.pivots.dial_look?.stepDeg ?? 30);
      n.dial_look.obj.quaternion.copy(n.dial_look.quat).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -step * this.lookSpring.value));
    }
    if (n.lens_focus_ring) {
      const step = MathUtils.degToRad(FOCUS_STEP_DEG);
      n.lens_focus_ring.obj.quaternion.copy(n.lens_focus_ring.quat).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), step * this.focusSpring.value));
    }
    if (this.aa) {
      for (const [name, p] of Object.entries(this.aa.proxyNodes)) {
        const src = n[name]?.obj;
        if (p && src) {
          p.position.copy(src.position);
          p.quaternion.copy(src.quaternion);
        }
      }
      this.aa.dirty = true;
    }
  }

  private track(spring: Spring, id: string, kind: string, trigger: string): void {
    this.pending = this.pending.filter((p) => p.spring !== spring);
    this.pending.push({ spring, id, kind, trigger, t0: this.time });
  }

  setLook(index: number, trigger: string): void {
    // At rest the dial sits where the poster shows it: the look print 1 carried at load.
    const to = index - this.lookAt0;
    if (reduced()) this.lookSpring.set(to);
    else {
      this.lookSpring.to(to);
      this.track(this.lookSpring, 'camera:dial_look', 'detent', trigger);
    }
    this.applyRig();
    this.invalidate();
  }

  setLens(index: number, trigger: string): void {
    const to = index - this.lensAt0;
    if (reduced()) this.focusSpring.set(to);
    else {
      this.focusSpring.to(to);
      this.track(this.focusSpring, 'camera:lens_focus_ring', 'detent', trigger);
    }
    this.applyRig();
    this.invalidate();
  }

  press(trigger: string): void {
    if (reduced()) return;
    this.shutterSpring.to(1);
    this.track(this.shutterSpring, 'camera:shutter_button', 'press', trigger);
    setTimeout(() => {
      this.shutterSpring.to(0);
      this.track(this.shutterSpring, 'camera:shutter_button', 'press', `${trigger}:release`);
      this.invalidate();
    }, durations.shutter);
    this.invalidate();
  }

  /** Reduced motion turned on: every spring lands at once, the intro and any flight jump to their end. */
  private snap(): void {
    this.shutterSpring.set(0);
    this.lookSpring.set(this.lookSpring.target);
    this.focusSpring.set(this.focusSpring.target);
    this.pending = [];
    this.applyRig();
    if (this.introT0 !== null) this.finishIntro();
    if (this.flying) this.handback(this.flying);
  }

  // ------------------------------------------------------------ the frame
  private step(dt: number, time: number): boolean {
    this.time = time;
    let moving = false;
    for (const s of [this.shutterSpring, this.lookSpring, this.focusSpring]) if (s.step(dt)) moving = true;
    for (const p of [...this.pending]) {
      if (!p.spring.atRest) continue;
      const travel = p.spring.target - p.spring.from;
      logMotion({ id: p.id, kind: p.kind, spring: p.spring.name, trigger: p.trigger, t0: Math.round(p.t0), t1: Math.round(time), from: p.spring.from, to: p.spring.target, peak: p.spring.peak, settle2Ms: Math.abs(travel) > 0 ? p.spring.settle2Ms : null });
      this.pending.splice(this.pending.indexOf(p), 1);
    }
    if (moving) this.applyRig();
    if (this.introT0 !== null) {
      const rel = time - this.introT0;
      this.introEvents(rel);
      if (rel < heroTimeline.developed + 200) moving = true;
    }
    if (this.flying) moving = this.stepFlight(time) || moving;
    // A layout change across a band re-frames from posters.json (the pose never follows the viewport otherwise).
    const band = bandOf(this.hero);
    if (band !== this.band && this.model) {
      this.band = band;
      applyFraming(this.camView.camera, BANDS[band]);
      if (this.aa) this.aa.dirty = true;
      moving = true;
    }
    return moving;
  }

  private place(f: FrameInfo): void {
    const dpr = this.dpr();
    const cam = viewRect(this.camSlot, f.sy, dpr);
    const fx = viewRect(this.fxSlot, f.sy, dpr);
    const camera = this.camView.camera;
    if (cam) {
      camera.aspect = cam.w / cam.h;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
    if (cam && this.aa && this.camView.visible) this.drawAA(cam, f);
    const vp = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    for (const p of this.prints) {
      if (!p.pose || !cam || !fx || !this.fxView.visible) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.visible = true;
      const u = p.material.uniforms;
      // Clip coordinates through the camera, remapped from the camera's viewport into the effects view's.
      u.uRemap.value.set(cam.w / fx.w, cam.h / fx.h, (2 * (cam.x - fx.x) + cam.w) / fx.w - 1, 1 - (2 * (cam.y - fx.y) + cam.h) / fx.h);
      const corners = this.corners(p.pose, true);
      [u.uC0, u.uC1, u.uC2, u.uC3].forEach((c, i) => c.value.set(corners[i].x, corners[i].y, corners[i].z, 1).applyMatrix4(vp));
      [u.uW0, u.uW1, u.uW2, u.uW3].forEach((c, i) => c.value.copy(corners[i]));
      u.uExit.value.copy(this.exitPos);
      u.uBodyClip.value = p.clip ? 1 : 0;
      u.uD.value = p.d;
      u.uShadow.value = p.shadow;
      u.uTime.value = this.time / 1000;
    }
  }

  /** Model-space corners of a print quad (with its shadow margin when padded): BL, BR, TL, TR. */
  private corners(pose: Pose, padded: boolean): any[] {
    const hw = (pose.w / 2) * (padded ? 1 / (1 - 2 * PAD[0]) : 1);
    const hh = (pose.h / 2) * (padded ? 1 / (1 - 2 * PAD[1]) : 1);
    return [[-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh]].map(([x, y]) => new Vector3(x, y, 0).applyQuaternion(pose.quat).add(pose.pos));
  }

  // ------------------------------------------------------------ poses
  /** The print rising out of the exit slot with `rise` metres of it above the top plate, facing the camera's front. */
  private ejectPose(rise: number): Pose {
    return { pos: this.exitPos.clone().add(new Vector3(0, rise - PRINT_H / 2, 0)), quat: new Quaternion(), w: PRINT_W, h: PRINT_H };
  }

  /** A pose parallel to the image plane whose projection is the DOM still's box (centre, size, CSS rotations). */
  private landingPose(still: HTMLElement | null): Pose | null {
    const s = this.printSlot;
    const sy = window.scrollY;
    const cam = viewRect(this.camSlot, sy, this.dpr());
    if (!s || !cam) return null;
    const slotDeg = parseFloat(getComputedStyle(s.el).rotate) || 0;
    let dx = 0;
    let dy = 0;
    let deg = slotDeg;
    if (still) {
      const t = (still.style.translate || '0px 0px').split(/\s+/).map((v) => parseFloat(v) || 0);
      const r = MathUtils.degToRad(slotDeg);
      const ty = t[1] ?? 0;
      dx = t[0] * Math.cos(r) - ty * Math.sin(r);
      dy = t[0] * Math.sin(r) + ty * Math.cos(r);
      deg += parseFloat(still.style.rotate) || 0;
    }
    const camera = this.camView.camera;
    const tanH = Math.tan(MathUtils.degToRad(camera.fov) / 2);
    const aspect = cam.w / cam.h;
    const ndcX = ((s.cx - window.scrollX + dx - cam.x) / cam.w) * 2 - 1;
    const ndcY = 1 - ((s.cy - sy + dy - cam.y) / cam.h) * 2;
    const D = LAND_DEPTH;
    camera.updateMatrixWorld();
    const pos = new Vector3(ndcX * D * tanH * aspect, ndcY * D * tanH, -D).applyMatrix4(camera.matrixWorld);
    const roll = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -MathUtils.degToRad(deg));
    return { pos, quat: camera.quaternion.clone().multiply(roll), w: (s.w / cam.w) * 2 * D * tanH * aspect, h: (s.h / cam.h) * 2 * D * tanH };
  }

  /** The print at `rel` ms after its shutter press (the timeline's keys, W-D012, all offset from the press). */
  private poseAt(fl: Flight, rel: number): void {
    const T = heroTimeline;
    const ejectStart = T.eject - T.shutter;
    const flightStart = T.flight - T.shutter;
    const dipStart = T.landingDip - T.shutter;
    const p = fl.print;
    p.d = (develop as typeof Develop).developCurve((rel - (T.developStart - T.shutter)) / durations.developHero);
    if (rel < ejectStart) {
      p.pose = null;
      return;
    }
    if (rel < flightStart || !fl.landing) {
      p.pose = this.ejectPose(RISE * inOutCubic(clamp01((rel - ejectStart) / durations.eject)));
      p.shadow = 0;
      p.clip = true;
      return;
    }
    const f = springAt('settle', 0, 1, (rel - flightStart) / 1000);
    const a = this.ejectPose(RISE);
    const b = fl.landing;
    // An arc over the top of the camera: across first (out of the slot, toward the landing side), then down onto the
    // table, so the print never sweeps across the lens on its way.
    const ctrl = new Vector3(MathUtils.lerp(a.pos.x, b.pos.x, 0.8), Math.max(a.pos.y, b.pos.y), MathUtils.lerp(a.pos.z, b.pos.z, 0.45));
    const t = clamp01(f);
    const pos = a.pos.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(ctrl, 2 * (1 - t) * t).addScaledVector(b.pos, t * t);
    // Past the target (the settle spring's 1.1 % overshoot) it keeps going along the end tangent.
    if (f > 1) pos.addScaledVector(b.pos.clone().sub(ctrl), 2 * (f - 1));
    const quat = a.quat.clone().slerp(b.quat, t);
    // The landing dip: it arrives a hair lifted and is seated on the detent spring (its 9.5 % overshoot is the dip).
    const seat = rel < dipStart ? 1 : springAt('detent', 1, 0, (rel - dipStart) / 1000);
    const lift = 1 + 0.02 * seat * t;
    p.pose = { pos, quat, w: MathUtils.lerp(a.w, b.w, f) * lift, h: MathUtils.lerp(a.h, b.h, f) * lift };
    p.shadow = t * (1 - 0.4 * seat);
    // The body clips the print only while part of it is still inside the slot.
    if (p.clip && (f > 0.6 || Math.min(...this.corners(p.pose, false).map((c) => c.y)) > this.exitPos.y + 0.002)) p.clip = false;
  }

  private stepFlight(time: number): boolean {
    const fl = this.flying;
    if (!fl || fl.done) return false;
    const rel = time - fl.t0;
    if (!fl.landing && rel >= heroTimeline.flight - heroTimeline.shutter - 50) fl.landing = this.landingPose(fl.intro ? null : fl.still);
    this.poseAt(fl, rel);
    const b = this.printBounds();
    if (b) this.flightLog.push({ t: Math.round(rel + heroTimeline.shutter), x: b.x, y: b.y, w: b.w, h: b.h });
    if (this.flightLog.length > 2000) this.flightLog.splice(0, 500);
    if (rel >= heroTimeline.developed - heroTimeline.shutter) this.handback(fl);
    return true;
  }

  /** The DOM still takes the pixels back: it fades in over GL in 120 ms (W-D012), then GL lets go and sleeps. */
  private handback(fl: Flight, cut = false): void {
    if (fl.done) return;
    fl.done = true;
    fl.print.d = 1;
    fl.print.shadow = 1;
    if (fl.still) fl.still.style.opacity = '1';
    if (fl.intro) {
      this.introHooks?.handback();
      this.mark('hero:developed');
    }
    this.hero.querySelector('[data-hero-print]')?.classList.remove('is-gl');
    this.invalidate();
    const release = () => {
      for (const p of this.prints.splice(0)) p.dispose(this.fxView.scene);
      this.fxView.visible = false;
      this.hero.removeAttribute('data-fx');
      if (this.flying === fl) this.flying = null;
      fl.resolve();
      this.invalidate();
    };
    // A guard cuts to the end state at once; the natural handback crossfades for 120 ms.
    if (cut) release();
    else setTimeout(release, durations.glHandback);
  }

  private async newPrint(src: string, slug: string, order: number): Promise<GLPrint> {
    const w = Math.min(1024, Math.max(256, (this.printSlot?.w ?? 300) * this.dpr()));
    const tex = await stillTexture(src, w, w * (PRINT_H / PRINT_W));
    let seed = 0;
    for (let i = 0; i < slug.length; i++) seed = (seed * 31 + slug.charCodeAt(i)) >>> 0;
    const p = new GLPrint(this.fxView.scene, tex, tierNow() !== 'full', (seed % 997) / 997, order);
    this.gl.renderer.initTexture(tex);
    this.prints.push(p);
    return p;
  }

  /** The prints already on the table, drawn by GL at their exact DOM boxes while a new one flies in over them. */
  private async stackPrints(stills: HTMLImageElement[]): Promise<void> {
    let order = 1;
    for (const img of stills) {
      const p = await this.newPrint(img.currentSrc || img.src, img.dataset.slug || 'print', order++);
      p.pose = this.landingPose(img.style.translate ? img : null);
    }
  }

  private showFx(): void {
    this.hero.setAttribute('data-fx', '');
    this.fxView.visible = true;
  }

  async printNext(item: QueueItem, addStill: () => HTMLImageElement | null): Promise<void> {
    await this.ready;
    if (this.flying) return;
    const stack = [...this.hero.querySelectorAll<HTMLImageElement>('[data-hero-print] img.hero-still')];
    this.showFx();
    await this.stackPrints(stack);
    // The new still exists from the press (hidden), so the flight knows the exact box it lands on.
    const still = addStill();
    const print = await this.newPrint(item.still, item.slug, 10);
    this.hero.querySelector('[data-hero-print]')?.classList.add('is-gl');
    const t0 = this.time;
    logAnalytic(`print:${item.slug}:flight`, 'flight', 'settle', 'shutter', t0 + heroTimeline.flight - heroTimeline.shutter, 0, 1);
    logAnalytic(`print:${item.slug}:dip`, 'landing', 'detent', 'shutter', t0 + heroTimeline.landingDip - heroTimeline.shutter, 1, 0);
    return new Promise<void>((resolve) => {
      this.flying = { print, t0, still, landing: null, done: false, intro: false, resolve };
      this.invalidate();
    });
  }

  // ------------------------------------------------------------ the intro (W-D012)
  private mark(name: string): void {
    if (manualClock || this.marked.has(name)) return;
    this.marked.add(name);
    this.onMark(name);
  }

  async intro(t0: number, hooks: IntroHooks): Promise<void> {
    await this.printReady;
    this.introHooks = hooks;
    const still = this.hero.querySelector<HTMLImageElement>('[data-hero-print] img.hero-still');
    const print = await this.newPrint(still?.getAttribute('src') || '', this.hero.querySelector<HTMLElement>('[data-hero-print]')?.dataset.slug || 'print-1', 10);
    // T0 = stage:gl-ready + 200 ms; on the manual clock (?t=) T0 is stage time 0, so seek(ms) shows T0 + ms.
    // The print's program compiles off the main thread before its first frame (the eject is 380 ms away).
    const r = this.gl.renderer;
    if (r.compileAsync) await r.compileAsync(this.fxView.scene, this.fxView.camera);
    const start = manualClock ? 0 : Math.max(t0, performance.now());
    this.introT0 = start;
    this.showFx();
    this.hero.querySelector('[data-hero-print]')?.classList.add('is-gl');
    logAnalytic('print:hero-1:flight', 'flight', 'settle', 'intro', start + heroTimeline.flight, 0, 1);
    logAnalytic('print:hero-1:dip', 'landing', 'detent', 'intro', start + heroTimeline.landingDip, 1, 0);
    return new Promise<void>((resolve) => {
      this.flying = { print, t0: start + heroTimeline.shutter, still, landing: null, done: false, intro: true, resolve };
      this.invalidate();
    });
  }

  /** The intro's discrete events at `rel` ms after T0, each once. */
  private introEvents(rel: number): void {
    const fire = (key: string, at: number, fn: () => void) => {
      if (rel >= at && !this.introFired.has(key)) {
        this.introFired.add(key);
        fn();
      }
    };
    fire('t0', 0, () => {
      this.mark('hero:t0');
      this.introHooks?.closeBrackets(this.time);
      this.takeCamera();
    });
    fire('shutter', heroTimeline.shutter, () => this.press('intro'));
    fire('flash', heroTimeline.flash, () => this.introHooks?.flash(this.time));
    fire('readable', heroTimeline.readable, () => this.mark('hero:readable'));
    if (rel >= heroTimeline.developed + 200) this.introT0 = null;
  }

  finishIntro(): void {
    this.takeCamera();
    if (this.introT0 === null && !this.flying?.intro) return;
    this.introT0 = null;
    if (this.flying?.intro) this.handback(this.flying, true);
    this.introHooks?.handback();
    this.shutterSpring.set(0);
    this.applyRig();
    this.invalidate();
  }

  /** Hand the camera slot to GL: the poster fades out over the canvas (200 ms, W-D029). */
  private takeCamera(): void {
    if (this.live) return;
    this.ready.then(() => {
      if (this.live) return;
      this.live = true;
      this.hero.querySelector('[data-hero-camera]')?.classList.add('is-gl');
      this.invalidate();
    });
  }

  rebind(hero: HTMLElement): void {
    if (hero === this.hero && this.live) return;
    this.hero = hero;
    // A fresh hero after a swap: the camera is up already, so it takes the slot at once (no intro on a return).
    this.live = false;
    this.ready.then(() => {
      if (this.introT0 === null) this.takeCamera();
    });
  }

  // ------------------------------------------------------------ bounds (__stage.bounds, the no-fly log)
  private project(points: any[]): { x: number; y: number; w: number; h: number } | null {
    const r = viewRect(this.camSlot, window.scrollY, this.dpr());
    if (!r) return null;
    const camera = this.camView.camera;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pt of points) {
      const v = pt.clone().project(camera);
      const px = r.x + ((v.x + 1) / 2) * r.w;
      const py = r.y + ((1 - v.y) / 2) * r.h;
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
    }
    return { x: Math.round(x0 * 10) / 10, y: Math.round(y0 * 10) / 10, w: Math.round((x1 - x0) * 10) / 10, h: Math.round((y1 - y0) * 10) / 10 };
  }

  private cameraBounds() {
    if (!this.model) return null;
    const box = new Box3().setFromObject(this.model);
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push(new Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    const b = this.project(pts);
    if (!b) return null;
    const c = box.getCenter(new Vector3());
    const camera = this.camView.camera;
    return { ...b, angleDeg: MathUtils.radToDeg(Math.atan2(camera.position.x - c.x, camera.position.z - c.z)) };
  }

  private printBounds() {
    const p = this.flying?.print;
    if (!p?.pose) return null;
    // While the print is still in the slot only the part above the top plate shows: bound that part.
    let pts = this.corners(p.pose, false);
    if (p.clip) {
      const above = pts.filter((c) => c.y >= this.exitPos.y);
      if (above.length < 2) return null;
      pts = [...above, ...pts.filter((c) => c.y < this.exitPos.y).map((c) => c.clone().setY(this.exitPos.y))];
    }
    const b = this.project(pts);
    return b ? { ...b, angleDeg: 0 } : null;
  }

  // ------------------------------------------------------------ GPU bench (tests/w-s1/gpu.mjs, W-D030 GPU)
  /**
   * The hero's wet moment on the GPU: three hero-size prints (520 x 828 CSS px, the bench's hero3 size) developing
   * at once with this tier's develop shader, over the real canvas at its real DPR. Same method as /bench/: warm-up
   * frames, then readPixels-fenced frames; returns ms per frame. Test hook only (nothing calls it on its own).
   */
  async bench(opts: { warmup?: number; frames?: number } = {}): Promise<Record<string, unknown>> {
    await this.ready;
    const warmup = opts.warmup ?? 30;
    const frames = opts.frames ?? 60;
    const r = this.gl.renderer;
    const view = this.stageHooks()?.view ?? { W: innerWidth, Hc: innerHeight, dpr: 1 };
    const W = view.W;
    const H = view.Hc;
    const scene = new Scene();
    const cam = new OrthographicCamera(0, W, H, 0, -1, 1);
    const still = this.hero.querySelector<HTMLImageElement>('[data-hero-print] img.hero-still');
    const tex = await stillTexture(still?.getAttribute('src') || '', 520 * view.dpr, 828 * view.dpr);
    const geo = new PlaneGeometry(1, 1);
    const lite = tierNow() !== 'full';
    const mats = [0, 1, 2].map((i) => (develop as typeof Develop).createDevelopMaterial({ map: tex, lite, seed: i * 0.37 }));
    mats.forEach((m, i) => {
      m.depthTest = false;
      const mesh = new Mesh(geo, m);
      mesh.scale.set(520, 828, 1);
      mesh.position.set(24 + i * (520 + 24) + 260, H - 24 - 414, 0);
      scene.add(mesh);
    });
    if (r.compileAsync) await r.compileAsync(scene, cam);
    const ctx = r.getContext() as WebGL2RenderingContext;
    const px = new Uint8Array(4);
    const samples: number[] = [];
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
    for (let i = 0; i < warmup + frames; i++) {
      mats.forEach((m, k) => {
        m.uniforms.uD.value = ((i + k * 7) % 60) / 60;
        m.uniforms.uTime.value = i / 60;
      });
      const a = performance.now();
      r.clear();
      r.render(scene, cam);
      ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      const b = performance.now();
      if (i >= warmup) samples.push(Math.round((b - a) * 1000) / 1000);
      if (i % 10 === 9) await new Promise((res) => setTimeout(res, 0));
    }
    geo.dispose();
    mats.forEach((m) => m.dispose());
    tex.dispose();
    r.clear();
    this.invalidate();
    const sorted = [...samples].sort((x, y) => x - y);
    const q = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
    return { schema: 1, scenario: 'hero3-develop', shader: lite ? 'develop v1 LITE' : 'develop v1', tier: tierNow(), dpr: view.dpr, canvas: { w: Math.round(W * view.dpr), h: Math.round(H * view.dpr) }, warmup, frames, medianMs: q(0.5), p95Ms: q(0.95), samples };
  }
}

export async function createCamera(gl: GLApi, opts: CameraOptions): Promise<CameraController> {
  const cam = new HeroCamera(gl, opts);
  (window as unknown as { __hero?: HeroCamera }).__hero = cam;
  // Lite, static and reduced: no intro; the camera takes its slot as soon as its first frame is ready.
  if (html.dataset.hero !== 'eject') cam.finishIntro();
  return cam;
}
