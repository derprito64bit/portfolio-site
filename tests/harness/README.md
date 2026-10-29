# Evidence harness (GES-1, W-D030; re-pointed at the Viewfinder by W-V0a)

The instruments every crew and every gate uses. Each one runs against the built `dist/` served by
`scripts/serve-dist.mjs` (gzip, Pages rules), and prints one line: `<name>: PASS|FAIL  summary`.
`--out file.json` writes the result; `--verbose` prints it. A FAIL exits 1.

The Darkroom's instruments (drift, gpu, swap, counters, spring, idle) are retired with their code (D-049). The idle check
is rebuilt (W-V0b) on the engine's own frame counters, which exist only behind `?vf-test` (D-055).

- **The test API (D-055).** `window.__vf` and `window.__vfEngine` attach only when the URL has `?vf-test` (read once at
  boot, `src/evf/testhooks.ts`, the one file lint lets name them). Without it there is no global and no stats object, and
  the engine does no counting. `__vf` is `{ go, openProject, closeProject, lower, raise, setSim, state, pos, stats,
  resetStats }`. `stats()` returns `{ frames, scene, composite, eyepiece, readback, ms, engine }`: the draws of each
  pass since the last `resetStats()` (counted at the draw call, so a skipped pass counts 0), the frames that reached the
  screen, the window in ms, and whether the WebGL engine exists (false on the flat-frame path, where every count is 0).
  Channels: `scene` (the frame's scene into its target), `composite` (the graded frame to the screen), `eyepiece` (the
  raise and the lower), `readback` (the 64 x 40 metering render). Each is at most one draw per presented frame, and
  composite and eyepiece never share a frame (the smoke asserts both). Read it from a gate:
  `page.goto(base + '/?vf-test')`, then `page.evaluate(() => window.__vf.stats())`.

- **Browsers.** Chromium is the installed Chrome (`channel: 'chrome'`, new headless, real GPU) on the reference host,
  and Playwright's Chromium in CI (`CI=true`) or with `PW_BUNDLED=1`. WebKit is Playwright's. Audio is muted.
- **Ready.** `waitSettled` in `lib.mjs` waits for the preloader to finish (`html` loses `is-loading`).
- **CI.** All six checks run on `/`: console, overflow at 320 px, contrast, keyboard, flash, axe (`.github/workflows/check.yml`).
  CI has no GPU and software GL renders the engine at 1 to 4 fps at D2, so the instruments that drive the page run with
  `H_NO3D=1` (Chromium `--disable-3d-apis`: the page's flat-frame path, every state reachable). The console gate also
  loads `/` with WebGL in CI. On the reference host, run them without `H_NO3D`. W-V0b's checks run in CI with GL at the
  small profile G1 (640 x 400, DPR 1, where software GL keeps up), and the smoke runs on the flat-frame path too. The
  reference host's runs (GL at D2, the real GPU) are the record: `npm run test:smoke`, `npm run h:idle`.
- **Paths.** `H_NO3D=1` is the flat-frame path in Chromium (`--disable-3d-apis`); WebKit gets it from `NO_WEBGL_INIT`
  (an init script in `lib.mjs` that refuses WebGL contexts). `SMOKE_FLAT=webkit` runs only that engine flat.
  `PW_BUNDLED=1 H_SWGL=1` reproduces CI's software GL (SwiftShader) on the reference host.
- **Hidden tabs.** Headless Chromium reports every page visible (it only throttles a background page's frames), so a
  hidden tab is emulated (`setHidden` in `lib.mjs`: `document.hidden`, `visibilityState` and the `visibilitychange`
  event), in both engines. The engine reads `document.hidden` itself, so this tests its own stop.
- **The console gate** (`consoleGate` in `lib.mjs`, W-D030). Error-level messages (`error` and `assert`), page errors,
  failed requests, unexpected statuses and any message with a W-D030 word (`GL_INVALID*`, `CONTEXT_LOST*`) fail. A
  warning passes only when every line of it passes an entry of `console-allow.json`.
- **The allowlist is reviewed.** Every new entry in `console-allow.json` needs a regex, a reason, who added it, an
  expiry, a literal (at least 10 characters with a digit) and one real example. `loadAllowlist` rejects a malformed
  or broad entry, but it cannot judge intent: an entry lands only in a reviewed PR.
- **Profiles and modes.** `PROFILES` (D1, D2, D3, T1, T2, P1, P2, WK-P2, WK-T2, S1, S2, R1 at 320 px, Z-D2, Z-P2) and
  `MODES` (auto, reduced) are in `lib.mjs`.

| npm script | Folder | What it proves |
|---|---|---|
| `h:console` | `console/` | 8 injected faults are caught (throw, rejection, 404, failed request, shader error, console.assert, CONTEXT_LOST, GL_INVALID); `/` is clean through raise, frames, open and close, and `/404.html` is clean |
| `h:overflow` | `overflow/` | max(scrollWidth - clientWidth) is 0 at the profiles run (CI: R1 320 px, P2, D2), plus a scan of the loaded page for boxes past the right edge; boxes the raised EVF puts past the edge are listed as `evfOffenders` |
| `h:contrast` | `contrast/` | every text pair >= 4.5:1 and the focus ring >= 3:1, read from `src/evf/style.css` |
| `h:content` | `content/` | Content v2 rules and the content hashes |
| `h:flash` | `flash/` | WCAG 2.3.1 general and red flash analysis. `--self-test` (known sequences, an empty capture fails); `--url /` captures the raise under Playwright's fake clock |
| `h:keyboard` | `keyboard/` | ring coverage at every Tab stop (a custom indicator counts when it changes pixels at ring contrast); Enter raises; Enter opens the project; Tab stays in the dialog; Escape returns focus to the EVF |
| `h:axe` | `axe/` | axe on the WCAG tags: 0 violations in the intro, the raised EVF, the open project and the 404 page |
| `h:idle` | `idle/` | the engine's frame rate per channel at rest (the intro from its idle marker; the EVF at frame 1, 2 s after the raise), with the tab hidden and under reduced motion; `document.getAnimations()` at each window; in Chromium a trace of the same window (rAF callbacks, paints, main-thread ms per second) and the cross-check that the engine never counts more frames than rAF callbacks (#92). Asserts `thresholds.json` "assert" (what the build met in W-V0b); reports D-053's targets ("d053") for W-V3. `--plant hot` is its negative control (it must FAIL) |
| `test:smoke` | `../smoke/` | Playwright test (`playwright.config.ts`), Chromium and WebKit: the state machine (boot, intro, raise, frame 3, open, close, honours, contact, lower; state, pos, the transitional state and the counters per step; 0 console errors) and the D-055 gating (no `__vf*` global on plain `/`, the API under `?vf-test`, a planted global is seen). The JSON report goes to `SMOKE_JSON` (default `test-results/smoke.json`) |
| `test:unit` | `../unit/` | GPU-free: D-055 both ways on `src/evf/testhooks.ts` with four mutants that must fail; the idle check's rules |

## Result schemas

Every result has `schema`, `instrument`, `pass` and `summary`. Per instrument:

```text
console   { fixtures: [{fault, caught, expectedChannel, channels[], byExpectedChannel, sample}], caught: "8/8",
            routes: [{profile, route, pass, events, failures[]}], regex }
overflow  { rows: [{profile, mode, route, maxOverflowPx, samples, offenders[], evfOffenders[], pass}] }
contrast  { rows: [{kind:"text"|"ring", use, fg, bg, ratio, need, pass}] }
content   { errors[], warnings[], files{name: sha256}, projects, featured, placeholders }
flash     self-test: { rows: [{case, expectPass, analyserPass, generalPerSecond, redPerSecond, correct}] }
          capture/frames: { frames, fps, generalPerSecond, redPerSecond, window{w,h}, empty? }
keyboard  { rows: [{profile, viewfinder{intro, evf, raised, openFocusInDialog, trapped, closed, focusAfterClose, pass},
            notFound{stops, failing[]}, pass}] }
axe       { tags[], rows: [{state, violations[{id, impact, nodes[]}], incomplete[], passes}] }
idle      { profile, windowSec, flat, thresholds, rows: [{browser, mode, segment, state, pos, engine, seconds,
            counts{frames, scene, composite, eyepiece, readback}, fps{...}, animations{running, infinite[]},
            trace{seconds, rafCallbacks, rafPerSec, paints, paintsPerSec, mainThreadMsPerSec} | null, pass, failures[],
            d053{meets, misses[]}}], consoleFailures[], d053{meets, misses[]} }
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

Any failed item makes the command exit 1. The gate re-runs the same command with `--role gate`. `crew.mjs shoot` and
`a11y` still carry Darkroom-era steps (GL slots, the stage hook); crews re-point them as their stages need.
