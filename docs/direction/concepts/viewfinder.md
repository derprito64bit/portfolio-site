# Concept: Viewfinder

Direction reset (#101, D-036, D-037). One of three competing concept prototypes; branch `concept/viewfinder`.

## Thesis
The camera, shown through its interface instead of as an object. A precise typographic page exposes itself while the
site loads; one gesture raises the camera to your eye, the page bends through the eyepiece glass and goes black, and an
original electronic viewfinder powers on. From then on the EVF *is* the site: frames are projects, playback is the
honours, the camera's owner-info menu is contact. Every readout is functional. The focus distance is where your
pointer is, the histogram is computed from the frame on screen, the meter reads the frame's real mean luminance, the
focal length is the zoom you are actually doing, the frame counter is the index.

## Flow, beat by beat (desktop timings)
1. **Preloader = underexposed intro (0 to at least 1.6 s).** The intro page is already composed but black on black.
   Real progress (fonts via `document.fonts.load`, the GL programs linked off the main thread with
   KHR_parallel_shader_compile, ten scenes generated, frame one drawn and metered) moves an exposure needle from -3 EV to 0, and each letter of the name exposes as the needle
   passes it: stroke weight 100 to 300 and luminance in one detent. A step label names what is loading. Timeout 6 s.
2. **Release (one beat, 0.6 s).** Needle lands on 0, the name over-exposes for 0.24 s (a moving highlight-alert
   stripe, the camera's own warning) and settles; metadata scrambles in. The loader's exposure scale *stays*: it is the
   meter the EVF uses later.
3. **Intro (rest).** Name huge, bottom-left, light expanded caps like lens-barrel engraving, fitted to the frame marks;
   `[PLACEHOLDER: real name]` beside "Personal portfolio" set as frame metadata. Corner frame marks, the handle, a live
   clock. The meter turns into a spot meter: the needle reads the page under the pointer.
4. **The raise (0.2 s lift, 0.6 s close, then 1.1 s power-on and exposure).** Scroll, swipe, click or Enter. The page
   is snapshotted to a texture and pulled into the eyepiece: magnifies, barrel-bends, gets a dispersive glass rim, the eyecup closes, black. The EVF
   panel lifts its black level, the HUD powers on piece by piece in 40 to 60 ms detents, the corner marks land on the
   frame, the meter flies into place. Frame one exposes from -6 EV with a focus rack from far to subject and a slight
   AF hunt, then the title arrives.
5. **Work (8 frames).** Wheel, swipe, drag, arrows, or the frame index. Each advance is a focus pull: defocus 0.24 s,
   hard cut under the blur (a detent), rack in 0.6 s with one small hunt overshoot; the meter swings to the new frame's
   measured EV; the counter rolls. Hover = touch-AF: the AF box snaps to a 15 x 9 grid, focus racks to the depth under
   it, peaking traces in-focus edges, the distance scale follows. Drag pans the layers with parallax and tilts the
   level. The film dial (Standard, Chrome, Mono, Soft, Bleach) regrades everything in 0.24 s.
6. **Open a project (1.1 s in, 0.6 s out).** The focal-length readout runs 23 to 56 mm in detents while the scene
   zooms until the object under the AF box (or the frame's subject) lands right of centre, in focus, with the depth of
   field shallower; the HUD retracts and the frame grows to full bleed: the frame becomes the page. After landing a graduated ND darkens the left and the details
   arrive 100 ms apart. Esc or "23 mm" returns.
7. **Honours = playback (2 frames).** Past frame 8 the display blanks and switches to the review screen: the frame
   slides left, an info column of placeholder metadata appears. Frames are generated renders of a glass award (a
   refracting, dispersive slab: the liquid glass, honestly motivated) and a medal of unknown, so neutral, metal,
   labelled as placeholder renders. The pointer turns the piece under the light.
8. **Contact = owner info.** The camera's author/copyright menu: author, handle, GitHub (TO CONFIRM), email
   placeholder, and "Lower camera" back to the intro.

## Tokens
- **Colour:** surround `#050505`, EVF panel `#0B0B0A`, ink `#ECE9E2`, ink-2 `#A29E95` (7.6:1), ink-3 `#817D76`
  (4.9:1, small labels), one phosphor accent `#FFB13B` (focus lock, peaking, active readouts, highlight alert). No
  gradients except the optical ones the shader makes.
- **Type:** Archivo Variable (OFL; widths 62 to 125, weights 100 to 900). Name at width 125 / weight 300, caps,
  like engraving on a lens barrel; readouts at width 75 / weight 500 with tabular figures, like the numerals of an
  EVF. Chivo Mono Variable (OFL, same foundry) for labels and metadata, 11 to 12 px caps, +0.08 em.
- **Durations (four only):** snap 0.12 s (readouts, HUD detents), step 0.24 s (defocus, regrade, exits), land 0.6 s
  (rack in, settle), travel 1.1 s (raise, zoom). Exits run at about 0.55 x.
- **Eases:** `vf.detent` (fast, 3% overshoot, hard stop), `vf.lens` (0.62,0 / 0.16,1 zoom ring), `vf.out`
  (0.16,1,0.3,1 landings), `vf.in` (0.5,0,0.9,0.4 departures), `vf.needle` (two damped swings).

## Libraries
GSAP 3.15 (core, Observer for wheel/touch intent, ScrambleText for readouts, CustomEase for detents, SplitText for
the name's letters). OGL 1.0.11 for the one canvas: a procedural scene pass with analytic depth of field (each layer's
edge softness is its circle of confusion, bokeh discs conserve energy), a composite pass (exposure, film grade, sensor
noise, peaking), an eyepiece pass, and a 64 x 40 readback for the histogram and meter. Fonts from @fontsource-variable.
No Lenis: nothing scrolls natively except the open project's text column.

## Owner guidelines: kept, reshaped, dropped
- **Kept:** a loader that truly loads before entering; the name and "personal portfolio" first; the transition into an
  electronic viewfinder that goes black and then turns into an image; galleries then achievements; dark theme; animated
  text; the libraries (#65).
- **Reshaped:** "liquid glass" is the eyepiece glass during the raise and the glass award itself, not floating UI
  panels. "Trippy" is optical: rack focus, bokeh blooming, dispersion and the dolly of a zoom, never noise for its own
  sake. "Fuji-like" is grammar only: own icons, generic simulation names, no logos, no green.
- **Dropped:** the X-T5 object (owner: removed for now), any 3D camera, any project.ion material.

## Calm path
`prefers-reduced-motion`: the same interface with no wheel paging, no focus racks, zoom or eyepiece warp; changes are
crossfades through the composite pass; the loader is a plain fade; the AF box does not chase the pointer. No WebGL:
CSS tint frames, same DOM.
