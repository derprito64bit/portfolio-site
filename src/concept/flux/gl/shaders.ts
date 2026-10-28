// Flux shaders. GLSL ES 3.00 (WebGL2 only; without it the page runs its still, DOM-only path).
//
// The fluid solver (curl, vorticity, divergence, Jacobi pressure, gradient subtract, semi-Lagrangian advection) follows
// the stable-fluids method as structured in PavelDoGreat's WebGL-Fluid-Simulation:
//   MIT License, Copyright (c) 2017 Pavel Dobryakov. Permission is hereby granted, free of charge, to any person
//   obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software
//   without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute,
//   sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so,
//   subject to the following conditions: The above copyright notice and this permission notice shall be included in all
//   copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
// Everything else (the marbling map, drops, film colour, covers, planes, glass) is written for this concept.

export const VERT_QUAD = /* glsl */ `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
`;

const HEAD = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
`;

// ---------------------------------------------------------------- fluid
export const FRAG_SPLAT = HEAD + /* glsl */ `
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
uniform float uRing; // 0: gaussian blob; >0: radial ring of this radius pushing outward
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 base = texture(uTarget, vUv).xyz;
  vec3 s;
  if (uRing > 0.0) {
    float d = length(p);
    float g = exp(-pow(d - uRing, 2.0) / uRadius);
    vec2 dir = d > 1e-4 ? p / d : vec2(0.0);
    s = vec3(dir * uColor.x * g, 0.0);
  } else {
    s = exp(-dot(p, p) / uRadius) * uColor;
  }
  fragColor = vec4(base + s, 1.0);
}
`;

export const FRAG_CURL = HEAD + /* glsl */ `
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}
`;

export const FRAG_VORTICITY = HEAD + /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uCurlStrength;
uniform float uDt;
void main() {
  float L = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy + force * uDt;
  fragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}
`;

export const FRAG_DIVERGENCE = HEAD + /* glsl */ `
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  vec2 vL = vUv - vec2(uTexel.x, 0.0), vR = vUv + vec2(uTexel.x, 0.0);
  vec2 vT = vUv + vec2(0.0, uTexel.y), vB = vUv - vec2(0.0, uTexel.y);
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}
`;

export const FRAG_CLEAR = HEAD + /* glsl */ `
uniform sampler2D uTexture;
uniform float uValue;
void main() { fragColor = uValue * texture(uTexture, vUv); }
`;

export const FRAG_PRESSURE = HEAD + /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float div = texture(uDivergence, vUv).x;
  fragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}
`;

export const FRAG_GRADIENT = HEAD + /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  vec2 vel = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  fragColor = vec4(vel, 0.0, 1.0);
}
`;

export const FRAG_ADVECT = HEAD + /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;
  fragColor = texture(uSource, coord) / (1.0 + uDissipation * uDt);
}
`;

// ---------------------------------------------------------------- shared field maths
const NOISE = /* glsl */ `
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float hash1(float n) { return fract(sin(n * 91.3458) * 47453.5453); }
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { s += a * gnoise(p); p = m * p; a *= 0.5; }
  return s;
}
float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) { s += a * gnoise(p); p = m * p; a *= 0.5; }
  return s;
}
// Thin-film interference: reflectance of a soap/oil film of thickness t (0..1 maps to about 250..1000 nm).
vec3 film(float t) {
  float d = 250.0 + 750.0 * t;
  vec3 ph = 12.566 * 1.33 * d / vec3(650.0, 532.0, 450.0);
  vec3 c = 0.5 + 0.5 * cos(ph + 3.14159);
  float l = dot(c, vec3(0.333));
  c = mix(vec3(l), c, 0.62);
  return c * vec3(1.06, 0.98, 0.92);
}
`;

// ---------------------------------------------------------------- marbling look (shared by the loader and the field)
// Wide bands of ink, each a different pigment; a fine vein where two meet, a wet sheen beside it, and the oil film's
// colour visible even at rest (vivid), flaring where the surface is stirred (e).
const MARBLE = /* glsl */ `
const vec3 INK = vec3(0.010, 0.010, 0.012);
vec3 filmAt(vec2 uv, float phase, float e, float t) {
  float thick = 0.5 + 0.28 * sin(uv.x * 2.1 + uv.y * 1.3 + t * 0.05) + 0.18 * sin(uv.y * 3.7 - uv.x * 1.1 - t * 0.04);
  return film(fract(thick + phase * 0.05 + e * 0.22));
}
vec3 marble(float ph, float w, float e, float soft, vec3 fc, float dpr, float vivid) {
  float f = fract(ph);
  float band = floor(ph);
  float hb = hash1(band * 1.37 + 0.2);
  float dense = smoothstep(0.10, 0.32, w);
  vec3 fill;
  if (hb < 0.30) fill = INK;
  else if (hb < 0.56) fill = INK + fc * (0.05 + 0.12 * vivid + 0.06 * e);
  else if (hb < 0.80) fill = vec3(0.034, 0.034, 0.037) + fc * 0.02;
  else fill = vec3(0.085, 0.082, 0.077) + fc * 0.05;
  // pigment texture inside each band, so a band reads as ink, not as a flat fill
  fill *= 0.86 + 0.28 * fract(sin(band * 12.9898) * 43758.5) * (0.6 + 0.4 * f);
  fill = mix(fill, INK + fc * 0.03, dense);
  float dist = min(f, 1.0 - f) / w;
  float lw = mix(0.9, 2.1, hb) * dpr * (1.0 + soft * 4.0);
  float line = clamp(lw - dist + 0.5, 0.0, 1.0) * (1.0 - dense) / (1.0 + soft * 2.2);
  float sheen = exp(-dist / (7.0 * dpr * (1.0 + soft * 3.0))) * (1.0 - dense);
  vec3 silver = vec3(0.62, 0.61, 0.59);
  vec3 lineCol = mix(silver, fc * 1.25, clamp(vivid + 0.65 * e, 0.0, 0.85));
  return fill + lineCol * (line * (0.24 + 0.8 * e) + sheen * (0.04 + 0.07 * vivid));
}
`;

// ---------------------------------------------------------------- loader: the first drop, before the full field compiles
export const FRAG_LOADER = HEAD + NOISE + MARBLE + /* glsl */ `
uniform vec2 uRes;
uniform float uDpr;
uniform float uR;
uniform float uK;
uniform float uBands;
uniform float uVivid;
uniform float uTime;
void main() {
  float aspect = uRes.x / uRes.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float d = length(p);
  float ph = max(0.0, uR - d) * uK * uBands;
  float w = max(fwidth(ph), 1e-4);
  vec3 fc = filmAt(vUv, ph / uBands, uVivid, uTime);
  vec3 col = marble(ph, w, 0.0, 0.0, fc, uDpr, uVivid);
  col *= 1.0 - smoothstep(uR * 1.03, uR * 1.03 + 0.006, d);
  // the drop's own edge: visible from the first frame, however small the drop still is
  float edgePx = abs(d - uR) * uRes.y;
  col += mix(vec3(0.62, 0.61, 0.59), fc * 1.2, uVivid) * clamp(1.6 * uDpr - edgePx + 0.5, 0.0, 1.0) * 0.55;
  fragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------- ink map (marbling)
// RGBA16F: xy = displacement of the material (uv), z = energy (how stirred), w = phase (the marbling scalar).
export const FRAG_INK = HEAD + NOISE + /* glsl */ `
uniform sampler2D uInk;
uniform sampler2D uVelocity;
uniform vec2 uSimTexel;
uniform float uDt;
uniform float uRelax;
uniform float uEnergyDecay;
uniform float uEnergyGain;
uniform float uTime;
uniform float uAspect;
uniform float uScroll;
uniform vec2 uShift;
uniform vec2 uDrift;     // the whole surface drifts off-centre
uniform float uComb;     // comb teeth on the band edges
uniform float uWave;     // a wavy stroke drawn across the surface (the marbler's comb after the drop)
uniform vec4 uDrop[6];   // xy centre (field space), z radius, w ring density
uniform float uDropVivid[6];

float baseField(vec2 p, float t) {
  vec2 q = vec2(fbm3(p * 0.9 + vec2(0.0, t * 0.035)), fbm3(p * 0.9 + vec2(5.2, 1.3) - vec2(t * 0.03, 0.0)));
  vec2 r = vec2(fbm3(p * 1.15 + q * 1.8 + vec2(1.7, 9.2) + t * 0.02), fbm3(p * 1.15 + q * 1.8 + vec2(8.3, 2.8) - t * 0.017));
  return fbm3(p * 0.62 + r * 1.25) * 2.3 + p.y * 0.62 + p.x * 0.12;
}

void main() {
  // a tent-filtered velocity: no kinks at the simulation's texel scale
  vec2 h = uSimTexel * 0.75;
  vec2 vel = (texture(uVelocity, vUv).xy * 2.0 + texture(uVelocity, vUv + h).xy + texture(uVelocity, vUv - h).xy
            + texture(uVelocity, vUv + vec2(h.x, -h.y)).xy + texture(uVelocity, vUv + vec2(-h.x, h.y)).xy) / 6.0;
  vec2 step = uDt * vel * uSimTexel;
  vec2 src = vUv - step - uShift;
  vec4 prev = texture(uInk, src);
  vec2 it = 1.0 / vec2(textureSize(uInk, 0));
  vec2 nb = (texture(uInk, src + vec2(it.x, 0.0)).xy + texture(uInk, src - vec2(it.x, 0.0)).xy
           + texture(uInk, src + vec2(0.0, it.y)).xy + texture(uInk, src - vec2(0.0, it.y)).xy) * 0.25;
  vec2 D = (mix(prev.xy, nb, 0.22) - step) * (1.0 - uRelax);
  float dl = length(D);
  if (dl > 0.12) D *= 0.12 / dl;
  float E = prev.z * uEnergyDecay + length(vel) * uEnergyGain * uDt;

  vec2 q = vUv + D;
  vec2 p = (q - 0.5) * vec2(uAspect, 1.0);
  p.y -= uScroll;
  p -= uDrift;

  // Drops, newest first (index 5 is newest). Inside a drop: concentric rings of its own ink.
  // Outside: the surface is pushed aside (a finite-slope version of marbling's area-preserving push).
  float acc = 0.0;
  float glow = 0.0;
  for (int i = 5; i >= 0; i--) {
    vec4 dr = uDrop[i];
    if (dr.z <= 0.0) continue;
    vec2 dv = p - dr.xy;
    float d = length(dv);
    if (d < dr.z) {
      acc += (dr.z - d) * dr.w;
      glow = max(glow, uDropVivid[i] * (0.55 + 0.45 * d / dr.z));
      p = dr.xy;
    } else {
      p = dr.xy + dv * (1.0 - (dr.z * dr.z) / (d * d));
    }
  }
  // the marbler's strokes, applied after the drops: a wavy stroke, then a fine comb (teeth on every edge)
  p.y += uWave * sin(p.x * 7.5 + 0.8) + uWave * 0.4 * sin(p.x * 17.0 - 1.1);
  p.x += uWave * 0.5 * sin(p.y * 5.0 + 2.0);
  p.x += uComb * sin(p.y * 46.0 + 1.3);
  p.y += uComb * 0.45 * sin(p.x * 29.0 + 0.4);
  float phase = baseField(p, uTime) + acc;
  E = clamp(max(E, glow), 0.0, 1.6);
  fragColor = vec4(D, E, phase);
}
`;

// ---------------------------------------------------------------- composite (the field you see)
export const FRAG_FIELD = HEAD + NOISE + MARBLE + /* glsl */ `
uniform sampler2D uInk;
uniform vec2 uRes;          // device px
uniform float uDpr;
uniform float uBands;
uniform float uDim;
uniform float uReveal;      // radius of the visible disc (field units, height = 1)
uniform vec2 uRevealC;      // centre in uv
uniform float uDefocus;     // 0..1 outside the frame
uniform vec4 uFrame;        // focus frame in uv (x0, y0, x1, y1), sharp inside
uniform float uFrameOn;
uniform float uTime;
uniform float uVivid;       // film colour at rest

void main() {
  vec2 uv = vUv;
  vec2 px = gl_FragCoord.xy;
  float aspect = uRes.x / uRes.y;
  float inFrame = 0.0;
  if (uFrameOn > 0.0) {
    vec2 a = smoothstep(uFrame.xy - 0.004, uFrame.xy, uv) * (1.0 - smoothstep(uFrame.zw, uFrame.zw + 0.004, uv));
    inFrame = a.x * a.y * uFrameOn;
  }
  float soft = uDefocus * (1.0 - inFrame);
  vec4 k = texture(uInk, uv);
  float ph = k.w * uBands;
  float w = max(fwidth(ph), 1e-4);
  float e = clamp(k.z, 0.0, 1.0);
  vec3 fc = filmAt(uv, k.w, e, uTime);
  vec3 col = marble(ph, w, e, soft, fc, uDpr, uVivid);
  col *= mix(1.0, 0.55, soft);
  col *= mix(uDim, 1.0, inFrame);
  vec2 rp = (uv - uRevealC) * vec2(aspect, 1.0);
  col *= 1.0 - smoothstep(uReveal, uReveal + 0.004 + uReveal * 0.02, length(rp));
  vec2 vq = uv - 0.5;
  col *= 1.0 - 0.38 * dot(vq, vq) * 2.0;
  col += (fract(sin(dot(px, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------- final pass: glass and medal, then the lenses, over everything
export const FRAG_FINAL = HEAD + NOISE + /* glsl */ `
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform vec4 uLens[3];      // centre px (device, y up), half size px
uniform float uLensR[3];    // corner radius px
uniform float uLensOn[3];
uniform vec2 uPointer;      // device px, y up
uniform vec4 uGlass;        // centre px, half size px
uniform vec2 uGlassTilt;
uniform float uGlassOn;
uniform vec4 uMedal;        // centre px, radius px, spin angle
uniform float uMedalOn;
uniform vec2 uMedalAnchor;

float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float sdArch(vec2 lp, vec2 hs) {
  float r = hs.x;
  float box = sdBox(lp + vec2(0.0, r * 0.5), vec2(hs.x, hs.y - r * 0.5), 6.0 * uDpr);
  float cap = length(lp - vec2(0.0, hs.y - r)) - r;
  return min(box, cap);
}
vec3 bent(vec2 uv, vec2 off) {
  return vec3(texture(uScene, uv + off).r, texture(uScene, uv + off * 1.12).g, texture(uScene, uv + off * 1.26).b);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = vUv;
  vec3 col = texture(uScene, uv).rgb;

  // --- glass award: an arched slab that bends what is behind it
  if (uGlassOn > 0.001) {
    vec2 lp = px - uGlass.xy;
    vec2 hs = uGlass.zw;
    float sd = sdArch(lp, hs);
    if (sd < 0.0) {
      float t = clamp(-sd / (26.0 * uDpr), 0.0, 1.0);
      vec2 n = normalize(vec2(sdArch(lp + vec2(1.0, 0.0), hs) - sd, sdArch(lp + vec2(0.0, 1.0), hs) - sd) + 1e-5);
      float edge = pow(1.0 - t, 2.2);
      vec2 tilt = uGlassTilt;
      vec2 off = (-n * edge * 42.0 * uDpr + tilt * 22.0 * uDpr - lp * 0.2) / uRes;
      vec3 g = bent(uv, off) * 1.75 + vec3(0.032, 0.034, 0.038) + vec3(0.05) * (1.0 - t);
      float rim = smoothstep(2.4 * uDpr, 0.0, -sd) * 0.7 + edge * 0.16;
      float lightSide = 0.5 + 0.5 * dot(-n, normalize(vec2(-0.6 + tilt.x, 0.8 + tilt.y)));
      float spec = pow(max(0.0, 1.0 - abs((lp.x + lp.y * 0.55) / (hs.x * 2.0) - 0.15 - tilt.x * 0.6)), 18.0) * 0.16 * (1.0 - t * 0.4);
      vec3 gl = g + vec3(rim * lightSide) + vec3(spec);
      float foot = smoothstep(-hs.y + 54.0 * uDpr, -hs.y + 50.0 * uDpr, lp.y);
      gl = mix(gl, vec3(0.10, 0.10, 0.11) + g * 0.35 + rim * 0.4, foot * 0.85);
      col = mix(col, gl, uGlassOn);
    } else {
      col *= 1.0 - 0.35 * uGlassOn * exp(-sd / (14.0 * uDpr));
    }
  }

  // --- medal on a thread: a domed disc that mirrors what is around it
  if (uMedalOn > 0.001) {
    vec2 c = uMedal.xy;
    float R = uMedal.z, ang = uMedal.w;
    vec2 a = uMedalAnchor, b = c + vec2(0.0, R);
    vec2 pa = px - a, ba = b - a;
    float hh = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    float th = length(pa - ba * hh);
    col = mix(col, vec3(0.62, 0.61, 0.6), uMedalOn * clamp(0.9 * uDpr - th + 0.5, 0.0, 1.0) * 0.7);
    float cs = cos(ang);
    float sx = max(abs(cs), 0.06);
    vec2 lp = (px - c) / vec2(sx, 1.0);
    float d = length(lp);
    if (d < R) {
      float rr = d / R;
      float hgt = smoothstep(0.86, 0.95, rr) * (1.0 - smoothstep(0.97, 1.0, rr)) + 0.35 * (1.0 - rr * rr) + 0.25 * smoothstep(0.58, 0.62, rr) * (1.0 - smoothstep(0.64, 0.68, rr));
      vec2 nn = (lp / max(d, 1e-3)) * (smoothstep(0.80, 1.0, rr) * 1.2 - 0.6 * rr + 0.4 * (smoothstep(0.56, 0.62, rr) - smoothstep(0.64, 0.7, rr)));
      nn.x *= sign(cs) * sx;
      vec2 off = nn * 120.0 * uDpr / uRes + vec2(sin(ang) * 0.08, 0.0);
      vec3 refl = texture(uScene, uv + off).rgb;
      float lum = dot(refl, vec3(0.333));
      vec3 metal = vec3(0.34, 0.34, 0.36) * (0.25 + 0.75 * hgt) + refl * 3.0 + film(fract(lum * 3.0 + ang * 0.1 + rr)) * 0.06;
      metal += pow(max(0.0, dot(normalize(vec3(nn, 1.0)), normalize(vec3(-0.4 + sin(ang) * 0.6, 0.6, 0.9)))), 24.0) * 0.85;
      metal *= mix(0.45, 1.0, sx);
      col = mix(col, metal, clamp((R - d) / (1.2 * uDpr), 0.0, 1.0) * uMedalOn);
    } else {
      col *= 1.0 - 0.3 * uMedalOn * exp(-(d - R) / (16.0 * uDpr));
    }
  }

  // --- liquid-glass lenses: a fish-eye of the ink inside, strong refraction and dispersion at the rim
  for (int i = 0; i < 3; i++) {
    if (uLensOn[i] < 0.001) continue;
    vec2 lp = px - uLens[i].xy;
    vec2 hs = uLens[i].zw;
    float r = min(uLensR[i], min(hs.x, hs.y));
    float sd = sdBox(lp, hs, r);
    if (sd < 0.0) {
      float bevel = min(r, 16.0 * uDpr);
      float t = clamp(-sd / bevel, 0.0, 1.0);
      vec2 n = normalize(vec2(sdBox(lp + vec2(1.0, 0.0), hs, r) - sd, sdBox(lp + vec2(0.0, 1.0), hs, r) - sd) + 1e-5);
      float edge = pow(1.0 - t, 1.6);
      vec2 q = lp / max(hs, vec2(1.0));
      vec2 off = (-n * edge * 30.0 * uDpr - lp * (0.42 - 0.18 * dot(q, q))) / uRes;
      vec3 g = bent(uv, off);
      vec2 L = normalize(uPointer - uLens[i].xy + vec2(0.0, 240.0));
      float rim = smoothstep(1.8 * uDpr, 0.0, -sd) * (0.34 + 0.5 * max(0.0, dot(-n, L)));
      float topLight = smoothstep(0.2, 1.0, q.y) * (1.0 - t * 0.6) * 0.06;
      g = g * 1.45 + vec3(0.03, 0.03, 0.034) + rim + topLight + film(fract(q.x * 0.4 + uTime * 0.03)) * edge * 0.06;
      col = mix(col, g, uLensOn[i]);
    } else {
      col *= 1.0 - 0.3 * uLensOn[i] * exp(-sd / (7.0 * uDpr));
    }
  }
  fragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------- covers (generated placeholder media)
// A marbled sheet per project (see covers.ts): the inverse of the marbler's combs, waves and swirls, then the drops.
// Loop bounds are uniforms so the compiler does not unroll them (fast compile on D3D).
export const FRAG_COVER = HEAD + NOISE + /* glsl */ `
uniform vec4 uDrops[64];
uniform int uDropN;
uniform vec4 uOpsA[8];
uniform vec4 uOpsB[8];
uniform int uOpN;
uniform int uSamples;
uniform vec3 uPal[6];
uniform vec2 uSize;
uniform sampler2D uLabel;
uniform float uSeed;

int colourAt(vec2 p) {
  for (int i = uOpN - 1; i >= 0; i--) {
    vec4 a = uOpsA[i];
    vec4 b = uOpsB[i];
    if (a.x < 1.5) {
      vec2 dir = vec2(cos(a.y), sin(a.y));
      vec2 nrm = vec2(-dir.y, dir.x);
      float u = dot(p, nrm) / a.z + b.y;
      float d = abs(fract(u + 0.5) - 0.5) * a.z;
      p -= dir * a.w * b.x / (d + b.x);
    } else if (a.x < 2.5) {
      vec2 dir = vec2(cos(a.y), sin(a.y));
      vec2 nrm = vec2(-dir.y, dir.x);
      p -= dir * a.z * sin(dot(p, nrm) * a.w + b.x);
    } else {
      vec2 d = p - a.yz;
      float r = length(d);
      float ang = -a.w * exp(-r * r / (b.x * b.x));
      float c = cos(ang), s = sin(ang);
      p = a.yz + mat2(c, -s, s, c) * d;
    }
  }
  for (int i = uDropN - 1; i >= 0; i--) {
    vec4 dr = uDrops[i];
    vec2 dv = p - dr.xy;
    float d2 = dot(dv, dv);
    float r2 = dr.z * dr.z;
    if (d2 < r2) return int(dr.w + 0.5);
    p = dr.xy + dv * sqrt(1.0 - r2 / d2);
  }
  return 0;
}

void main() {
  float aspect = uSize.x / uSize.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float px = 1.0 / uSize.y;
  vec3 col = vec3(0.0);
  int first = -1;
  bool edge = false;
  for (int s = 0; s < uSamples; s++) {
    float fs = float(s);
    vec2 o = vec2(fract(fs * 0.25 + 0.125) - 0.5, fract(fs * 0.75 + 0.375) - 0.5) * px;
    int c = colourAt(p + o);
    if (first < 0) first = c;
    else if (c != first) edge = true;
    col += uPal[c];
  }
  col /= float(uSamples);
  if (edge) col *= 0.72;
  float grainy = fbm(p * 38.0 + uSeed) * 0.5 + fbm(p * 7.0 - uSeed) * 0.5;
  col *= 0.93 + 0.12 * grainy;
  col += film(fract(p.x * 0.6 + p.y * 0.4 + uSeed * 0.1)) * 0.025;
  col *= 0.9 + 0.12 * smoothstep(0.9, -0.2, length(p));
  vec4 lab = texture(uLabel, vUv);
  float strip = 1.0 - step(0.072, vUv.y);
  col = mix(col, vec3(0.03, 0.03, 0.035), strip);
  col = mix(col, vec3(0.92, 0.90, 0.86), lab.a);
  fragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------- work planes
export const VERT_PLANE = /* glsl */ `#version 300 es
in vec3 position;
in vec2 uv;
uniform vec4 uRect;      // centre x, y (css px, y down), w, h
uniform vec2 uView;      // css px
uniform vec2 uVel;       // canvas velocity, css px per frame
uniform float uBend;
uniform vec3 uWave;      // origin uv, progress 0..1
uniform float uWaveAmp;
out vec2 vUv;
out float vWave;
void main() {
  vUv = uv;
  vec2 pos = position.xy;
  vec2 px = uRect.xy + vec2(pos.x * uRect.z, -pos.y * uRect.w);
  // velocity bend: the middle lags behind the edges
  px.y -= uVel.y * uBend * cos(pos.x * 3.14159);
  px.x -= uVel.x * uBend * cos(pos.y * 3.14159);
  // liquid wave from the click point
  vec2 d = (uv - uWave.xy) * vec2(uRect.z / uRect.w, 1.0);
  float r = length(d);
  float front = uWave.z * 1.6;
  float env = exp(-pow((r - front) * 3.2, 2.0)) * (1.0 - uWave.z);
  vec2 dir = r > 1e-4 ? d / r : vec2(0.0);
  float disp = sin(r * 18.0 - uWave.z * 22.0) * env * uWaveAmp;
  px += vec2(dir.x, -dir.y) * disp * min(uRect.z, uRect.w) * 0.06;
  vWave = env;
  gl_Position = vec4(px.x / uView.x * 2.0 - 1.0, 1.0 - px.y / uView.y * 2.0, 0.0, 1.0);
}
`;

export const FRAG_PLANE = HEAD + NOISE + /* glsl */ `
in float vWave;
uniform sampler2D uTex;
uniform float uAlpha;
uniform float uFocus;
uniform float uHover;
uniform vec2 uMouse;
uniform float uTime;
uniform vec2 uSplit;
uniform float uDevelop;
uniform float uAspect;
uniform float uSeed;
uniform vec2 uClip;  // device px, y up: the canvas is a window of its section
uniform vec4 uVfade; // device px, y up: fade out below .x..y and above .z..w (phones keep the HUD legible)
void main() {
  if (gl_FragCoord.y < uClip.x || gl_FragCoord.y > uClip.y) discard;
  float vf = smoothstep(uVfade.x, uVfade.y, gl_FragCoord.y) * (1.0 - smoothstep(uVfade.z, uVfade.w, gl_FragCoord.y));
  vec2 uv = vUv;
  // the sheet is still wet: a slow drift
  uv += 0.0035 * vec2(sin(uv.y * 8.0 + uTime * 0.5 + uSeed), cos(uv.x * 7.0 - uTime * 0.42 + uSeed));
  // hover: the ink turns around the pointer
  vec2 d = (uv - uMouse) * vec2(uAspect, 1.0);
  float ang = uHover * 1.1 * exp(-dot(d, d) * 14.0);
  float cs = cos(ang), sn = sin(ang);
  vec2 rd = mat2(cs, -sn, sn, cs) * d;
  uv = uMouse + rd / vec2(uAspect, 1.0);
  uv.y = max(uv.y, 0.0);
  vec2 sp = uSplit + vWave * 0.012;
  vec3 c;
  c.r = texture(uTex, uv + sp).r;
  c.g = texture(uTex, uv).g;
  c.b = texture(uTex, uv - sp).b;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, mix(0.30, 1.0, uFocus)) * mix(0.42, 1.0, uFocus);
  // develop: the sheet lifts out of the field along a flowing front
  float n = fbm(vUv * 3.0 + uSeed) * 0.5 + 0.5;
  float dev = uDevelop * 1.3 - 0.15;
  float m = smoothstep(dev - 0.08, dev, n);
  float fringe = smoothstep(dev - 0.08, dev - 0.02, n) - smoothstep(dev - 0.02, dev + 0.04, n);
  float a = (1.0 - m);
  vec3 fr = mix(vec3(0.75, 0.74, 0.72), film(fract(n * 2.0 + uTime * 0.05)), 0.45);
  c = mix(c, fr, fringe * 0.55 * (1.0 - uDevelop * 0.5));
  fragColor = vec4(c * mix(0.25, 1.0, vf), uAlpha * clamp(a + fringe, 0.0, 1.0) * mix(0.12, 1.0, vf));
}
`;
