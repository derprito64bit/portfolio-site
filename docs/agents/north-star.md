# North Star v2: Viewfinder, with Flux's honours and prints

> v1.2 (Darkroom) is in git history, before the commit that landed PLAN v2 (D-038). This v2 replaces it.

Planner draft, 2026-10-29. It replaces v1.2's design (suspended by D-036 and D-037) once the orchestrator merges it. The owner may overturn any line. Where this page conflicts with `owner-voice.md`, the owner's words win.

The owner's pick (D-038), verbatim:

> "wow all of these are so good i don't know how to choose i love every single concept for some parts of how they display things, but i'd say ill go with the first option viewfinder combined with flux's unique way of displaying awards and medals for each project, along with fluxes film prints integrated into viewfinder's view project feature having different  sizes of film prints fordifferent images sizes respectively"

## Intent

derprito64bit's portfolio: **one person, one portfolio, many projects.** It is a standalone project (D-037). The game is one project in it, nothing more.

The site is a camera's interface, not a camera. You raise it to your eye and the work is what you see. Every readout reads something real. Each project opens into its own page, where its images lie as film prints, each print as big as its image deserves. Each award and medal hangs as a piece of glass or a medal on a thread, over the work it came from, and it moves when you push it.

Three words to check every decision against: **precise, optical, alive.**
- Precise: every number is a real value. Every mark has a job. Nothing is decoration.
- Optical: the effects are what light and lenses do: exposure, focus, depth of field, refraction, dispersion. Never noise for its own sake.
- Alive: it answers the hand at once, and at rest the work still breathes.

## Audience and beats (kept from v1)

Recruiters, mentors, teammates and competition judges. Most are not gamers. Most give it 3 to 10 minutes, often on a work laptop or a phone.

| Beat | Deadline | The visitor knows… |
|---|---|---|
| 1. Identity | 10 s | who the owner is, and that this is a personal portfolio |
| 2. Best work | 60 s | the strongest projects, shown big in the frame |
| 3. Everything | 3 min | every project, award and medal, and how to reach the owner |
| 4. Depth | on demand, any device | how a piece was made: its page, its prints, its honours |

## The experience, beat by beat (desktop timings)

1. **Preload, as an underexposed intro (at least 1.6 s; 6 s timeout).** The intro is already composed, black on black. Real tasks move an exposure needle from −3 EV to 0: fonts, the GL programs, the scenes, the first frame drawn and metered, and the first cover decoded. Each letter of the name exposes as the needle passes it. A step label names the task. Never a spinner, never a bare percentage.
2. **Release (one beat, 0.6 s).** The needle lands on 0. The name and the frame bloom to over-exposure with the highlight alert, then snap into focus. The meter stays: it is the meter the EVF uses later.
3. **Intro at rest.** The name, huge, in lens-barrel caps. "Personal portfolio". The handle and a live clock. Frame one waits behind the page, defocused at −3 EV. A spot-meter pool opens correct exposure under the hand. With no hand, the meter roams on its own and "Raise to eye" breathes after 4 s.
4. **The raise (about 1.9 s).** Scroll, swipe, click or Enter. The page bends through the eyepiece with a dispersive rim and goes black. The HUD powers on in 40 to 60 ms detents. Frame one exposes from −6 EV with a focus rack and one small AF hunt. The title arrives last.
5. **Work: one frame per project, in date order.** Wheel, swipe, drag, flick, arrows or the index. Each move is a focus pull: defocus, a cut under the blur, a rack in with one overshoot. The meter swings to the new frame's real EV. Hover is touch-AF: the AF box snaps, focus racks to the depth under it, and peaking traces the sharp edges. The film dial regrades everything. At rest the frame breathes. Placeholder projects show EVF test subjects. Real projects show their own cover in the frame.
6. **Open a project (1.1 s in, 0.6 s out).** The focal length runs 23 to 56 mm while the frame zooms until it becomes the page (`/work/<slug>/`). A graduated ND darkens the left, and the details arrive 100 ms apart. Scrolling on, the frame recedes to −4 EV and the **roll** begins: the project's film prints expose in order, each at its image's own aspect and a size that follows its pixels. Tall phone shots stand narrow, wide desktop shots run long, small images stay small. The AF brackets follow the print you are looking at, and the counter reads "03 / 12". Tap a print and it rises into playback. After the prints, the project's **honours** hang over its own frame: a glass award that bends the work behind it, and a medal on a thread that mirrors it. Push them and they swing, spin and settle. Then the next project.
7. **Honours = playback.** Past the last frame the display switches to review. Every award and medal gets a frame of its own, large, over the frame of the project it came from, with "From Project NN" to open that project.
8. **Contact = owner info.** The camera's owner-info menu: name, handle, links. "Lower camera" returns to the intro.

## Principles

**Motion.**
- Four durations only: snap 0.12 s (readouts, detents), step 0.24 s (defocus, regrade, bracket travel, exits), land 0.6 s (rack in, settle, prints exposing), travel 1.1 s (raise, zoom). Exits run at about 0.55 ×.
- Eases are named and few: `vf.detent`, `vf.lens`, `vf.out`, `vf.in`, `vf.needle`. Springs only for physical things: the honours (firm k260 c22, kick k160 c7, a real pendulum) and the AF brackets.
- Answer the hand in under 100 ms. Land a change in 0.65 to 1.4 s. The chosen thing becomes the destination. Detail arrives after the landing. Exits are faster.
- One focal mass per view: the frame, the focused print, or the honour.
- At rest the work supplies the life, within D-053's limits.
- The calm path is a designed version, not a broken one: crossfades, no zoom, no warp, no swing.

**Type.**
- Archivo Variable for the name (width 125, weight 300, caps) and the readouts (width 75, weight 500, tabular figures). Chivo Mono for labels and metadata.
- No third family, no italic file.
- 12 px floor for readouts. 13 px floor for anything a visitor reads. Body text 16 to 18 px, at most 62 characters a line.

**Colour.**
- Surround `#050505`, EVF panel `#0B0B0A`, ink `#ECE9E2`, ink-2 `#A29E95`, ink-3 `#817D76`.
- One phosphor, `#FFB13B`, for state only: focus lock, peaking, the AF brackets, alerts. Never a brand fill.
- Project tints live only inside frames and prints.
- No gradients except the optical ones the shader makes.

**Glass.** Only where optics explain it: the eyepiece during the raise, the thin dispersive rim on the frame corners, and the honours glass. Never frosted UI panels.

**Copy.** First person, plain, specific. UI copy only until the content step. Placeholders stay visible and typed.

## What it must never become

**The AI-generic tells:**
- a hero with three cards; uniform card grids, bento grids or masonry templates for the prints;
- frosted glassmorphism panels, gradient blobs, purple-to-blue washes, glow for its own sake;
- fade-up-on-scroll applied to everything; decorative parallax; a cursor blob that follows the mouse;
- a spinner or bare percentage loader;
- scrambled text that shows impossible values (every readout rolls through real values);
- stock 3D primitives (spheres, capsules) as placeholder art;
- Inter or Space Grotesk; emoji in UI;
- filler copy ("crafting digital experiences") or the banned words: seamless, elevate, immersive journey, unleash, cutting-edge, revolutionize, next-level, world-class.

**[project]ion residue (D-037 standalone):**
- no darkroom, light table, instant prints, "develop" language or instant-film borders;
- no X-T5 or any camera body or model, for now (owner, #101);
- no Manor, candles, royal rooms, red carpet or brass;
- no `[ ]` monogram shared with the game; no shared accent, typeface or spring table with the game.

**Trade dress (D-052):** no Fujifilm (or any maker's) logos, names, icons, dial layouts, fonts, signature green or film-simulation names.

**Flux leftovers:** no fluid simulation, marbling, ink drops or Roboto Flex. Flux gives only the honours and the prints (D-039).

## Floors

- **WCAG 2.2 AA.** Full keyboard paths for every action. A 2 px focus ring at 3:1 or better. Targets at least 44 px. Reflow at 320 px, 200% zoom and text spacing without clipping. Forced colours and `prefers-contrast` respected. Dialog semantics for the open project and playback, with `inert` behind them. The canvas is `aria-hidden`, and its meaning is in the DOM (the frame's caption, the honour's details). No flashing above WCAG 2.3.1.
- **Reduced motion.** The same site, calm: crossfades, no wheel paging, no zoom, warp, rack or blur, no swing (a static tilt), no inline video play, and no life-at-rest loop.
- **No WebGL.** Complete and designed: frames are CSS covers (the cover image, or the tint), prints and playback work, and the honours are CSS silhouettes with the same details. A lost context shows the fallback at once and restores to a visible frame, never black.
- **No JS.** Every page is complete, readable HTML: the intro, the project list, every project page with its prints, the honours and contact.
- **Phone.** The whole site at 390 × 844 and at 320 px wide. Every gesture has a button. Back always closes on the first tap.
- **Weak hardware.** A governor lowers quality before frames drop. The budgets in budgets-v2 hold at 4x CPU.
- **Honesty.** `content/owner-facts.md` is the only source of owner facts; everything else is a visible typed placeholder. No AI-generated images. Free tools only, with no visible third-party branding.

## When things conflict (kept from v1)

1. owner-voice;
2. the floors above;
3. locked decisions (`decisions.md`);
4. the crew that owns the topic;
5. whichever option serves a beat more directly;
6. fewer dependencies, less code, less motion;
7. the orchestrator decides and logs the decision.
