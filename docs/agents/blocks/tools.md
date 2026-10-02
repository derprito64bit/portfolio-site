# Skills and tools

Load the skills for a task **before** making its decisions, not after. List the available skills first; if one
named here is missing, do not install it: report it in `toolGaps` and continue.

## By kind of task

| Task | Load or use |
|---|---|
| Any visual decision (layout, colour, composition) | `design-taste-frontend` (the primary taste skill), `frontend-design`, `web-design-guidelines` |
| Motion, springs, transitions, hover | `design-motion-principles`, `emil-design-eng`, `animate`, `review-animations` (critique); `gsap-skills` for GSAP |
| anime.js or Lenis APIs | **Context7** (find it with ToolSearch `context7`); never write their APIs from memory |
| three.js and shaders | `threejs-fundamentals`, `threejs-shaders`, `threejs-postprocessing`, `threejs-loaders`, `threejs-textures`; Context7 for the current API. These skills have no licence: use them as guidance, never copy their code |
| Typography | `better-typography` |
| Accessibility | `better-accessibility`, `a11y-debugging`; `npx @axe-core/playwright` in your own browser session |
| Performance | `web-quality-skills`, `debug-optimize-lcp`, `memory-leak-debugging`; `npx lighthouse@13`, `npx size-limit` |
| Design tokens | `design-system` |
| Seeing the page (every gate) | `playwright-cli` in your own session, or `node scripts/crew.mjs shoot` once it exists |
| Images, models, fonts | `npx sharp-cli`, `npx @gltf-transform/cli`, `pyftsubset` (via `uvx --from fonttools`) |
| TypeScript code | the `typescript-lsp` plugin |
| GitHub | the `gh` CLI (no GitHub MCP) |

`ui-ux-pro-max` is reference only, never direction. `find-skills` is for discovering a skill, not installing one
mid-task.

## Reserved: do not use

The Playwright MCP, Chrome DevTools MCP, Unity MCP and Blender MCP are single shared instances. Only the
orchestrator or one agent named in its brief may use them. The DevTools *skills* above are fine; their MCP
steps are not, so run the same checks in your own browser session.

## Deliberately not used

GitHub MCP, Figma, Cloudinary, community accessibility, image and 3D MCP servers, HyperFrames skills,
unvetted "Awwwards" skills, impeccable.
