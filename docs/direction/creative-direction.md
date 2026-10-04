# Creative direction: Darkroom (locked, D-001)

> Picked by the owner on 2026-10-02 after the Wave 1a tournament (judges: Darkroom 7.85 / 8.20 / 7.75; 2 of 3
> first places; all three named its signature unprompted). This is the creative director's direction document,
> followed by the grafts and must-fix items the build has to honour. Reference mock: `darkroom/index.html` (open it
> in a browser); frames: `darkroom/frames/`. (D-023: the mock's highlighted "Enter the Manor" nav item and its
> `#manor` door section are retired; do not build from them.)
>
> **(D-023 to D-026, 2026-10-04.)** The site is a standalone portfolio of all the owner's work, and the game is one
> project in it. The handoff, the door section and the ink drip are cut. The site opens with the X-T5 drawing developing
> into the camera (D-024), and the effects follow `fx-playbook.md`. Changed parts are marked (D-023) to (D-026).

# Direction C: Darkroom (cd-c)

**North star v1.2 (D-023).** Placeholders marked. No AI images. Free tools only. Em-dash free.

## One idea
The page is a backlit **light table**. Every project is an **instant print** that **develops** when it reaches you. The owner's amber `[ ]` (D-002) around the name are the camera's **viewfinder**. (D-023) The game is one project here, not a room the site leads into. Camera is the hero object, not a gate: all content is plain DOM links under the GL layer.

## 3D signature (heavy, real three.js)
- **Camera:** X-T5 silhouette, silver top plate, EVF hump, knurled dials, lens with aperture and focus rings, amber shutter, an amber film-look dial on the front. Ejects a print from a top slot. Tilts to the pointer and scroll (springs). Mock is procedural; real site ships one Blender GLB (target 250 kB or less, meshopt). Own look names, no Fujifilm marks.
- **Print:** one card mesh, one shader. Undeveloped teal, then the image surfaces in blotches (light first), silver before dye, per-channel emulsion warp that decays, edge burn, calm grain that forms once and is gone at d = 1 (D-026). Four film looks graded in-shader per project: Classic, Vivid, Mono, Soft.
- **Opening (D-024; replaces the handoff, D-023):** at first paint the X-T5 is a line drawing on an undeveloped print. It develops into the real camera, which ejects print 1 (`fx-playbook.md` section 4).
- **Shared marks (D-023):** the site and the owner's game are the same maker's work, so they share the `[ ]`, the amber and the spring table. The game's Camera Room reuses the GLB, the develop shader (HLSL port) and the prints.

## 2D system and beats
1. **Identity (10 s):** name in brackets, one placeholder line, one CTA, the X-T5 drawing developing into the camera, which ejects print 1 (D-024). Hero text elements: 3.
2. **Best work (60 s):** three enlargements at different scales and tilts, captions beside, develop on scroll. No card row.
3. **Everything (3 min):** one proof sheet of all eight prints, amber grease-pencil boxes tie it to the enlargements. Awards go on a negative-sleeve strip (next wave), contact in the footer. The game is one print on the sheet, like every project, and the home page ends here (D-023).
4. **Depth (on demand, any device) (D-023):** on each project page: the lead exhibit, Show the mesh and the process media. The game's page adds Play on a desktop, with stills and video for phones. There is no door section and no theme change on the home page.

## Type, colour
- **Bricolage Grotesque** (OFL, variable) is the bridging face; **Geist Mono** (OFL) for frame numbers and placeholder captions only.
- Table #E3E6E6, lit centre #EEF0EF, ink #13171A, ink 2 #444D52, print paper #F6F5F1, proof #E7EAE9, darkroom #14100E.
- **Shared accent: safelight amber #E39B2B**, fill and stroke only, ink text on it. Dark scheme tokens defined.

## Motion (spring table, stiffness/damping)
snap 520/34, soft 170/15, settle 110/11. Shutter 130 ms, flash 380 ms flat, eject 1250 ms, hang 420 ms, landing about 900 ms (one overshoot), hero develop 6.2 s, sheet develop 3.2 s with 170 ms stagger. Native cursor stays; an amber AF frame snaps to the hovered print. (Superseded by the plan: W-D010 and W-D011 set the springs and durations, the AF frame is cut, and keyboard focus shows W-D032's ring.)

## Fallbacks (every effect has one)
| Effect | Fallback |
|---|---|
| Eject, flash, develop | still tier (reduced motion): finished prints, no flash |
| Pointer follow, AF frame | off on touch and reduced motion |
| Everything GL | static tier: baked camera poster plus CSS prints with per-look CSS filters |
Tiers: full, lite (phones, 4 cores or fewer, save-data: DPR 1.5, no MSAA), still, static. A frame-time probe steps down. Poster is also the pre-GL image, so no layout shift.

## Anti-slop answers
- Photography template? No: no full-bleed photos, no thin serif, no film-grain overlay. The grain lives inside the print window only.
- Gimmick? The camera is the hero and the delivery mechanism for work; links work without it.
- Retro-filter cliché? Looks are named and tied to projects, applied only inside print windows. Page chrome is clean.
- Recruiter in 60 s? Name, line, CTA in the first screen; best work by 1 scroll; contact in the footer.

## Delete before adding
First cut: AF cursor, then pointer and scroll turn, pencil boxes, film dial. (D-023: the door camera is gone.)

## Uncertainty
- Frame times and GLB weight are **not measured** (software GL only). The three tree-shake of 132 kB gz is measured in refs/tools.md.
- Contrast ratios are estimates by formula.
- Conflict flagged: design-taste bans custom cursors; resolved as a non-replacing AF overlay.
- Amber replaces the Manor's gold: owner to confirm.

## Evidence
Mock: `cd-c\index.html` (serve over http if your browser blocks file: modules). Params: `?hero=0..1`, `?eject=0..1`, `?dev=0..1`, `?door=0..1` (the retired door section, D-023), `?tier=full|lite|still|static`. Natural-run states measured: eject at 1.5 s, flight 2.5 s, landed 3.5 s (dev 0.17), 6 s dev 0.81, 11.5 s dev 1.0. No console errors or page errors. Phone width: no horizontal overflow (390 of 390).

## Grafts the owner accepted (D-001)

- From Workbench: press/spin/detent verbs on the camera (shutter press, lens ring with detents, mode dial); real 3D
  exhibit objects in the work section; the "Show the mesh" wireframe reveal with a measured triangle count.
- From Wet Proof: the typographic numbered index as the List view (also the phone and no-WebGL fallback). The
  ink-drip on the Manor handoff is cut (D-023).

### Every graft the judges proposed (for the specialists to weigh)

(D-023) The proposals below that are tied to the Manor door or the handoff (the ink drip, the arched door plate, the
press-through, models near the door, the camera as the Manor key) are retired.

- (Hostile critic) From Wet Proof: the giant fitted wordmark as the Darkroom name treatment, kept inside the amber brackets. Also the typographic eight-row index as the Bench/List 'List' view, built as a toggleable list in the Gil Huybrecht style.
- (Hostile critic) From Wet Proof: a single vermilion-style ink-drip moment, used once only (the Manor handoff transition), not as an always-on effect.
- (Hostile critic) From Workbench: pressable, springy 3D buttons and the lamp-lit affordance, applied to the Darkroom camera (shutter, dial) and to a few 3D exhibit objects keyed to project type (gear for CAD, cartridge for demos).
- (Hostile critic) From Workbench: the 'Show the mesh' wireframe reveal with a measured triangle count. It is honest craft and a beat 4 asset.
- (Hostile critic) From Workbench: the Bench/List toggle and the shared-element lift into a project dock for opening a project, replacing a plain page swap.
- (Hostile critic) From Workbench: the CSS-drawn grid fallback as a template for the static tier, so posters and layout stay identical when WebGL is off.
- (Visitor judge) From Workbench into Darkroom: the tactile verbs (press, spin with detents, tilt and toss, lift-and-dock) applied to the camera (shutter press, lens ring, mode dial), plus the Show the mesh measured-triangle toggle as a craft proof for beat 4.
- (Visitor judge) From Workbench: the Bench/List toggle on the work section as a guaranteed findability fallback, and the idea of a second and third modelled object near the Manor door (a lens or film cartridge) to answer 'heavy 3D'.
- (Visitor judge) From Wet Proof into Darkroom: the typographic numbered index of eight rows as the contact-sheet's accessible alternative on phones and tier 0, and the arched door plate plus press-through as the Manor handoff gesture instead of a plain button.
- (Visitor judge) From Wet Proof: weight-swell on index titles (wght 300 to 760 on hover) as a calm, cheap, tactile typography micro-interaction.
- (Visitor judge) From Workbench: cheap CSS-tilt and push fallbacks for hover and press on weak tiers so tier 1 still feels physical.
- (Feasibility judge) From Darkroom to Workbench: the Blender X-T5 camera as the Manor-key object (the Beat 4 Enter the Manor button on the bench), reusing one GLB and the develop shader across the Front Door and the Manor.
- (Feasibility judge) From Darkroom to Workbench: the develop-on-reveal shader on the project dock, so a project's image prints and develops when you open it. Bake it to a static texture once finished.
- (Feasibility judge) From Wet Proof to Workbench: the liquid-mask press-through, but only for the last step into the Manor (door hand-off) and not on every interaction. Keep the lift-and-dock transition for projects.
- (Feasibility judge) From Wet Proof to Workbench: the 12-column typographic index as the List toggle, instead of cards, and the arched door plate as the Manor entry.
- (Feasibility judge) From Wet Proof: its 45-frame governor that only steps down, and the idea of a tier 0 with designed posters. Apply to Workbench's mat shader (DPR cap on tier 2).
- (Feasibility judge) From Darkroom: HTML-text name with amber brackets as the always-visible LCP element. Use it for the Workbench wordmark so LCP never waits on GL.

## Must-fix items from the judges

- (Hostile critic) Make 3D heavier than one camera: let work prints or exhibits be real GLB objects with depth, so the page is not 'camera hero then flat polaroids'. Match portfolio-zxc's model-led feel.
- (Hostile critic) Model the camera properly in Blender to the X-T5 silhouette, with a believable mesh, instead of the procedural rangefinder toy.
- (Hostile critic) Cut the hero develop from about 6.2 s to roughly 2.5 to 3 s, or ensure copy and CTA never wait on it. Fix the clipped caption behind the print mid-eject.
- (Hostile critic) Give the camera a physical interaction in the hero: pressable shutter, turnable dial, a visible reason to touch it, since 'tactile' is a north-star word.
- (Hostile critic) Replace the stock-looking Bauhaus placeholder prints with clearly marked, plainer placeholders so they cannot ship as fake art.
- (Hostile critic) Design the dark door section properly. It is a black field with a camera clone, which is the weakest frame. (D-023: retired with the door.)
- (Hostile critic) Keep film grain and edge-burn within a fill-rate budget on tier 2 and prove it on weak hardware.
- (Visitor judge) State what the owner makes in the hero line so the camera is read as a metaphor, not a photography portfolio; keep the placeholder honest but make the slot prominent.
- (Visitor judge) Make prints carry the real work (screenshots, renders, 3D, builds) and differentiate exhibit types so the contact sheet is not eight similar posters; the poster art now reads as generic stand-ins.
- (Visitor judge) Add more touchable 3D, such as shutter press, lens ring, dial and tilt, to meet 'tactile' and the 'heavy 3D' clarification, or add a second modelled object, because one camera is the whole 3D story.
- (Visitor judge) Fix the 13 px horizontal overflow at 1280 (an IMG and DIV extend to 1293 px) and the cropped hero print on phones, where the print half hides behind the camera body.
- (Visitor judge) Cut the hero develop duration or show a readable first state so beat 1 never waits on a 6 s shader.
- (Visitor judge) Soften the contact-sheet card feel (vary scale and tilt) to stay clear of the 'no card grids' rule.
- (Feasibility judge) Add an idle sleep and stop rendering once all prints are developed. Bake finished prints to static textures and dispose the develop shader. This is the single biggest perf fix (206 ms idle in software GL).
- (Feasibility judge) Make the hero print readable by about 2 s (develop curve front-loaded) so beat 1 is never a dark empty card. (D-024: the drawing fills the camera slot from first paint; print 1 is readable within 3.3 s of GL-ready, budgets.md.) Keep the reduced-motion path that shows finished prints.
- (Feasibility judge) Cut the develop shader's cost: about 4-octave fbm called many times per fragment. Offer a lite shader (precomputed noise texture) for tier lite and phones.
- (Feasibility judge) Texture and canvas budget with real images: 13 plate canvases are placeholders. Specify KTX2, lazy load, and disposal for the 8 sheet prints, and one atlas option on phones.
- (Feasibility judge) Give the hero camera interaction (drag to turn, press the shutter) or add more models, otherwise 'heavy 3D' is not met. Ship the camera as a Draco/meshopt GLB, not RoundedBox primitives.
- (Feasibility judge) Drop the AF-bracket cursor and the pointer-follow as the first cuts (a11y and hover-only), as the direction's own cut list says.
