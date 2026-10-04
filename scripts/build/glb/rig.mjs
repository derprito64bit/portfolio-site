// rig.mjs (W-C13): writes assets-src/3d/camera_xt/rig.json, the camera's rig contract (W-D019).
//
//   node scripts/build/glb/rig.mjs           reads the raw Blender exports, checks the rig, writes rig.json
//   node scripts/build/glb/rig.mjs --check   fails if rig.json is not what the raw exports and public/models give
//
// rig.json records, per LOD, the ORIGINAL transforms of every pivot, marker and decal as Blender exported them
// (before gltf-transform), the materials, and the hashes of the raw and shipped GLBs. tests/w-c13 loads the shipped
// GLBs in three r186 and compares every node with these transforms.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { glbStat, readGlbJson } from "./glbstat.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RAW = join(repo, "assets-src/3d/camera_xt/export");
const SHIP = join(repo, "public/models");
const OUT = join(repo, "assets-src/3d/camera_xt/rig.json");

// Dial stops of the 1:1 X-T5 (m2), from the model's engravings (xt5/xt5model.py). Angles are rotations about the
// pivot's +Y that bring a stop to the dial's index (three's rotation.y, right-handed): stop k at deg[k].
const SHUTTER = ["A", "B", "T", "1", "2", "4", "8", "15", "30", "60", "125", "250X", "500", "1000", "2000", "4000", "8000"];
const EV = { 0: "0", 3: "+1", 6: "+2", 9: "+3", 12: "C", 15: "-3", 18: "-2", 21: "-1" };
const r4 = (x) => +x.toFixed(4);

// The W-D019 rig API (m1 names unchanged) plus the m2 controls. Axes are in the pivot's local space, glTF convention:
// +Y up, the lens looks down +Z, +X is the camera's own left. part: false marks a hinge with no part of its own.
export const SPEC = {
  pivots: {
    dial_shutter: { verb: "spin", axis: [0, 1, 0], detents: 17, stepDeg: r4(360 / 17),
      stops: SHUTTER.map((label, k) => ({ label, deg: r4((360 / 17) * k) })) },
    dial_ev: { verb: "spin", axis: [0, 1, 0], detents: 24, stepDeg: 15,
      stops: Object.entries(EV).map(([k, label]) => ({ label, deg: 15 * Number(k) })),
      note: "24 marks 15 degrees apart (thirds of a stop); labelled stops listed" },
    dial_look: { verb: "spin", axis: [0, 1, 0], detents: 5, stepDeg: 30,
      note: "the ISO dial: the site turns it 30 degrees per film look (W-D018); its own engraving has 23 stops" },
    shutter_button: { verb: "press", axis: [0, -1, 0], travelM: 0.0012 },
    lens: { verb: "swap" },
    lens_aperture_ring: { verb: "spin", axis: [0, 0, 1], detents: 22, note: "A 16 11 8 5.6 4 2.8 2, 1/3 stops" },
    lens_focus_ring: { verb: "spin", axis: [0, 0, 1] },
    lens_glass: { verb: "fixed", note: "the front optics, a child of lens" },
    ring_drive: { verb: "spin", axis: [0, 1, 0], rangeDeg: [-60, 60] },
    ring_still_movie: { verb: "spin", axis: [0, 1, 0], rangeDeg: [0, 24] },
    switch_power: { verb: "spin", axis: [0, 1, 0], rangeDeg: [0, 25] },
    dial_cmd_front: { verb: "spin", axis: [0, 1, 0] },
    dial_cmd_rear: { verb: "spin", axis: [0, 1, 0] },
    lcd: { verb: "tilt", axis: [1, 0, 0], rangeDeg: [0, 90], note: "tilt up: the bottom edge swings out" },
    lcd_tilt_down: { verb: "tilt", axis: [1, 0, 0], rangeDeg: [-45, 0], part: false, note: "tilt down: the top edge out" },
    lcd_portrait: { verb: "tilt", axis: [0, 1, 0], rangeDeg: [0, 60], note: "hinge on the -X edge; the +X edge swings out" },
    hot_shoe_cover: { verb: "remove", axis: [0, 0, -1], note: "shipped fitted" },
    strap: { verb: "fixed", note: "cord loops and disc anchors on both lugs; carries strap_tag" },
  },
  markers: ["print_exit", "lens_mount", "strap_left", "strap_right"],
  decals: ["mark_fujifilm", "mark_xt5", "strap_tag"],
  materials: ["cam_silver", "cam_black_metal", "cam_leather", "cam_rubber", "cam_amber", "cam_glass", "cam_paint",
    "cam_lettering"],
};

const WEB = Object.keys(SPEC.pivots);
export const LODS = {
  lod0: { file: "camera_xt_lod0.glb", pivots: WEB, materials: SPEC.materials, lettering: "cam_lettering" },
  lod1: { file: "camera_xt_lod1.glb", pivots: WEB, materials: SPEC.materials, lettering: "cam_lettering" },
  // The Manor viewmodel only presses the shutter and swaps the lens; its slots are flat FlatToon materials, plus
  // mat_lettering for the decals.
  manor: { file: "camera_xt_manor.glb", pivots: ["shutter_button", "lens", "strap"],
    materials: ["mat_silver", "mat_graphite", "mat_glass_dark", "mat_brass", "mat_lettering"], lettering: "mat_lettering" },
};

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

// Pretty JSON that keeps any value fitting in 200 characters on one line (one line per node), so diffs stay readable.
export function stringifyRig(value, pad = "") {
  const flat = JSON.stringify(value).replace(/,(?=["\d[{-])/g, ", ").replace(/":/g, "\": ");
  if (pad && flat.length <= 200) return flat;
  if (value === null || typeof value !== "object") return flat;
  const inner = pad + " ";
  const items = Array.isArray(value)
    ? value.map((v) => inner + stringifyRig(v, inner))
    : Object.entries(value).map(([k, v]) => `${inner}${JSON.stringify(k)}: ${stringifyRig(v, inner)}`);
  const [open, close] = Array.isArray(value) ? ["[", "]"] : ["{", "}"];
  return `${open}\n${items.join(",\n")}\n${pad}${close}` + (pad ? "" : "\n");
}

function trs(n) {
  if (n.matrix) throw new Error(`node ${n.name} uses a matrix; the rig expects TRS`);
  return { translation: n.translation ?? [0, 0, 0], rotation: n.rotation ?? [0, 0, 0, 1], scale: n.scale ?? [1, 1, 1] };
}

function rigOf(json, names) {
  const parent = {};
  (json.nodes ?? []).forEach((n, i) => (n.children ?? []).forEach((c) => (parent[c] = i)));
  const out = {};
  for (const name of names) {
    const i = json.nodes.findIndex((n) => n.name === name);
    if (i < 0) throw new Error(`missing node ${name}`);
    const n = json.nodes[i];
    out[name] = { parent: parent[i] === undefined ? null : json.nodes[parent[i]].name, mesh: n.mesh !== undefined, ...trs(n) };
  }
  return out;
}

export function buildRig() {
  const rig = { $comment: "Generated by scripts/build/glb/rig.mjs from the raw Blender exports. Do not edit.",
    units: "m", axes: { up: "+Y", lensLooks: "+Z", cameraLeft: "+X" }, spec: SPEC, lods: {} };
  const errors = [];
  for (const [lod, def] of Object.entries(LODS)) {
    const raw = readFileSync(join(RAW, def.file));
    const json = readGlbJson(raw);
    const names = [...def.pivots, ...SPEC.markers, ...SPEC.decals];
    let nodes = {};
    try { nodes = rigOf(json, names); } catch (e) { errors.push(`${lod}: ${e.message}`); }
    for (const p of def.pivots) {
      if (nodes[p]?.mesh) errors.push(`${lod}: pivot ${p} holds a mesh; pivots must be empties with a ${p}_mesh child`);
      const extras = json.nodes.find((n) => n.name === p)?.extras ?? {};
      if (extras.rig_verb && extras.rig_verb !== SPEC.pivots[p].verb) errors.push(`${lod}: ${p} verb ${extras.rig_verb} in Blender, ${SPEC.pivots[p].verb} in SPEC`);
    }
    for (const d of SPEC.decals) {
      const i = json.nodes.findIndex((n) => n.name === d);
      const child = (json.nodes[i]?.children ?? []).map((c) => json.nodes[c]).find((n) => n.name === `${d}_mesh`);
      if (nodes[d]?.mesh || child?.mesh === undefined) errors.push(`${lod}: decal ${d} must be an empty with a ${d}_mesh child`);
    }
    const mats = (json.materials ?? []).map((m) => m.name);
    for (const m of def.materials) if (!mats.includes(m)) errors.push(`${lod}: missing material ${m}`);
    const shipped = join(SHIP, def.file);
    const stat = glbStat(raw, def.file);
    rig.lods[lod] = {
      file: def.file, tris: stat.tris, draws: stat.draws, materials: def.materials, allMaterials: [...mats].sort(),
      rawSha256: sha(raw), shippedSha256: existsSync(shipped) ? sha(readFileSync(shipped)) : null, nodes,
    };
  }
  // Swapping LODs must never move a pivot, a marker or a decal.
  for (const name of [...Object.keys(SPEC.pivots), ...SPEC.markers, ...SPEC.decals]) {
    const seen = Object.entries(rig.lods).filter(([, l]) => l.nodes[name]);
    if (!seen.length) continue;
    const ref = JSON.stringify((({ parent, translation, rotation, scale }) => ({ parent, translation, rotation, scale }))(seen[0][1].nodes[name]));
    for (const [lod, l] of seen.slice(1)) {
      const { parent, translation, rotation, scale } = l.nodes[name];
      if (JSON.stringify({ parent, translation, rotation, scale }) !== ref) errors.push(`${name}: ${lod} differs from ${seen[0][0]}`);
    }
  }
  return { rig, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { rig, errors } = buildRig();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  const text = stringifyRig(rig);
  if (process.argv.includes("--check")) {
    const same = existsSync(OUT) && readFileSync(OUT, "utf8") === text;
    console.log(same ? "rig.json is current" : "rig.json is STALE: run node scripts/build/glb/rig.mjs");
    process.exit(same ? 0 : 1);
  }
  writeFileSync(OUT, text);
  for (const [lod, l] of Object.entries(rig.lods)) {
    console.log(`${lod}: ${l.tris} tris, ${l.draws} draws, ${Object.keys(l.nodes).length} rig nodes, raw ${l.rawSha256.slice(0, 12)}`);
  }
}
