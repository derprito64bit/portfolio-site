// One WebGL2 canvas (OGL) behind the DOM. Frame: plates and mirrored type render into a scene target, then the lens
// pass refracts that target onto the screen.
import { Renderer, Program, Mesh, Triangle, Plane, RenderTarget, Texture } from 'ogl';
import { FULL_VERT, TEXT_FRAG, PLATE_VERT, PLATE_FRAG, LENS_FRAG } from './shaders';
import { TextMirror } from './mirror';

export const MAX_SHAPES = 6;

export interface Cover {
  seed: number;
  mode: number;
  tint: [number, number, number];
}

export interface Plate {
  el: HTMLElement | null;
  /** Overrides the element's rect (CSS px). */
  rect: { x: number; y: number; w: number; h: number } | null;
  a: Cover;
  b: Cover | null;
  split: number;
  dir: number;
  exposure: number;
  hover: number;
  visible: boolean;
}

export interface Shape {
  x: number;
  y: number;
  hw: number;
  hh: number;
  r: number;
  rot: number;
  /** Blend radius into the union (px); defaults to the lens k. */
  k?: number;
}

export interface LensParams {
  bevel: number;
  refract: number;
  mag: number;
  disp: number;
  alpha: number;
  k: number;
  wobble: number;
  light: [number, number];
  shade: number;
  caust?: number;
}

export class Stage {
  canvas: HTMLCanvasElement;
  renderer: Renderer;
  gl: Renderer['gl'];
  mirror = new TextMirror();
  plates: Plate[] = [];
  shapes: Shape[] = [];
  lens: LensParams = { bevel: 70, refract: 46, mag: 0.1, disp: 0.22, alpha: 1, k: 40, wobble: 0, light: [-0.55, -0.8], shade: 1 };
  w = 1;
  h = 1;
  dpr = 1;
  time = 0;
  frozen = false;

  private rt: RenderTarget;
  private textTex: Texture;
  private textMesh: Mesh;
  private plateProgram: Program;
  private plateMesh: Mesh;
  private lensProgram: Program;
  private lensMesh: Mesh;
  private shapeBuf = new Array(MAX_SHAPES * 4).fill(0);
  private radiusBuf = new Array(MAX_SHAPES).fill(0);
  private rotBuf = new Array(MAX_SHAPES).fill(0);
  private kBuf = new Array(MAX_SHAPES).fill(0);

  constructor(canvas: HTMLCanvasElement, maxDpr: number) {
    this.canvas = canvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.renderer = new Renderer({ canvas, dpr: this.dpr, alpha: false, antialias: false, depth: false, webgl: 2, powerPreference: 'high-performance' });
    this.gl = this.renderer.gl;
    if (!this.gl || !(this.gl as WebGL2RenderingContext).texStorage2D) throw new Error('webgl2 unavailable');
    const gl = this.gl;
    gl.clearColor(10 / 255, 10 / 255, 11 / 255, 1);

    const tri = new Triangle(gl);
    this.rt = new RenderTarget(gl, { width: 2, height: 2, depth: false });
    this.textTex = new Texture(gl, { image: this.mirror.canvas, generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR });
    const textProgram = new Program(gl, { vertex: FULL_VERT, fragment: TEXT_FRAG, uniforms: { uText: { value: this.textTex } }, transparent: true, depthTest: false, depthWrite: false, cullFace: null as unknown as number });
    this.textMesh = new Mesh(gl, { geometry: tri, program: textProgram });

    this.plateProgram = new Program(gl, {
      vertex: PLATE_VERT,
      fragment: PLATE_FRAG,
      uniforms: {
        uRect: { value: [0, 0, 1, 1] },
        uView: { value: [1, 1] },
        uTime: { value: 0 },
        uA: { value: [0, 0] },
        uB: { value: [0, 0] },
        uTintA: { value: [0.3, 0.1, 0.1] },
        uTintB: { value: [0.3, 0.1, 0.1] },
        uSplit: { value: 0 },
        uDir: { value: 0 },
        uExposure: { value: 1 },
        uHover: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      cullFace: null as unknown as number,
    });
    this.plateMesh = new Mesh(gl, { geometry: new Plane(gl), program: this.plateProgram });

    this.lensProgram = new Program(gl, {
      vertex: FULL_VERT,
      fragment: LENS_FRAG,
      uniforms: {
        uScene: { value: this.rt.texture },
        uRes: { value: [1, 1] },
        uDpr: { value: 1 },
        uShapes: { value: this.shapeBuf },
        uShapeR: { value: this.radiusBuf },
        uShapeRot: { value: this.rotBuf },
        uShapeK: { value: this.kBuf },
        uCount: { value: 0 },
        uK: { value: 40 },
        uBevel: { value: 70 },
        uRefract: { value: 40 },
        uMag: { value: 0.1 },
        uDisp: { value: 0.2 },
        uAlpha: { value: 1 },
        uLight: { value: [-0.55, -0.8] },
        uTime: { value: 0 },
        uWobble: { value: 0 },
        uShade: { value: 1 },
        uCaust: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
      cullFace: null as unknown as number,
    });
    this.lensMesh = new Mesh(gl, { geometry: tri, program: this.lensProgram });
    this.resize();
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.renderer.setSize(this.w, this.h);
    const pw = this.gl.canvas.width;
    const ph = this.gl.canvas.height;
    this.rt.setSize(pw, ph);
    this.mirror.resize(this.w, this.h, this.dpr);
    this.textTex.image = this.mirror.canvas;
    this.textTex.needsUpdate = true;
  }

  /** Compile every program and draw once so the first real frame never hitches. */
  warm() {
    this.render(0);
    this.gl.finish();
  }

  render(dt: number) {
    if (!this.frozen) this.time += dt;
    const { renderer, gl } = this;
    // scene target: plates, then mirrored type
    renderer.bindFramebuffer(this.rt);
    renderer.setViewport(this.rt.width, this.rt.height);
    gl.clearColor(10 / 255, 10 / 255, 11 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pu = this.plateProgram.uniforms;
    pu.uView.value = [this.w, this.h];
    pu.uTime.value = this.time;
    for (const p of this.plates) {
      if (!p.visible) continue;
      let x: number, y: number, w: number, h: number;
      if (p.rect) ({ x, y, w, h } = p.rect);
      else if (p.el) {
        const r = p.el.getBoundingClientRect();
        x = r.left; y = r.top; w = r.width; h = r.height;
      } else continue;
      if (w < 1 || h < 1 || y > this.h || y + h < 0 || x > this.w || x + w < 0) continue;
      pu.uRect.value = [x, y, w, h];
      pu.uA.value = [p.a.seed, p.a.mode];
      pu.uTintA.value = p.a.tint;
      const b = p.b ?? p.a;
      pu.uB.value = [b.seed, b.mode];
      pu.uTintB.value = b.tint;
      pu.uSplit.value = p.split;
      pu.uDir.value = p.b ? p.dir : 0;
      pu.uExposure.value = p.exposure;
      pu.uHover.value = p.hover;
      renderer.render({ scene: this.plateMesh, target: this.rt, clear: false, sort: false, frustumCull: false });
    }
    this.mirror.draw();
    this.textTex.needsUpdate = true;
    renderer.render({ scene: this.textMesh, target: this.rt, clear: false, sort: false, frustumCull: false });

    // lens pass to the screen
    const lu = this.lensProgram.uniforms;
    const n = Math.min(this.shapes.length, MAX_SHAPES);
    for (let i = 0; i < MAX_SHAPES; i++) {
      const s = this.shapes[i];
      if (i < n && s) {
        this.shapeBuf[i * 4] = s.x;
        this.shapeBuf[i * 4 + 1] = s.y;
        this.shapeBuf[i * 4 + 2] = Math.max(0.5, s.hw);
        this.shapeBuf[i * 4 + 3] = Math.max(0.5, s.hh);
        this.radiusBuf[i] = Math.max(0, s.r);
        this.rotBuf[i] = s.rot;
        this.kBuf[i] = s.k ?? this.lens.k;
      } else {
        this.shapeBuf[i * 4] = -9999;
        this.shapeBuf[i * 4 + 1] = -9999;
        this.shapeBuf[i * 4 + 2] = 1;
        this.shapeBuf[i * 4 + 3] = 1;
        this.radiusBuf[i] = 0;
        this.rotBuf[i] = 0;
        this.kBuf[i] = 0;
      }
    }
    // OGL caches array uniforms by reference contents; hand it fresh arrays each frame
    lu.uShapes.value = this.shapeBuf.slice();
    lu.uShapeR.value = this.radiusBuf.slice();
    lu.uShapeRot.value = this.rotBuf.slice();
    lu.uShapeK.value = this.kBuf.slice();
    lu.uCount.value = n;
    const L = this.lens;
    lu.uK.value = L.k;
    lu.uBevel.value = L.bevel;
    lu.uRefract.value = L.refract;
    lu.uMag.value = L.mag;
    lu.uDisp.value = L.disp;
    lu.uAlpha.value = L.alpha;
    lu.uLight.value = L.light;
    lu.uTime.value = this.time;
    lu.uWobble.value = L.wobble;
    lu.uShade.value = L.shade;
    lu.uCaust.value = L.caust ?? 0;
    lu.uRes.value = [gl.canvas.width, gl.canvas.height];
    lu.uDpr.value = this.dpr;
    lu.uScene.value = this.rt.texture;
    renderer.render({ scene: this.lensMesh, clear: false, sort: false, frustumCull: false });
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
