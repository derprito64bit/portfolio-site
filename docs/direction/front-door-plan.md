# Website plan (locked)

> Wave 1b W-Manager final (13 specialists, 4 red-team seats), locked by the orchestrator in Wave 2. Owner decisions in `docs/agents/decisions.md` take precedence.
>
> **D-023 to D-026 (owner, 2026-10-04).** The site is a standalone portfolio of all the owner's work, and the game
> (the Manor at `/manor/`) is one project in it, with its own project page and a "Play" link. The beat-4 door, the
> handoff and the ink drip are cut; beat 4 is depth on the project pages; the home page ends on beat 3. The site opens
> with the X-T5 drawing developing into the camera (D-024). Effects follow `docs/direction/fx-playbook.md` (D-025,
> D-026). Changed sections, rows and briefs are marked (D-023) to (D-026). "Front Door" (and this file's name) is
> the track's historical name and means the site itself; in history lines, "both doors" means the site and the game.
> `front-door-plan.json` is the Wave 1b record and is not amended: this file wins.

# Website plan (W-Manager, final, Wave 1b; amended by D-023 to D-026)

North star v1.2 (D-023; v1.1 at Wave 1b). Built on D-001, D-002, D-003, D-010, D-011 and D-012 (locked) and D-005 and D-006 (proposed).

This pass resolves every blocker and major from the responsive, accessibility and verification seats. It also resolves what the hostile seat measured. Its written findings were cut off in the relay (see crossTrack).

**Model policy (W-D001).** Every crew, gate and review agent runs on Opus 5.5 at effort xhigh, at the owner's request in this run.

## The build in one paragraph
- **Pages:** a static Astro site where every word, link and print is DOM.
- **Layers:** three layers share the root stacking context: grounds, one canvas that rides the page, then content. The canvas sits under the content, so every focus ring and control paints above GL.
- **GL at rest:** GL borrows a print only while it develops, lifts, flies or sits under the loupe. Then it hands back to the identical baked still and sleeps.
- **Camera:** the Blender X-T5 keeps its real FUJIFILM and X-T5 lettering (D-011). It renders in its own fitted viewport, so its pose never changes with viewport size or scroll.
- **Camera controls:** a visible top-plate strip (Shutter, Lens, Look) is the camera's keyboard, screen-reader and touch control.
- **Motion:** four springs, shared with the Manor.
- **Phones:** the same story. Print 1 is already developed at first paint, and the shutter invites the touch.

## What this pass changed
| Finding | Fix |
|---|---|
| Camera plan contradicted locked D-011 | Lettering as named decal nodes on every LOD; `[d64]` on the strap tag, `[ ]` on the print border |
| Focus rings painted under the canvas | Layers: ground 0, canvas 1, content 2. The canvas never rises above the content (D-023 cut the drip) |
| No phone hero | Stage = min(content width, 100svh minus the text stack); print 1 at least 50% of content width; no-fly rects over the copy |
| Five rules decided who could reach the game | One `canEnterManor` predicate with no width term, shared with the publish guard; three honest Play states on the game's page (D-023) |
| Camera pose changed with viewport and scroll | Stage-local camera at FOV 28 with one pose per band; posters from our own renderer; LOD by projected width |
| Hero readable at GL-ready + 2.56 s against a 2.3 s budget | Develop starts mid-eject: readable at + 2.0 s, budget 2.1 s. (D-024: now + 3.2 s against 3.3 s, with the drawing develop first; W-D011) |
| Evidence could not see most failures | GES-1, one standard for W and M |
| Reduced motion fixed at boot | A live motion axis; render tiers full, lite, static |

## Locks (W-D002 to W-D034)
- **Stack:**
  - Astro 7.3.5; swup 4.10.0 plus its a11y plugin.
  - three 0.186.1 loads after first paint on full, and on intent on lite.
  - anime.js 4.5.0 ships inside the GL chunk.
  - Lenis runs on the full tier only.
  - One own ticker is the only rAF caller.
- **Routes:** `/`, `/work/<slug>/`, `/404.html`, `/work/` (redirects to `/#sheet`) and `/bench/` (noindex, unlinked).
- **Home (D-023):** hero, Selected work, Proof sheet (Sheet/List), Awards and medals, footer contact. The home page
  ends on beat 3.
  - Nav: Work, Contact. The game is a project: its print and its page carry it.
  - Skip link: "Skip to content".
- **Hero:**
  - `[derprito64bit]` is fitted to the full width at every width: `max(3rem, min(100cqi / 6.14, 24svh))`. It may wrap.
  - Below it, copy (5/12) and the camera stage (7/12) sit side by side at 64rem and wider, and on landscape phones. Elsewhere they stack.
- **Tiers:**
  - full: a fine pointer, hover, WebGL2, no Save-Data and a passing 30-frame probe.
  - lite: any other WebGL2.
  - static: no WebGL2.
  - Reduced motion is a separate axis, read live. Thread and touch-point counts are never used.
- **Layout bands:** five bands fix enlargement widths, caption position, sheet columns (2, 3, 4) and a 140 px minimum print width (columns are maxima: W-D031 as amended 2026-10-05).
- **Accessibility:**
  - a two-tone focus ring chosen by surface;
  - the camera strip;
  - tap and keyboard equivalents for every drag;
  - one polite status region;
  - a pause button on autoplaying video;
  - a Motion switch the Manor also reads.
- **Content v2:** adds alt, captions, audio and decorative fields. Placeholder titles carry their frame code.
- **The loupe:** a real 3D glass loupe on the proof sheet. The page has more than one model while every project is a placeholder, and the loupe implies no project fact.

## Hero timeline (full tier)
T0 = GL-ready + 200 ms (the poster fades out over the canvas). (D-024) On the drawing path T0 is the later of
GL-ready + 200 ms and the moment the camera's LOD0 is decoded and its patched programs are compiled (8 on m1; one
per `cam_*` material on m2, re-measured by W-C14) (W-D012 holds this definition; `budgets.md` uses it). The rows
below count from the eject sequence's start, which is T0 + 1,200 ms on the drawing path and T0 otherwise;
`heroTimelineMs` in the tokens says the same.

**(D-024) First paint and the camera develop** (#13, Amendments A1 and A2; W-D012). Before first paint the head
script picks the camera poster:
- **The drawing** (`html[data-cam="drawing"]`): motion full, tier full or lite, no `ion.hero` session flag, no URL
  hash, and not a Back or Forward arrival. On full, at T0 the drawing develops into the camera (clay
  `heroDrawingClay` 200 ms, then `heroDrawingDevelop` 1,000 ms: silver top plate, black metal and leatherette, the
  amber shutter last; `fx-playbook.md` section 4), and every row below shifts by 1,200 ms. On lite it crossfades to
  the finished camera over `heroDrawingFade` (400 ms), and print 1 is a developed still.
- **The finished camera** (`data-cam="camera"`): reduced motion, the static tier, a repeat arrival in the session, a
  hash arrival or Back. There is no drawing and no swap.

Print 1 is readable at GL-ready + 3,204 ms on the first full-tier visit (budget 3,300 ms), and the whole sequence
stays under 5 s.

| ms after the eject sequence's start (D-024) | Event |
|---|---|
| 0 | brackets close (detent) |
| 120 | shutter (press) |
| 250 | flash from the lens, 350 ms |
| 380 | eject, 800 ms, clipped at the exit slot |
| 780 | develop starts, 2.6 s |
| 1180 | flight to the landing slot (settle) |
| about 1620 | landing dip (detent) |
| 1804 | readable (d at least 0.7) = GL-ready + 3.2 s on load, after the 1,200 ms drawing develop (D-024) |
| 3380 | developed and handed back; the loop sleeps 1 s later |

**Guards.** Any of these jumps to the end state:
- GL ready later than FCP + 2.5 s;
- 25% of the hero scrolled away;
- a hidden tab;
- Back;
- the first key, focus or pointer input.

(D-024) A guard that fires during the drawing crossfades it to the finished camera over `heroDrawingFade`, and print
1's developed still appears when the guard fires, not at the end of the crossfade.

**Other tiers.** On lite, static and reduced motion, print 1 is a developed still at first paint. On every tier, the shutter prints the next project. (D-024) Lite crossfades the drawing to the finished camera; static, no-WebGL, reduced motion and repeat arrivals paint the finished camera from the start (W-D012).

## Conflicts resolved (33; full list in `conflicts`)
- **Springs:** the motion owner's table.
- **Canvas:** rides the page, under the content.
- **Camera:** D-011's lettering wins over the direction doc's "no Fujifilm marks" and over the draft's inlay.
- **Masthead:** w-type's full-width fit, capped at 24svh with a 3rem floor. The camera sits beside the copy below it.
- **Play guard (D-023):** one predicate, used by the game's Play action and the compose guard. The nav has no game
  item.
- **Hero print on phones:** a still at first paint. The eject belongs to the full tier.
- **axe:** the floor shared by the site and the game is serious or critical. W gates on 0 violations of any impact.
- **View toggle:** a radio group.
- **Keyboard focus:** never lifts a print.

## Budgets (limits)
- **Lighthouse 13.5.0** (median of 5 runs, auto tier, real renderer): performance at least 90 mobile and 95 desktop; accessibility 100.
- **Core Web Vitals:** LCP at most 2.5 s mobile and 2.0 s desktop; CLS at most 0.02; TBT at most 150 ms.
- **JS:** pre-GL at most 35 kB gz, from the network log; GL chunk at most 185 kB gz; effects at most 10 kB.
- **Fonts:** at most 100 kB.
- **3D:** camera LOD0 at most 30k tris and 250 kB gz.
- **Canvas:** at most 4.5 Mpx on full and 1.5 Mpx on lite.
- **GPU:** the worst moment is at most 4 ms on the reference iGPU at its natural tier.
  - An estimate passes at RX x 30.
  - If it passes only at x 10, it is "at risk" and goes to the owner.
- **Idle:** 0 rAF callbacks and 0 draws from 1 to 4 s after input.
- **Layout:**
  - overflow 0;
  - no clipped text under text spacing, at 200% zoom or at 320 px;
  - contact within 5.0 screens on a phone.

## Crews and order
**Wave 3a**
- W-F and W-C13 start together. W-C13's first milestone lands today's GLBs, pivot-safe, plus the poster script.
- Then, in parallel:
  - Release (W-R), which may build against a fixture dist but lands after the content step (D-023: its guard target
    is the game's entry);
  - the hero slice (W-S1), which also waits for that milestone;
  - the work slice (W-S2).
- The project slice (W-S3) follows W-S2.
- **W-F's door removal (D-023; a W-F follow-up PR on `crew/w-f-m2`, in parallel with the slices).** W-F owns the page
  mounts, the layout and the harness, so it takes the door off `/` before the content step and G3a: the `<Door />`
  mount and import (`src/pages/index.astro`), the nav's 'The Manor' item (`src/layouts/Base.astro`), the #door scroll
  stop (`scripts/crew.mjs`) and marker (`tests/w-f/fonts.mjs`), the keyboard harness's hash and anchor checks
  (retargeted to /#contact), the door and handoff stubs (`src/sections/door/**`, `src/lib/handoff/**`, deleted), and
  the door framing in `package.json`'s description, `astro.config.mjs`'s header comment and `src/stage/router.ts`'s
  reserved-path comment. Acceptance: `npm run check` and the keyboard harness pass; a grep of `src/`, `scripts/` and
  `tests/` finds no `<Door`, `sections/door`, `lib/handoff`, `#door`, '>The Manor<' or 'holds the same work'; at D2
  and P2 the home page ends on the honours stub and the footer.
- **Content step (D-023; the orchestrator).** After W-S3's validator changes merge and before W-R lands and G3a, the
  orchestrator adds the game's entry to `content/projects.json`.
  - **Place:** it replaces the last placeholder, project-08, so the sheet keeps 8 frames. Frame 8 is a default, not
    the owner's ranking (sheet order is an owner question at G3a).
  - **Fields:** slug `game`, `placeholder: true`, every display field a token (title, role, year, blurb, body, alt
    and caption text). Each non-token value has its own `content/owner-facts.md` line, which the orchestrator adds,
    and the entry's `source` names those lines (W-D005):
    - kind `game`: the owner's 2026-10-04 words ("showcase all projects including the game");
    - demo `/manor/`: the Manor repo (derprito64bit/derprito64bit.github.io), which serves the game there;
    - `cover` and `media`: captures of the game's own build at a recorded Manor-repo SHA, the source naming the SHA
      and the capture manifest. Never AI images or mock-ups.
  - **Shot list** (TourShots, or a Playwright capture and recording over `/manor/` at D1): first the photo-projection
    play (a photo taken, then placed back into the world); then the rooms; then a Painting World once one is live. No shot
    has the site's placeholder prints as its subject. The cover is the first shot.
  - **Also:** `teaser` is removed from `content/worlds.json` (W-S3 retires the field; the worlds show as text on the
    game's page, W-D021). `content/README.md` is rewritten: "what both doors show" becomes what the site and the game
    show, and `featured: true` picks the home page's enlargements and print 1 (W-D005) as well as the Manor's frames.
  - **The game itself:** nobody runs sync-content with this entry until the Manor repo's M-C2 change
    (`Assets/Portfolio/Runtime/Rooms/Gallery/**`) has merged: the Grand Gallery skips the entry whose demo is
    `/manor/`, so its arcade cabinet keeps `DefaultDemo` instead of loading the game inside itself
    (`GrandGallery.cs:88-97`), and the game does not hang in its own gallery (default; an owner question).
  - W-R's guard target, the game's print and W-C5's Play read this entry.
- **G3a:** the owner approves the slices. The first publish ships here (D-013) with W-R's guard and without the door
  (W-F's door removal; W-R's compose check fails the publish if any of it is back). Until W-C5 lands in 3b,
  `/work/game/?from=manor` shows the dock (the cover, the h1 and W-S3's empty Play mount), and W-S3's page focuses
  `main h1` on that arrival (W-D021). Owner questions at G3a, each shown in GES-1 shots at D2 and P2 (default in
  brackets):
  - sheet order (the game at frame 8);
  - the game's captured cover is the only photograph on the home page until other projects have covers: keep it,
    hold it until a second project has a cover, or give the game a different frame (keep it);
  - the game's page has no "who can play it" line until W-C5's Play block lands: ship G3a without it, or have W-S3
    show W-D021's requirement sentence in the dock as static text until then (ship without it).

**Wave 3b**
| Crew | Follows |
|---|---|
| Effects (W-C2) | W-S1, W-S2, W-F's door removal (D-023: the door tokens go after the door) |
| Motion (W-C3) | W-S1, W-S3 |
| Scenes (W-C14) | W-S1, the X-T5 rebuild |
| Work index (W-C4) | W-S2 |
| Awards and footer (W-C6) | W-S2 |
| Static and 404 (W-C8) | W-S2 |
| Project pages and the game's Play (W-C5; absorbs W-C7, D-023) | W-S3, the content step |
| Interaction polish (W-C9) | W-C3, W-C4, W-C14 |
| Fix-up pass (W-C10) | all of the above |

**Ownership**
- Globs never overlap between crews that are active at the same time.
- A slice's globs pass to its 3b heir at merge.
- W-F keeps the stage, the layout, the harness and the page mounts.

## Evidence standard GES-1 (W and M)
- **Manifest** per crew and SHA: host, renderer, display Hz, tool versions, agent model and effort, and every item with its hash.
- **Device profiles, not window sizes:**
  - three mouse desktops, two touch tablets, two touch phones at DPR 3;
  - WebKit at phone and tablet;
  - two short screens;
  - 320 px reflow and 200% zoom.
- **Modes:**
  - auto (it asserts the expected tier), static and reduced, on every profile;
  - accessibility runs: keyboard walk with ring coverage, text spacing, forced colours, dark.
- **Capture:** viewport shots at named scroll stops after `__stage.settled`. The gate's re-shoot must match within 1/255.
- **Console gate:** every console level, pageerror, failed request and unexpected status of 400 or more, plus an error regex and a dated warning allowlist.
- **Lighthouse:** built dist served with gzip, 5 runs, valid only on a real renderer.
- **Motion:** spring unit test, seeked filmstrips, the `__motionLog` schema and WCAG 2.3.1 flash analysis.
- **GPU:** one committed bench measuring ms per frame at real size, plus `/bench/` for one real low-end number.
- **Where it runs:** CI runs only GPU-free checks. GL and performance evidence comes from the reference host.

## Seams to the Manor
- identity.json.
- manor-overlay.css and the shared fonts.
- The UIUtil font seam.
- Spring.Exact and spring-conformance.json.
- The film-look contract.
- PrintDevelop 2.4 s.
- One camera GLB family with lettering nodes.
- The `canEnterManor` guard.
- Content v2 with alt fields.
- manorMB.
- The shared Motion switch key.
- The Manor accessibility contract.
- GES-1.

## Escalations
- Look names (4 or 5).
- The Manor UI accent.
- Spring.cs.
- The D-005 re-lock.
- The rules.web prototype exception.
- The awards README rule.
- The Manor audio diet.
- budgets.md wording: "headed" becomes a renderer gate.
- M-C1's "no brand text" against D-011.
- The guard change for touch-only iPads.
- The lost rt-hostile text.

## Cut order
1. Sound
2. Lenis
3. The loupe
4. Gear exhibit
5. Tilt
6. Pencil draw-on
7. Mesh sweep
8. Geist Mono
9. Live re-grade
10. Bracket close on load
11. Page flight
12. Sheet pairs

(D-023 removed the GL drip and the door lean-in from this order.)

If the iGPU check stays "at risk", sheet pairs moves to first. The develop is cut last.

## Decisions (locked)

| ID | Topic | Decision | Deciding role | Serves | Budget impact |
|---|---|---|---|---|---|
| W-D001 | Agent model policy for every crew, gate and review in this plan | All W crews, gate agents and manager reviews in Waves 3a to 6 run on Opus 5.5 at effort xhigh (omit model, set effort:'xhigh'). This replaces the plan's Sonnet line for specialists, critics and gates and its Opus-high line for crews. | owner (relayed request), applied by W-Manager | 1, 2, 3, 4 | No page-budget impact. GES-1 manifests record agent {model, effort}. |
| W-D002 | Runtime stack and the single loop | Astro 7.3.5 static output. Plain swup 4.10.0 plus @swup/a11y-plugin only. three 0.186.1 loads after first paint on the full tier and on intent on lite (W-D034). anime.js 4.5.0 sits inside the GL chunk and runs every timeline and stagger. ion-spring (our own exact closed-form step) runs every GL value. CSS linear() springs run DOM state. Lenis 1.3.26 runs on the full tier only. Not used: GSAP, ScrollTrigger, SplitText, Paper Shaders, troika, pmndrs postprocessing, detect-gpu, OGL. ONE own ticker (about 1 kB) is the only requestAnimationFrame call site in src/. Its order: lenis.raf, anime engine.update() (useDefaultMainLoop=false), read scrollY once, re-measure if dirty, step springs, return if idle, else place and render. It detaches after 1 s idle. | w-motion (libraries) and w-scroll (ticker), rule 6 fewer deps | 1, 4 | Pre-GL JS about 25 kB gz (estimate). GL chunk at most 185 kB gz including anime's 16.8 kB. |
| W-D003 | Routes | Five routes: '/', '/work/<slug>/' (every project; noindex while it holds a placeholder), '/404.html', '/work/' as a redirect page to '/#sheet', and '/bench/'. '/bench/' is noindex, unlinked and kept out of the sitemap; it runs the committed GPU bench scenarios with readPixels fences and prints copyable JSON. '/manor/', '/play/' and '/arcade/' belong to the fork compose. Cut: '/about/' (returns only with a confirmed bio of about 120 words), '/honours/', '/contact/', '/credits/'. | w-ia (pages), rt-verify (bench) | 1, 2, 3 | The bench page loads only when visited. |
| W-D004 | Home order, nav, headings, header and skip link | (D-023) Home order: hero; Selected work (3 enlargements, visually hidden h2 'Work'); 'Proof sheet' (Sheet/List); 'Awards and medals' (negative sleeve); footer contact. The home page ends on the footer. Nav at every width: Work, Contact. The header sits at the top and scrolls away at every band. On project pages the [derprito64bit] mark returns. Skip link: 'Skip to content', pointing at main on every page. 'All projects' is deleted. | w-ia (structure, nav), w-voice (heading text), rt-a11y and rt-responsive (fixes) | 1, 2, 3, 4 | None. |
| W-D005 | Content schema v2, text alternatives and placeholder typing | Files: content/{projects,honours,worlds,profile}.json, each {"schema":2,...}. They are JsonUtility-safe: object root, declared classes, no null, no dictionaries, no nested arrays, string kinds, and file order is the only order. honours.json {awards[],medals[]} replaces awards.json. tint replaces accent. kind is one of software, game, 3d-art or robotics-cad. The exhibit object is derived from media and demo, never authored. New text-alternative fields: coverAlt, photoAlt (honours), stillAlt (worlds), media[].captions (VTT path), media[].audio (bool), media[].decorative (bool). Loader and ph-gate rules: any non-empty src needs a non-empty alt (a token is allowed while the entry is a placeholder) or decorative:true; a video with audio:true needs captions; the build fails otherwise. Placeholder rules: display text is the token [PLACEHOLDER: what is missing]; asset, enum and link fields use ""; a placeholder:true entry holds only tokens in its string fields; a placeholder:false entry needs a source and no token. featured: at most 8; the first 3 are the enlargements and the first is the hero print. One hero project (print 1 on the site; the Workshop statue in the game) and one hero award (first on the sleeve; the Hall apse in the game). (D-023) Sourced fields: a placeholder:true entry may hold a value in an enum, link or asset field only when its source names, for that value, the content/owner-facts.md line that states it; its display text stays tokens. The first such entry is the game's (the content step), one line per value: kind 'game' from the owner's 2026-10-04 words; demo '/manor/' from the Manor repo, which serves the game there; cover and media from captures of the game's build at a recorded Manor-repo SHA. One print rule for every entry: a print shows its cover when the cover is set (confirmed, or sourced as above), otherwise its test strip (W-D022). Exhibits still come only from confirmed entries (W-D020). | w-ia (schema), w-voice (placeholder rules), rt-a11y (alt fields), non-negotiables 1 and 4 | 2, 3 | None. Image sizes, AVIF/WebP, triangle counts and OG prints are build output. |
| W-D006 | Monogram, camera lettering and identity assets | The [ ] is typeset from Bricolage Grotesque's own bracket glyphs (stem 0.179 H, arm 0.148 H, reach 0.289 H; the window is 46:62, the print's picture window). Colour grammar: amber brackets mean identity, focus or destination; ink-2 brackets mean placeholders and key caps. The camera follows locked D-011: the real FUJIFILM and X-T5 lettering stays on every LOD. The monogram appears only on the strap tag (in the [d64] form D-011 names) and as the [ ] mark on the print border, never on the camera body. Favicon: an amber tile with ink brackets (svg 294 B, ico 479 B, apple-touch 674 B). OG 1200x630: the table, the wordmark, the placeholder line and one print. (D-023) The home OG's print is print 1, the first featured entry, under W-D022's one print rule: its cover when set, else its test strip. It never takes the first entry that happens to have a cover. | owner (D-011), w-identity (mark construction) | 1, 4 | Favicons under 1.5 kB in total. |
| W-D007 | Accent | Amber #E39B2B is for fills and strokes, with ink #13171A on it (7.72:1). On light grounds the text-safe variant is amber-deep #875802 (4.88:1 on the table, the lowest case). On dark grounds amber itself is text-safe (8.10:1 on darkroom). Amber is never text on light (1.86:1). Brass #C59A45 stays the Manor's material albedo. The wordmark brackets are a logotype (aria-hidden). | w-identity under D-002 | 1 | None. |
| W-D008 | Typography | Bricolage Grotesque (OFL-1.1, no RFN) for everything a person reads; Geist Mono 500 (OFL-1.1) for edge print only. Four self-hosted woff2 files with pinned axes: mark 6.7 kB, display (opsz 72, wdth 90) 41.0 kB, text (opsz 16) 39.2 kB, mono 9.9 kB, total 96.8 kB. Only mark and text are preloaded (45.9 kB). font-display swap with metric-matched Arial/Consolas fallbacks; measured section shift on swap is 2 px or less. Eight roles, fluid from 390 to 1920. Nothing under 12 px. Body measure 62ch, lede 34ch. | w-type | 1, 3 | Fonts use 96.8 kB of the 100 kB budget. Geist Mono is the first font cut. |
| W-D009 | Wordmark and hero layout across bands | [derprito64bit] is fitted to the full content width at every width: font-size max(3rem, min(calc(100cqi / 6.14), 24svh)). The name is wght 540, wdth 100; the brackets are wght 800 amber. white-space normal and overflow-wrap anywhere: the fit gives one line at default spacing, and the name wraps instead of clipping under user text spacing or zoom. Below the wordmark sits the hero row. It splits at (min-width: 64rem) and also on landscape phones (orientation: landscape and max-height: 500px): copy (lede and CTA) in 5/12, camera stage in 7/12. Otherwise it stacks: lede, CTA, then the camera stage. The stage height is min(content width, 100svh minus the measured text stack). Print 1 lands inside the stage. Below 64rem it is at least 50% of content width (at least 179 px at 390), and it overlaps the grip side by design; the lens is never covered. At 64rem and wider its image window is at least 220 px wide, and (amended 2026-10-04, orchestrator ruling on PR #53) it may land in the copy column under the CTA instead of inside the stage, clear of the copy and in view on the first screen. On landscape phones (width > height and height <= 500 CSS px, at any width, including viewports >= 64rem that are that short; ruling 2026-10-04; N6: PR #64) the 50%-of-content-width rule and the 220 px window floor are replaced by a height rule: print 1's laid-out height is at least 50% of the small viewport height (svh), with no window floor; it stays in view, with no text over GL and 0 no-fly crossings. The h1, lede and CTA rects are no-fly rects for every GL flight. On the home page the header shows nav only. The brackets rest 0.07em outside the name and close on it (detent) at T0 and on each shutter press, never under reduced motion. | w-type (fit technique) with rule 5 (camera and print 1 in the first screen) and non-negotiable 4 (wrap, floor) | 1, 2 | 0 JS; CLS 0. Estimated sizes: 58.2 px at 390, 114.6 at 768, 191 at 1280, 214.8 at 1440x900, 259 at 1920x1080. |
| W-D010 | One spring table, shared with the Manor | Four springs, canonical as (Hz, zeta) at mass 1. press 4.0/0.70 (k 631.7, c 35.19, 4.6% overshoot; Feel.ButtonRelease). detent 3.2/0.60 (k 404.3, c 24.13, 9.5%; the lens-mount click). settle 2.6/0.82 (k 266.9, c 26.79, 1.1%; Feel.Raise). lag 1.8/0.75 (k 127.9, c 16.96, 2.8%; Feel.Sway). Only detent may visibly bounce, and only on contact moments. The tokens build emits anime spring({mass:1,stiffness,damping}), CSS linear() strings and Feel-compatible (Hz, zeta). GL uses ion-spring's exact step. Timelines chain on our settle-to-2% times. | w-motion | 1, 4 | ion-spring 1.1 kB gz. |
| W-D011 | Durations and develop curve | Develop curve: d = 1-(1-t)^2.4. A print is readable at d >= 0.7, which is 39.4% of its duration. Durations: hero 2600 ms (it starts 400 ms into the eject, while the print passes the rollers); enlargements 2400 ms (equal to the Manor's PrintDevelop); sheet 1600 ms with a 60 ms stagger in reading order; film-dial re-grade 1200 ms from d 0.55. Shutter 130; flash 350 (radial from the lens, peak 0.62 at +120 ms, one global limiter, at least 1000 ms apart); eject 800 (InOutCubic); hang 240. Panels: in 220, out 160, rise 8 px, ease-out cubic-bezier(0.23,1,0.32,1). Reduced-motion fade 200 ms. Each print develops once per session, and never on an anchor, List or Back arrival. (D-024) The hero drawing: heroDrawingClay 200 and heroDrawingDevelop 1000 (on the curve above), and heroDrawingFade 400 for the lite and guard crossfade. They are estimates that W-S1 may rebalance inside the hero budgets, read from tokens like every duration. | w-motion (timing), w-effects (readability), D-002 (shared constants) | 1, 2, 3 | (D-024) Hero readable at GL-ready + 3,204 ms on the first full-tier visit (200 + 1,200 + 1,804, arithmetic; budget 3,300 ms); the drawing holds the slot from FCP. Sheet fully developed 2.02 s after its trigger. |
| W-D012 | Hero choreography per tier | (D-024; first paint settled by #13 A2) An inline head script (no fetch, under 0.8 kB with data-cam) sets two attributes before first paint. data-cam='drawing' when html[data-motion] is full (it already reads the Motion switch), html[data-tier] is full or lite, sessionStorage 'ion.hero' is unset (a storage error counts as unset), the URL has no hash and the navigation type is not back_forward; otherwise data-cam='camera'. CSS shows the line-drawing poster or the finished-camera poster from data-cam (both in public/posters/camera/); no other script picks it. data-hero='eject' is set only when data-cam is 'drawing', (pointer: fine) and (hover: hover) match, WebGL2RenderingContext exists, reduced motion is off and Save-Data is off. Full tier with the drawing: at T0 it develops into the camera (heroDrawingClay + heroDrawingDevelop, 1,200 ms, W-D011, fx-playbook.md section 4) before the sequence below, which shifts by 1,200 ms (hero readable at GL-ready + 3,204 ms, budget 3,300 ms, budgets.md). Lite with the drawing, including a full visit demoted by the boot probe: a heroDrawingFade crossfade to the finished camera once its poster has decoded; GL never waits for it. data-cam='camera' (reduced motion, static, a repeat arrival in the session, a hash arrival, Back) shows the finished camera from first paint with no swap; with no data-cam (JS off) CSS shows the finished camera too. A guard that fires during the drawing runs the crossfade (instant under reduced motion) to the end state; print 1's developed still appears when the guard fires, not at the end of the crossfade. The hero writes 'ion.hero' when the develop or the crossfade starts. FCP paints the name, line, CTA, camera strip and baked camera poster as static DOM. Print 1's still is always in the DOM in its landing slot. Under data-hero='eject' it waits at opacity 0; otherwise it is visible and developed from FCP, preloaded with media='(pointer: coarse), (prefers-reduced-motion: reduce)'. Full-tier sequence: T0 is the later of stage:gl-ready + 200 ms (the poster fades out over the canvas) and the moment the camera's LOD0 is decoded and its patched programs are compiled (8 on m1; one per cam_* material on m2, re-measured by W-C14) (this row defines T0; budgets.md uses it). The drawing develops from T0 to T0 + 1,200 ms; the eject sequence starts there, and its times (heroTimelineMs, counted from the eject sequence's start) are: 0 brackets close (detent); 120 shutter (press); 250 flash; 380 eject (clipped at the projected exit slot); 780 develop starts (2600 ms); 1180 flight on settle, avoiding the no-fly rects; about 1620 landing dip (detent); 1804 readable (GL-ready + 3,204 ms at the earliest: 200 + 1,200 + 1,804); 3380 developed, handback 120 ms, loop sleeps 1 s later. On load the sequence always follows the drawing, since data-hero='eject' needs data-cam='drawing'. Guards jump to the developed end state on any of: GL ready later than FCP + 2500 ms, 25% of the hero scrolled away, a hidden tab, Back, the first keydown, focusin or pointerdown, or reduced motion switched on mid-run. On every tier, a shutter press ejects and develops the next featured project into the landing slot (a stack of at most 3); presses during an eject are ignored. Nothing waits on the sequence, and input is never blocked. | w-motion (timing) with rule 5 and non-negotiable 3 (weak-hardware floor) | 1, 2 | 0 ms input blocking. One extra preload on touch (512 px AVIF, estimate 25 to 40 kB). |
| W-D013 | DOM-GL sync, layering and the stage-local projection | Layering: three layers share the root stacking context. Grounds (z 0): the body's table colour and each section's ground as a ::before. #rail (z 1): the one riding canvas, absolute, inset 0, overflow clip, outside #swup. Content (z 2): transparent wherever GL draws. At rest no ancestor of a [data-gl] slot creates a stacking context, so every focus ring and DOM control paints above GL. (D-023) The canvas is never raised above the content: the drip is cut. Prints use the page camera: 1 GL unit = 1 CSS px, setViewOffset, translated to scrollY each render with 0.25 viewport overscan toward the scroll direction. The camera and real 3D exhibits use a stage-local projection: a scissored viewport over their slot with their own PerspectiveCamera (vertical FOV 28 degrees and one pose per band, from tokens.stage), so their pose never depends on viewport size or scroll. LOD is chosen by projected device-pixel width: LOD0 at 600 device px and wider. Slots are [data-gl=print\|object][data-gl-id]. Rects are cached in document space and re-measured on ResizeObserver, fonts.ready, content:replace, width change or DPR change, never per frame. GL borrows a print only while it develops, lifts, flies or sits under the loupe. .is-gl sets opacity 0 on the poster img only. Toolbar rules: no dvh in any layout holding GL slots; svh for minimum heights; canvas height 100lvh x 1.25. On a coarse pointer, the buffer is reallocated and slots re-measured only on width or DPR change, never on a height-only change. Canvas width comes from documentElement.clientWidth. | w-scroll (sync) with non-negotiable 4 (focus visible) and rt-responsive (projection) | 1, 2, 3 | Overscan costs 1.25x fill only while rendering. The stage pass adds 1 scissored render while the camera moves. |
| W-D014 | Lenis | Lenis is a removable feel layer, active only on the full render tier with motion full. Settings: {autoRaf:false, lerp:0.15, smoothWheel:true, syncTouch:false, anchors:false, stopInertiaOnNavigate:true}. Anchors go through the one anchor scroller (W-D015). Lenis is destroyed on a governor step-down or when reduced motion turns on. Scroll velocity drives no visual effect. | w-scroll | 1 | 5.4 kB gz, full tier only. It is the first runtime cut. |
| W-D015 | Page transitions, lift-and-dock and focus | One module boots once. Pages declare slots, never scripts. GL entities persist across swaps, keyed by data-gl-id. Open: the clicked print lifts (settle) and Swup fades the [data-swup-fade] children (never #swup itself) out over 160 ms. After content:replace the print flies to the slot with the same id (settle, landing within 0.5 px), and the content enters over 220 ms with an 8 px rise. Hooks: visit:start runs lenis.stop(); before content:replace, unbind the slots; after it, scan, lenis.resize(), then restore scroll; visit:end runs lenis.start(). Focus rules: on a hash visit, visit.a11y.focus is the hash target. On popstate it is the [data-gl-id] link that started the forward visit (kept in history.state), else main h1. The project page's close link focuses the originating print. One anchor scroller: Swup's scroll:anchor is replaced by lenis.scrollTo when Lenis is on, else native, and the plugin's focus call is kept. Back and Forward are instant, with scroll restored per entry. Reduced motion: opacity only. | w-scroll and w-motion, rt-a11y (focus rules) | 2, 3 | Swup 8.2 kB gz plus the a11y plugin (estimate 2 to 4 kB, measured at landing). |
| W-D016 | Develop shader and looks | Principle: the baked still is the truth, and the shader animates the way to it. One ShaderMaterial per print, WebGL2 only, toneMapped false, display-space maths matching the Manor's IonGrade. A 256x256 noise texture baked at boot replaces fbm. Reveal order: light first from the eject edge, silver before dye, dye B then G then R, the cyan veil clears last. Warp is at most 1 CSS px along the exit axis (D-025) and gone by d 0.85. (D-026) Grain is calm and forms once (no boil) and reaches exactly 0 at d 1 on prints; only the loupe may add static grain. The develop must pass the WCAG 2.3.1 flash analyser at enlargement size in both schemes. (D-025) Roller tracks on ejected prints and halation in the look bake: fx-playbook.md section 2. Five looks compile to the Manor's 4 x vec4 contract. Every print is baked at build except the hero (FILM_LIVE). No page-level grain. | w-effects, rt-a11y (flash gate) | 1, 2, 3 | Effects JS 6.0 kB gz (measured before D-025); (D-025) 9.2 kB booked with the accepted effects (estimate, fx-playbook.md section 6). |
| W-D017 | Render tiers, live motion axis, governor and pixel caps | Two independent axes. Render tier, one of: full = WebGL2 and matchMedia('(pointer: fine) and (hover: hover)') and no Save-Data and a boot probe passing (30 warm-up frames of 3 wet hero-size prints at the target DPR, timed with readPixels fences, median 8 ms or less); DPR up to 2, canvas at most 4.5 Mpx (effective DPR lowered to fit), MSAA. lite = any other WebGL2 (touch-primary, Save-Data, or a failed probe); DPR up to 1.5, canvas at most 1.5 Mpx, no MSAA, LITE shader, GL boot deferred (W-D034). static = no WebGL2, a context lost twice in 60 s, or a second governor step. Motion = full or reduced. It is read live from matchMedia change events and the site's Motion switch: running timelines jump to their end, springs snap, Lenis is destroyed. The camera strip keeps working with instant detents. Governor: 45 busy frames averaging over 22 ms step down one render tier, never up. Tier code never reads navigator.hardwareConcurrency or maxTouchPoints. Stated outcomes: a 1366x768 UHD 620 laptop gets full only if its probe passes, else lite, and the GPU budget is measured at whichever tier it gets; an iPad Pro gets lite; a Windows touch laptop with a trackpad gets full. ?tier=full\|lite\|static overrides for tests. 'still' is retired as a tier name; it now names the reduced-motion presentation. | w-effects and w-scroll under D-001, rt-responsive, rt-verify, rt-a11y | 1, 2, 3 | Probe at most 500 ms inside GL boot. Saves detect-gpu. |
| W-D018 | Film-look names (provisional) | Five looks with D-006 names: Standard, Candle, Vivid, Mono, Cyanotype. Content stores ids; copy reads the list from content; the camera's Look control has five detents with word-free geometry. Escalated to the orchestrator and owner. | w-effects, escalated (rule 7) | 2, 4 | None. |
| W-D019 | Camera GLB | Milestone m1 (W-C13's first PR): the evidence GLBs (LOD0 9,574 tris, 62.1 kB gz; LOD1 3,648; Manor LOD 1,142), re-optimized with gltf-transform meshopt and the pivot-safe flags (--simplify/--palette/--flatten/--join/--prune false). They keep the rig API: pivots dial_shutter, dial_ev, dial_look (5 detents), shutter_button (1.2 mm travel), lens, lens_aperture_ring, lens_focus_ring; markers print_exit, lens_mount, strap_left, strap_right; materials cam_silver, cam_black_metal, cam_leather, cam_rubber, cam_amber, cam_glass, cam_paint, cam_lettering. Milestone m2: the body rebuilt 1:1 from gathered X-T5 references per D-011. The lettering is a set of named decal nodes, mark_fujifilm (hump front) and mark_xt5, using an alpha-tested lettering atlas (WebP albedo and normal) on LOD0, LOD1 and the Manor LOD (FlatToon slot mat_lettering). A strap carries strap_tag with the [d64] monogram. Fidelity gates: the bounding box without the lens matches 129.5 x 91.0 x 63.8 mm within 1%; front, top and side orthographic silhouettes reach IoU >= 0.95 against committed reference masks. Budgets: LOD0 at most 30k tris and 250 kB gz; LOD1 at most 5k and 60 kB; Manor LOD at most 1.5k. Blender renders on the GPU only (D-012). Colourway: silver and black, pending the owner. (D-024, D-025) Addendum: the hero's line data (runtime EdgesGeometry on LOD0 is acceptable; a build-time lines asset in public/models/ comes from W-C13 on request; the drawing poster lives with the camera posters in public/posters/camera/, owned by W-S1 and then W-C14) and KHR_materials_iridescence on the lens's front element (cam_glass_front on m2), written by a small W-C13 Node script on @gltf-transform/extensions (the 4.5.1 CLI has no iridescence command; the direct import needs a deps.md row through a W-F request), with poster parity kept. | owner (D-011), w-3d-art, rt-verify (checks) | 1, 4 | Camera LOD0 at most 250 kB gz, loaded after LCP. Lettering decals add about 8 tris and a 64 kB atlas or less (estimate). |
| W-D020 | Exhibit objects, Show the mesh and their non-drag paths | Exhibits come only from confirmed content. An owner GLB (work_<slug>, at most 50k tris and 1 MB) loads when its section is within 1 viewport. exhibit_cartridge (498 tris) appears for projects with a demo; its action is a real link 'Play {title}'. (D-023) For the game (demo /manor/), that link shows only when canEnterManor passes; otherwise the print opens the game's project page. Everything else is the print card. Placeholders get no exhibit. exhibit_gear waits for a confirmed robotics project. Every real 3D exhibit has a focusable proxy (role=group, named from media alt) with 'Turn left', 'Turn right' and 'Reset view' buttons of 44 px or more. Arrows turn it 15 degrees and Home resets it. Dragging is a bonus. Show the mesh: an aria-pressed toggle, a 700 ms scan (500 ms on lite, instant under reduced motion), and the triangle count read from the geometry at build and printed at once in the status region. The static tier swaps to a pre-rendered wireframe poster. | w-3d-art, w-voice, w-effects, rt-a11y | 2, 4 | Mesh reveal 1.0 kB gz. Proxy DOM is negligible. |
| W-D021 | Who can play the game (rewritten by D-023; the door and the handoff are superseded) | One predicate, emitted by the tokens build and used by the game's Play action and publish.ps1's guard: canEnterManor = WebGL2 and matchMedia('(any-pointer: fine) and (any-hover: hover)') and not Save-Data. It has no width term. The Play action sits on the game's project page (and as the cartridge link, W-D020) in three states. (1) Can play: 'Play' to /manor/, with one line tied to it by aria-describedby that states requirements only: 'For a desktop browser with mouse and keyboard. {manorMB} MB. Screen readers can't use it; the projects in its gallery are all on this site.' In every state the block ends with an 'All work' link to /#sheet, so every project is one step from Play. What the game is comes from its content entry on the same page. (2) No fine pointer (phones, tablets): no Play link; the page's stills and video carry the game, with one sentence with the size, and Share (navigator.share, falling back to Copy the link). (3) A computer without WebGL2: 'The game needs WebGL 2, which this browser has turned off.' plus Copy the link. Prefetch on intent: the /manor/ HTML, Web.loader.js and Web.framework.js only. Play is a plain link: no press delay, no drip, no flash, no zoom; modifier clicks behave natively. publish.ps1 sends visitors who fail the guard to the game's project page (/work/<slug>/ of the entry whose demo is /manor/) with ?from=manor, which focuses the Play block (until W-C5's block lands, W-S3's page focuses main h1 on that arrival: the guard ships with the first publish at G3a, before W-C5); if no built page has that demo, publish fails rather than ship a guard with no target. The page exists from the plan's content step on (a placeholder entry with a sourced kind, demo, cover and media, W-D005), so the guard and Play work before the owner confirms the title. The game's own 'Read everything as a page' link (M-D018) goes to this page too. Live worlds from worlds.json render on the game's page as text (title, artist, year, museum). Cut by D-023: the door section and its phone layout, the 720 ms handoff and its cancel, the ink drip, 'Straight to the Grand Gallery' and the nav item. | owner (D-023), W-Manager re-plan; rt-responsive (predicate), rt-a11y (AT line), w-voice (copy) | 3, 4 | Predicate snippet 400 B or less. The GL drip's 1.2 kB gz is saved. |
| W-D022 | Placeholder system, names and art | Token: [PLACEHOLDER: what is missing], matched by one regex, \[PLACEHOLDER: [^\[\]\r\n]{1,80}\], in copy, attributes, JSON and Markdown. Rendered as a slot in Geist Mono 500, max(12px, 0.8em) up to 20 px, ink-2 text, 1 px dashed ink-2 rule, 2 px radius, never amber. The slot wraps inside itself. Every rendered placeholder title carries its frame code: link name '1A, [PLACEHOLDER: project title]'; the h1 has the code; document title '1A [PLACEHOLDER: project title] · derprito64bit'. Link policy for prints: the name is '{frame}, {title}'; an img inside a named link gets alt=''; an inline SVG strip gets aria-hidden=true. Placeholder prints are seeded darkroom test strips (FNV-1a + fmix32 + mulberry32 by slug), with one spec and two renderers (build-time SVG, Canvas2D). (D-023) The rule is per field, not per entry: a print, its enlargement, its dock and its OG image show the cover whenever cover is set (a confirmed entry, or a placeholder entry's sourced cover, W-D005), and the test strip only when cover is ''. Its title stays a token either way. A real image that fails to load stays an undeveloped print captioned 'Image didn't load.' (amended 2026-10-05, orchestrator ruling on #14, W-S2 day one) In a List row the print is decorative and too small for a caption, so a failed image there is the undeveloped print at the same size with no caption, and the row gains no text. Sheet prints and enlargements keep the caption. ph-gate fails malformed tokens, unmarked values, tokens in confirmed entries, banned phrases, em or en dashes, any page holding a token without noindex, duplicate document titles across routes, and identical link names pointing to different URLs on one page. | w-voice, w-identity, rt-a11y | 2, 3 | Test strip SVG about 1 kB per print. |
| W-D023 | Voice and microcopy | First person to one visitor. Chrome describes the page; owner facts come only from content. Headings at most 6 words, CTAs 3, sentences 16. Periods, no exclamation marks, no em or en dashes (ranges read '2024 to 2026'). Numbers are injected at build or dropped. Wit only answers an action. No loader screen: an undeveloped print is the loading state. The footer proof line shows only while tokens exist. | w-voice | 1, 3, 4 | None. |
| W-D024 | Phones, the List view and the view toggle | The default view is computed per band at load: List below 48rem, on the static tier and with Save-Data; Sheet otherwise. ?view= is written only when the visitor toggles, and localStorage remembers that choice. The toggle is a two-option radio group, 'View: Sheet / List'; focus stays on it; a 160 ms crossfade, instant under reduced motion. List rows per band. Below 64rem: a mono meta line (code, kind, year) sits above the title; the title takes the full width and may wrap to 2 lines (balance), with a 2-line minimum height reserving the swell; the placeholder token wraps inside its slot. At 64rem and wider: four columns (code, title, kind, year), and the title may wrap. (amended 2026-10-05, orchestrator ruling on #14, W-S2 day one; #14's amendment of 2026-10-04 and its A1 line) Every row leads with its one print: the cover when set, else the seeded strip. At 64rem and wider it is a leading column before code, title, kind and year. Below 64rem it is a leading column beside the title's first line, with the meta line above the title, starting at the title's edge, and the title takes the full width less the print and its gap. The print is one line box of the title tall (1lh of the index role), at the print's 54:86 aspect, with a --space-* gap. Every row's content stays inside the content box: a title word wider than its column breaks inside the word, which at 200% zoom is accepted reflow. It is the DOM print (alt='', no GL slot). It adds no link, tab stop or accessible name, and it is exempt from W-D031's 140 px floor. The title cell reserves the height of the title's widest state at every width, in CSS and out of the accessibility tree: at least 2 lines below 64rem, and never less than its wrap at the swell. So W-D025's 0 px row change at default spacing holds at every width, and titles wrap as far as they need at 320 px and at 200% zoom. No per-row card chrome: the List stays the typographic numbered index (D-001). (D-023) The phone door is cut. Contact stays within 5.0 screens at 390x844, achieved by tightening enlargement spacing. | w-ia (structure), w-motion (toggle motion), rt-responsive, rt-a11y | 3, 4 | None. |
| W-D025 | Text motion and the index swell | No text animates in. DOM type motion is limited to the bracket close and the List weight swell: wght 320 to 700 on hover or focus-visible, 180 ms ease-out, constant -0.026em letter-spacing compensation, and 0 px row-height change at default spacing (the reserved minimum height absorbs it). Titles may wrap; no nowrap cells. Touch :active swells to 560. Instant under reduced motion. | w-type and w-motion | 1, 3 | 0 JS. |
| W-D026 | Images and textures | content/ holds PNG/JPG masters only. The build derives one AVIF/WebP still per print with its look baked, cropped around focus{x,y}: sheet 512 px long edge, enlargements and hero 1024 px. Width, height and LQIP go into a build manifest. GL decodes the same file: ImageBitmapLoader (imageOrientation flipY) in Chromium and Firefox, HTMLImageElement in WebKit. The texture is disposed at handback. KTX2 only for model textures. | w-effects | 2, 3 | No second texture download per print. |
| W-D027 | SEO and indexing while placeholders remain | Any built page holding a token ships robots noindex and stays out of the sitemap. /manor/, /arcade/, /play/ and /bench/ never enter it. Canonical: https://derprito64bit.github.io/<path>/ with a trailing slash. Title '<title> · derprito64bit' (placeholder pages are prefixed with their frame code). | w-voice, w-frontend | 1 | Lighthouse SEO is not gated while noindex is on. |
| W-D028 | Sound | Off by default and never autoplayed. One opt-in toggle (aria-pressed) lazy-loads a 2.8 s CC0 sprite (opus webm 15.1 kB, m4a 22.1 kB) the first time it is turned on. It sits in the header on desktop and in the footer below 48rem. | w-sound (evidence), W-Manager | 4 | 0 kB until opt-in; at most 16 kB after. |
| W-D029 | 404 and loading | /404.html is one blank print ('404' in its margin), with the h1 'This print came out blank.', the line 'There's no page at this address.', and links 'Back to the work' (/) and 'All work' (/#sheet). No WebGL. Pre-GL, the page shows the baked camera poster and the DOM prints; the poster fades out over the canvas in 200 ms with 0 layout shift. | w-voice, w-ia | 1 | About 5 kB. |
| W-D030 | Evidence standard GES-1, shared with the Manor | Folder: portfolio-evidence/<wave>/<crew>/<sha7>/{crew,gate}/ holding manifest.json {schema:1, track, crew, sha, createdAt, host{os, gpuRenderer, graphicsDeviceType, displayHz, cores}, tools{chrome, webkit, playwright, lighthouse, axe, node\|unity}, agent{model, effort}, items[{kind, path, sha256, route\|zone, profile, mode, tier, pass, metrics}]}. Device profiles (Chromium): D1 1920x1080 DPR1 mouse; D2 1440x900 DPR2 mouse; D3 1280x800 DPR1 mouse; T1 1024x1366 DPR2 touch; T2 768x1024 DPR2 touch; P1 430x932 DPR3 touch mobile; P2 390x844 DPR3 touch mobile. WebKit: P2 and T2. Short screens: S1 1366x640 mouse and S2 390x664 touch. R1 320x640 (static mode and axe only). Z: 200% zoom of D2 and P2. Modes: auto (the manifest asserts the expected tier: mouse full or a logged probe demotion, touch lite), static (?tier=static) and reduced, on every profile. 'crew.mjs a11y' adds a keyboard walk with ring-coverage check, text-spacing, forced-colors and dark-scheme runs on D2 and P2, plus an accessibility-tree snapshot per route. Capture: viewport shots at named scroll stops (top, #work, each enlargement, #sheet, #honours, footer; D-023 drops #door) after __stage.settled, with a 10 s timeout counted as FAIL; no fullPage capture except in static and reduced. The gate's re-shoot must match within mean 1/255 and 0.5% of pixels over 8/255. Console gate: collect every console level plus pageerror, requestfailed and every response of 400 or more. FAIL on any error-level message, pageerror, requestfailed, unexpected status of 400 or more, or any message matching /\b(error\|exception\|uncaught\|failed\|GL_INVALID\|CONTEXT_LOST\|VALIDATE_STATUS)\b/i. Warnings fail unless listed in tests/harness/console-allow.json (regex, reason, added-by, expiry). Overflow: the maximum of scrollWidth - clientWidth over the run (sampled every 100 ms), plus an element scan and the CSS lint, plus one headed D3 shot with classic scrollbars. Lighthouse: lighthouse@13.5.0 against the built dist served with gzip, 5 runs per route and form factor, median by score. A run is INVALID unless its stage:renderer mark fails /SwiftShader\|llvmpipe\|softpipe\|Basic Render\|Software/i and stage:tier is lite (mobile) or full (desktop); the LCP element is asserted. axe-core 4.13.0 with tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa runs at D2, T2 and P2 in auto, static, reduced and dark. W fails on any violation, and on any color-contrast 'incomplete' in static; at rest no visible text box may intersect a GL slot rect. Renderer gate: budget comparisons are valid only on /RX 6700 XT/. CI runs GPU-free checks only. Motion: a spring unit test, seeked filmstrips (__stage.seek, CSS animations paused and seeked) at the W-D012 keys, __motionLog checks, and tests/harness/flash (WCAG 2.3.1 general and red flash) on seeked 60 fps captures. GPU: tests/harness/gpu (fresh load per run, 30 warm-up frames, K = 60 timed frames, median of 5 loads, ms per frame at the real canvas size, renderer string recorded). Screen-reader transcript (NVDA) for home, a project page and the game's project page (D-023) at G3a and at W-C10. If the lane cannot drive NVDA, it is logged 'not verified' and escalated. | W-Manager on rt-verify, rt-a11y and rt-responsive | 1, 2, 3, 4 | None on the page. CI time grows; GL runs move to the reference host. |
| W-D031 | Layout bands for beats 2 and 3 | Bands: B1 up to 479, B2 480 to 767, B3 768 to 1023, B4 1024 to 1439, B5 1440 and up. Content max-width is 1680 px. Enlargement widths as a share of content width: B1 and B2 stacked with alternating offsets, 70%, 62% and 66%; B3 52%, 44% and 46%; B4 and B5 34%, 27% and 24%, capped at 600 px (the largest is at least 520 px at 1920). Captions go below the print under 1024 and beside it at 1024 and wider, never over the image. Sheet columns: 2 in B1 and B2, 3 in B3, 4 in B4 and B5. Prints are at least 140 px wide. (amended 2026-10-05, orchestrator ruling on #14, W-S2 day one) The column counts are maxima. The sheet renders the largest count up to them that fits the content box with prints of at least 140 px (the rendered width of the print's card, its [data-poster] still without the caption, after scale and before rotation, not its image window or tilted box), derived from the tokens. A card never overflows its track, so its inset is never negative, and a card wider than its track fails. The maximum renders at every 100%-zoom profile 390 CSS px or wider. At 320 px the sheet has 2 columns only when the gap plus the insets on all four print sides total 8 px or less, and at 195 CSS px (200% zoom on a phone) it has 1. The floor binds Sheet prints and enlargements, not List prints (W-D024). An enlargement whose share would be under 140 px (only at 195 CSS px) is 140 px. Content width is the content box inside the gutters, at most 1680 px (1680 at 1920, where the largest enlargement is 571.2 px). The gutter is --gutter (clamp(16px, 4.2vw, 80px)) resolved at that viewport; the work and sheet frames are checked against that value, never measured from their own padding. (clarified 2026-10-05, orchestrator, #14 comment 5990956119 with the ruling in comment 5990469145; no rule change) The content box is min(1680, viewport - 2 x gutter): the viewport is document.documentElement.clientWidth, the layout viewport without a classic scrollbar, and the gutter is --gutter resolved at that viewport by a probe styled width: var(--gutter), under classic scrollbars too. The inset per side is one build-wide value, 0 or one --space-* step, the same for every Sheet print at every profile; each card's untransformed layout width (before scale and rotation) equals its track minus twice the inset within 0.5 px, and a card capped or centred in a wider track fails. The 140 px floor stays on the rendered width after scale, so a print scaled below 1 must still render at least 140 px wide. In B1 and B2, alternate columns sit 24 px lower and tilts are seeded at up to 1.5 degrees, so the sheet is a sheet, not a card grid. (amended 2026-10-05, orchestrator ruling on #14, W-S2 day one) In B1 and B2, alternate columns sit 24 px lower wherever 2 or more columns render, and no print is offset at 1 column. The seeded tilts apply at any count: at every profile any tilt stays <= 1.5 degrees and is the same per slug across loads; tilts and scales turn about the card's center. The sheet heading stacks above the sheet under 1024. | W-Manager on rt-responsive, w-ia structure | 2, 3 | None. |
| W-D032 | Accessibility contract | Focus ring: 3 px in --focus plus a 2 px --focus-halo band on its outer edge (outline plus box-shadow; forced colours keep the outline). Colour is chosen by surface, not scheme: an ink ring with a paper halo on table, proof, paper and prints; an amber ring with a darkroom halo on the sleeve and the dark table (D-023: no door). Keyboard focus never lifts a print. The camera has a visible labelled group 'Camera' after the CTA in DOM order, as a top-plate strip under the camera at every band: a Shutter button; Lens as a native radio group (16, 28, 50, 85, 135 mm); Look as a native radio group (five names from content); a mono readout ('Lens 50 mm', 'Look Candle'). Every target is at least 44x44 px. Arrows step and taps select. Dragging the 3D model is a bonus: fine pointer, full tier only, through aria-hidden hit areas with touch-action pan-y and an 8 px axis lock; a tap on the camera stage presses the shutter. Exhibits get proxies (W-D020). One polite role=status region (owned by W-F) carries action feedback; assertive is used only for routes and errors. Every autoplaying video has a Pause/Play button before it in focus order, and captions whenever media.audio is true. The pencil boxes also say 'Enlarged above' in text. A footer Motion switch (aria-pressed) writes localStorage 'ion.motion', which the Manor also reads. One global flash limiter covers automatic flashes and shutter presses, including key repeat. | non-negotiable 4, rt-a11y, rt-responsive | 1, 2, 3, 4 | Strip DOM under 1 kB; no JS dependency. |
| W-D033 | The loupe (non-claiming 3D on the proof sheet) | A real 3D glass loupe (at most 3k tris and 40 kB gz, made by W-C13) rests on the proof sheet. On the full tier with a fine pointer it glides on the lag spring to the hovered print. That print is borrowed (.is-gl), and the loupe magnifies it 1.6x through a refracting lens that samples the print's own still; the loupe sleeps at rest. On lite it moves only to the tapped print. (D-025) Keyboard focus never moves the loupe or borrows a print: it shows W-D032's focus ring (W-F: keyboard focus never borrows a slot). The static tier shows a loupe poster. (D-025, D-026) Its lens has a thin-film coating, its 1.6x is measured, and it may add static loupe-only grain (fx-playbook.md section 2, effect 4). It is aria-hidden and decorative: no information exists only in the loupe, and the lens covers only the print's image window, never text. | W-Manager (rule 5), owner's 'heavy 3D' (north star v1.1) | 3, 4 | At most 40 kB gz. At most 0.3 ms per frame on the RX 6700 XT while moving, 0 at rest. Third on the cut list. |
| W-D034 | GL boot scheduling | Full tier: the GL chunk is imported after FCP via requestIdleCallback (timeout 500 ms). Shaders compile with KHR_parallel_shader_compile and compileAsync, images decode as ImageBitmap, and meshopt decodes in a worker. Each boot step runs in its own task, aiming for no task over 50 ms after module evaluation. Lite tier: GL boots when the first GL slot comes within 1.5 viewports, when the camera or strip is touched (boot scheduled after the next paint), or 5 s after load at idle, whichever comes first. Static: never. If the median desktop TBT is still above 150 ms, the fallback is to start the hero sequence at the first idle period after load and accept the 2.5 s guard. | w-perf (evidence), rt-verify, W-Manager | 1 | Targets: mobile and desktop TBT at most 150 ms (median of 5 runs). |

## Conflicts resolved

- **w-identity vs w-motion vs w-type vs w-scroll:** Four spring tables. **Resolution:** w-motion's table (W-D010). _(rule: 4 topic owner, D-002 one table)_
- **w-identity vs w-motion vs w-effects:** Develop durations, curve exponent and readability threshold. **Resolution:** Hero 2600, enlargements 2400, sheet 1600 at a 60 ms stagger; exponent 2.4; readable at d >= 0.7 (W-D011). _(rule: 5 serves beat 1, 4 topic owners, D-002 shared constant)_
- **w-identity vs w-motion vs mock:** Flash 350 vs 380 ms. **Resolution:** 350 ms, one global limiter, at least 1000 ms apart. _(rule: 3 locked D-002 shared constants)_
- **(D-023: superseded, there is no handoff or drip)** **w-bridge vs w-motion vs w-effects vs creative-direction.md:** Handoff with flash and zoom, or drip only, and its timing. **Resolution:** No flash, no zoom; drip from 200 to 720 ms, navigation at 720 ms; ink #14100E (W-D021). _(rule: 4 topic owner (w-bridge), 6 less motion, non-negotiable 4)_
- **w-scroll vs w-motion vs D-005:** gsap.ticker vs an own loop; D-005 lists GSAP. **Resolution:** Own ticker; GSAP off the allowlist; D-005 needs a re-lock. _(rule: 6 fewer deps; D-005 is proposed)_
- **w-effects vs w-scroll:** position:fixed canvas vs a riding canvas. **Resolution:** Riding canvas (0 px drift measured). _(rule: 4 topic owner, measured evidence)_
- **(D-023: the drip raise is gone; the canvas stays at z 1)** **draft tokens (gl z 5 over page z 2) vs rt-a11y:** A canvas above the content hides focus rings on prints and camera controls. **Resolution:** Ground 0, canvas 1, content 2, with no stacking contexts above slots; the canvas is raised to 41 only during the drip (W-D013). _(rule: 2 non-negotiable 4 (WCAG 2.4.7, 2.4.11))_
- **w-motion vs w-scroll:** Lenis lerp 0.2 vs 0.15. **Resolution:** 0.15; anchors off in Lenis, one anchor scroller. _(rule: 4 topic owner (w-scroll), non-negotiable 4)_
- **(D-023: the nav is Work, Contact)** **w-ia vs w-voice vs rt-a11y:** Beat-3 heading, nav items, and the nav's Manor item. **Resolution:** 'Proof sheet' and an sr-only 'Work'. Nav: Work, Contact, The Manor (to the door at every width). _(rule: 4 topic owners, non-negotiable 4 (consistent identification))_
- **w-ia vs w-voice vs w-identity:** Amber vs ink-2 placeholder slot. **Resolution:** Ink-2, never amber. _(rule: 3 locked D-002 colour grammar)_
- **w-ia vs w-voice:** Placeholder url falls back to the GitHub profile. **Resolution:** "" and no link until confirmed. _(rule: 2 non-negotiable 1)_
- **w-ia vs w-voice vs w-3d-art:** kind as a domain vs six exhibit types. **Resolution:** kind is the domain; the exhibit is derived from media and demo. _(rule: 6 less code)_
- **creative-direction.md (D-001) vs D-006:** Four look names vs five. **Resolution:** Five D-006 names, provisional; escalated (W-D018). _(rule: 7 escalate)_
- **w-identity vs w-type:** Font files and wordmark weight. **Resolution:** w-type's four files and 540/100. _(rule: 4 topic owner (w-type))_
- **w-type (full-width masthead) vs draft W-D009 (column fit) vs rt-responsive (cap 96px, 18svh) vs rt-hostile (hierarchy):** How big the name is and where the camera sits. **Resolution:** Full-width fit at every width, max(3rem, min(100cqi/6.14, 24svh)), allowed to wrap. The hero row below it splits copy and camera at 64rem and wider and on landscape phones (W-D009). _(rule: 4 topic owner (w-type), 5 keeps the camera in the first screen, non-negotiable 4 (wrap, floor))_
- **w-type vs w-motion:** Swell spring vs 180 ms tween; nowrap cells. **Resolution:** 320 to 700 over 180 ms; titles may wrap; minimum height reserves the swell. _(rule: 4 topic owners, non-negotiable 4 (1.4.12))_
- **w-identity vs w-motion vs w-effects vs w-bridge:** Reduced-motion substitute duration and ease. **Resolution:** 200 ms with cubic-bezier(0.23,1,0.32,1). _(rule: 4 topic owner (w-motion))_
- **w-3d-scene evidence vs w-scroll vs rt-responsive:** A dolly zoom from the lens ring, and a page-camera projection that depends on the viewport. **Resolution:** The page camera never changes FOV. The camera and exhibits use a stage-local projection (FOV 28, one pose per band). The lens ring extends the barrel and reframes only the print in hand. _(rule: 4 topic owner (w-scroll) plus rt-responsive measurement)_
- **feasibility judge vs w-effects:** KTX2 for sheet prints. **Resolution:** Shared AVIF/WebP still, disposed at handback; KTX2 for model textures only. _(rule: 6 fewer formats)_
- **D-011 (locked, owner) vs creative-direction.md ('no Fujifilm marks') vs draft W-D006/W-C13 ([ ] inlay, 'no brand lettering') vs Manor draft M-C1 ('no brand text'):** Camera lettering. **Resolution:** The real FUJIFILM and X-T5 lettering stays on every LOD as named decal nodes. [d64] goes on the strap tag and [ ] on the print border (W-D006, W-D019). The nameplate owner question is dropped. _(rule: 1 owner voice and 3 locked owner decision (D-011 is later and owner-locked))_
- **rt-responsive (bake the lettering into textures) vs rt-verify (named lettering nodes):** How the lettering is built. **Resolution:** Decal nodes with an alpha-tested lettering atlas: testable by name and legible on every LOD. _(rule: Both satisfied; 6 less code than two systems)_
- **w-frontend evidence vs w-scroll:** Swup plugins. **Resolution:** Plain swup plus @swup/a11y-plugin, extended with W-D015's focus rules. _(rule: 2 non-negotiable 4, then 6 fewer deps)_
- **content/README.md vs w-ia:** awards.json stays empty vs marked placeholder slots. **Resolution:** Marked honours slots sourced to owner-voice; the README edit is escalated. _(rule: Non-negotiable 1 met by marking; escalate)_
- **w-effects (250 ms) vs w-scroll (1 s):** Idle detach. **Resolution:** Skip the render on the first idle frame; detach after 1 s. _(rule: 4 topic owner)_
- **w-identity vs w-type:** Geist Mono kept or cut. **Resolution:** Kept; first font cut. _(rule: 4 topic owner (w-type))_
- **(D-023: the predicate now guards the game's Play action)** **draft nav, handoff, door and token rules vs publish.ps1 guard (coarse and screen under 820) vs rt-responsive:** Five rules decide who sees the Manor door. **Resolution:** One canEnterManor predicate with no width term, shared by nav, door, handoff and the compose guard; three door states (W-D021). _(rule: 2 non-negotiable 1 (no false copy), 5 serves beat 4)_
- **w-motion (eject sequence on every load) vs rt-responsive (print 1 as a still on lite):** Phones may not see print 1 for about 3 s. **Resolution:** The eject sequence runs on full only. Lite, static and reduced show print 1 developed from FCP, and the shutter prints the next project everywhere (W-D012). _(rule: 2 non-negotiable 3 (weak-hardware floor), 5 serves beat 1)_
- **rt-a11y (0 violations of any impact) vs rt-verify (shared floor: serious or critical):** axe gate level. **Resolution:** Floor shared by the site and the game: serious or critical fails. W's own bar: 0 violations of any impact, and Lighthouse accessibility 100. _(rule: Both satisfied; non-negotiable 4)_
- **creative-direction.md ('still' tier) vs rt-a11y:** Reduced motion as a boot-time tier. **Resolution:** A live motion axis separate from the render tiers full, lite, static (W-D017). _(rule: 2 non-negotiable 4)_
- **w-ia (two aria-pressed buttons) vs rt-a11y:** View toggle pattern. **Resolution:** A radio group 'View: Sheet / List'. _(rule: 2 non-negotiable 4)_
- **draft W-C4 (focus lifts too) vs rt-a11y:** A lifted print can cover its focus ring. **Resolution:** Keyboard focus never lifts; hover only. _(rule: 2 non-negotiable 4, 6 less motion)_
- **draft W-D012 (readable about T0 + 2265) vs rt-hostile arithmetic (GL-ready + 2564 vs a 2300 budget):** The hero budget did not match its own timeline. **Resolution:** Develop starts at eject + 400 ms. Readable = 200 + 780 + 1024 = 2004 ms after GL-ready; budget 2100 ms. (D-024: the drawing develop adds 1,200 ms, so 3,204 ms against 3,300 ms; W-D011, W-D012.) _(rule: Arithmetic, 5 serves beat 1)_
- **draft W-D017 (more than 4 cores means full) vs rt-responsive vs rt-verify:** Thread and touch-point counts misclassify devices. **Resolution:** Pointer, hover, WebGL2, Save-Data and a boot probe; pixel caps per tier. _(rule: Measured evidence; non-negotiable 3)_

## Red-team resolutions

- rt-responsive B1 (phone hero): W-D009 sizes the stage as min(content width, 100svh minus the text stack) and puts print 1 at >= 50% of content width with a designed grip-side overlap. The h1, lede and CTA are no-fly rects. W-D012 shows print 1 as a developed DOM still from FCP on lite, static and reduced (preloaded only for touch or reduced motion), so the eject runs on full only. W-S1 acceptance covers every profile plus 390x664, 1366x640 and 844x390.
- (D-023: the door is cut; the predicate guards Play on the game's page) rt-responsive B2 (five door rules): there is now one canEnterManor predicate with no width term, emitted by tokens.mjs and inlined byte for byte by publish.ps1 (W-D021). The door has three states and the nav reads 'The Manor' at every width. /?from=manor is defined. W-R's matrix adds a 960x900 mouse window and a Windows touch laptop.
- rt-responsive B3, rt-a11y B2 and rt-verify B1 (D-011): the [ ] inlay, 'no brand lettering' and the nameplate owner question are deleted. The lettering becomes decal nodes mark_fujifilm and mark_xt5 with an atlas on every LOD; [d64] goes on strap_tag and [ ] on the print border (W-D006, W-D019). W-C13 gets mechanical gates: bbox within 1%, IoU >= 0.95 and a node test. The M-C1 'no brand text' correction is in crossTrack.
- rt-responsive M (3D framing): W-D013 adds the stage-local scissored projection (FOV 28, a pose per band), posters rendered by our own renderer per band, and LOD chosen by projected device-pixel width. Acceptance: poster diff <= 4/255 including 2 off-grid sizes, and pose drift < 1 degree across a hero scroll.
- rt-responsive M (E6x3 device emulation) and rt-verify M (viewport emulation): GES-1 uses device profiles (touch, isMobile, DPR 2 to 3), WebKit at P2 and T2, short screens, R1 320 px and 200% zoom. The tier is asserted per profile. W-D017 bans maxTouchPoints and hardwareConcurrency. The W-D026 parity test has a WebKit decode path.
- rt-responsive M (dynamic toolbars): W-D013 locks no dvh in layouts holding GL slots, svh for minimum heights, and an lvh-based canvas height. Coarse pointers skip reallocation on height-only changes. W-F and W-S2 add a toolbar-collapse drift scenario in Chromium and WebKit.
- rt-responsive M (List per band): W-D024 puts the meta line above a full-width title that may wrap to 2 lines, with the token wrapping. Acceptance: a 24-character title and the token fit at 390, 430 and 768 with overflow 0.
- rt-responsive M (enlargements and sheet per band): W-D031 adds a band table with widths, caption position, 2/3/4 columns, a 140 px minimum, a staggered phone sheet and a 1680 px max content width.
- rt-responsive M (wordmark jump) and rt-hostile (hierarchy measured at 1.13 to 1.49x the index): the wordmark is full width at every width, max(3rem, min(100cqi/6.14, 24svh)), so there is no 64rem jump and it is about 2.8x the index at 1440. Landscape phones use the split row. Acceptance requires the size never to fall as width grows.
- (D-023: beat 4 now lives on the project pages, on every device) rt-responsive M (phones lose beat 4): the phone door keeps the arrival still, the size line and Share in <= 0.8 screens. Contact stays <= 5.0 screens through tighter enlargement spacing.
- rt-responsive M (touch controls): a visible top-plate strip under the camera at every band, with >= 44 px targets in a row. Drag hit areas exist only for fine pointers, with pan-y and an 8 px axis lock. A tap on the stage presses the shutter.
- rt-responsive M (tier vs budget): full now needs the boot probe as well as a fine pointer. The tiers of a UHD 620 laptop, an iPad Pro and a Windows touch laptop are stated (W-D017). The GPU budget is measured at the natural tier. Minors: pixel caps of 4.5 and 1.5 Mpx; a classic-scrollbar headed shot plus the vw lint; ?view= written only on toggle; the header scrolls away at every band (D-023: the nav's 'The Manor' item is cut).
- rt-a11y B1 (focus under GL): W-D013 reorders the layers to ground 0, canvas 1, content 2, with no stacking contexts above slots, and never raises the canvas (D-023 cut the drip). W-D032 adds the two-tone ring by surface, the visible Camera strip with readouts, and no keyboard-focus lift. W-F, W-S1, W-C4 and W-C9 gain a ring-coverage acceptance check (>= 90% of the band at >= 3:1).
- rt-a11y M (drags): Lens and Look become native radio groups, exhibit proxies get Turn left, Turn right and Reset view with arrows and Home, and the cartridge becomes a real 'Play {title}' link (W-D020, W-D032). W-C14 and W-C5 acceptance checks tap and key equivalence.
- rt-a11y M (Swup focus): W-D015 adds hash-target focus, originating-print focus on popstate and close, and one anchor scroller (Lenis anchors off). W-F and W-S3 add the keyboard round-trip acceptance.
- rt-a11y M (Manor AT): W-D021 (now the Play guard, D-023) adds the requirement line via aria-describedby, live worlds as text, real hrefs with modifier pass-through, and focus restore on pageshow. crossTrack carries the 5-point Manor AT contract (first stop, Esc releases capture, gesture-gated music with mute, flash rate, reduced-motion seed).
- rt-a11y M (schema alt): W-D005 adds coverAlt, photoAlt, stillAlt, captions, audio and decorative fields with build-failing rules, mirrored to M-F.
- rt-a11y M (identical placeholder names): W-D022 prefixes the frame code in link names, h1s, document titles and announcements, and ph-gate checks uniqueness.
- rt-a11y M (focus colour by scheme): tokens.colour.focusBySurface assigns the ring by surface, with a halo. contrast.json gets rows for every ring and surface pair.
- rt-a11y M (wordmark and nowrap under text spacing): the wordmark wraps with overflow-wrap anywhere and has a 3rem floor; List titles wrap. The CSS lint bans overflow-x hidden or clip on html and body, and the overflow gate detects clipped text.
- rt-a11y M (reduced motion fixed at boot): W-D017 makes motion a live axis separate from the render tiers. The W-C3 audit table covers the mesh sweep, lift, barrel, re-grade, pencil and loupe.
- rt-a11y M (autoplay video): W-D032 and W-C5 require a Pause/Play button before every autoplaying video, and captions whenever media.audio is true.
- rt-a11y M (evidence blind spots): GES-1 adds keyboard, text-spacing, forced-colors and dark modes, R1 320 px and 200% zoom, accessibility-tree snapshots, NVDA transcripts (logged 'not verified' if the lane cannot drive it) and a WCAG 2.3.1 flash analyser. axe fails on any violation for W, and Lighthouse accessibility must be 100. Minors: the early-focus guard (W-D012), the link-name policy and the hero print out of the tab order (W-D022, W-S1), 'Enlarged above' text, the global flash limiter tested by holding Space, the radio-group toggle, 'Skip to content', the polite status region with .is-gl on the img only, and the footer Motion switch shared with the Manor.
- rt-verify B2 (console gate): W-D030 defines the channels, the regex and a dated allowlist. W-F must catch 5 of 5 injected faults.
- rt-verify B3 (capture point): GES-1 takes viewport shots at named scroll stops after __stage.settled with a 10 s timeout, no fullPage capture in GL modes, and a re-shoot match <= 1/255.
- rt-verify M (Lighthouse protocol): exact 13.5.0, gzip dist, 5-run median, a renderer and tier validity check from user-timing marks, and an LCP element assertion. TBT and score are gated in W-S1, W-S2 and W-C14. W-D034 defers GL on lite and chunks the full boot, with a stated fallback.
- rt-verify M (renderer, headless and CI): a renderer regex replaces 'headed'. Budgets compare only on /RX 6700 XT/. CI runs GPU-free checks only. Idle is expressed as counts. The budgets.md wording change is escalated.
- rt-verify M (GPU timers and iGPU): one committed bench, ms per frame at real size. Crew thresholds are <= 1.5x the prototype median plus 20% no-regression. The iGPU rule is x30 pass, x10 'at risk'. /bench/ and an owner question supply a real low-end number. The pixel caps bring the lite sheet-8 estimate inside x30.
- rt-verify M (instruments outside the repo): W-F ports drift, gpu, idle, swap, spring, contrast, content, flash, keyboard and counters into tests/harness with npm scripts and schemas, after a red-team read. Acceptance lines name scripts, not specialists.
- rt-verify M (motion verification): three parts. A node spring test with synthetic dt; seeked filmstrips via __stage.seek and paused CSS animations; and the __motionLog schema with 5 s, stagger, flash and reduced checks (W-D030, W-C3).
- rt-verify M (one spring table across doors), M (shared standard) and M (instrumentation): spring-conformance.json on both tracks (crossTrack). GES-1 manifest, zone list, TourShots fields and an M WebGL leg go to the M-Manager. The W-F marks and hooks contract is backed by gate-owned addInitScript counters cross-checked against __stage.stats. Minors: overflow as a maximum over the run plus an element scan and lint; pre-GL JS summed from the network log before stage:gl-start, with size-limit per Vite-manifest chunk.
- rt-hostile (written findings lost in the relay; resolved from its measurements.json): the hero arithmetic (GL-ready + 2564 vs 2300) is fixed by starting the develop mid-eject, giving 2004 ms against a 2100 ms budget (D-024: 3,204 ms against 3,300 ms with the drawing develop, W-D011). The type hierarchy is fixed by the full-width wordmark. The dark table vs darkroom door at 1.06:1 got a drawn amber boundary (cut with the door, D-023). The mock's 14 px overflow at 1440 is in W-S1's overflow gate. My registered probe ('one model while placeholders remain') is answered by the loupe (W-D033) and 3D paper prints, without implying a project fact. The full rt-hostile text should be re-read before locking (crossTrack).

## Seams, in order

- content/tokens.json -> identity.json (sync-content copies it to Assets/Portfolio/Resources/Portfolio/): accent, amber-deep, ink, paper, brass, font paths, bracket ratios, monogramRichOpen/Close, the four springs as (Hz, zeta), durations in seconds.
- manor-overlay.css (--ion-* under :where(:root)) and the same-origin woff2 URLs: one font set shared by the site and the game (D-023).
- Fork-only UIUtil.SetFonts(regular, bold) seam for Bricolage TTFs; upstream keeps Nunito (owner approval pending).
- Spring.Exact proposal plus spring-conformance.json {door, integrator, spring, hz, zeta, rateHz, overshootPct, settle2Ms, maxAbsErr}, emitted by W's node test and by M-QA's EditMode test at 30, 60 and 144 Hz and through a 50 ms hitch.
- Film-look 4 x vec4 contract shared by the GLSL develop shader, the JS build bake and IonGrade HLSL; parity at most 1/255.
- PrintDevelop 2.4 s and the develop stages, shared with the Manor's HLSL port.
- Camera GLB family: camera_xt_lod0/lod1 (web) and camera_xt_manor (FlatToon slots plus mat_lettering), built from one script. Node and material names, including mark_fujifilm, mark_xt5 and strap_tag, are a public API.
- canEnterManor: the tokens build emits can-enter-manor.js; publish.ps1's guard inlines it byte for byte and sends visitors who fail it to the game's project page, `/work/<slug>/` of the entry whose demo is `/manor/`, with ?from=manor, which focuses its Play block (W-D021; `main h1`, by W-S3, until W-C5's block lands). Publish fails if that page is missing (D-023). ?force=1 bypasses.
- Manor deep links: /manor/ and /manor/?zone=gallery only; ?dpr=1 for weak desktops.
- /manor/ loader first frame: #14100E with the amber [ ] and 'Developing the Manor. {pct}%' announced every 25% (M overlay crew).
- Content schema v2 classes, including coverAlt, photoAlt, stillAlt, media.captions, media.audio and media.decorative; the sync-content v2 map reports awards.json as an orphan.
- The build manifest exports manorMB (18.0 MB encoded today) for the Play size line on the game's page (D-023).
- Motion switch: localStorage 'ion.motion' = 'reduced' or 'full', written by the Front Door footer switch and read by the Manor at boot through a jslib; the OS setting applies when nothing is stored.
- Manor accessibility contract (crossTrack): the 'Read everything as a page' first stop, Esc releasing keyboard capture, gesture-gated music with mute, flash rate.
- GES-1 manifest, console regex, renderer regex and axe floor, shared by both tracks.

## Budgets

- Lighthouse 13.5.0 under the GES-1 protocol (built dist over gzip, 5 runs, median by score, auto tier, valid only on a real renderer): performance >= 90 mobile and >= 95 desktop; accessibility 100; best practices >= 95. SEO is not gated while noindex is on.
- LCP <= 2.5 s mobile and <= 2.0 s desktop. The LCP element is the h1 on mouse profiles, or the h1 or print 1's still on touch profiles. CLS <= 0.02. TBT <= 150 ms, mobile and desktop.
- JS: pre-GL JS <= 35 kB gz, summed from the network log before the stage:gl-start mark. GL chunk (three, addons, anime, stage GL, effects) <= 185 kB gz. Effects <= 10 kB gz (6.0 measured; (D-025) 9.2 kB booked with the accepted effects, estimate, `fx-playbook.md` section 6).
- Fonts <= 100 kB woff2 (96.8 planned); preloaded <= 46 kB.
- 3D: camera LOD0 <= 30k tris and <= 250 kB gz; LOD1 <= 5k and <= 60 kB gz; Manor LOD <= 1.5k tris; cartridge <= 1.5k and 20 kB; loupe <= 3k and 40 kB; gear <= 4k and 40 kB; an owner work model <= 50k and 1 MB, on its own project only. 3D per page <= 1.5 MB gz.
- Canvas: <= 4.5 Mpx on full and <= 1.5 Mpx on lite (effective DPR lowered to fit); DPR caps 2 and 1.5.
- Print stills: sheet 512 px long edge, enlargements and hero 1024 px, AVIF with WebP fallback; home images <= 600 kB on the first scroll-through (estimate until real images).
- GPU worst moment (8 wet sheet prints): <= 4 ms per frame on the reference integrated GPU at the tier the rules give it. Until it is measured: a reference-host median x 30 <= 4 ms passes; passing only at x 10 is 'at risk' and goes to the owner. A real number comes from /bench/. Crews stay <= 1.5x the prototype median, with no regression over 20% against gpu-baseline.json.
- Idle: 0 rAF callbacks and 0 draws from 1 s to 4 s after the last input, from gate-owned counters; idle main thread <= 1 ms/s, reported with the display Hz.
- Hero (D-024): on the full tier's first visit of the session, hero:readable minus stage:gl-ready <= 3300 ms (median of 3 cold loads; the drawing holds the slot from FCP), including the camera LOD0 load and decode and the compile of its patched programs (8 on m1; one per cam_* material on m2; T0 waits for them; W-C14 re-measures on m2). With GL delayed 3 s, a developed print 1 is visible by FCP + 2.6 s: it appears when the FCP + 2.5 s guard fires, not at the end of the drawing's crossfade. No automatic motion over 5 s, drawing included.
- Input blocking: 0 ms, except the Swup out phase (<= 160 ms). (D-023: the 720 ms handoff is cut.)
- Layout: overflow 0 px as the maximum over the run, at every profile and mode. No clipped text under text spacing, at 200% zoom or at 320 px. Targets >= 44x44 px (shared floor with the Manor: 24 px). Text >= 12 px. Contact within 5.0 screens at 390x844.
- Drift: 0 px misplaced prints under wheel, touch and keys in Chromium and WebKit, including an 80 px toolbar collapse mid-fling.
- Accessibility: axe 0 violations of any impact on WCAG tags (shared floor: 0 serious or critical). Focus ring >= 3:1 with >= 90% ring coverage at every Tab stop. WCAG 2.3.1 flash analysis passes. Every motion has a reduced path that is live.
- Sound: 0 bytes until opt-in, then <= 16 kB.
- Process: every crew, gate and review agent runs on Opus 5.5 at effort xhigh (W-D001).

## Cross-track items (resolved by the orchestrator in decisions.md)

- Look names and count: four in the direction doc vs five in D-006. One dial and one 4 x vec4 contract serve the site and the game. Needs the orchestrator's lock and the owner's confirmation.
- Manor UI accent: D-002 names Brass #C59A45. w-identity proposes amber and amber-deep for the Manor's flat UI (Brass on Paper measures 2.19:1), with Brass kept as the material. The M-Manager and the owner decide.
- Spring.cs integrator: measured detent 5.6 to 8.0% across 30/60/144 Hz vs 9.48% analytic. Proposal: Spring.Exact.cs.txt as a fork request. Until the Manor owner accepts it, M-QA's EditMode test writes spring-conformance.json (same schema as W's), and the deviation is logged as an owner-approved exception rather than left unmeasured.
- Film-look contract: lock _IonFilmP.z = lift and P.x = S-curve weight, with 0 as identity.
- Manor font swap to Bricolage through a fork-only UIUtil.SetFonts seam; owner approval needed.
- Content schema v2 for M-F: ContentV2 types (profile.json, honours.json, tint) plus the new coverAlt, photoAlt, stillAlt, media.captions, media.audio and media.decorative fields, so wall labels can use them; the first EditMode round-trip test is M-F's.
- M-C1 CameraMonument ('16x X-T5, no brand text') contradicts locked D-011. Correct it to keep the FUJIFILM and X-T5 lettering through the Manor LOD's mark nodes (mat_lettering FlatToon slot), with [d64] on the strap.
- Manor accessibility contract for the M overlay crews: (1) 'Read everything as a page' is the first focus stop on /manor/ and in the pause state. (2) Esc releases pointer lock, sets captureAllKeyboardInput false (Arcade.cs:60,87) and focuses a DOM pause panel; re-entering sets it back. (3) No music before a user gesture, plus a visible mute control. (4) At most 3 flashes per second (the place flash). (5) Feel.ReducedMotion is seeded from localStorage 'ion.motion', else from the OS.
- GES-1 shared evidence standard: the same manifest schema, console regex, renderer regex, axe floor (serious or critical) and spring-conformance schema on both tracks. Manor TourShots JSON adds sha, unityVersion, graphicsDeviceName, graphicsDeviceType, qualityLevel, resolution and consoleErrors. Zones come from ZoneCatalog (seven rooms per D-003; a missing zone fails). Frame ms is labelled 'editor-d3d11-indicative' and never gated. Add the committed mud metric formulas and an M WebGL leg (Playwright over /manor/?zone=<key> at D1 and D3 per integration build).
- The /manor/ loader restyle (first frame #14100E with the amber [ ], 'Developing the Manor. {pct}%' announced every 25%) belongs to the M overlay crew.
- The compose guard changes: publish.ps1 (W-R) will inline the canEnterManor snippet. Touch-only iPads of 820 px and wider, which can open /manor/ today, will be sent to the game's project page (D-023); iPads with a trackpad still enter. The orchestrator confirms this change in Manor reachability.
- Manor audio: 5.7 MB of sounds against the art bible's 3.5 MB (w-sound, unverified). M Streaming owns it.
- D-005 re-lock: remove GSAP, Paper Shaders, troika, postprocessing, detect-gpu, OGL and @swup/astro.
- budgets.md and tools.md say 'headed'. Proposal: replace that with the renderer gate (headless=new renders on the RX 6700 XT, measured) and state that CI has no GPU.
- rules.web.md rule 1 bans throwaway prototypes. Proposal: an explicit exception for evidence-folder prototypes in research waves. Their code is ported into tests/harness only after a red-team read.
- Input gap: the relay cut off the rt-hostile seat's written findings and the tail of rt-verify, from its size-budget finding onward. rt-hostile was used through its measurements.json (hero arithmetic, type hierarchy, dark door contrast 1.06:1, overflow). Re-check both seats' full text before locking.

## Crew briefs

Each brief is also a GitHub issue (milestone "Wave 3 - build").

### W-F

- **Goal:** Your job is not to build features. Your job is to give every crew a repo where the right thing is the easy thing: one build, one content loader, one ticker, one scroll source, one canvas that sits under the content, one effects API that does nothing yet, one evidence standard, and checks that fail loudly.
- **Amendment (D-023, 2026-10-04):** see #11. A follow-up PR on `crew/w-f-m2` takes the door off `/` before the content step and G3a, so the first publish never shows it (Crews and order).
- **After:** nothing
- **Owned globs:** `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `.size-limit.cjs`, `playwright.config.ts`, `.github/workflows/**`, `scripts/crew.mjs`, `scripts/serve-dist.mjs`, `scripts/check/**`, `scripts/build/tokens.mjs`, `scripts/build/images.mjs`, `scripts/build/fonts/**`, `src/stage/**`, `src/lib/content/**`, `src/lib/tokens.js`, `src/layouts/**`, `src/styles/base.css`, `src/styles/tokens.css`, `src/components/slot/**`, `src/pages/index.astro`, `src/pages/work/index.astro`, `src/pages/bench/**`, `public/fonts/**`, `public/favicon.*`, `public/apple-touch-icon.png`, `tests/harness/**`, `tests/w-f/**`, `content/*.json (Wave 3a migration only; afterwards the orchestrator)`, `Stub files for every other crew's paths (initial commit only)`; for the D-023 door removal only (`crew/w-f-m2`): `src/sections/door/**` and `src/lib/handoff/**` (delete)
- **In scope:**
  - Astro 7.3.5 scaffold (static, trailingSlash always), Node 24, the deps allowlist only; scripts/serve-dist.mjs (node:http + zlib gzip, serving like Pages)
  - scripts/build/tokens.mjs from content/tokens.json, emitting tokens.css, tokens.js, manor-overlay.css, identity.json and can-enter-manor.js
  - Content v2 migration (placeholder-correct, with the alt, captions, audio and decorative fields) and a typed loader that fails the build on invalid data
  - Routes: index mounting fixed section stubs, /work/[slug] stubs, 404 stub, /work/ redirect, /bench/ (noindex), plus stubs for every component path in the briefs (handed to their owners at merge)
  - Layout: a header that scrolls away; skip link 'Skip to content' to main; nav Work / Contact (D-023: 'The Manor' is removed by W-F's door-removal follow-up, before G3a); mount points header-tools and footer-tools; one polite role=status region
  - Stage: the one ticker; one scroll source; the riding canvas with ground 0 / gl 1 / content 2 layering (D-023: raise('drip') is removed by W-C2); the stage-local scissored sub-viewport API; the slot registry; handback (.is-gl changes poster img opacity only); toolbar rules; render tiers with probe, governor and pixel caps; the live motion axis; context loss; one global flash limiter; GL boot scheduling (W-D034)
  - Swup boot with the a11y plugin, W-D015 focus rules, one anchor scroller and the Lenis hooks
  - No-op effects API: develop(), look(), meshReveal() (D-023: drip() is removed by W-C2), each resolving at once with the final state
  - Marks: stage:renderer, stage:tier, stage:gl-start, stage:gl-ready, stage:settled, stage:idle. Hooks: __stage.settled, __stage.seek(ms) (only behind ?t=), __stage.bounds(id), __stage.stats, window.__motionLog with the schema {id, kind, spring, trigger, t0, t1, from, to, peak, settle2Ms, tier, reduced}
  - Self-hosted fonts (4 subsets), favicons, apple-touch icon
  - Checks: ph-gate (including title and link-name uniqueness); ownership; deps; banned phrases and dashes; a CSS lint (no dvh in layouts holding [data-gl] slots, no vw widths or offsets on in-flow boxes outside tokens, no overflow-x hidden or clip on html or body); a stacking-context scan; the rAF grep; size-limit from the Vite manifest
  - Harness: port the evidence instruments, each after a red-team read, into tests/harness/{console, overflow, drift, gpu, idle, swap, spring, contrast, content, flash, keyboard, counters}/ with npm scripts h:* and the JSON schemas in tests/harness/README.md
  - scripts/crew.mjs open|check|shoot|a11y writing GES-1 manifests; GitHub Actions running GPU-free checks only
  - (D-023) Follow-up `crew/w-f-m2`, before the content step and G3a: the door removal in Crews and order (the `<Door />` mount, the nav item, the #door stop and marker, the keyboard checks retargeted to /#contact, the door and handoff stubs deleted, and the door wording in `package.json`, `astro.config.mjs` and `src/stage/router.ts`)
- **Out of scope:**
  - Section content or styling beyond stubs
  - Shaders, camera, springs (slices and 3b crews)
  - The fork's publish script (W-R)
- **Acceptance:**
  - npm ci && npm run check pass on Node 24 (build, astro check 0 errors, lint, ownership, deps, size-limit, ph-gate, CSS lint, stacking-context scan)
  - Build emits /, /work/<slug>/ for all 8 projects, /404.html, the /work/ redirect and /bench/; the sitemap excludes noindex pages and /manor, /arcade, /play and /bench
  - tokens.mjs is deterministic (identical SHA-256 of all five outputs over two runs); identity.json parses as JsonUtility-flat; can-enter-manor.js <= 400 B
  - Exactly 1 requestAnimationFrame call site in src/. Gate-owned counters (addInitScript) read 0 rAF callbacks and 0 draws from 1 s to 4 s after the last input and match __stage.stats. 0 getBoundingClientRect calls inside the ticker over a 10 s scroll
  - Layering: at rest no ancestor of a fixture [data-gl] slot creates a stacking context. With GL drawing beneath, >= 90% of the slot's focus-ring band differs from the unfocused frame by >= 3:1
  - Stage-local fixture cube: projected bounds drift < 0.5 px and < 1 degree across a 40% scroll. The same canvas element and GL context persist across 6 Swup round trips, with geometry and texture counts back at baseline
  - Keyboard round trip sheet -> project -> Back leaves activeElement on the same print link, and the next Tab reaches the next print. A cross-page hash visit focuses the target. Anchor scroll positions are monotonic (no double scroll)
  - Back restores scroll to +-1 px. The drift harness reads 0 px in Chromium and WebKit with a touch fling and an 80 px viewport-height change mid-fling. No buffer reallocation on height-only changes with a coarse pointer
  - Tiers: mouse profiles report full (or a logged probe demotion), touch profiles lite, ?tier=static static. A grep finds 0 reads of maxTouchPoints or hardwareConcurrency. Forced 30 ms frames step down after 45 busy frames and never back up. The canvas is <= 4.5 Mpx (full) and <= 1.5 Mpx (lite) at 1920x1080 DPR 2
  - Turning on emulated reduced motion mid-timeline ends running timelines within 1 frame. Context loss: every slot drops .is-gl within 1 frame, and a second loss within 60 s sets static. activeElement survives a full no-op develop
  - Console gate catches 5 of 5 injected faults (throw, rejection, 404, failed request, shader error) in tests/harness/console fixtures
  - Fonts: 4 woff2 files <= 100 kB, preload <= 46 kB, swap shift <= 2 px at D2 and P2
  - Stub home: Lighthouse (5-run median, valid renderer) performance >= 95 desktop and >= 90 mobile, accessibility 100, CLS 0. axe 0 violations. Overflow 0 at every GES-1 profile and mode. Pre-GL JS <= 35 kB gz from the network log
  - crew.mjs shoot and a11y write a valid GES-1 manifest and exit non-zero on any failed item. CI is green on GPU-free checks
- **Evidence:**
  - GES-1 manifest (shoot and a11y) for /, /work/project-01/ and /404.html
  - npm run check log at the SHA
  - Lighthouse 5-run JSON (mobile and desktop) with renderer marks
  - axe JSON
  - size-limit output and the pre-GL network-log sum
  - Swup round-trip, idle-counter and keyboard round-trip JSON
  - console fault-injection report
  - tokens.mjs determinism hashes
  - CI run URL

### W-R

- **Goal:** Your job is not to redesign hosting. Your job is to make the composed site at derprito64bit.github.io serve the portfolio at / and the game at /manor/ (D-023) with no broken link, the right 404 and one honest guard, using the fork's publish v2.
- **Amendment (D-023, 2026-10-04):** see #12. The guard stays; visitors who fail it go to the game's project page, found in content (the entry whose demo is /manor/). Publish fails if that page is missing. The guard ships with the first publish at G3a, and the compose check fails the publish if the door is back on /.
- **After:** W-F (including its D-023 door-removal follow-up), the content step (D-023; work may start on a fixture dist before it)
- **Owned globs:** `scripts/release/**`, `tests/w-r/**`, `fork: scripts/fork/publish.ps1`, `fork: scripts/fork/linkcheck.ps1`, `fork: scripts/fork/compose-check.ps1`, `fork: docs/FORK.md (D-023: the / and /manor/ rows only)`, `fork: site/index.html (D-023: delete)`
- **In scope:**
  - Compose the portfolio-site dist with scripts/fork/publish.ps1 -DryRun and serve it locally
  - The guard inlines W-F's can-enter-manor.js byte for byte, in place of the width-based phone guard
  - (D-023) The guard's target from the composed site's content/projects.json: /work/<slug>/ of the entry whose demo is /manor/, with ?from=manor; the fork's `docs/FORK.md` `/manor/` row (the guard) says the same
  - (D-023) The compose retires the fork's `site/index.html` (today's root landing page into the game): / serves the portfolio-site dist, nothing copies the old page, W-R deletes it, and the fork's `docs/FORK.md` `/` row says so
  - (D-023) compose-check.ps1's root check: the publish fails if the composed / holds any of the door: `id="door"`, a link to `/#door`, a nav item named 'The Manor', 'holds the same work' or 'Enter the Manor'
  - Keep the reserved paths (manor, play, arcade) untouched; /play/ keeps its query and hash
  - The root 404.html serves unknown paths, including /manor/nope
  - Link check over the composed tree
  - Robots: /manor/ noindex; the sitemap lists the site's pages only (no /bench/)
- **Out of scope:**
  - 404 design (W-C8)
  - Unity build changes
  - Deploying (orchestrator only)
- **Acceptance:**
  - publish.ps1 -DryRun exits 0. The served tree answers 200 for /, /work/project-01/, /manor/?zone=gallery and /arcade/demo/. /play/?zone=gallery#x lands on /manor/?zone=gallery#x
  - The guard snippet's SHA-256 equals the one in the tokens build output
  - Guard matrix 7 of 7: 390x844 touch, 820x1180 touch and 1024x1366 touch go to the game's project page with ?from=manor (D-023); 1280x800 mouse, 960x900 mouse and a Windows touch-laptop profile (pointer fine, any-pointer coarse) stay; ?force=1 bypasses
  - (D-023) With the content step's entry, the guard target answers 200 and holds the dock's `data-mount="play"` point (W-C5 fills it later). With a fixture dist that has no entry whose demo is /manor/, publish.ps1 -DryRun exits non-zero and names the missing entry
  - (D-023) / answers with the portfolio-site dist's index.html, not the fork's `site/index.html`, which is deleted. The root check passes on the composed tree and fails, naming the string, on a fixture dist whose / still holds the door (`id="door"`, `/#door`, 'The Manor' in the nav, 'holds the same work' or 'Enter the Manor')
  - (D-023) At P2, /work/game/?from=manor loads with `document.activeElement` equal to `main h1` (W-S3), and after W-C5 to its Play block
  - Unknown paths (/nope/, /work/nope/, /manor/nope) return the site's 404.html
  - Link check: 0 broken internal links
  - 0 files under manor/, play/ or arcade/ come from the site dist
  - /manor/ carries noindex; the sitemap has no /manor, /arcade, /play or /bench URL
- **Evidence:**
  - DryRun log
  - guard-matrix.json
  - linkcheck report
  - 404 shots at D2 and P2 (GES-1)
  - curl -I transcript

### W-S1

- **Goal:** Your job is not to port the mock. Your job is the first screen at Level-3 polish on every device: the name in amber brackets, one line, one CTA, and the real 3D camera with its strip. On a desktop the X-T5 drawing develops into the camera (D-024), which presses, clicks and ejects print 1, readable within 3.3 s of the canvas waking (#13 Amendments A1 and A2). On a phone print 1 is already there, and the shutter invites the touch.
- **Amendments A1 and A2 (D-023 to D-026, 2026-10-04):** see #13. The site opens with the X-T5 drawing developing into the camera.
- **After:** W-F, W-C13 (milestone m1 merged)
- **Owned globs:** `src/sections/hero/**`, `src/components/wordmark/**`, `src/components/camera-strip/**`, `src/gl/camera/**`, `src/gl/effects/develop/**`, `src/motion/spring/**`, `public/posters/camera/**`, `tests/w-s1/**`; for D-024 only: `content/tokens.json` (the three hero drawing durations and `heroTimelineMs`), `src/styles/tokens.css`, `src/lib/tokens.js` (regenerated)
- **In scope:**
  - Hero section and the fitted wordmark (W-D009), across all bands and landscape phones
  - Camera v1 on W-C13's m1 GLBs through the stage-local projection (FOV 28, pose per band), with LOD by projected width
  - The top-plate strip 'Camera' (Shutter, Lens radio group, Look radio group, readout); aria-hidden drag hit areas on fine pointers
  - Develop shader v1 (noise texture, light-first stages, LITE); ion-spring v1
  - The data-hero and data-cam head script (W-D012, A2), print 1's DOM still and its touch preload; the hero timeline (W-D012) with guards and no-fly rects; the shutter printing the next project
  - (D-024) The camera develop patch in two files: its GLSL chunk in `src/gl/effects/develop/camera.ts` (the shader final passes to W-C2) and its hook, uniforms and timing in `src/gl/camera/drawing.ts` (passes to W-C14). W-S1 freezes the uniform names, so W-C2 and W-C14 can run at once
  - (D-024) `heroTimelineMs` in content/tokens.json re-based: the phase keys count from the eject sequence's start, `readableAfterGlReady` 3204 and `budgetAfterGlReady` 3300 (docs/agents/tokens.json)
  - Camera posters per band rendered with W-C13's poster script into public/posters/camera/
  - Reduced and static paths; the flash through the stage's global limiter
- **Out of scope:**
  - Looks bake, mesh reveal (W-C2)
  - X-T5 rebuild (W-C13 m2)
  - Tilt and final verbs (W-C14), sound (W-C9)
- **Acceptance:**
  - FCP shows the h1, the line slot, 'See the work', the strip and the camera poster at every profile. The LCP element is the h1 on mouse profiles, or the h1 or print 1's still on touch. 5-run medians: LCP <= 2.0 s desktop and <= 2.5 s mobile; TBT <= 150 ms both; CLS <= 0.02
  - Wordmark: one line at default spacing at every profile. At fixed height its size never decreases as width grows (5% tolerance) across the profiles plus 960x900 and 844x390. Under text spacing and at 200% zoom: no clipped text, overflow 0
  - First screen at D1, D2, D3, S1, T1, T2, P1, P2, S2 and 844x390: the whole camera (lens never covered, grip not clipped) and print 1 sit inside the viewport. Print 1 is >= 50% of content width below 64rem (>= 179 px at 390), and its window is >= 220 px at 64rem and wider. At rest no text box intersects a GL rect. The flight never crosses the h1, lede or CTA rects (__stage.bounds log) (Amended 2026-10-04: see W-D009 as amended and decisions.md "W-S1 line 3 (landscape phones)"; landscape phones use the height rule.)
  - hero:readable minus stage:gl-ready <= 3300 ms on the first full-tier visit, drawing included (median of 3 cold loads; D-024, was 2100 ms). With the GL chunk delayed 3 s via page.route, a developed print 1 is visible by FCP + 2.6 s: it appears when the FCP + 2.5 s guard fires, not at the end of the drawing's crossfade. The first keydown, focusin or pointerdown jumps to the end state
  - Poster vs first GL frame: mean diff <= 4/255 at the profiles plus 1180x820 and 600x900. Camera pose drifts < 1 degree across a 40% hero scroll
  - Strip: a group named 'Camera'; targets >= 44x44 px with none overlapping at P2 with touch; arrows and taps give identical states; a vertical swipe on the camera stage scrolls the page; a tap presses the shutter
  - __motionLog: press, detent and settle overshoot within +-0.5 points of the table. Holding Space on the shutter for 5 s gives <= 1 flash in every 1000 ms window in both schemes. The flash analyser passes
  - Reduced motion and static: print 1 is developed at FCP, a shutter press swaps prints with a 200 ms fade, and layout shift vs auto is 0 px
  - Hero wet GPU <= 1.5x the prototype median at D2 (tests/harness/gpu). Console gate passes; overflow 0
  - (D-024, A2) First paint per W-D012: the drawing only with motion full, tier full or lite, no 'ion.hero' flag, no hash and no Back; otherwise the finished camera from first paint with no swap; with JS off, the finished camera. Shots at every profile in auto, reduced, static and JS-off, plus a reload, a /#sheet arrival and a Back arrival. The head script is measured under 0.8 kB
  - (D-024, A2) On lite the crossfade never makes the finished-camera poster the LCP element: the LCP stays the h1, or print 1's still on touch (5-run LCP element log)
  - (D-024, A2) A guard that fires mid-drawing ends on the finished camera with print 1 developed, `ion.hero` is set, and a reload in the same session paints the finished camera with no swap
  - (D-024) heroDrawingClay, heroDrawingDevelop, heroDrawingFade and heroTimelineMs come from tokens; no literal duration or budget in src/ or tests/w-s1/ (the 3300 ms check reads budgetAfterGlReady)
- **Evidence:**
  - GES-1 shoot and a11y manifests for /
  - seeked hero filmstrips (full and reduced)
  - __motionLog JSON
  - GPU bench JSON with renderer string
  - Lighthouse 5-run JSON and axe JSON
  - delayed-GL recording
  - poster diff JSON

### W-S2

- **Goal:** Your job is not a card grid. Your job is beats 2 and 3 at Level-3 polish: three enlargements that develop as they reach you, and one proof sheet of every project that switches to a numbered List. All of it is glued to the page, asleep at rest, and laid out for every band.
- **Amendment (D-023, D-025, 2026-10-04):** see #14. The game is one print on the sheet, like every project, under one print rule: the cover when it is set, the test strip when it is not (W-D005, W-D022). W-F's follow-up takes the door stub off `/` before G3a: measure contact within 5.0 screens as built, and if the stub is still on `/` at your SHA, report its height.
- **After:** W-F
- **Owned globs:** `src/sections/work/**`, `src/sections/sheet/**`, `src/components/print/**`, `src/lib/teststrip/**`, `src/gl/prints/**`, `tests/w-s2/**`
- **In scope:**
  - Selected work per the W-D031 band table (sizes, offsets, tilts, captions beside or below)
  - Proof sheet with amber pencil boxes and 'Enlarged above' text; the 'View: Sheet / List' radio group; the per-band default; ?view= written only on toggle
  - List rows per band (W-D024) with the swell (W-D025) (W-D024 as amended 2026-10-05: each row leads with its print, and the title cell reserves its swell wrap)
  - DOM print component with link names '{frame}, {title}', alt='' images, aria-hidden strips and the image-failed state (in a List row, uncaptioned: W-D022 as amended 2026-10-05)
  - Seeded test-strip generator (SVG + Canvas2D)
  - GL print entities bound to slots, developing at 35% visibility through effects.develop() (no-op until W-S1's develop merges) (ruled 2026-10-05: W-S2 registers it from src/gl/prints on createDevelopMaterial(); see decisions.md "W-S2 develop registration"); hover lift is GL only and never on keyboard focus
- **Out of scope:**
  - Exhibit objects (W-C4 with W-C14)
  - Looks bake (W-C2)
  - Loupe (W-C14)
- **Acceptance:**
  - The band table holds at every profile: prints >= 140 px; 2, 3 and 4 sheet columns; the largest enlargement >= 520 px at D1; the smallest >= 45% of content under 1024; no caption over an image; overflow 0 (Amended 2026-10-05: 44%, not 45%. Sheet columns are maxima, and exactly 2, 3 and 4 at every 100%-zoom profile 390 CSS px or wider. Prints >= 140 px means Sheet prints and enlargements. See W-D031 as amended and decisions.md "W-S2 lines 1 and 2".)
  - The sheet lays out 5, 6, 7 and 8 projects with no empty frame. The phone sheet is staggered (24 px offset, seeded tilt <= 1.5 degrees) (amended 2026-10-05: in B1 and B2, the offset applies where 2 or more columns render, and no print is offset at 1 column; see W-D031 as amended)
  - Enlargements develop over 2400 ms once 35% visible. The sheet develops over 1600 ms with a 60 ms stagger and is fully developed <= 2.1 s after its trigger. Each develops once per session, never on an anchor, List or Back arrival
  - At rest 0 slots carry .is-gl. The drift harness reads 0 px in Chromium and WebKit, including the toolbar-collapse scenario
  - List: a 24-character title and the placeholder token fit at 390, 430 and 768 with overflow 0. The swell changes row height by 0 px. Rows >= 44 px. ?view= is absent until the visitor toggles
  - Link names are unique per URL. ph-gate passes. Same slug gives a byte-identical strip SVG, and Canvas2D matches SVG to a mean diff <= 2/255
  - No placeholder print shows an exhibit object. Contact sits <= 5.0 screens down at 390x844
  - 8 wet sheet prints <= 1.5x the prototype median at D2. The iGPU check at the lite cap is recorded as pass or 'at risk'
  - (D-023) One print rule for every entry (W-D022): a fixture placeholder entry with a sourced cover shows that cover with its token title and frame code; one with cover '' shows its seeded test strip. Both in Sheet, List and the enlargements
- **Evidence:**
  - GES-1 shoot and a11y manifests for / (sheet and list)
  - drift JSON (Chromium, WebKit)
  - seeked develop filmstrip
  - GPU bench JSON
  - axe and Lighthouse JSON

### W-S3

- **Goal:** Your job is not a case-study template. Your job is one project page at Level-3 polish: the print you chose lifts off the sheet and docks into the page, keyboard focus comes back to where you were, and everything you need is above the fold.
- **Amendment (D-023, 2026-10-04):** see #15. The game's page comes from this template like every project. Leave one empty Play mount point in the dock for W-C5, focus `main h1` on a `?from=manor` arrival (the guard's target from G3a until W-C5), and land the content validator's changes (W-D005's sourced-field exception, the teaser field's retirement) before the content step.
- **After:** W-F, W-S2
- **Owned globs:** `src/pages/work/[slug].astro`, `src/sections/project/**`, `src/gl/flight/**`, `tests/w-s3/**`; for D-023 only: `src/lib/content/validate.js` and `src/lib/content/types.ts` (the sourced-field exception and the teaser retirement) and, if it repeats the rule, `scripts/check/ph-gate.mjs`
- **In scope:**
  - /work/[slug]/ template: the dock (print, h1 with frame code while a placeholder, kind, role and year in mono, blurb, one primary action) and the sections in w-ia order, with empty ones omitted
  - Lift-and-dock across Swup (W-D015) and its reverse on the close link, with the close link and Back returning focus to the originating print
  - Next print and All work links; noindex, canonical and title rules
  - (D-023) An empty `data-mount="play"` point in the dock for W-C5's Play block
  - (D-023) A project page loaded with `?from=manor` focuses its `main h1` (tabindex -1, focus with preventScroll, no scroll), so the guard's full-page arrival at G3a lands somewhere; W-C5 later moves this focus to the Play block
  - (D-023) The sourced-field exception (W-D005) in the content validator, with tests
  - (D-023) Retire the worlds' `teaser` field (a beat-4 door concept): drop its rule ('at most one teaser on the Front Door') and make the field optional in the shape and types, so the content step can delete it; reword the featured warning to 'the home page has 3 enlargements'
  - (D-023) The dock shows the cover when it is set, else the test strip (W-D022)
- **Out of scope:**
  - Lead exhibit and Show the mesh (W-C5 with W-C14)
  - OG images (W-C5)
- **Acceptance:**
  - The dock is fully above the fold at D2, S1, P2 and S2
  - The flight lands within 0.5 px. Content enters over 220 ms with an 8 px rise. The Swup out phase is <= 160 ms. Same canvas and context
  - Back and Forward are instant, with scroll restored to +-1 px and focus on the originating print. The close link does the same
  - Placeholder pages carry noindex, unique document titles ('1A ... · derprito64bit'), the correct canonical and unique route announcements
  - Reduced motion: opacity only, no flight. Empty sections are absent from the DOM. axe 0 violations
  - (D-023) The validator accepts a placeholder entry whose kind, demo, cover and media values each name an owner-facts line in its source, and rejects any such value with no line (tests/w-s3). It passes worlds.json with and without `teaser`, and no message names the Front Door. The dock's Play mount point renders nothing
  - (D-023) Loaded with `?from=manor` at D2 and P2 (a full load, as the guard's `location.replace` does), a project page has `document.activeElement` equal to its `main h1` and scrollY 0; without the parameter, load focus is unchanged
- **Evidence:**
  - GES-1 manifests for /work/project-01/
  - seeked flight filmstrips (full and reduced)
  - Swup and keyboard round-trip JSON
  - Lighthouse and axe JSON

### W-C13

- **Goal:** Your job is not a pretty render. Your job is the Fujifilm X-T5, rebuilt essentially 1:1 from gathered references with its real lettering (D-011), as one script that emits the web LODs and the Manor LOD. The rig names stay unchanged, the fidelity is proven by numbers, and everything fits its budget.
- **Amendment (D-024, D-025, 2026-10-04):** see #16. The hero's lines asset on request and the lens-eye coating; the rig names stay.
- **After:** nothing
- **Owned globs:** `assets-src/3d/**`, `scripts/build/glb/**`, `scripts/build/posters/**`, `public/models/**`, `public/posters/wire/**`, `tests/w-c13/**`
- **In scope:**
  - m1 (first PR): the evidence GLBs re-optimized with the pivot-safe flags, plus scripts/build/posters (renders posters per band through our own three.js stage on the reference host, so a poster equals the first GL frame)
  - m2: gather and cite X-T5 references and dimensions; rebuild the body, dials, hump, grip and lens; add the lettering decal nodes mark_fujifilm and mark_xt5 with an atlas on every LOD; add a strap with strap_tag ([d64]); silver and black
  - exhibit_cartridge, the loupe model (glass slot), and exhibit_gear only after the owner confirms a robotics project
  - Wireframe posters with build-measured triangle counts
  - Blender through scripts/fork/blender_gpu.py only (D-012)
- **Out of scope:**
  - Scene choreography (W-C14)
  - Owner's project models (later intake)
  - Camera posters' pose choices (hero crews)
- **Acceptance:**
  - m1 lands with every W-D019 pivot, marker and material, found by a CI test in three r186 with the original transforms
  - m2: LOD0 <= 30k tris and <= 250 kB gz; LOD1 <= 5k and <= 60 kB gz; Manor LOD <= 1.5k tris with flat material slots including mat_lettering
  - Bounding box without the lens matches 129.5 x 91.0 x 63.8 mm within 1%. Front, top and side orthographic silhouettes reach IoU >= 0.95 against masks committed in tests/w-c13/ref-masks/
  - mark_fujifilm, mark_xt5 and strap_tag are found on LOD0, LOD1 and the Manor LOD; the lettering is legible in a P2 lite render (reviewed shot)
  - Cartridge <= 1.5k tris and 20 kB; loupe <= 3k and 40 kB
  - No .blend in either repo; credits recorded for any CC0 or CC-BY asset
  - The poster script output matches the first GL frame at mean diff <= 4/255
- **Evidence:**
  - glbstat output (tris, draws, kB raw/gz/br)
  - reference URL list
  - IoU JSON and overlay renders
  - three.js node test log
  - poster vs GL diff JSON

### W-C2

- **Goal:** Your job is not a shader demo. Your job is the effects engine behind the no-op API: the full develop with looks baked at build, the hero's live re-grade and Show the mesh, plus the accepted darkroom effects (D-025, D-026): calm grain that forms once, roller tracks on every eject, baked halation and the camera develop's shader. Each has a static state, a reduced state and a measured cost, and none of it flashes.
- **Amendment (D-023 to D-026, 2026-10-04):** see #17. The ink drip (GL and DOM) is cut, and W-C2 removes its plumbing.
- **After:** W-S1, W-S2, W-F's door-removal follow-up (D-023: the door tokens go after the door)
- **Owned globs:** `src/gl/effects/**`, `src/gl/shaders/**`, `scripts/build/looks/**`, `tests/w-c2/**`; for the drip and door-token removal only: `src/stage/effects.ts`, `src/stage/rail.ts`, `src/styles/base.css`, `scripts/build/tokens.mjs`, `content/tokens.json`, `src/styles/tokens.css`, `src/lib/tokens.js` (regenerated)
- **In scope:**
  - Develop shader final (full and LITE), the noise bake, light-first stages, the 120 ms handback crossfade, the WebKit HTMLImageElement decode path
  - Calm grain over the LQIP glow that forms once and is 0 at d = 1 on prints (D-026); roller tracks on every eject (`fx-playbook.md` section 2)
  - Five-look compiled table (W-D018), the sharp build bake with band-pass halation, the hero FILM_LIVE re-grade and its bright-pass map, and the film-look contract's halation term
  - The camera develop patch's shader final in `src/gl/effects/develop/camera.ts`, keeping W-S1's uniform names, exact identity at d = 1 (D-024)
  - Mesh reveal (onBeforeCompile, idle-time barycentrics)
  - Drip removal: drip() and DripResult in the effects API, raise('drip') and its CSS rule, the drip and handoff tokens. In content/tokens.json: the door boundary, ink-drip, the handoff durations, glRaisedForDrip, doorPhoneMaxScreens, the door focus surface and colour role, and the dark table vs darkroom row, with tokens.css and tokens.js regenerated. identity.json keeps its inkDrip key for the M overlay crew's loader first frame (#14100E, the /manor/ loader seam); nothing reads it today
- **Out of scope:**
  - Choreography timing (W-C14, W-C3)
  - Print entities (W-C4)
  - The loupe's lens (W-C14)
- **Acceptance:**
  - Wet develop per frame at D2 for the hero (camera develop included) and sheet-8 scenarios <= 1.5x the w-effects prototype median for the same scenario, with the values committed in gpu-baseline.json. Later regressions <= 20%. Finished prints cost 0 draws
  - The iGPU rule is recorded for sheet-8 at the lite cap: reference median x 30 <= 4 ms passes, otherwise 'at risk' goes to the owner
  - GLSL vs JS look parity <= 1/255; Standard is identity (no halation). GL vs DOM at handback mean diff <= 2/255 in Chromium and WebKit. Halation build vs GL <= 1/255 per look
  - Grain is exactly 0 at d = 1 on prints and does not change frame to frame once formed; warp is at most 1 CSS px along the exit axis and 0 by d = 0.85; the develop passes the flash analyser at enlargement size in both schemes
  - Effects JS <= 10 kB gz, measured
  - No drip code, token or z-raise remains (grep src/, scripts/build/tokens.mjs and content/tokens.json; identity.json's inkDrip key stays), and the canvas never rises above z 1. Every effect has its static and reduced state in GES-1 shots
- **Evidence:**
  - GPU bench JSON and gpu-baseline.json
  - parity JSON
  - handback diff images (Chromium, WebKit)
  - flash analysis JSON
  - GES-1 manifests
  - size-limit output

### W-C3

- **Goal:** Your job is not to add animation. Your job is to make every motion on the site come from one table, be frame-rate independent, stop by itself, have a reduced twin that applies live, and prove it the same way the Manor does.
- **Amendment (D-024, D-026, 2026-10-04):** see #18. The audit table adds the hero's drawing-to-camera develop and its lite crossfade; the drip and the door lean-in are gone.
- **After:** W-S1, W-S3
- **Owned globs:** `src/motion/**`, `src/styles/motion.css`, `tests/w-c3/**`
- **In scope:**
  - Spring table from tokens; ion-spring final; the CSS linear() consumer
  - Swup transition styles (160 and 220 ms, 8 px), develop and pencil timelines, stagger rules
  - Reduced-motion audit table for every motion, including the mesh sweep, lift, barrel, re-grade, pencil and loupe
  - spring-conformance.json emission; filing the Spring.Exact request on the fork (no fork edits)
- **Out of scope:**
  - Camera verbs and hero timeline (W-C14)
  - Shaders (W-C2)
- **Acceptance:**
  - Spring unit test with synthetic dt (1/30, 1/60, 1/144, and 1/60 with one 50 ms hitch): overshoot within +-0.5 points, settle-to-2% within +-15 ms (interpolated crossing), max |x - analytic| <= 1e-6
  - tokens.css linear() strings equal the build output byte for byte
  - __motionLog in an unseeked run: every spring name is in the table; every automatic entry is <= 5000 ms; staggers are 30 to 80 ms; under reduced motion only fades <= 200 ms appear
  - Every audit-table entry's reduced substitute is verified in GES-1 reduced shots and by a live toggle mid-motion
  - spring-conformance.json is written. The fork request issue URL is recorded
- **Evidence:**
  - spring unit-test output
  - spring-conformance.json
  - audit table
  - seeked filmstrips
  - __motionLog JSON
  - fork request issue URL

### W-C14

- **Goal:** Your job is not to make the camera spin. Your job is the camera's verbs, the loupe, and the hero and exhibit scenes: press, turn with detents, tilt, eject and land, and the hero's drawing-to-camera develop carried onto the m2 GLB (D-024). Every 3D moment carries a print or a project, and each one works by tap and by key.
- **Amendment (D-023 to D-026, 2026-10-04):** see #19. The door scene is cut; the hero's drawing-to-camera develop and the loupe coating are added.
- **After:** W-S1, W-C13 (milestone m2 merged)
- **Owned globs:** `src/gl/camera/**`, `src/gl/scenes/**`, `src/sections/hero/**`, `src/components/wordmark/**`, `src/components/camera-strip/**`, `src/components/exhibit/**`, `public/posters/camera/**`, `tests/w-c14/**`
- **In scope:**
  - Hero choreography final on the m2 GLB (W-D012); the shutter printing the next project (a stack of at most 3)
  - Verbs: shutter, lens ring (barrel extends and the print in hand reframes; stage FOV fixed), look dial re-grade via effects.look(), tilt (lag, +-6 degrees yaw, +-3 degrees pitch, fine pointer and full tier)
  - Exhibit staging and the exhibit proxy component (W-D020)
  - The loupe (W-D033)
  - The hero's drawing-to-camera develop (D-024, #13 A1) on the m2 GLB in `src/gl/camera/drawing.ts` (the GLSL chunk is W-C2's): lines re-baked from m2 (or W-C13's lines asset), the drawing and end-state posters re-rendered. On m2 the patch covers every `cam_*` material (50 on #56's LOD0, against 8 on m1), and T0's compile wait and the 3,300 ms budget are re-measured there; if m2 misses the budget, a request to the orchestrator rebalances the `heroDrawing*` durations in content/tokens.json (W-C14 has no tokens glob)
  - (D-023) `src/gl/scenes/index.ts` holds hero and exhibit scenes only: its stub comment loses 'door scenes'
  - Loupe coating, a measured 1.6x and optional static loupe-only grain (D-025, D-026). The loupe follows hover (full) and taps (lite); keyboard focus shows W-D032's ring and never moves it (W-D033)
- **Out of scope:**
  - Shader internals (W-C2)
  - The door scene and the handoff (cut, D-023)
- **Acceptance:**
  - Every W-S1 acceptance line still holds on the m2 GLB, with posters re-rendered
  - Strip and model stay in sync. A drag (fine pointer, full tier) snaps to detents on release. Tap, arrows and drag reach identical states. Presses during an eject are ignored, and the flash limiter holds
  - Tilt is off on touch, lite, reduced and static, and settles to 2% <= 520 ms
  - Exhibit proxy: Turn left, Turn right and Reset view >= 44 px; arrows turn 15 degrees; Home resets. Models never load for placeholders, and an owner model loads only within 1 viewport
  - Loupe: <= 0.3 ms per frame on the reference host while moving, 0 draws at rest, aria-hidden; never covers text; magnification 1.6 +- 0.05x; any grain is static. A keyboard walk over the sheet leaves the loupe still and 0 slots with .is-gl, with W-D032's ring on each print
  - The drawing-to-camera develop holds every #13 A1 line on the m2 GLB: no hidden line, the stock camera at d = 1, poster parity <= 4/255
  - Draw calls on the home page at the busiest moment (renderer.info), re-measured on m2: <= 40 is an m1 figure, and #56's LOD0 alone has 95 draws, so the m2 count and its GPU cost go to the orchestrator with D-021 before this line is re-stated
- **Evidence:**
  - GES-1 manifests for /
  - seeked verb filmstrips
  - renderer.info JSON
  - GPU bench JSON
  - keyboard walk JSON

### W-C4

- **Goal:** Your job is not a gallery widget. Your job is to take the work slice to finished: real exhibit objects where content earns them, a tactile hover, and an index that stands on its own as the phone, zoom and no-WebGL experience.
- **Amendment (D-023, 2026-10-04):** see #20. The cartridge's 'Play {title}' for the game shows only when canEnterManor passes.
- **After:** W-S2
- **Owned globs:** `src/sections/work/**`, `src/sections/sheet/**`, `src/components/print/**`, `src/lib/teststrip/**`, `src/gl/prints/**`, `tests/w-c4/**`
- **In scope:**
  - Exhibit selection from media and demo (W-D020), mounting W-C14's exhibit component
  - Hover lift (settle, +9 px, scale 1.035, fine pointer only, never on keyboard focus)
  - Pencil-box draw (420 ms, 90 ms stagger) with 'Enlarged above' kept
  - Phone sheet and List polish; the loupe slot on the sheet; the image-failed state
- **Out of scope:**
  - Shaders (W-C2)
  - Project pages (W-C5)
- **Acceptance:**
  - Every W-S2 acceptance line still holds
  - The hover lift never moves the DOM box; touch has no hover state; the ring is never covered (ring-coverage check)
  - At 200% zoom and at R1 320 px the index stays readable, with no horizontal scroll and no clipped text
  - A failed image shows an undeveloped print captioned 'Image didn't load.', never a test strip
  - (D-023) The print rule holds through the finish work: with the content step's entry, the game's print shows its captured cover (token title, frame code, no exhibit) and every other placeholder its test strip, in Sheet, List, static and reduced
- **Evidence:**
  - GES-1 manifests including ?view=list
  - seeked hover filmstrip
  - axe and keyboard walk JSON

### W-C5

- **Goal:** Your job is not eight copies of one page. Your job is project pages that show the work: a lead exhibit you can turn by drag, tap or key, an honest mesh count, video that never runs on without a pause, share images that are the developed print, and, on the game's page, an honest Play (D-023).
- **Amendment (D-023, 2026-10-04):** see #21. W-C7's surviving scope moved here; the door is cut.
- **After:** W-S3, the content step (D-023)
- **Owned globs:** `src/pages/work/[slug].astro`, `src/sections/project/**`, `src/gl/flight/**`, `src/pages/og/**`, `scripts/build/og/**`, `src/components/play/**`, `src/lib/play/**`, `tests/w-c5/**`
- **In scope:**
  - Lead exhibit: a GLB with the exhibit proxy and Show the mesh; video with a poster and a Pause/Play button before it (paused under reduced motion, captions when audio); or an image enlargement
  - Filmstrip <dialog> for 2 or more media
  - Honours row for honours naming the project
  - OG images (1200x630) per page and for home via scripts/build/og; the home OG's print is print 1, the first featured entry (W-D006)
  - The game's Play action in its three states from canEnterManor (W-D021 as rewritten): Play with the requirement line; touch: the size sentence plus Share or Copy the link; no WebGL2: the WebGL sentence plus Copy the link
  - Prefetch on intent of the /manor/ HTML, loader and framework only. Play is a plain link, and modifier clicks behave natively
  - ?from=manor focuses the Play block; the size line from the manifest (manorMB); the Painting Worlds from worlds.json as text
  - Play mounts in W-S3's `data-mount="play"` point, on the page of the entry whose demo is /manor/
- **Out of scope:**
  - The flight (frozen unless a bug)
  - Unity loader code
- **Acceptance:**
  - All 8 pages build and pass GES-1
  - OG images <= 60 kB each; each shows the entry's cover when it is set, else its test strip (W-D022)
  - (D-023) The home OG's print is print 1, the first featured entry, under the same rule (its cover when set, else its test strip), never the first entry that has a cover: with the content step's entry at frame 8 and no other cover, the home OG shows frame 1's test strip, not the game's capture
  - The dialog traps focus and closes on Esc. Pause works by keyboard. Video never autoplays with sound. The build fails on a video with audio and no captions
  - The printed triangle count equals the GLB's index.count / 3
  - The Play states render at the right profiles: D1 to D3 get Play; T1, T2, P1 and P2 the touch state; WebGL2-off the WebGL state. Share falls back to Copy the link, and the result is announced in the status region
  - No Web.wasm or Web.data request before Play is clicked (network log). Play navigates on the first click with no added delay
  - The requirement line is referenced by aria-describedby from Play. ?from=manor focuses the Play block, replacing W-S3's `main h1` focus (the guard's target since G3a)
  - (D-023) In every Play state the block ends with 'All work' (/#sheet): from /work/game/?from=manor it is reachable in one Tab from the focused block, and it leads to the full sheet
  - On a phone the game's page tells its story with stills and video, with no empty slot where Play would be
  - (D-023) The game's real content entry from the content step, not a fixture, builds /work/game/ with its captured cover, stills and video and the Play block, checked on the first publish after W-C5 merges
- **Evidence:**
  - GES-1 manifests for 2 project pages and the game's page
  - OG file list with sizes
  - axe, keyboard walk and Lighthouse JSON
  - network log JSON and Play-state shots at D2, T2, P2 and WebGL-off

### W-C6

- **Goal:** Your job is not an About page. Your job is beat 3's ending: every award and medal on a negative sleeve, and contact one click away in a footer that says only true things.
- **Amendment (D-023, 2026-10-04):** see #22. The sleeve and the footer now end the home page. The door stub, the handoff stub, the nav's 'The Manor' item and the #door scroll stop are already gone (W-F's follow-up, before G3a); W-C6 keeps them gone.
- **After:** W-S2
- **Owned globs:** `src/sections/honours/**`, `src/sections/footer/**`, `tests/w-c6/**` (D-023: the door removal moved to W-F's follow-up, so W-C6 has no one-off globs)
- **In scope:**
  - 'Awards and medals' negative sleeve from honours.json (hero award, then awards, then medals in file order; one empty sleeve with a token while none are confirmed; photoAlt required)
  - Footer: 'Write to me: {email}', links, the proof line while tokens exist, credits <details> from content/CREDITS.md, colophon (first cut)
  - profile.json consumer for the hero line and the footer
- **Out of scope:**
  - /about/ (cut)
  - Footer tools (W-C9)
- **Acceptance:**
  - The Contact nav link reaches the footer in 1 click, and focus lands on it
  - No count or fact appears that is not in content
  - Text >= 4.5:1. The focus ring on the sleeve uses the dark-surface pair (>= 3:1)
  - (D-023) The home page ends on the sleeve and the footer's contact line: no empty dark band where the door was, no game call to action in the footer, and no #door anchor, nav item or scroll stop left (grep). The keyboard harness's hash and anchor checks pass on /#contact
  - (D-023) The ending is composed: at D2 and P2, scrolled to the bottom, the sleeve's last row and the contact line share one screen as one composed frame (reviewed shots in both schemes)
- **Evidence:**
  - GES-1 manifests for /
  - axe and keyboard walk JSON

### W-C7 (closed by D-023)

- **Status:** closed by D-023 (2026-10-04). The orchestrator closes #23 when this plan merges. The beat-4 door, its handoff and the ink drip are cut (D-023). The game is one project, with its own page.
- **Moved to W-C5 (#21):** the Play action in three states from canEnterManor, prefetch on intent, ?from=manor, the size line and the Painting Worlds as text.
- **Cut:** the door section, the phone door, the 720 ms handoff and its cancel, the dark-scheme door boundary, the nav's 'The Manor' item and 'Straight to the Grand Gallery'.
- **Removals:** the door and handoff stubs and the nav item (W-F's follow-up `crew/w-f-m2`, #11, before G3a); the drip plumbing (W-C2, #17).

### W-C8

- **Goal:** Your job is not a loader. Your job is to make the page whole before and without WebGL: static prints with their looks, every link working with JS off, and a 404 that is a blank print.
- **Amendment (D-023, D-024, 2026-10-04):** see #24. The home page has no door; the static tier and JS-off paint the finished camera.
- **After:** W-S2
- **Owned globs:** `src/pages/404.astro`, `src/sections/notfound/**`, `src/styles/tier-static.css`, `tests/w-c8/**`
- **In scope:**
  - Static-tier CSS prints with per-look approximations (tier-static.css driven by data attributes)
  - /404.html per W-D029
  - No-JS check: every section renders and every link works
- **Out of scope:**
  - Tier detection (W-F)
  - Image-failed state (W-C4)
- **Acceptance:**
  - The static tier and JS-off render every section with no blank region at every profile
  - 404: Lighthouse accessibility 100, no WebGL, two links, overflow 0 at R1
  - Static color-contrast has 0 'incomplete' axe items
- **Evidence:**
  - GES-1 static and JS-off manifests for / and /404.html
  - Lighthouse JSON for the 404

### W-C9

- **Goal:** Your job is not more effects. Your job is the last 10%: every hover, press and focus feels physical and visible on every tier, sound is there only for those who ask, and motion can be switched off without touching the OS.
- **Amendment (D-023, D-024, 2026-10-04):** see #25. The Motion switch also decides the hero's first paint (W-D012); there is no door.
- **After:** W-C3, W-C4, W-C14
- **Owned globs:** `src/styles/interaction.css`, `src/lib/sound/**`, `src/components/sound-toggle/**`, `src/components/motion-switch/**`, `public/sound/**`, `tests/w-c9/**`
- **In scope:**
  - Press and hover states site-wide through data attributes; CSS tilt and push fallbacks for lite and static
  - Focus ring audit (W-D032 pairs, forced colours)
  - Sound toggle and the CC0 sprite (W-D028)
  - Footer Motion switch writing 'ion.motion'
- **Out of scope:**
  - New sections or effects
- **Acceptance:**
  - 0 bytes of audio before opt-in; sprite <= 16 kB
  - Every interactive element >= 44x44 px. At every Tab stop at D2 and P2, >= 90% of the ring band is >= 3:1; the ring stays visible under forced colours
  - Lite and static show a press response on every control
  - The Motion switch changes the page live and persists in 'ion.motion'
- **Evidence:**
  - GES-1 manifests
  - network log before and after opt-in
  - keyboard walk with ring coverage
  - axe JSON

### W-C10

- **Goal:** Your job is not new work. Your job is the plan's final responsive and accessibility pass: run the whole GES-1 matrix on every route, fix what fails, and hand over transcripts that prove a screen-reader user and a phone user get the whole story.
- **Amendment (D-023, D-024, 2026-10-04):** see #26.
- **After:** W-C2, W-C3, W-C4, W-C5, W-C6, W-C8, W-C9, W-C14
- **Owned globs:** `src/** (only while no other W crew is active)`, `tests/w-c10/**`
- **In scope:**
  - Full GES-1 shoot and a11y on every route
  - Fixes for any profile or mode failure
  - NVDA transcript for home, a project page and the game's project page (D-023)
  - Flash analysis of the hero flash, the hero's camera develop and the develop grain (D-023, D-024)
- **Out of scope:**
  - New features or effects
- **Acceptance:**
  - Every budget line passes on every route at every profile and mode
  - An SR transcript exists for each of the three routes, or 'not verified' is logged and escalated
  - Flash analysis passes in both schemes
  - Contact <= 5.0 screens at 390x844; overflow 0 everywhere
- **Evidence:**
  - GES-1 manifests for every route
  - NVDA transcripts
  - flash analysis JSON

## Cut list

- Already cut: GSAP and ScrollTrigger, Paper Shaders, troika, postprocessing, detect-gpu, OGL; the AF-frame cursor; /about/, /honours/, /contact/, /credits/; the 'All projects' nav item; the visible 'Selected work' heading; the hero print caption; Look chips; the hand-typed 18 MB; flash and zoom-to-fill on the handoff; the door camera's second eject; camera scroll-turn; velocity skew; page-level grain; KTX2 for prints; exhibit objects on placeholders; the [ ] camera nameplate inlay (D-011); the 64rem column-fitted wordmark; 'still' as a render tier; the aria-pressed view toggle; lift on keyboard focus; the fixed canvas above the content; ?view=list written by default; the one-line phone door; (D-023) the door section, the phone door, the handoff, the GL and DOM ink drips, the door lean-in, the door camera and the nav's 'The Manor' item; (D-026) the 12 fps grain boil.
- 1. Sound kit
- 2. Lenis
- 3. The loupe
- 4. exhibit_gear (until a robotics project is confirmed)
- 5. Pointer tilt on the camera
- 6. Pencil-box draw-on (boxes stay, static)
- 7. Show-the-mesh sweep becomes an instant swap
- 8. Geist Mono, replaced by Bricolage tabular figures
- 9. Film dial live re-grade (hero baked like the rest)
- 10. Bracket close on load (kept on shutter press)
- 11. Page flight, replaced by a plain fade
- 12. Sheet develops in pairs
- GPU lever: if the iGPU check stays 'at risk' after /bench/, 'sheet develops in pairs' moves to first.
- The develop itself is cut last.
