# Agent protocol (web side)

How crews claim work, record progress, ask for things and get reviewed in this repo. GitHub is the work log:
anything not in an issue, a PR or a commit is lost when an agent is cut off. The fork mirrors this protocol in
its `docs/portfolio/agents/`; only the branching and Unity details differ there.

## 0. Read first, in this order

1. Your issue (the crew brief), including every comment.
2. [`blocks/rules.web.md`](blocks/rules.web.md): absolute rules.
3. The north star and locked decisions in [`decisions.md`](decisions.md), filtered to your topics.
4. [`ownership.json`](ownership.json): the globs your crew may edit.
5. [`budgets.md`](budgets.md) and [`deps.md`](deps.md), if you touch performance or dependencies.
6. [`blocks/quality.md`](blocks/quality.md), [`blocks/tools.md`](blocks/tools.md) and
   [`blocks/output.md`](blocks/output.md).

## 1. Issues are crew briefs

One issue = one crew = one branch = one PR. The dispatcher creates briefs from the
[crew-brief form](../../.github/ISSUE_TEMPLATE/crew-brief.yml). A brief carries:

- the crew id, mission and acceptance criteria;
- the owned globs (the same ones as `ownership.json`);
- the gate: the commands that must pass and the evidence they must produce;
- `after:` the issues that must be done first.

Labels (created by [`scripts/fleet/bootstrap-github.sh`](../../scripts/fleet/bootstrap-github.sh), which is the
source of truth for names and colours):

| Family | Values |
|---|---|
| `track:` | `W` 2D site, `M` Manor, `G` Painting Worlds, `S` shared (identity, content, tooling, release) |
| `wave:` | `0`, `0.5`, `1` … `6`; milestones of the same names group them |
| `type:` | `recon`, `build`, `review`, `bug`, `request`, `decision` |
| `status:` | `ready` → `in-progress` → `needs-review` → (`changes-requested` → `needs-review`)… → `done`; `blocked` at any point |
| `review:` | `approved`, `changes-requested`: the verdict on a PR |
| other | `needs:orchestrator`; `placeholder-content` (touches placeholder content). The dispatcher creates a `role:<crew id>` and `needs:<crew id>` label with each brief. |

An issue has exactly one `status:` label. Whoever changes the state swaps the label in the same command:
`gh issue edit <n> --remove-label status:ready --add-label status:in-progress`.

## 2. Claiming

1. Only take an issue labelled `status:ready` whose `after:` issues are all `status:done`.
2. If it is already `status:in-progress`, take it only when the latest checkpoint is older than about 45 minutes
   and the dispatcher assigned it to you. Then resume (section 7).
3. Claim it with a comment, `Claimed by <crew id>.`, and swap `status:ready` for `status:in-progress`.

## 3. Branch and draft PR from the first commit

- Branch `crew/<id>` from `main`. W crews work in their own worktree, `..\portfolio-site.wt\<id>`.
  - Use `node scripts/crew.mjs open <id>` once the foundation crew has added it.
  - Until then, create it by hand:
    - `git -C C:\Users\Aaron\Documents\GitHub\portfolio-site fetch origin`;
    - `git -C C:\Users\Aaron\Documents\GitHub\portfolio-site worktree add ..\portfolio-site.wt\<id> -b crew/<id> --no-track origin/main`.

    `--no-track` matters: without it the branch tracks `main`, and a careless push could target `main`. The first
    push is `git push -u origin crew/<id>`.
- After the first commit, push and open a **draft** PR to `main` with the
  [PR template](../../.github/pull_request_template.md), body starting `Closes #<n>`.
- Push after every meaningful step. Never push to `main`, never force-push, no Git LFS.
- Stay under about 800 changed lines. If the work is bigger, it is two crews; say so in a checkpoint.
- Edit only your owned globs. Anything else is a request (section 5).

## 4. Checkpoints

Post a checkpoint comment on the issue after each meaningful push, and at most every ~15 minutes (batch them).
Someone who has never seen your session must be able to continue from it:

```md
**Checkpoint** 2026-10-02T14:05Z · `abc1234` on `crew/w-c3`
Done: the work index renders the 8 placeholder projects at 1440 and 390.
Next: the hover state; then the reduced-motion path.
Blockers: none (or #42)
Gate: `npm run check && npx playwright test work-index` (3 of 5 pass; the 2 failures are hover, not started)
```

## 5. Requests and bugs instead of cross-editing

Agents cannot message each other. Issues are the channel.

- Need a change outside your globs, or a decision? File the [request form](../../.github/ISSUE_TEMPLATE/request.yml)
  with `needs:<owner crew>` (or `needs:orchestrator`), link it from your checkpoint, and keep going on
  something else. Do not wait idle and do not make the edit yourself.
- Found a defect outside your globs? File the [bug form](../../.github/ISSUE_TEMPLATE/bug.yml), with evidence.
- New dependencies: list them in `depRequests[]` in your output and file a request. Only the foundation crew
  edits `package.json` and the lockfile, and only for entries approved in [`deps.md`](deps.md).

## 6. Review

1. When your gate passes, mark the PR ready (`gh pr ready`), and swap the issue to `status:needs-review`.
2. The gate agent checks out the reported SHA, re-runs every gate command and re-shoots the screenshots itself.
   It never trusts the crew's own images.
3. The manager posts the verdict with `gh pr review <pr> --comment --body-file …` and adds
   `review:approved` or `review:changes-requested` (labels, because one account cannot approve its own PR).
   The verdict lists each finding with file:line or a screenshot path, and what must change.
4. On `changes-requested`, the crew fixes, pushes, posts a checkpoint and swaps back to `status:needs-review`.
5. At most 3 rounds. After that the manager adds `needs:orchestrator` and `status:blocked`.
6. Only the orchestrator merges. After the merge the issue is `status:done`.

## 7. Resuming from an issue

A replacement agent has only the issue and the branch. To resume:

1. Read the issue body and every comment; the latest checkpoint is the plan.
2. `git fetch origin` and check out `crew/<id>` at the checkpoint's SHA. If the branch has newer commits than
   the checkpoint, read them before doing anything.
3. Re-run the gate command from the checkpoint to see the real state.
4. Post `Resumed by <crew id> at <sha>.` and continue with the checkpoint's "Next".

## 8. Rate limits

GitHub's secondary limits are roughly 80 content writes a minute and 500 an hour, shared by every agent on the
account.

- Only the dispatcher creates issues in bulk.
- Batch checkpoints; do not comment for every commit.
- On HTTP 403 or 429, back off with jitter (2 s, 4 s, 8 s, …, up to 5 tries), then report it in a checkpoint.
