// Flux engine: one OGL canvas. A stable-fluids simulation stirs a marbling map; the field is drawn from it; the work
// planes and honours objects sit in it; a last pass bends it all under the liquid-glass lenses.
import { Renderer, Program, Mesh, Triangle, RenderTarget, Plane, Texture } from 'ogl';
import * as S from './shaders';

type RT = RenderTarget;

class Double {
  read: RT;
  write: RT;
  constructor(make: () => RT) {
    this.read = make();
    this.write = make();
  }
  swap() {
    const t = this.read;
    this.read = this.write;
    this.write = t;
  }
  setSize(w: number, h: number) {
    this.read.setSize(w, h);
    this.write.setSize(w, h);
  }
}

export interface Drop {
  x: number; // field space
  y: number;
  r: number; // current radius
  k: number; // ring density
  vivid: number;
}

export interface PlaneDraw {
  x: number; // centre, css px
  y: number;
  w: number;
  h: number;
  tex: Texture;
  alpha: number;
  focus: number;
  hover: number;
  mouse: [number, number];
  develop: number;
  wave: [number, number, number];
  waveAmp: number;
  seed: number;
  vel: [number, number];
  split: [number, number];
  bend: number;
  clip?: [number, number]; // css px top, bottom
  vfade?: [number, number, number, number]; // css px from the top: fade in from a to b, fade out from c to d
}

export interface Lens {
  x: number; // centre css px (y down)
  y: number;
  hw: number;
  hh: number;
  r: number;
  on: number;
}

export interface CoverSpec {
  seed: number;
  drops: number[][];
  opsA: number[][];
  opsB: number[][];
  pal: number[][];
  label: HTMLCanvasElement;
}

export class Engine {
  renderer: Renderer;
  gl: any;
  ok = true;
  W = 1;
  H = 1;
  dpr = 1;
  lowPower: boolean;
  simW = 1;
  simH = 1;
  dyeW = 1;
  dyeH = 1;

  quad: Mesh;
  vel!: Double;
  pres!: Double;
  ink!: Double;
  div!: RT;
  curl!: RT;
  scene!: RT;

  p: Record<string, Program> = {};
  planeMesh: Mesh;
  planeProgram: Program;

  // state the page drives
  splats: { x: number; y: number; dx: number; dy: number; r: number; ring?: number }[] = [];
  drops: Drop[] = [];
  bands = 7.4;
  dim = 1;
  reveal = 3; // field units
  revealC: [number, number] = [0.5, 0.5];
  defocus = 0;
  focusRect: [number, number, number, number] = [0, 0, 1, 1];
  frameOn = 0;
  sat = 1;
  scroll = 0; // field units
  shift: [number, number] = [0, 0];
  relaxRate = 0.42;
  curlStrength = 4;
  planes: PlaneDraw[] = [];
  lenses: Lens[] = [];
  pointer: [number, number] = [0, 0];
  glass = { x: 0, y: 0, hw: 0, hh: 0, tx: 0, ty: 0, on: 0 };
  medal = { x: 0, y: 0, r: 0, spin: 0, ax: 0, ay: 0, on: 0 };
  time = 0;
  simulate = true;

  constructor(canvas: HTMLCanvasElement, lowPower: boolean) {
    this.lowPower = lowPower;
    this.dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.25 : 1.5);
    this.renderer = new Renderer({
      canvas,
      dpr: this.dpr,
      alpha: false,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
      webgl: 2,
    });
    const gl = (this.gl = this.renderer.gl);
    if (!this.renderer.isWebgl2) {
      this.ok = false;
      throw new Error('WebGL2 unavailable');
    }
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    this.renderer.autoClear = false;
    gl.clearColor(0.012, 0.012, 0.016, 1);

    this.quad = new Mesh(gl, { geometry: new Triangle(gl), program: this.makeProgram(S.FRAG_CLEAR, { uTexture: { value: null }, uValue: { value: 1 } }) });
    this.p.clear = this.quad.program;
    this.planeProgram = new Program(gl, {
      vertex: S.VERT_PLANE,
      fragment: S.FRAG_PLANE,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      cullFace: false,
      uniforms: {
        uRect: { value: [0, 0, 1, 1] },
        uView: { value: [1, 1] },
        uVel: { value: [0, 0] },
        uBend: { value: 0 },
        uWave: { value: [0.5, 0.5, 1] },
        uWaveAmp: { value: 0 },
        uTex: { value: null },
        uAlpha: { value: 1 },
        uFocus: { value: 1 },
        uHover: { value: 0 },
        uMouse: { value: [0.5, 0.5] },
        uTime: { value: 0 },
        uSplit: { value: [0, 0] },
        uDevelop: { value: 1 },
        uAspect: { value: 0.8 },
        uSeed: { value: 0 },
        uClip: { value: [-1e5, 1e5] },
        uVfade: { value: [-2e5, -1e5, 1e5, 2e5] },
      },
    });
    this.planeMesh = new Mesh(gl, { geometry: new Plane(gl, { width: 1, height: 1, widthSegments: 28, heightSegments: 28 }), program: this.planeProgram });
    this.buildPrograms();
    this.resize();
  }

  makeProgram(fragment: string, uniforms: Record<string, { value: any }>) {
    return new Program(this.gl, { vertex: S.VERT_QUAD, fragment, uniforms, depthTest: false, depthWrite: false, cullFace: false, transparent: false });
  }

  buildPrograms() {
    const t = { value: null as any };
    const v2 = () => ({ value: [0, 0] });
    this.p.splat = this.makeProgram(S.FRAG_SPLAT, { uTarget: { value: null }, uAspect: { value: 1 }, uColor: { value: [0, 0, 0] }, uPoint: v2(), uRadius: { value: 0.002 }, uRing: { value: 0 } });
    this.p.curl = this.makeProgram(S.FRAG_CURL, { uVelocity: { value: null }, uTexel: v2() });
    this.p.vort = this.makeProgram(S.FRAG_VORTICITY, { uVelocity: { value: null }, uCurl: { value: null }, uTexel: v2(), uCurlStrength: { value: 20 }, uDt: { value: 0.016 } });
    this.p.div = this.makeProgram(S.FRAG_DIVERGENCE, { uVelocity: { value: null }, uTexel: v2() });
    this.p.pres = this.makeProgram(S.FRAG_PRESSURE, { uPressure: { value: null }, uDivergence: { value: null }, uTexel: v2() });
    this.p.grad = this.makeProgram(S.FRAG_GRADIENT, { uPressure: { value: null }, uVelocity: { value: null }, uTexel: v2() });
    this.p.adv = this.makeProgram(S.FRAG_ADVECT, { uVelocity: { value: null }, uSource: { value: null }, uTexel: v2(), uDt: { value: 0.016 }, uDissipation: { value: 0.2 } });
    this.p.ink = this.makeProgram(S.FRAG_INK, {
      uInk: { value: null }, uVelocity: { value: null }, uSimTexel: v2(), uDt: { value: 0.016 }, uRelax: { value: 0.006 },
      uEnergyDecay: { value: 0.985 }, uEnergyGain: { value: 0.0035 }, uTime: { value: 0 }, uAspect: { value: 1 }, uScroll: { value: 0 },
      uShift: v2(), uDrop: { value: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] }, uDropVivid: { value: [0, 0, 0, 0, 0, 0] }, uCalm: { value: 0 },
    });
    this.p.field = this.makeProgram(S.FRAG_FIELD, {
      uInk: { value: null }, uRes: v2(), uDpr: { value: 1 }, uBands: { value: 8 }, uDim: { value: 1 }, uReveal: { value: 3 }, uRevealC: { value: [0.5, 0.5] },
      uDefocus: { value: 0 }, uFrame: { value: [0, 0, 1, 1] }, uFrameOn: { value: 0 }, uTime: { value: 0 }, uSat: { value: 1 },
      uGlass: { value: [0, 0, 1, 1] }, uGlassTilt: v2(), uGlassOn: { value: 0 }, uMedal: { value: [0, 0, 1, 0] }, uMedalOn: { value: 0 }, uMedalAnchor: v2(),
    });
    this.p.final = this.makeProgram(S.FRAG_FINAL, {
      uScene: { value: null }, uRes: v2(), uDpr: { value: 1 },
      uLens: { value: [[0, 0, 1, 1], [0, 0, 1, 1], [0, 0, 1, 1]] }, uLensR: { value: [0, 0, 0] }, uLensOn: { value: [0, 0, 0] }, uPointer: v2(),
    });
    const z4 = (n: number) => Array.from({ length: n }, () => [0, 0, 0, 0]);
    this.p.cover = this.makeProgram(S.FRAG_COVER, {
      uDrops: { value: z4(64) }, uDropN: { value: 0 }, uOpsA: { value: z4(8) }, uOpsB: { value: z4(8) }, uOpN: { value: 0 },
      uPal: { value: Array.from({ length: 6 }, () => [0, 0, 0]) }, uSize: { value: [640, 800] }, uLabel: { value: null }, uSeed: { value: 0 },
    });
    void t;
  }

  halfRT(w: number, h: number) {
    const gl = this.gl;
    return new RenderTarget(gl, { width: w, height: h, type: gl.HALF_FLOAT, format: gl.RGBA, internalFormat: gl.RGBA16F, minFilter: gl.LINEAR, magFilter: gl.LINEAR, depth: false });
  }

  resize() {
    const W = Math.max(1, window.innerWidth);
    const H = Math.max(1, window.innerHeight);
    const sizeChanged = !this.scene || Math.abs(W / H - this.W / this.H) > 0.08 || Math.abs(W - this.W) > 160;
    this.W = W;
    this.H = H;
    this.renderer.setSize(W, H);
    const aspect = W / H;
    const simShort = this.lowPower ? 96 : 128;
    const sW = aspect >= 1 ? Math.round(simShort * aspect) : simShort;
    const sH = aspect >= 1 ? simShort : Math.round(simShort / aspect);
    const dyeScale = this.lowPower ? 0.38 : 0.55;
    let dW = Math.round(W * dyeScale);
    let dH = Math.round(H * dyeScale);
    const maxD = 1100;
    if (Math.max(dW, dH) > maxD) {
      const k = maxD / Math.max(dW, dH);
      dW = Math.round(dW * k);
      dH = Math.round(dH * k);
    }
    const sceneW = Math.round(W * this.dpr);
    const sceneH = Math.round(H * this.dpr);
    if (!this.scene) {
      this.vel = new Double(() => this.halfRT(sW, sH));
      this.pres = new Double(() => this.halfRT(sW, sH));
      this.div = this.halfRT(sW, sH);
      this.curl = this.halfRT(sW, sH);
      this.ink = new Double(() => this.halfRT(dW, dH));
      this.scene = new RenderTarget(this.gl, { width: sceneW, height: sceneH, depth: false, minFilter: this.gl.LINEAR });
      this.checkFBO();
    } else {
      this.scene.setSize(sceneW, sceneH);
      if (sizeChanged) {
        this.vel.setSize(sW, sH);
        this.pres.setSize(sW, sH);
        this.div.setSize(sW, sH);
        this.curl.setSize(sW, sH);
        this.ink.setSize(dW, dH);
      }
    }
    this.simW = sW;
    this.simH = sH;
    this.dyeW = dW;
    this.dyeH = dH;
  }

  checkFBO() {
    const gl = this.gl;
    this.renderer.bindFramebuffer(this.ink.read);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    this.renderer.bindFramebuffer();
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      this.ok = false;
      throw new Error('Half-float render targets unsupported');
    }
  }

  pass(program: Program, target: RT | null) {
    this.quad.program = program;
    this.renderer.render({ scene: this.quad, target: target ?? undefined, clear: false, sort: false, frustumCull: false } as any);
  }

  // ---------------------------------------------------------------- input into the fluid
  /** x, y in css px (y down); dx, dy in css px per frame. */
  stir(x: number, y: number, dx: number, dy: number, radius = 1) {
    this.splats.push({ x: x / this.W, y: 1 - y / this.H, dx: dx / this.W, dy: -dy / this.H, r: radius });
  }
  /** A ring of outward velocity, centred at x, y css px, of radius rad (field units, height 1). */
  burst(x: number, y: number, rad: number, force: number) {
    this.splats.push({ x: x / this.W, y: 1 - y / this.H, dx: force, dy: 0, r: 1, ring: rad });
  }

  /** The surface's displacement under a css px point (uv units), read back from the marbling map. */
  sampleD(x: number, y: number): [number, number] {
    const gl = this.gl;
    try {
      const rt = this.ink.read;
      const px = Math.min(rt.width - 1, Math.max(0, Math.round((x / this.W) * rt.width)));
      const py = Math.min(rt.height - 1, Math.max(0, Math.round((1 - y / this.H) * rt.height)));
      const out = new Float32Array(4);
      this.renderer.bindFramebuffer(rt);
      gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, out);
      this.renderer.bindFramebuffer();
      if (!Number.isFinite(out[0]) || !Number.isFinite(out[1])) return [0, 0];
      return [out[0], out[1]];
    } catch {
      return [0, 0];
    }
  }

  // ---------------------------------------------------------------- covers
  makeCover(spec: CoverSpec, w = 960, h = 1200): Texture {
    const gl = this.gl;
    const rt = new RenderTarget(gl, { width: w, height: h, depth: false, minFilter: gl.LINEAR });
    const label = new Texture(gl, { image: spec.label, generateMipmaps: false, minFilter: gl.LINEAR });
    const u = this.p.cover.uniforms;
    const pad = (a: number[][], n: number) => Array.from({ length: n }, (_, i) => a[i] || [0, 0, 0, 0]);
    u.uDrops.value = pad(spec.drops, 64);
    u.uDropN.value = Math.min(64, spec.drops.length);
    u.uOpsA.value = pad(spec.opsA, 8);
    u.uOpsB.value = pad(spec.opsB, 8);
    u.uOpN.value = Math.min(8, spec.opsA.length);
    u.uPal.value = spec.pal;
    u.uSize.value = [w, h];
    u.uSeed.value = spec.seed;
    u.uLabel.value = label;
    this.pass(this.p.cover, rt);
    return rt.texture;
  }

  /** Reads a generated cover back into a 2D canvas (reduced-motion grid, project page fallback). */
  coverToCanvas(tex: Texture, w = 640, h = 800): HTMLCanvasElement {
    const gl = this.gl;
    const rt = new RenderTarget(gl, { width: w, height: h, depth: false });
    const u = this.p.clear.uniforms;
    u.uTexture.value = tex;
    u.uValue.value = 1;
    this.pass(this.p.clear, rt);
    const px = new Uint8Array(w * h * 4);
    this.renderer.bindFramebuffer(rt);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    this.renderer.bindFramebuffer();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- frame
  frame(dt: number) {
    if (!this.ok) return;
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    const { simW, simH } = this;
    const texel = [1 / simW, 1 / simH];
    const aspect = this.W / this.H;

    if (this.simulate) {
      // splats
      const sp = this.p.splat.uniforms;
      sp.uAspect.value = aspect;
      for (const s of this.splats) {
        sp.uTarget.value = this.vel.read.texture;
        sp.uPoint.value = [s.x, s.y];
        if (s.ring) {
          sp.uRing.value = s.ring;
          sp.uRadius.value = 0.02;
          sp.uColor.value = [s.dx, 0, 0];
        } else {
          sp.uRing.value = 0;
          sp.uRadius.value = 0.0022 * s.r * (aspect > 1 ? 1 : 1 / aspect);
          sp.uColor.value = [s.dx * 4200, s.dy * 4200, 0];
        }
        this.pass(this.p.splat, this.vel.write);
        this.vel.swap();
      }
      this.splats.length = 0;

      const c = this.p.curl.uniforms;
      c.uVelocity.value = this.vel.read.texture;
      c.uTexel.value = texel;
      this.pass(this.p.curl, this.curl);

      const v = this.p.vort.uniforms;
      v.uVelocity.value = this.vel.read.texture;
      v.uCurl.value = this.curl.texture;
      v.uTexel.value = texel;
      v.uCurlStrength.value = this.curlStrength;
      v.uDt.value = dt;
      this.pass(this.p.vort, this.vel.write);
      this.vel.swap();

      const d = this.p.div.uniforms;
      d.uVelocity.value = this.vel.read.texture;
      d.uTexel.value = texel;
      this.pass(this.p.div, this.div);

      const cl = this.p.clear.uniforms;
      cl.uTexture.value = this.pres.read.texture;
      cl.uValue.value = 0.8;
      this.pass(this.p.clear, this.pres.write);
      this.pres.swap();

      const pr = this.p.pres.uniforms;
      pr.uDivergence.value = this.div.texture;
      pr.uTexel.value = texel;
      const iters = this.lowPower ? 12 : 18;
      for (let i = 0; i < iters; i++) {
        pr.uPressure.value = this.pres.read.texture;
        this.pass(this.p.pres, this.pres.write);
        this.pres.swap();
      }

      const g = this.p.grad.uniforms;
      g.uPressure.value = this.pres.read.texture;
      g.uVelocity.value = this.vel.read.texture;
      g.uTexel.value = texel;
      this.pass(this.p.grad, this.vel.write);
      this.vel.swap();

      const a = this.p.adv.uniforms;
      a.uVelocity.value = this.vel.read.texture;
      a.uSource.value = this.vel.read.texture;
      a.uTexel.value = texel;
      a.uDt.value = dt;
      a.uDissipation.value = 0.8;
      this.pass(this.p.adv, this.vel.write);
      this.vel.swap();
    }

    // ink (marbling map)
    const k = this.p.ink.uniforms;
    k.uInk.value = this.ink.read.texture;
    k.uVelocity.value = this.vel.read.texture;
    k.uSimTexel.value = texel;
    k.uDt.value = dt;
    k.uRelax.value = 1 - Math.exp(-dt * this.relaxRate);
    k.uEnergyDecay.value = Math.exp(-dt * 1.1);
    k.uTime.value = this.time;
    k.uAspect.value = aspect;
    k.uScroll.value = this.scroll;
    k.uShift.value = this.shift;
    const dropArr = k.uDrop.value as number[][];
    const viv = k.uDropVivid.value as number[];
    for (let i = 0; i < 6; i++) {
      // uniform slot 5 is the newest drop
      const dr = this.drops[this.drops.length - 6 + i];
      if (dr && dr.r > 0.0005) {
        dropArr[i][0] = dr.x;
        dropArr[i][1] = dr.y;
        dropArr[i][2] = dr.r;
        dropArr[i][3] = dr.k;
        viv[i] = dr.vivid;
      } else {
        dropArr[i][2] = 0;
        viv[i] = 0;
      }
    }
    this.pass(this.p.ink, this.ink.write);
    this.ink.swap();
    this.shift = [0, 0];

    // field
    const f = this.p.field.uniforms;
    const sw = this.scene.width, sh = this.scene.height;
    f.uInk.value = this.ink.read.texture;
    f.uRes.value = [sw, sh];
    f.uDpr.value = this.dpr;
    f.uBands.value = this.bands;
    f.uDim.value = this.dim;
    f.uReveal.value = this.reveal;
    f.uRevealC.value = this.revealC;
    f.uDefocus.value = this.defocus;
    f.uFrame.value = this.focusRect;
    f.uFrameOn.value = this.frameOn;
    f.uTime.value = this.time;
    f.uSat.value = this.sat;
    const G = this.glass, M = this.medal, dp = this.dpr;
    f.uGlassOn.value = G.on;
    f.uGlass.value = [G.x * dp, (this.H - G.y) * dp, G.hw * dp, G.hh * dp];
    f.uGlassTilt.value = [G.tx, G.ty];
    f.uMedalOn.value = M.on;
    f.uMedal.value = [M.x * dp, (this.H - M.y) * dp, M.r * dp, M.spin];
    f.uMedalAnchor.value = [M.ax * dp, (this.H - M.ay) * dp];
    this.pass(this.p.field, this.scene);

    // planes
    if (this.planes.length) {
      const u = this.planeProgram.uniforms;
      u.uView.value = [this.W, this.H];
      u.uTime.value = this.time;
      for (const pl of this.planes) {
        if (pl.alpha <= 0.002) continue;
        u.uRect.value = [pl.x, pl.y, pl.w, pl.h];
        u.uTex.value = pl.tex;
        u.uAlpha.value = pl.alpha;
        u.uFocus.value = pl.focus;
        u.uHover.value = pl.hover;
        u.uMouse.value = pl.mouse;
        u.uDevelop.value = pl.develop;
        u.uWave.value = pl.wave;
        u.uWaveAmp.value = pl.waveAmp;
        u.uSeed.value = pl.seed;
        u.uVel.value = pl.vel;
        u.uSplit.value = pl.split;
        u.uBend.value = pl.bend;
        u.uAspect.value = pl.w / pl.h;
        u.uClip.value = pl.clip ? [(this.H - pl.clip[1]) * dp, (this.H - pl.clip[0]) * dp] : [-1e5, 1e5];
        const vf = pl.vfade;
        u.uVfade.value = vf ? [(this.H - vf[3]) * dp, (this.H - vf[2]) * dp, (this.H - vf[1]) * dp, (this.H - vf[0]) * dp] : [-2e5, -1e5, 1e5, 2e5];
        this.renderer.render({ scene: this.planeMesh, target: this.scene, clear: false, sort: false, frustumCull: false } as any);
      }
    }

    // final with lenses
    const fi = this.p.final.uniforms;
    fi.uScene.value = this.scene.texture;
    fi.uRes.value = [sw, sh];
    fi.uDpr.value = dp;
    const L = fi.uLens.value as number[][];
    const LR = fi.uLensR.value as number[];
    const LO = fi.uLensOn.value as number[];
    for (let i = 0; i < 3; i++) {
      const l = this.lenses[i];
      if (l && l.on > 0.001) {
        L[i][0] = l.x * dp;
        L[i][1] = (this.H - l.y) * dp;
        L[i][2] = l.hw * dp;
        L[i][3] = l.hh * dp;
        LR[i] = l.r * dp;
        LO[i] = l.on;
      } else LO[i] = 0;
    }
    fi.uPointer.value = [this.pointer[0] * dp, (this.H - this.pointer[1]) * dp];
    this.pass(this.p.final, null);
  }
}
