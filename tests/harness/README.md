# Evidence harness (GES-1, W-D030)

The instruments every W crew and every gate uses. Each one ports a Wave 1b prototype after a read, runs against the
built `dist/` served by `scripts/serve-dist.mjs` (gzip, Pages rules), and prints one line: `<name>: PASS|FAIL  summary`.
`--out file.json` writes the result; `--verbose` prints it. A FAIL exits 1.

- **Browsers.** Chromium is the installed Chrome (`channel: 'chrome'`, new headless, real GPU) on the reference host,
  and Playwright's Chromium in CI (`CI=true`) or with `PW_BUNDLED=1`. WebKit is Playwright's. Audio is muted.
- **GPU.** Numbers that depend on the GPU count only on a real renderer. `SOFTWARE_RENDERER` in `lib.mjs` is the
  regex that makes a run INVALID. Budgets compare only on the reference host (RX 6700 XT).
- **CI.** It runs the GPU-free instruments: content, spring, contrast, `flash --self-test` and `console --fixtures-only`.
- **Profiles and modes.** These are in `lib.mjs`: `PROFILES` (D1, D2, D3, T1, T2, P1, P2, WK-P2, WK-T2, S1, S2, R1,
  Z-D2, Z-P2) and `MODES` (auto, static, reduced). `expectedTier(profile)` gives the tier auto mode must report:
  mouse full (or a logged probe demotion), touch lite.

| npm script | Folder | What it proves | GPU |
|---|---|---|---|
| `h:console` | `console/` | 5 injected faults are caught (throw, rejection, 404, failed request, shader error); routes are clean | fixtures: no |
| `h:overflow` | `overflow/` | max(scrollWidth - clientWidth) over the run is 0, plus an element scan | no |
| `h:drift` | `drift/` | GL stays glued to its DOM slot through a touch fling and an 80 px toolbar change; no buffer reallocation | yes |
| `h:gpu` | `gpu/` | ms per frame of the committed bench, median of 5 fresh loads | yes |
| `h:idle` | `idle/` | main-thread ms per second at rest, with the display rate; 0 ticks and renders | yes |
| `h:swap` | `swap/` | same canvas and context over 6 Swup round trips; counts back at baseline; Back and Forward scroll | yes |
| `h:spring` | `spring/` | every spring at 30, 60 and 144 Hz and with a 50 ms hitch matches the table | no |
| `h:contrast` | `contrast/` | every text pair >= 4.5:1 and every ring pair >= 3:1 from the tokens | no |
| `h:content` | `content/` | Content v2 rules, JsonUtility safety, identity.json flatness, content hashes | no |
| `h:flash` | `flash/` | WCAG 2.3.1 general and red flash analysis (self-test, seeked capture or frames on disk) | capture: yes |
| `h:keyboard` | `keyboard/` | ring coverage at every Tab stop; sheet -> project -> Back focus; hash focus; one-way anchor scroll | yes |
| `h:counters` | `counters/` | gate-owned counters: 0 rAF and 0 draws from 1 to 4 s after input, matching `__stage.stats` | yes |

## Stage hooks the instruments read (`window.__stage`)

- `settled` (boolean): fonts ready, the ticker asleep, no running timeline, and GL off, deferred, ready or failed.
  Shots are taken only after it is true; a 10 s timeout is a FAIL.
- `seek(ms)`: exists only behind `?t=`. It runs one frame on the manual clock and seeks CSS animations.
- `bounds(id)` returns `{ id, kind, slot: {x, y, w, h}, gl: {x, y, w, h, angleDeg} | null }` in viewport CSS px.
- `stats` holds the counters `ticks, draws, drawCalls, measures, measuresInTick, reallocs, wakes, sleeps, swaps,
  losses, restores, governorSteps, motionLogInvalid`, and the gauges `dpr, canvasPx`.
- The remaining hooks are `tier`, `tierReason`, `tierLog`, `motion`, `glState`, `gl` (the GL API once ready, with
  `info()`, `forceContextLoss()` and `forceContextRestore()`), `slots()` and `marks()`.
- The marks are `stage:renderer`, `stage:tier`, `stage:gl-start`, `stage:gl-ready`, `stage:settled` and
  `stage:idle`. Each mark that carries a value also gets a `name=value` twin that Lighthouse's user-timings audit lists.
- `window.__motionLog` is a list of `{id, kind, spring, trigger, t0, t1, from, to, peak, settle2Ms, tier, reduced}`.
  `logMotion()` drops records that break this schema and counts them in `stats.motionLogInvalid`.

## Result schemas

Every result has `schema` (1 unless noted), `instrument` (or `suite`), `pass` and `summary`. The fields that follow are specific to
each instrument.

```text
console   { fixtures: [{fault, caught, expectedChannel, channels[], byExpectedChannel, sample}], caught: "5/5",
            routes: [{profile, route, pass, events, failures[]}], regex }
overflow  { rows: [{profile, mode, route, maxOverflowPx, samples, offenders[], pass}] }
drift     { rows: [{browser, input, toolbarChangePx, frames, samples, maxDriftPx, shiftedSamples, clipTopSamples,
            maxClipTopPx, clipBottomSamples, maxClipBottomPx, clipped[{frame, idx, edge, px}], missing,
            reallocOnHeight, coarse, tier, histogram{driftPx: count}, worst, pass}] }
            (each sample: {idx, cls: glued|clipped|shifted, edge, topErr, bottomErr, drift}; clips are coverage at a
            canvas edge, reported per edge; pass needs no shifted sample)
gpu       { results: [{scenario, profile, loads, renderer, valid, tier, canvas{w,h,px}, dpr, medianOfMediansMs,
            medians[], shader}] }
idle      { displayHz, renderer, rows: [{profile, route, taskMsPerSec, scriptMsPerSec, ticks, renders, pass}] }
swap      { rows: [{profile, trips, baseline{geometries,textures,programs,entities,views}, after{sameCanvas,
            sameContext, swaps, losses, info}, trace[], countsBack, scroll{yBefore,yBack,yProject,yForward,backOk,
            forwardOk}, pass}] }
spring    { rows: [{door:"W", integrator, spring, hz, zeta, rateHz, overshootPct, settle2Ms, maxAbsErr, pass}],
            failures[] }   (rows are spring-conformance.json, the schema shared with the Manor's EditMode test)
contrast  { rows: [{kind:"text"|"ring", use, fg, bg, ratio, need, pass}], drift[], informational{} }
content   { errors[], warnings[], identityFlat, identityProblems[], files{name: sha256}, projects, featured,
            placeholders }
flash     self-test: { rows: [{case, expectPass, analyserPass, generalPerSecond, redPerSecond, correct}] }
          capture/frames: { frames, fps, generalPerSecond, redPerSecond, window{w,h} }
keyboard  { rows: [{profile, walks: [{route, stops, failing[], minCoverage, detail[]}], roundtrip{started,
            afterBack{id,tag}, nextTab, pass}, hash{focus, pass}, anchor{samples, first, last, monotonic, focus,
            pass}, pass}] }
counters  schema 2: { motionEndWindow, rows: [{profile, route, tier, gl{entities, views, ...}, empty,
            idle{gate{raf, rafFromDependencies, draws, clears, rectReadsInRaf}, stage{ticks, drawCalls, renders,
            renderSkips}, ms}, idlePass, afterScroll{input, motionEndsMs, motionEndsBy, frameMs, lastRafAfterMotionMs,
            afterMotion{fromMs, toMs, raf, draws}, afterInput{fromMs, toMs, raf, draws}, scrolledTo, counts{...}}, afterScrollPass, active{...}, matchPass,
            emptyPass, scroll{...}, scrollPass, pass}] }
```

## GES-1 manifest (`scripts/crew.mjs shoot | a11y | lighthouse`)

Each command writes its evidence to `portfolio-evidence/<wave>/<crew>/<sha7>/<crew|gate>/<command>/manifest.json`:

```text
{ schema: 1, track: "W", crew, sha, createdAt, command, failed,
  host: { os, gpuRenderer, graphicsDeviceType, displayHz, cores },
  tools: { chrome, webkit, playwright, lighthouse, axe, node },
  agent: { model, effort },
  items: [{ kind, path, sha256, route, profile, mode, tier, pass, metrics }] }
```

The item kinds are:

- **shoot:** `shot`, `shot-full`, `console` and `page`. A `page` item covers the tier assertion, settled and overflow.
- **a11y:** `axe`, `a11y-tree`, `text-over-gl`, `keyboard-walk`, `text-spacing`, `forced-colors` and `dark`.
- **lighthouse:** `lighthouse-run` and `lighthouse`. The `lighthouse` item is the median by score, valid only when
  `stage:renderer` is a real GPU and `stage:tier` is lite (mobile) or full (desktop).

Any failed item makes the command exit 1. The gate re-runs the same command with `--role gate`.
