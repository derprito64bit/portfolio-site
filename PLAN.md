# Orchestrator plan: the website, until it's live

**Track: the website only.** The owner said (2026-10-27): "let's hard focus on the website portion first i want to be able to have a proper portfolio ready first over having project ion overtaking priority".
- The Manor and Painting Worlds (game repo derprito64bit.github.io) stay paused until this site is live. Don't touch them.
- One crew at a time, one stage per session.
- The owner gives each stage the go-ahead and caps crew rounds.

## Where things stand (2026-10-27)
- **main = fc53a42.** Merged so far:
  - W-F foundation #30;
  - the X-T5 model and GLB pipeline (#28, #56);
  - the W-S1 hero #53;
  - the W-F-m2 foundation follow-up #69 (95b3928, merged by owner decision after 6 rounds with known gaps);
  - docs batch #93.
- **The queue is issue #91.** Its body lists the slots in order.
- **What's left, with sources:** `portfolio-evidence/status/2026-10-13-whats-left.txt` (and `.json`).
- **System review:** `portfolio-evidence/loop-audit/SYSTEM-REVIEW-2026-10-13.md`. The upgraded crew loop was inefficient: #69 cost about $1,987 against W-S1's about $362.

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

## NEXT STAGE: the leaner loop, then W-S2
1. **Tooling PR** (#91 slot 2). Make the crew-loop template match the model above:
   - Start from `portfolio-evidence/loop-audit/crew-loop.proposed.js`; it holds the wfm2, ws2 and ws3 configs.
   - Update `crew-loop.check.js` to match; prior-from-journal and check.js stay, but don't grow their scenarios.
   - Add `crew-config.json` knobs (caps, breaker passes, perf scope, must-fix taxonomy, design rows) that the launch script reads, so rulings can change behaviour.
   - Clamp `waitfor.mjs` and every wait to 270 s or less.
   - Run detached perf queues with the PID in the lane file, killed when their agent dies, resuming from finished sets.
   - Build once per SHA; verifiers reuse the dist, checked by hash.
   - Add the open-items digest and the per-round cost line.
   - Make `scripts/check/run.mjs` check orchestrator branches against an orchestrator glob list (today it skips ownership on non-`crew/*` branches).
   - Add a `decisions.md` row for W-F-m3's one-off camera globs.
   - Add the hostload `-Watch` foreign-GPU check, quoting budgets.md R2 **word for word**.
   - Reviewer: 1 verifier. Quote rulings word for word in specs, and give every "check passes" claim a negative control.
2. **W-S2 launch (#14, work index / contact sheet), on launch day only:**
   - Refresh the ws2 config against #69's merged API: `__stage.seek` now sets animation currentTime; registerEffect chains `impl(id, opts, next)`; `__stage.take/give` (#14 comment 6019795919).
   - Fold every Orchestrator comment on #14 into one versioned **W-S2 spec**: 5990469145, 5990956119, 5992945290, 5995444490, 5996745925 and 6015492081, plus D-027 and D-028.
   - Include the motion-benchmark W-S2 lines (`portfolio-evidence/research-motion/2026-10-08/MOTION-BENCHMARK.md`) and the TRANSITIONS W-S2 work: A3, A4 and the swap rate.
   - Rule TRANSITIONS A12 (the about 1.19 kB pre-GL booking on /) before W-S2 spends the shared 7,520 B. Add the `swapMinGap` token (500 ms, TRANSITIONS C3).
   - **Headroom is tight.** GL is 185,507 B against W-S2's 186,700 B cap, so about 1.2 kB is left. Home HTML is 14,176 B of 14,600 on the wire, so 424 B is left. Put both in the spec.
   - Then check.js reports LAUNCH READY, then launch. Arm a background watcher (no polling LLM).
   - The EVF P6 prototype (D-034) may run during W-S2's crew phase, never during a timed set.
3. **On W-S2's result:** merge if approved with CI green. At the cap, ask the owner. Then stop, log, back up, and say "fresh session for the next stage".

## After W-S2 (the order to go-live)
1. **W-F-m3:** context-loss must-fixes before G3a, from #91 comment 6144848977. Then round 5's carry-over (6097618297), the lint AST check and the requests #76, #75, #74, #88, #89, #79, #80 and #70. Cap: 2 code rounds on a frozen list.
2. **TRANSITIONS final pass:** close rev 8's last budget must-fix, add `docs/direction/transitions.md`, amend W-S3 and W-D015, and run prototypes P0-P5.
3. **W-S3 (#15):** the project page.
4. **W-C13 m3 (#16):** grip leatherette, dial teeth, XF16-50 legends, cartridge and loupe, #84, re-rendered posters.
5. **W-C14 items (#19):** hero hand-offs, the hero's mobile TBT long task, #57 item 3, #85.
6. **The content step:**
   - the owner supplies real facts, the project order (D-029) and a film look per project (D-032);
   - #32;
   - reset the placeholder looks to `''`.
7. **W-R (#12):** the composed site at `/`, with the Manor kept at `/manor/` by the game repo's publish.
8. **G3a:** the owner's review, then go-live **hidden from search** (D-013).
9. **After launch:** W-C2 with optimization pass #82 (the 3D budget D-033 is decided at its launch), W-C3, W-C4 (#78), W-C5, W-C6, W-C8, W-C9, W-C10, and watchlist #65.

## Owner questions to ask at the right stage (not before)
- **During W-S2:** pick the EVF cell after the P6 numbers.
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
  - `loop-audit/`: the template, check.js, prior-from-journal, the review and its scripts;
  - `runs/`, `research-*`, `status/`;
  - `orchestrator-tools/2026-10-13/`: the earlier session's helper scripts (`watcher.py`, journal readers).
- **Assets (private repo):** `C:\Users\Aaron\Documents\GitHub\portfolio-assets`, which holds the X-T5 Blender sources and the QC studio.
- **Lanes and host:**
  - `scripts/fleet/lane.ps1` (perf and blender lanes; tools that aren't crews acquire with `-StaleMinutes 100000`);
  - `scripts/fleet/hostload.ps1` (prechecks, budgets R1-R5);
  - `C:\Users\Aaron\Documents\GitHub\project.ion\scripts\fork\reap-browsers.ps1` (`-List` or `-Kill` after workflows).
- **Blender:** GPU only (RX 6700 XT, HIP) through `project.ion\scripts\fork\blender_gpu.py`.
- **Backup:** `python C:\Users\Aaron\Documents\GitHub\portfolio-backup\backup.py`, run at every stage stop.
- **Preview:** `C:\Users\Aaron\Documents\GitHub\portfolio-preview\preview.py`, serving main on :4400 and the newest crew PR on :4401. Start it only if the owner wants to watch.

## Standing rules
- **Never SendMessage or TaskStop a workflow's agents**; doing so spawns duplicates. Amend the issue or PR, or relaunch from a continuation.
- **Crews push their own branches.** If a push is refused, the orchestrator pushes it as a fast-forward.
- **Merge** when the PR is approved and `gh pr checks` is green. The owner has granted full git and GitHub permission.
- **Nothing heavy while the perf lane is held.** Reap browsers after every workflow.
- **The owner's to-do list** is `C:\Users\Aaron\.claude\user-todo.md`, and every reply ends with it (global CLAUDE.md).
