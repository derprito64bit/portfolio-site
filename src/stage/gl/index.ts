// The GL chunk (W-D013, W-D017, W-D034). Loaded by boot.ts after first paint (full) or on intent (lite).
// - One WebGLRenderer on the riding canvas; the context lives for the whole visit, across every Swup swap.
// - Prints use the page camera: 1 GL unit = 1 CSS px at z = 0, setViewOffset to the canvas window.
// - Objects use stage-local scissored views over their slot with their own camera (FOV 28, one pose per band),
//   so their pose never depends on viewport size or scroll.
// - Entities are keyed by data-gl-id; persistent ones survive swaps and rebind to the slot with the same id.
// - anime.js runs on our ticker (useDefaultMainLoop false), so the ticker stays the only rAF caller.
import { PerspectiveCamera, Scene, WebGLRenderer, MathUtils } from 'three';
import { engine } from 'animejs/engine';
import { stage as stageTokens } from '../../lib/tokens.js';
import { canvas, measureViewport, place, view } from '../rail.ts';
import { demote, getTier, onTier, tierReason } from '../tier.ts';
import { flags, mark, stats } from '../state.ts';
import { invalidate, markDirty, onActive, onBefore, onStep, setRender, wake } from '../ticker.ts';
import { allSlots, getSlot, giveAll, onScan, onUnscan, type Slot } from '../slots.ts';
import { scrollState } from '../scroll.ts';
import { onMotion } from '../motion.ts';
import { runProbe, type ProbeResult } from './probe.ts';

export interface FrameInfo {
  sy: number;
  anchor: number;
  W: number;
  H: number;
  Hc: number;
}

/** A GL thing bound to a slot. Crews register factories; the stage owns the lifecycle. */
export interface Entity {
  readonly id: string;
  /** Survives a swap and rebinds to the next slot with the same id (lift-and-dock). */
  readonly persistent: boolean;
  bind(slot: Slot): void;
  unbind(): void;
  /** Advance; return true while still moving. */
  step?(dt: number, time: number): boolean;
  /** Pose scene objects for this frame. */
  place(f: FrameInfo): void;
  /** Anything to draw right now? */
  visible(): boolean;
  dispose(): void;
  /** After a context restore: re-upload what the GPU lost. */
  restore?(): void;
  /** End any motion at once (reduced motion turned on). */
  snap?(): void;
  /** Projected bounds in viewport CSS px, for __stage.bounds. */
  bounds?(): { x: number; y: number; w: number; h: number; angleDeg: number } | null;
}
export interface EntityFactory {
  match(slot: Slot): boolean;
  create(slot: Slot, gl: GLApi): Entity;
}

/** A scissored sub-viewport over one slot, with its own scene and camera. */
export interface StageView {
  readonly slotId: string;
  readonly scene: any;
  readonly camera: any;
  visible: boolean;
  /** The slot's rect in viewport CSS px at the last render. */
  readonly rect: { x: number; y: number; w: number; h: number } | null;
  dispose(): void;
}

export interface GLApi {
  renderer: any;
  pageScene: any;
  pageCamera: any;
  rendererName: string;
  probe: ProbeResult | null;
  createStageView(slotId: string, opts?: { fov?: number }): StageView;
  registerEntityFactory(f: EntityFactory): void;
  entity(id: string): Entity | undefined;
  info(): { geometries: number; textures: number; programs: number; entities: number; views: number };
  forceContextLoss(): void;
  forceContextRestore(): void;
}

let renderer: any = null;
const pageScene = new Scene();
const pageCamera = new PerspectiveCamera(30, 1, 1, 10000);
const entities = new Map<string, Entity>();
const factories: EntityFactory[] = [];
const views = new Set<StageViewImpl>();
let lost = false;
let dead = false;
let represent = 0;
const lossTimes: number[] = [];

class StageViewImpl implements StageView {
  readonly scene = new Scene();
  readonly camera: any;
  visible = true;
  rect: { x: number; y: number; w: number; h: number } | null = null;
  constructor(readonly slotId: string, fov: number) {
    this.camera = new PerspectiveCamera(fov, 1, 0.01, 1000);
  }
  dispose(): void {
    views.delete(this);
    invalidate();
  }
}

function rendererName(gl: WebGL2RenderingContext): string {
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
}

const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- sizing and the page camera
function resize(): void {
  if (!renderer) return;
  const kind = measureViewport();
  if (kind === 'realloc') {
    renderer.setPixelRatio(view.dpr);
    renderer.setSize(view.W, view.Hc, false);
    markDirty();
  } else if (kind === 'height') {
    // On a coarse pointer a height-only change is the toolbar: layouts use svh and lvh, so slots stay put and are
    // not re-measured (W-D013). On a fine pointer it is a real resize, and vh-based layout may move the slots.
    if (matchMedia('(pointer: coarse)').matches) invalidate();
    else markDirty();
  }
}

/** 1 unit = 1 CSS px at z = 0, the frame centred on the viewport, the canvas a window of it (no 3D pop on flips). */
function updatePageCamera(sy: number, anchor: number): void {
  const Z = view.H / 2 / Math.tan(MathUtils.degToRad(15));
  const extra = Math.max(0, view.Hc - (view.H + view.O));
  const half = view.H / 2 + view.O + extra;
  const fullH = half * 2;
  pageCamera.position.set(0, 0, Z);
  pageCamera.near = Z * 0.2;
  pageCamera.far = Z * 3;
  pageCamera.fov = 2 * MathUtils.radToDeg(Math.atan(half / Z));
  pageCamera.aspect = view.W / fullH;
  const offY = anchor - sy - (view.H / 2 - half);
  pageCamera.setViewOffset(view.W, fullH, 0, offY, view.W, view.Hc);
  pageCamera.updateProjectionMatrix();
}

function hasContent(): boolean {
  for (const e of entities.values()) if (e.visible()) return true;
  for (const v of views) if (v.visible && getSlot(v.slotId)?.near) return true;
  return false;
}

// ---------------------------------------------------------------- the frame
function render(sy: number): void {
  if (!renderer || lost || dead) return;
  const before = view.anchor;
  const anchor = place(sy, scrollState.dir);
  // A re-anchor moves the canvas and redraws it in one frame. WebKit (measured on its Windows build) can present the
  // moved canvas with an older buffer for a frame or two, so a re-anchor keeps presenting for 3 more frames.
  if (anchor !== before) represent = 3;
  else if (represent > 0) represent--;
  if (represent > 0) invalidate();
  const f: FrameInfo = { sy, anchor, W: view.W, H: view.H, Hc: view.Hc };
  renderer.info.reset();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, view.W, view.Hc);
  renderer.clear();
  for (const e of entities.values()) e.place(f);
  updatePageCamera(sy, anchor);
  if (pageScene.children.some((c: any) => c.visible)) renderer.render(pageScene, pageCamera);
  for (const v of views) {
    const s = getSlot(v.slotId);
    v.rect = null;
    if (!v.visible || !s || !s.near || !s.w || !s.h) continue;
    // Snap the slot to device pixels in document space (as the browser paints its box), so the scissored view
    // lands on the same pixels at every scroll position: the anchor is device-aligned, so this never jitters.
    const snap = (n: number) => Math.round(n * view.dpr) / view.dpr;
    const x = snap(s.cx - s.w / 2 - window.scrollX);
    const top = snap(s.cy - s.h / 2);
    const w = snap(s.w);
    const h = snap(s.h);
    const yCanvas = top - anchor;
    v.rect = { x, y: top - sy, w, h };
    if (yCanvas + h <= 0 || yCanvas >= view.Hc) continue;
    const yGl = view.Hc - yCanvas - h;
    v.camera.aspect = w / h;
    v.camera.updateProjectionMatrix();
    renderer.setViewport(x, yGl, w, h);
    renderer.setScissor(x, yGl, w, h);
    renderer.setScissorTest(true);
    renderer.render(v.scene, v.camera);
  }
  renderer.setScissorTest(false);
  stats.draws++;
  stats.drawCalls += renderer.info.render.calls;
}

// ---------------------------------------------------------------- entities
function bindSlot(s: Slot): void {
  let e = entities.get(s.id);
  if (!e) {
    const f = factories.find((x) => x.match(s));
    if (!f) return;
    e = f.create(s, api);
    entities.set(s.id, e);
  }
  e.bind(s);
  invalidate();
}
function unbindSlots(gone: Slot[]): void {
  for (const s of gone) {
    const e = entities.get(s.id);
    if (!e) continue;
    e.unbind();
    if (!e.persistent) {
      e.dispose();
      entities.delete(s.id);
    }
  }
}

// ---------------------------------------------------------------- context loss (W-D017)
function onLost(e: Event): void {
  e.preventDefault();
  lost = true;
  stats.losses++;
  giveAll(); // the page is whole again within this frame
  const t = performance.now();
  lossTimes.push(t);
  if (lossTimes.filter((x) => t - x < 60000).length >= 2) {
    demote('static', 'context-loss');
  }
}
function onRestored(): void {
  if (dead || getTier() === 'static') return;
  lost = false;
  stats.restores++;
  for (const e of entities.values()) e.restore?.();
  resize();
  markDirty();
}

function teardown(): void {
  if (dead) return;
  dead = true;
  giveAll();
  setRender(null);
  for (const e of entities.values()) e.dispose();
  entities.clear();
  views.clear();
  renderer?.dispose();
}

// ---------------------------------------------------------------- anime.js on our ticker
interface AnimeTickable {
  _next?: AnimeTickable;
  complete?: () => void;
}
function animeHead(): AnimeTickable | undefined {
  return (engine as unknown as { _head?: AnimeTickable })._head;
}
function wireAnime(): void {
  engine.useDefaultMainLoop = false;
  // anime calls engine.wake() whenever something starts playing; route it to our ticker.
  (engine as unknown as { wake: () => unknown }).wake = () => {
    wake();
    return engine;
  };
  onBefore(() => engine.update());
  onActive(() => Boolean(animeHead()));
}
/** Reduced motion: every anime timeline jumps to its end. */
function completeAnime(): void {
  for (let t = animeHead(); t; t = t._next) t.complete?.();
}

// ---------------------------------------------------------------- the API crews use
let probeResult: ProbeResult | null = null;
let name = '';
const api: GLApi = {
  get renderer() {
    return renderer;
  },
  pageScene,
  pageCamera,
  get rendererName() {
    return name;
  },
  get probe() {
    return probeResult;
  },
  createStageView(slotId, opts = {}) {
    const v = new StageViewImpl(slotId, opts.fov ?? stageTokens.fovDeg);
    views.add(v);
    invalidate();
    return v;
  },
  registerEntityFactory(f) {
    factories.push(f);
    for (const s of allSlots()) if (!entities.has(s.id) && f.match(s)) bindSlot(s);
  },
  entity: (id) => entities.get(id),
  info: () => ({
    geometries: renderer?.info.memory.geometries ?? 0,
    textures: renderer?.info.memory.textures ?? 0,
    programs: renderer?.info.programs?.length ?? 0,
    entities: entities.size,
    views: views.size,
  }),
  forceContextLoss: () => renderer?.forceContextLoss(),
  forceContextRestore: () => renderer?.forceContextRestore(),
};

export async function boot(): Promise<GLApi | null> {
  const tier = getTier();
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: tier === 'full', powerPreference: 'high-performance', stencil: false });
  } catch {
    demote('static', 'no-webgl2');
    return null;
  }
  const gl = renderer.getContext();
  if (typeof WebGL2RenderingContext === 'undefined' || !(gl instanceof WebGL2RenderingContext)) {
    renderer.dispose();
    demote('static', 'no-webgl2');
    return null;
  }
  name = rendererName(gl);
  mark('stage:renderer', name);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.info.autoReset = false;
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  resize();
  await nextTask();

  // The boot probe (W-D017): full needs 3 wet hero-size prints at <= 8 ms median, else lite.
  if (tier === 'full' && !new URLSearchParams(location.search).has('tier')) {
    probeResult = await runProbe(renderer, view);
    if (!probeResult.pass) demote('lite', 'probe');
    resize();
    await nextTask();
  }
  if (getTier() === 'static') {
    teardown();
    return null;
  }

  wireAnime();
  onScan((found) => found.forEach(bindSlot));
  onUnscan(unbindSlots);
  onStep(() => scrollState.moved && hasContent());
  onStep((dt, time) => {
    let moving = false;
    for (const e of entities.values()) if (e.step?.(dt, time)) moving = true;
    return moving;
  });
  onTier((t) => {
    if (t === 'static') teardown();
    else resize();
  });
  onMotion((m) => {
    if (m !== 'reduced') return;
    completeAnime();
    for (const e of entities.values()) e.snap?.();
  });
  addEventListener('resize', resize, { passive: true });
  const watchDpr = () => {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => {
      resize();
      watchDpr();
    }, { once: true });
  };
  watchDpr();
  addEventListener('scroll', () => {
    if (hasContent()) wake();
  }, { passive: true });
  setRender(render);

  // Test fixtures and the GPU bench load only on the pages that ask for them (/bench/).
  if (document.querySelector('[data-gl-fixture]') || flags.debug) (await import('./fixtures.ts')).install(api);
  if (document.querySelector('[data-bench]')) (await import('./bench.ts')).install(api);
  for (const s of allSlots()) bindSlot(s);

  mark('stage:tier', `${getTier()}:${tierReason()}`);
  mark('stage:gl-ready');
  invalidate();
  return api;
}
