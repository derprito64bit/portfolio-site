// The hero camera on GL (W-S1 v1, then W-C14). Loaded by the hero once GL starts booting (its own chunk).
// - The X-T5 (W-C13's GLBs; later models keep the rig names and pivots) in a stage-local view over its slot:
//   FOV 28 and one pose per band, from posters.json through stage.js applyFraming (W-D013, W-D019). The slot has the
//   framing's aspect, so the whole slot is the contain rectangle and the first GL frame is the poster (#31 worked
//   around). LOD by projected width on the full tier; LOD1 everywhere else (D-021).
// - It takes the slot from the poster only once a first frame is confirmed non-empty (the very view the stage will
//   draw, rendered in a corner of the canvas inside a stage frame and read back), so a GL path that draws nothing on
//   some engine keeps the poster up.
// - The opening (D-024, #13 A1 and A2; drawing.ts): on the full tier's first visit it develops out of the line
//   drawing from T0 (clay, then silver, black, amber, the ground clearing and the lines fading), then runs the
//   eject sequence (W-D012), whose times count from the drawing's end. T0 is the later of stage:gl-ready + 200 ms
//   and this camera being loaded, patched and compiled.
// - The rig's verbs on ion-spring: the shutter presses (press), the Look dial and the focus ring step (detent).
// - Print 1 and every next print: posed in the camera's own 3D space (it leaves the real exit slot, hidden where the
//   body is in front of it, with roller tracks on its veil), then drawn in the effects view, which renders after the
//   camera view with the camera's depth still in the buffer. It flies to its landing slot on the settle spring, dips
//   on the detent spring, develops (W-D016, calm grain D-026), and hands back to its DOM still. The flight's and the
//   dip's overshoots are logged as measured on the frames drawn, not from the spring's formula.
// - The intro is a pure function of the stage clock from T0, so __stage.seek(ms) can film it.
// The stage is reached through the hooks the hero passes in (no import of src/stage: see sections/hero/bridge.ts).
import {
  Box3,
  CanvasTexture,
  LinearFilter,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NoColorSpace,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { applyFraming } from '../../../scripts/build/posters/stage.js';
import { readCameraData, type Band, type CameraData } from './data.ts';
import { applyLook } from './look.js';
import { CameraDrawing, drawingPhases, drawingTiming, rgbOf } from './drawing.ts';
import type * as Develop from '../effects/develop/index.ts';
import { Spring, params, stepExact, type SpringName } from '../../motion/spring/index.ts';
import { durations, heroTimeline } from '../../lib/tokens.js';
import type { Entity, FrameInfo, GLApi, StageView } from '../../stage/gl/index.ts';
import type { Slot } from '../../stage/slots.ts';

export interface QueueItem {
  slug: string;
  frame: string;
  look: string;
  name: string;
  /** The still's image source (built on the client from the item's test-strip data while it is a placeholder). */
  still: string;
}
export interface IntroHooks {
  /** `at`: the stage time it fires at (the manual clock delays the DOM animation by it, so seeks show its phase). */
  closeBrackets(at?: number): void;
  flash(at?: number): boolean;
  handback(): void;
  /** T0 of the opening: the develop starts (GL's ground takes over from the DOM ground; the strokes fade). */
  drawingStart(at: number): void;
  /** A guard crossfades the drawing to the finished camera over `ms` (0: at once). */
  drawingCrossfade(ms: number): void;
  /** The drawing is over: GL shows the finished camera. */
  drawingEnd(): void;
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
export type IntroResult = 'done' | 'failed';
export interface CameraController {
  /** The camera is drawn by GL (the poster has handed over). */
  readonly live: boolean;
  /** GL is developing the drawing right now (T0 passed, not finished). */
  readonly drawingLive: boolean;
  setLens(index: number, trigger: string): void;
  setLook(index: number, trigger: string): void;
  press(trigger: string): void;
  printNext(item: QueueItem, addStill: () => HTMLImageElement | null): Promise<void>;
  intro(t0: number, hooks: IntroHooks): Promise<IntroResult>;
  /** A guard: everything to its end state; a running drawing crossfades over `fadeMs` (0 under reduced motion). */
  finishIntro(fadeMs?: number): void;
  rebind(hero: HTMLElement): void;
}

/** posters.json's framings and rig.json's exit slot and pivots, as the page carries them (data.ts). */
let CAM: CameraData;
const PRINT_W = 0.054; // the instant print in metres (W-D006: 54 x 86 mm)
const PRINT_H = 0.086;
const RISE = 0.4 * PRINT_H; // how far the eject pushes the print out of the slot before the flight takes it
const PAD: [number, number] = [0.12, 0.09]; // shadow margin of the print quad, each side, as a share of the quad
const LAND_DEPTH = 0.1; // view-space depth of a landed print: in front of the body, beyond the near plane
const FOCUS_STEP_DEG = 24; // the focus ring turns this far per lens stop (W-C14 tunes the final verbs)
const PRESENT_TAIL = 3; // frames presented after a change (WebKit shows a canvas one frame late)
const html = document.documentElement;
const reduced = () => html.dataset.motion === 'reduced';
const tierNow = () => html.dataset.tier || 'static';
/** True on the manual clock (?t=): the intro is filmed by __stage.seek(ms), with T0 at stage time 0. */
const manualClock = new URLSearchParams(location.search).has('t');

// The develop shader (and the camera patch's GLSL) is its own chunk (the effects budget counts it alone).
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
/** The LOD of the poster set heroPoster() picked (it applies the same rule): GL draws that LOD, so the hand-over matches. */
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
  measured?: boolean;
}
/** Append to window.__motionLog with the W-D030 schema. */
function logMotion(e: MotionRecord): void {
  const w = window as unknown as { __motionLog?: unknown[] };
  const log = (w.__motionLog ??= []);
  log.push({ ...e, tier: tierNow(), reduced: reduced() });
  if (log.length > 500) log.splice(0, log.length - 500);
}

/**
 * three r186's PMREM GGX convolution shader links with HLSL constant-folding notes on ANGLE's D3D11 backend
 * ("warning X4122: sum of 1 and -1.5e-017 cannot be represented accurately in double precision"); three echoes any
 * non-empty program log as console.warn. The note is benign (the program links and runs). Until W-F's console
 * allowlist has the entry (#54), exactly that message is passed on as console.info; any other warning, and every
 * error, is untouched. Remove this with #54.
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
  roll = 0;
  clip = false;
  /** The DOM still this is the GL copy of (the keeper's: print 1's), and the shader variant it was made for. */
  el: HTMLImageElement | null = null;
  readonly lite: boolean;
  constructor(scene: any, texture: any, lite: boolean, seed: number, order: number, grain: [number, number]) {
    this.lite = lite;
    this.material = (develop as typeof Develop).createDevelopMaterial({ map: texture, lite, screenClip: true, clipBody: true, pad: PAD, seed, grain });
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
  /** Stage time of the shutter press that started it (the sequence's 120 ms mark). */
  t0: number;
  /** The DOM still it lands on and hands back to. */
  still: HTMLImageElement | null;
  landing: Pose | null;
  done: boolean;
  intro: boolean;
  /** Measured on the frames drawn: the flight's furthest progress and the dip's deepest seat. */
  peakF: number;
  minSeat: number;
  resolve: () => void;
}

/** The lite tier's anti-aliasing (its canvas has no MSAA, W-D017): the camera drawn into a 4x MSAA 8-bit target by
 *  materials that write the canvas's own output (displayOut: Neutral tone mapping and the sRGB encode, in the shader,
 *  as three does for the screen), so samples resolve in display space as the antialiased poster's did; a quad copies
 *  it onto the view. No reliance on three's XR paths. A depth-only proxy of the model keeps the print's occlusion. */
interface AA {
  scene: any;
  rt: any;
  quad: any;
  proxy: any;
  proxyNodes: Record<string, any>;
  dirty: boolean;
}

// ---------------------------------------------------------------- the controller
class HeroCamera implements CameraController {
  live = false;
  /** Projected print boxes during flights (evidence; the acceptance reads __stage.bounds). */
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
  /** The body below the exit slot (half width, z min, z max), from the model's own bounds. */
  private readonly body: [number, number, number] = [0.068, -0.046, 0.03];
  private time = 0;
  /** Frames still to present after the last change (see step). */
  private tail = 0;
  private prints: GLPrint[] = [];
  private flying: Flight | null = null;
  private introHooks: IntroHooks | null = null;
  private introT0: number | null = null;
  private introCancelled = false;
  /** ms from T0 to the eject sequence: the drawing's clay and develop, or 0 when there is no drawing. */
  private drawMs = 0;
  private drawing: CameraDrawing | null = null;
  private drawingState: 'off' | 'armed' | 'running' | 'fading' | 'done' = 'off';
  private fade: { from: number; ms: number } | null = null;
  private readonly introFired = new Set<string>();
  private readonly marked = new Set<string>();
  /** Resolves true once the camera's first frame is confirmed non-empty (false: the poster stays). */
  readonly ready: Promise<boolean>;
  private aa: AA | null = null;
  private confirming: ((ok: boolean) => void) | null = null;
  private readonly printReady: Promise<unknown>;
  /** GL is gone for this visit (the stage was torn down: the tier dropped to static). See leaveGL. */
  private gone = false;
  /**
   * Print 1's GL copy, kept for the visit, one per shader variant: compiled before the camera takes its slot when
   * there is no opening (on the full tier's opening it is the intro's print), so a press never compiles the print
   * program in the frames of its eject (WebKit compiles on first use: one long frame lifts the 45-frame average W-F's
   * governor reads, and an early tap on lite was demoted to static mid-flight). Never disposed with a flight, so the
   * program outlives every flight; it is print 1's copy in a press's stack.
   */
  private readonly keepers: { full?: Promise<GLPrint | null>; lite?: Promise<GLPrint | null> } = {};
  /** The kept prints that are made and compiled. */
  private readonly kept = new Set<GLPrint>();

  constructor(gl: GLApi, opts: CameraOptions) {
    this.gl = gl;
    this.hero = opts.hero;
    CAM = readCameraData(opts.hero);
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
    applyFraming(this.camView.camera, CAM.bands[this.band]);
    this.exitPos.set(CAM.exit[0], CAM.exit[1], CAM.exit[2]);
    this.printReady = developReady;
    if (tierNow() !== 'full' && gl.renderer?.extensions?.has?.('EXT_color_buffer_float')) this.aa = this.createAA();
    this.ready = this.boot().catch((e) => {
      console.warn('[hero] the camera could not start; the poster stays', e);
      return false;
    });
    gl.registerEntityFactory({
      match: (s: Slot) => s.id === 'camera' || s.id === 'hero-fx' || s.id === 'hero-print',
      create: (s: Slot) => this.entityFor(s.id),
    });
    // W-F tears the stage down when the tier drops to static (the governor's second step, two context losses): it
    // disposes the entities (entityFor), and the tier attribute says so too. A step down to lite keeps GL: a print
    // made from then on uses the lite shader, so its program is warmed at once.
    new MutationObserver(() => {
      const t = tierNow();
      if (t === 'static') this.leaveGL();
      else if (t === 'lite' && this.live) void this.keeper(true);
    }).observe(html, { attributes: true, attributeFilter: ['data-tier'] });
  }

  /**
   * GL is gone for this visit (the stage was torn down). Frames stop, so nothing may wait on one: a flight cuts to its
   * end state (its still shows, data-fx clears, printNext settles, so the next press prints with the 200 ms fade), and
   * a first frame still being confirmed resolves empty (the poster stays). The opening's DOM side ends through
   * hero.ts's tier guard.
   */
  private leaveGL(): void {
    if (this.gone) return;
    this.gone = true;
    this.live = false;
    const confirm = this.confirming;
    this.confirming = null;
    confirm?.(false);
    if (this.flying) this.handback(this.flying, true);
    else this.letGo();
  }

  get drawingLive(): boolean {
    return this.drawingState === 'running' || this.drawingState === 'fading';
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
      visible: () => (isCam ? Boolean(this.confirming || (this.camSlot?.near && this.live)) : false),
      // Persistent entities are disposed only when the stage is torn down (src/stage/gl teardown).
      dispose: () => this.leaveGL(),
      snap: isCam ? () => this.snap() : undefined,
      bounds: isCam ? () => this.cameraBounds() : id === 'hero-print' ? () => this.printBounds() : undefined,
    };
  }

  // ------------------------------------------------------------ boot: model, patch, look, confirmed first frame
  private async boot(): Promise<boolean> {
    this.band = bandOf(this.hero);
    const [model] = await Promise.all([loadModel(this.pickLod()), developReady]);
    this.mark('hero:cam-model');
    await new Promise((r) => setTimeout(r, 0));
    this.setModel(model);
    applyFraming(this.camView.camera, CAM.bands[this.band]);
    // The opening (A2): only on the run that will play it (the drawing on screen, the eject armed, the full tier).
    if (html.dataset.cam === 'drawing' && html.dataset.hero === 'eject' && tierNow() === 'full' && !this.introCancelled) {
      const ground = getComputedStyle(this.hero).getPropertyValue('--hero-ground') || '#2d4547';
      this.drawing = new CameraDrawing(develop as typeof Develop, rgbOf(ground));
      this.drawing.patch(model);
      this.camView.scene.add(this.drawing.ground);
      this.drawingState = 'armed';
    }
    const renderer = this.gl.renderer;
    const scene = this.drawScene();
    const camera = this.camView.camera;
    // Programs are keyed by where they draw: into a render target three skips tone mapping and the sRGB encode, so the
    // lite target's scene compiles with that target bound (the variants it will use), the view's scene for the canvas.
    const compileFor = (sc: any, target: any) => {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      const job = renderer.compileAsync(sc, camera);
      renderer.setRenderTarget(prev);
      return job;
    };
    // Every program compiles in parallel, off the main thread (look.js explains the stand-in environment); the
    // textures upload meanwhile, in the same task that starts the compile.
    const uploadTextures = () =>
      this.model.traverse((o: any) => {
        if (!o.isMesh) return;
        for (const v of Object.values(o.material as object)) if ((v as any)?.isTexture) renderer.initTexture(v);
      });
    await quietX4122(() =>
      applyLook({
        renderer,
        scene,
        tier: tierNow(),
        compile: () => {
          const jobs = Promise.all([compileFor(scene, this.aa?.rt ?? null), this.aa ? compileFor(this.camView.scene, null) : null]);
          uploadTextures();
          return jobs;
        },
      }),
    );
    this.mark('hero:cam-look');
    if (this.drawing?.failed) {
      // A three without the patch's anchor: no develop; the drawing crossfades instead (A1 lite behaviour).
      this.drawing.finish();
      this.drawingState = 'done';
    }
    // No opening: the print program is compiled (and used once, in the confirming frame) before the camera takes
    // its slot, so the first press never compiles it. The opening makes its print in intro(), alongside this boot.
    if (html.dataset.hero !== 'eject') await this.keeper(tierNow() !== 'full');
    if (this.gone) return false;
    // The first frame, drawn inside a stage frame on the canvas itself and read back (see confirmInFrame).
    // On the manual clock (?t=) frames run only on a seek, so it is drawn and read back right here instead.
    const view = this.stageHooks()?.view;
    const ok = manualClock && view
      ? this.confirmInFrame({ sy: window.scrollY, anchor: 0, W: view.W, H: view.Hc, Hc: view.Hc })
      : await new Promise<boolean>((resolve) => {
          this.confirming = resolve;
          this.invalidate();
        });
    this.mark(ok ? 'hero:cam-ready' : 'hero:cam-empty');
    if (!ok) return false;
    this.camView.visible = true;
    this.invalidate();
    return true;
  }

  /**
   * The first frame, confirmed: inside a stage frame (the canvas is cleared, no view drawn yet), the camera view is
   * drawn into a small corner of the canvas exactly as the stage will draw it (same programs: the canvas's), read
   * back, and the corner cleared again before the stage draws its views, so nothing of it is ever presented. True
   * when the camera covers some of the corner. The read-back also waits for the GPU's own first-draw work, so T0
   * never starts on a frame the GPU is still preparing.
   */
  private confirmInFrame(f: FrameInfo): boolean {
    const r = this.gl.renderer;
    const ctx = r.getContext() as WebGL2RenderingContext;
    const camera = this.camView.camera;
    const aspect = CAM.bands[this.band ?? 'stacked'].aspect;
    const lw = 96;
    const lh = Math.max(2, Math.round(lw / aspect));
    const pr = r.getPixelRatio();
    const dw = Math.max(2, Math.floor(lw * pr));
    const dh = Math.max(2, Math.floor(lh * pr));
    const ground = this.drawing?.ground;
    const groundWas = ground?.visible;
    if (ground) ground.visible = false;
    const dev = this.drawing?.uniforms.uCamDev;
    const devWas = dev?.value;
    if (dev) dev.value = 1;
    const aspectWas = camera.aspect;
    const viewWas = camera.view?.enabled ? { ...camera.view } : null;
    camera.clearViewOffset();
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    try {
      if (this.aa) {
        this.aa.rt.setSize(dw, dh);
        r.setRenderTarget(this.aa.rt);
        r.clear();
        r.render(this.aa.scene, camera);
        r.setRenderTarget(null);
        this.aa.dirty = true;
      }
      r.setScissorTest(true);
      r.setScissor(0, 0, lw, lh);
      r.setViewport(0, 0, lw, lh);
      r.clear();
      r.render(this.camView.scene, camera);
      const px = new Uint8Array(dw * dh * 4);
      ctx.readPixels(0, 0, dw, dh, ctx.RGBA, ctx.UNSIGNED_BYTE, px);
      this.useKeepers();
      r.clear();
      let covered = 0;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 16) covered++;
      return covered > dw * dh * 0.05;
    } catch {
      return false;
    } finally {
      r.setScissorTest(false);
      r.setViewport(0, 0, f.W, f.Hc);
      camera.aspect = aspectWas;
      if (viewWas) camera.setViewOffset(viewWas.fullWidth, viewWas.fullHeight, viewWas.offsetX, viewWas.offsetY, viewWas.width, viewWas.height);
      camera.updateProjectionMatrix();
      if (ground) ground.visible = Boolean(groundWas);
      if (dev) dev.value = devWas as number;
    }
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

  private createAA(): AA {
    const scene = new Scene();
    // 8-bit, multisampled: the materials write display-space colour into it (displayOut), so its samples resolve in
    // the same space as the poster's (and the full tier canvas's) MSAA, and the quad below only copies.
    const rt = new WebGLRenderTarget(2, 2, { samples: 4, depthBuffer: true });
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

  /**
   * The canvas's own output, written by the materials themselves when they draw into the lite target: three applies
   * tone mapping and the sRGB encode only when it draws to the screen, so for a render target the fragment shader
   * gets them here (the same Neutral curve as three's NeutralToneMapping, at the renderer's exposure, then the sRGB
   * transfer), right after <colorspace_fragment>. One program key, so materials of a type share their program.
   */
  private displayOut(root: any): void {
    const exposure = { value: this.gl.renderer.toneMappingExposure ?? 1 };
    const pars = `uniform float uIonExposure;
vec3 ionNeutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  color *= uIonExposure;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1. - startCompression;
  float newPeak = 1. - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1. - 1. / (desaturation * (peak - newPeak) + 1.);
  return mix(color, vec3(newPeak), g);
}`;
    const seen = new Set<any>();
    root.traverse((o: any) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (seen.has(m)) continue;
        seen.add(m);
        m.onBeforeCompile = (shader: any) => {
          if (!shader.fragmentShader.includes('#include <colorspace_fragment>')) return;
          shader.uniforms.uIonExposure = exposure;
          shader.fragmentShader = shader.fragmentShader
            .replace('void main()', `${pars}\nvoid main()`)
            .replace('#include <colorspace_fragment>', '#include <colorspace_fragment>\ngl_FragColor = sRGBTransferOETF(vec4(clamp(ionNeutral(gl_FragColor.rgb), 0.0, 1.0), gl_FragColor.a));');
        };
        m.customProgramCacheKey = () => 'ion-cam-lite-out-1';
        m.needsUpdate = true;
      }
    });
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
      this.displayOut(root);
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
    // The body volume a print inside the slot is clipped to (develop shader uBody): the body mesh, lens excluded.
    const bodyNode = root.getObjectByName('body');
    if (bodyNode) {
      const box = new Box3().setFromObject(bodyNode, true);
      this.body[0] = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
      this.body[1] = box.min.z;
      this.body[2] = box.max.z;
    }
    this.applyRig();
  }

  // ------------------------------------------------------------ the rig's verbs (W-D019 pivots, rig.json spec)
  private applyRig(): void {
    const n = this.nodes;
    if (n.shutter_button) {
      const travel = CAM.shutterTravelM;
      n.shutter_button.obj.position.copy(n.shutter_button.pos).add(new Vector3(0, -travel * this.shutterSpring.value, 0));
    }
    if (n.dial_look) {
      const step = MathUtils.degToRad(CAM.lookStepDeg);
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
    if (this.introT0 !== null || this.drawingLive) this.finishIntro(0);
    if (this.flying) this.handback(this.flying, true);
  }

  // ------------------------------------------------------------ the frame
  private step(dt: number, time: number): boolean {
    this.time = time;
    let moving = false;
    for (const s of [this.shutterSpring, this.lookSpring, this.focusSpring]) if (s.step(dt)) moving = true;
    for (const p of [...this.pending]) {
      if (!p.spring.atRest) continue;
      const travel = p.spring.target - p.spring.from;
      logMotion({ id: p.id, kind: p.kind, spring: p.spring.name, trigger: p.trigger, t0: Math.round(p.t0), t1: Math.round(time), from: p.spring.from, to: p.spring.target, peak: p.spring.peak, settle2Ms: Math.abs(travel) > 0 ? p.spring.settle2Ms : null, measured: true });
      this.pending.splice(this.pending.indexOf(p), 1);
    }
    if (moving) this.applyRig();
    if (this.introT0 !== null) {
      const rel = time - this.introT0;
      this.introEvents(rel);
      if (rel < this.drawMs + heroTimeline.developed + durations.glHandback) moving = true;
    }
    if (this.fade) moving = this.stepFade(time) || moving;
    if (this.flying) moving = this.stepFlight(time, dt) || moving;
    // A layout change across a band re-frames from the band's framing (posters.json) (the pose never follows the viewport otherwise).
    const band = bandOf(this.hero);
    if (band !== this.band && this.model) {
      this.band = band;
      applyFraming(this.camView.camera, CAM.bands[band]);
      if (this.aa) this.aa.dirty = true;
      moving = true;
    }
    // WebKit presents a canvas one frame late (measured on its Windows build: a screenshot after one render shows
    // the buffer before it), so a camera that changes and then rests would stay on its old frame. After any change
    // the stage presents PRESENT_TAIL more frames (W-F does the same for a re-anchor).
    if (moving) this.tail = PRESENT_TAIL;
    else if (this.tail > 0) {
      this.tail--;
      moving = true;
    }
    return moving;
  }

  /** A guard's crossfade of the drawing (drawingTiming.fade, or at once). */
  private stepFade(time: number): boolean {
    const fd = this.fade;
    if (!fd || !this.drawing) return false;
    const f = fd.ms > 0 ? (time - fd.from) / fd.ms : 1;
    this.drawing.crossfade(f);
    if (f < 1) return true;
    this.fade = null;
    this.endDrawing();
    return true;
  }

  private endDrawing(): void {
    if (this.drawingState === 'done' || this.drawingState === 'off') return;
    this.drawing?.finish();
    this.drawingState = 'done';
    this.introHooks?.drawingEnd();
    this.invalidate();
  }

  private place(f: FrameInfo): void {
    if (this.confirming) {
      const done = this.confirming;
      this.confirming = null;
      done(this.confirmInFrame(f));
    }
    const dpr = this.dpr();
    const cam = viewRect(this.camSlot, f.sy, dpr);
    const fx = viewRect(this.fxSlot, f.sy, dpr);
    const camera = this.camView.camera;
    if (cam) {
      camera.aspect = cam.w / cam.h;
      this.registerToSlot(f);
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
      u.uBody.value.set(this.body[0], this.body[1], this.body[2], 0);
      u.uBodyClip.value = p.clip ? 1 : 0;
      u.uD.value = p.d;
      u.uRoll.value = p.roll;
      u.uShadow.value = p.shadow;
    }
  }

  /**
   * Registration to the poster, below a pixel. W-F's render() puts the view on its slot's box snapped to the DPR grid
   * and rounded by three to whole buffer pixels, and the canvas buffer can be a fraction of a pixel smaller than its
   * CSS box times the DPR (the buffer is floored, and the compositor stretches it over the box): together up to about
   * a CSS pixel off the slot, where the poster sits exactly (object-fit: contain in the slot's own box). A view offset
   * (it survives W-F's updateProjectionMatrix) draws the framing's frustum on the slot's true box, in buffer pixels,
   * with that viewport as the window onto it. The predicted viewport matches the one W-F sets (verified in-page).
   */
  private registerToSlot(f: FrameInfo): void {
    const s = this.camSlot;
    const camera = this.camView.camera;
    const r = this.gl.renderer;
    const canvas = r?.domElement as HTMLCanvasElement | undefined;
    if (!s || !s.w || !s.h || !canvas?.width || !f.W || !f.Hc) return;
    const pr = r.getPixelRatio();
    const bx = canvas.width / f.W;
    const by = canvas.height / f.Hc;
    // The viewport W-F's render() will set (src/stage/gl/index.ts), in buffer pixels from the top.
    const snap = (n: number) => Math.round(n * pr) / pr;
    const x = snap(s.cx - s.w / 2 - window.scrollX);
    const top = snap(s.cy - s.h / 2);
    const w = snap(s.w);
    const h = snap(s.h);
    const vx = Math.round(x * pr);
    const vw = Math.round(w * pr);
    const vh = Math.round(h * pr);
    const vy = canvas.height - Math.round((f.Hc - (top - f.anchor) - h) * pr) - vh;
    // The slot's true box in buffer pixels, and the poster inside it (the framing's aspect, contained).
    const tx = (s.cx - s.w / 2 - window.scrollX) * bx;
    const ty = (s.cy - s.h / 2 - f.anchor) * by;
    const tw = s.w * bx;
    const th = s.h * by;
    const A = CAM.bands[this.band ?? 'stacked'].aspect;
    const ch = tw / th > A ? th : tw / A;
    const fullW = ch * (w / h); // the full frustum at the aspect W-F gives the camera, square pixels
    camera.setViewOffset(fullW, ch, vx - (tx + tw / 2 - fullW / 2), vy - (ty + th / 2 - ch / 2), vw, vh);
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

  /** The print at `rel` ms after its shutter press (the sequence's keys, W-D012, all offset from the press). */
  private poseAt(fl: Flight, rel: number): void {
    const T = heroTimeline;
    const ejectStart = T.eject - T.shutter;
    const flightStart = T.flight - T.shutter;
    const dipStart = T.landingDip - T.shutter;
    const p = fl.print;
    p.d = (develop as typeof Develop).developCurve((rel - (T.developStart - T.shutter)) / durations.developHero);
    // Roller tracks while the print passes the rollers, gone 120 ms after the eject ends (fx-playbook section 2, effect 1:
    // heroTimeline.rollerTracksEnd).
    const ejectEnd = ejectStart + durations.eject;
    p.roll = rel < ejectStart ? 0 : 1 - clamp01((rel - ejectEnd) / (T.rollerTracksEnd - T.shutter - ejectEnd));
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
    fl.peakF = Math.max(fl.peakF, f);
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
    if (rel >= dipStart) fl.minSeat = Math.min(fl.minSeat, seat);
    const lift = 1 + 0.02 * seat * t;
    p.pose = { pos, quat, w: MathUtils.lerp(a.w, b.w, f) * lift, h: MathUtils.lerp(a.h, b.h, f) * lift };
    p.shadow = t * (1 - 0.4 * seat);
    // The body clips the print only while part of it is still inside the slot.
    if (p.clip && (f > 0.6 || Math.min(...this.corners(p.pose, false).map((c) => c.y)) > this.exitPos.y + 0.002)) p.clip = false;
  }

  private stepFlight(time: number, dt: number): boolean {
    const fl = this.flying;
    if (!fl || fl.done) return false;
    const rel = time - fl.t0;
    // The landing pose is taken one frame before the flight starts (dt is in seconds), so the layout read never lands
    // in the flight's first frame.
    if (!fl.landing && rel + dt * 1000 >= heroTimeline.flight - heroTimeline.shutter) fl.landing = this.landingPose(fl.intro ? null : fl.still);
    this.poseAt(fl, rel);
    const b = this.printBounds();
    if (b) this.flightLog.push({ t: Math.round(rel + heroTimeline.shutter), x: b.x, y: b.y, w: b.w, h: b.h });
    if (this.flightLog.length > 2000) this.flightLog.splice(0, 500);
    if (rel >= heroTimeline.developed - heroTimeline.shutter) this.handback(fl);
    return true;
  }

  /** The flight's settle and the landing dip, as the frames drew them (W-D030: the log records the motion). */
  private logFlight(fl: Flight, trigger: string, slug: string): void {
    if (fl.peakF <= 0) return;
    const start = fl.t0 - heroTimeline.shutter;
    logMotion({ id: `print:${slug}:flight`, kind: 'flight', spring: 'settle', trigger, t0: Math.round(start + heroTimeline.flight), t1: Math.round(this.time), from: 0, to: 1, peak: fl.peakF, settle2Ms: null, measured: true });
    if (fl.minSeat < 1) logMotion({ id: `print:${slug}:dip`, kind: 'landing', spring: 'detent', trigger, t0: Math.round(start + heroTimeline.landingDip), t1: Math.round(this.time), from: 1, to: 0, peak: fl.minSeat, settle2Ms: null, measured: true });
  }

  /** The DOM still takes the pixels back: it fades in over GL in 120 ms (W-D012), then GL lets go and sleeps. */
  private handback(fl: Flight, cut = false): void {
    if (fl.done) return;
    fl.done = true;
    fl.print.d = 1;
    fl.print.shadow = 1;
    fl.print.roll = 0;
    if (!cut) this.logFlight(fl, fl.intro ? 'intro' : 'shutter', fl.intro ? 'hero-1' : fl.still?.dataset.slug ?? 'print');
    if (fl.still) fl.still.style.opacity = '1';
    if (fl.intro) {
      this.introHooks?.handback();
      this.mark('hero:developed');
    }
    this.hero.querySelector('[data-hero-print]')?.classList.remove('is-gl');
    this.invalidate();
    const release = () => {
      this.letGo();
      if (this.flying === fl) this.flying = null;
      fl.resolve();
    };
    // A guard (and GL going away) cuts to the end state at once; the natural handback crossfades for 120 ms.
    if (cut) release();
    else setTimeout(release, durations.glHandback);
  }

  /** GL lets go of the prints: the effects view hides and data-fx clears. A kept print stays, hidden, unposed. */
  private letGo(): void {
    for (const p of this.prints.splice(0)) {
      if (!this.kept.has(p)) {
        p.dispose(this.fxView.scene);
        continue;
      }
      p.pose = null;
      p.mesh.visible = false;
      p.d = 1;
      p.shadow = 1;
      p.roll = 0;
      p.clip = false;
    }
    this.fxView.visible = false;
    this.hero.removeAttribute('data-fx');
    this.hero.querySelector('[data-hero-print]')?.classList.remove('is-gl');
    this.invalidate();
  }

  /** A print's GL copy of `src` for a shader variant (not yet in the drawn set). */
  private async makePrint(src: string, slug: string, order: number, lite: boolean): Promise<GLPrint> {
    const w = Math.min(1024, Math.max(256, (this.printSlot?.w ?? 300) * this.dpr()));
    const tex = await stillTexture(src, w, w * (PRINT_H / PRINT_W));
    let seed = 0;
    for (let i = 0; i < slug.length; i++) seed = (seed * 31 + slug.charCodeAt(i)) >>> 0;
    // The grain cell is fixed per print: 2 device px at the print's size in its landing slot (D-026).
    const grain = (develop as typeof Develop).grainScale((this.printSlot?.w ?? 300) * this.dpr());
    const p = new GLPrint(this.fxView.scene, tex, lite, (seed % 997) / 997, order, grain);
    this.gl.renderer.initTexture(tex);
    return p;
  }

  private async newPrint(src: string, slug: string, order: number): Promise<GLPrint> {
    const p = await this.makePrint(src, slug, order, tierNow() !== 'full');
    this.prints.push(p);
    return p;
  }

  private print1(): HTMLImageElement | null {
    return this.hero.querySelector<HTMLImageElement>('[data-hero-print] img.hero-still');
  }

  /** Print 1's kept GL copy for a shader variant, made and compiled once (see keepers). */
  private keeper(lite: boolean): Promise<GLPrint | null> {
    const key = lite ? 'lite' : 'full';
    this.keepers[key] ??= (async () => {
      await this.printReady;
      const still = this.print1();
      if (!still || this.gone) return null;
      const slug = this.hero.querySelector<HTMLElement>('[data-hero-print]')?.dataset.slug || 'print-1';
      const p = await this.makePrint(still.getAttribute('src') || '', slug, 10, lite);
      p.el = still;
      const r = this.gl.renderer;
      if (r.compileAsync) await r.compileAsync(this.fxView.scene, this.fxView.camera);
      this.kept.add(p);
      return p;
    })().catch(() => null);
    return this.keepers[key] as Promise<GLPrint | null>;
  }

  /** Draw every kept print once, inside the confirming frame's corner, which is cleared before anything is presented
   *  (a program's first use is when WebKit finishes linking it). Unposed, their corners are all zero: no pixel. */
  private useKeepers(): void {
    const shown = [...this.kept].filter((p) => !p.mesh.visible);
    if (!shown.length) return;
    for (const p of shown) p.mesh.visible = true;
    try {
      this.gl.renderer.render(this.fxView.scene, this.fxView.camera);
    } catch {
      /* a warm-up only: the press compiles instead */
    } finally {
      for (const p of shown) p.mesh.visible = false;
    }
  }

  /** The prints already on the table, drawn by GL at their exact DOM boxes while a new one flies in over them. */
  private async stackPrints(stills: HTMLImageElement[]): Promise<void> {
    let order = 1;
    const lite = tierNow() !== 'full';
    const spare = [...this.kept].find((k) => k.lite === lite && !this.prints.includes(k)) ?? null;
    for (const img of stills) {
      let p: GLPrint;
      if (spare && spare.el === img) {
        p = spare;
        p.mesh.renderOrder = order;
        this.prints.push(p);
      } else p = await this.newPrint(img.currentSrc || img.src, img.dataset.slug || 'print', order);
      order++;
      p.pose = this.landingPose(img.style.translate ? img : null);
    }
  }

  private showFx(): void {
    this.hero.setAttribute('data-fx', '');
    this.fxView.visible = true;
  }

  async printNext(item: QueueItem, addStill: () => HTMLImageElement | null): Promise<void> {
    if (!(await this.ready) || this.flying || this.gone) {
      addStill()?.style.setProperty('opacity', '1');
      return;
    }
    let still: HTMLImageElement | null = null;
    let added = false;
    let print: GLPrint;
    try {
      const stack = [...this.hero.querySelectorAll<HTMLImageElement>('[data-hero-print] img.hero-still')];
      this.showFx();
      await this.stackPrints(stack);
      // The new still exists from the press (hidden), so the flight knows the exact box it lands on.
      still = addStill();
      added = true;
      print = await this.newPrint(item.still, item.slug, 10);
    } catch (e) {
      // A still that cannot be decoded, say: the press ends on its end state at once, and the next one works.
      if (!added) still = addStill();
      if (still) still.style.opacity = '1';
      this.letGo();
      if (!this.gone) console.warn('[hero] the print could not fly; its still is shown', e);
      return;
    }
    if (this.gone) {
      // GL went away while the print was being made.
      if (still) still.style.opacity = '1';
      this.letGo();
      return;
    }
    this.hero.querySelector('[data-hero-print]')?.classList.add('is-gl');
    const t0 = this.time;
    return new Promise<void>((resolve) => {
      this.flying = { print, t0, still, landing: null, done: false, intro: false, peakF: 0, minSeat: 1, resolve };
      this.invalidate();
    });
  }

  // ------------------------------------------------------------ the intro (W-D012, D-024)
  private mark(name: string): void {
    if (manualClock || this.marked.has(name)) return;
    this.marked.add(name);
    this.onMark(name);
  }

  async intro(t0: number, hooks: IntroHooks): Promise<IntroResult> {
    this.introHooks = hooks;
    // Print 1's GL copy (its kept copy, see keepers) is made and compiled while the camera boots, so it never holds
    // T0 back.
    const [ok, print] = await Promise.all([this.ready, this.keeper(tierNow() !== 'full')]);
    const still = this.print1();
    if (!ok || !print || this.gone) return 'failed';
    if (this.introCancelled) return 'done';
    print.mesh.renderOrder = 10;
    if (!this.prints.includes(print)) this.prints.push(print);
    // T0: the later of stage:gl-ready + 200 ms (t0) and now (the camera loaded, patched and compiled). On the manual
    // clock (?t=) T0 is stage time 0, so seek(ms) shows T0 + ms.
    const start = manualClock ? 0 : Math.max(t0, performance.now());
    this.introT0 = start;
    this.drawMs = this.drawingState === 'armed' ? drawingTiming.total : 0;
    return new Promise<IntroResult>((resolve) => {
      this.flying = { print, t0: start + this.drawMs + heroTimeline.shutter, still, landing: null, done: false, intro: true, peakF: 0, minSeat: 1, resolve: () => resolve('done') };
      this.invalidate();
    });
  }

  /** The intro's discrete events at `rel` ms after T0, each once, and the drawing's develop between them. */
  private introEvents(rel: number): void {
    const fire = (key: string, at: number, fn: () => void) => {
      if (rel >= at && !this.introFired.has(key)) {
        this.introFired.add(key);
        fn();
      }
    };
    const seq = this.drawMs;
    fire('t0', 0, () => {
      this.mark('hero:t0');
      if (this.drawingState === 'armed' && this.drawMs) {
        this.drawingState = 'running';
        this.introHooks?.drawingStart(this.time);
        for (const row of drawingPhases(this.time, 'intro')) logMotion(row);
      }
      this.takeCamera();
    });
    if (this.drawingState === 'running') {
      this.drawing?.at(rel);
      if (rel >= seq) this.endDrawing();
    }
    fire('seq', seq, () => {
      this.introHooks?.closeBrackets(this.time);
      this.showFx();
      this.hero.querySelector('[data-hero-print]')?.classList.add('is-gl');
    });
    fire('shutter', seq + heroTimeline.shutter, () => this.press('intro'));
    fire('flash', seq + heroTimeline.flash, () => this.introHooks?.flash(this.time));
    fire('readable', seq + heroTimeline.readable, () => this.mark('hero:readable'));
    // The intro is over once print 1's handback has run.
    if (rel >= seq + heroTimeline.developed + durations.glHandback) this.introT0 = null;
  }

  finishIntro(fadeMs = 0): void {
    this.introCancelled = true;
    if (this.drawingState === 'armed') {
      // Never shown: the camera boots straight to its finished state.
      this.drawing?.finish();
      this.drawingState = 'done';
    } else if (this.drawingState === 'running') {
      this.drawingState = 'fading';
      this.introHooks?.drawingCrossfade(fadeMs);
      this.fade = { from: this.time, ms: fadeMs };
      if (fadeMs <= 0) this.stepFade(this.time);
    }
    this.takeCamera();
    if (this.introT0 === null && !this.flying?.intro) {
      this.invalidate();
      return;
    }
    this.introT0 = null;
    if (this.flying?.intro) this.handback(this.flying, true);
    this.introHooks?.handback();
    this.shutterSpring.set(0);
    this.applyRig();
    this.invalidate();
  }

  /** Hand the camera slot to GL (once its first frame is confirmed): the poster fades out over the canvas (W-D029). */
  private takeCamera(): void {
    if (this.live) return;
    this.ready.then((ok) => {
      if (this.live || !ok || this.gone) return;
      this.live = true;
      this.tail = PRESENT_TAIL;
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

  // ------------------------------------------------------------ GPU bench (tests/w-s1, W-D030 GPU)
  /** The hero's wet moment on the GPU (bench.ts, loaded only when called: a test hook, never on its own). */
  async bench(opts: { warmup?: number; frames?: number } = {}): Promise<Record<string, unknown>> {
    await this.ready;
    const { benchHero } = await import('./bench.ts');
    return benchHero(
      {
        renderer: this.gl.renderer,
        view: this.stageHooks()?.view ?? { W: innerWidth, Hc: innerHeight, dpr: 1 },
        stillSrc: this.print1()?.getAttribute('src') || '',
        lite: tierNow() !== 'full',
        tier: tierNow(),
        develop: develop as typeof Develop,
        stillTexture,
        invalidate: () => this.invalidate(),
      },
      opts,
    );
  }
}

export async function createCamera(gl: GLApi, opts: CameraOptions): Promise<CameraController> {
  const cam = new HeroCamera(gl, opts);
  (window as unknown as { __hero?: HeroCamera }).__hero = cam;
  // Lite, static and reduced: no intro; the camera takes its slot as soon as its first frame is confirmed.
  if (html.dataset.hero !== 'eject') cam.finishIntro(0);
  return cam;
}
