// Loads a GLB in Node with three r186's own GLTFLoader and MeshoptDecoder, exactly as the site will, minus image
// decoding: Node has no DOM image decoder, so each embedded image becomes an empty Texture that records its MIME type
// and byte length. Materials, maps, samplers and the node graph are still built by GLTFLoader itself.
import { readFileSync } from "node:fs";
import { Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

function nodeImages(parser) {
  parser.loadImageSource = (sourceIndex) => {
    const def = parser.json.images[sourceIndex];
    const bytes = def.bufferView !== undefined ? parser.json.bufferViews[def.bufferView].byteLength : 0;
    const texture = new Texture();
    texture.userData = { mimeType: def.mimeType, bytes };
    return Promise.resolve(texture);
  };
  return { name: "w_c13_node_images" };
}

export async function loadGlb(file) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).register(nodeImages);
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await loader.parseAsync(ab, "");
  gltf.scene.updateMatrixWorld(true);
  return gltf;
}

export function meshesOf(root) {
  const out = [];
  root.traverse((o) => o.isMesh && out.push(o));
  return out;
}

export function trisOf(root) {
  return meshesOf(root).reduce((t, m) => {
    const g = m.geometry;
    return t + (g.index ? g.index.count : g.attributes.position.count) / 3;
  }, 0);
}
