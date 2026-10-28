# Concept: Refraction

Direction reset (#101, D-036, D-037). Concept prototype on `concept/refraction`, port 4411.

## Thesis
One material carries the whole site: **simulated liquid glass**. A lens of real refraction (not 2020 frosted blur)
is the protagonist. It bends what lies beneath it, splits light at its rim (dispersion), catches a specular highlight
that follows the hand, and casts a faint caustic. It behaves like a heavy liquid: when it moves, a trailing droplet
lags and necks off it; when it rests it pulls back into one body. Everything else on the page is matter for the glass
to bend: the name, big numerals, and generated "optical study" plates for the work.

One rule organises the forms: **glass is round, matter is square.** Only glass has radii; plates, rules and type sit
square under it.

## Flow (desktop; scroll units are viewport heights)
| Beat | What happens | Timing |
|---|---|---|
| Preloader | Black. Six droplets of glass refract the count. Real progress (fonts, the GSAP chunk, shader compile with a warm frame, window load) pulls them together; merges conserve area, so the lens grows as it forms and its refractive strength rises with the count. Never hangs: 7 s timeout. Skip with Enter or the button. | 1.6 s minimum, then real |
| Entry (the release) | At 100% the lens holds 250 ms (the breath), then surges and settles (no overshoot) while the count drops out and the name rises under it, char by char. The lens travels to its rest. | release 1.1 s |
| Intro | The name, huge and expanded, bent by the lens under the cursor (critically damped follow, 0.32 s; trailing droplet 0.6 s). "Personal portfolio" small. At rest the lens drifts on its own. | |
| Viewfinder | Pinned. The lens drifts to centre and grows into the whole frame; its rim becomes the eyepiece edge. An original EVF overlay etches on (stroke draw, scrambled readouts). The exposure scale walks to -3 as the frame falls to black; the AF frame hunts and locks; the first work exposes through it, highlights first. | 0 to 2.3 |
| Into the work | The frame shrinks onto the stage plate; the lens thins into a standing glass slab between plate and numeral. | 2.3 to 3.0 |
| Work (8) | Pinned chapters. Scroll pushes the slab across the plate; the next project is behind it (the seam is hidden in the glass). The numeral rolls and title lines swap at their own pace. Hover pulls a droplet out of the slab onto the cursor (a loupe). Click: the plate becomes the project page (GSAP Flip), detail rises after landing; Back is faster. | 0.8 per chapter |
| Honours | Two glass forms (a standing plaque, a disc) over the category words, refracting them. Light sweeps across them with scroll; the pointer tilts the light. Honest placeholders. | |
| Close | The GitHub link, huge, under a droplet that follows the cursor. Back to top. | |

## Tokens
- **Type:** one variable family, Mona Sans (OFL), where the width axis carries the role: expanded (125) for the name
  and numerals, normal (100) for UI and body, condensed (75) for EVF readouts and data. Weight contrast: heavy name,
  light numerals.
- **Colour:** bg `#0A0A0B`; ink `#ECEAE4`; ink-2 `#A9A7A1` (AA on bg); line `rgba(236,234,228,.14)`; one accent,
  **sodium `#FFB224`** (589 nm, the D line that defines a glass's refractive index): AF lock, the active chapter,
  focus rings. Dispersion supplies the only other colour. Plates use each project's `tint` from `projects.json`.
- **Durations:** 0.18 s (hover, feedback), 0.6 s (swaps, exits), 1.1 s (travel, reveals). Exits are faster than
  entries.
- **Eases:** `glass` = cubic-bezier(0.16, 1, 0.3, 1) (CustomEase) for travel and reveals; `power3.in` for exits;
  scrubbed segments use `power2.inOut`. No overshoot anywhere: the temperament is viscous and heavy. Lens physics are
  critically damped springs (smooth-time 0.32 s main, 0.6 s trail, 0.07 s loupe).

## Libraries
GSAP 3.15 (ScrollTrigger pin and scrub, SplitText masked reveals, Flip for the project open, ScrambleText readouts,
DrawSVG for the overlay etch, CustomEase), Lenis (smooth scroll on the GSAP ticker), OGL (WebGL2: one canvas, a
scene render target, the refraction pass), Mona Sans variable via @fontsource-variable.

**Glass pipeline:** the page's display type is mirrored from the DOM into a 2D canvas texture each frame (the DOM
text stays as the accessible, selectable layer, made transparent while GL runs). Plates are shader quads bound to DOM
rects. Both render into a scene target; a full-screen pass refracts it through a signed-distance lens built from up
to six smooth-unioned shapes (circle, slab, droplets): squircle bevel, rim pull, centre magnification, 6-tap spectral
dispersion, Fresnel, a dual rim highlight, specular from the pointer, shadow and caustic.

## Owner guidelines
- **Kept:** the proper preloader (it builds the lens), the name intro, the viewfinder, galleries, achievements, liquid
  glass (the core), animated text (SplitText, ScrambleText, a digit roll), the dark theme.
- **Reshaped:** "Fuji-like EVF" is an original EVF grammar with no logos, film-sim names or Fuji green, and every
  readout is functional (the exposure scale reads the fade to black, the frame counter counts the 8 projects, the
  level answers the pointer). "Trippy" becomes controlled optics: dispersion, caustics and refraction driven by
  motion, quiet at rest.
- **Dropped:** the X-T5 camera model (owner, 2026-10-28) and any darkroom or [project]ion material.

## Floors
Reduced motion: no Lenis, no pin, no lens physics; the theatre becomes a normal document flow with static glass and
crossfades. No WebGL: the DOM text shows, plates fall back to tinted CSS. Phone (390 x 844): the plate stacks over
the text, the slab narrows, the lens drifts on its own.
