// three ships no type declarations and @types/three is not on the deps allowlist yet (request filed by W-F).
// Until it is, three's modules type as any; keep three code inside src/stage/gl and src/gl.
declare module 'three';
declare module 'three/addons/*';
