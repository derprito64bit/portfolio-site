# Skills and tools

**MACHINE RULES (owner, 2026-10-02: "my computer is getting eaten")**
- **Blender renders on the GPU only (AMD RX 6700 XT, HIP), never the CPU.**
  - In every Blender MCP session and every background script, first run
    `exec(open(r"C:\Users\Aaron\Documents\GitHub\project.ion\.claude\worktrees\overhaul\scripts\fork\blender_gpu.py").read())`.
    It sets HIP, enables only the GPU device and sets every scene's `cycles.device = 'GPU'`.
  - Never write `cycles.device = "CPU"`.
  - Use EEVEE for quick previews. Use Cycles at 64 samples or fewer, with denoising, for stills. Preview renders
    stay at 1600 px or less.
  - Cap `render.threads` at 4.
  - Never run two Blender renders at once (the `blender` lane).
  - The PC has no NVIDIA GPU (a stale RTX 3070 driver entry exists): never select CUDA or OptiX.
- **Close every browser you open, every time.**
  - `playwright-cli`: always open with `--idle-timeout 600000`, which closes it after 10 idle minutes. Close
    your session with `playwright-cli -s=<id> close` as soon as you are done and before you return your result.
    Run `playwright-cli list` and close anything of yours still open.
  - Lighthouse: let it exit; never leave it running.
  - Claude in Chrome tools: close every tab you opened with `tabs_close_mcp`.
  - Leftover automation browsers are killed by `scripts/fork/reap-browsers.ps1 -Kill`.
- **Fujifilm X-T5 fidelity (owner):** the camera is modelled on the Fujifilm X-T5 essentially 1:1. Gather
  reference images and dimensions. The **website** model is ultra-detailed; the **game/Manor** model is a
  simplified version made from the same proportions.


Load the skills for a task **before** making its decisions, not after. List the available skills first. If one named here is
missing, or another skill would materially help, you may install it after vetting
([`rules.web.md`](rules.web.md) rule 7). Report what you added in `skillsAdded`.

## By kind of task

| Task | Load or use |
|---|---|
| Any visual decision (layout, colour, composition) | `design-taste-frontend` (the primary taste skill), `frontend-design`, `web-design-guidelines` |
| Motion, springs, transitions, hover | `design-motion-principles`, `emil-design-eng`, `animate`, `review-animations` (critique); `gsap-skills` for GSAP |
| anime.js, Lenis, Astro, GSAP, three.js APIs | **Context7**. Try ToolSearch `context7` first; if it isn't loaded, use the REST API (below). Never write a library's API from memory |
| three.js and shaders | `threejs-fundamentals`, `threejs-shaders`, `threejs-postprocessing`, `threejs-loaders`, `threejs-textures`; Context7 for the current API. These skills have no licence: use them as guidance, never copy their code |
| Typography | `better-typography` |
| Accessibility | `better-accessibility`, `a11y-debugging`; `npx @axe-core/playwright` in your own browser session |
| Performance | `web-quality-skills`, `debug-optimize-lcp`, `memory-leak-debugging`; `npx lighthouse@13`, `npx size-limit` |
| Design tokens | `design-system` |
| Seeing the page (every gate) | `playwright-cli` in your own session, or `node scripts/crew.mjs shoot` once it exists. By hand: `playwright-cli -s=<id> open <url>`, `resize 1440 900`, `screenshot --filename=<path>`, `resize 390 844`, `screenshot`, `console`, then **`close`**. Run `playwright-cli list` at the end and close anything of yours still open. Gate on console text containing `ERROR`, not only the error level |
| 3D models and animation | **Blender MCP** (take the `blender` lane): model, rig, animate, export GLB. `npx @gltf-transform/cli optimize` (meshopt or Draco, KTX2/WebP textures). three.js `GLTFLoader` and `AnimationMixer`, with Context7 for the current API. GSAP ScrollTrigger for scroll-driven 3D. Poly Haven, Sketchfab and Poly Pizza through Blender MCP, CC0 or CC-BY only, credited |
| References | Awwwards (SOTD, nominees, Developer Awards), Codrops, studio sites, through WebFetch, WebSearch or `playwright-cli`. Start with `refs/references.md`, where the owner-named references come first |
| Images, models, fonts | `npx sharp-cli`, `npx @gltf-transform/cli`, `pyftsubset` (via `uvx --from fonttools`) |
| TypeScript code | the `typescript-lsp` plugin |
| GitHub | the `gh` CLI (no GitHub MCP) |

`ui-ux-pro-max` is reference only, never direction. `find-skills` (or `npx skills find <query>`) discovers skills;
install only after vetting.

## Context7 without the MCP

```powershell
$k = (Get-Content $env:LOCALAPPDATA\ion\context7.key).Trim()
curl.exe -s -H "Authorization: Bearer $k" "https://context7.com/api/v2/libs/search?libraryName=animejs&query=spring"
curl.exe -s -H "Authorization: Bearer $k" "https://context7.com/api/v2/context?libraryId=/websites/animejs&query=spring&type=txt"
```

**Never print, echo or commit the key**, and never run `claude mcp get context7`.

## Shared instances: take the lane

The Playwright, Chrome DevTools, Unity and Blender MCP servers each drive one app instance shared by every agent.
Claim the lane first with `powershell -File scripts/fleet/lane.ps1 acquire <lane> -Agent <id>`, `renew` it during
long work, and `release` it after. `status` shows the holders. Prefer lane-free tools (`playwright-cli` in your own
session) when they do the job.

## Deliberately not used

GitHub MCP, Figma, Cloudinary, community accessibility, image and 3D MCP servers, HyperFrames skills,
unvetted "Awwwards" skills, impeccable.
