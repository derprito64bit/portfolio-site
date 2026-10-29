# Budgets (locked in Wave 2)

A change that exceeds a budget fails its gate. Evidence standard: GES-1 (W-D030).

**Direction reset (D-037, owner 2026-10-28):** concept prototypes are not bound by the byte, GL or camera budgets below. They are judged on design, smoothness and accessibility. The budgets are re-set with the owner for the chosen concept; the measurement rules (R1 to R5) stay.

All dates and times in this file are UTC, except a time written with its own offset (the host calibration's -04:00 times) and that calibration's date, 2026-10-04, which is the host's local date (2026-10-05 UTC).

## Site (portfolio-site, `/`)

- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** **X-T5 camera (D-021, overrides the 3D camera line below):** LOD0 at most 100k tris and 800 kB gz, full tier only, after first paint; LOD1 at most 15k tris and 150 kB gz; Manor LOD about 1.5k tris.

- Lighthouse 13.5.0 under the GES-1 protocol (built dist over gzip, 5 runs, median by score, auto tier, valid only on a real renderer and under Measurement validity R1-R5 below): performance >= 90 mobile and >= 95 desktop; accessibility 100; best practices >= 95. SEO is not gated while noindex is on.
- LCP <= 2.5 s mobile and <= 2.0 s desktop. The LCP element is the h1 on mouse profiles, or the h1 or print 1's still on touch profiles. On `/work/<slug>/` pages it is the h1 or the dock print's still (`data-lcp="dock"`), on mouse and touch profiles (orchestrator ruling 9 on #15, comment 5995441183, W-S3 day one, 2026-10-05). CLS <= 0.02. TBT <= 150 ms, mobile and desktop.
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** JS: pre-GL JS <= 35 kB gz, summed from the network log before the stage:gl-start mark. GL chunk (three, addons, anime, stage GL, effects) <= 187.6 kB gz (raised 2026-10-06, owner D-027; raised 2026-10-28, owner D-035). Effects <= 10 kB gz (6.0 measured; `docs/direction/fx-playbook.md` section 6 books 9.2 kB with D-025's effects, estimate).
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** HTML: home `/` HTML at most 14,600 B on the wire (gzip body plus headers, as `serve-dist` sends it), so it fits TCP's first congestion window. Information-level until W-F-m3 adds its build or pre-GL check (with a negative control); Lighthouse mobile stays the judged row. (orchestrator ruling on #11, comment 6055373919, item 2, 2026-10-08)
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** Fonts <= 100 kB woff2 (96.8 planned); preloaded <= 46 kB.
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** 3D: camera LOD0 <= 30k tris and <= 250 kB gz; LOD1 <= 5k and <= 60 kB gz; Manor LOD <= 1.5k tris; cartridge <= 1.5k and 20 kB gz; loupe <= 3k and 40 kB gz; gear <= 4k and 40 kB gz; an owner work model <= 50k and 1 MB gz, on its own project only. 3D per page <= 1.5 MB gz.
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** Canvas: <= 4.5 Mpx on full and <= 1.5 Mpx on lite (effective DPR lowered to fit); DPR caps 2 and 1.5.
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** Print stills: sheet 512 px long edge, enlargements and hero 1024 px, AVIF with WebP fallback; home images <= 600 kB on the first scroll-through (estimate until real images).
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** GPU worst moment (8 wet sheet prints): <= 4 ms per frame on the reference integrated GPU at the tier the rules give it. Until it is measured: a reference-host median x 30 <= 4 ms passes; passing only at x 10 is 'at risk' and goes to the owner. (D-028, owner, 2026-10-06: 'at risk' is owner-accepted for W-S2 only. On a clean set, W-S2's 'at risk' row is recorded as accepted 'at risk' (owner, D-028) and does not block its approval or merge; pass, fail, the 1.5x ratio and the 20% rule are unchanged, and the 4 ms budget stands. #82 tracks the optimization pass.) For W-S2's GPU worst moment (#14), GPU ms is GPU-only time from EXT_disjoint_timer_query_webgl2, by #14's measurement ruling (comment 5996745925): W-S2's real frame at its worst moment (the canvas window with the most wet-print slot area, worst of 5 develop times played forward at 1000/60 ms), captured and replayed back to back after a fixed stand-in ramp, median of 60 frames, median of 10 loads, with a three-plant control each round; its ratio against the stand-in subtracts the frame's shared work. 'The lite cap' in #14 L8 is the reference laptop (1366x768, DPR 1) at ?tier=lite; this names the configuration L8 judges and does not define 'the tier the rules give it'. There, and in W-S2's ratio and regression check, a readPixels-fenced or rAF-paced figure is continuity only. Another crew's GPU rows follow this only when its brief cites the comment. A real number comes from /bench/. Crews stay <= 1.5x the prototype median, with no regression over 20% against gpu-baseline.json.
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** Idle: 0 rAF callbacks and 0 draws from 1 s to 4 s after the last input, from gate-owned counters; idle main thread <= 1 ms/s, reported with the display Hz. (amended 2026-10-05, orchestrator ruling on #11, comment 5992928262, W-F-m2 round 1) The idle window counts from the motion end, not from the last input. The motion end is the later of the last input event (scroll, wheel, pointer or key) and the last frame the stage presents; every presented frame counts, including present-tail frames and clear-only frames, and gate-owned counters count them toward the motion end. From motion end + 1 s + 2 frame intervals to motion end + 4 s there are 0 rAF callbacks and 0 draws. The motion end must fall within 4 s of the last input: a motion still presenting frames 4 s after the last input fails, so a loop that never goes idle cannot pass by never ending. A layout-only render with no input (a late font swap or a lazy image) is a motion: its frames, tail included, set a new motion end, and the window restarts from it. W-D002's 1 s detach is unchanged, and the machine-readable keys keep their values (see site.idle.note below). (amended 2026-10-07, orchestrator rulings on #11, comments 6030949628 and 6031879782, W-F-m2 rounds 3 and 4) An arrival anchors the window as an input does. An arrival is a full load, a history traversal (Back or Forward), a bfcache restore or a Swup visit's end, and the motion end is the later of the last input or arrival and the last presented frame. A wake after an arrival that presents nothing falls in the window and fails it. The window opens at motion end + 1 s + max(2 frame intervals, 34 ms) and closes at motion end + 4 s, so its tolerance does not depend on the refresh rate: 34 ms is 2 frames at 60 Hz, and 2 frames at 238 Hz (8.4 ms) are inside ordinary timer and frame jitter. A single callback inside the tolerance, with 0 draws, is the 1 s detach itself; any callback after it, or any draw in the window, fails. The 4 s bound counts from user input only: after an input (scroll, wheel, pointer or key) the motion end must fall within 4 s of it, as before. After an arrival there is no 4 s bound: the window counts from the last presented frame, so a designed motion such as W-S1's opening on a plain load of `/` (its last presented frame at about 5.4 s, D-024) is a motion, not idle cost. A motion that never ends still fails, at the harness's hard stop of 2 x windowEndS + 1 s after the anchor (9 s). The arrival rows may use `/` with no hash as well as `/#contact`. Gate-owned counters apply max(2 frame intervals, site.idle.windowToleranceMinMs), with negative controls: a callback planted at motion end + 1 s + 40 ms fails, and so does a wake after an arrival that presents nothing. windowStartS and windowEndS keep their values, and site.idle.windowToleranceMinMs (34) carries the tolerance's floor.
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** Hero (D-024): on the full tier's first visit of the session, the X-T5 drawing develops into the camera before the eject, so hero:readable minus stage:gl-ready <= 3300 ms (median of 3 cold loads; the drawing holds the slot from FCP). The 3300 ms includes loading and decoding the camera's LOD0 and compiling its patched programs (8 on m1; one per `cam_*` material on m2), which may finish after stage:gl-ready: T0 waits for them (T0 is the later of the two, defined in the plan's W-D012), and W-C14 re-measures on the m2 GLB (D-021). With GL delayed 3 s, a developed print 1 is visible by FCP + 2.6 s: it appears when the FCP + 2.5 s guard fires, not at the end of the drawing's crossfade. No automatic motion over 5 s: the whole hero sequence, drawing included, is under 5000 ms with every phase in `__motionLog`.
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** Input blocking: 0 ms, except the Swup out phase (<= 160 ms). (D-023: the 720 ms handoff is cut; Play is a plain link.)
- Layout: overflow 0 px as the maximum over the run, at every profile and mode. No clipped text under text spacing, at 200% zoom or at 320 px. Targets >= 44x44 px (shared floor with the Manor: 24 px). Text >= 12 px. Contact within 5.0 screens at 390x844.
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** Drift: 0 px misplaced prints under wheel, touch and keys in Chromium and WebKit, including an 80 px toolbar collapse mid-fling.
- Accessibility: axe 0 violations of any impact on WCAG tags (shared floor: 0 serious or critical). Focus ring >= 3:1 with >= 90% ring coverage at every Tab stop. WCAG 2.3.1 flash analysis passes. Every motion has a reduced path that is live.
- **Retired at W-V0 (D-048; replaced by the budgets-v2 section below):** Sound: 0 bytes until opt-in, then <= 16 kB.
- Process: every crew, gate and review agent runs on Opus 5.5 at effort xhigh (W-D001).

### Measurement validity (R1-R5)

These rules cover every timed or frame-count number a verdict rests on: Lighthouse scores, LCP, TBT and CLS, the hero's readable time, GPU ms, frame pacing, frame tails, drift and eject frames. Byte sizes and triangle counts are not timed. Only the perf gate, or a crew in its final evidence step, takes these numbers, and never while another heavy job runs (PROTOCOL section 9). The thresholds live in the `host` key of the block below, with how they were calibrated.

- **R1, precheck.** No timed set starts without a passing precheck. Take the perf lane, then the blender lane (`scripts/fleet/lane.ps1 acquire perf -Agent <id>`, which waits at most 4 minutes under the 270 s wait rule and is called again on exit 75; the same for `blender`; renew both every 20 minutes), then run `scripts/fleet/hostload.ps1 -Out <evidence>\hostload-<step>.json`. Exit 0 lets the set start. Exit 75 (busy; `incomplete` or `no-data` when samples are missing; or `uncalibrated` while the host key's thresholds are null) means wait and check again for up to 30 minutes. After that, or when a lane times out, the row is blocked (host) with the JSON, never pass or fail. Each set also keeps the `hostload.ps1 -Watch <pid>` file of its run.
- **R2, host-suspect runs.** Every Lighthouse run records `lhr.environment.benchmarkIndex`. A run is host-suspect when its benchmarkIndex is below the host key's `suspectBelowRatio` times the calibrated baseline, or when its `-Watch` file does not exit 0 (it flagged a process outside the allowlist, part of the run was not watched, or samples were missing). A timed fail counts only on a clean set, one with no host-suspect run left in it. A timed run is also host-suspect when the summed GPU 3D load of all other processes during the run (read per process, so the run's own process tree is excluded) has a median above `host.precheck.gpu3dPctMax` (6.8%); like any host-suspect run it is replaced, never averaged (R3). `hostload.ps1 -Watch` applies it (the tooling PR for #91, slot 2): its JSON's foreignGpu3d block records the per-sample sums and their median, and a median over the bar gives the verdict gpu-foreign (exit 75), so `crew.mjs lighthouse` and `perfq.mjs` treat that run as host-suspect. (amended 2026-10-10, orchestrator ruling on #11, comment 6097618109, item 4)
- **R3, replace, never average.** A host-suspect run is replaced by a new run, at most 5 extra runs per set, and each replacement is listed with its reason. It is never averaged in or kept beside the clean runs. A set that cannot reach its run count with clean runs (5 for Lighthouse, 3 cold loads for the hero) is blocked (host).
- **R4, a rerun is a whole new set.** A fail on a clean set stands. A rerun is a whole new set after a fresh precheck, and both sets are reported. `host.clean` is judged on the sets behind verdicts: a superseded set stays listed with its reason, but does not set clean false. (amended 2026-10-13, orchestrator ruling on #11, comment 6144848501, item 6)
- **R5, near a budget, 10 runs.** When a set's median is at or above 85% of a maximum budget, or any clean run is past its budget (above a maximum or below a minimum), the set grows to 10 runs after a fresh precheck. Report the median of all 10, the worst run and the count past budget.

### Machine-readable (site)

Tests read this block instead of parsing the sentences above (requested in the W-S1 round-2 review). The sentences stay the human source; any change edits both in the same PR.

```json budgets
{
  "schema": 2,
  "note": "Schema 2 (W-V0a, D-048): the site block is the budgets-v2 caps. Readers: size-limit, media-caps, the harness, crew.mjs. protocol, zero.axeViolationsWcag and focusRing are kept from schema 1 for surviving readers. The host block is unchanged.",
  "status": "proposed (owner to confirm, D-048)",
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
    "fcpMs": {
      "lhMobile": 1800,
      "localDesktop": 600
    },
    "clsMax": 0.02,
    "tbtMsMax": 150,
    "bootTaskMsMax": 250,
    "throttle4x": {
      "idleFpsMin": 45,
      "travelP5FpsMin": 30,
      "worstFrameMsMax": 200,
      "longTasksMax": 12,
      "longTaskTotalMsMax": 1500
    },
    "bytesGz": {
      "criticalJs": 80000,
      "engine": 60000,
      "totalJsHome": 140000,
      "totalJsProject": 150000,
      "css": 14000,
      "htmlHome": 14000,
      "htmlProject": 16000
    },
    "fonts": {
      "bytesMax": 130000,
      "filesMax": 3
    },
    "rest": {
      "fpsMax": 30,
      "mainMsPerSecMax": 3,
      "stopAfterMs": 60000,
      "rollDrawsAtRest": 0
    },
    "media": {
      "ladder": [
        480,
        800,
        1280,
        1920
      ],
      "capBytes": {
        "small": 40000,
        "mid": 90000,
        "large": 180000,
        "firstPrint": 150000,
        "extreme": 120000,
        "poster": 40000,
        "lqip": 300
      },
      "pathBytes": {
        "homeCold": 250000,
        "homeAllFrames": 600000,
        "projectFirstScreen": 900000
      },
      "video": {
        "loopMax": 1500000,
        "featureMax": 4000000,
        "perProjectMax": 6,
        "playingMax": 2
      }
    },
    "layout": {
      "overflowPxMax": 0,
      "targetPxMin": 44,
      "textPxMin": 12,
      "readPxMin": 13,
      "focusRingPx": 2
    },
    "protocol": {
      "lighthouseVersion": "13.5.0",
      "lighthouseRuns": 5
    },
    "zero": {
      "axeViolationsWcag": 0
    },
    "focusRing": {
      "contrastMin": 3,
      "coverageMinPct": 90
    }
  },
  "host": {
    "calibrated": {
      "date": "2026-10-04",
      "host": "DESKTOP-7OOHGDS: 12 logical CPUs, RX 6700 XT (Lighthouse renderer: ANGLE D3D11 on it)",
      "conditions": "The orchestrator session alive; no other agents (every lane free before the calibrator took perf and blender for the whole job); no Blender or Unity process; no node or chrome outside the session's own MCP servers. Sampling started at 20:22:57 -04:00, 11 minutes after an npm ci that ended at 20:11:51 (npm run build ended at 20:12:18); the idle runs the key uses ran from 20:28:22 to 20:31:39 and the Lighthouse runs from 20:32:46 to 20:40:50 (00:32 to 00:40 UTC on 2026-10-05, hence the evidence folder's date). The owner's desktop apps stayed open: Opera, Discord, Task Manager, Roblox and the Claude desktop app.",
      "margins": {
        "cpuBusyPct": "8.3 points (one logical CPU of 12) over the p95, 12.6",
        "gpu3dPct": "5.0 points over the p95, 1.8",
        "foreignCpuPct": "2.5 points over MsMpEng's maximum, 7.6"
      },
      "evidence": "portfolio-evidence/calibration/2026-10-05/"
    },
    "calibration": "Calibrated on 2026-10-04 under the operating baseline: the orchestrator session alive, no other agents, no Blender or Unity, starting 10 minutes after an npm ci. The host, the conditions and the margins are in calibrated, and the raw files in portfolio-evidence/calibration/2026-10-05/. Idle: hostload.ps1 -Samples 60 three times. The first three (idle-1 to idle-3) caught two Opera renderers born inside idle-1, with CPU samples up to 99.1% and GPU 3D up to 22.7%. As with an antivirus scan, the calibrator waited for that to settle and took three more (idle-4 to idle-6). Both sets are kept, and the key uses idle-4 to idle-6. Every 10-sample window (153 sliding windows) gives a median (precheck.stat), and the p95 of those medians is 12.6% CPU busy and 1.8% GPU 3D (idle-1 to idle-3 would give 35.0% and 9.5%). cpuBusyPctMax = 12.6 + 8.3 (one logical CPU of 12) = 20.9. gpu3dPctMax = 1.8 + 5.0 = 6.8, which is above every disjoint 10-second median of idle-4 to idle-6 (at most 6.2). Then Lighthouse 13.5.0 on / with the built dist over gzip (serve-dist.mjs inside the run's own node process, as crew.mjs does): 5 mobile and 5 desktop runs, each watched by hostload.ps1 -Watch. benchmarkIndex.baseline = the median of the 5 mobile runs, 2918.5 (mobile 2799.5 to 3445; desktop 2466 to 2926.5). watch.allowlist = every process name the 10 -Watch files show outside each run's own tree, except MsMpEng; those names had at most 4.7%. MsMpEng shows in all 10 files, at 3.3% to 7.6% in each run's first chunk. That is real-time scanning of each run's launch, not a scan that settles, so MsMpEng stays off the list and foreignCpuPctMax = its maximum 7.6 + 2.5 = 10.1. hostload.ps1 then ran once against this key on the idle machine and exited 0 (hostload-postcal.json). Recalibrate the same way after a change of hardware, OS image or antivirus, or when sets keep coming out host-suspect, and edit calibrated and this text together.",
    "precheck": {
      "samples": 10,
      "stat": "median",
      "cpuBusyPctMax": 20.9,
      "gpu3dPctMax": 6.8
    },
    "watch": {
      "foreignCpuPctMax": 10.1,
      "allowlist": [
        "audiodg",
        "cam_helper",
        "claude",
        "discord",
        "dwm",
        "gwctlsrv",
        "musehub",
        "opera",
        "robloxplayerbeta",
        "svchost",
        "system",
        "taskmgr"
      ]
    },
    "benchmarkIndex": {
      "baseline": 2918.5,
      "suspectBelowRatio": 0.9
    },
    "rules": {
      "extraRunsPerSetMax": 5,
      "nearBudgetPct": 85,
      "nearBudgetRuns": 10
    },
    "gpuTimer": {
      "date": "2026-10-05",
      "chrome": "154.0.8037.97",
      "amdDriver": "32.0.21045.5002",
      "renderer": "ANGLE D3D11 on RX 6700 XT",
      "fixture": "1366x960 DPR 1 no MSAA, 8 quads 300x478 CSS px, 24 px gaps, 4 columns",
      "flatMs": 0.0116,
      "standinMs": 0.2192,
      "heavy4Ms": 0.8618,
      "control": {
        "flatMaxMs": 0.025,
        "standinMinMs": 0.208,
        "standinMaxMs": 0.252,
        "heavyRatioMin": 3.0,
        "heavyRatioMax": 5.0
      },
      "method": {
        "scout": "every device-px anchor of rail.ts place(), first argmax",
        "anchorTolDevPx": 1,
        "stepMs": 16.667,
        "developFractions": "k/6, k=1..5",
        "rampMs": 150,
        "leadIn": 40,
        "warmup": 30,
        "frames": 60,
        "loads": 10,
        "pollCapMs": 2000,
        "badSampleMs": 1000,
        "badSamplesDroppedMax": 3,
        "areaMinFrac": 0.99,
        "issueMaxFactor": 4,
        "issueGuard": "one-sided",
        "ratio": "(T_prints - S) / (T_standin - S)"
      },
      "evidence": "portfolio-evidence/rulings/gpu-worst-moment/ (probe3 to probe7, refute3-replay)",
      "note": "Calibration for #14's GPU measurement ruling (comment 5996745925), which binds; method summarises it. Recalibrate whenever the host key is recalibrated, and also after a Chrome major update or a GPU driver change. Round 1's first clean control set confirms it in the built page."
    }
  }
}
```

## Budgets v2: the site (proposed, owner to confirm, D-048)

**Status: proposed, owner to confirm (D-048).** Planner draft, 2026-10-29. It replaces the Darkroom Site rows above (marked retired at W-V0) once confirmed. It locks after two things: W-V0's Lighthouse baseline on Viewfinder (5 runs, mobile and desktop), and the owner's yes. Until then a breach is reported to the owner at the cap. It is not a must-fix. The Game section of budgets.md is unchanged.

Basis: the measured Viewfinder and Flux builds (`plan-inputs/budgets.md`), plus the grafts (about +14 kB gz JS and +3 kB gz CSS), real media, and a 25% margin. kB = 1,000 B.

### What changes from the Darkroom budgets
- **Retired:** the X-T5 and 3D rows, the canvas Mpx caps, print stills, the GPU worst moment, the hero readable time, sound, the Swup input-blocking row, drift for GL prints, and the GL cap of 187.6 kB (D-027, D-035). These measured code that is gone.
- **Replaced:** pre-GL JS 35 kB becomes critical JS 80 kB. Viewfinder's index script is already 62.3 kB gz, because GSAP loads before first paint. The GL cap becomes an engine cap of 60 kB (Viewfinder's engine is 25.2 kB gz). Fonts go from 100 kB to 130 kB, because Archivo is 90.1 kB.
- **New:** life at rest, fps floors at 4x CPU, a long-task count, project-page HTML, and media caps per print class.
- **Kept:** Lighthouse scores, LCP, CLS, TBT, the layout and accessibility floors, and R1 to R5.

### Bytes (CI, every PR)

HARD fails the gate. TARGET is reported, and a miss needs a one-line note.

**The rows overlap.** Each page inlines its CSS, so the HTML rows include it. Viewfinder's `/` is 9.1 kB gz with 6.1 kB of inline CSS. The grafts add about 2 to 3 kB of CSS, so `/` should land near 11 to 12 kB (cap 14). Project pages carry the same CSS plus the prints and the no-JS honours and contact markup (cap 16). A CSS gain counts against both the CSS row and the HTML rows.

| Metric | Hard cap | Target | How it is measured |
|---|---|---|---|
| Critical JS (before first paint) | 80 kB gz | 65 | The scripts the HTML loads plus their static imports. gzip -9 of each file in `dist`, from the Vite manifest |
| Engine chunk (engine, scenes, honours pass, print GL hooks) | 60 kB gz | 45 | The lazy chunks only the engine imports, gzip -9. If three.js ever returns, that is an owner budget call (D-054) |
| Total JS, every chunk `/` can load | 140 kB gz | 115 | The same method over every chunk reachable from `/` |
| Total JS, every chunk `/work/<slug>/` can load | 150 kB gz | 120 | The same, for the heaviest project page |
| CSS (inline plus linked) | 14 kB gz | 10 | Inline `<style>` plus linked CSS, gzip -9 |
| HTML `/` | 14 kB gz | 12 | gzip -9 of `dist/index.html`, inline CSS included. W-V0 adds the check with a negative control (an inflated fixture must fail) |
| HTML `/work/<slug>/` | 16 kB gz | 12 | gzip -9 of the largest project page, inline CSS included |
| Fonts, cold first load | 130 kB, 3 files at most | 117 | woff2 bytes fetched on a cold `/` load, from the network log. Latin subset only. Preload the two faces above the fold. `font-display: swap` with a metric-matched fallback |

### Timing (the gate's one Lighthouse run; timed sets at the approval candidate and before G3a)

| Metric | Hard cap | Target | How it is measured |
|---|---|---|---|
| Lighthouse | perf ≥ 90 mobile, ≥ 95 desktop; a11y 100; best practices ≥ 95 | | Lighthouse 13.5.0, GES-1 protocol, built dist over gzip, 5 runs, median by score. SEO is not gated while noindex is on |
| LCP | 2.5 s mobile, 2.0 s desktop | 1.8 s, 1.2 s | Lighthouse as above. On `/` the LCP element is the name. On `/work/<slug>/` it is the h1 or the first print |
| FCP | 1.8 s Lighthouse mobile; 600 ms local desktop | 400 ms local | Local: the built dist, a trace, median of 5 |
| CLS | 0.02 | 0 | Lighthouse, plus a trace over the full path: intro, raise, open a project, scroll the roll, open and close playback, close |
| TBT | 150 ms, mobile and desktop | 100 ms | Lighthouse. Mobile TBT takes 10 runs (R5) |
| Longest boot task | 250 ms | 200 ms | Trace of a cold `/` load. Viewfinder measures 203 to 242 ms |
| Frames at 4x CPU | idle ≥ 45 fps; scroll and travel p5 ≥ 30 fps; no frame over 200 ms anywhere | idle ≥ 55, scroll ≥ 45; the raise ≤ 100 ms worst frame | CDP `setCPUThrottlingRate(4)`, a rAF log over a fixed 10 s per segment (intro, raise, frames, open, roll, honours), on the reference host |
| Long tasks at 4x CPU | 12 tasks and 1.5 s total at most | 9 and 1.0 s | The same run |
| Honours pass GPU | | 1.0 ms per frame at 1440 × 900 | `EXT_disjoint_timer_query_webgl2` where available, on the reference host. Weak GPUs are covered by the governor (`quality` halves the refraction samples under 0.75) |

### Life at rest (D-053)

| Metric | Cap | How it is measured |
|---|---|---|
| Frame rate at rest (intro and frames) | 30 fps at most | Engine frame counters (the `?vf-test` stats) over 10 s with no input |
| Main thread at rest | 3 ms per second at most | Trace over the same 10 s |
| Stops | 0 frames when the tab is hidden, under reduced motion, and from 60 s after the last input | The same counters |
| Project roll at rest | 0 draws from 1 s after the motion end, unless an honour is moving | The same counters. Motion end = the later of the last input and the last presented frame |

### Media (new)

**Images (prints and stills).**
- Formats: AVIF first, WebP fallback. No JPEG or PNG in the page. Strip EXIF and GPS.
- Width ladder: 480, 800, 1280 and 1920 px, never upscaled. `sizes` is set per print class. 1920 is used only for large prints on DPR 2.
- Byte caps per file:

| Print class | Long edge | Cap per file |
|---|---|---|
| Small (slot of 4 columns, phone 56%) | 480 | 40 kB |
| Mid (slot of 5 to 7 columns) | 800 to 1000 | 90 kB |
| Large (slot of 12 columns, or playback) | 1280 to 1600 | 180 kB |
| The first print on screen of an open project | up to 1600 | 150 kB; `fetchpriority="high"`, never lazy |
| Panorama (wider than 2.4:1) or tall (taller than 1:2) | 1280 | 120 kB |

- Every `<img>` has its true `width` and `height`. The print frame takes its size from the ratio, so CLS stays 0.
- The inline placeholder (blur or dominant colour) is 300 B at most.
- Below the fold: `loading="lazy"` and `decoding="async"`.
- Image bytes on a cold `/` before any input: 250 kB at most. After raising and visiting every frame: 600 kB at most. An open project's first screen of prints: 900 kB at most, the rest lazy.

**Video.**
- MP4 H.264 for all; WebM (VP9 or AV1) too where it saves 20% or more. Always `muted` and `playsinline`. A `loop` clip has no audio track. Every video has a poster (AVIF, 40 kB at most).
- Loop clips (8 s or less, 720p or less): 1.5 MB at most. Feature clips (30 s or less, 1080p or less): 4 MB at most. At most 6 videos per project.
- `preload="none"` until the clip is within one screen. Play only when at least 50% visible. Pause when off screen, in a hidden tab, or under reduced motion (show the poster). At most 2 play at once. No video in the first-load set of `/`.

**How it is measured:** per-file caps are checked on `dist` in CI. Path totals are the sum of image bytes in the network log for the named path.

### Layout and accessibility (kept)
- Overflow 0 px as the maximum over the run, at every profile and mode, from 320 px wide.
- No clipped text under WCAG text spacing, at 200% zoom, or at 320 px.
- Targets at least 44 × 44 px. Text at least 12 px; readouts at least 12 px; anything a visitor reads (titles, hints, captions, honours details) at least 13 px.
- axe: 0 violations of any impact on WCAG tags. Focus ring 2 px, at least 3:1, with at least 90% ring coverage at every Tab stop.
- WCAG 2.3.1 flash analysis passes; an empty capture fails.
- Every motion has a live reduced path.
- Contact is reachable in 2 actions or fewer from any state.

### Measurement validity (unchanged)
R1 (precheck), R2 (host-suspect runs), R3 (replace, never average), R4 (a rerun is a whole new set) and R5 (near a budget, 10 runs) stay exactly as written in budgets.md. Byte caps need no precheck.

### Machine-readable block

The v2 caps now live in the `json budgets` block above (schema 2, still proposed until the owner confirms, D-048).

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
