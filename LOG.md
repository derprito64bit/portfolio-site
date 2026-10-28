# Orchestrator log (website)

Newest entries last, dates in UTC. The full 2026-10-02 to 10-13 history (about 1,500 lines, including the Manor era) is in
`C:\Users\Aaron\.claude\plans\start-reviewing-the-project-crystalline-seahorse.md`. Read it only when you need a specific detail.

- **2026-10-02 to 10-03: setup and direction.**
  - Repo bootstrap, the agent docs, the north star, the fact packs.
  - The direction tournament: Darkroom won, with grafts from the other two.
  - Owner decisions D-001 to D-022: the standalone game repo; the website is the only active track.
- **2026-10-04: first merges, and the site's framing.**
  - W-F foundation #30 merged.
  - The X-T5 m2 model #56 merged (LOD0 99.9k tris).
  - W-S1 hero #53 merged after 5 rounds.
  - D-023: the site is a portfolio of all projects, not a door to the game. D-024: the X-T5 sketch-to-3D opens the site.
- **2026-10-05 to 10-07: the upgraded crew loop.** It was built, audited and calibrated (hostload host key). Rulings and configs were drafted for W-S2 and W-S3.
- **Owner decisions in that period:**
  - D-027: the GL budget is 187 kB.
  - D-028: W-S2's GPU "at risk" is accepted, with optimization pass #82.
  - D-029: the contact sheet runs in date order.
  - D-030 to D-034: the live look, Fujifilm sim names, looks picked by the owner, the 3D budget decided at W-C2, and the EVF explore.
- **2026-10-08: research.**
  - The motion benchmark: not yet at the bar. A preview jury scored about 4.9/10.
  - The TRANSITIONS spec ("Through the finder") reached rev 8.
  - The private backups were set up.
- **2026-10-13: W-F-m2 #69 merged (95b3928)** by owner decision after 6 non-converging rounds. Its context-loss and lint leftovers went to #91 slot 4 (W-F-m3), must-fix before G3a.
- **2026-10-13: docs batch #93 merged (fc53a42).** The system efficiency review found the upgraded loop inefficient.
- **2026-10-27: the owner refocused and decided.**
  - "Hard focus on the website."
  - The review's lean operating model is adopted. W-S2's cap is 3 code rounds plus 1 evidence round, with no budget pause and a cost line every round.
  - The repo now carries the orchestrator context (this file, `PLAN.md` and `CLAUDE.md`).
  - **Next stage:** the tooling PR (the lean loop), then the W-S2 launch.
- **2026-10-27 to 10-28: the lean loop, then W-S2.**
  - Tooling PR #95 (d1ba6cd) built the lean crew loop and its shared tools; one Sonnet verifier found 10 issues, all fixed before merge. #96 set W-S2's config and the swapMinGap token.
  - The W-S2 spec v1 (#14 comment 6459323335, 9,604 chars, 25 quotes verified) folded every ruling. A refuter ran 2 rounds; A12 was ruled in it (1.19 kB held, W-S2 at most +3.0 kB pre-GL).
  - **Round 1** (about $59): changes, 4 must-fix. Rulings 6462781328: GL must fit 187,000 B, no pre-GL rise, L3 means 35% of the print.
  - **Round 2** (about $32): only GL over. Ruling 6464777023: chunks that only GL imports count.
  - **Round 3** (about $28): GL 233 B over at the cap. The owner chose D-035 (GL 187.6 kB, #99) plus one more round.
  - **Round 4** (about $20): approved. The jury scored 7/7 on all five rows. Readable 3,129 ms, L8 iGPU 0.12 ms (a pass), ratio 0.13, hero GPU 0.83.
  - Mobile TBT was blocked five times by a busy host: other sessions' headless browsers, and benchmarkIndex under 0.9 x the baseline. The owner chose to merge with TBT deferred.
  - **W-S2 merged as be3049f.** Follow-ups: #91 comment 6476370307.
  - Costs: W-S2 crew runs about $140, the orchestrator about $70, reviews about $3.
  - **Next stage:** W-F-m3 on the lean loop.

