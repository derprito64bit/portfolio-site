// GLSL for the Viewfinder concept (WebGL2). Three passes: the procedural scene with analytic depth of field, the EVF
// composite (exposure-graded image, film simulation, sensor noise, peaking) and the eyepiece used by the raise.

export const fullscreenVert = /* glsl */ `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }
`;

export const sceneFrag = (kind: number) => /* glsl */ `#version 300 es
#define KIND ${kind}
precision highp float;
in vec2 vUv;
out vec4 fragColor;
#define MAXS 14
#define MAXB 24
uniform vec4 uS[70];
uniform vec4 uL[48];
uniform int uNS;
uniform int uNB;
uniform vec3 uBackTop;
uniform vec3 uBackBottom;
uniform vec3 uKeyColor;
uniform vec3 uHaze;
uniform vec4 uKey;
uniform vec4 uG;
uniform vec4 uG2;
uniform float uKind;
uniform float uAspect;
uniform float uFocus;
uniform float uAperture;
uniform float uExposure;
uniform float uZoom;
uniform float uDolly;
uniform float uTime;
uniform float uPx;
uniform float uRoll;
uniform float uTilt;
uniform vec2 uZC;
uniform vec2 uPar;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float coc(float z) { return uAperture * abs(z - uFocus) * 0.26; }
vec2 lq(vec2 q, float z) { float s = 1.0 + uDolly * (1.0 - z); return uZC + (q - uZC) / s - uPar * (1.0 - z); }

vec3 backdrop(vec2 q) {
  float t = clamp(q.y * 0.35 + 0.5, 0.0, 1.0);
  vec3 c = mix(uBackBottom, uBackTop, t);
  vec2 k = lq(q, 0.97) - uKey.xy;
  c += uKeyColor * uKey.w * exp(-dot(k, k) / (uKey.z * uKey.z));
  return c;
}

void lights(inout vec3 col, inout float peak, vec2 q, bool front) {
  for (int j = 0; j < uNB; j++) {
    vec4 P = uL[j * 2];
    vec4 Q = uL[j * 2 + 1];
    if ((P.z < 0.25) != front) continue;
    vec2 p = lq(q, P.z) - P.xy;
    float cc = coc(P.z);
    float R = P.w + cc;
    float l = length(p);
    if (l > R + uPx * 2.0) continue;
    float e = 1.0 - smoothstep(R - uPx - R * 0.05, R + uPx, l);
    float k = clamp(cc / R, 0.0, 1.0);
    float rim = smoothstep(R * 0.55, R, l) * k * 0.55;
    float energy = mix(1.0, 0.17, smoothstep(0.0, 1.0, k));
    float tw = 1.0 + 0.07 * sin(uTime * 1.3 + float(j) * 2.1);
    col += Q.rgb * Q.a * e * energy * (1.0 + rim) * tw * (front ? 0.5 : 1.0);
    float sharp = 1.0 - smoothstep(uPx * 0.8, uPx * 3.0, cc);
    peak = max(peak, exp(-pow((l - R) / (uPx * 1.4), 2.0)) * sharp);
  }
}

vec3 world(vec2 q, out float peak) {
  vec3 col = backdrop(q);
  peak = 0.0;
  lights(col, peak, q, false);
  for (int i = 0; i < uNS; i++) {
    vec4 A = uS[i * 5];
    vec4 B = uS[i * 5 + 1];
    vec4 C = uS[i * 5 + 2];
    vec4 D = uS[i * 5 + 3];
    vec4 E = uS[i * 5 + 4];
    float z = B.z;
    vec2 p = rot(-B.x) * (lq(q, z) - A.xy);
    int t = int(B.w + 0.5);
    float d;
    if (t == 1) d = length(p) - A.z;
    else if (t == 2) d = abs(length(p) - A.z) - A.w;
    else if (t == 3) d = p.y;
    else d = sdBox(p, A.zw, B.y);
    float cc = coc(z);
    float w = cc + uPx + E.w;
    if (E.x > 0.0) col += C.rgb * E.x * 0.3 * exp(-max(d, 0.0) / (E.y + cc * 0.8));
    float cov = 1.0 - smoothstep(-w, w, d);
    float sharp = 1.0 - smoothstep(uPx * 1.2, uPx * 5.0, cc);
    float pk = t == 3 ? 0.0 : exp(-d * d / (uPx * uPx * 3.0)) * sharp * min(C.a * 1.5, 1.0);
    if (cov <= 0.0005) { peak = max(peak, pk); continue; }
    float ext = t == 3 ? 1.0 : max(A.z, A.w);
    vec2 gd = vec2(cos(D.x), sin(D.x));
    float gr = clamp(dot(p, gd) / ext, -1.0, 1.0);
    vec3 c = C.rgb * (1.0 + D.y * gr);
    if (E.z > 0.5) {
      // pseudo-3D forms: a sphere (disc) or a cylinder (rounded box), lit from the gradient angle
      vec2 nn = E.z > 1.5 ? vec2(clamp(p.x / A.z, -1.0, 1.0), 0.0) : clamp(p / A.z, -1.0, 1.0);
      vec3 N = vec3(nn, sqrt(max(0.0, 1.0 - dot(nn, nn))));
      vec3 L = normalize(vec3(gd, 0.85));
      float diff = max(dot(N, L), 0.0);
      float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * exp(-cc * 40.0);
      float rimL = pow(1.0 - N.z, 3.0);
      c = C.rgb * (0.16 + 1.0 * diff) + spec * 0.45 + uKeyColor * rimL * 0.18;
    }
    if (D.w > 0.0) {
      float s = sin(dot(p, vec2(-gd.y, gd.x)) * D.z);
      float att = exp(-pow(D.z * cc * 0.7, 2.0));
      c *= 1.0 + D.w * s * att;
    }
    c = mix(c, uHaze, z * z * 0.3);
    float a = cov * C.a;
    col = mix(col, c, a);
    peak = max(peak * (1.0 - a), pk);
  }
  lights(col, peak, q, true);
  return col;
}

#if KIND == 1
vec3 glassScene(vec2 q, out float peak) {
  vec3 base = world(q, peak);
  vec2 c = uG.xy;
  vec2 p = rot(uTilt * 0.5) * (lq(q, uG2.w) - c);
  p.x /= max(0.75, cos(uTilt * 1.2));
  float d = sdBox(p, uG.zw, uG2.x);
  float cc = coc(uG2.w);
  float w = cc + uPx;
  float cov = 1.0 - smoothstep(-w, w, d);
  float sharp = 1.0 - smoothstep(uPx * 1.2, uPx * 5.0, cc);
  if (cov <= 0.0005) { peak = max(peak, exp(-d * d / (uPx * uPx * 3.0)) * sharp); return base; }
  float h = smoothstep(0.0, uG2.y, -d);
  vec2 e = vec2(0.002, 0.0);
  vec2 n = normalize(vec2(sdBox(p + e.xy, uG.zw, uG2.x) - sdBox(p - e.xy, uG.zw, uG2.x),
                          sdBox(p + e.yx, uG.zw, uG2.x) - sdBox(p - e.yx, uG.zw, uG2.x)) + 1e-5);
  float slope = (1.0 - h) * (1.0 - h);
  vec2 off = -n * slope * 0.2 * uG2.z + vec2(uTilt * 0.3, 0.0);
  vec2 qc = c + (q - c) * 0.8 + off;
  float dum;
  vec3 g = world(qc, dum);
  vec3 refr = g;
  if (slope > 0.02) {
    vec3 r = world(qc + n * slope * 0.035, dum);
    vec3 b = world(qc - n * slope * 0.035, dum);
    refr = vec3(r.r, g.g, b.b);
  }
  refr *= vec3(0.9, 0.97, 1.02);
  float rim = pow(slope, 3.0) * 0.5 + exp(-pow((d + 0.006) / 0.0035, 2.0)) * 0.35;
  float sp = exp(-pow((dot(p, normalize(vec2(1.0, 0.55))) - uTilt * 0.7 + 0.1) / 0.03, 2.0)) * 0.4 * h;
  float etch = 0.0;
  for (int i = 0; i < 3; i++) {
    float y = -0.2 - float(i) * 0.075;
    float ww = i == 0 ? 0.2 : 0.13;
    float dd = sdBox(p - vec2(0.0, y), vec2(ww, 0.012), 0.006);
    etch = max(etch, 1.0 - smoothstep(-uPx - cc, uPx + cc, dd));
  }
  vec3 gl = refr * (1.0 - etch * 0.35) + etch * 0.16 + rim * vec3(0.92, 0.96, 1.0) + sp;
  peak = max(peak * (1.0 - cov), (exp(-d * d / (uPx * uPx * 3.0)) + etch * 0.0) * sharp);
  return mix(base, gl, cov);
}

#endif

#if KIND == 2
vec3 medalScene(vec2 q, out float peak) {
  vec3 base = world(q, peak);
  vec2 p = lq(q, uG2.w) - uG.xy;
  float R = uG.z;
  float l = length(p);
  float d = l - R;
  float cc = coc(uG2.w);
  float w = cc + uPx;
  float sharp = 1.0 - smoothstep(uPx * 1.2, uPx * 5.0, cc);
  base *= 1.0 - 0.55 * exp(-max(length(p - vec2(0.03, -0.05)) - R, 0.0) / 0.06);
  float cov = 1.0 - smoothstep(-w, w, d);
  if (cov <= 0.0005) { peak = max(peak, exp(-d * d / (uPx * uPx * 3.0)) * sharp); return base; }
  float a = atan(p.y, p.x);
  float rn = l / R;
  float aniso = 0.5 + 0.5 * cos(2.0 * a - 1.1 + uTilt * 3.0);
  float rings = sin(l * 900.0) * 0.5 + 0.5;
  float ringAtt = exp(-pow(900.0 * cc * 0.5, 2.0));
  vec3 metal = vec3(0.44, 0.445, 0.46);
  vec3 c = metal * (0.45 + 0.85 * aniso) + (rings - 0.5) * 0.06 * ringAtt;
  float rim = smoothstep(0.86, 0.9, rn) * (1.0 - smoothstep(0.975, 1.0, rn));
  float rimLight = 0.5 + 0.5 * cos(a - 2.2 + uTilt * 2.0);
  c = mix(c, metal * (0.25 + 1.4 * rimLight), rim);
  float groove = exp(-pow((rn - 0.74) / 0.012, 2.0));
  c *= 1.0 - groove * 0.55;
  c += exp(-pow((rn - 0.757) / 0.008, 2.0)) * 0.3 * rimLight;
  peak = max(peak * (1.0 - cov), (exp(-d * d / (uPx * uPx * 3.0)) + groove * 0.7) * sharp);
  return mix(base, c, cov);
}

#endif

vec3 rolloff(vec3 c) {
  vec3 hi = 0.8 + 0.2 * (1.0 - exp(-(c - 0.8) / 0.2));
  return mix(c, hi, step(0.8, c));
}

void main() {
  vec2 hlf = uAspect >= 1.0 ? vec2(uAspect, 1.0) : vec2(1.0, 1.0 / uAspect);
  vec2 q = (vUv * 2.0 - 1.0) * hlf;
  q = rot(uRoll) * q;
  q = uZC + (q - uZC) / uZoom;
  float peak;
  vec3 col;
#if KIND == 1
  col = glassScene(q, peak);
#elif KIND == 2
  col = medalScene(q, peak);
#else
  col = world(q, peak);
#endif
  col = rolloff(max(col * uExposure, 0.0));
  fragColor = vec4(clamp(col, 0.0, 1.0), clamp(peak, 0.0, 1.0));
}
`;

export const compositeFrag = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tCur;
uniform sampler2D tPrev;
uniform vec4 uRect;
uniform vec2 uRes;
uniform vec2 uFrac;
uniform float uMix;
uniform float uSimA;
uniform float uSimB;
uniform float uSimT;
uniform float uNoise;
uniform float uTime;
uniform float uPeak;
uniform float uCA;
uniform float uSmear;
uniform float uVig;
uniform float uAlpha;
uniform float uRadius;
uniform float uZebra;
uniform float uND;
uniform vec3 uPeakCol;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 sat(vec3 c, float s) { float l = luma(c); return mix(vec3(l), c, s); }
vec3 con(vec3 c, float k, float pivot) { return (c - pivot) * k + pivot; }
vec3 grade(vec3 c, float sim) {
  int s = int(sim + 0.5);
  float l = luma(c);
  if (s == 0) {
    c = con(c, 1.06, 0.42); c = sat(c, 1.05);
  } else if (s == 1) {
    c = sat(c, mix(0.95, 0.5, smoothstep(0.25, 0.85, l)));
    c = con(c, 1.32, 0.44);
    c = mix(c, c * vec3(0.84, 0.97, 1.04), 1.0 - smoothstep(0.05, 0.5, l));
    c = mix(c, c * vec3(1.05, 1.0, 0.9), smoothstep(0.45, 0.95, l));
    c.b = mix(c.b, c.b * 0.88, smoothstep(0.2, 0.6, c.b - c.r));
  } else if (s == 2) {
    float m = dot(c, vec3(0.38, 0.5, 0.12));
    m = (m - 0.45) * 1.24 + 0.45;
    c = vec3(m) * vec3(1.0, 0.99, 0.975);
  } else if (s == 3) {
    c = con(c, 0.82, 0.5) + 0.03; c = sat(c, 0.84);
    c *= mix(vec3(0.98, 1.0, 1.02), vec3(1.05, 1.0, 0.93), smoothstep(0.3, 1.0, l));
  } else {
    c = mix(c, vec3(l), 0.58); c = con(c, 1.42, 0.42); c *= vec3(0.97, 1.0, 0.99);
  }
  return clamp(c, 0.0, 1.0);
}
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

vec4 tap(vec2 u) { return texture(tCur, clamp(u, 0.0, 1.0) * uFrac); }

void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 f = (px - uRect.xy) / uRect.zw;
  if (f.x < 0.0 || f.y < 0.0 || f.x > 1.0 || f.y > 1.0 || uAlpha <= 0.0) { fragColor = vec4(0.0); return; }
  vec2 hp = abs(px - uRect.xy - uRect.zw * 0.5) - uRect.zw * 0.5 + uRadius;
  float dc = length(max(hp, 0.0)) - uRadius;
  float cm = 1.0 - smoothstep(-0.5, 0.5, dc);
  vec2 uv = vec2(f.x, 1.0 - f.y);
  vec2 dir = uv - 0.5;
  vec4 s;
  if (uSmear < 0.0005 && uCA < 0.00005) {
    s = tap(uv);
  } else {
    s = vec4(0.0);
    for (int i = 0; i < 6; i++) {
      float o = (float(i) / 5.0 - 0.5) * uSmear;
      vec2 u = uv + vec2(o, 0.0);
      vec2 ca = dir * uCA;
      vec4 g = tap(u);
      s += vec4(tap(u + ca).r, g.g, tap(u - ca).b, g.a);
    }
    s /= 6.0;
  }
  if (uMix < 0.999) s = mix(texture(tPrev, uv * uFrac), s, uMix);
  vec3 c = grade(s.rgb, uSimA);
  if (uSimT > 0.001) c = mix(c, grade(s.rgb, uSimB), uSimT);
  float asp = uRect.z / uRect.w;
  float r = length(dir * vec2(asp, 1.0)) / length(vec2(asp, 1.0) * 0.5);
  c *= 1.0 - uVig * pow(r, 2.4);
  c *= 1.0 - uND * (1.0 - smoothstep(0.18, 0.78, f.x)) * 0.82;
  float n = hash(px + fract(uTime * 7.13) * vec2(311.0, 173.0)) - 0.5;
  c += n * uNoise * (1.3 - luma(c));
  if (uZebra > 0.0) {
    float zz = step(0.93, luma(c)) * step(0.5, fract((px.x + px.y + uTime * 60.0) / 12.0));
    c = mix(c, vec3(0.03), zz * uZebra);
  }
  c = mix(c, uPeakCol, clamp(s.a * uPeak * 1.5, 0.0, 1.0));
  fragColor = vec4(c * uAlpha * cm, uAlpha * cm);
}
`;

export const eyepieceFrag = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D tSnap;
uniform float uP;
uniform float uAspect;
uniform float uPhase;
uniform vec2 uC;

float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

vec3 samp(vec2 c) {
  vec2 uv = c / vec2(uAspect, 1.0) + 0.5;
  float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  return texture(tSnap, uv).rgb * inside;
}

void main() {
  float p = uP;
  vec2 c = (vUv - 0.5) * vec2(uAspect, 1.0);
  vec2 hlf = vec2(uAspect, 1.0) * 0.5;
  // the eyecup closing in: a rounded aperture that shrinks to just inside the frame
  float close = smoothstep(0.0, 0.9, p);
  vec2 cup = hlf * mix(1.5, 0.9, close);
  float rad = mix(0.05, 0.16, close);
  float sd = sdBox(c, cup - rad, rad);
  float mask = 1.0 - smoothstep(-0.09 * (0.35 + close), 0.015, sd);
  // the eyepiece glass: magnify, barrel, and a refracting rim band
  float mag = 1.0 + 0.3 * p + 0.9 * p * p;
  float r2 = dot(c, c);
  vec2 cb = c * (1.0 + 1.1 * p * r2);
  vec2 cd = uC + (cb - uC) / mag;
  float band = exp(-pow((sd + 0.06) / 0.05, 2.0)) * p;
  cd += normalize(c + 1e-5) * band * 0.07;
  float ca = 0.006 * p + 0.03 * p * r2 + band * 0.025;
  float br = 0.0025 * p + 0.012 * p * p;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 7; i++) {
    float a = float(i) * 0.8976 + uPhase;
    vec2 o = i == 0 ? vec2(0.0) : vec2(cos(a), sin(a)) * br;
    col.r += samp((cd + o) * (1.0 + ca)).r;
    col.g += samp(cd + o).g;
    col.b += samp((cd + o) * (1.0 - ca)).b;
  }
  col /= 7.0;
  // specular arc on the glass, upper left
  vec2 nd = normalize(c + 1e-5);
  float arc = exp(-pow((sd + 0.035) / 0.012, 2.0)) * smoothstep(0.3, 1.0, dot(nd, normalize(vec2(-1.0, 0.8))));
  col += vec3(1.0, 0.92, 0.8) * arc * 0.22 * p * (1.0 - smoothstep(0.6, 0.9, p));
  col *= mask * (1.0 - smoothstep(0.6, 0.93, p));
  fragColor = vec4(col, 1.0);
}
`;
