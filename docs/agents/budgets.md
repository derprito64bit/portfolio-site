# Budgets (locked in Wave 2)

A change that exceeds a budget fails its gate. Evidence standard: GES-1 (W-D030).

## Site (portfolio-site, `/`)

- **X-T5 camera (D-021, overrides the 3D camera line below):** LOD0 at most 100k tris and 800 kB gz, full tier only, after first paint; LOD1 at most 15k tris and 150 kB gz; Manor LOD about 1.5k tris.

- Lighthouse 13.5.0 under the GES-1 protocol (built dist over gzip, 5 runs, median by score, auto tier, valid only on a real renderer and under Measurement validity R1-R5 below): performance >= 90 mobile and >= 95 desktop; accessibility 100; best practices >= 95. SEO is not gated while noindex is on.
- LCP <= 2.5 s mobile and <= 2.0 s desktop. The LCP element is the h1 on mouse profiles, or the h1 or print 1's still on touch profiles. CLS <= 0.02. TBT <= 150 ms, mobile and desktop.
- JS: pre-GL JS <= 35 kB gz, summed from the network log before the stage:gl-start mark. GL chunk (three, addons, anime, stage GL, effects) <= 185 kB gz. Effects <= 10 kB gz (6.0 measured; `docs/direction/fx-playbook.md` section 6 books 9.2 kB with D-025's effects, estimate).
- Fonts <= 100 kB woff2 (96.8 planned); preloaded <= 46 kB.
- 3D: camera LOD0 <= 30k tris and <= 250 kB gz; LOD1 <= 5k and <= 60 kB gz; Manor LOD <= 1.5k tris; cartridge <= 1.5k and 20 kB gz; loupe <= 3k and 40 kB gz; gear <= 4k and 40 kB gz; an owner work model <= 50k and 1 MB gz, on its own project only. 3D per page <= 1.5 MB gz.
- Canvas: <= 4.5 Mpx on full and <= 1.5 Mpx on lite (effective DPR lowered to fit); DPR caps 2 and 1.5.
- Print stills: sheet 512 px long edge, enlargements and hero 1024 px, AVIF with WebP fallback; home images <= 600 kB on the first scroll-through (estimate until real images).
- GPU worst moment (8 wet sheet prints): <= 4 ms per frame on the reference integrated GPU at the tier the rules give it. Until it is measured: a reference-host median x 30 <= 4 ms passes; passing only at x 10 is 'at risk' and goes to the owner. A real number comes from /bench/. Crews stay <= 1.5x the prototype median, with no regression over 20% against gpu-baseline.json.
- Idle: 0 rAF callbacks and 0 draws from 1 s to 4 s after the last input, from gate-owned counters; idle main thread <= 1 ms/s, reported with the display Hz.
- Hero (D-024): on the full tier's first visit of the session, the X-T5 drawing develops into the camera before the eject, so hero:readable minus stage:gl-ready <= 3300 ms (median of 3 cold loads; the drawing holds the slot from FCP). The 3300 ms includes loading and decoding the camera's LOD0 and compiling its patched programs (8 on m1; one per `cam_*` material on m2), which may finish after stage:gl-ready: T0 waits for them (T0 is the later of the two, defined in the plan's W-D012), and W-C14 re-measures on the m2 GLB (D-021). With GL delayed 3 s, a developed print 1 is visible by FCP + 2.6 s: it appears when the FCP + 2.5 s guard fires, not at the end of the drawing's crossfade. No automatic motion over 5 s: the whole hero sequence, drawing included, is under 5000 ms with every phase in `__motionLog`.
- Input blocking: 0 ms, except the Swup out phase (<= 160 ms). (D-023: the 720 ms handoff is cut; Play is a plain link.)
- Layout: overflow 0 px as the maximum over the run, at every profile and mode. No clipped text under text spacing, at 200% zoom or at 320 px. Targets >= 44x44 px (shared floor with the Manor: 24 px). Text >= 12 px. Contact within 5.0 screens at 390x844.
- Drift: 0 px misplaced prints under wheel, touch and keys in Chromium and WebKit, including an 80 px toolbar collapse mid-fling.
- Accessibility: axe 0 violations of any impact on WCAG tags (shared floor: 0 serious or critical). Focus ring >= 3:1 with >= 90% ring coverage at every Tab stop. WCAG 2.3.1 flash analysis passes. Every motion has a reduced path that is live.
- Sound: 0 bytes until opt-in, then <= 16 kB.
- Process: every crew, gate and review agent runs on Opus 5.5 at effort xhigh (W-D001).

### Measurement validity (R1-R5)

These rules cover every timed or frame-count number a verdict rests on: Lighthouse scores, LCP, TBT and CLS, the hero's readable time, GPU ms, frame pacing, frame tails, drift and eject frames. Byte sizes and triangle counts are not timed. Only the perf gate, or a crew in its final evidence step, takes these numbers, and never while another heavy job runs (PROTOCOL section 9). The thresholds live in the `host` key of the block below, with how they were calibrated.

- **R1, precheck.** No timed set starts without a passing precheck. Take the perf lane, then the blender lane (`scripts/fleet/lane.ps1 acquire perf -Agent <id> -TimeoutMinutes 45`, the same for `blender`; renew both every 20 minutes), then run `scripts/fleet/hostload.ps1 -Out <evidence>\hostload-<step>.json`. Exit 0 lets the set start. Exit 75 (busy; `incomplete` or `no-data` when samples are missing; or `uncalibrated` while the host key's thresholds are null) means wait and check again for up to 30 minutes. After that, or when a lane times out, the row is blocked (host) with the JSON, never pass or fail. Each set also keeps the `hostload.ps1 -Watch <pid>` file of its run.
- **R2, host-suspect runs.** Every Lighthouse run records `lhr.environment.benchmarkIndex`. A run is host-suspect when its benchmarkIndex is below the host key's `suspectBelowRatio` times the calibrated baseline, or when its `-Watch` file does not exit 0 (it flagged a process outside the allowlist, part of the run was not watched, or samples were missing). A timed fail counts only on a clean set, one with no host-suspect run left in it.
- **R3, replace, never average.** A host-suspect run is replaced by a new run, at most 5 extra runs per set, and each replacement is listed with its reason. It is never averaged in or kept beside the clean runs. A set that cannot reach its run count with clean runs (5 for Lighthouse, 3 cold loads for the hero) is blocked (host).
- **R4, a rerun is a whole new set.** A fail on a clean set stands. A rerun is a whole new set after a fresh precheck, and both sets are reported.
- **R5, near a budget, 10 runs.** When a set's median is at or above 85% of a maximum budget, or any clean run is past its budget (above a maximum or below a minimum), the set grows to 10 runs after a fresh precheck. Report the median of all 10, the worst run and the count past budget.

### Machine-readable (site)

Tests read this block instead of parsing the sentences above (requested in the W-S1 round-2 review). The sentences stay the human source; any change edits both in the same PR.

```json budgets
{
  "schema": 1,
  "note": "Mirrors the Site sentences and the Measurement validity rules above, plus W-D012's head-script size and the W-S1 brief's poster parity in docs/direction/front-door-plan.md; those prose sources stay the human source, and a change edits both in the same PR. Units are in the key names. Minimums (>=): site.lighthouse.*, site.focusRing.*, site.layout.targetMinPx, site.layout.sharedTargetFloorPx and site.layout.textMinPx. *StrictMax is <. Every other number is a <= limit, except these parameters: site.protocol.*, site.stillsPx.*, site.idle.windowStartS and windowEndS, site.gpu.hostMedianFactor and atRiskFactor, site.hero.delayGlMs and guardAfterFcpMs, and host.* other than its *Max keys. Strings are labels. Each budget has one key: zero overflow is site.layout.overflowPx.",
  "site": {
    "lighthouse": {
      "perfMobileMin": 90,
      "perfDesktopMin": 95,
      "a11yMin": 100,
      "bestPracticesMin": 95
    },
    "lcpMs": {
      "mobile": 2500,
      "desktop": 2000
    },
    "clsMax": 0.02,
    "tbtMs": 150,
    "preGlJsKbGz": 35,
    "glChunkKbGz": 185,
    "effectsKbGz": 10,
    "fontsKbWoff2": 100,
    "fontsPreloadKb": 46,
    "camera": {
      "lod0Tris": 100000,
      "lod0KbGz": 800,
      "lod1Tris": 15000,
      "lod1KbGz": 150,
      "manorLodTris": 1500
    },
    "models": {
      "cartridge": {
        "tris": 1500,
        "kbGz": 20
      },
      "loupe": {
        "tris": 3000,
        "kbGz": 40
      },
      "gear": {
        "tris": 4000,
        "kbGz": 40
      },
      "ownerWork": {
        "tris": 50000,
        "kbGz": 1000,
        "scope": "on its own project only"
      }
    },
    "threeDPerPageKbGz": 1500,
    "canvasMpx": {
      "full": 4.5,
      "lite": 1.5
    },
    "dprCap": {
      "full": 2,
      "lite": 1.5
    },
    "stillsPx": {
      "sheetLongEdge": 512,
      "enlargementAndHero": 1024
    },
    "homeImagesFirstScrollKb": 600,
    "gpu": {
      "worstMomentMs": 4,
      "hostMedianFactor": 30,
      "atRiskFactor": 10,
      "crewRatioMax": 1.5,
      "regressionMaxPct": 20
    },
    "idle": {
      "windowStartS": 1,
      "windowEndS": 4,
      "mainThreadMsPerS": 1
    },
    "hero": {
      "readableAfterGlReadyMs": 3300,
      "delayGlMs": 3000,
      "print1VisibleAfterFcpMs": 2600,
      "guardAfterFcpMs": 2500,
      "motionCapMs": 5000,
      "posterParityMax255": 4,
      "headScriptKbStrictMax": 0.8
    },
    "inputBlocking": {
      "swupOutMs": 160
    },
    "layout": {
      "overflowPx": 0,
      "targetMinPx": 44,
      "sharedTargetFloorPx": 24,
      "textMinPx": 12,
      "contactWithinScreensAt390x844": 5.0
    },
    "focusRing": {
      "contrastMin": 3,
      "coverageMinPct": 90
    },
    "soundKbAfterOptIn": 16,
    "zero": {
      "idleRafCallbacks": 0,
      "idleDraws": 0,
      "inputBlockingMsOutsideSwupOut": 0,
      "driftPx": 0,
      "axeViolationsWcag": 0,
      "sharedFloorAxeSeriousOrCritical": 0,
      "soundBytesBeforeOptIn": 0
    },
    "protocol": {
      "lighthouseVersion": "13.5.0",
      "lighthouseRuns": 5,
      "heroColdLoadsMedianOf": 3,
      "gpuWorstMomentWetSheetPrints": 8,
      "driftToolbarCollapsePx": 80,
      "noClippedTextZoomPct": 200,
      "noClippedTextWidthPx": 320
    }
  },
  "host": {
    "calibrated": null,
    "calibration": "Not calibrated yet: the thresholds are null, so scripts/fleet/hostload.ps1 exits 75 'uncalibrated', which counts as blocked (host). The orchestrator calibrates under the operating baseline: the orchestrator session with its needs:orchestrator Monitor and the watchdog alive, no other agents, no Blender or Unity, starting 10 minutes after an npm ci. Take hostload.ps1 -Samples 60 three times, and 5 Lighthouse runs each watched by hostload.ps1 -Watch. precheck.cpuBusyPctMax and gpu3dPctMax = the p95 of the 10-second window medians (precheck.stat) plus a margin; benchmarkIndex.baseline = the median benchmarkIndex of the 5 runs; watch.allowlist = the process names those -Watch files show outside each run's own tree, never the antivirus (MsMpEng: wait for its scan to settle instead); watch.foreignCpuPctMax is set with them. Record the date, the conditions and the margins in calibrated.",
    "precheck": {
      "samples": 10,
      "stat": "median",
      "cpuBusyPctMax": null,
      "gpu3dPctMax": null
    },
    "watch": {
      "foreignCpuPctMax": null,
      "allowlist": null
    },
    "benchmarkIndex": {
      "baseline": null,
      "suspectBelowRatio": 0.9
    },
    "rules": {
      "extraRunsPerSetMax": 5,
      "nearBudgetPct": 85,
      "nearBudgetRuns": 10
    }
  }
}
```

## Game (the Manor, in the Manor repo)

- Hard limits per zone (frozen, ArtPlayTests): at most 120 batches and 60,000 tris. Batches here count audited MeshRenderers plus world-space Canvases; the M-QA guard adds the canvases.
- pf.foyer: cap 85 / 24k, at most 8 registered lights (plan: 4). Measured 73 / 18,664 today with 2 pods and 6 canvases. Estimate after this plan: about 62 mesh batches + 6 canvases.
- pf.gallery: cap 80 / 44k, at most 8 lights (plan: 5). Measured 63 / 40,292 today with 11 canvases. Estimate: about 55 mesh batches + 15 canvases; about 36k tris (m-red-detail projection).
- pf.honours: cap 90 / 45k, at most 8 lights (plan: 4). Estimate only. Medal devices take at most 2 Mats each.
- pf.lens (Camera Room): cap 85 / 40k, at most 8 lights (plan: 3). Pickups take at most 2 Mats each. Estimate only.
- pf.wing: cap 55 / 25k, at most 8 lights (plan: 2, cool). Estimate only.
- pf.workshop: cap 75 / 30k, at most 4 light candidates. Estimate about 50 / 15k (WS-D08).
- pf.study: cap 60 / 20k, at most 3 light candidates. Estimate about 38 / 10.5k (WS-D08).
- pw.starry (G): at most 90 batches / 20k tris and 4 lights (G-D011).
- Per hero: authored at most 8,000 tris and 4 batches with no Ultra twins. Code fallback: DECA 4 / 850, gantry 4 / 2.5k, camera 2 / 2.1k, robot 2 / 1.4k. X-T5 viewmodel at most 2,500 tris, outside zone budgets.
- Per door: padless, 0 device batches, 1 lintel canvas (the Foyer's side doors carry 2). A door print adds 1 PrintCard batch to its source room. The replica sets total at most 4k tris in the Gallery diorama (est.; verify they are not audited).
- Ultra-only detail: Brass/Gilt costs +1 batch once per zone and Trim +0. Ultra twins count on every tier, so they never count as budget relief.
- Each new Mat in a zone costs +1 batch: Gilt, Marble, Velvet (net 0 only as a full TextileRed swap), Flame, Silver.
- GPU: pools on vs pools off on Low must stay within 1.0 ms at 1080p, otherwise Low falls back to emissive flames only. Every Place stays within 25 ms (art bible).
- Routes at 4.5 m/s (M-QA): fast path (Foyer, Gallery bay 1, the Workshop print, the Workshop inlay) within 60 s, modelled at 34 s. Everything path (Study bureau, 8 frames, Workshop, Hall at maximum, Camera Room) within 180 s, modelled at 145 s.
- Download: the first Manor visit measures 18.0 MB (gzip); up/web-diet saves about 2.8 MB raw. Each authored hero FBX is 2 MB or less in the repo, about 0.6 MB or less in Web.data (est.).
- Boot: +2 diorama captures for the door prints. Streaming target: a Lazy room's first build within 300 ms, hard cap 500 ms.
