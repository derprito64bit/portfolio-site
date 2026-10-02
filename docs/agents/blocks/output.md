# Output discipline

## Evidence

- Every claim cites where it comes from: a file path with line (`src/x.ts:42`), a URL, a screenshot path, or the
  command and its key output.
- Label every number and factual claim:
  - **measured**: you ran it here (give the command, viewport, browser and GPU);
  - **documented**: from official docs or a repo (give the URL);
  - **estimate**: your judgement (say what it rests on).
- Performance numbers are measured only in headed runs on the real GPU. If the WebGL renderer string is
  SwiftShader, the number is not a measurement.
- Screenshots and logs go in `evidence/<crew id>/` (gitignored) and are attached to the PR or checkpoint.
- Recon caps: about 30 tool calls and 10 web pages. Stop as soon as the schema is fillable.

## Fields common to every schema

Every agent's structured output includes these, in addition to its role's own fields:

| Field | Shape | Meaning |
|---|---|---|
| `ack` | `{ northStar: "<version>", decisionsRead: ["D-001", …] }` | What you read. The version must match the one you were given. |
| `decisions` | `[{ topic, choice, why, servesBeat, evidence: [], confidence }]` | Each decision you made, the beat it serves (1–4) and its evidence. No evidence, no decision. |
| `conflictsWithLocked` | `[{ decision: "D-0xx", conflict, proposal }]` | Where your work disagrees with a locked decision. Never silently override one. |
| `specificity` | string | Why this would look wrong on any other portfolio. |
| `cutList` | `[]` | What you removed or would remove first under pressure. |
| `assumptions` | `[]` | What you assumed but could not verify. |
| `ownerQuestions` | `[]` | Questions only the owner can answer (usually facts). Never answer them yourself. |
| `toolGaps` | `[]` | Skills or tools you needed but could not reach. |

Builds add `sha`, `prUrl`, `gateEvidence` and `depRequests: [{ package, version, licence, gzipKb, why }]`.

## Checks the scripts run on your output

- `ack.northStar` matches the current version.
- Every decision has at least one evidence entry.
- No banned phrase from [`quality.md`](quality.md) appears anywhere.

A failed check gets one retry with the feedback.
