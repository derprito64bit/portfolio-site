# Concept: Flux

Direction reset (#101, D-036, D-037), concept builder for Flux, 2026-10-28. Branch `concept/flux`.

## Thesis
The site is a **living surface of ink on dark water** that the visitor stirs. One real fluid simulation (stable fluids)
carries everything: the preloader is a single ink drop, the name is pulled out of the ink, the work is marbled sheets
lifted off the surface, and the honours are objects held in it (one glass that refracts the ink, one medal that
reflects it). The look comes from a physical rule rather than a mood board: **marbling**. Thin bands of ink with
iridescent oil-film edges (thin-film interference colour, not a gradient) on near-black. At rest it is graphite lines
drifting; stirred, the edges flare into film colour and then spring back. Trippy, but always one signal (the hand)
driving it, and always returning to calm.

## The flow, beat by beat (desktop, 1440 x 900)
| Beat | What happens | Timing |
|---|---|---|
| First paint | A 6 px bone dot at the centre (CSS), before any JS. | 0 ms |
| Preloader | The dot becomes an ink drop. Each real task that finishes (type face, shaders, 8 generated covers, first frame) adds a ring at the centre and pushes the older rings out: **suminagashi** as a progress bar. Task names resolve beside it. Progress is real and monotonic, lerped so it never jumps; 8 s timeout fallback. | about 0.9 to 1.6 s |
| The breath | All rings present, the drop holds still. | 280 ms |
| Release | The drop blooms: a radial burst in the fluid throws the rings to the screen edges and the full field takes over. | 1.1 s |
| Intro | The name rises out of the ink letter by letter, each letter growing from a hairline (width 25, weight 100) to its rest on a firm spring. Its width, weight and slant then answer the cursor (proximity and speed) and the field's slow wave. A line says it is a personal portfolio. Click the field to drop more ink. | letters land by +1.0 s |
| Focus pull | Scrolling on, the name pulls tall and thin and lets go; the field softens and four corner brackets close in from the screen edges onto one frame, where the ink stays sharp. That frame becomes the first project. (The EVF, reinterpreted: no camera, just focus.) | scroll-scrubbed |
| Work | An infinite zigzag canvas of marbled sheets. Scroll runs through all 8 in order; drag throws the canvas anywhere (it wraps forever) and it lands on the nearest sheet with one firm spring. The brackets hunt for the sheet nearest the focus point and lock onto it; the counter and title change with them. Speed bends the sheets, splits their colour and stirs the ink behind them. | lock spring about 0.5 s |
| Open | The locked sheet grows into the project page on a liquid wave from the click point while the ink is pushed aside; then the detail rises in, line by line. Close, Esc or Back sends it home faster. | lands 0.9 s; detail to 1.5 s; exit 0.6 s |
| Honours | A glass award that bends the ink behind it (true refraction with rim dispersion) and a medal on a thread that mirrors it. Both hang in the field, tilt to the cursor, swing or spin when pushed and settle on a firm spring. Click either to drop ink. | |
| Contact | One huge link that widens on hover; the ink calms and a last drop lands where you finish. | |

## Measured (production build, 1440 x 900, RX 6700 XT, 2026-10-28)
- Dot at first paint; rings grow 0.6 to 1.2 s with the real tasks (11: type, shaders, 8 covers, first frame); a 0.28 s
  breath; the bloom starts at 1.5 s; the name is settled about 2.6 s after load. 8 s timeout fallback.
- A throw lands on the nearest sheet in about 0.7 s; a project open lands in about 0.8 s, detail to about 1.6 s;
  close 0.6 s. Hover answers in the same frame (95% under 100 ms).
- 60 fps held (p95 16.8 ms) while stirring the intro and while scrolling the pinned work.

## Revision 1 (jury round, 2026-10-28): measured on the production build
- **Weak machines (fix 1).** The loader is HTML and inline CSS in a system face; the app loads after the first paint;
  only a tiny loader shader compiles up front and every other shader compiles and warms one step per frame; the covers
  render in strips; nothing reads layout per frame (letter positions are computed, section offsets cached, the pin is
  CSS sticky, so ScrollTrigger is gone); axis values are quantized and skipped while the pointer is still; a governor
  (p90 over 20 ms for 30 frames) halves the simulation, then its rate, then the resolution. Roboto Flex is subset to
  latin with wdth, wght and slnt: 99 kB (was 319). At 4x CPU: FCP 204 ms (120 ms unthrottled), 4 long tasks, the
  longest 123 ms (was one of 859), intro 60 fps idle and 59 fps while stirring, work 60 fps. At 10x the governor
  steps down and stirring still holds 18 fps with no frame over 133 ms.
- **One focal mass (fix 2).** One column runs through the projects, the neighbours sit either side, half a sheet down.
  The sheet in focus is 594 px tall at 1440 x 900; the others shrink to 82% and drop to about 40% brightness and 30%
  saturation until they come close. A throw lands the sheet on the focus point (x 864, the same as at scroll rest).
- **Travel (fix 3).** The counter is a digit roll clamped to 01 to 08; titles swap in a mask; the throw settles in
  457 ms on a firm spring.
- **Marbling (fix 4).** Fewer, wider bands that carry the image (film-tinted fills, a fine vein and a wet sheen at each
  edge), film colour at rest (vivid 0.3), and after the bloom the marbler combs the drop (a wavy stroke and fine
  teeth) while the surface drifts up and to the left. Lenses magnify and refract the ink with rim dispersion.
- **Phone and copy (fix 5).** On phones the header hides on the way down and returns on a solid band; reduced motion
  says the ink holds still; "A personal portfolio" has no full stop; focus rings are 2 px.

## Tokens
- **Colour:** `ink #030304` (ground), `bone #ECE8E1` (text, 17:1), `smoke #9C988F` (secondary, 7:1), `rule #2A2A2D`;
  the film spectrum (copper, magenta, peacock, brass) exists only inside the field and the covers, never as UI fill.
  There is no accent colour: state is shown by shape (brackets tighten), not by a highlight hue.
- **Type:** one family, **Roboto Flex** (OFL), every role set by its axes. The name: width 25 to 151, weight 100 to
  1000, slant 0 to -10, live. Labels: width 125, small, sentence case. Body: width 100, opsz on. Tabular figures for the
  counter. No mono, no all-caps eyebrows.
- **Motion:** three durations only: **0.25 s** (press, hover, label swap), **0.6 s** (exits, small travel), **1.1 s**
  (landings, reveals). Eases: `flux.out` = cubic-bezier(0.16, 1, 0.3, 1), `flux.inOut` = cubic-bezier(0.65, 0, 0.35,
  1). Physical motion is springs, "bouncy yet firm": **firm** k 260 c 22 (about 5% overshoot) for the brackets, letters
  and the canvas landing; **settle** k 120 c 20 (no visible overshoot) for travel. Hover answers inside one frame and is
  95% there in under 100 ms (k 900 c 50).

## Libraries
`ogl` 1.0.11 (all WebGL: fluid sim, field, covers, planes, glass), `gsap` 3.15.0 (SplitText, ScrambleText,
CustomEase), `lenis` 1.3.26 (smooth wheel, driven by the GSAP ticker), Roboto Flex subset from
`@fontsource-variable/roboto-flex` (latin, wdth, wght and slnt: 99 kB). The fluid solver follows the stable-fluids
method of PavelDoGreat's WebGL-Fluid-Simulation (MIT; notice kept in `src/concept/flux/gl/shaders.ts`).

## The owner's guidelines: kept, reshaped, dropped
- **Kept:** the loading page that truly loads first (fonts, shaders, generated covers and a first frame; the rings
  count them); the name plus "personal portfolio" intro; animated text (springing variable axes, split and scramble
  reveals); a dark theme; galleries then achievements as sections; trippy, warping effects (fluid, bend, colour split).
- **Reshaped:** *liquid glass* becomes real refraction of the ink, on the glass award and on three small UI lenses (nav,
  skip, close), not frosted cards. *The EVF* becomes a focus pull: corner brackets, a frame counter and a lock, no
  camera chrome, no trade dress; from black (the drop) the screen turns into the work, which is the owner's arc.
- **Dropped:** the X-T5 and any camera model (owner, 2026-10-28); anything from [project]ion.
- **Build note:** `astro.config.mjs` switches `cssCodeSplit` on, so the old Darkroom stylesheet no longer bleeds into
  this home page (it redefined `--ink` and `--rule`). Old routes are untouched.
- **View it:** `npm run build`, then `npx astro preview --port 4412 --host 127.0.0.1`; `#/work/project-03` deep-links
  straight into a project.
- **Reduced motion:** a still field (one frame, no simulation), no smoothing or pinning, the work as a plain grid of
  the generated covers, crossfades only. No WebGL: the same plain page.
