Closes #

**Crew:** `crew/<id>` · **SHA:** `<sha>` · **Beat served:** 1 identity / 2 best work / 3 everything / 4 craft

## What changed

<!-- What a reviewer sees in the browser, then the files that matter. Keep the PR under about 800 changed lines. -->

## Gate

<!-- Each gate command from the brief, and its key output. The gate agent re-runs these at the SHA above. -->

```text
$ <command>
<key output>
```

## Evidence

<!-- Before/after screenshots at the brief's viewports (WebGL, no WebGL, reduced motion), with paths or attachments.
     Label numbers measured, documented or estimate. -->

## Decisions, requests and cuts

- Decisions followed or proposed: <!-- D-0xx -->
- Conflicts with locked decisions: none
- Requests and bugs filed outside my globs: none
- `depRequests`: none
- Cut: <!-- what was removed or not built, and why -->

## Checklist

- [ ] Only my crew's globs in `docs/agents/ownership.json` are edited.
- [ ] No owner fact that is not in `content/owner-facts.md`; placeholders are visibly marked.
- [ ] No banned phrase (`docs/agents/blocks/quality.md`).
- [ ] Three levels of polish checked in the rendered browser; the console is clean.
- [ ] Reduced motion and no-WebGL paths checked; WCAG 2.2 AA.
- [ ] Within `docs/agents/budgets.md`; no dependency outside `docs/agents/deps.md`.
