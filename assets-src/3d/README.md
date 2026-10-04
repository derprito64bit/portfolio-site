# 3D sources (W-C13)

Everything the site's real 3D is built from. Nothing here ships; `public/models/` does.

| Path | What it is |
|---|---|
| `camera_xt/build_camera.py` | The camera, built in Blender 5.0 from one script: LOD0 (full tier), LOD1 (lite tier), the Manor LOD |
| `camera_xt/xt5/` | The 1:1 silver Fujifilm X-T5 (m2): `xt5model.py` (the model, hand-modelled by script from measured references, D-015), `xt5lib.py` (geometry helpers and the per-LOD detail knobs), `xt5tex.py` + `pebbles.py` (the leatherette maps, procedural) |
| `camera_xt/data/` | `control_map.json` (every control's measured position and size, mm), `logos.json` (the FUJIFILM and X-T5 outlines traced from the calibrated official render), `references.json` (the reference pack's URLs, dimensions and lettering positions) |
| `camera_xt/export/*.glb` | Blender's raw exports, the input of the optimizer (kept so the shipped GLBs can be re-derived without Blender) |
| `camera_xt/rig.json` | The rig contract (W-D019): pivots, markers, decals, materials, verbs and dial stops, and each node's original transform. Generated |

## Rebuild

```powershell
powershell -File scripts/build/glb/build.ps1               # Blender (blender lane, GPU only) -> optimize -> rig -> glbstat
powershell -File scripts/build/glb/build.ps1 -SkipBlender  # from the committed raw exports, no Blender
powershell -File scripts/build/glb/build.ps1 -GpuScript <path to scripts/fork/blender_gpu.py>   # fork elsewhere
node scripts/build/glb/optimize.mjs --check                 # shipped GLBs = a fresh optimize of the raw exports
node scripts/build/posters/wire.mjs                         # wireframe posters with the measured triangle counts
node --test "tests/w-c13/**/*.test.mjs"                     # rig, decals, budgets, bounding box, silhouettes
```

- The `.blend` (the Cycles source, full-resolution maps) and the texture cache are saved outside the repos
  (`portfolio-assets/xt5/blend/`, `portfolio-assets/xt5/cache/`); reference images live in
  `portfolio-assets/xt5/refs/`. None of them is ever committed.
- Blender always runs `scripts/fork/blender_gpu.py` first (D-012): `-GpuScript`, or `ION_BLENDER_GPU`.
- The dial legends are meshed from Windows' Calibri, Arial and Segoe UI, so a rebuild runs on Windows. The
  `[d64]` tag uses Bricolage Grotesque (OFL), instanced from `public/fonts/bricolage-mark.woff2` by
  `scripts/build/glb/mono_font.py` (fonttools through uvx).
- One run takes about 10 s and is deterministic: the raw exports and the shipped GLBs come out byte-identical.

## The model (m2)

The modeller's round-4 X-T5 (four critic rounds, last score 7/10), body 129.5 x 91.0 x 63.8 mm with the silver XF35mmF2
R WR, silver and black (D-014), with the real FUJIFILM and X-T5 lettering (D-011).

| LOD | How it is made | Budget (D-021) |
|---|---|---|
| LOD0 | The full model. A 0.5-degree limited dissolve merges coplanar faces off the leatherette. Web materials: the leatherette keeps its pebble maps (2048 strip); the bead-blast micro-normal and the radial anisotropy are Cycles-only and go | 100k tris, 800 kB gz |
| LOD1 | The same script with the detail knobs down (`xt5lib.LODQ`: revolves at 17%, the lens at 30%, plain bands for knurl and teeth, no meshed text), a 4-degree dissolve, then one collapse ratio on the static parts only (the body, lugs, LCD, shoe cover, strap). Spinning parts are never collapsed, so they stay round | 15k tris, 150 kB gz |
| Manor | The same measured outlines (chassis plan per height, top plate, hump, control map) at coarse resolution, flat slots `mat_silver`, `mat_graphite`, `mat_glass_dark`, `mat_brass`, plus `mat_lettering` | about 1.5k tris |

- **Lettering (D-011, W-D019):** `mark_fujifilm` (hump front) and `mark_xt5` (top plate front) are decal quads, 0.05 mm
  above their faces, sampling one alpha-tested atlas (albedo + edge-relief normal; MASK, cutoff 0.5) rasterised from
  the traced outlines. The meshed logos of the modeller's build are left out.
- **Strap and tag (W-D006):** `strap` holds a cord loop through each lug's eyelet and a disc anchor; `strap_tag` is the
  `[d64]` monogram (Bricolage 800, amber brackets) on the grip-side anchor, which faces the hero poses. Never on the
  body.
- **Rig:** the m1 names are unchanged (`dial_look` is the ISO dial, turned 30 degrees per film look); m2 adds the
  X-T5's own controls (drive and STILL/MOVIE rings, power switch, both command dials, the three LCD hinges, the
  hot-shoe cover) and the real shutter and EV stops. Every named node is an empty carrying a `<name>_mesh` child, so
  meshopt's quantization never moves it. Swapping LODs never moves a pivot, marker or decal.

## Milestones

- **m1:** the Wave 1b evidence camera, re-optimized with the pivot-safe flags (PR #28).
- **m2 (this):** the 1:1 X-T5, its decals, the strap, the fidelity gates (bounding box within 1%, silhouette IoU
  >= 0.95 against `tests/w-c13/ref-masks/`), the wireframe posters.
- **Later in #16:** `exhibit_cartridge` and the loupe; `exhibit_gear` waits for a confirmed robotics project.

## Credits

No downloaded asset (model, texture, HDRI): the geometry and the leatherette maps are generated by the scripts. The
FUJIFILM and X-T5 marks are traced from Fujifilm's official product render and kept by the owner's decision D-011.
Fonts: Bricolage Grotesque (OFL-1.1, `public/fonts/OFL-BricolageGrotesque.txt`); the dial legends are glyph outlines
of Windows system fonts (Calibri, Arial, Segoe UI) meshed into the model. Any CC0 or CC-BY asset added later is
credited here and in `content/CREDITS.md`.
