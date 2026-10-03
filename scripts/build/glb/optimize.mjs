// optimize.mjs (W-C13): raw Blender exports -> shipped GLBs, with the pivot-safe flags of W-D019.
//
//   node scripts/build/glb/optimize.mjs            assets-src/3d/camera_xt/export/*.glb -> public/models/*.glb
//   node scripts/build/glb/optimize.mjs --check    re-optimizes into a temp folder and fails if any shipped GLB
//                                                  differs byte for byte (proves public/models came from this step)
//
// @gltf-transform/cli 4.5.1 (MIT, build only, deps.md). Why each flag:
//   --compress meshopt         EXT_meshopt_compression + KHR_mesh_quantization (14-bit positions per mesh volume).
//                              Quantization moves the scale into the node that holds the mesh, so every pivot is an
//                              empty with a <name>_mesh child: the pivot's own transform never changes.
//   --simplify false           the LODs are hand-made; no automatic decimation
//   --palette false            keeps every named material (cam_*) instead of merging them into a palette texture
//   --flatten false            keeps the hierarchy (lens rings stay children of the lens pivot)
//   --join false               keeps every named mesh node separate, so each pivot moves only its own part
//   --prune false              keeps the marker empties (print_exit, lens_mount, strap_left, strap_right)
//   --instance false           no EXT_mesh_gpu_instancing: named nodes are never folded into a batch
//   --texture-compress webp    the leather normal map ships as WebP, at most 256 px
// Not covered by any flag: optimize starts with dedup, which merges materials that are identical except for their
// name. Every rig material therefore needs its own parameters; tests/w-c13 fails if a cam_* name goes missing.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = join(repo, "assets-src/3d/camera_xt/export");
const OUT = join(repo, "public/models");

export const FLAGS = [
  "--compress", "meshopt",
  "--texture-compress", "webp", "--texture-size", "256",
  "--simplify", "false", "--palette", "false", "--flatten", "false",
  "--join", "false", "--prune", "false", "--instance", "false",
];

// The package's exports map hides bin/, so the CLI entry is located through the package's main entry.
const cli = join(dirname(createRequire(import.meta.url).resolve("@gltf-transform/cli")), "../bin/cli.js");
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

function optimize(input, output) {
  const r = spawnSync(process.execPath, [cli, "optimize", input, output, ...FLAGS], { encoding: "utf8" });
  if (r.status !== 0) {
    process.stderr.write(r.stdout + r.stderr);
    throw new Error(`gltf-transform optimize failed for ${input}`);
  }
}

const check = process.argv.includes("--check");
const dest = check ? mkdtempSync(join(tmpdir(), "w-c13-glb-")) : OUT;
mkdirSync(dest, { recursive: true });
let failed = 0;
for (const name of readdirSync(SRC).filter((f) => f.endsWith(".glb")).sort()) {
  const out = join(dest, name);
  optimize(join(SRC, name), out);
  if (check) {
    const same = sha(out) === sha(join(OUT, name));
    if (!same) failed++;
    console.log(`${same ? "same" : "DIFFERENT"}  public/models/${name}  ${sha(out).slice(0, 16)}`);
  } else {
    console.log(`public/models/${name}  ${readFileSync(out).length} B  sha256 ${sha(out).slice(0, 16)}`);
  }
}
if (check) rmSync(dest, { recursive: true, force: true });
if (failed) {
  console.error(`${failed} shipped GLB(s) differ from a fresh optimize of the raw exports`);
  process.exit(1);
}
