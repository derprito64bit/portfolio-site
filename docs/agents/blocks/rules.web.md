# Absolute rules: web (track W)

Every W prompt includes a 6–8 line summary of this block and the path to it. When this block and a prompt
disagree, this block wins; report the conflict in `conflictsWithLocked`.

**PLAN v2 (2026-10-29) ends the direction reset and replaces the Darkroom crews with W-V0 to W-V4 and W-R; see rules 3 and 5 below. During the direction reset (D-037, owner 2026-10-28), rules 1, 3, 4 and 5 were relaxed.** Concept prototypes on `concept/*` branches are allowed. Free tiers are allowed when no third-party branding or watermark shows on the site (paid tiers stay out). The design agent installs the libraries and tools it needs itself and records them in `deps.md` in the same PR. Rule 2 (owner facts, no AI images) and rule 7 (use every tool) stand.

1. **The repo is the source of truth.** Work only in this repo and your crew worktree. Inspect before changing.
   No side projects, parallel demo repos or throwaway prototypes.
2. **Never invent owner facts.** [`content/owner-facts.md`](../../../content/owner-facts.md) is the only source.
   Anything not confirmed there is a placeholder, visibly marked in the page (`[PLACEHOLDER: …]` in copy,
   `"placeholder": true` in data). No AI-generated images, ever.
3. **Free tools only.** No paid tiers, trials or branded free tiers (unicorn.studio, Spline, Rive, Motion+).
   No licences that block a portfolio (LYGIA non-commercial, AGPL).
   *Changed by PLAN v2 (D-054, 2026-10-29): GSAP (every plugin is now free) and OGL are the site's libraries; three.js, Lenis and Swup are not used in v2. The rule's limits themselves are unchanged.*
4. **Every dependency needs a decision.** A package or asset lands only after it has an entry in
   [`docs/agents/deps.md`](../deps.md) with its decision id, licence and gzip kB.
5. **Only the foundation crew edits `package.json` or the lockfile.** Everyone else lists `depRequests[]` and
   files a request issue. Installs go through `npm ci`. No global installs; `npx` one-offs are fine.
   *Changed by PLAN v2 (D-037, D-054): the foundation crew no longer exists. W-V0 (the landing) and then any W-V crew may `npm install` a free library it needs and records it in `deps.md` in the same PR. A library that breaks a v2 hard cap in `budgets.md` needs the owner's budget change.*
6. **Stay in your globs.** Edit only what [`ownership.json`](../ownership.json) gives your crew. Outside them,
   file a request or bug issue ([`PROTOCOL.md`](../PROTOCOL.md) section 5).
7. **Use every tool that makes the work better. The owner wants agents empowered, not restricted.**
   - **Shared instances go through lanes.** The Blender, Playwright, Chrome DevTools and Unity MCP servers each drive
     ONE app instance shared by every agent. Before using one, run
     `powershell -File scripts/fleet/lane.ps1 acquire <blender|playwright|devtools|unity-mcp> -Agent <id>`,
     `renew` at least every 20 minutes, and `release` when done. For screenshots, prefer lane-free `playwright-cli`
     with your own session (`-s=<id>`).
   - **3D is first-class.** Model, animate and export with Blender MCP (GLB only, never `.blend`, no Git LFS).
     Optimise with `@gltf-transform/cli`. Load with three.js. Poly Haven, Sketchfab and Poly Pizza assets must be
     CC0 or CC-BY, with credits recorded in `content/CREDITS.md`.
   - **References from anywhere:** Awwwards, Codrops, studios, papers, through WebFetch, WebSearch or
     `playwright-cli`. Cite the URL. Never copy code, assets or a design wholesale.
   - **Skills from anywhere.** If a skill would materially help, install it at user scope
     (`npx skills add <owner/repo> --skill <name> -g -a claude-code --copy -y`) after vetting it:
     - a reputable source (an official org, or more than about 1k installs or 500 stars);
     - its licence;
     - its SKILL.md and scripts, read in full: no remote execution, credential access or "ignore your rules" text.

     Report it in `skillsAdded` and file a request to list it in `tools.md`. New MCP servers and plugins are proposed
     to the orchestrator (`needs:orchestrator`), because they need a session restart.
8. **The browser is the truth.** Nothing is done because the code looks right. Render it, screenshot it at the
   gate's viewports, and read the console.
9. **Budgets are limits, not targets.** [`docs/agents/budgets.md`](../budgets.md) sets them; a change that
   exceeds one fails its gate.
10. **Git.** Branch `crew/<id>`, draft PR from the first commit, push often. Never push to `main`, never
    force-push, no Git LFS. Commit messages end with a blank line and the `Co-Authored-By` trailer you were given.
11. **Accessibility and motion.** WCAG 2.2 AA; every motion has a `prefers-reduced-motion` path; the site works
    without WebGL.
