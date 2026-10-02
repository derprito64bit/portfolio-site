# Absolute rules: web (track W)

Every W prompt includes a 6–8 line summary of this block and the path to it. When this block and a prompt
disagree, this block wins; report the conflict in `conflictsWithLocked`.

1. **The repo is the source of truth.** Work only in this repo and your crew worktree. Inspect before changing.
   No side projects, parallel demo repos or throwaway prototypes.
2. **Never invent owner facts.** [`content/owner-facts.md`](../../../content/owner-facts.md) is the only source.
   Anything not confirmed there is a placeholder, visibly marked in the page (`[PLACEHOLDER: …]` in copy,
   `"placeholder": true` in data). No AI-generated images, ever.
3. **Free tools only.** No paid tiers, trials or branded free tiers (unicorn.studio, Spline, Rive, Motion+).
   No licences that block a portfolio (LYGIA non-commercial, AGPL).
4. **Every dependency needs a decision.** A package or asset lands only after it has an entry in
   [`docs/agents/deps.md`](../deps.md) with its decision id, licence and gzip kB.
5. **Only the foundation crew edits `package.json` or the lockfile.** Everyone else lists `depRequests[]` and
   files a request issue. Installs go through `npm ci`. No global installs; `npx` one-offs are fine.
6. **Stay in your globs.** Edit only what [`ownership.json`](../ownership.json) gives your crew. Outside them,
   file a request or bug issue ([`PROTOCOL.md`](../PROTOCOL.md) section 5).
7. **No shared MCP servers.** The Playwright, Chrome DevTools, Unity and Blender MCP servers are reserved for
   the orchestrator or one named agent. Crews use their own browser session (`playwright-cli` or
   `node scripts/crew.mjs shoot`).
8. **The browser is the truth.** Nothing is done because the code looks right. Render it, screenshot it at the
   gate's viewports, and read the console.
9. **Budgets are limits, not targets.** [`docs/agents/budgets.md`](../budgets.md) sets them; a change that
   exceeds one fails its gate.
10. **Git.** Branch `crew/<id>`, draft PR from the first commit, push often. Never push to `main`, never
    force-push, no Git LFS. Commit messages end with a blank line and the `Co-Authored-By` trailer you were given.
11. **Accessibility and motion.** WCAG 2.2 AA; every motion has a `prefers-reduced-motion` path; the site works
    without WebGL.
