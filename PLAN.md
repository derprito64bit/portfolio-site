# Orchestrator plan: the website, until it's live

**Track: the website only.** The owner said (2026-10-27): "let's hard focus on the website portion first i want to be able to have a proper portfolio ready first over having project ion overtaking priority".
- The Manor and Painting Worlds (game repo derprito64bit.github.io) stay paused until this site is live. Don't touch them.
- One crew at a time, one stage per session.
- The owner gives each stage the go-ahead and caps crew rounds.

## Where things stand (2026-10-28)
- **main = the stage-close merge after be3049f.** Merged so far:
  - W-F foundation #30;
  - the X-T5 model and GLB pipeline (#28, #56);
  - the W-S1 hero #53;
  - the W-F-m2 foundation follow-up #69 (95b3928, merged by owner decision after 6 rounds with known gaps);
  - docs batch #93 and the orchestrator context #94;
  - **the lean crew loop #95** (d1ba6cd), W-S2's launch config #96, owner decision D-035 #99 (the GL budget is now 187.6 kB);
  - **W-S2, the work index, #97** (be3049f). The owner chose to merge it with mobile TBT deferred: the timed set was blocked five times by a busy host. TBT is measured at W-F-m3's approval candidate and before G3a (a must-fix before G3a if it fails). Its follow-ups are #91 comment 6476370307.
- **The queue is issue #91.** Its body lists the slots in order; slots 1 to 3 are done.
- **Lean-loop cost:** W-S2 took 4 rounds (3 code plus 1 granted) for about $140 in crew runs, and this orchestrator session about $70. For comparison, W-S1 was about $362 and #69 about $1,987.
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

## NEXT STAGE: W-F-m3 (#11 follow-up crew), on the lean loop
1. **Fill the `wfm3` entry of `scripts/fleet/loop/crew-config.json`** through an orchestrator PR (`docs/...`). It is a draft now; `launch.cjs` refuses drafts. Set:
   - the code paths: W-F's globs, plus the W-F-m3 camera one-offs (decisions.md row 'W-F-m3 one-off globs'), plus a one-off in `src/gl/prints` if it takes the lost-context develop item below;
   - the gate's visitor paths and frame probes;
   - the breaker list (context loss, restore, Swup, bfcache);
   - the perf sets: copy ws2's mobile TBT set (it measures the deferred W-S2 TBT on /) and add what the frozen list reaches;
   - `jury.enabled: false` (not a slice).
   - Caps are already set: 2 code rounds (evidence 1) and 2 breaker passes.
2. **Write one versioned spec** (10,000 chars or less) on launch day, from the frozen list:
   - #91 comment 6144848977 (must-fix before G3a: C and B, the WK-P2 regressions against main; the .astro lint regions; A1 to A3; D1 to D4; perf rows 40 and 45);
   - round 5's carry-over (6097618297);
   - the lint AST check, the getAnimations() idle check and the home HTML check;
   - bugs #76 (first), #75, #74, #88 and #89, and requests #79, #80 and #70;
   - the W-F-m3 group of W-S2's follow-ups (#91 comment 6476370307);
   - the deferred W-S2 mobile TBT.
   Quote rulings word for word as `"..." [c<id>]` (the check verifies them). Post the spec on #11 as an Orchestrator comment, write its `meta.json`, and run 1 refuter (Sonnet, medium), at most 2 rounds.
3. **Launch** from the main checkout (agents start in their caller's directory):
   - `node scripts/fleet/loop/launch.cjs wfm3 --spec <md> --spec-meta <json> --out C:\Users\Aaron\Documents\GitHub\portfolio-evidence\runs\wfm3` must print LAUNCH READY;
   - copy the launched file into the repo's gitignored `evidence/runs/wfm3/`, because the Workflow tool loads a scriptPath only from inside the working directory;
   - then run `Workflow({ scriptPath })` with no args.
4. **Per round:**
   - arm `round-watch.mjs` (`portfolio-evidence/orchestrator-tools/2026-10-27/`) as a background task (no LLM polling);
   - read the verdict with `judged.mjs`;
   - post the cost line (`scripts/fleet/cost-line.mjs <run dir> --round <n>`);
   - answer rulings on the PR before the next crew agent starts;
   - refresh the build log;
   - reap browsers after each run.
5. **Perf needs a quiet PC.** W-S2's TBT failed to get a clean set five times: other sessions' headless browsers and node, and `benchmarkIndex` under 0.9 x the baseline. Ask the owner for a quiet window at launch (see owner questions). Use `quiet-watch.mjs` before a perf continuation, and stop it before launching (its own prechecks add load).
6. **Continuations** come from `prior-from-journal.cjs <launched file> <journal> --write <next> [--grant code=1] [--refresh crew-config.json]`, then the check. On the result: merge if approved with CI green; at the cap, ask the owner. Then stop, log, back up, and say "fresh session for the next stage".

## After W-F-m3 (the order to go-live)
1. **TRANSITIONS final pass:** close rev 8's last budget must-fix, add `docs/direction/transitions.md`, amend W-S3 and W-D015, and run prototypes P0-P5, then P6 (the EVF, D-034; it did not run during W-S2), whose numbers go to the owner.
2. **W-S3 (#15):** the project page.
3. **W-C13 m3 (#16):** grip leatherette, dial teeth, XF16-50 legends, cartridge and loupe, #84, re-rendered posters.
4. **W-C14 items (#19):** hero hand-offs, the hero's mobile TBT long task, #57 item 3, #85.
5. **The content step:**
   - the owner supplies real facts, the project order (D-029) and a film look per project (D-032);
   - #32;
   - reset the placeholder looks to `''`.
6. **W-R (#12):** the composed site at `/`, with the Manor kept at `/manor/` by the game repo's publish.
7. **G3a:** the owner's review, then go-live **hidden from search** (D-013).
8. **After launch:** W-C2 with optimization pass #82 (the 3D budget D-033 is decided at its launch), W-C3, W-C4 (#78), W-C5, W-C6, W-C8, W-C9, W-C10, and watchlist #65.

## Owner questions to ask at the right stage (not before)
- **At W-F-m3's launch:** name a PC window for timed sets (no other Claude sessions running tests; Unity, Roblox and most Opera tabs closed), or approve recalibrating the host key. W-S2's TBT was blocked five times without one.
- **At the TRANSITIONS pass:** pick the EVF cell after the P6 numbers.
- **Before W-C14:**
  - camera and print composition, and camera size on laptops;
  - the strap style;
  - the phone opening (recommended: print ready plus a tap cue).
- **Content step:** real facts, order, looks, and the moving material (recommended: screen recordings first).
- **At G3a:** approval, the 4.7 s opening trim, the default theme, and hiding Lens/Look until they work.
- **At W-C2:** the GL budget (recommended: about 192.9-195.4 kB), the warp location (recommended: flying prints swim), and a phone develop.

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
