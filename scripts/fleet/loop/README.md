# The lean crew loop

The owner adopted this operating model on 2026-10-27 (#91, comment 6452312126; PLAN.md "Operating model"). It replaces
`portfolio-evidence/loop-audit/crew-loop.proposed.js` for W-S2 onward.

**A round:**
1. The crew works.
2. Then, in parallel: the functional gate (Chromium and WebKit, a visual read, the frame-count probes 3 times and one
   Lighthouse run), the breaker passes (1 by default, 2 when the diff touches GL or navigation paths), and on slices
   the design/motion jury.
3. Then the judge.
4. At the approval candidate, the timed rows the diff can reach run once, from the detached perf queue. A reproduced
   fail gets one investigator with a main control.

| File | What it is |
|---|---|
| `crew-loop.js` | The Workflow template. Its rules carry `/*R:<name>*/` markers that the check's mutants disable one at a time. |
| `crew-config.json` | The knobs: caps, stop-early, breaker passes, jury rows, perf sets, gate rows, models and effort per role, hand-off, size limits, and the must-fix taxonomy quoted word for word. A ruling that changes behaviour lands here through an orchestrator PR. |
| `launch.cjs` | Writes `crew-loop.<crew>.js` (the template plus one sealed `EMBEDDED_ARGS` line: the merged config and the spec), then runs the check. |
| `prior-from-journal.cjs` | Builds a continuation from a run's journal; `--refresh` carries a changed config, `--spec` a newer spec, `--grant` more rounds. |
| `crew-loop.check.cjs` | LAUNCH READY. It checks the structure, the quotes against their sources, the scenarios with one negative control per rule, the continuations and the prompt lint. `--self-test` runs in CI. |
| `loop-lib.cjs` | Shared helpers: the merge, the spec, the embedded line and the loader. |

**Launch** (on launch day, from the main checkout):

```
node scripts/fleet/loop/launch.cjs wv1 --spec <spec.md> --spec-meta <meta.json> --out <dir>
# prints LAUNCH READY, then: Workflow({ scriptPath: '<dir>/crew-loop.wv1.js' }) with no args
```

`meta.json` is `{ "version": "v1", "postedAt": "<the spec comment's ISO time>", "commentUrl": "<its URL>" }`. The spec
is at most 10,000 characters. It is posted as an Orchestrator comment on the crew's issue, and the check compares the
two. A quote in the spec is written `"<text>" [c<comment id>]`, and the check compares it with that comment.

**Continue** (after a cap, a ruling, a busy host or a died agent):

```
node scripts/fleet/loop/prior-from-journal.cjs <dir>/crew-loop.wv1.js <run>/journal.jsonl --write <dir>/crew-loop.wv1.c1.js [--grant code=1] [--refresh scripts/fleet/loop/crew-config.json]
node scripts/fleet/loop/crew-loop.check.cjs <dir>/crew-loop.wv1.c1.js
```

**Cost:** `node scripts/fleet/cost-line.mjs <run transcript dir>` prints one cost line per round.

**The tools the prompts name** are in `scripts/fleet/`:
- `waitfor.mjs`: clamped waits, 270 s at most;
- `build-once.mjs`: one build per SHA, checked by hash;
- `perfq.mjs`: the detached perf queue;
- `lane.ps1`: lanes, with the holder's pid and a 4-minute acquire clamp;
- `hostload.ps1`: R1 to R5, with R2's summed foreign GPU median in `-Watch`.
