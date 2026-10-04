// optimize.mjs (W-C13): raw Blender exports -> shipped GLBs, pivot-safe (W-D019).
//
//   node scripts/build/glb/optimize.mjs            assets-src/3d/camera_xt/export/*.glb -> public/models/*.glb
//   node scripts/build/glb/optimize.mjs --check    re-optimizes into a temp folder and fails if any shipped GLB
//                                                  differs byte for byte (proves public/models came from this step)
//
// @gltf-transform/cli 4.5.1 (MIT, build only, deps.md), one command per step instead of `optimize`, because m2 needs
// steps `optimize` cannot express pivot-safely (prune of unused UVs while keeping the marker empties, dedup without
// merging the named materials). Nothing here joins, flattens, instances, simplifies or palettes, so every rig node,
// mesh node and material keeps its name and transform. Why each step:
//   prune --keep-leaves true --keep-attributes false
//                         keeps the marker empties (print_exit, lens_mount, strap_left, strap_right); drops the UVs of
//                         every primitive whose material samples no texture (the box UVs are most of the raw bytes)
//   dedup --materials false
//                         merges identical accessors, meshes and images but never two materials: every cam_* name
//                         is a public API (tests/w-c13 fails if one goes missing)
//   weld                  shares identical vertices
//   webp --quality 85     the leatherette and lettering-atlas maps (their sizes per LOD are set by build_camera.py)
//   meshopt --level high  EXT_meshopt_compression + KHR_mesh_quantization (14-bit positions per mesh volume, oct
//                         normals). Quantization moves the scale into the node that holds the mesh, so every pivot is
//                         an empty with a <name>_mesh child: the pivot's own transform never changes.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = join(repo, "assets-src/3d/camera_xt/export");
const OUT = join(repo, "public/models");

export const STEPS = [
  ["prune", "--keep-leaves", "true", "--keep-attributes", "false"],
  ["dedup", "--materials", "false"],
  ["weld"],
  ["webp", "--quality", "85", "--effort", "90"],
  ["meshopt", "--level", "high"],
];

// The package's exports map hides bin/, so the CLI entry is located through the package's main entry.
const cli = join(dirname(createRequire(import.meta.url).resolve("@gltf-transform/cli")), "../bin/cli.js");
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

export function optimize(input, output) {
  copyFileSync(input, output);
  for (const [cmd, ...flags] of STEPS) {
    const r = spawnSync(process.execPath, [cli, cmd, output, output, ...flags], { encoding: "utf8" });
    if (r.status !== 0) {
      process.stderr.write(r.stdout + r.stderr);
      throw new Error(`gltf-transform ${cmd} failed for ${input}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
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
}
