# portfolio-site

derprito64bit's standalone portfolio website, built with Astro 7, three.js r186, Lenis and Swup in the "Darkroom" direction. An X-T5 camera drawing turns into the real camera to open the site.

**The goal:** a portfolio of ALL the owner's projects, with the quality of animation and layout of portfolio-zxc and Jesper Landberg, never their look (`docs/agents/owner-voice.md`).

**Scope:** the game [project]ion (the "Manor") is just one project shown here. Its repo, derprito64bit.github.io, is a separate track, paused until this site is live. Don't work on it from here.

## For every agent
- **Ground truth is `docs/agents/`:**
  - `PROTOCOL.md`: the process;
  - `budgets.md`: hard budgets and measurement rules;
  - `decisions.md`: locked decisions;
  - `ownership.json`: which crew owns which globs;
  - `deps.md`: the dependency allowlist;
  - `tokens.json`;
  - `north-star.md` and `owner-voice.md`: intent.
- **Direction lives in `docs/direction/`.** Your brief is your GitHub issue plus its **Orchestrator** comments, which bind.
- **Never invent owner facts.** `content/owner-facts.md` is the only source; anything else is a visible typed placeholder.
- **Free tools only.** New dependencies need an allowlist entry.
- **Work on a branch with a PR.** Never push to main and never force-push.

## For the orchestrator (the top-level session only; crew agents skip this)
Read **`PLAN.md`** first: the current stage, the operating model and the next steps. Then read the end of **`LOG.md`**. Keep both current, and start a fresh session for each stage.
