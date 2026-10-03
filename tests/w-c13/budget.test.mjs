// W-C13: camera budgets (budgets.md, D-021) measured on the shipped files, and the repo rule "no .blend".
// GPU-free (CI). Run: node --test tests/w-c13/
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { glbStat } from "../../scripts/build/glb/glbstat.mjs";
import { loadGlb, trisOf } from "./lib/load-glb.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// D-021 (owner): LOD0 <= 100k tris and 800 kB gz; LOD1 <= 15k and 150 kB gz; Manor LOD about 1.5k tris.
const BUDGET = {
  "camera_xt_lod0.glb": { tris: 100_000, gzipKB: 800 },
  "camera_xt_lod1.glb": { tris: 15_000, gzipKB: 150 },
  "camera_xt_manor.glb": { tris: 1_500 },
};

for (const [file, budget] of Object.entries(BUDGET)) {
  test(`${file} is within D-021 (${budget.tris} tris${budget.gzipKB ? `, ${budget.gzipKB} kB gz` : ""})`, async () => {
    const stat = glbStat(readFileSync(join(repo, "public/models", file)), file);
    const tris = trisOf((await loadGlb(join(repo, "public/models", file))).scene);
    assert.equal(tris, stat.tris, "three and glbstat count the same triangles");
    assert.ok(tris <= budget.tris, `${tris} tris > ${budget.tris}`);
    if (budget.gzipKB) assert.ok(stat.gzipKB <= budget.gzipKB, `${stat.gzipKB} kB gz > ${budget.gzipKB}`);
  });
}

test("every shipped model is accounted for by a budget", () => {
  const shipped = readdirSync(join(repo, "public/models")).filter((f) => f.endsWith(".glb")).sort();
  assert.deepEqual(shipped, Object.keys(BUDGET).sort());
});

test("no .blend file is tracked in the repo (rules.web.md rule 7)", () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: repo, encoding: "utf8" }).split("\0");
  assert.deepEqual(tracked.filter((f) => /\.blend\d*$/i.test(f)), []);
});
