# Darkroom FX playbook

> **Site revision 1 (2026-10-04)** of the research playbook revision 3 (`portfolio-evidence/research-fx/PLAYBOOK.md`
> and its evidence folders). **Owner decisions applied:** **D-023** (standalone portfolio; the game is one project:
> the door sequence, enlarger, safelight and Grand Gallery print are cut), **D-024** (the X-T5 drawing developing into
> the camera is the hero, W-S1 #13 Amendment A1), **D-025** (the moodboard translation, section 3, is accepted),
> **D-026** (calm grain that forms once; 0 at d = 1 on prints; only the loupe adds static grain).
>
> Tags: **V** verified in research, **D** documented, **E** estimate. If this page and an issue amendment disagree,
> the amendment wins and this page is fixed.

## 1. Signature: everything develops

One family, **light-first development**. Nothing fades in. It develops like an instant print: veil, then light from
the eject edge, silver before dye, then the still (W-D016). The site opens on a line drawing of the X-T5 on an
undeveloped print. The drawing develops into the real camera, and the camera ejects print 1, which develops in turn.
Every supporting effect is part of a develop or of the darkroom equipment that makes one. It is cheap because it
rides shaders being written now, so W-S1 #13 settles these chunks
before its develop shader locks. Static, no-WebGL and reduced motion show the
baked end state.

## 2. Supporting effects (four, plus the camera patch)

| # | Effect (moodboard tile) | Where (beat) | Crew | Tiers | Reduced | kB gz |
|---|---|---|---|---|---|---|
| 1 | Roller tracks (1) | every eject: print 1 (1) and shutter prints | W-S1 #13 (hero), W-C2 #17 (all ejects, final) | full: all ejects; lite: shutter ejects | none | 0.5 (E) |
| 2 | Calm grain over a light-first glow (2, 5) | print 1 (1); enlargements (2); sheet, faint (3) | W-S1 #13, W-C2 #17 | full; lite with larger cells | stills | 0.7 (E) |
| 3 | Halation (5) | hero (1); non-Standard looks (2, 3) | W-C2 #17 | baked; hero map | still | 0.6 (E) |
| 4 | Coated glass: loupe and lens eye (3) | loupe (3, proof sheet); lens glint (1) | W-C14 #19, W-C13 #16 | full: hover; lite: tap; focus: ring only | snaps; fixed | 1.5 (E) |
| 5 | Camera develop patch (D-024) | hero (1) | W-S1 #13, then W-C14 #19 and W-C2 #17 (section 5) | full: develop; lite: crossfade | end state | 0.4 (E) |

Static and no-WebGL: stills and posters. **Cut (D-023):** the enlarger light (research effect 5), a door effect.

**1. Roller tracks** (fx-glitch, re-scoped). While a print passes the rollers, the cyan veil carries per-column
density tracks. The same track(x), read from a per-print row baked at boot, offsets the develop threshold, so the
image surfaces in streaks that merge, strongest at the pod edge like the real defect
([vintagecamerahut](https://www.vintagecamerahut.com/blogs/vintage-camera-hut-blog/how-to-clean-rollers-and-avoid-polaroid-photo-defects),
V). The exit slot is the slit ([Levin](https://www.flong.com/archive/texts/lists/slit_scan/index.html), V). Veil
streaks end at eject end + 120 ms. The rate offset is 0 by d 0.6, and front(1) ≤ -(0.03 + width), so d = 1 equals
the still. A1 asks W-S1 for the hero's tracks if they fit the Effects budget; W-C2 finishes them on every eject.

**2. Calm negative grain over a light-first glow** (fx-halftone T1, reshaped by D-026). The print first glows as soft
light from its LQIP, which the manifest already holds (W-D026, V): no download, no mipmaps. Soft monotonic grain
clumps (two octaves, edge 0.15 to 0.2) then **form once** inside W-D016's B, G, R order and the eject-edge sweep.
Nothing re-seeds per frame: no boil at any rate. Noise is 0-byte ALU
([Jimenez](https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/), V); a blue-noise
PNG would cost about 4.1 kB gz (E) and is cut. Cell size belongs to the negative: constant per print, whole device
pixels, at least 1.25 px, fading to its mean under 1.5 px. Shadows: level = d·mix(0.8, 1.6, L), black at most 25%
veil at d 0.7. **Grain is exactly 0 at d = 1 on every print** (D-026). Copy says the veil clears, not that silver
precipitates.

**3. Halation**
([Halation Lab](https://xere.my/journal/halation-lab-how-i-created-an-experimental-tool-to-simulate-film-halation/),
D) belongs to the film look (D-006), not to instant prints. Standard 0 ("Standard is identity", W-C2), Vivid at most
0.12, Cyanotype 0, Mono at most 0.08 grey, Candle at most 0.35, the only look where it shows (E). W-C2's look bake
(`scripts/build/looks`) bakes it into every still in Halation Lab's order: band-pass threshold in display space,
blur, tint, screen, so flat white UI never bleeds (`halation: false` opts out). The develop reveals it. The live hero
(FILM_LIVE) reads a baked 64 to 128 px bright-pass map, one fetch, tinted per look. The research sketch blurred
before thresholding, so it glowed past edges: rebuild it. The 4 x vec4 film-look contract is full (`tokens.js`, V);
the halation term is added without breaking parity with the game's IonGrade (0 there until the game's crew adopts it).
Amber and warm white only (D-025).

**4. Coated glass.**
- **(a) Loupe** (fx-glass sketch `loupe-lens.js`): analytic refraction of the borrowed still in one fragment shader,
  with no render target
  ([Codrops square lens](https://tympanus.net/codrops/2026/08/25/building-a-mouse-following-square-lens-effect-with-three-js-and-glsl/),
  V), as a disc inside W-C13's modelled loupe, which owns the rim and the perspective.
  - It fits the image window (about 150 to 160 px at 1440, E). It magnifies a measured 1.6x (divide out the
    refraction term). There is no rim fringe unless an A/B earns 1 device px.
  - It needs a W-F accessor or cache for the still, ion-spring's lag spring, and take
    and give on hover.
  - A 512 px still at 1.6x only upsamples, so its one new detail is optional **loupe-only grain**: static,
    screen-frequency, allowed by D-026.
- **(b) Lens eye:** iridescence on the front element only (`cam_glass_front` on m2)
  ([three r186 iridescence chunk](https://unpkg.com/three@0.186.1/src/renderers/shaders/ShaderChunk/iridescence_fragment.glsl.js),
  V). It ships as KHR_materials_iridescence, written by a small W-C13 Node script on `@gltf-transform/extensions` (section 7),
  so the posters keep parity at 4/255 or less. It is
  tuned to a photograph of a lit XF lens; what it reflects is RoomEnvironment today (V). The game's FlatToon LOD has
  no glint.

**5. Camera develop patch** (D-024). A patch on every `cam_*` material (8 on m1; re-measure on m2) develops the camera from the drawing
(section 4). At d = 1 it is exact identity: saturate at uDev = 1, or delete `onBeforeCompile` and
`customProgramCacheKey` and set `needsUpdate`.

## 3. Moodboard ledger (accepted, D-025)

- **Tile 1, streaks:** roller tracks in each ejected print's first second. The energy goes into the shutter, flash
  and eject (W-D012).
- **Tile 2, dot flower:** negative grain, with its structure visible only under the loupe. No huge serif: fonts use
  96.8 of 100 kB and the display cut is opsz 72 (W-D008). Its tiny-words rhythm goes to W-S2 #14: rebate tokens, no
  leading zeros, ▶ beside A frames, no arrows. Frames keep W-D031's tilts (a tilted strip breaks W-D013).
- **Tile 3, oil slick:** a thin-film coating on the lens eye and the loupe.
- **Tile 4, crystal:** dropped, with its orbit rings (transmission measured over budget, V).
- **Tile 5, orbs:** halation in amber and warm white. Blue and pink are dropped.

## 4. The hero: the X-T5 drawing develops into the camera (D-024)

**Owner of record:** W-S1 #13 (Amendment A1) builds it on the m1 GLB. W-C14 #19 carries it onto the m2 GLB with the
lines and posters re-baked. W-C13 #16 supplies any build-time line asset on request. W-C2 #17 finalises the shader.
W-C3 #18 audits it. The A1 acceptance lines are the contract; this section is the design reference.

**Trigger** (W-D012, #13 A2). The head script sets `data-cam="drawing"` before first paint only with motion full,
tier full or lite, no `ion.hero` session flag, no hash and no Back; otherwise the finished camera paints first, with
no swap. The CTA and the strip stay live DOM throughout, and the W-D012 guards
(late GL, scroll, hidden tab, first input) jump to the end state.

| Phase | ms from T0 (E) | The visitor sees | How |
|---|---|---|---|
| First paint | before T0 | The X-T5 in its hero pose, in pale hairlines on an undeveloped teal-grey print ground, in the camera slot | An SVG or CSS poster with curated strokes in two weights and no hidden lines (A1) |
| Clay | 0 to 200 (`heroDrawingClay`) | The drawing gains a body: the untextured camera in the veil's tone fills the lines | The patched `cam_*` materials write depth; **FOV 28**, the hero pose (W-D013) |
| Develop | 200 to 1,200 (`heroDrawingDevelop`) | Light first: silver top plate and dials, then black metal and leatherette, the amber shutter last. The hairlines fade with the veil | W-D011 curve, W-D016 noise |
| W-D012 sequence | from about 1,200 | Brackets close, shutter, flash, eject with roller tracks; print 1 develops and is handed back | W-D012 unchanged, offset by the camera develop |

- **Totals:** print 1 is readable at about T0 + 3,004 ms, which is GL-ready + 3,204 ms. It is handed back by about
  T0 + 4,700 ms.
- **Budgets** (budgets.md, D-024): print 1 is readable within 3,300 ms of `stage:gl-ready` on this first visit,
  because the drawing holds the slot from FCP. All automatic motion stays under
  5,000 ms, with every phase in `__motionLog`. The split above is a reference: W-S1 may move time between the
  phases, but not past these two budgets.
- There is no lift shot: the drawing is already in the hero pose, so poster parity holds.

**Tiers** (A1):
- **Full, first visit:** the full sequence.
- **Lite:** a `heroDrawingFade` (400 ms) crossfade from the drawing to the finished camera. The finished-camera poster must not become the
  LCP element: the LCP stays the h1, or print 1's still on touch.
- **Static, no-WebGL, reduced motion and repeat arrivals:** the finished camera from first paint.

**Lines** (the W-D019 names are kept, so m2 swaps in unchanged):
- At runtime, three's core `EdgesGeometry` (about 30°) on LOD0 creases is acceptable (A1). It uses a node allowlist:
  silhouette, top plate, dials, lens rings, shutter.
- It drops the knurls, the leatherette and the `mark_fujifilm` and `mark_xt5` decals (rectangles), and chains at most
  about 120 strokes in two weights.
- Curved contours have no creases, so the body's tone carries them.
- Before curation the m1 model gives 5,127 segments, 25.9 kB gz (V, fx-sketch3d-critic `edges.mjs`).
- A build-time asset (`camera_xt_lines.bin`, `public/models/`) is W-C13's on request. The drawing poster is W-S1's,
  then W-C14's. Re-bake after m2.

**Hidden lines.** The undeveloped body writes depth (polygonOffset while lines show), so back lines hide without a
prepass; the SVG poster raycasts its strokes against LOD0 at build. Lines are core LineSegments hairlines; fat lines
(LineSegments2, 5.35 kB gz, V) return only if hairlines vanish at DPR 1. The veil mixes in after `colorspace_fragment`
(r186 tone-maps after `opaque_fragment`, V).

**Posters and text.**
- CSS picks the drawing or finished-camera poster (both in `public/posters/camera/`) from `data-cam`.
- Alt text comes from content (W-D005). No copy or alt text implies that the owner drew the drawing.

**Boot and draws.** The patch ships in the GL chunk (no scene chunk); the patched programs (re-measure on m2) compile in parallel with
no task over 50 ms (W-D034). The entity matches `slot.id`, never `data-gl-fixture`, and snaps to the end state on a
tier demotion. LOD0 had 20 primitives on m1 (V); ≤ 40 draws is an m1 figure: re-measure on m2 (#56's LOD0 has 95).

**Blender, later and GPU only (D-012):** Freestyle line references of LOD0 to check hidden lines, Cycles renders of
the coated lenses against a photograph, and an iridescence assert in `rig.test.mjs`.

## 5. Locked decisions this playbook changes (applied 2026-10-04)

| Decision | Change | Crews |
|---|---|---|
| W-D016 | Calm grain forms once, with no boil (D-026). Grain is 0 at d 1 on prints. Roller tracks on ejected prints. B, G, R develop lag with the image registered. Warp at most 1 CSS px along the exit axis. LQIP glow. Baked halation | W-S1 #13, W-C2 #17, W-C14 #19 |
| W-D033, W-D032 | Coating. Optional static loupe grain (D-026). 1.6x measured. The lens stays within the image window. The loupe follows hover (full) and taps (lite); keyboard focus shows W-D032's ring and never moves the loupe or borrows a print | W-C14 #19, W-C13 #16 |
| W-C2 scope and the film-look contract | Halation in the look bake plus a hero map; the contract gains a halation term | W-C2 #17 |
| W-D012, W-D011 | The drawing develops into the camera before the hero sequence (D-024). The door story is cut (D-023) | W-S1 #13, W-C14 #19, W-C3 #18 |
| W-D019 | Addendum: a lines asset on request; iridescence on the front element (`cam_glass_front` on m2) | W-C13 #16 |
| Ownership | Camera patch: GLSL chunk `src/gl/effects/develop/camera.ts` (W-S1, then W-C2's final); hook and timing `src/gl/camera/drawing.ts` (W-S1, then W-C14 on m2). W-S1 freezes the uniform names. The enlarger and safelight are cut with the door | as listed |
| Not changed | W-D013's FOV 28, W-D014, W-D002, W-D031. Issue #31 lands first | n/a |

## 6. Budget ledger

The Effects gate counts the chunks holding `src/gl/effects/**` (`.size-limit.cjs`, V); `src/gl/shaders/**` is booked
here too. New sizes stay E until measured minified (gzip -9).

| Item | Line | kB gz |
|---|---|---|
| Today 6.0 (V, budgets.md); Show the mesh 1.0 (D, W-D020) | Effects | 7.0 |
| Roller tracks 0.5, grain and glow 0.7, halation 0.6, camera patch 0.4 | Effects | 2.2 (E) |
| **Effects total** | **≤ 10** | **9.2 (E)** |
| Loupe lens and coating 1.5, core line build 0.6 | GL chunk | 2.1 (E) |
| **GL chunk** | **≤ 185** | **137.2 (V, gate 102c775) + 2.1** |
| `camera_xt_lines.bin` (only if built) | 3D per page ≤ 1.5 MB | ≤ 25.9 (V, before curation) |

Effects headroom is 0.8 kB (E): measure before W-S1's shader locks and cut in section 9's order if over. Sheet-8: +0.1 to 0.3 ms on an iGPU (E), gated as a reference-host median x30 ≤ 4 ms, then
`/bench/`. Loupe: +0.0024 to 0.0227 ms at DPR 1 on the RX 6700 XT (V, 10x spread), inside W-D033's 0.3 ms. Lens eye:
0.046 to 0.10 ms per 400 x 400 slot (V). Hero camera develop: unmeasured (E), held by W-S1's hero GPU line. No mipmaps.

## 7. Dependencies

None at runtime beyond three core and three/addons; the libraries rejected in research stay out. Build:
@gltf-transform/cli 4.5.1 and sharp, both in `deps.md`. The iridescence script imports `@gltf-transform/extensions`
(MIT, installed with the CLI), which needs its own `deps.md` row through a W-F request. Optional dev tools (vite-plugin-glsl 1.6.1, spectorjs 0.9.33) need a `deps.md`
entry first. CI compiles the patched programs in headless Chromium and asserts that every `replace()` matched.

## 8. Prototypes worth building next

1. **Develop v1.1** (W-S1 #13, then W-C2 #17). Accept: filmstrips (e 0.3 and 0.9; d 0.45 and 0.7; both schemes)
   show tracks on the veil; handback ≤ 2/255; at d 0.7 black ≤ 25% veil and tones 0.03, 0.10, 0.30 distinct; no
   crawl at DPR 1 to 2 tilted 1.5°; grain unchanged frame to frame once formed; flash and sheet-8 x30 pass; Effects
   ≤ 10 kB measured.
2. **Hero drawing-to-camera** (W-S1 #13, then W-C14 #19 on m2). Accept: every A1 and A2 line and section 4's
   budgets; FOV 28; no hidden line against Freestyle, no
   stipple; draws re-measured on m2; no task over 50 ms; stock camera at d 1; poster parity ≤ 4/255; all tiers in GES-1.
3. **Loupe and coated glass** (W-C14 #19, W-C13 #16). Accept: ≤ 0.3 ms moving at GES-1 D2 (real radius, 5
   interleaved loads); 0 draws at rest; 1.6 ± 0.05x; never over text; keyboard focus moves nothing; coating matches a
   photograph.
4. **Halation bake** (W-C2 #17). Accept: build vs GL ≤ 1/255 per look; Standard and Cyanotype identity; hero
   handback ≤ 2/255; small highlights glow past edges; no rim on white UI under Candle.

## 9. Cut list

**Cut now:**
- From the research: slit-scan image smear; dye-front RGB split; developer lump; scanner bar; scroll-velocity
  distortion; datamosh; pixel sorting; GlitchPass; UnrealBloomPass; AM halftone; point assembly; text-to-points, MSDF,
  troika; GPGPU; monogram dither; giant serif; strip tilts; screen-space grain; blue-noise PNG; transmission crystal,
  orbit rings, inner ghost caps; blue and pink orbs; Newton rings; light leak; dolly zoom; pen draw-on; a grey clay
  render on white; graphite on white; FUJIFILM last; dimension notes; runtime halation on sheet prints.
- **D-023:** the door sequence (lamp, lift and the Grand Gallery print), the enlarger light, the GL and DOM safelight,
  the door chunk and the ink drip.
- **D-026:** the 12 fps grain boil.
- **A1:** the drawing animation on lite (lite gets the crossfade).

**If budget or time bites, in this order:**
1. loupe grain;
2. roller tracks on shutter ejects;
3. halation on UI prints;
4. the full-tier camera develop falls back to A1's lite crossfade. This step needs the owner, because D-024 is theirs.

The hero's roller tracks and grain go last.

## 10. Owner questions from the research

Resolved by the owner on 2026-10-04: story order and the line drawing (D-024), loupe grain and the boil (D-026), the
moodboard (D-025). **Still open:** halation on UI
screenshots, band-pass or none? The default is band-pass in non-Standard looks, with `halation: false` per print.

## Changelog

- **Site revision 1** (2026-10-04): the header's decisions applied; the ledger re-summed. D-024, A1 and A2 override
  seven research critic findings. From `critique-taste`: fx-teardown cut[2] ("T1 in the hero"); fx-sketch3d keep[0]
  (the door, not the hero), cut[3] (the clay stage stays), cut[9] (lite, phones included, paints the drawing and
  crossfades) and keep[5] (reduced motion paints the finished camera). From fx-sketch3d `critique-verify`: keep[4]
  ("Placement out of the hero") and cut[4] (the phone variant of the drawing sequence: phones on lite crossfade).
- **Research revision 3:** see `portfolio-evidence/research-fx/PLAYBOOK.md`.
