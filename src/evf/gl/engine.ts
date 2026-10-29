// The one canvas (OGL, WebGL2). The scene pass renders the current frame's procedural scene into a render target; the
// composite pass places it in the EVF frame rect with exposure grade, film simulation, sensor noise and peaking; the
// eyepiece pass carries the intro snapshot through the raise. A 64 x 40 readback feeds the histogram and the meter.
// Under ?vf-test (D-055) `stats` counts the draws of each pass and the frames that reached the screen (./stats.ts).
import { Renderer, Program, Mesh, Triangle, Texture, RenderTarget } from 'ogl';
import { fullscreenVert, sceneFrag, compositeFrag, eyepieceFrag } from './shaders';
import type { Scene } from '../scenes';
import { newCounts, type FrameCounts } from './stats';

export interface Rect { x: number; y: number; w: number; h: number }

export interface FrameState {
  rect: Rect;
  focus: number; aperture: number; exposure: number; zoom: number; zcx: number; zcy: number; dolly: number;
  parx: number; pary: number; roll: number; tilt: number;
  peak: number; ca: number; smear: number; vig: number; alpha: number; radius: number; zebra: number; nd: number;
  simA: number; simB: number; simT: number; noise: number; mix: number;
  eyeOn: boolean; eyeP: number; eyeCx: number; eyeCy: number;
  dim: number; poolX: number; poolY: number; poolR: number; poolAmt: number; rim: number; ndv: number;
}

export interface Meter { hist: Float32Array; ev: number; clip: boolean }

const PEAK_COL = [1.0, 0.694, 0.231];

export class Engine {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  gl: any;
  st: FrameState;
  scene: Scene | null = null;
  quality = 1;
  dprCap = 1.5;
  sway = true;
  /** 1 while the visitor's hand is still: the frame breathes (bokeh) and the focus drifts a little. */
  idleTarget = 0;
  private idleAmt = 0;
  onMeter: ((m: Meter) => void) | null = null;
  private pScene!: Program; private pComp!: Program; private pEye!: Program;
  private mScene!: Mesh; private mComp!: Mesh; private mEye!: Mesh;
  private rtCur!: RenderTarget; private rtPrev!: RenderTarget; private rtSmall!: RenderTarget;
  private snapTex!: Texture;
  private uS: number[] = new Array(70 * 4).fill(0);
  private uL: number[] = new Array(48 * 4).fill(0);
  private hotUntil = 0;
  private last = 0;
  private meterWanted = 0;
  private lastMeter = 0;
  private frameTimes: number[] = [];
  private raf = 0;
  private t0 = performance.now();
  private swayX = 0; private swayY = 0; private swayR = 0;
  private pixels = new Uint8Array(64 * 40 * 4);
  private pendingRead = false;
  private used = { w: 1, h: 1 };
  ok = false;
  /** The frame counters: an object only under ?vf-test, else null (no counting work). */
  readonly stats: FrameCounts | null;

  constructor(canvas: HTMLCanvasElement, opts: { stats?: boolean } = {}) {
    this.canvas = canvas;
    this.stats = opts.stats ? newCounts() : null;
    this.st = {
      rect: { x: 0, y: 0, w: 1, h: 1 }, focus: 0.4, aperture: 0.7, exposure: 1, zoom: 1, zcx: 0, zcy: 0, dolly: 0,
      parx: 0, pary: 0, roll: 0, tilt: 0, peak: 0, ca: 0, smear: 0, vig: 0.28, alpha: 0, radius: 2, zebra: 0, nd: 0,
      simA: 0, simB: 0, simT: 0, noise: 0.02, mix: 1, eyeOn: false, eyeP: 0, eyeCx: 0, eyeCy: 0,
      dim: 1, poolX: 0, poolY: 0, poolR: 110, poolAmt: 0, rim: 0, ndv: 0,
    };
    this.renderer = new Renderer({ canvas, webgl: 2, alpha: true, premultipliedAlpha: true, antialias: false, depth: false, dpr: 1, powerPreference: 'high-performance' } as any);
    this.gl = this.renderer.gl;
    if (!this.gl || !(this.gl instanceof WebGL2RenderingContext)) throw new Error('WebGL2 unavailable');
  }

  private sceneUniforms: any;
  private pScenes: (Program | null)[] = [null, null, null];
  private mScenes: (Mesh | null)[] = [null, null, null];
  private tri!: Triangle;
  private pending: Promise<void>[] = [];

  /**
   * Links a program off the main thread when KHR_parallel_shader_compile exists (polled once a frame), so the
   * preloader keeps moving while the GPU compiles; OGL then links the same sources from the driver's program cache.
   */
  private async prewarm(frag: string) {
    const gl = this.gl;
    const ext = gl.getExtension('KHR_parallel_shader_compile');
    if (!ext) return;
    const vs = gl.createShader(gl.VERTEX_SHADER), fs = gl.createShader(gl.FRAGMENT_SHADER), p = gl.createProgram();
    gl.shaderSource(vs, fullscreenVert); gl.compileShader(vs);
    gl.shaderSource(fs, frag); gl.compileShader(fs);
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    const t0 = performance.now();
    while (!gl.getProgramParameter(p, ext.COMPLETION_STATUS_KHR) && performance.now() - t0 < 8000) {
      await new Promise((r) => requestAnimationFrame(r));
    }
    gl.deleteProgram(p); gl.deleteShader(vs); gl.deleteShader(fs);
  }

  private common() { return { vertex: fullscreenVert, depthTest: false, depthWrite: false, cullFace: false } as any; }

  private buildScene(kind: number) {
    if (this.pScenes[kind]) return;
    const p = new Program(this.gl, { ...this.common(), fragment: sceneFrag(kind), uniforms: this.sceneUniforms });
    this.check(p, `scene ${kind}`);
    this.pScenes[kind] = p;
    this.mScenes[kind] = new Mesh(this.gl, { geometry: this.tri, program: p });
  }

  /** Compiles the programs the first minute needs; each step is reported so the preloader shows real progress. */
  async compile(step: (name: string) => void) {
    const gl = this.gl;
    this.tri = new Triangle(gl);
    this.sceneUniforms = {
      uS: { value: this.uS }, uL: { value: this.uL }, uNS: { value: 0 }, uNB: { value: 0 },
      uBackTop: { value: [0, 0, 0] }, uBackBottom: { value: [0, 0, 0] }, uKeyColor: { value: [0, 0, 0] }, uHaze: { value: [0, 0, 0] },
      uKey: { value: [0, 0, 1, 0] }, uG: { value: [0, 0, 0, 0] }, uG2: { value: [0, 0, 0, 0] }, uKind: { value: 0 },
      uAspect: { value: 1.5 }, uFocus: { value: 0.4 }, uAperture: { value: 0.7 }, uExposure: { value: 1 }, uZoom: { value: 1 },
      uDolly: { value: 0 }, uTime: { value: 0 }, uPx: { value: 0.002 }, uRoll: { value: 0 }, uTilt: { value: 0 },
      uZC: { value: [0, 0] }, uPar: { value: [0, 0] }, uBreath: { value: 0 },
    };
    await Promise.all([this.prewarm(sceneFrag(0)), this.prewarm(compositeFrag), this.prewarm(eyepieceFrag)]);
    this.buildScene(0);
    this.pScene = this.pScenes[0]!; this.mScene = this.mScenes[0]!;
    step('scene shader');
    this.rtCur = this.makeRT(); this.rtPrev = this.makeRT();
    this.rtSmall = new RenderTarget(gl, { width: 64, height: 40, depth: false });
    this.pComp = new Program(gl, {
      ...this.common(), fragment: compositeFrag, transparent: false,
      uniforms: {
        tCur: { value: this.rtCur.texture }, tPrev: { value: this.rtPrev.texture },
        uRect: { value: [0, 0, 1, 1] }, uRes: { value: [1, 1] }, uFrac: { value: [1, 1] }, uMix: { value: 1 },
        uSimA: { value: 0 }, uSimB: { value: 0 }, uSimT: { value: 0 }, uNoise: { value: 0 }, uTime: { value: 0 },
        uPeak: { value: 0 }, uCA: { value: 0 }, uSmear: { value: 0 }, uVig: { value: 0 }, uAlpha: { value: 0 },
        uRadius: { value: 0 }, uZebra: { value: 0 }, uND: { value: 0 }, uPeakCol: { value: PEAK_COL },
        uDim: { value: 1 }, uPool: { value: [0, 0, 100] }, uPoolAmt: { value: 0 }, uRim: { value: 0 }, uDpr: { value: 1 }, uNDV: { value: 0 },
      },
    });
    this.check(this.pComp, 'composite');
    step('composite shader');
    this.snapTex = new Texture(gl, { generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR, width: 2, height: 2 });
    this.pEye = new Program(gl, {
      ...this.common(), fragment: eyepieceFrag,
      uniforms: { tSnap: { value: this.snapTex }, tScene: { value: this.rtCur.texture }, uFrac: { value: [1, 1] }, uDim: { value: 1 }, uP: { value: 0 }, uAspect: { value: 1.6 }, uPhase: { value: 0 }, uC: { value: [0, 0] } },
    });
    this.check(this.pEye, 'eyepiece');
    step('eyepiece shader');
    this.mComp = new Mesh(gl, { geometry: this.tri, program: this.pComp });
    this.mEye = new Mesh(gl, { geometry: this.tri, program: this.pEye });
    this.ok = true;
    // the honours' glass and medal programs compile in the background, after the first minute is ready
    for (const k of [1, 2]) this.pending.push(this.prewarm(sceneFrag(k)).then(() => { this.buildScene(k); }));
  }

  private check(p: Program, name: string) {
    if (!this.gl.getProgramParameter((p as any).program, this.gl.LINK_STATUS)) throw new Error(`shader ${name} failed`);
  }

  private makeRT() {
    const { w, h } = this.rtSize();
    return new RenderTarget(this.gl, { width: w, height: h, depth: false, minFilter: this.gl.LINEAR });
  }

  private rtSize() {
    const d = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.quality;
    return { w: Math.max(2, Math.ceil(window.innerWidth * d)), h: Math.max(2, Math.ceil(window.innerHeight * d)) };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.dpr = 1;
    this.renderer.setSize(Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr));
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    if (this.ok) {
      const { w, h } = this.rtSize();
      this.rtCur.setSize(w, h); this.rtPrev.setSize(w, h);
    }
    this.invalidate(200);
  }

  /** Device pixel ratio of the canvas backing store. */
  get cdpr() { return this.canvas.width / Math.max(1, window.innerWidth); }

  setScene(s: Scene) {
    this.scene = s;
    for (let i = 0; i < this.uS.length; i++) this.uS[i] = s.shapes[i] ?? 0;
    for (let i = 0; i < this.uL.length; i++) this.uL[i] = s.lights[i] ?? 0;
    this.buildScene(s.kind);
    this.pScene = this.pScenes[s.kind]!; this.mScene = this.mScenes[s.kind]!;
    const u = this.sceneUniforms;
    u.uNS.value = s.ns; u.uNB.value = s.nb;
    u.uBackTop.value = s.backTop; u.uBackBottom.value = s.backBottom; u.uKeyColor.value = s.keyColor; u.uHaze.value = s.haze;
    u.uKey.value = s.key; u.uG.value = s.glass; u.uG2.value = s.glass2; u.uKind.value = s.kind;
    this.invalidate(300);
    this.wantMeter();
  }

  /** Moves the current image into the "previous" slot, for crossfades (calm path, mode changes). */
  holdPrevious() {
    [this.rtCur, this.rtPrev] = [this.rtPrev, this.rtCur];
    this.pComp.uniforms.tCur.value = this.rtCur.texture;
    this.pComp.uniforms.tPrev.value = this.rtPrev.texture;
  }

  setSnapshot(c: HTMLCanvasElement) {
    this.snapTex.image = c;
    this.snapTex.needsUpdate = true;
  }

  invalidate(ms = 120) {
    this.hotUntil = Math.max(this.hotUntil, performance.now() + ms);
    if (!this.raf && !document.hidden) this.raf = requestAnimationFrame(this.tick);
  }

  wantMeter() { this.meterWanted = performance.now() + 900; this.invalidate(500); }

  start() {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.invalidate(100); });
    this.invalidate(400);
  }

  private tick = (now: number) => {
    this.raf = 0;
    if (document.hidden) return;
    const hot = now < this.hotUntil;
    const idleLive = this.sway && this.st.alpha > 0 && !this.st.eyeOn && !document.hidden;
    const interval = hot ? 0 : idleLive ? 1000 / 30 - 2 : Infinity;
    if (now - this.last >= interval) {
      const dt = this.last ? now - this.last : 16;
      this.last = now;
      if (hot) this.adapt(dt);
      this.draw(now);
    }
    if (hot || idleLive) this.raf = requestAnimationFrame(this.tick);
  };

  private adapt(dt: number) {
    if (dt > 60) return; // a stall (tab switch, screenshot, GC) is not GPU cost
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const med = [...this.frameTimes].sort((a, b) => a - b)[45];
    this.frameTimes.length = 0;
    const q = this.quality;
    if (med > 22 && q > 0.56) this.quality = Math.max(0.55, q - 0.15);
    else if (med < 13 && q < 1) this.quality = Math.min(1, q + 0.15);
    if (q !== this.quality) {
      const { w, h } = this.rtSize();
      this.rtCur.setSize(w, h); this.rtPrev.setSize(w, h);
    }
  }

  private draw(now: number) {
    const gl = this.gl;
    const st = this.st;
    const t = (now - this.t0) / 1000;
    const W = this.canvas.width, H = this.canvas.height;
    const cd = this.cdpr;
    if (this.stats) this.stats.frames++;
    this.renderer.bindFramebuffer();
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.collect();
    this.renderer.bindFramebuffer();
    gl.viewport(0, 0, W, H);
    this.idleAmt += (this.idleTarget - this.idleAmt) * 0.04;
    if (st.eyeOn) {
      if (this.scene) this.renderScene(t);
      this.renderer.bindFramebuffer();
      gl.viewport(0, 0, W, H);
      const u = this.pEye.uniforms;
      u.uP.value = st.eyeP; u.uAspect.value = W / H; u.uPhase.value = 0; u.uC.value = [st.eyeCx, st.eyeCy];
      u.tScene.value = this.rtCur.texture; u.uFrac.value = [this.used.w / this.rtCur.width, this.used.h / this.rtCur.height]; u.uDim.value = this.scene ? st.dim : 0;
      this.mEye.draw();
      if (this.stats) this.stats.eyepiece++;
      return;
    }
    if (st.alpha <= 0 || !this.scene) return;
    // hand-held sway: the image through a viewfinder is never perfectly still
    if (this.sway) {
      this.swayX = Math.sin(t * 0.63) * 0.004 + Math.sin(t * 1.71 + 1.3) * 0.0016;
      this.swayY = Math.sin(t * 0.47 + 2.1) * 0.003 + Math.sin(t * 1.37) * 0.0012;
      this.swayR = Math.sin(t * 0.39 + 0.7) * 0.0022;
    } else { this.swayX = this.swayY = this.swayR = 0; }
    this.renderScene(t);
    const u = this.pComp.uniforms;
    const r = st.rect;
    u.uRect.value = [r.x * cd, r.y * cd, r.w * cd, r.h * cd];
    u.uRes.value = [W, H];
    this.setCompCommon(u, t);
    u.uPeak.value = st.peak; u.uNoise.value = this.sway ? st.noise : 0; u.uAlpha.value = st.alpha;
    u.uRadius.value = st.radius * cd; u.uND.value = st.nd; u.uZebra.value = st.zebra;
    u.uDim.value = st.dim; u.uPool.value = [st.poolX * cd, st.poolY * cd, st.poolR * cd]; u.uPoolAmt.value = st.poolAmt;
    u.uRim.value = st.rim; u.uDpr.value = cd; u.uNDV.value = st.ndv;
    this.renderer.bindFramebuffer();
    gl.viewport(0, 0, W, H);
    this.mComp.draw();
    if (this.stats) this.stats.composite++;
    if (now < this.meterWanted && now - this.lastMeter > 110 && !this.pendingRead) { this.lastMeter = now; this.measure(t); }
  }

  private setCompCommon(u: any, t: number) {
    const st = this.st;
    u.uFrac.value = [this.used.w / this.rtCur.width, this.used.h / this.rtCur.height];
    u.uMix.value = st.mix; u.uSimA.value = st.simA; u.uSimB.value = st.simB; u.uSimT.value = st.simT;
    u.uTime.value = t; u.uCA.value = st.ca; u.uSmear.value = st.smear; u.uVig.value = st.vig;
  }

  private renderScene(t: number) {
    const st = this.st;
    const s = this.scene!;
    const d = Math.min(window.devicePixelRatio || 1, this.dprCap) * this.quality;
    const w = Math.max(2, Math.min(this.rtCur.width, Math.round(st.rect.w * d)));
    const h = Math.max(2, Math.min(this.rtCur.height, Math.round(st.rect.h * d)));
    this.used = { w, h };
    const aspect = st.rect.w / Math.max(1, st.rect.h);
    const hy = aspect >= 1 ? 1 : 1 / aspect;
    const u = this.pScene.uniforms;
    const drift = this.sway ? 0.016 * this.idleAmt * Math.sin(t * 0.5) : 0;
    u.uBreath.value = this.sway ? this.idleAmt : 0;
    u.uAspect.value = aspect; u.uFocus.value = st.focus + drift; u.uAperture.value = st.aperture; u.uExposure.value = st.exposure;
    u.uZoom.value = st.zoom; u.uDolly.value = st.dolly; u.uTime.value = this.sway ? t : 0; u.uPx.value = (2 * hy) / h / st.zoom;
    u.uRoll.value = st.roll + this.swayR; u.uTilt.value = st.tilt;
    u.uZC.value = [st.zcx, st.zcy]; u.uPar.value = [st.parx + this.swayX, st.pary + this.swayY];
    void s;
    this.renderer.bindFramebuffer(this.rtCur);
    this.gl.viewport(0, 0, w, h);
    this.mScene.draw();
    if (this.stats) this.stats.scene++;
  }

  /** Mean displayed luminance (0..1) around a point of the last readback (fractions of the frame, y down). */
  lumAt(fx: number, fy: number) {
    const px = this.pixels;
    const cx = Math.round(fx * 63), cy = Math.round((1 - fy) * 39);
    let sum = 0, n = 0;
    for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      if (x < 0 || y < 0 || x > 63 || y > 39) continue;
      const i = (y * 64 + x) * 4;
      sum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255; n++;
    }
    return n ? sum / n : 0;
  }

  /** Renders the graded frame at 64 x 40 and reads it back: the histogram and the meter are the real image. */
  private measure(t: number) {
    const gl = this.gl;
    const u = this.pComp.uniforms;
    const keep = { rect: u.uRect.value, res: u.uRes.value };
    u.uRect.value = [0, 0, 64, 40]; u.uRes.value = [64, 40];
    this.setCompCommon(u, t);
    u.uPeak.value = 0; u.uNoise.value = 0; u.uAlpha.value = 1; u.uRadius.value = 0; u.uND.value = 0; u.uZebra.value = 0; u.uMix.value = 1;
    u.uDim.value = 1; u.uPoolAmt.value = 0; u.uRim.value = 0;
    this.renderer.bindFramebuffer(this.rtSmall);
    gl.viewport(0, 0, 64, 40);
    this.mComp.draw();
    if (this.stats) this.stats.readback++;
    // the read happens at the start of the next frame, when the GPU has finished this one: no stall, no buffer games
    this.pendingRead = true;
    this.renderer.bindFramebuffer();
    u.uRect.value = keep.rect; u.uRes.value = keep.res;
  }

  /** Reads last frame's 64 x 40 metering render; called first thing in a frame. */
  private collect() {
    const gl = this.gl;
    if (!this.pendingRead) return;
    this.pendingRead = false;
    this.renderer.bindFramebuffer(this.rtSmall);
    gl.readPixels(0, 0, 64, 40, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    this.renderer.bindFramebuffer();
    const hist = new Float32Array(64);
    let sum = 0, wsum = 0, clipped = 0;
    const px = this.pixels;
    for (let i = 0; i < px.length; i += 4) {
      const y = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      hist[Math.min(63, Math.floor(y / 4))]++;
      // centre-weighted average metering on the displayed (encoded) values; middle grey reads as 118/255
      const k = i / 4, x = (k % 64) / 63 - 0.5, yy = Math.floor(k / 64) / 39 - 0.5;
      const w = 1 - 1.4 * (x * x + yy * yy);
      sum += (y / 255) * w; wsum += w;
      if (y > 250) clipped++;
    }
    const mean = sum / wsum;
    const ev = Math.log2(Math.max(mean, 1e-3) / 0.46);
    this.onMeter?.({ hist, ev, clip: clipped > 12 });
  }
}
