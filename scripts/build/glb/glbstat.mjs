// glbstat.mjs (W-C13): size (raw, gzip -9, brotli), triangles, draws, nodes, materials, images and extensions of
// each GLB, read straight from the GLB's JSON chunk (no decoder needed; meshopt keeps accessor counts).
// Based on the Wave 1b evidence tool (portfolio-evidence/wave1b/w-3d-art/src/glbstat.mjs).
//
//   node scripts/build/glb/glbstat.mjs public/models/*.glb [--out stat.json]
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

export function readGlbJson(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLen = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error("first GLB chunk is not JSON");
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));
}

export function glbStat(buf, file = "") {
  const j = readGlbJson(buf);
  const triPerMesh = (j.meshes ?? []).map((m) =>
    m.primitives.reduce((t, p) => {
      const acc = p.indices !== undefined ? j.accessors[p.indices] : j.accessors[p.attributes.POSITION];
      return t + (p.mode === undefined || p.mode === 4 ? acc.count / 3 : 0);
    }, 0),
  );
  const nodeTris = {};
  for (const n of j.nodes ?? []) if (n.mesh !== undefined) nodeTris[n.name] = triPerMesh[n.mesh];
  return {
    file: basename(file),
    bytes: buf.length,
    kB: +(buf.length / 1024).toFixed(1),
    gzipKB: +(gzipSync(buf, { level: 9 }).length / 1024).toFixed(1),
    brotliKB: +(brotliCompressSync(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length / 1024).toFixed(1),
    tris: triPerMesh.reduce((a, b) => a + b, 0),
    draws: (j.meshes ?? []).reduce((a, m) => a + m.primitives.length, 0),
    nodeTris,
    nodes: (j.nodes ?? []).map((n) => n.name ?? ""),
    materials: (j.materials ?? []).map((m) => m.name),
    images: (j.images ?? []).map((im) => `${im.mimeType}:${j.bufferViews[im.bufferView]?.byteLength ?? "?"}B`),
    extensionsUsed: j.extensionsUsed ?? [],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const outAt = args.indexOf("--out");
  const out = outAt >= 0 ? args.splice(outAt, 2)[1] : null;
  const stats = args.map((f) => glbStat(readFileSync(f), f));
  for (const s of stats) {
    console.log(`${s.file.padEnd(24)} tris ${String(s.tris).padStart(6)}  draws ${String(s.draws).padStart(3)}  ` +
      `raw ${s.kB} kB  gz ${s.gzipKB} kB  br ${s.brotliKB} kB  mats ${s.materials.join(",")}`);
  }
  if (out) writeFileSync(out, JSON.stringify(stats, null, 1) + "\n");
}
