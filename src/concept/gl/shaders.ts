// GLSL for the Refraction concept. Everything works in CSS pixels with y down, so DOM rects map 1:1.
// Three passes: plates (generated covers) and mirrored text go into a scene target; the lens pass refracts it.

export const FULL_VERT = /* glsl */ `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

/** Mirrored display type: a full-viewport 2D-canvas texture composited over the plates. */
export const TEXT_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uText;
in vec2 vUv;
out vec4 fragColor;
void main() {
  fragColor = texture(uText, vUv);
}`;

export const PLATE_VERT = /* glsl */ `#version 300 es
in vec3 position;
uniform vec4 uRect;   // x, y, w, h in CSS px
uniform vec2 uView;   // viewport in CSS px
out vec2 vLocal;      // 0..1, y down
void main() {
  vec2 l = position.xy + 0.5;
  vLocal = vec2(l.x, 1.0 - l.y);
  vec2 px = uRect.xy + vLocal * uRect.zw;
  vec2 clip = px / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`;

/**
 * Generated placeholder covers: four optical studies (caustics, a grid under drifting lenses, interference rings, a
 * ray bundle through a lens), seeded by slug and tinted by the project's tint. Dark, with luminous detail.
 * A second cover (B) can stand on one side of a vertical split: the glass slab hides the seam.
 */
export const PLATE_FRAG = /* glsl */ `#version 300 es
precision highp float;
in vec2 vLocal;
uniform vec4 uRect;
uniform float uTime;
uniform vec2 uA;       // seed, mode
uniform vec2 uB;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform float uSplit;  // CSS px x of the seam
uniform float uDir;    // 0: A only; +1: B right of the seam; -1: B left of it
uniform float uExposure;
uniform float uHover;
out vec4 fragColor;
${NOISE}

float voroEdge(vec2 p, float t) {
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash2(ip + g);
    o = 0.5 + 0.42 * sin(t + 6.2831 * o);
    vec2 r = g + o - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return sqrt(f2) - sqrt(f1);
}

vec3 litOf(vec3 tint) { return mix(tint * 2.6, vec3(1.0, 0.97, 0.92), 0.5); }

vec3 caustics(vec2 q, float s, vec3 tint, float t) {
  vec2 p = rot(s * 6.2831) * q * (2.4 + fract(s * 7.1) * 1.4);
  vec2 w = vec2(fbm(p * 0.7 + vec2(t * 0.06, s * 10.0)), fbm(p * 0.7 + vec2(s * 3.0, -t * 0.05))) - 0.5;
  p += w * 1.4;
  float e1 = voroEdge(p + s * 13.0, t * 0.30);
  float e2 = voroEdge(p * 1.9 + 4.0 + s * 7.0, t * 0.38 + 1.0);
  float c = exp(-e1 * 9.0) + 0.5 * exp(-e2 * 11.0);
  vec3 col = tint * (0.16 + 0.26 * smoothstep(0.8, -0.7, q.y + w.x));
  col += litOf(tint) * c * c * 0.62;
  return col;
}

float gridLine(vec2 q, vec2 off, float k, float density) {
  vec2 g = (q + off * k) * density;
  vec2 f = 0.5 - abs(fract(g) - 0.5);
  vec2 fw = max(fwidth(g), vec2(1e-4));
  float lx = 1.0 - smoothstep(0.3, 1.3, f.x / fw.x);
  float ly = 1.0 - smoothstep(0.3, 1.3, f.y / fw.y);
  return max(lx, ly);
}

vec3 lensGrid(vec2 q, float s, vec3 tint, float t) {
  vec2 off = vec2(0.0);
  float glow = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t * 0.09 + s * 9.0 + fi * 2.1) * 0.62, cos(t * 0.07 + s * 5.0 + fi * 1.7) * 0.26);
    float r = 0.2 + 0.09 * fract(s * 3.3 + fi * 0.37);
    vec2 d = q - c;
    float h = smoothstep(r, r * 0.1, length(d));
    off -= d * h * 0.6;
    glow += h;
  }
  float density = 13.0 + floor(fract(s * 5.7) * 3.0) * 4.0;
  vec3 lines = vec3(gridLine(q, off, 0.93, density), gridLine(q, off, 1.0, density), gridLine(q, off, 1.07, density));
  vec3 col = tint * (0.16 + 0.22 * glow);
  col += lines * mix(tint * 2.6, vec3(0.95), 0.55) * (0.42 + 0.3 * glow);
  return col;
}

vec3 rings(vec2 q, float s, vec3 tint, float t) {
  float v = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(s * 11.0 + fi * 2.4 + t * 0.05) * 0.75, cos(s * 7.0 + fi * 1.9 + t * 0.04) * 0.42);
    v += sin(length(q - c) * (34.0 + fi * 9.0 + fract(s * 3.0) * 16.0) - t * (0.7 + fi * 0.25));
  }
  v /= 3.0;
  float hi = smoothstep(0.38, 0.95, v);
  float mid = smoothstep(-0.25, 0.35, v);
  return tint * 0.14 + tint * 0.32 * mid + litOf(tint) * hi * 0.55;
}

float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

vec3 rays(vec2 q, float s, vec3 tint, float t, float pxu) {
  float lx = -0.2 + (fract(s * 4.1) - 0.5) * 0.3;
  vec2 F = vec2(lx + 0.42 + fract(s * 2.3) * 0.18, (fract(s * 6.7) - 0.5) * 0.16 + sin(t * 0.21) * 0.025);
  float acc = 0.0;
  for (int k = 0; k < 23; k++) {
    float fk = float(k);
    float y0 = -0.44 + 0.88 * fk / 22.0;
    vec2 A = vec2(-2.5, y0);
    vec2 B = vec2(lx + 0.02 * (1.0 - y0 * y0 * 4.0), y0);
    vec2 C = B + (F - B) * 2.6;
    float d = min(sdSeg(q, A, B), sdSeg(q, B, C));
    acc += (1.0 - smoothstep(0.0, pxu * 1.4, d)) * (0.5 + 0.5 * sin(fk * 1.7 + s * 9.0 + t * 0.3));
  }
  float le = abs(length((q - vec2(lx, 0.0)) / vec2(0.045, 0.5)) - 1.0) * 0.045;
  float lensLine = 1.0 - smoothstep(0.0, pxu * 1.3, le);
  float fg = exp(-length(q - F) * 16.0);
  vec3 lit = litOf(tint);
  return tint * 0.16 + lit * acc * 0.42 + lit * lensLine * 0.3 + lit * fg * 0.5;
}

vec3 cover(vec2 q, float seed, float mode, vec3 tint, float pxu) {
  float t = uTime * (1.0 + uHover * 0.6);
  if (mode < 0.5) return caustics(q, seed, tint, t);
  if (mode < 1.5) return lensGrid(q, seed, tint, t);
  if (mode < 2.5) return rings(q, seed, tint, t);
  return rays(q, seed, tint, t, pxu);
}

void main() {
  vec2 q = (vLocal - 0.5) * vec2(uRect.z / uRect.w, 1.0);
  float pxu = 1.0 / uRect.w;
  float x = uRect.x + vLocal.x * uRect.z;
  bool useB = uDir != 0.0 && (x - uSplit) * uDir > 0.0;
  vec3 col = useB ? cover(q, uB.x, uB.y, uTintB, pxu) : cover(q, uA.x, uA.y, uTintA, pxu);
  vec2 v = vLocal - 0.5;
  col *= 1.0 - 0.55 * dot(v, v);
  float e = clamp(uExposure, 0.0, 1.0);
  float k = 2.4;
  col = (1.0 - exp(-col * k * e * e)) / (1.0 - exp(-k));
  fragColor = vec4(col, 1.0);
}`;

/**
 * The lens. Up to six shapes (rounded boxes with rotation) smooth-unioned into one liquid body. A squircle bevel
 * gives the surface slope; the rim pulls what lies outside into the edge, the centre magnifies, six spectral taps
 * split light at the rim. Fresnel, a dual rim highlight, a pointer-led specular, a shadow and a caustic finish it.
 */
export const LENS_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uDpr;
uniform vec4 uShapes[6];
uniform float uShapeR[6];
uniform float uShapeRot[6];
uniform float uShapeK[6];
uniform int uCount;
uniform float uK;
uniform float uBevel;
uniform float uRefract;
uniform float uMag;
uniform float uDisp;
uniform float uAlpha;
uniform vec2 uLight;
uniform float uTime;
uniform float uWobble;
uniform float uShade;
uniform float uCaust;
out vec4 fragColor;
${NOISE}

float sdRBox(vec2 p, vec2 b, float r) {
  r = min(r, min(b.x, b.y));
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float lensSdf(vec2 p, out vec2 c, out float big) {
  float d = 1e5;
  float ds[6];
  for (int i = 0; i < 6; i++) {
    ds[i] = 1e5;
    if (i >= uCount) break;
    vec4 s = uShapes[i];
    vec2 q = p - s.xy;
    float a = uShapeRot[i];
    float ca = cos(a), sa = sin(a);
    q = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y);
    float di = sdRBox(q, s.zw, uShapeR[i]);
    ds[i] = di;
    d = smin(d, di, max(uShapeK[i], 0.001));
  }
  // blend the optical centre between shapes so the union never creases
  vec2 cs = vec2(0.0);
  float bs = 0.0, ws = 0.0;
  for (int i = 0; i < 6; i++) {
    if (i >= uCount) break;
    float w = exp(-(max(ds[i], d) - d) / (uK * 0.35 + 6.0));
    cs += uShapes[i].xy * w;
    bs += min(uShapes[i].z, uShapes[i].w) * w;
    ws += w;
  }
  c = cs / max(ws, 1e-5);
  big = bs / max(ws, 1e-5);
  return d;
}
float lensDOnly(vec2 p) {
  float d = 1e5;
  for (int i = 0; i < 6; i++) {
    if (i >= uCount) break;
    vec4 s = uShapes[i];
    vec2 q = p - s.xy;
    float a = uShapeRot[i];
    float ca = cos(a), sa = sin(a);
    q = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y);
    d = smin(d, sdRBox(q, s.zw, uShapeR[i]), max(uShapeK[i], 0.001));
  }
  return d;
}
float lensD(vec2 p) { return lensDOnly(p); }

vec3 scene(vec2 q) {
  vec2 uv = vec2(q.x * uDpr / uRes.x, 1.0 - q.y * uDpr / uRes.y);
  return texture(uScene, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec3 base = scene(p);
  if (uAlpha < 0.002 || uCount == 0) { fragColor = vec4(base, 1.0); return; }
  vec2 c;
  float big;
  float d = lensSdf(p, c, big);
  if (d > 120.0) { fragColor = vec4(base, 1.0); return; }

  vec2 g = vec2(lensD(p + vec2(1.0, 0.0)) - d, lensD(p + vec2(0.0, 1.0)) - d);
  float gl = length(g);
  vec2 nrm = gl > 1e-5 ? g / gl : vec2(0.0);
  vec2 Ld = normalize(uLight + vec2(1e-4));
  vec3 col = base;
  float bevel = min(uBevel, big * 0.92);

  if (d < 0.0) {
    float x = clamp(-d / bevel, 0.0, 1.0);
    float slope = (1.0 - x) * (1.0 - x);
    vec2 nxy = nrm * slope;
    if (uWobble > 0.0) {
      vec2 w = vec2(vnoise(p * 0.016 + uTime * 0.55), vnoise(p * 0.016 - uTime * 0.45 + 7.3)) - 0.5;
      nxy += w * uWobble * (0.3 + 0.7 * slope);
    }
    vec3 n = normalize(vec3(nxy * 1.35, 1.0));
    vec2 rel = p - c;
    vec3 acc = vec3(0.0);
    vec3 wsum = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      float t = float(i) / 5.0;
      float k = 1.0 + uDisp * (t - 0.5) * 2.0;
      vec2 q = c + rel * (1.0 - uMag * (1.0 + (k - 1.0) * 0.12) * (0.35 + 0.65 * x)) + nxy * uRefract * k;
      vec3 wgt = max(vec3(1.0 - t * 2.2, 1.0 - abs(t - 0.5) * 2.2, t * 2.2 - 1.2), 0.0);
      acc += scene(q) * wgt;
      wsum += wgt;
    }
    col = acc / wsum;

    // glass body: a breath of lift, absorption toward the thick rim
    col = col * (0.99 - 0.05 * slope) + 0.006 * uShade;
    float fres = pow(1.0 - n.z, 1.4);
    col += fres * 0.16 * uShade;
    // the room in the glass: a broad soft reflection on the bevel that faces the light
    float env = smoothstep(-0.1, 0.95, dot(nrm, Ld)) * smoothstep(0.05, 0.7, slope);
    col += env * vec3(0.92, 0.96, 1.0) * 0.075 * uShade;
    vec3 L = normalize(vec3(Ld * 0.95, 0.62));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 70.0);
    col += spec * 0.75 * uShade;
    float rim = smoothstep(-2.6, -0.8, d) * (1.0 - smoothstep(-0.8, 0.2, d));
    float facing = max(dot(nrm, Ld), 0.0);
    float away = max(dot(nrm, -Ld), 0.0);
    col += rim * (0.18 + 0.82 * facing) * 0.9 * uShade;
    // light carried through the body exits on the far side: a soft transmitted glow inside the rim
    float inner = (1.0 - smoothstep(0.0, bevel * 1.1, -d)) * pow(away, 1.5);
    col += inner * vec3(1.0, 0.97, 0.92) * 0.2 * uShade;
  } else {
    float off = 14.0 + big * 0.2;
    float dsh = lensD(p + Ld * off);
    float sh = 1.0 - smoothstep(-12.0, 46.0, dsh);
    col *= 1.0 - 0.25 * sh * uShade;
    // the light the glass focuses lands beyond it: a caustic pool inside the shadow, brightest at its core
    float core = 1.0 - smoothstep(-off * 1.1, 2.0, dsh);
    float caust = core * smoothstep(0.0, 10.0, d) * (0.5 + 0.5 * smoothstep(0.0, off * 0.6, d));
    vec3 cc = vec3(1.0, 0.95, 0.86) + vec3(0.06, -0.02, -0.08) * sin(d * 0.25);
    col += caust * cc * (0.06 + uCaust) * uShade;
    col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 2.0, d)) * uShade;
  }
  fragColor = vec4(mix(base, col, uAlpha), 1.0);
}`;

/** The ground: near-black with one soft, slow light pool, so clear glass always has something to bend. */
export const GROUND_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform vec3 uPool;    // x, y, radius (CSS px)
uniform float uGround; // pool strength
out vec4 fragColor;
${NOISE}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec3 col = vec3(10.0, 10.0, 11.0) / 255.0;
  vec2 c = uPool.xy + vec2(sin(uTime * 0.05), cos(uTime * 0.04)) * uPool.z * 0.08;
  float d = length(p - c) / uPool.z;
  float pool = exp(-d * d * 1.6);
  float grain = fbm(p * 0.0035 + uTime * 0.01) - 0.5;
  col += vec3(1.0, 0.98, 0.95) * (pool * 0.05 + grain * 0.012) * uGround;
  fragColor = vec4(col, 1.0);
}`;
