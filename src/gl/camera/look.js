// The hero camera's look (W-S1). One module for the posters and the live stage, so the poster is the first GL frame:
//   node scripts/build/posters/render.mjs --out public/posters/camera --look src/gl/camera/look.js
// Interface (W-C13's poster contract, scripts/build/posters/README.md):
//   export async function applyLook({ renderer, scene, tier, compile }) -> { dispose() }
// It may set tone mapping, exposure, scene.environment and lights; it never touches the camera or the model's
// transforms (the framing belongs to stage.js and posters.json). Plain JS with bare 'three' imports: the poster page
// loads it through an import map, the site through Vite.
//
// The light is the light table's: a soft room reflection (RoomEnvironment through PMREM), a white key from the upper
// left front, a low fill from the table itself (the page is a backlit surface), and the amber safelight as a rim from
// the right rear, the one accent of D-016. Starting point: W-C13's reference look from the locked prototype.
//
// Boot cost (W-D034: no task over 50 ms after module evaluation). three r186's PMREM prefilter is a GGX convolution
// that, compiled the usual way inside fromScene(), blocks the main thread for about 700 ms on a cold D3D11 cache. So
// every program is compiled first, in parallel, through compileAsync (KHR_parallel_shader_compile): the GGX shader,
// the room, and (through `compile`) the caller's own materials against a stand-in environment of the final size,
// which gives the same programs. fromScene() then only draws. The convolution takes 64 samples, not 256: the room
// is soft, the difference is under a grey level, and the shader compiles four times faster. This reaches into
// PMREMGenerator's private _setSize/_allocateTargets/_ggxMaterial, pinned with three at 0.186.1 (deps.md).
import { BufferGeometry, Color, DirectionalLight, HemisphereLight, Mesh, NeutralToneMapping, PerspectiveCamera, PMREMGenerator, SRGBColorSpace } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** Amber #E39B2B (tokens colour.accent.amber). */
const AMBER = 0xe39b2b;
const ENV_SIZE = 256;
const GGX_SAMPLES = 64;

/**
 * @param {{ renderer: any, scene: any, tier?: string, compile?: (() => Promise<unknown>) | null }} o
 * @returns {Promise<{ dispose(): void }>}
 */
export async function applyLook({ renderer, scene, tier = 'full', compile = null }) {
  void tier; // one look on every tier, so the poster stays the first frame everywhere
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = SRGBColorSpace;
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(-0.5, 1, 1.2);
  // The table glows from below: a faint bounce on the underside, so the black body never goes flat.
  const table = new HemisphereLight(0xffffff, new Color(0xeef0ef), 0.25);
  const rim = new DirectionalLight(new Color(AMBER), 1.4);
  rim.position.set(1, 0.3, -0.6);
  scene.add(key, table, rim);

  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const flat = new PerspectiveCamera();
  let standIn = null;
  if (typeof pmrem._allocateTargets === 'function' && renderer.compileAsync) {
    pmrem._setSize(ENV_SIZE);
    standIn = pmrem._allocateTargets();
    if (pmrem._ggxMaterial) pmrem._ggxMaterial.defines.GGX_SAMPLES = GGX_SAMPLES;
    scene.environment = standIn.texture;
    // The room and the prefilter draw into half-float render targets, which select other program variants (linear
    // output, no tone mapping) than the screen: compile them with such a target bound, then unbind it.
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(standIn);
    const jobs = [renderer.compileAsync(room, flat)];
    // With PMREM's own lod geometry, so the backend's input-layout variant is the one fromScene() draws with.
    const geo = pmrem._lodMeshes?.[0]?.geometry ?? new BufferGeometry();
    for (const m of [pmrem._ggxMaterial, pmrem._blurMaterial]) if (m) jobs.push(renderer.compileAsync(new Mesh(geo, m), flat));
    renderer.setRenderTarget(prev);
    if (compile) jobs.push(compile());
    await Promise.all(jobs);
  }
  const env = pmrem.fromScene(room, 0.04, 0.1, 100, { size: ENV_SIZE }).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.9;
  standIn?.dispose();
  room.dispose();
  pmrem.dispose();
  return {
    dispose() {
      scene.remove(key, table, rim);
      env.dispose();
      scene.environment = null;
    },
  };
}
