# Camera posters (W-C13)

The poster is the camera's first GL frame, baked. Before GL wakes (and forever on the static tier) the hero shows
the poster; at T0 the poster fades out over the canvas (W-D012, W-D029). For that hand-off to be invisible, the
poster and the live stage share one camera, one look and one LOD rule. This folder holds that shared code and the
script that renders the posters on the reference host.

| File | Role |
|---|---|
| `stage.js` | The framing contract. `computeFraming()` (build), `applyFraming()`, `containRect()`, `pickLod()`, `posterSet()` (live) |
| `look.js` | The reference look (from the Darkroom prototype): tone mapping, environment, key and amber rim light |
| `page.html`, `page.js` | The stage page the scripts drive: framing, poster, live first frame, poster as `<img>` |
| `harness.mjs` | Shared by the scripts: tokens, static server, muted Chrome on the GPU |
| `render.mjs` | Renders the posters and writes `posters.json` |
| `wire.mjs` | Renders the wireframe posters (W-D020 'Show the mesh', static tier) into `public/posters/wire/` with `wire.json`: the triangle count of every shipped LOD, measured on the loaded geometry and cross-checked against glbstat |

## Render

```powershell
node scripts/build/posters/render.mjs --out public/posters/camera     # the hero crew's output folder
node scripts/build/posters/render.mjs --look src/gl/camera/look.js     # once the hero has its own look module
```

Run it on the reference host (it refuses a software renderer). It reads `tokens.stage` (FOV 28, one pose per band)
and writes, per band, a LOD0 set (480, 800, 1200, 1600 px) and a LOD1 set (360, 600, 900, 1200 px) in AVIF and WebP,
plus `posters.json`. Re-run after any change to the model, the look or a pose.

```powershell
node scripts/build/posters/wire.mjs                                    # public/posters/wire (800 and 1200 px)
```

## What the live stage does with `posters.json`

1. **Camera:** `applyFraming(camera, posters.bands[band])`. The pose, FOV and crop come from the file, never from the
   viewport or the scroll.
2. **Viewport:** draw into `containRect(slotWidthPx, slotHeightPx, entry.aspect)` (device px of the canvas, top-left
   origin; flip y for `setViewport`/`setScissor`). The rest of the slot stays clear.
3. **LOD:** `pickLod(rect.width, tier)`: the tokens rule (LOD0 at 600 device px and wider) on the full tier only;
   the lite tier always draws LOD1 (D-021: the 100k-triangle LOD0 is full tier only).
4. **Poster in the DOM:** `posterSet(entry, { slotW, slotH, glDpr, tier })` gives the set of the LOD that GL will draw.
   Show `posterFile(set.files, containCssWidth, glDpr)`, the file nearest the GL frame's device width, as
   `<img style="object-fit: contain">`: a phone's lite canvas renders at DPR 1.5, so a 3x srcset pick would be sharper
   than the frame it hands over to. The static tier shows the LOD0 set through `srcset` and `sizes`.
5. **Look:** import the same look module that rendered the posters.
6. **First frame:** draw it only after `renderer.compileAsync()` and `initTexture()` of every map, so it is never a
   half-loaded frame.

## Parity check (acceptance: mean diff <= 4/255)

```powershell
node tests/w-c13/poster-parity.mjs --out <evidence dir>
```

It renders the posters, then for every GES-1 profile plus 1180x820, 600x900 and a landscape phone it shoots the same
hero slot twice: the live first frame at the tier's DPR, MSAA, pixel cap and LOD, and the poster from `posterSet()`.
The slot sizes are an estimate from the tokens until the hero exists; the hero crew re-runs the check on the real
slots.
