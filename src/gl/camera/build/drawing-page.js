// The X-T5 line drawing, generated from the 3D model (D-024, #13 A1): the page drawing.mjs drives in Chrome on the
// reference host. For one band's framing (posters.json, the hero pose) it returns the drawing as SVG path data:
// - feature lines from LOD0's own geometry: view-dependent contours (front/back face changes), creases of 35 degrees
//   or more, and the silver/dark material boundaries, on one welded topology of the whole camera;
// - curated by material: lettering, engravings, glass and the like draw nothing; knurls, leatherette and rubber give
//   contours only (no ridge or pebble lines); everything still occludes;
// - hidden lines removed against a depth buffer of the full model in the same camera (so no line behind the body);
// - two weights: contours that border the background or a depth jump (the outline) and every other line;
// - chained into strokes, simplified, and the shortest light strokes dropped until about 120 remain.
// Coordinates are a 1000-unit-wide frame of the band's aspect: the poster frame, so the drawing registers on the
// poster and on the first GL frame (same framing, object-fit contain). Plain JS for the browser; no rAF (lint).
import { DoubleSide, FloatType, Mesh, NearestFilter, PerspectiveCamera, RGBAFormat, Scene, ShaderMaterial, Vector3, WebGLRenderer, WebGLRenderTarget } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { applyFraming } from '/scripts/build/posters/stage.js';

const q = new URLSearchParams(location.search);
const framing = JSON.parse(q.get('framing'));
const opt = JSON.parse(q.get('opts') || '{}');
const W = 1000;
const H = W / framing.aspect;
const RW = opt.depthWidth ?? 2400;
const RH = Math.round(RW / framing.aspect);
const CREASE_DEG = opt.creaseDeg ?? 35;
const TARGET = opt.target ?? 120;

/** Faces of these materials draw no line (they still hide what is behind them). */
const SKIP = new Set(['cam_lettering', 'cam_engraving', 'cam_lens_legend', 'cam_screen', 'cam_sensor', 'cam_sensor_edge', 'cam_contact', 'cam_pin', 'cam_glass', 'cam_glass_inner', 'cam_coated', 'cam_coated_green', 'cam_element_edge', 'cam_evf_glass', 'cam_lcd_glass', 'cam_lens_bore', 'cam_throat', 'cam_bayonet_dark', 'cam_lamp', 'cam_gold']);
/** Textured or knurled surfaces: their contours only, never their ridge or pebble creases. */
const KNURL = new Set(['cam_lens_ridge', 'cam_silver_ring', 'cam_leather', 'cam_leather_coarse', 'cam_leather_pad', 'cam_rubber', 'cam_satin_collar', 'cam_dial_rear', 'cam_strap', 'cam_bayonet']);
/** The silver family: a boundary between it and the dark family is drawn even without a crease (the top plate). */
const SILVER = /^cam_(silver|chrome|lens_silver|shoe|satin_mid|gunmetal)/;

async function loadModel(file) {
  await MeshoptDecoder.ready;
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(file);
  return gltf.scene;
}

/** Knurled turning parts: their lines come from LOD1, where the knurl is a normal map on a smooth cylinder (LOD0's
 *  real teeth would draw as a saw edge). Everything else draws from LOD0, whose circles are finely tessellated. */
const KNURLED_PART = /^(dial_look|dial_shutter|dial_ev|ring_drive|ring_still_movie|dial_cmd_front|dial_cmd_rear|lens_focus_ring|lens_aperture_ring)/;
function partOf(o) {
  for (let p = o; p; p = p.parent) if (KNURLED_PART.test(p.name ?? '')) return true;
  return false;
}

// ---------------------------------------------------------------- the depth buffer (view depth, metres)
function depthBuffer(renderer, model, camera) {
  const rt = new WebGLRenderTarget(RW, RH, { type: FloatType, format: RGBAFormat, minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: true });
  const scene = new Scene();
  scene.add(model);
  scene.overrideMaterial = new ShaderMaterial({
    side: DoubleSide,
    vertexShader: 'varying float vD; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vD; void main() { gl_FragColor = vec4(vD, 0.0, 0.0, 1.0); }',
  });
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const buf = new Float32Array(RW * RH * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, RW, RH, buf);
  renderer.setRenderTarget(null);
  scene.remove(model);
  rt.dispose();
  // Row 0 of the buffer is the bottom of the frame: flip to top-down, keep depth (0 = background).
  const d = new Float32Array(RW * RH);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    const i = ((RH - 1 - y) * RW + x) * 4;
    d[y * RW + x] = buf[i + 3] > 0 ? buf[i] : 0;
  }
  return d;
}

// ---------------------------------------------------------------- one welded topology of the whole camera
function topology(model, take = () => true) {
  const pos = [];
  const keyOf = new Map();
  const faces = []; // [a, b, c, mat]
  const mats = [];
  const matIndex = new Map();
  const v = new Vector3();
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh || !o.visible || !take(o)) return;
    const name = o.material?.name ?? '';
    if (!matIndex.has(name)) {
      matIndex.set(name, mats.length);
      mats.push(name);
    }
    const mi = matIndex.get(name);
    const g = o.geometry;
    const p = g.attributes.position;
    const local = new Array(p.count);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      const k = `${Math.round(v.x * 2e5)},${Math.round(v.y * 2e5)},${Math.round(v.z * 2e5)}`;
      let id = keyOf.get(k);
      if (id === undefined) {
        id = pos.length / 3;
        keyOf.set(k, id);
        pos.push(v.x, v.y, v.z);
      }
      local[i] = id;
    }
    const idx = g.index ? g.index.array : null;
    const n = idx ? idx.length : p.count;
    for (let i = 0; i < n; i += 3) {
      const a = local[idx ? idx[i] : i], b = local[idx ? idx[i + 1] : i + 1], c = local[idx ? idx[i + 2] : i + 2];
      if (a === b || b === c || a === c) continue;
      faces.push([a, b, c, mi]);
    }
  });
  return { pos, faces, mats };
}

function faceNormals(pos, faces) {
  const n = new Float32Array(faces.length * 3);
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  faces.forEach(([i, j, k], f) => {
    a.fromArray(pos, i * 3);
    b.fromArray(pos, j * 3).sub(a);
    c.fromArray(pos, k * 3).sub(a);
    b.cross(c).normalize();
    n[f * 3] = b.x; n[f * 3 + 1] = b.y; n[f * 3 + 2] = b.z;
  });
  return n;
}

/** Candidate feature edges: [a, b, kind] with kind 'sil' (contour) or 'line' (crease, boundary, material edge). */
function featureEdges(topo, camPos) {
  const { pos, faces, mats } = topo;
  const normals = faceNormals(pos, faces);
  const edges = new Map();
  faces.forEach(([a, b, c], f) => {
    for (const [x, y] of [[a, b], [b, c], [c, a]]) {
      const k = x < y ? `${x}_${y}` : `${y}_${x}`;
      const e = edges.get(k);
      if (e) e.push(f);
      else edges.set(k, [f]);
    }
  });
  const facing = (f) => {
    const i = faces[f][0] * 3;
    return normals[f * 3] * (camPos.x - pos[i]) + normals[f * 3 + 1] * (camPos.y - pos[i + 1]) + normals[f * 3 + 2] * (camPos.z - pos[i + 2]) > 0;
  };
  const cosCrease = Math.cos((CREASE_DEG * Math.PI) / 180);
  const out = [];
  for (const [k, fs] of edges) {
    const names = fs.map((f) => mats[faces[f][3]]);
    if (names.every((m) => SKIP.has(m))) continue;
    const [x, y] = k.split('_').map(Number);
    const front = fs.map(facing);
    if (!front.some(Boolean)) continue; // only back faces: never visible
    if (fs.length === 1) {
      if (!KNURL.has(names[0]) && !SKIP.has(names[0])) out.push([x, y, 'line']);
      continue;
    }
    if (front.some(Boolean) && front.some((f) => !f)) {
      out.push([x, y, 'sil']);
      continue;
    }
    const plain = names.filter((m) => !SKIP.has(m) && !KNURL.has(m));
    const [f0, f1] = fs;
    const dot = normals[f0 * 3] * normals[f1 * 3] + normals[f0 * 3 + 1] * normals[f1 * 3 + 1] + normals[f0 * 3 + 2] * normals[f1 * 3 + 2];
    const crease = fs.length > 2 || dot < cosCrease;
    if (crease && plain.length) {
      out.push([x, y, 'line']);
      continue;
    }
    const silverSide = names.map((m) => SILVER.test(m));
    if (!names.some((m) => SKIP.has(m)) && silverSide.some(Boolean) && silverSide.some((s) => !s)) out.push([x, y, 'line']);
  }
  return out;
}

// ---------------------------------------------------------------- projection and hidden lines
function projector(camera) {
  const v = new Vector3();
  return (x, y, z) => {
    v.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
    const depth = -v.z;
    v.applyMatrix4(camera.projectionMatrix);
    return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H, depth];
  };
}

function sampler(depth) {
  const at = (sx, sy) => {
    const x = Math.floor((sx / W) * RW);
    const y = Math.floor((sy / H) * RH);
    if (x < 0 || y < 0 || x >= RW || y >= RH) return 0;
    return depth[y * RW + x];
  };
  /** The nearest surface depth around a point (3 x 3 depth pixels); 0 where only background. */
  const near = (sx, sy) => {
    const x0 = Math.floor((sx / W) * RW), y0 = Math.floor((sy / H) * RH);
    let m = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= RW || y >= RH) continue;
      const d = depth[y * RW + x];
      if (d > 0 && d < m) m = d;
    }
    return m === Infinity ? 0 : m;
  };
  return { at, near };
}

function visibleRuns(edges, topo, project, depthAt) {
  const { pos } = topo;
  const runs = [];
  const step = (W / RW) * 0.7;
  for (const [a, b, kind] of edges) {
    const A = [pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]];
    const B = [pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]];
    const pa = project(...A), pb = project(...B);
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    if (len < 0.05) continue;
    const n = Math.max(2, Math.ceil(len / step));
    const samples = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = project(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
      const d = depthAt.near(p[0], p[1]);
      samples.push({ p, vis: d === 0 || p[2] <= d + 0.0012 + 0.004 * p[2] });
    }
    // A contour grazing its own surface flickers in and out of the depth test: hidden stretches of 1.5 units or less
    // between visible ones are depth noise, not occlusion, and are filled.
    for (let i = 1; i < samples.length; i++) {
      if (samples[i].vis || !samples[i - 1].vis) continue;
      let j = i;
      while (j < samples.length && !samples[j].vis) j++;
      if (j < samples.length && (j - i) * step <= 1.5) for (let k = i; k < j; k++) samples[k].vis = true;
      i = j;
    }
    let run = null;
    for (const { p, vis } of samples) {
      if (vis) {
        if (!run) {
          run = { kind, pts: [] };
          runs.push(run);
        }
        run.pts.push([p[0], p[1], p[2]]);
      } else run = null;
    }
  }
  return runs.filter((r) => r.pts.length >= 2);
}

/** Outline weight: a contour whose far side (a few depth pixels across) is background or a depth jump of 8 mm. */
function weigh(run, depthAt) {
  if (run.kind !== 'sil') return 'light';
  const px = (W / RW) * 4;
  let heavy = 0, total = 0;
  for (let i = 1; i < run.pts.length; i++) {
    const [x0, y0, z] = run.pts[i - 1];
    const [x1, y1] = run.pts[i];
    const l = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / l, ny = (x1 - x0) / l;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const s1 = depthAt.at(mx + nx * px, my + ny * px);
    const s2 = depthAt.at(mx - nx * px, my - ny * px);
    const jump = (s) => s === 0 || s > z + 0.008;
    if (jump(s1) || jump(s2)) heavy++;
    total++;
  }
  return heavy / total >= 0.5 ? 'heavy' : 'light';
}

// ---------------------------------------------------------------- strokes
function chain(runs) {
  const Q = 0.35;
  const key = (p) => `${Math.round(p[0] / Q)},${Math.round(p[1] / Q)}`;
  const polys = runs.map((r) => ({ w: r.w, pts: r.pts.map((p) => [p[0], p[1]]), used: false }));
  const ends = new Map();
  const add = (k, v) => (ends.get(k) ?? ends.set(k, []).get(k)).push(v);
  polys.forEach((p, i) => {
    add(key(p.pts[0]), [i, 0]);
    add(key(p.pts[p.pts.length - 1]), [i, 1]);
  });
  const strokes = [];
  const extend = (pts, w) => {
    for (;;) {
      const k = key(pts[pts.length - 1]);
      const cands = (ends.get(k) ?? []).filter(([i]) => !polys[i].used && polys[i].w === w);
      if (cands.length !== 1) return;
      const [i, end] = cands[0];
      polys[i].used = true;
      const next = end === 0 ? polys[i].pts : [...polys[i].pts].reverse();
      pts.push(...next.slice(1));
    }
  };
  for (const p of polys) {
    if (p.used) continue;
    p.used = true;
    const pts = [...p.pts];
    extend(pts, p.w);
    pts.reverse();
    extend(pts, p.w);
    strokes.push({ w: p.w, pts });
  }
  return strokes;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const l = Math.hypot(dx, dy) || 1e-9;
  let far = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / l;
    if (d > far) {
      far = d;
      at = i;
    }
  }
  if (far <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
}

const length = (pts) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

/** Points every `step` units along a polyline, each with its direction (radians mod pi). */
function resample(pts, step) {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    const a = ((Math.atan2(y1 - y0, x1 - x0) % Math.PI) + Math.PI) % Math.PI;
    const n = Math.max(1, Math.ceil(l / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, a]);
  }
  return out;
}

/**
 * Near-duplicates: two primitives' contours, a bevel's two creases, a ring's inner and outer edge a hair apart.
 * Strokes are laid down heavy first, then longest first; a stretch of a later stroke that runs parallel (within 25
 * degrees) within 1.2 units of one already laid is dropped. Crossings and T-junctions are kept (not parallel).
 */
function dedupe(strokes) {
  const G = 1.2;
  const grid = new Map();
  const cell = (x, y) => `${Math.floor(x / G)},${Math.floor(y / G)}`;
  const parallel = (a, b) => {
    const d = Math.abs(a - b);
    return Math.min(d, Math.PI - d) < (25 * Math.PI) / 180;
  };
  const covered = (x, y, a) => {
    const cx = Math.floor(x / G), cy = Math.floor(y / G);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const list = grid.get(`${cx + dx},${cy + dy}`);
      if (list?.some(([ox, oy, oa]) => Math.hypot(ox - x, oy - y) <= G && parallel(oa, a))) return true;
    }
    return false;
  };
  const order = [...strokes].sort((s, t) => (s.w === t.w ? t.len - s.len : s.w === 'heavy' ? -1 : 1));
  const out = [];
  for (const s of order) {
    const samples = resample(s.pts, 0.8);
    let run = [];
    const flush = () => {
      if (run.length >= 3) out.push({ w: s.w, pts: run.map(([x, y]) => [x, y]) });
      run = [];
    };
    for (const p of samples) {
      if (covered(p[0], p[1], p[2])) flush();
      else run.push(p);
    }
    flush();
    for (const [x, y, a] of samples) {
      const k = cell(x, y);
      (grid.get(k) ?? grid.set(k, []).get(k)).push([x, y, a]);
    }
  }
  return out.map((s) => ({ ...s, pts: rdp(s.pts, 0.35) }));
}

/** Close the small gaps a contour leaves where it hops between triangles: join same-weight ends within 4 units
 *  whose directions continue each other (within 40 degrees). */
function bridge(strokes) {
  const dir = (pts, end) => {
    const [a, b] = end ? [pts[pts.length - 2], pts[pts.length - 1]] : [pts[1], pts[0]];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  let joined = true;
  const list = strokes.map((s) => ({ ...s, pts: [...s.pts] }));
  while (joined) {
    joined = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < list.length; j++) {
        if (i === j || list[i].w !== list[j].w) continue;
        const A = list[i].pts, B = list[j].pts;
        for (const ea of [1, 0]) for (const eb of [0, 1]) {
          const pa = ea ? A[A.length - 1] : A[0];
          const pb = eb ? B[B.length - 1] : B[0];
          const gap = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
          if (gap > 4) continue;
          const da = dir(A, ea);
          const db = dir(B, eb).map((v) => -v);
          if (da[0] * db[0] + da[1] * db[1] < Math.cos((40 * Math.PI) / 180)) continue;
          const a = ea ? A : [...A].reverse();
          const b = eb ? [...B].reverse() : B;
          list[i] = { w: list[i].w, pts: [...a, ...b] };
          list.splice(j, 1);
          joined = true;
          break outer;
        }
      }
    }
  }
  return list;
}

function curate(strokes) {
  const simple = strokes.map((s) => ({ ...s, pts: rdp(s.pts, 0.35) })).map((s) => ({ ...s, len: length(s.pts) }));
  const clean = bridge(dedupe(simple)).map((s) => ({ ...s, pts: rdp(s.pts, 0.6) })).map((s) => ({ ...s, len: length(s.pts) }));
  const heavy = clean.filter((s) => s.w === 'heavy' && s.len >= 4);
  let light = clean.filter((s) => s.w === 'light' && s.len >= 6).sort((a, b) => b.len - a.len);
  const room = Math.max(0, TARGET - heavy.length);
  if (light.length > room) light = light.slice(0, room);
  return { heavy, light };
}

const SMOOTH_DEG = 33;
/** Path data is written in a frame twice the working frame's units, as whole numbers. */
const SCALE = 2;

/**
 * One stroke as SVG path data. The model's round parts are polygons (a 16-gon lens ring, a 24-gon dial), and their
 * vertices lie on the true curve: where a vertex turns by less than 33 degrees it is a sample of a curve, and the
 * stroke passes through it on a Catmull-Rom curve (as cubic Beziers), which bulges back out to the circle between
 * vertices. Sharper turns are real corners and stay corners. Closed loops wrap around.
 */
function strokePath(pts) {
  const n = pts.length;
  if (n < 3) return encode([['M', [pts[0]]], ...pts.slice(1).map((p) => ['l', [p]])]);
  const closed = Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 0.6;
  const P = closed ? pts.slice(0, -1) : pts;
  const m = P.length;
  const at = (i) => (closed ? P[(i + m) % m] : P[Math.max(0, Math.min(m - 1, i))]);
  const turn = P.map((p, i) => {
    if (!closed && (i === 0 || i === m - 1)) return null;
    const a = at(i - 1), b = at(i + 1);
    let d = Math.atan2(b[1] - p[1], b[0] - p[0]) - Math.atan2(p[1] - a[1], p[0] - a[0]);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
  });
  const deg = (r) => (Math.abs(r) * 180) / Math.PI;
  const tAt = (i) => turn[closed ? (i + m) % m : i];
  // A curve sample: a gentle turn, or a turn of up to 60 degrees between neighbours turning the same way (a small
  // circle such as a button, drawn as an octagon).
  const smooth = turn.map((t, i) => {
    if (t === null) return false;
    if (deg(t) < SMOOTH_DEG) return true;
    const a = tAt(i - 1), b = tAt(i + 1);
    return deg(t) < 60 && a !== null && b !== null && Math.sign(a) === Math.sign(t) && Math.sign(b) === Math.sign(t) && deg(a) < 60 && deg(b) < 60;
  });
  const tangent = (i) => {
    const k = closed ? (i + m) % m : i;
    if (!smooth[k]) return [0, 0];
    const a = at(i - 1), b = at(i + 1);
    return [(b[0] - a[0]) / 6, (b[1] - a[1]) / 6];
  };
  const cmds = [['M', [P[0]]]];
  const segs = closed ? m : m - 1;
  for (let i = 0; i < segs; i++) {
    const p1 = at(i), p2 = at(i + 1);
    const t1 = tangent(i), t2 = tangent(i + 1);
    if (!t1[0] && !t1[1] && !t2[0] && !t2[1]) cmds.push(['l', [p2]]);
    else cmds.push(['c', [[p1[0] + t1[0], p1[1] + t1[1]], [p2[0] - t2[0], p2[1] - t2[1]], p2]]);
  }
  return encode(cmds) + (closed ? 'z' : '');
}

/**
 * Compact path data: whole units of a 2000-unit frame (half a unit is under 0.2 CSS px at the widest slot), every
 * command after the first move relative to the rounded current point (so rounding never accumulates), repeated
 * command letters dropped and a minus sign used as the separator where it can.
 */
function encode(cmds) {
  const R = (v) => Math.round(v * SCALE);
  let cx = 0, cy = 0;
  let out = '';
  let last = '';
  const nums = (list) => list.reduce((s, n, i) => s + (i && n >= 0 ? ' ' : '') + n, '');
  for (const [type, pts] of cmds) {
    if (type === 'M') {
      cx = R(pts[0][0]);
      cy = R(pts[0][1]);
      out += `M${nums([cx, cy])}`;
      last = 'M';
      continue;
    }
    const rel = pts.map(([x, y]) => [R(x) - cx, R(y) - cy]).flat();
    const end = pts[pts.length - 1];
    if (type === 'l' && rel[0] === 0 && rel[1] === 0) continue;
    const letter = type === last || (type === 'l' && last === 'M' && false) ? '' : type;
    const body = nums(rel);
    out += letter ? letter + body : (body[0] === '-' ? body : ` ${body}`);
    last = type;
    cx = R(end[0]);
    cy = R(end[1]);
  }
  return out;
}

function pathData(strokes) {
  return strokes.map((s) => strokePath(s.pts)).join('');
}

async function run() {
  const renderer = new WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(8, 8, false);
  const lod0 = await loadModel('/public/models/camera_xt_lod0.glb');
  const lod1 = await loadModel('/public/models/camera_xt_lod1.glb');
  const camera = applyFraming(new PerspectiveCamera(), framing);
  const depth = depthBuffer(renderer, lod0, camera);
  const depthAt = sampler(depth);
  const runs = [];
  let tris = 0;
  let edgeCount = 0;
  for (const [model, take] of [[lod0, (o) => !partOf(o)], [lod1, (o) => partOf(o)]]) {
    const topo = topology(model, take);
    const edges = featureEdges(topo, camera.position);
    tris += topo.faces.length;
    edgeCount += edges.length;
    runs.push(...visibleRuns(edges, topo, projector(camera), depthAt));
  }
  for (const r of runs) r.w = weigh(r, depthAt);
  const strokes = chain(runs);
  const { heavy, light } = curate(strokes);
  const ext = renderer.getContext().getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? renderer.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  renderer.dispose();
  return {
    width: W * SCALE,
    height: Math.round(H * SCALE * 10) / 10,
    heavy: pathData(heavy),
    light: pathData(light),
    stats: { tris, edges: edgeCount, runs: runs.length, chained: strokes.length, heavy: heavy.length, light: light.length, depth: [RW, RH], creaseDeg: CREASE_DEG },
    renderer: gpu,
  };
}

run().then((r) => (window.__done = r), (e) => (window.__done = { error: String(e?.stack ?? e) }));
