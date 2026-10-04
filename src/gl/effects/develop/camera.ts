// The camera develop patch, GLSL half (D-024; fx-playbook sections 2 and 4). Owner: W-S1 (v1); the shader final
// passes to W-C2 (#17). Its hook, uniforms and timing are in src/gl/camera/drawing.ts (W-S1, then W-C14 #19).
//
// FROZEN uniform names (W-C2 and W-C14 build on them at once):
//   uCamClay    0..1  the drawing gains a body: the untextured camera in the ground's tone (heroDrawingClay)
//   uCamDev     0..1  the develop, on the W-D011 curve (heroDrawingDevelop); at 1 the patch is exact identity
//   uCamFade    0..1  a guard's crossfade from wherever the develop is to the finished camera (heroDrawingFade)
//   uCamGroup   0|1|2 per material: the silver top plate and dials first, black metal and leatherette next, the
//                     amber accents and the shutter button last
//   uCamGround  rgb   the undeveloped print ground, display space (the CSS ground under the first-paint drawing)
//
// The patch runs after <colorspace_fragment> (three r186 tone-maps and encodes there), so it mixes display-space
// colours, like the prints' develop (W-D016). Light first: a finished pixel's luminance pulls its develop earlier;
// a static noise (fixed to the screen, formed once, D-026) breaks the front into soft blotches. At uCamDev = 1 the
// branch is skipped, so the developed camera is the stock material, pixel for pixel (poster parity holds).
// The ground quad (GROUND_*) is the same ground drawn by GL in the camera's view while the body develops in front of
// it; it clears light-first from the top edge (the slot the prints leave by) with the same noise, and is gone by
// uCamDev 0.85.

/** Shared by the patch and the ground: a static value noise on whole-pixel cells (no time term: it never boils). */
const NOISE = /* glsl */ `
float ionHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float ionNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ionHash(i), ionHash(i + vec2(1.0, 0.0)), f.x), mix(ionHash(i + vec2(0.0, 1.0)), ionHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// Soft blotches: two octaves on a rotated lattice (an axis-aligned one shows its squares at a threshold), plus a
// little fine grain on whole 2-pixel cells.
float ionBlotch(vec2 px) {
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * px;
  return 0.55 * ionNoise(q / 41.0) + 0.3 * ionNoise(q / 17.0 + 7.13) + 0.15 * ionHash(floor(px / 2.0));
}`;

/** Declarations, inserted before main() of the material's fragment shader. */
export const CAMERA_PARS = /* glsl */ `
uniform float uCamClay;
uniform float uCamDev;
uniform float uCamFade;
uniform float uCamGroup;
uniform vec3 uCamGround;
${NOISE}`;

/** The develop itself, inserted right after #include <colorspace_fragment>. `normal` is the shading normal (view
 *  space) that every lit three material declares in main(). */
export const CAMERA_MAIN = /* glsl */ `
if (uCamDev < 1.0) {
  vec3 ionFin = gl_FragColor.rgb;
  float ionKey = clamp(dot(normalize(normal), normalize(vec3(-0.35, 0.75, 0.55))) * 0.5 + 0.5, 0.0, 1.0);
  vec3 ionBody = mix(uCamGround, uCamGround * mix(0.7, 1.6, ionKey), uCamClay);
  float ionLum = dot(ionFin, vec3(0.2126, 0.7152, 0.0722));
  float ionN = ionBlotch(gl_FragCoord.xy);
  vec2 ionWin = uCamGroup < 0.5 ? vec2(0.0, 0.45) : (uCamGroup < 1.5 ? vec2(0.2, 0.45) : vec2(0.55, 0.27));
  float ionDelay = ionWin.x + 0.12 * (1.0 - ionLum) + 0.06 * ionN;
  float ionP = clamp((uCamDev - ionDelay) / ionWin.y, 0.0, 1.0);
  ionP = ionP * ionP * (3.0 - 2.0 * ionP);
  vec3 ionTone = mix(vec3(ionLum), ionFin, smoothstep(0.35, 1.0, ionP));
  vec3 ionDev = mix(ionBody, ionTone, smoothstep(0.0, 0.7, ionP));
  gl_FragColor.rgb = mix(ionDev, ionFin, uCamFade);
}`;

const ANCHOR = '#include <colorspace_fragment>';

/**
 * Patch a three fragment shader (MeshStandardMaterial and MeshPhysicalMaterial in r186). Returns null when the
 * anchor is missing, so a three upgrade that moves it fails loudly in tests/w-s1 instead of drawing a camera that
 * never develops.
 */
export function patchCameraFragment(src: string): string | null {
  if (!src.includes(ANCHOR) || !src.includes('void main()')) return null;
  return src.replace('void main()', `${CAMERA_PARS}\nvoid main()`).replace(ANCHOR, `${ANCHOR}\n${CAMERA_MAIN}`);
}

export const GROUND_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

export const GROUND_FRAG = /* glsl */ `
uniform float uCamDev;
uniform float uCamFade;
uniform vec3 uCamGround;
varying vec2 vUv;
${NOISE}
void main() {
  float n = ionBlotch(gl_FragCoord.xy);
  float delay = 0.08 + 0.22 * (1.0 - vUv.y) + 0.12 * n;
  float a = (1.0 - smoothstep(delay, delay + 0.42, uCamDev)) * (1.0 - uCamFade);
  gl_FragColor = vec4(uCamGround * a, a);
}`;
