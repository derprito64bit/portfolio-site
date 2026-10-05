// Test fixtures for /bench/ (loaded only where [data-gl-fixture] slots exist). They prove the stage contract
// without any crew's art: flat quads on the page camera (drift and ring tests) and a stage-local cube (projection
// drift, persistence across swaps, reduced motion mid-timeline).
// ?debug=drift paints quads rgb(255, 0, 20i) to match the DOM bars of the drift harness; ?debug=ring grows the
// quads 12 px past the slot so the focus ring sits over GL.
import { BoxGeometry, DataTexture, Mesh, PlaneGeometry, ShaderMaterial, Vector3, MathUtils } from 'three';
import { stage as stageTokens } from '../../lib/tokens.js';
import { flags } from '../state.ts';
import { give, take, type Slot } from '../slots.ts';
import { invalidate } from '../ticker.ts';
import { track, tween, type Timeline } from '../timelines.ts';
import type { Entity, FrameInfo, GLApi, StageView } from './index.ts';

const FLAT_VERT = 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FLAT_FRAG = 'precision highp float; uniform vec3 uColor; uniform sampler2D uTex; void main() { gl_FragColor = vec4(uColor * texture2D(uTex, vec2(0.5)).rgb, 1.0); }';
/**
 * Exact 8-bit colours: no colour management, no tone mapping. Each material samples its own 1 x 1 white texture, so
 * the swap test can see textures being created and disposed (white keeps the colour exact).
 */
function flat(r: number, g: number, b: number): any {
  const tex = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  tex.needsUpdate = true;
  return new ShaderMaterial({ vertexShader: FLAT_VERT, fragmentShader: FLAT_FRAG, uniforms: { uColor: { value: new Vector3(r / 255, g / 255, b / 255) }, uTex: { value: tex } }, toneMapped: false });
}
function disposeFlat(m: any): void {
  m.uniforms.uTex.value.dispose();
  m.dispose();
}

class QuadFixture implements Entity {
  readonly persistent = false;
  private slot: Slot | null = null;
  readonly mesh: any;
  constructor(readonly id: string, idx: number, private readonly gl: GLApi) {
    const colour = flags.debug === 'drift' ? [255, 0, 20 * idx] : flags.debug === 'ring' ? [197, 40, 40] : [60 + ((idx * 37) % 120), 90, 110];
    this.mesh = new Mesh(new PlaneGeometry(1, 1), flat(colour[0], colour[1], colour[2]));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    gl.pageScene.add(this.mesh);
  }
  bind(slot: Slot): void {
    this.slot = slot;
    take(slot.id);
  }
  unbind(): void {
    if (this.slot) give(this.slot.id);
    this.slot = null;
    this.mesh.visible = false;
  }
  place(f: FrameInfo): void {
    const s = this.slot;
    if (!s) return;
    const grow = flags.debug === 'ring' ? 12 : 0;
    this.mesh.position.set(s.cx - window.scrollX - f.W / 2, f.H / 2 - (s.cy - f.sy), 0);
    this.mesh.scale.set(s.w + grow * 2, s.h + grow * 2, 1);
    this.mesh.visible = s.near;
  }
  visible(): boolean {
    return Boolean(this.slot?.near);
  }
  restore(): void {
    if (this.slot) take(this.slot.id);
  }
  dispose(): void {
    this.gl.pageScene.remove(this.mesh);
    this.mesh.geometry.dispose();
    disposeFlat(this.mesh.material);
  }
  bounds() {
    const s = this.slot;
    if (!s) return null;
    return { x: s.cx - s.w / 2 - window.scrollX, y: s.cy - s.h / 2 - window.scrollY, w: s.w, h: s.h, angleDeg: 0 };
  }
}

/** One pose per band (tokens.stage.poses): split at 64rem and wider or on landscape phones, phone below 480 px. */
function bandPose(): { yawDeg: number; pitchDeg: number } {
  const p = stageTokens.poses;
  if (matchMedia('(min-width: 64rem), (orientation: landscape) and (max-height: 500px)').matches) return p.split;
  if (matchMedia('(max-width: 479px)').matches) return p.phone;
  return p.stacked;
}

class CubeFixture implements Entity {
  readonly persistent = true;
  private slot: Slot | null = null;
  private readonly view: StageView;
  private readonly mesh: any;
  spin = 0;
  private timeline: Timeline | null = null;
  constructor(readonly id: string, gl: GLApi) {
    this.view = gl.createStageView(id);
    this.mesh = new Mesh(new BoxGeometry(1, 1, 1), flat(227, 155, 43));
    this.view.scene.add(this.mesh);
    this.view.visible = false;
  }
  bind(slot: Slot): void {
    this.slot = slot;
    this.view.visible = true;
  }
  unbind(): void {
    this.slot = null;
    this.view.visible = false;
  }
  place(): void {
    const pose = bandPose();
    const cam = this.view.camera;
    const yaw = MathUtils.degToRad(pose.yawDeg);
    const pitch = MathUtils.degToRad(pose.pitchDeg);
    const dist = 3.4;
    cam.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(0, 0, 0);
    this.mesh.rotation.set(0, this.spin, 0);
  }
  visible(): boolean {
    return Boolean(this.slot?.near) && this.view.visible;
  }
  /** Start a timeline on the stage clock (reduced motion ends it at once). */
  startSpin(ms: number): Timeline {
    this.timeline = tween({ id: `${this.id}:spin`, from: 0, to: Math.PI * 2, duration: ms, onUpdate: (v) => (this.spin = v) });
    return this.timeline;
  }
  get spinning(): boolean {
    return Boolean(this.timeline?.active);
  }
  snap(): void {
    this.timeline?.finish();
  }
  dispose(): void {
    this.view.dispose();
    this.mesh.geometry.dispose();
    disposeFlat(this.mesh.material);
  }
  /** Projected bounds of the cube's 8 corners through its own camera, in viewport CSS px. */
  bounds() {
    const r = this.view.rect;
    if (!r) return null;
    this.mesh.updateMatrixWorld();
    this.view.camera.updateMatrixWorld();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const v = new Vector3(i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5).applyMatrix4(this.mesh.matrixWorld).project(this.view.camera);
      const px = r.x + ((v.x + 1) / 2) * r.w;
      const py = r.y + ((1 - v.y) / 2) * r.h;
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
    }
    const c = this.view.camera.position;
    const angleDeg = MathUtils.radToDeg(Math.atan2(c.x, c.z)) + MathUtils.radToDeg(this.spin);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, angleDeg };
  }
}

/**
 * A fixed-aspect stage view (#31): a flat quad that fills its camera's frustum exactly, so what it covers on screen
 * is the view's contain-fit rectangle (data-gl-aspect on the slot), and nothing outside it.
 */
class AspectFixture implements Entity {
  readonly persistent = false;
  private slot: Slot | null = null;
  private readonly view: StageView;
  private readonly mesh: any;
  constructor(readonly id: string, aspect: number | null, gl: GLApi) {
    this.view = aspect ? gl.createStageView(id, { aspect }) : gl.createStageView(id);
    const cam = this.view.camera;
    const dist = 2;
    cam.position.set(0, 0, dist);
    cam.lookAt(0, 0, 0);
    if (aspect) cam.aspect = aspect; // the owner's framing (applyFraming does this for the camera); the stage leaves it
    cam.updateProjectionMatrix();
    const h = 2 * dist * Math.tan(MathUtils.degToRad(cam.fov) / 2);
    // Without an aspect the stage fits the camera to the slot every frame: a quad 10 frusta wide fills any slot.
    this.mesh = new Mesh(new PlaneGeometry(h * (aspect ?? 10), h), flat(40, 200, 120));
    this.view.scene.add(this.mesh);
    this.view.visible = false;
  }
  bind(slot: Slot): void {
    this.slot = slot;
    this.view.visible = true;
  }
  unbind(): void {
    this.slot = null;
    this.view.visible = false;
  }
  place(): void {}
  visible(): boolean {
    return Boolean(this.slot?.near) && this.view.visible;
  }
  dispose(): void {
    this.view.dispose();
    this.mesh.geometry.dispose();
    disposeFlat(this.mesh.material);
  }
  bounds() {
    const r = this.view.rect;
    return r ? { ...r, angleDeg: 0 } : null;
  }
  get stageView(): StageView {
    return this.view;
  }
}

export function install(gl: GLApi): void {
  gl.registerEntityFactory({
    match: (s) => s.fixture === 'quad',
    create: (s) => new QuadFixture(s.id, Number(s.el.dataset.glIndex) || 0, gl),
  });
  gl.registerEntityFactory({ match: (s) => s.fixture === 'cube', create: (s) => new CubeFixture(s.id, gl) });
  gl.registerEntityFactory({ match: (s) => s.fixture === 'aspect', create: (s) => new AspectFixture(s.id, Number(s.el.dataset.glAspect) || null, gl) });
  const stage = (window as unknown as { __stage: Record<string, unknown> }).__stage;
  stage.fixtures = {
    /** Recolour a quad fixture and ask for one render: the present check reads what the canvas shows afterwards. */
    tint(id: string, r: number, g: number, b: number) {
      const e = gl.entity(id) as QuadFixture | undefined;
      if (!e) return false;
      e.mesh.material.uniforms.uColor.value.set(r / 255, g / 255, b / 255);
      invalidate();
      return true;
    },
    /** The last viewport (buffer px, bottom-left origin) of a fixed-aspect fixture's stage view. */
    viewport(id: string) {
      const e = gl.entity(id) as AspectFixture | undefined;
      return e?.stageView.viewport ?? null;
    },
    spin(ms = 5000, id = 'fixture-cube') {
      const e = gl.entity(id) as CubeFixture | undefined;
      if (!e) return false;
      track(e.startSpin(ms));
      return true;
    },
    spinning(id = 'fixture-cube') {
      return Boolean((gl.entity(id) as CubeFixture | undefined)?.spinning);
    },
  };
}
