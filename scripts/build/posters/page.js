// page.js (W-C13): the camera stage page that render.mjs and the parity check drive in a real browser.
// Modes (query ?mode=):
//   frame   load LOD0 and compute every band's framing (stage.js) -> posters.json
//   poster  render one framing to a w x h device-pixel canvas and return it as PNG (the poster)
//   gl      the live first frame: a w x h CSS-px slot at the tier's DPR and MSAA, the LOD by projected width,
//           the camera drawn into the slot's contain-fit rectangle (what the hero stage does at T0)
//   img     the poster in the same slot, as <img srcset sizes style="object-fit: contain">
// Every mode sets window.__done to its result (or { error }).
import { Color, LineBasicMaterial, LineSegments, MeshBasicMaterial, PerspectiveCamera, Scene, WebGLRenderer,
  WireframeGeometry } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { applyFraming, computeFraming, containRect, pickLod } from "./stage.js";

const q = new URLSearchParams(location.search);
const json = (k, d) => (q.has(k) ? JSON.parse(q.get(k)) : d);
const mode = q.get("mode");
const models = q.get("models") ?? "/public/models/";
const slot = document.getElementById("slot");

// tokens.tiers: full = DPR <= 2, <= 4.5 Mpx, MSAA; lite = DPR <= 1.5, <= 1.5 Mpx, no MSAA.
const TIER = { full: { dpr: 2, mpx: 4.5e6, msaa: true }, lite: { dpr: 1.5, mpx: 1.5e6, msaa: false } };

async function loadModel(lod) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(`${models}${q.get("file") ?? `camera_xt_lod${lod}.glb`}`);
  return gltf.scene;
}

// The wireframe poster (W-D020 'Show the mesh', static tier): the model in flat proof grey with every triangle edge
// drawn in ink over it, so the poster shows the real mesh the build measured.
function wireOverlay(model) {
  const lines = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material = new MeshBasicMaterial({ color: new Color(q.get("fill") ?? "#E7EAE9"), polygonOffset: true,
      polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const w = new LineSegments(new WireframeGeometry(o.geometry),
      new LineBasicMaterial({ color: new Color(q.get("ink") ?? "#13171A"), transparent: true, opacity: 0.55 }));
    lines.push([o, w]);
  });
  for (const [o, w] of lines) o.add(w);
}

function rendererInfo(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
}

function tris(root) {
  let n = 0;
  root.traverse((o) => o.isMesh && (n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3));
  return n;
}

// Builds the scene and draws exactly one frame once shaders and textures are on the GPU (no half-loaded frame).
async function firstFrame(renderer, model, framing, rect) {
  const scene = new Scene();
  const { applyLook } = await import(q.get("look") ?? "./look.js");
  await applyLook({ renderer, scene, tier: q.get("tier") ?? "full" });
  scene.add(model);
  const camera = applyFraming(new PerspectiveCamera(), framing);
  model.traverse((o) => {
    if (!o.isMesh) return;
    for (const v of Object.values(o.material)) if (v?.isTexture) renderer.initTexture(v);
  });
  await renderer.compileAsync(scene, camera);
  renderer.setClearColor(0x000000, 0);
  renderer.setScissorTest(true);
  renderer.setScissor(0, 0, renderer.domElement.width, renderer.domElement.height);
  renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
  renderer.clear();
  const glY = renderer.domElement.height - rect.y - rect.height; // GL origin is bottom-left
  renderer.setViewport(rect.x, glY, rect.width, rect.height);
  renderer.setScissor(rect.x, glY, rect.width, rect.height);
  renderer.render(scene, camera);
  return scene;
}

async function run() {
  if (mode === "frame") {
    const model = await loadModel(0);
    const poses = json("poses");
    const fovDeg = Number(q.get("fov") ?? 28);
    const bands = {};
    for (const [band, pose] of Object.entries(poses)) bands[band] = computeFraming(model, pose, { fovDeg, margin: Number(q.get("margin") ?? 0.06) });
    return { bands, tris: tris(model) };
  }

  const framing = json("framing");
  if (mode === "poster" || mode === "wire") {
    const w = Number(q.get("w")), h = Math.round(w / framing.aspect);
    const lod = Number(q.get("lod") ?? 0);
    const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    slot.append(renderer.domElement);
    const model = await loadModel(lod);
    const measured = tris(model);
    if (mode === "wire") wireOverlay(model);
    await firstFrame(renderer, model, framing, { x: 0, y: 0, width: w, height: h });
    if (mode === "wire") return { png: renderer.domElement.toDataURL("image/png"), w, h, lod, tris: measured, renderer: rendererInfo(renderer) };
    return { png: renderer.domElement.toDataURL("image/png"), w, h, lod, tris: tris(model), renderer: rendererInfo(renderer) };
  }

  const w = Number(q.get("w")), h = Number(q.get("h"));
  slot.style.width = `${w}px`;
  slot.style.height = `${h}px`;

  if (mode === "gl") {
    const tier = TIER[q.get("tier") ?? "full"];
    // The site has one riding canvas: clientWidth x 100lvh x 1.25 (W-D013). Its pixel cap sets the effective DPR.
    const canvasCss = document.documentElement.clientWidth * innerHeight * 1.25;
    let dpr = Math.min(devicePixelRatio, tier.dpr);
    if (canvasCss * dpr * dpr > tier.mpx) dpr = Math.sqrt(tier.mpx / canvasCss);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    const renderer = new WebGLRenderer({ antialias: tier.msaa, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setSize(bw, bh, false);
    slot.append(renderer.domElement);
    const rect = containRect(bw, bh, framing.aspect);
    const lod = q.has("lod") ? Number(q.get("lod")) : pickLod(rect.width, q.get("tier") ?? "full");
    const model = await loadModel(lod);
    await firstFrame(renderer, model, framing, rect);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // presented
    return { lod, dpr, buffer: [bw, bh], rect, tris: tris(model), renderer: rendererInfo(renderer) };
  }

  if (mode === "img") {
    const img = document.createElement("img");
    img.alt = "";
    // The displayed width is the contain-fit width, so the browser picks the candidate the site would pick.
    const shown = containRect(w, h, framing.aspect).width;
    img.sizes = `${shown}px`;
    img.srcset = json("srcset").map((s) => `${s.url} ${s.w}w`).join(", "); // the set of the LOD the GL will draw
    slot.append(img);
    await img.decode();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { currentSrc: img.currentSrc, natural: [img.naturalWidth, img.naturalHeight] };
  }
  throw new Error(`unknown mode ${mode}`);
}

run().then((r) => (window.__done = r), (e) => (window.__done = { error: String(e?.stack ?? e) }));
