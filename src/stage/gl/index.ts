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
import { containRect } from '../../../scripts/build/posters/stage.js';
import { canvas, collapsed, measureViewport, place, view } from '../rail.ts';
import { demote, getTier, onTier, tierReason } from '../tier.ts';
import { flags, mark, stats } from '../state.ts';
import { guard, invalidate, isInFrame, markDirty, onActive, onBefore, onStep, presentTail, setRender, wake } from '../ticker.ts';
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
  /**
   * A fixed framing aspect (#31), or null. With an aspect the view draws into the contain-fit rectangle of that
   * aspect, centred in the slot in whole buffer pixels (like <img style="object-fit: contain">, W-C13's containRect),
   * and the stage leaves camera.aspect to the owner (applyFraming). Without one the view fills the slot and the stage
   * sets camera.aspect to the slot's every frame.
   */
  readonly aspect: number | null;
  visible: boolean;
  /** The slot's rect in viewport CSS px at the last render. */
  readonly rect: { x: number; y: number; w: number; h: number } | null;
  /** The viewport (and scissor) of the last render, in buffer pixels from the canvas's bottom-left. */
  readonly viewport: { x: number; y: number; w: number; h: number } | null;
  dispose(): void;
}

export interface GLApi {
  renderer: any;
  pageScene: any;
  pageCamera: any;
  rendererName: string;
  probe: ProbeResult | null;
  createStageView(slotId: string, opts?: { fov?: number; aspect?: number }): StageView;
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
/**
 * Frames presented again after a change. WebKit (measured on its Windows build) can present the canvas a frame late:
 * - a re-anchor moves the canvas and keeps presenting for REANCHOR_TAIL frames (represent);
 * - a frame that drew new content presents it again for PRESENT_TAIL frames (presentTail, #61). The perf gate measured
 *   that WebKit needs 1 (round-1 row 13: 0 of 12 wrong colours with 1, 12 of 12 with none); 2 keeps one spare;
 * - a frame that only erased what the canvas showed (its content left) presents the clear for ERASE_TAIL frames, so
 *   WebKit does not keep the old content on screen while the stage sleeps; a clear after a clear starts nothing.
 * Every tail frame is a presented frame: the idle window counts from the last one (Orchestrator ruling on #11,
 * 5992928262).
 */
const REANCHOR_TAIL = 3;
const PRESENT_TAIL = 2;
const ERASE_TAIL = 1;
let represent = 0;
/** The last presented frame drew nothing, so the canvas shows only the clear colour. */
let presentedClear = false;
const lossTimes: number[] = [];

class StageViewImpl implements StageView {
  readonly scene = new Scene();
  readonly camera: any;
  visible = true;
  rect: { x: number; y: number; w: number; h: number } | null = null;
  viewport: { x: number; y: number; w: number; h: number } | null = null;
  constructor(readonly slotId: string, fov: number, readonly aspect: number | null) {
    this.camera = new PerspectiveCamera(fov, aspect ?? 1, 0.01, 1000);
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
    presentedClear = false;
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
function render(sy: number, tailFrame = false): void {
  if (!renderer || lost || dead) return;
  // A collapsed canvas (0 px wide or tall) has nothing to show: no clear, no placement, no present and no tail, so the
  // ticker detaches as usual; the resize that gives it an area back reallocates and re-measures (markDirty).
  if (collapsed()) {
    stats.renderSkips++;
    return;
  }
  // Nothing to draw and the canvas already clear (a page without GL content scrolling under Lenis): skip the clear,
  // the placement and the present. The first frame with content re-anchors and draws as usual. A tail frame never
  // skips: it presents the clear the frame before it drew.
  if (!tailFrame && presentedClear && represent === 0 && !hasContent() && !pageScene.children.some((c: any) => c.visible)) {
    stats.renderSkips++;
    return;
  }
  const before = view.anchor;
  const anchor = place(sy, scrollState.dir);
  // A re-anchor moves the canvas and redraws it in one frame. WebKit (measured on its Windows build) can present the
  // moved canvas with an older buffer for a frame or two, so a re-anchor keeps presenting for PRESENT_TAIL more frames
  // (counted in ticker frames: a layout render in the same frame does not use one up).
  if (anchor !== before && Number.isFinite(anchor)) represent = REANCHOR_TAIL;
  else if (represent > 0 && isInFrame()) represent--;
  if (represent > 0) invalidate();
  const f: FrameInfo = { sy, anchor, W: view.W, H: view.H, Hc: view.Hc };
  renderer.info.reset();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, view.W, view.Hc);
  renderer.clear();
  // One entity that throws is reported and skipped; the others still draw this frame. Each draw runs guarded too: a
  // throw from a three hook inside one render (onBeforeRender, onBeforeCompile) loses that scene or view for this
  // frame only, and the page scene, the other views, the stats and the tail still run.
  for (const e of entities.values()) guard(() => e.place(f), undefined);
  updatePageCamera(sy, anchor);
  if (pageScene.children.some((c: any) => c.visible)) guard(() => renderer.render(pageScene, pageCamera), undefined);
  for (const v of views) {
    const s = getSlot(v.slotId);
    v.rect = null;
    v.viewport = null;
    if (!v.visible || !s || !s.near || !s.w || !s.h) continue;
    // Snap the slot to buffer pixels in document space (view.dpr is on the canvas grid, rail.ts gridDpr), so the
    // scissored view lands on the same pixels at every scroll position: the anchor is on the grid, so this never jitters.
    const snap = (n: number) => Math.round(n * view.dpr) / view.dpr;
    const x = snap(s.cx - s.w / 2 - window.scrollX);
    const top = snap(s.cy - s.h / 2);
    const w = snap(s.w);
    const h = snap(s.h);
    const yCanvas = top - anchor;
    v.rect = { x, y: top - sy, w, h };
    if (yCanvas + h <= 0 || yCanvas >= view.Hc) continue;
    const yGl = view.Hc - yCanvas - h;
    // The viewport in buffer pixels (bottom-left origin). With a fixed aspect (#31): the contain-fit rectangle of that
    // aspect, centred in the slot's buffer box, the way W-C13's posters frame it (containRect, whole pixels).
    const B = { x: Math.round(x * view.dpr), y: Math.round(yGl * view.dpr), w: Math.round(w * view.dpr), h: Math.round(h * view.dpr) };
    let vp = B;
    if (v.aspect) {
      const c = containRect(B.w, B.h, v.aspect);
      vp = { x: B.x + c.x, y: B.y + (B.h - c.y - c.height), w: c.width, h: c.height };
    } else {
      v.camera.aspect = w / h;
      v.camera.updateProjectionMatrix();
    }
    v.viewport = vp;
    // three takes CSS px and multiplies by its pixel ratio (view.dpr) before rounding: these land on vp exactly.
    const k = 1 / view.dpr;
    renderer.setViewport(vp.x * k, vp.y * k, vp.w * k, vp.h * k);
    renderer.setScissor(vp.x * k, vp.y * k, vp.w * k, vp.h * k);
    renderer.setScissorTest(true);
    guard(() => renderer.render(v.scene, v.camera), undefined);
  }
  renderer.setScissorTest(false);
  const drew = renderer.info.render.calls > 0;
  const erased = !drew && !presentedClear;
  presentedClear = !drew;
  stats.draws++;
  stats.drawCalls += renderer.info.render.calls;
  // Present a frame that drew something new again for a few frames, and the clear of one that erased content once (#61).
  if (!tailFrame && drew && !flags.noTail) presentTail(PRESENT_TAIL);
  else if (!tailFrame && erased && !flags.noEraseTail) presentTail(ERASE_TAIL);
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
  presentedClear = false;
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
    const aspect = opts.aspect !== undefined && Number.isFinite(opts.aspect) && opts.aspect > 0 ? opts.aspect : null;
    const v = new StageViewImpl(slotId, opts.fov ?? stageTokens.fovDeg, aspect);
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
  // The context first, with the attributes three would ask for: where WebGL2 exists but no context can be made
  // (Chromium --disable-3d-apis, a blocklisted GPU), three's constructor logs console errors before it throws, so it
  // only ever gets a context that exists. The head script (Base.astro) has usually found this before first paint
  // (#61); this covers ?tier= overrides and a context that fails later than the head's probe.
  const attrs: WebGLContextAttributes = { alpha: true, depth: true, stencil: false, antialias: tier === 'full', premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false };
  let context: WebGL2RenderingContext | null = null;
  try {
    context = canvas.getContext('webgl2', attrs);
  } catch {
    context = null;
  }
  if (!context) {
    // Later full loads in this session start static before first paint (the head script reads this).
    try {
      sessionStorage.setItem('ion.webgl2', '0');
    } catch {
      /* storage blocked: the head script probes again */
    }
    demote('static', 'no-webgl2');
    return null;
  }
  try {
    renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: tier === 'full', powerPreference: 'high-performance', stencil: false });
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
    for (const e of entities.values()) if (guard(() => Boolean(e.step?.(dt, time)), false)) moving = true;
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
