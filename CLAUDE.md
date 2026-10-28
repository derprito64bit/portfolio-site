# portfolio-site

derprito64bit's personal portfolio website. **Its design is being reset from scratch** (owner, 2026-10-28: #101, D-036, D-037). The earlier "Darkroom" build (Astro 7, three.js r186, Lenis, Swup, prints and the X-T5 camera opening) is the starting codebase, not the design.

**The goal:** a sleek, smooth, immersive portfolio of ALL the owner's projects that never feels like a generic AI-made website. Aim for the craft of Awwwards sites (the owner names portfolio-zxc and Jesper Landberg), never a copy of their look (`docs/agents/owner-voice.md`).

**Standalone:** this portfolio is a project of its own. It is not connected to [project]ion (the game, the Manor) in theme, story, design or assets. The game is just one project shown in the gallery. Its repo, derprito64bit.github.io, is a separate track, paused until this site is live; don't work on it from here.

## For every agent
- **Ground truth is `docs/agents/`** (in the direction reset, D-037 lifts the design, dependency and budget rules; see the next bullets):
  - `PROTOCOL.md`: the process;
  - `budgets.md`: hard budgets and measurement rules;
  - `decisions.md`: locked decisions;
  - `ownership.json`: which crew owns which globs;
  - `deps.md`: the dependency allowlist;
  - `tokens.json`;
  - `north-star.md` and `owner-voice.md`: intent.
- **Direction lives in `docs/direction/`.** Your brief is your GitHub issue plus its **Orchestrator** comments, which bind.
- **The design is yours (D-037).** In the direction reset you have full autonomy to design the site from scratch. The owner's ideas in #101 (a preloader, a name intro, a Fuji-style EVF transition, galleries, achievements, liquid glass, trippy animation, animated text, a dark theme, no X-T5 for now) are guidelines: take them lightly, and drop or reshape any that doesn't flow.
- **Use external libraries and tools, and install them yourself.** Generic hand-rolled motion is what made the site feel AI-made. The owner's list is #65: GSAP (ScrollTrigger, SplitText), Motion, anime.js, Spline, Unicorn Studio, bklit ui, Kokonut UI; plus anything else that lifts the work, including shader and post-processing packages and new skills. `npm install` what you need (no request issue). Record each in `docs/agents/deps.md` (licence, size) in the same PR. Rules: free only, no paid tiers; no visible third-party branding or watermark on the site; no licence that blocks a portfolio.
- **Never invent owner facts.** `content/owner-facts.md` is the only source; anything else is a visible typed placeholder. No AI-generated images.
- **Work on a branch with a PR.** Never push to main and never force-push.

## For the orchestrator (the top-level session only; crew agents skip this)
Read **`PLAN.md`** first: the current stage, the operating model and the next steps. Then read the end of **`LOG.md`**. Keep both current, and start a fresh session for each stage.
