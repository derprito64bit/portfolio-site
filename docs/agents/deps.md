# Dependencies allowlist

Every npm package, font, shader source and third-party asset in the build has a row here before it lands. The
deps check (added to CI by the foundation crew) fails on anything installed that is not listed.

- Add a row through a request issue with a `depRequests[]` entry. The orchestrator approves it with a decision.
- Only the foundation crew then edits `package.json` and the lockfile.
- Free and permissively licensed only (see [`blocks/rules.web.md`](blocks/rules.web.md)).
- `gzip kB` is what the package adds to the shipped client bundle, **measured** with `size-limit` after it lands
  (an **estimate** before that, labelled as such). Build-only tools are `0 (build)`.

| Package or asset | Version | Licence | gzip kB | Decision | Used for |
|---|---|---|---|---|---|

No dependencies yet.
