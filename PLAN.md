# Orchestrator plan: the website, until it's live

**Track: the website only.** The owner said (2026-10-27): "let's hard focus on the website portion first i want to be able to have a proper portfolio ready first over having project ion overtaking priority".
- The Manor and Painting Worlds (game repo derprito64bit.github.io) stay paused until this site is live. Don't touch them.
- One crew at a time, one stage per session.
- The owner gives each stage the go-ahead and caps crew rounds.

## Where things stand (2026-10-29, after W-V0)
- **W-V0 is done: Viewfinder is on main and the Darkroom is retired. Next = launch W-V1 in a fresh session (NEXT STAGE below).** Its spec v1 and a W-V0 rulings comment are posted on #21.
- **main = 0c72687 plus this stage's docs PR.** Merged this stage:
  - #107: the owner's name in `content/owner-facts.md` (Aaron Chen, CONFIRMED 2026-10-29, from the owner in chat);
  - **W-V0a #108** (eb8631b): Viewfinder at `src/evf/`, pixel-proven unchanged against e53a047 (worst 0.0375% of a 0.5% limit; only the clock masked); D-049's deletions (tag `darkroom-final` = 35410b8, backup run first); budgets schema 2 in the `json budgets` block; checks, CI and the harness core re-pointed to `/`; media-caps and the HTML `/` row with negative controls;
  - #109 (3f9ef98): the name on the intro and the contact screen;
  - **W-V0b #110** (0c72687): `?vf-test` hooks only (D-055), per-channel engine counters (#92 in part), the idle check on them, a state-machine smoke in Chromium and WebKit with GL in CI at 640 × 400, DPR 1, and `crew.mjs lighthouse` re-pointed to Viewfinder; #11 closed.
- **CI has no GPU.** GL runs in CI only at 640 × 400, DPR 1; the rest runs on the flat path (`H_NO3D=1`). Full-size GL runs (smoke, idle, Lighthouse) are one command each on the reference host.
- **The Lighthouse baseline is blocked (host):** the PC was busy (6 host-suspect mobile runs; the desktop precheck stayed busy 30 minutes). Re-run it in the owner's quiet window with the one command in `portfolio-evidence/v2/baseline/README.md`. budgets-v2 stays proposed until then and the owner's yes (D-048).
- **Reported to the owner (not must-fix while budgets are proposed):** fonts about 270 kB in 6 files against 130 kB and 3; CLS on `/` 0.0978 mobile (host-suspect runs) and 0.051 desktop (one clean run); the intro redraws at the display rate at rest (about 240 fps on the 238 Hz host). Each is in #106 with its stage.
- **The queue is #106** ("Follow-up queue (v2)", 22 open items with done-when lines). #91 is closed.
- **Session cost (W-V0):** agent tokens W-V0a worker about 392k (Sonnet), W-V0b builder about 465k (Opus xhigh), two verifiers and the spec refuter about 350k (Sonnet). No dollar ledger for this non-loop stage.
- **System review:** `portfolio-evidence/loop-audit/SYSTEM-REVIEW-2026-10-13.md`.

## Operating model (adopted by the owner 2026-10-27; recorded on #91)
The rules are the review's "Proposed operating model".

1. **Round:**
   - the crew opens or updates its PR;
   - then, in parallel: the functional gate (Chromium and WebKit, with a visual read, the deterministic frame-count probes ×3 and 1 Lighthouse run), **one** time-boxed breaker pass scoped to the diff, and, on slice PRs, a **design/motion jury**;
   - then the judge.
   - No per-round perf agent and no approval refuters.
   - A second breaker pass runs only for GL-lifecycle or navigation diffs, and W-F-m3 gets 2.
2. **Must-fix (pre-launch taxonomy):**
   - **Blocks:**
     - an acceptance-row failure;
     - a regression against main on a default visitor path, proven by a main-SHA control;
     - a budget breach beyond its tolerance band, reproduced in a second clean set;
     - on slices, a design row below target.
   - **Rare-edge regressions** block only when the fix is at most one crew task with no new harness.
   - **Everything else goes to #91** with a done-when line: anything pre-existing on main, tooling hardening and single-run flakes.
   - **A busy host means "blocked, rerun".** It never means "cannot approve". A should-fix doesn't become a must-fix just because it recurs.
3. **Perf:**
   - bytes in CI size-limit;
   - LCP and CLS from the gate's single Lighthouse run;
   - timed rows (mobile TBT, readable, GPU ratio) **once per PR at the approval candidate**, plus once before G3a, scoped to the rows the diff can reach.
   - Those runs come from a detached script queue with a hostload precheck, 5 runs each (10 for TBT).
   - A fail must reproduce in a second clean set. An investigator agent with main controls runs only on a fail.
4. **Caps:**
   - W-S2: **3 code rounds plus 1 evidence round**.
   - Stop early if the must-fix count hasn't fallen for 2 rounds.
   - At the cap, give the owner a 5-line summary with cost per round: merge with follow-ups, one more round, or hold.
5. **Waits and context:**
   - no LLM call blocks longer than **270 s** (the cache lives 5 minutes);
   - each agent gets a small versioned **spec** (10k chars or less), an open-items digest (3k or less) and the last judge verdict, never whole threads;
   - a crew whose context passes about 400k hands off to a fresh agent.
6. **Cost:**
   - Post a cost line per round (ledger scripts in `portfolio-evidence/loop-audit/review-2026-10-13-scripts/`).
   - No budget pause; the owner cares that spend buys visible quality.
   - The global CLAUDE.md token rules apply: Opus at xhigh only for crew, gate, judge and jury; sonnet or haiku at low or medium for search, mechanical and verify stages; the muse-worker agent for routine scripting while its router runs.

### Operating model: kept, with small changes (PLAN v2)

The lean loop stays as written in PLAN.md. Changes:
- **Crew ids:** `W-V0` to `W-V4`, then `W-R`. Branches `crew/w-v<n>`. Config keys `wv<n>`. Evidence root: `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\v2`.
- **crew-config defaults:** `breaker.extraPassGlobs` becomes `src/evf/gl/**`, `src/evf/router.ts`, `src/evf/project/**`, `src/pages/**` and `src/layouts/**`. A diff there gets 2 breaker passes (navigation or GL lifecycle).
- **Jury:** the motion benchmark stays the bar. Each slice's spec names its rows. The jury also checks the "never become" list in docs/agents/north-star.md.
- **Caps:** slices get 3 code rounds plus 1 evidence round. Stop early when the must-fix count is flat for 2 rounds. At the cap, give the owner the 5-line summary with costs.
- **Budgets:** budgets-v2 binds as must-fix only after the owner confirms it (D-048). Until then a breach goes to the owner at the cap.
- **W-V0 is not a crew loop.** It is two orchestrator PRs, built from `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\research-reset\2026-10-29\plan\w-v0-checklist.md`. W-V0a (land, delete, re-point) is mechanical: one Sonnet worker (medium). W-V0b (engine counters, `?vf-test` gating, the smoke, the baseline) is the base of every later gate: one Opus builder (xhigh, as for crews). One Sonnet verifier checks each PR, and CI must be green. W-V1 cannot start until both have merged.
- **Cost basis:** W-S2 took 4 rounds for about $140 in crew runs (rounds of $59, $32, $28 and $20), plus about $70 for the orchestrator session.

## The pick (D-038, D-039)

> "wow all of these are so good i don't know how to choose i love every single concept for some parts of how they display things, but i'd say ill go with the first option viewfinder combined with flux's unique way of displaying awards and medals for each project, along with fluxes film prints integrated into viewfinder's view project feature having different  sizes of film prints fordifferent images sizes respectively"

- **Base:** Viewfinder (`concept/viewfinder` @ e53a047).
- **Graft 1:** Flux's honours display (the arched refracting glass and the medal on a thread, both pushable). It shows on each project that has honours, and in the honours section (D-043).
- **Graft 2:** Flux's film prints, inside Viewfinder's open-project view, each sized by its image's aspect and pixels (D-044).
- Nothing else from Flux: no fluid, marbling, Roboto Flex, Lenis or second engine.

## Plan v2 files

- Decisions D-038 to D-056: `docs/agents/decisions.md`. North star v2: `docs/agents/north-star.md`. Budgets (proposed, D-048): the budgets-v2 section of `docs/agents/budgets.md`.
- The landing checklist and the first crew spec stay in the evidence repo: `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\research-reset\2026-10-29\plan\w-v0-checklist.md` and `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\research-reset\2026-10-29\plan\first-crew-spec.md`.
- Owner questions: the "Owner questions" section below.

## NEXT STAGE: launch W-V1 (#21)

Done before this point: the plan's docs PR (#105), the owner questions, the issue moves, W-V0a (#108), the name (#109), W-V0b (#110), and W-V1's spec v1 (refuted twice, posted on #21 with a W-V0 rulings comment). Start a fresh session.

1. **Preflight.** At least 4 GB of free memory. The live preview (`portfolio-preview/preview.py`, :4400 main and :4401 the crew PR) running; start it detached if not (`Start-Process python preview.py -WindowStyle Hidden`). No other perf-lane holder.
2. **Launch** from a sibling worktree at origin/main (never from `portfolio-site/.claude/worktrees/`: Astro builds fail there):
   `node scripts/fleet/loop/launch.cjs wv1 --spec C:\Users\Aaron\Documents\GitHub\portfolio-evidence\v2\specs\wv1\spec-v1.md --spec-meta C:\Users\Aaron\Documents\GitHub\portfolio-evidence\v2\specs\wv1\meta-v1.json --out C:\Users\Aaron\Documents\GitHub\portfolio-evidence\v2\runs\wv1`
   It prints LAUNCH READY; then run `Workflow({ scriptPath: '<out>\crew-loop.wv1.js' })` with no args.
3. **Watch** each round with `orchestrator-tools/2026-10-27/round-watch.mjs`, and post a cost line per round (`scripts/fleet/cost-line.mjs`). Reap browsers after each round.
4. **First progress note to the owner:** the crew's first-checkpoint list of how its prints differ from Flux's.
5. **At the cap** (3 code rounds plus 1 evidence round): the 5-line summary with cost per round; merge with follow-ups, one more round, or hold.
6. **Size check after round 1:** about 2,200 changed lines is expected. Over 2,500, or A10 and A11 not started: move A10, A11 and J4 into a W-V1b slice.
7. **After merge:** update the build-log artifact, back up, log, and move on to W-V2 (#22) in a fresh session.

## The crew order to go-live

| # | Id | What | Issue | Jury | Caps | Rough cost |
|---|---|---|---|---|---|---|
| 0 | W-V0 | **Done 2026-10-29** (#108, #110; the name #109). Landing, two PRs. W-V0a: Viewfinder on main, Darkroom deleted, checks and harness re-pointed. W-V0b: engine counters, test gating, smoke, baseline | #11 | no | each: 1 build + 1 fix pass | $50-90 |
| 1 | W-V1 | The project view and the film prints (needs W-V0 merged) | #21 | yes | 3 code + 1 evidence; 2 breaker passes | $140-230 |
| 2 | W-V2 | The honours display (Flux's glass and medal), per project and in the honours section | #22 | yes | 3 + 1; 2 breaker passes | $110-180 |
| 3 | W-V3 | The EVF and gallery: real media in the frame, life at rest, the jury's open items | #20 | yes | 3 + 1; 2 breaker passes | $100-170 |
| 4 | Content | The owner's facts, media, honours and order | #32 | no | 1 PR | $10-25 |
| 5 | W-V4 | Floors and performance: no-WebGL, no-JS, WCAG 2.2 AA, phone, perf, meta | #24 (+#26, #82) | yes, 2 rows | 2 + 1 | $80-130 |
| 6 | W-R | Hosting (option A) | #12 | no | 1 + 1 | $20-40 |
| 7 | G3a | The owner's review, then go-live hidden from search (D-013) | #101 | no | 1 must-fix round if needed | $15-60 |

**Why this order.** W-V0 gives a clean base: one codebase, no dead weight, green checks, and the counters every later gate reads. No crew starts before it has merged. The owner sees the blend first in W-V1: Flux's prints inside Viewfinder's open project. It is built on its permanent parts: a real route, the static article, content model v3 and the image ladder. W-V2 adds the honours to that same page, and the honours section. W-V3 polishes the EVF once both grafts are in, so its jury judges the whole blend. The content step comes before W-V4, so the floors and the perf pass run on real media.

Crew totals: about $525 to $925. Add about $50 to $70 of orchestrator time per stage (8 stages; W-V0a and W-V0b share one). All in: about $0.9k to $1.5k.

### W-V0: the landing (two orchestrator PRs, not a crew loop)

**Scope:** bring Viewfinder e53a047 onto main, unchanged in behaviour. Delete the Darkroom. Re-point the checks, CI and harness core. Add the engine counters and the test gating, so W-V1's gate works. Record the Lighthouse baseline for the budgets. The binding checklist is `C:\Users\Aaron\Documents\GitHub\portfolio-evidence\research-reset\2026-10-29\plan\w-v0-checklist.md`; this is its summary.

**Owns (one-off, both parts):** `src/**`, `public/**`, `assets-src/**`, `tests/**`, `scripts/build/**`, `scripts/check/**`, `.github/workflows/**`, `package.json`, `package-lock.json`, `astro.config.mjs`, `.size-limit.cjs`, `playwright.config.ts` (created; it does not exist on main), `content/awards.json`, `content/worlds.json`, `content/tokens.json` (outputs list only).

**W-V0a: land, delete, re-point** (Sonnet worker, medium; about $15-25):
1. Tag main `darkroom-final` at its pre-landing SHA, and run `backup.py` first.
2. `src/concept/**` from e53a047 lands as `src/evf/**` (git mv). `src/pages/index.astro` is the concept's. The build matches e53a047's at five checkpoints (intro at rest, raise end, frame 3, open, honours) at 1440 × 900 and 390 × 844: pixel diff at most 0.5%. **Deterministic by method:** e53a047 is built in a fresh scratch worktree (never in `portfolio-site.wt/concept-viewfinder`). Both builds run under the same Playwright init script: `Math.random` replaced by a fixed-seed PRNG, and time driven by Playwright's clock API to each checkpoint. The clock readout is masked. First, two runs of e53a047 against each other must differ by 0.1% or less; any region that still varies (film grain, the roaming spot meter) is masked in both and listed in the PR.
3. Everything in D-049's code list is deleted. `src/layouts/Base.astro` is trimmed to the head, the noindex switch and the skip link, and renamed `Site.astro`; `Text.astro` goes. `src/pages/404.astro` becomes a minimal static page in the new tokens. The favicons stay until W-V4.
4. `package.json` keeps only what is used: astro, gsap, ogl, both fontsource packages, and the dev tools (sitemap, check, typescript, sharp, playwright, axe, lighthouse, size-limit). deps.md has a row for each new one.
5. `npm run check` is green:
   - lint: the "one requestAnimationFrame in src/" rule becomes a file allowlist (`src/evf/gl/engine.ts`, `src/evf/main.ts`); W-V3 narrows it to the engine only;
   - css-lint: fix the 10 findings (replace 100vw with inset, 100% or container units). The only allow-listed rule is `html.js body { overflow: hidden }`, by name;
   - ph-gate: the OWNER_NAME marker in the `.ph` form;
   - size-limit: groups for critical JS, engine, total JS, CSS and HTML, at the budgets-v2 hard caps. The HTML check has a negative control;
   - media-caps (new, `scripts/check/media-caps.mjs`, wired into `run.mjs`): budgets-v2's per-class image, poster and LQIP caps on `dist`, read from the budgets block. It passes with no media and has a negative control. W-V1 brings the media;
   - stacking: retired;
   - tokens-determinism: the new outputs list;
   - ownership: the new globs;
   - `astro check` and deps.
6. Harness core re-pointed to `/`: console (fails on any error, `console.assert`, `GL_INVALID*` and `CONTEXT_LOST*`; #84), overflow at 320 px, contrast, keyboard, flash (an empty capture fails), and axe. The retired harness parts (with `idle`) and their CI steps are deleted together.

**W-V0b: counters, gating, smoke, baseline** (Opus builder, xhigh; about $35-65; starts after W-V0a merges):
7. Engine frame counters per channel (scene, composite, eyepiece, readback; #92) and `window.__vf` attach only with `?vf-test` (D-055). A unit test checks both ways. The idle check is rebuilt on these counters; it asserts only what e53a047 meets, and W-V3 tightens it to D-053.
8. A Playwright state-machine smoke in Chromium and WebKit: boot, intro, raise, go to frame 3, open, close, honours, contact, lower. 0 console errors.
9. The Lighthouse baseline on `/`: 5 runs mobile and 5 desktop, under R1 to R5, saved to `portfolio-evidence/v2/baseline/`. A busy host means "blocked (host)", recorded, and it is retried in the owner's quiet window. It does not block the merge.

### W-V1: the project view and the film prints (#21; the first crew)

**Scope:** `/work/<slug>/` as a real static page, opened in-app from the EVF with history. Content model v3 and the image ladder. Flux's film prints, sized by each image, in the roll. Playback (lightbox). Phone Back fixed. Full spec: v1 as posted on #21 (`C:\Users\Aaron\Documents\GitHub\portfolio-evidence\v2\specs\wv1\spec-v1.md`; the planner's draft was `research-reset\2026-10-29\plan\first-crew-spec.md`). Starts only after W-V0a and W-V0b have merged.

**Size:** about 2,200 changed lines, tests and fixtures aside (16 rows; the spec refuter's count; 1,500 was too low). If round 1 is over 2,500 or shows it will not fit, the orchestrator moves A10 and A11 (playback and video) into a W-V1b slice with jury row J4, and W-V1 keeps J1, J2, J3 and J5.

**Owns:**
- `src/pages/work/**`, `src/pages/index.astro` (the `#proj` container markup only), `src/layouts/**`;
- `src/components/project/**`, `src/components/print/**`;
- `src/evf/project/**`, `src/evf/router.ts`, `src/evf/style/{project,print}.css`;
- `src/evf/main.ts` and `src/evf/style.css` (only to move the project code out, wire the router and deep links, set the HUD print counter and `engine.sway` while open); `src/evf/testhooks.ts` (additions only); `src/evf/layout.ts` (the open mode only); `src/evf/data.ts` (the project media fields only);
- `src/lib/prints/**`, `src/lib/content/**`;
- `scripts/build/images.mjs`, `scripts/build/media-fixtures.mjs`; `astro.config.mjs` (only to hook the fixtures into the build);
- `.size-limit.cjs` (the `/work/` rows only); `.github/workflows/check.yml` (the w-v1 test step only); the media caps themselves are W-V0's `media-caps` check;
- `content/projects.json` (placeholder media entries only), `content/README.md`;
- `tests/w-v1/**`, `tests/unit/{prints,content}/**`;
- `package.json` (scripts and deps), `package-lock.json`, `docs/agents/deps.md` (rows only).

**Acceptance (short form; the spec is binding):**
1. Static `/work/<slug>/` pages, complete without JS.
2. In-app open and close with pushState and popstate; deep links; focus returns to the opener.
3. Content model v3 and its validation.
4. The image ladder and its byte caps.
5. The print look.
6. The print size rule, unit-tested.
7. The layout on desktop and phone, with overflow 0 and CLS 0.
8. Prints expose in order.
9. Focus and dim, with the AF brackets.
10. Playback.
11. Video prints.
12. Phone Back works on the first tap.
13. Calm, no-WebGL and no-JS paths.
14. The engine is idle in the roll.
15. Budgets.
16. Tests.

**Jury rows:** the open-to-roll arrival; the roll at rest as one curated set; the focus brackets and dim; the playback Flip; the blend's coherence.

### W-V2: the honours display (#22; also #17, #88, #52)

**Scope:** D-043 in full. The engine's honours pass, the physics port, the per-project row, the honours section and `/honours/`, the fallbacks, and context-loss restore for the whole engine.

**Owns:** `src/evf/gl/**`, `src/evf/honours/**`, `src/components/honours/**`, `src/pages/honours/**`, `src/pages/work/[slug].astro` (the honours slot only), `src/pages/index.astro` (the honours section markup only), `src/evf/{scenes,data,layout}.ts` (the honours parts only: delete scene kinds 1 and 2, change `honourScene`, link honours to projects), `src/evf/style/honours.css`, `src/evf/style.css` (only to move the honours rules out), `src/evf/main.ts` (only to move the playback code out), `src/lib/content/**` (the honours link only), `tests/w-v2/**`.

**Acceptance:**
1. One extra pass, only when an honour is within one viewport. With none, the composite draws straight to the screen, and the honours channel counts 0 frames.
2. The glass and medal match D-043's optics. Flux's constants are unchanged. Unit tests pin the settles: the medal settles face-on within 4 s of a click, and the glass tilt settles within 1 s.
3. The backdrop is the linked project's own frame scene, drawn in the anchor rect. Unlinked honours use the all-tints light bars. No film tint. The metal tint comes from `metal`.
4. The per-project row appears after the prints only when the project has honours. One award and one medal at a time; Prev and Next; a DOM caption with typed placeholders; a Push button (Enter or Space).
5. The honours section shows one honour per frame, the object about 60% of the frame's height. "From Project NN" opens that project. `/honours/` deep-links in without the intro. Scene kinds 1 and 2 and their shader code are deleted.
6. Anchoring: the objects stay within 1 px of their DOM anchor under wheel, touch, keys, resize and an 80 px toolbar collapse, in Chromium and WebKit (#52, re-scoped). No layout reads per frame.
7. Calm: a static tilt. Touch: a tap pushes, with a slow auto sway. No WebGL: designed CSS silhouettes. No JS: the honours lists are in the document.
8. Context loss (W-F-m3's lesson): the CSS fallback shows at once. On restore, programs, targets and textures rebuild, and a visible frame renders within 1 s. Never black. Tested with `WEBGL_lose_context` in Chromium and WebKit. A WebKit resize or realloc keeps the GL frame (#88).
9. The governor scales the pass (half-res refraction under quality 0.75). The 4x CPU floors hold on the honours section.
10. The engine chunk stays within its cap (estimate +5 to +7 kB gz).

**Jury rows:** the glass reads as glass that bends the work; the medal's hang and push feel bouncy yet firm; the per-project row is a memorable placement, not a badge; the honours section is memorable; the blend's coherence.

### W-V3: the EVF and the gallery (#20; also #18)

**Scope:** real media in the frame, the jury's round-2 open items, life at rest, one motion source, one ticker, and the rest of the main.ts split.

**Owns:** `src/evf/**` except `src/evf/project/**` and `src/evf/honours/**`; `src/pages/index.astro`; `src/components/{intro,evf,contact}/**`; `content/tokens.json` (motion tokens) and its generated outputs; `scripts/check/lint.mjs` (the ticker and duration rules only); `tests/harness/idle/**` (the D-053 thresholds only); `tests/w-v3/**`.

**Acceptance:**
1. A "photo" scene kind: a project with a cover, or a media entry marked hero, shows it in the frame at its own aspect (letterboxed, never stretched). Focus comes from `focus`, with rack, depth of field, exposure, peaking and the dial. The meter and histogram read it. Placeholder projects keep the test subjects.
2. The preloader's real tasks include decoding and uploading the first frame's cover.
3. On phones, vertical and horizontal swipes over 60 px on the frame both advance.
4. The index row at 390 px: every entry reachable, with a visible cue (an edge fade and the count), scroll snap and 44 px targets.
5. Life at rest (D-053): with no pointer, the intro moves at least 0.3% of pixels, and the frames at rest have a median of at least 0.3%. All of it stops under calm, in a hidden tab, and after 60 s without input.
6. At 4x CPU the raise's worst frame is 100 ms or less as the target, and 200 ms at most as the hard cap, as in budgets-v2 (round 2: 150 ms).
7. One motion source (#18): the durations and eases come from `content/tokens.json`. Lint fails a literal duration in `src/evf` outside `motion.ts`.
8. One ticker: requestAnimationFrame appears only in `src/evf/gl/engine.ts`, driven by the GSAP ticker. Lint enforces it.
9. main.ts is split into store, input, `hud/`, intro and raise, with one store and no module-level mutable state outside it. The state-machine suite passes unchanged.
10. The film dial uses plain descriptors; "Chrome" is renamed (D-052).
11. A forced quality drop in WebKit keeps a visible frame (#74's lesson).

**Jury rows:** the intro is fully impressive, at rest too (benchmark points 4 and 9); the focus pull and the flick; the photo frame reads as the work; the HUD is legible and original; the blend as a whole.

### The content step (#32; owner plus orchestrator)

- **The owner supplies:** the real name and the one line; which projects, and each one's title, role, year, blurb, body, tools and links; the media, at source resolution; the order; and each award and medal (title, event, placement, year, metal, a photo if they have one, and the project it belongs to, if any).
- **The orchestrator:**
  - writes `content/owner-facts.md` first (TO CONFIRM, then CONFIRMED with the date and how);
  - then the JSON;
  - puts the originals in portfolio-assets `media/<slug>/`;
  - runs `images.mjs` (and ffmpeg for video, a free build tool recorded in deps.md);
  - commits the ladder and `media.json` (D-056);
  - removes the placeholder media entries the real ones replace;
  - runs validate and the byte caps.
- **One content PR per batch.** The owner may send material at any time. A content PR lands between crews, never during a crew's round.
- **No invented facts.** Anything not supplied stays a visible typed placeholder.

### W-V4: floors and performance (#24; also #26, #82, #79's rest)

**Scope:** the floors in docs/agents/north-star.md on real media, the perf pass, meta for sharing, and the 404.

**If no real media has arrived:** the perf rows run on the fixtures, rendered at representative real sizes (phone shots at 1170 × 2532, desktop shots at 2560 × 1440, one 720p loop clip). Those rows are marked "provisional" and re-run in the content PR that brings the media. Go-live does not wait for them.

**Owns:** `src/**` (only while no other W crew is active), `scripts/build/og/**`, `public/*.{ico,svg,png}`, `tests/w-v4/**`.

**Acceptance:**
1. No WebGL: every beat is complete and designed.
2. No JS: every page is complete, and nothing is hidden without JS.
3. WCAG 2.2 AA: axe 0 on every route and state; a keyboard path for every action; forced colours and `prefers-contrast`; the wheel lock applies to the frame only, never to the document; an NVDA transcript of the full path.
4. Reduced motion: an inventory of every motion, each with a live calm path, tested.
5. Phone: the whole site at 390 × 844, 320 × 640 and landscape.
6. Perf: every budgets-v2 row on real media. A clean TBT set (10 runs) on `/` and on the heaviest project. The 4x CPU floors. The media byte caps.
7. Meta: a title and description per page from content; canonical; an OG image per project (1200 × 630, built from its first print); JSON-LD Person only once the name is confirmed. noindex stays on every page with a placeholder. The sitemap follows D-013.
8. A 404 page and favicons in the site's own language. No `[ ]` monogram.
9. `?vf-test` hooks are absent without the parameter.

**Jury (2 rows):** the no-WebGL and calm paths are beautiful, not merely working; the phone composition.

### W-R: hosting (#12)

**Scope:** option A (D-047). It needs the owner's yes to run the fork's publish script once (owner question 3). Without that yes, W-R stops before step 3 and asks again. Nothing is published.

**Acceptance:**
1. The live Pages source is checked (`gh api .../pages`) and recorded.
2. `scripts/release/` builds `dist` with a `build-sha` meta and runs the link check.
3. The fork's `publish.ps1` composes `/` = this `dist`, leaving `/manor/`, `/play/` and `/arcade/` as they are, with a normal push.
4. The live site serves that SHA. Every placeholder page carries noindex. The sitemap excludes them. `/manor/` loads and `/play/` redirects. The root 404 is the portfolio's. 0 broken links. One Lighthouse run on the live site.
5. Rollback is written down: re-run publish with the previous `dist`.

**Jury:** none.

### G3a and go-live hidden from search (D-013)

1. **Pre-G3a perf set** on main: a clean TBT set and the 4x floors, in the owner's quiet window.
2. **The full gate** on main: Chromium, WebKit, phone, calm, no-WebGL and keyboard.
3. **The owner's review** on the preview (:4400), with a one-page checklist: the intro, the raise, every project with its prints and honours, the honours section, contact, the phone and the calm path. The G3a questions follow.
4. **Must-fix:** at most one small crew round (W-V5, cap 1 code round).
5. **Go-live:** W-R publishes. Every page that still holds a placeholder stays noindex and out of the sitemap. Once a page's placeholders are all replaced, a later PR lifts its noindex (D-013).

### After launch
- The owner gives design feedback on the live site (memory: owner-feedback-after-live); collect the small defaults for that review.
- Watchlist #65.
- Lift noindex page by page as content lands.
- Hosting B or D if the owner wants it.
- The game track (the fork, the Manor) resumes only when the owner says so.

## What carries over from main, and what retires

| Area | Keep or adapt | Retire |
|---|---|---|
| Content | `projects.json`, `honours.json`, `profile.json` and `owner-facts.md` (kept; v3 is additive, D-042); `tokens.json` and the generator with its determinism test (adapted: new palette, Manor outputs dropped); `src/lib/content` types and validate (adapted) | `awards.json`, `worlds.json` |
| Build | `scripts/build/images.mjs` (adapted: the ladder, `media.json`); `tokens.mjs`; `astro.config.mjs` (site, static, trailingSlash, sitemap with its noindex filter, the chunk manifest for size-limit, the empty-sitemap fallback; drop the Manor and arcade NEVER_INDEXED paths and the seams hook) | `scripts/build/{glb,posters,fonts}`, `assets-src/3d`, `public/{models,posters,fonts}` |
| Code | Viewfinder's `src/concept` as `src/evf`; the layout's head, noindex switch and skip link (as `Site.astro`) | The whole Darkroom `src` (D-049): stage, gl, sections, components, motion, styles, sound, teststrip, bench pages |
| Checks | deps, lint (adapted), css-lint (adapted), ph-gate, size-limit (re-pointed), tokens-determinism, ownership, astro check, budgets.cjs (schema 2) | stacking; h:spring; the w-c13, w-s1 and w-s2 steps |
| Harness | lib, console, overflow, contrast, content, keyboard, flash; the unit tests of surviving scripts (size-groups, tokens, console-allow, crew-lighthouse, hostload) | drift, gpu, swap, counters, spring; idle (replaced by W-V0b's counters-based check); tests/w-f stage, pregl, fonts and m2; tests/w-c13, w-s1, w-s2 |
| Fleet | `scripts/fleet` (lane, hostload, perfq, waitfor, build-once, cost-line), `crew.mjs`, `serve-dist.mjs`, the lean loop (new evidence root, new extra-pass globs), the issue and PR templates | the `wfm3` and `ws2` config entries (history in git) |
| Docs | PROTOCOL.md, `blocks/*`, `refs/*`, owner-voice, LICENSE, CONTENT-LICENSE, `concepts/viewfinder.md` (add the blend notes) | Archive `docs/direction/{creative-direction,front-door-plan,fx-playbook,darkroom/}` under `docs/direction/archive/` |

**Removing the Darkroom** happens once, in W-V0, after the `darkroom-final` tag and the backup. Git history keeps everything. No crew re-adds a retired path.

## Hosting

- **Today:** the game repo (derprito64bit.github.io) owns Pages. Its `scripts/fork/publish.ps1` (run by hand) composes the root from `../portfolio-site/dist`, plus `/manor/`, `/play/` and `/arcade/`. It also has a manual `web.yml` that deploys through "GitHub Actions" Pages. Which source is live is not yet known.
- **The plan (D-047): option A at go-live.**
- **Needs the owner:** a one-off yes to run the fork's publish script while the fork is paused (question 3). There is no silent default: without a yes, W-R stops and asks again.
- **Does not need the owner:** checking which Pages source is live. The orchestrator reads it with `gh api` (read-only) before W-R. If it is the Actions source, publish.ps1's gh-pages push would not go live; then W-R asks the owner which path to use.
- **After launch, owner calls only:** a repo rename (B), a token secret (C) or a paid domain (D).

## W-F-m3's disposition (D-050)

- **Dropped as a crew.** Its code half fixed the old GL stage, which is deleted.
- **Dropped items:** context-loss items A1 to A3, B, C and D1 to D4; perf rows 40 and 45; S1, S2 and S6; the camera and prints one-off globs; ctxloss-unrestored-develop-blank; m1-prerange-stacking; swup-arrival-prints; view-param-after-back; toggle-height-snap; list-title-offset-d2; webkit-governor-long-walk; home-html-delta; the deferred W-S2 TBT; and, as moot, glbytes-helper-split (the GL cap is retired) and w-s2-probes-outside-tests (the W-S2 tests are retired).
- **Into W-V0:** the console gate (#84) and flash-harness-zero-frame (W-V0a); the home HTML check with a negative control (W-V0a); the engine frame counters (#92) and the idle check, rebuilt on D-053's counters (W-V0b).
- **Into W-V2:** "a lost WebGL context restores to a visible frame, never black".
- **Into the v2 queue, each with a done-when line:** the lint AST check; run-mjs plant fixes; hostload MsMpEng; the reaper nits; the blender_gpu nits (fork, paused).
- **Gate:** mobile TBT on a clean set, at W-V1's approval candidate and before G3a.
- **Docs items (W-V0a):** budgets.md R2 and R4 wording and the HTML byte row are written by the orchestrator in W-V0a, when the Darkroom rows retire. The plan's docs PR (#105) does not change them; the HTML byte row stays marked "Retired at W-V0" until then.

## The queue (#91) disposition

#91 closes with "Superseded by PLAN v2 and the Follow-up queue (v2)". The orchestrator opens "Follow-up queue (v2)". It uses the same rule as before: anything not a must-fix goes there with a done-when line.

| Action | Issues |
|---|---|
| Close, label `status:retired-by-reset`, with a one-line note | #98, #89, #85, #80, #76, #75, #74, #70, #57, #19, #16 |
| Close as merged | #25 into #21 (W-V1 carries hover, press and focus); #15 into #21 |
| Close when the plan lands | #91 (v2 queue); #11 closes with W-V0b's PR |
| Retitle and relabel | #21 "W-V1: open-project view with film prints" (`needs:w-v1`; carries #79 and #78); #22 "W-V2: honours display (Flux award and medal)" (`needs:w-v2`; carries #17, #88 and #52); #20 "W-V3: Viewfinder gallery and frame" (`needs:w-v3`; carries #18); #24 "W-V4: floors and performance" (`needs:w-v4`; carries #26 and #82); #32 "Content step v2" (drop @types/three; awards.json becomes honours.json); #84 and #92 into W-V0 |
| No change | #101 (open until live), #65 (mark GSAP and OGL done), #12 (W-R) |
| Remove stale labels | `needs:W-F`, `needs:W-C13`, `needs:W-C14`, `role:W-F` on re-scoped issues |

## Owner questions, at the right stage

- **Now, with the plan (one message; the "Owner questions" section below):**
  1. confirm budgets-v2;
  2. the real name and the one line;
  3. hosting option A's one-off publish run;
  4. what media to expect, and which project each honour belongs to;
  5. a quiet PC window for the timed sets.
  Questions 1 and 5 matter by W-V1's approval candidate. Questions 2 to 4 can wait until their stage, but early answers save rework. Each has a no-answer default that is an action, never an assumed yes: without a yes to question 1, budgets-v2 stays "proposed" and breaches are reported; without a yes to question 3, W-R stops and asks again.
- **At the content step (material, not questions):** the facts themselves, the order, and the media files. Default: the placeholders stay visible.
- **Asked later, at G3a, with defaults:** approval to go live (default: go-live waits for a yes); whether any page with real content may be indexed yet (default: stay noindex); the default film-dial setting (default: Standard). These do not count against the five now.
- **Retired questions:** the camera and print composition, the strap, the phone opening, the 4.7 s opening trim, the GL budget, the warp location, and hiding Lens and Look. The old design they belonged to is gone.

## Paths and tools
- **Repo:** `C:\Users\Aaron\Documents\GitHub\portfolio-site`. Crew worktrees go in `C:\Users\Aaron\Documents\GitHub\portfolio-site.wt\` (`node scripts/crew.mjs open <id>`).
- **Evidence (private repo):** `C:\Users\Aaron\Documents\GitHub\portfolio-evidence`.
  - `loop-audit/`: the old (pre-lean) template and check.js, kept as history; the review and its scripts;
  - `runs/<crew>/`: launched crew-loop files and their continuations; `specs/<crew>/`: each versioned spec and its meta.json;
  - `runs/`, `research-*`, `status/`;
  - `orchestrator-tools/2026-10-27/`: `round-watch.mjs` (wakes the orchestrator when a round is judged, with its cost line), `judged.mjs` (one round's verdict, rulings, must-fix and queue), `quiet-watch.mjs` (waits for a quiet host); `2026-10-13/` holds the earlier helpers.
- **The lean crew loop:** `scripts/fleet/loop/` (README, `crew-loop.js`, `crew-config.json`, `launch.cjs`, `prior-from-journal.cjs`, `crew-loop.check.cjs`; `--self-test` runs in CI). Shared tools in `scripts/fleet/`: `waitfor.mjs` (waits of 270 s or less), `build-once.mjs` (one build per SHA in `portfolio-site.wt/_builds/`), `perfq.mjs` (the detached perf queue), `cost-line.mjs`.
- **Assets (private repo):** `C:\Users\Aaron\Documents\GitHub\portfolio-assets`, which holds the X-T5 Blender sources and the QC studio.
- **Lanes and host:**
  - `scripts/fleet/lane.ps1` (perf and blender lanes; tools that aren't crews acquire with `-StaleMinutes 100000`);
  - `scripts/fleet/hostload.ps1` (prechecks, budgets R1-R5);
  - `C:\Users\Aaron\Documents\GitHub\project.ion\scripts\fork\reap-browsers.ps1` (`-List` or `-Kill` after workflows).
- **Blender:** GPU only (RX 6700 XT, HIP) through `project.ion\scripts\fork\blender_gpu.py`.
- **Backup:** `python C:\Users\Aaron\Documents\GitHub\portfolio-backup\backup.py`, run at every stage stop.
- **Preview:** `C:\Users\Aaron\Documents\GitHub\portfolio-preview\preview.py`, serving main on :4400 and the newest crew PR on :4401.
  - The direction-reset concepts: `portfolio-preview\concepts_serve.py` (a chooser on :4420; builds on :4421 to :4423 from each concept worktree's `dist/`).
  - The owner wants to watch the build live (memory: owner-watches-build-live), so start it when a crew stage starts.
  - Skip it if the PC is low on memory; it was stopped for that reason on 2026-10-09.
  - It rebuilds only while the perf lane is free.
  - It stayed off during W-S2: the PC had 1.5 GB of 32 GB free.
  - **Private build-log page:** https://claude.ai/artifact/Efsd1kBsB5xQDHRR3gTtdF. Update this artifact (pass it as `url`, read it first) at milestones: crew round end, merge. The source is `portfolio-evidence/buildlog/page.html` plus `make_page.py`, which embeds `media/*.json` shots. Read its comments.

## Standing rules
- **Never SendMessage or TaskStop a workflow's agents**; doing so spawns duplicates. Amend the issue or PR, or relaunch from a continuation.
- **Crews push their own branches.** If a push is refused, the orchestrator pushes it as a fast-forward.
- **Merge** when the PR is approved and `gh pr checks` is green. The owner has granted full git and GitHub permission.
- **Nothing heavy while the perf lane is held.** Reap browsers after every workflow.
- **A ruling reaches a crew agent only if it is posted before that agent starts.** The crew prompt reads Orchestrator comments at its start; a re-read at every checkpoint is a queued tooling fix (#91 comment 6476370307, item a).
- **The owner's to-do list** is `C:\Users\Aaron\.claude\user-todo.md`, and every reply ends with it (global CLAUDE.md).
- **Read-only concept worktrees.** `portfolio-site.wt/concept-*` stay as references until go-live. Crews read Flux's code there (`concept-flux/src/concept/flux/`) and never build into it.
- **No content through innerHTML** (D-055). No retired path comes back (D-049).
- **Placeholders stay visible** until the content step replaces them. Fixture media is generated, labelled and never committed (D-045).
