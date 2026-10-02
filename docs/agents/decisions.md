# Decisions

The register of locked decisions. Only the orchestrator locks; only the owner can overturn an owner decision.
Every agent's `ack.decisionsRead` lists the IDs it relied on. Order of authority: owner-voice, then the
non-negotiables, then this file.

| ID | Topic | Decision | Status | By | Date |
|---|---|---|---|---|---|
| D-001 | Front Door direction | **Darkroom**. A backlit light table where every project is an instant print that develops, shot by a real 3D camera that is also the Manor's camera. **Grafts:** from Workbench, the press/spin/detent verbs on the camera (shutter, lens ring, mode dial), real 3D exhibit objects in the work section and the "Show the mesh" craft reveal; from Wet Proof, the typographic numbered index as the List view and the ink-drip used once only, on the Manor handoff. Direction doc: `docs/direction/creative-direction.md` | locked | owner | 2026-10-02 |
| D-002 | Identity | **Monogram:** the `[ ]` square brackets. **One shared accent:** amber/brass. The Manor's Brass is `#C59A45` (Mat.Brass); the Front Door's amber is tuned for contrast in tokens (never small text on light paper below 4.5:1). Both doors share the monogram, the accent, one bridging typeface and one spring table | locked | owner | 2026-10-02 |
| D-003 | Manor rooms | **Seven rooms:** Foyer, Grand Gallery (the arcade is a bay at its far end), Hall of Honours, Camera Room, **Workshop** (robotics/CAD; the robot/CAD statue lives here), **Study** (about and contact), Painting Wing. Painting Worlds are G zones behind the Wing. This overrides the M-Manager's 5-room proposal | locked | owner | 2026-10-02 |
| D-004 | Statue scale | The Hall of Honours is 9 m tall. The DECA glass award is about 4.25 m including its plinth; the robot/CAD statue is about 3.5 m. "Overly large, like statues" is confirmed at this scale | locked | owner | 2026-10-02 |
| D-005 | Stack (Front Door) | Astro 7, GSAP 3.15 (ScrollTrigger, SplitText, CustomEase), anime.js v4 springs, Lenis 1.3, three.js r186 (one shared persistent canvas, lazy after first paint), Paper Shaders GLSL, Swup 4, detect-gpu; GLB pipeline Blender to gltf-transform. Free tools only. Final dependency list in `deps.md` after Wave 1b | proposed | orchestrator | 2026-10-02 |
| D-006 | Film-look names | Our own names (e.g. Standard, Candle, Vivid, Mono, Cyanotype), never Fujifilm trademarks | proposed (owner may overturn) | orchestrator | 2026-10-02 |
| D-007 | Painting Worlds credits and titles | Public-domain artists are credited by name with their museum on wall labels; inspired-by artists are never named. The Fraud-style world's title is "The Imaginary Prisons". The Bosch world is toned down (no torture imagery) | proposed (owner may overturn) | orchestrator | 2026-10-02 |
| D-008 | Pasting photos in the Manor | Allowed in the Camera Room and in Painting Worlds; the Grand Gallery, Hall of Honours, Workshop and Study are protected. Collected lenses last for the visit only | proposed (owner may overturn) | orchestrator | 2026-10-02 |
| D-009 | Game door | The door into the original photo game stays in the Foyer only | proposed (owner may overturn) | orchestrator | 2026-10-02 |
| D-010 | Rights rule | US public domain means published 1930 or earlier until 2027-01-01, then 1931. The Starry Night shows 10 stars plus Venus and a crescent moon. Mondrian is cut | locked | orchestrator (from G-Manager) | 2026-10-02 |
