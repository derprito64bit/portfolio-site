// The boot probe (W-D017): 3 wet hero-size prints at the target DPR, timed with readPixels fences; median <= 8 ms
// keeps the full tier, otherwise lite. At most 500 ms, split into short tasks. The wet-print shader here is a
// stand-in with the develop shader's cost profile (noise, layered mixes) until W-S1/W-C2 land the real one.
import { Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, WebGLRenderTarget } from 'three';

export interface ProbeResult {
  pass: boolean;
  medianMs: number;
  samples: number;
  totalMs: number;
  width: number;
  height: number;
  aborted: boolean;
  /** The context was lost at some point during the probe (it then timed nothing). */
  lost: boolean;
}

export const WET_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const WET_FRAG = /* glsl */ `
precision highp float;
uniform float uDev;
uniform float uSeed;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec2 p = vUv * 9.0 + uSeed;
  float n = fbm(p + fbm(p * 0.7));
  float d = smoothstep(n * 0.6, n * 0.6 + 0.4, uDev);
  vec3 dye = vec3(fbm(p + 1.7), fbm(p + 3.1), fbm(p + 5.3));
  vec3 base = vec3(0.06, 0.09, 0.1) + 0.08 * n;
  gl_FragColor = vec4(mix(base, dye, d), 1.0);
}`;

/** Hero print size in CSS px (W-D009 caps the hero still near 520 px wide; the print is 54:86). */
export const HERO = { w: 520, h: Math.round((520 * 86) / 54) };

export function wetMaterial(seed: number): any {
  return new ShaderMaterial({ vertexShader: WET_VERT, fragmentShader: WET_FRAG, uniforms: { uDev: { value: 0.5 }, uSeed: { value: seed } }, toneMapped: false });
}

export async function runProbe(renderer: any, view: { dpr: number }): Promise<ProbeResult> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(HERO.w * 3 * dpr);
  const height = Math.round(HERO.h * dpr);
  const rt = new WebGLRenderTarget(width, height);
  const scene = new Scene();
  const cam = new OrthographicCamera(0, 3, 1, 0, -1, 1);
  const geo = new PlaneGeometry(1, 1);
  const mats = [0, 1, 2].map((i) => wetMaterial(i * 7.3));
  mats.forEach((m, i) => {
    const mesh = new Mesh(geo, m);
    mesh.position.set(i + 0.5, 0.5, 0);
    scene.add(mesh);
  });
  const px = new Uint8Array(4);
  const times: number[] = [];
  const t0 = performance.now();
  let aborted = false;
  // A probe that saw its context lost timed nothing (three's render returns at once, the read-back reads nothing: every
  // sample about 0 ms), so it does not pass (round-5 should-fix S7, Breaker 4.3 #3).
  const gl = renderer.getContext();
  const canvas = renderer.domElement;
  let lost = gl.isContextLost();
  const onLoss = () => {
    lost = true;
  };
  canvas.addEventListener('webglcontextlost', onLoss);
  try {
    if (renderer.compileAsync) await renderer.compileAsync(scene, cam);
    renderer.setRenderTarget(rt);
    for (let i = 0; i < 32 && !(lost ||= gl.isContextLost()); i++) {
      mats.forEach((m, k) => (m.uniforms.uDev.value = (i + k) / 32));
      const a = performance.now();
      renderer.render(scene, cam);
      renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, px);
      const b = performance.now();
      if (i >= 2) times.push(b - a);
      if (b - t0 > 500) {
        aborted = true;
        break;
      }
      if (i % 8 === 7) {
        renderer.setRenderTarget(null);
        await new Promise((r) => setTimeout(r, 0));
        renderer.setRenderTarget(rt);
      }
    }
  } finally {
    canvas.removeEventListener('webglcontextlost', onLoss);
    lost ||= gl.isContextLost();
    renderer.setRenderTarget(null);
    // A loss destroyed these objects with its context. Freeing them later, once the context is back, deletes objects of
    // the old context ('INVALID_OPERATION: delete: object does not belong to this context', round-6 must-fix
    // one-loss-costs-restore (c)), so after a loss they are only dropped.
    if (!lost) {
      rt.dispose();
      geo.dispose();
      mats.forEach((m) => m.dispose());
    }
  }
  times.sort((x, y) => x - y);
  const medianMs = times.length ? times[Math.floor(times.length / 2)] : Infinity;
  void view;
  return { pass: !aborted && !lost && medianMs <= 8, medianMs: Math.round(medianMs * 1000) / 1000, samples: times.length, totalMs: Math.round(performance.now() - t0), width, height, aborted, lost };
}
