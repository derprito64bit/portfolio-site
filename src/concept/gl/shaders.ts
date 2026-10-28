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
uniform float uBreath;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float coc(float z) { return uAperture * abs(z - uFocus) * 0.26; }
vec2 lq(vec2 q, float z) { float s = 1.0 + uDolly * (1.0 - z); return uZC + (q - uZC) / s - uPar * (1.0 - z); }

float pkOf(float d, float sharp) { return exp(-d * d / (uPx * uPx * 3.0)) * sharp; }
vec3 hsv(vec3 c) { vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0); return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y); }
float cv(float d, float w) { return 1.0 - smoothstep(-w, w, d); }

// ---- test subjects: each pattern blurs with its own circle of confusion (w) and feeds peaking ----
// A focus chart: a Siemens star, its ring and three line-pair groups.
vec3 focusChart(vec2 p, vec4 A, vec3 base, vec3 ink, float w, float sharp, inout float pk) {
  float R = min(A.z, A.w) * 0.66;
  vec2 sp = p - vec2(0.0, A.w * 0.14);
  float r = length(sp);
  float a = atan(sp.y, sp.x);
  float k = 18.0;
  float de = r * sin(a * k) / k;
  float inStar = 1.0 - smoothstep(R - w, R + w, r);
  float star = smoothstep(-w, w, de) * inStar;
  float ring = cv(abs(r - R * 1.08) - 0.003, w);
  vec3 c = mix(base, ink, max(star, ring));
  pk = max(pk, pkOf(de, sharp) * inStar * smoothstep(R * 0.18, R * 0.3, r));
  pk = max(pk, pkOf(abs(r - R * 1.08) - 0.003, sharp));
  float yb = -A.w * 0.8;
  float band = cv(abs(p.y - yb) - A.w * 0.07, w);
  if (band > 0.0) {
    float g = clamp((p.x / A.z) * 0.5 + 0.5, 0.0, 0.999);
    float gi = floor(g * 3.0);
    float f = mix(70.0, 300.0, gi / 2.0);
    float s = sin(p.x * f);
    float att = exp(-pow(f * w * 0.55, 2.0));
    float gap = smoothstep(0.06, 0.1, fract(g * 3.0)) * (1.0 - smoothstep(0.9, 0.94, fract(g * 3.0)));
    float v = mix(0.5, smoothstep(-f * uPx, f * uPx, s), att);
    c = mix(c, mix(base, ink, v), band * gap);
  }
  return c;
}

float ub(vec2 p, vec4 A, vec2 c, vec2 h, float r) { return sdBox(p - c * A.zw, h * A.zw, r); }
// A flat 16:10 plate in the shape of a screenshot: an abstract page layout, never real content.
vec3 uiPlate(vec2 p, vec4 A, vec3 base, vec3 acc, float variant, float w, float sharp, inout float pk) {
  float lightMode = step(0.45, dot(base, vec3(0.333)));
  vec3 ink = mix(vec3(0.86, 0.85, 0.82), vec3(0.11, 0.11, 0.12), lightMode);
  vec3 soft = mix(base, ink, 0.1);
  vec3 c = base;
  float d;
  if (variant < 0.5) {
    d = ub(p, A, vec2(0.0, 0.9), vec2(1.0, 0.1), 0.0); c = mix(c, soft, cv(d, w));
    d = ub(p, A, vec2(-0.86, 0.9), vec2(0.07, 0.035), 0.004); c = mix(c, ink, cv(d, w)); pk = max(pk, pkOf(d, sharp));
    for (int i = 0; i < 3; i++) { d = ub(p, A, vec2(0.62 + float(i) * 0.12, 0.9), vec2(0.04, 0.018), 0.003); c = mix(c, mix(base, ink, 0.55), cv(d, w)); }
    d = ub(p, A, vec2(-0.5, 0.42), vec2(0.38, 0.075), 0.004); c = mix(c, ink, cv(d, w)); pk = max(pk, pkOf(d, sharp));
    d = ub(p, A, vec2(-0.6, 0.24), vec2(0.28, 0.075), 0.004); c = mix(c, ink, cv(d, w)); pk = max(pk, pkOf(d, sharp));
    d = ub(p, A, vec2(-0.62, 0.04), vec2(0.26, 0.022), 0.003); c = mix(c, mix(base, ink, 0.45), cv(d, w));
    d = ub(p, A, vec2(-0.66, -0.04), vec2(0.22, 0.022), 0.003); c = mix(c, mix(base, ink, 0.45), cv(d, w));
    d = ub(p, A, vec2(-0.74, -0.2), vec2(0.14, 0.06), 0.02); c = mix(c, acc, cv(d, w)); pk = max(pk, pkOf(d, sharp));
    d = ub(p, A, vec2(0.42, 0.18), vec2(0.44, 0.44), 0.02);
    float img = cv(d, w);
    vec3 grad = mix(acc * 0.55, mix(acc, vec3(1.0), 0.45), clamp(p.y / A.w * 0.9 + 0.5, 0.0, 1.0));
    c = mix(c, grad, img); pk = max(pk, pkOf(d, sharp));
    for (int i = 0; i < 3; i++) {
      d = ub(p, A, vec2(-0.66 + float(i) * 0.66, -0.68), vec2(0.3, 0.2), 0.02);
      c = mix(c, soft, cv(d, w)); pk = max(pk, pkOf(d, sharp) * 0.6);
    }
  } else {
    d = ub(p, A, vec2(-0.83, 0.0), vec2(0.17, 1.0), 0.0); c = mix(c, soft, cv(d, w));
    for (int i = 0; i < 5; i++) { d = ub(p, A, vec2(-0.86, 0.72 - float(i) * 0.16), vec2(0.1, 0.022), 0.003); c = mix(c, mix(soft, ink, i == 1 ? 0.8 : 0.35), cv(d, w)); }
    d = ub(p, A, vec2(0.12, 0.82), vec2(0.5, 0.06), 0.004); c = mix(c, ink, cv(d, w)); pk = max(pk, pkOf(d, sharp));
    for (int i = 0; i < 3; i++) {
      for (int j = 0; j < 2; j++) {
        vec2 tc = vec2(-0.38 + float(i) * 0.52, 0.38 - float(j) * 0.74);
        d = ub(p, A, tc, vec2(0.23, 0.31), 0.025);
        c = mix(c, soft, cv(d, w)); pk = max(pk, pkOf(d, sharp) * 0.7);
        vec2 lp = (p - tc * A.zw) / A.zw;
        if (i == 1 && j == 0) {
          float yv = 0.12 * sin(lp.x * 18.0) + 0.05 * sin(lp.x * 41.0);
          float dl = abs((lp.y - yv) * A.w) - 0.003;
          c = mix(c, acc, cv(dl, w) * cv(abs(lp.x) - 0.2, 0.002) * cv(abs(lp.y) - 0.28, 0.002));
        } else if (i == 2 && j == 1) {
          for (int b = 0; b < 5; b++) {
            float hb = 0.08 + 0.05 * float((b * 7) % 5);
            d = sdBox(lp * A.zw - vec2((-0.15 + float(b) * 0.075) * A.z, (-0.26 + hb) * A.w), vec2(0.022 * A.z, hb * A.w), 0.002);
            c = mix(c, acc, cv(d, w));
          }
        } else {
          d = sdBox(lp * A.zw - vec2(-0.08 * A.z, 0.14 * A.w), vec2(0.12 * A.z, 0.025 * A.w), 0.003);
          c = mix(c, mix(soft, ink, 0.6), cv(d, w));
        }
      }
    }
  }
  return c;
}

// A colour chart: six columns, three rows of hues and a row of greys, on a black card.
vec3 colourChart(vec2 p, vec4 A, vec3 card, float w, float sharp, inout float pk) {
  vec2 n = vec2(6.0, 4.0);
  vec2 cell = 2.0 * A.zw / n;
  vec2 u = (p + A.zw) / cell;
  vec2 id = clamp(floor(u), vec2(0.0), n - 1.0);
  vec2 f = (u - id - 0.5) * cell;
  float d = sdBox(f, cell * 0.5 - cell.x * 0.09, cell.x * 0.05);
  vec3 pc;
  if (id.y < 0.5) pc = vec3(pow(mix(0.94, 0.05, id.x / 5.0), 1.6));
  else pc = hsv(vec3((id.x + (id.y - 1.0) * 6.0) / 18.0 + 0.02, 0.6, 0.76));
  pk = max(pk, pkOf(d, sharp) * 0.9);
  return mix(card, pc, cv(d, w));
}

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
    float R = P.w * (1.0 + uBreath * 0.35 * sin(uTime * 0.9 + float(j) * 1.7)) + cc;
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
    float cc = coc(z);
    float sharp = 1.0 - smoothstep(uPx * 1.2, uPx * 5.0, cc);
    if (t == 6) {
      // light painting: an emissive trail, drawn by a long exposure; it keeps moving slowly
      float ph = D.y + uTime * 0.22;
      float yc = A.w * sin(p.x * D.x + ph) + A.w * 0.32 * sin(p.x * D.x * 2.3 - ph * 1.3);
      float slope = A.w * D.x * cos(p.x * D.x + ph);
      float dist = abs(p.y - yc) / sqrt(1.0 + slope * slope);
      float ends = 1.0 - smoothstep(A.z * 0.75, A.z, abs(p.x));
      float width = 0.0035 + cc * 0.9 + uPx;
      float core = exp(-pow(dist / width, 2.0));
      float energy = mix(0.3, 1.0, 0.0045 / (0.0045 + cc));
      col += C.rgb * E.x * ends * (core * energy + exp(-dist / (0.03 + cc)) * 0.1);
      peak = max(peak, pkOf(max(dist - 0.0035, 0.0) * 0.7, sharp) * ends);
      continue;
    }
    float d;
    if (t == 1) d = length(p) - A.z;
    else if (t == 2) d = abs(length(p) - A.z) - A.w;
    else if (t == 3) d = p.y;
    else d = sdBox(p, A.zw, B.y);
    float w = cc + uPx + E.w;
    if (E.x > 0.0) col += C.rgb * E.x * 0.3 * exp(-max(d, 0.0) / (E.y + cc * 0.8));
    float cov = 1.0 - smoothstep(-w, w, d);
    float pk = t == 3 ? 0.0 : exp(-d * d / (uPx * uPx * 3.0)) * sharp * min(C.a * 1.5, 1.0);
    if (cov <= 0.0005) { peak = max(peak, pk); continue; }
    float ext = t == 3 ? 1.0 : max(A.z, A.w);
    vec2 gd = vec2(cos(D.x), sin(D.x));
    float gr = clamp(dot(p, gd) / ext, -1.0, 1.0);
    vec3 c = C.rgb * (1.0 + D.y * gr);
    if (t == 4) c = focusChart(p, A, C.rgb, vec3(0.05), w, sharp, pk) * (1.0 + 0.12 * gr);
    else if (t == 5) c = uiPlate(p, A, C.rgb, D.yzw, D.x, w, sharp, pk);
    else if (t == 7) c = colourChart(p, A, C.rgb, w, sharp, pk);
    else if (E.z > 0.5) {
      // pseudo-3D forms: a sphere (disc) or a cylinder (rounded box), lit from the gradient angle
      vec2 nn = E.z > 1.5 ? vec2(clamp(p.x / A.z, -1.0, 1.0), 0.0) : clamp(p / A.z, -1.0, 1.0);
      vec3 N = vec3(nn, sqrt(max(0.0, 1.0 - dot(nn, nn))));
      vec3 L = normalize(vec3(gd, 0.85));
      float diff = max(dot(N, L), 0.0);
      float spec = pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * exp(-cc * 40.0);
      float rimL = pow(1.0 - N.z, 3.0);
      c = C.rgb * (0.16 + 1.0 * diff) + spec * 0.45 + uKeyColor * rimL * 0.18;
    }
    if (D.w > 0.0 && t < 4) {
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
uniform float uDim;
uniform vec3 uPool;
uniform float uPoolAmt;
uniform float uRim;
uniform float uDpr;
uniform float uNDV;

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
  float ndRamp = mix(1.0 - smoothstep(0.18, 0.78, f.x), smoothstep(0.32, 0.72, f.y), uNDV);
  c *= 1.0 - uND * ndRamp * 0.82;
  float n = hash(px + fract(uTime * 7.13) * vec2(311.0, 173.0)) - 0.5;
  c += n * uNoise * (1.3 - luma(c));
  // the intro: the frame waits at -3 EV behind the page; a spot-meter pool exposes it under the hand
  if (uDim != 1.0 || uPoolAmt > 0.0) {
    float pd = length(px - uPool.xy);
    float pool = (1.0 - smoothstep(uPool.z * 0.15, uPool.z, pd)) * uPoolAmt;
    c *= mix(uDim, 1.0, pool);
    float ring = (1.0 - smoothstep(0.5 * uDpr, 1.5 * uDpr, abs(pd - uPool.z * 0.12))) * uPoolAmt;
    c = mix(c, vec3(0.93, 0.91, 0.87), ring * 0.5);
  }
  // the eyepiece glass, kept as a thin dispersive edge on the frame's corners
  if (uRim > 0.0) {
    vec2 e2 = min(px - uRect.xy, uRect.xy + uRect.zw - px);
    float edge = min(e2.x, e2.y);
    vec2 cf = abs(f - 0.5) * 2.0;
    float corner = smoothstep(0.62, 0.98, min(cf.x, cf.y));
    float band = (1.0 - smoothstep(0.0, 16.0 * uDpr, edge)) * corner * uRim;
    if (band > 0.002) {
      vec2 dirv = normalize(vec2(f.x - 0.5, 0.5 - f.y) + 1e-5) * band * 0.014;
      vec3 disp = vec3(tap(uv + dirv).r, tap(uv).g, tap(uv - dirv).b);
      c = mix(c, grade(disp, uSimA) * mix(uDim, 1.0, 1.0), band * 0.85);
      c += vec3(1.0, 0.94, 0.86) * exp(-pow((edge - 2.5 * uDpr) / (1.1 * uDpr), 2.0)) * corner * uRim * 0.28;
      c += vec3(0.5, 0.75, 1.0) * exp(-pow((edge - 5.0 * uDpr) / (1.3 * uDpr), 2.0)) * corner * uRim * 0.1;
    }
  }
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
uniform sampler2D tScene;
uniform vec2 uFrac;
uniform float uDim;
uniform float uP;
uniform float uAspect;
uniform float uPhase;
uniform vec2 uC;

float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

vec3 samp(vec2 c) {
  vec2 uv = c / vec2(uAspect, 1.0) + 0.5;
  float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  vec4 t = texture(tSnap, uv);
  vec3 bg = texture(tScene, clamp(uv, 0.0, 1.0) * uFrac).rgb * uDim;
  return mix(bg, t.rgb, t.a) * inside;
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
