// Develop shader v1 (W-D016, W-D011). Owner: W-S1 (v1), then W-C2.
// Principle: the baked still is the truth and the shader animates the way to it. At d = 1 every stage term is exactly
// zero, so the developed frame equals the still's pixels and GL can hand back to the DOM still invisibly.
// - One ShaderMaterial per print, WebGL2, toneMapped false, display-space maths (the still's sRGB bytes, no colour
//   management), like the Manor's IonGrade.
// - A 256 x 256 noise texture baked once replaces fbm (R blotches, G grain, B and A warp).
// - Reveal order: light first from the eject edge; silver before dye; dye B, then G, then R; the cyan veil clears
//   last. The per-channel warp is gone by d 0.85. Grain boils at 12 fps and reaches exactly 0 at d 1.
// - LITE (the lite tier): one image fetch, no warp.
// - Two vertex paths: the usual model-view projection, or SCREEN_CLIP, where the quad's four corners arrive as clip
//   coordinates from another camera plus an affine remap into the current viewport (the hero print is posed in the
//   camera's 3D space and drawn in the effects view, so it shares the camera's perspective and depth).
// W-S2 and W-C2 build their prints on createDevelopMaterial(); W-C2 adds the five looks (the 4 x vec4 contract).
import {
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
} from 'three';

/** d = 1 - (1 - t)^2.4 (tokens develop.curve). */
export function developCurve(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - c, 2.4);
}
/** Milliseconds into a develop of `duration` at which d reaches `at` (0.7 = readable, W-D011). */
export function timeAt(duration: number, at = 0.7): number {
  return duration * (1 - Math.pow(1 - at, 1 / 2.4));
}

// ---------------------------------------------------------------- the noise texture (baked once)
let noise: any = null;
function lattice(size: number, rand: () => number): Float32Array {
  const a = new Float32Array(size * size);
  for (let i = 0; i < a.length; i++) a[i] = rand();
  return a;
}
/** Tileable value noise: a size x size lattice sampled with smoothstep, at 256 px. */
function valueLayer(out: Float32Array, size: number, weight: number, rand: () => number): void {
  const g = lattice(size, rand);
  const N = 256;
  const cell = N / size;
  for (let y = 0; y < N; y++) {
    const fy = y / cell;
    const y0 = Math.floor(fy) % size;
    const y1 = (y0 + 1) % size;
    let ty = fy - Math.floor(fy);
    ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < N; x++) {
      const fx = x / cell;
      const x0 = Math.floor(fx) % size;
      const x1 = (x0 + 1) % size;
      let tx = fx - Math.floor(fx);
      tx = tx * tx * (3 - 2 * tx);
      const a = g[y0 * size + x0] + (g[y0 * size + x1] - g[y0 * size + x0]) * tx;
      const b = g[y1 * size + x0] + (g[y1 * size + x1] - g[y1 * size + x0]) * tx;
      out[y * N + x] += (a + (b - a) * ty) * weight;
    }
  }
}
/** mulberry32: a seeded generator, so the noise (and every develop) is identical on every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function noiseTexture(): any {
  if (noise) return noise;
  const N = 256;
  const rand = mulberry32(0x1d64);
  const blotch = new Float32Array(N * N);
  valueLayer(blotch, 8, 0.55, rand);
  valueLayer(blotch, 16, 0.3, rand);
  valueLayer(blotch, 32, 0.15, rand);
  const warpA = new Float32Array(N * N);
  valueLayer(warpA, 16, 1, rand);
  const warpB = new Float32Array(N * N);
  valueLayer(warpB, 16, 1, rand);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = Math.round(blotch[i] * 255);
    data[i * 4 + 1] = Math.floor(rand() * 256);
    data[i * 4 + 2] = Math.round(warpA[i] * 255);
    data[i * 4 + 3] = Math.round(warpB[i] * 255);
  }
  noise = new DataTexture(data, N, N, RGBAFormat, UnsignedByteType);
  noise.wrapS = noise.wrapT = RepeatWrapping;
  noise.magFilter = noise.minFilter = LinearFilter;
  noise.generateMipmaps = false;
  noise.colorSpace = NoColorSpace;
  noise.needsUpdate = true;
  return noise;
}

// ---------------------------------------------------------------- the material
const VERT = /* glsl */ `
varying vec2 vUv;
#ifdef SCREEN_CLIP
uniform vec4 uC0;
uniform vec4 uC1;
uniform vec4 uC2;
uniform vec4 uC3;
uniform vec4 uRemap; // x' = x * uRemap.x + w * uRemap.z, y' = y * uRemap.y + w * uRemap.w
#endif
#ifdef CLIP_BODY
uniform vec3 uW0;
uniform vec3 uW1;
uniform vec3 uW2;
uniform vec3 uW3;
varying vec3 vWorld;
#endif
void main() {
  vUv = uv;
#ifdef SCREEN_CLIP
  vec4 c = uv.y < 0.5 ? (uv.x < 0.5 ? uC0 : uC1) : (uv.x < 0.5 ? uC2 : uC3);
  gl_Position = vec4(c.x * uRemap.x + c.w * uRemap.z, c.y * uRemap.y + c.w * uRemap.w, c.z, c.w);
#ifdef CLIP_BODY
  vWorld = uv.y < 0.5 ? (uv.x < 0.5 ? uW0 : uW1) : (uv.x < 0.5 ? uW2 : uW3);
#endif
#else
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
#endif
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform sampler2D uNoise;
uniform float uD;        // develop, 0..1 (already on the curve)
uniform float uTime;     // seconds, for the 12 fps grain boil
uniform vec2 uSeed;      // per-print offset into the noise
uniform vec4 uWin;       // picture window in card UV: x0, y0, x1, y1
uniform vec2 uPad;       // shadow margin of the quad, in quad UV
uniform vec2 uAspect;    // card width / height in px (for round corners and the shadow)
uniform float uRadius;   // corner radius as a share of the card width
uniform float uShadow;   // 0 (in the camera) .. 1 (resting on the table)
uniform float uAlpha;
varying vec2 vUv;
#ifdef CLIP_BODY
// The camera body's volume below its exit slot (model space, metres): a print still inside it is not drawn, so it
// leaves through the slot; the depth of the parts in front of it (dials, the top plate) hides the rest.
uniform float uBodyClip;
uniform vec3 uExit;
varying vec3 vWorld;
#endif

const vec3 VEIL = vec3(0.235, 0.373, 0.384);
const vec3 UNDEV = vec3(0.090, 0.118, 0.125);
const vec3 SHADOW = vec3(0.075, 0.090, 0.102);

float roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main() {
#ifdef CLIP_BODY
  if (uBodyClip > 0.5 && vWorld.y < uExit.y && abs(vWorld.x) < 0.068 && vWorld.z > -0.046 && vWorld.z < 0.03) discard;
#endif
  vec2 cuv = (vUv - uPad) / (1.0 - 2.0 * uPad);
  // Card-space distance in px-like units (card width = 1).
  vec2 p = (cuv - 0.5) * vec2(1.0, uAspect.y / uAspect.x);
  vec2 hb = vec2(0.5, 0.5 * uAspect.y / uAspect.x);
  float aa = fwidth(p.x) * 0.75;
  float dCard = roundBox(p, hb, uRadius);
  float inside = 1.0 - smoothstep(-aa, aa, dCard);
  // A soft contact shadow under the card (it rests on the table once it lands).
  float dShadow = roundBox(p - vec2(0.0, -0.014), hb, uRadius);
  float sh = uShadow * 0.30 * (1.0 - smoothstep(-0.01, 0.07, dShadow));
  if (inside <= 0.0) {
    if (sh <= 0.002) discard;
    gl_FragColor = vec4(SHADOW, sh * uAlpha);
    return;
  }
  vec4 nz = texture2D(uNoise, cuv * vec2(0.9, 1.45) + uSeed);
  vec2 wuv = (cuv - uWin.xy) / (uWin.zw - uWin.xy);
  float inWin = step(0.0, wuv.x) * step(wuv.x, 1.0) * step(0.0, wuv.y) * step(wuv.y, 1.0);
  float d = uD;
#ifdef LITE
  vec3 img = texture2D(uMap, cuv).rgb;
#else
  // Per-channel emulsion warp, gone by d 0.85.
  vec2 w = (nz.ba - 0.5) * 0.010 * (1.0 - smoothstep(0.0, 0.85, d)) * inWin;
  vec3 img = vec3(texture2D(uMap, cuv + w).r, texture2D(uMap, cuv).g, texture2D(uMap, cuv - w).b);
#endif
  vec3 col = img;
  if (inWin > 0.5) {
    float lum = dot(img, vec3(0.2126, 0.7152, 0.0722));
    // Light first, from the eject edge (the top of the window leaves the camera first), in blotches.
    float delay = 0.17 * (1.0 - wuv.y) + 0.17 * nz.r + 0.12 * (1.0 - lum);
    float pr = clamp((d - delay) / (1.0 - delay), 0.0, 1.0);
    pr = pr * pr * (3.0 - 2.0 * pr);
    // Silver before dye; dye B, then G, then R.
    vec3 dye = vec3(smoothstep(0.42, 1.0, pr), smoothstep(0.28, 0.92, pr), smoothstep(0.14, 0.84, pr));
    vec3 c = mix(vec3(lum), img, dye);
    c = mix(UNDEV, c, smoothstep(0.0, 0.5, pr));
    // The cyan veil clears last.
    c = mix(c, VEIL, (1.0 - smoothstep(0.3, 1.0, pr)) * 0.62);
    // Grain boils at 12 fps and is exactly 0 at d = 1.
    float g = texture2D(uNoise, cuv * vec2(2.3, 3.7) + vec2(floor(uTime * 12.0) * 0.1373, floor(uTime * 12.0) * 0.0791)).g - 0.5;
    c += g * 0.08 * (1.0 - d);
    col = c;
  }
  gl_FragColor = vec4(col, inside * uAlpha);
}`;

export interface DevelopOptions {
  map: unknown;
  lite?: boolean;
  /** Corners arrive as clip coordinates (see SCREEN_CLIP above). */
  screenClip?: boolean;
  /** With screenClip: discard the part of the print inside the camera body (below the exit slot). */
  clipBody?: boolean;
  /** Shadow margin around the card, as a share of the quad (each side). */
  pad?: [number, number];
  /** Card size in px (any unit; only the ratio matters). */
  card?: [number, number];
  /** Picture window in card UV (x0, y0, x1, y1), UV origin bottom-left. */
  window?: [number, number, number, number];
  seed?: number;
}

/** One develop material per print. Uniform uD drives it; at uD = 1 it outputs the still exactly. */
export function createDevelopMaterial(o: DevelopOptions): any {
  const card = o.card ?? [54, 86];
  // The instant print's window (W-D006): 46 x 62 at (4, 5) from the top-left of a 54 x 86 card; UV is bottom-up.
  const win = o.window ?? [4 / 54, 1 - (5 + 62) / 86, 50 / 54, 1 - 5 / 86];
  const seed = o.seed ?? 0;
  const defines: Record<string, string> = {};
  if (o.lite) defines.LITE = '';
  if (o.screenClip) defines.SCREEN_CLIP = '';
  if (o.screenClip && o.clipBody) defines.CLIP_BODY = '';
  return new ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines,
    uniforms: {
      uMap: { value: o.map },
      uNoise: { value: noiseTexture() },
      uD: { value: 0 },
      uTime: { value: 0 },
      uSeed: { value: new Vector2(((seed * 0.6180339) % 1), ((seed * 0.4142136) % 1)) },
      uWin: { value: new Vector4(...win) },
      uPad: { value: new Vector2(...(o.pad ?? [0, 0])) },
      uAspect: { value: new Vector2(card[0], card[1]) },
      uRadius: { value: 2 / 260 },
      uShadow: { value: 0 },
      uAlpha: { value: 1 },
      uC0: { value: new Vector4() },
      uC1: { value: new Vector4() },
      uC2: { value: new Vector4() },
      uC3: { value: new Vector4() },
      uRemap: { value: new Vector4(1, 1, 0, 0) },
      uW0: { value: new Vector3() },
      uW1: { value: new Vector3() },
      uW2: { value: new Vector3() },
      uW3: { value: new Vector3() },
      uExit: { value: new Vector3() },
      uBodyClip: { value: 0 },
    },
    transparent: true,
    toneMapped: false,
    depthWrite: false,
  });
}
