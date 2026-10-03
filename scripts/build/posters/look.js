// look.js (W-C13): the reference camera look for posters until the hero crew's own look module exists.
// Taken from the locked Darkroom prototype (docs/direction/darkroom/index.html, renderer and scene setup):
// Neutral tone mapping, a RoomEnvironment reflection map (PMREM, sigma 0.04), a white key light from the upper left
// front and the amber safelight rim (#E39B2B) from the right rear.
//
// Interface, which any replacement must keep (render.mjs --look <module>):
//   export async function applyLook({ renderer, scene, tier }) -> { dispose() }
// It may set renderer tone mapping and exposure, scene.environment and lights. It must not touch the camera or the
// model's transforms: the framing belongs to stage.js and posters.json.
import { Color, DirectionalLight, NeutralToneMapping, PMREMGenerator, SRGBColorSpace } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export async function applyLook({ renderer, scene }) {
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = SRGBColorSpace;
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  scene.environment = env;
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(-0.5, 1, 1.2);
  const rim = new DirectionalLight(new Color(0xe39b2b), 1.4);
  rim.position.set(1, 0.3, -0.6);
  scene.add(key, rim);
  room.dispose();
  pmrem.dispose();
  return {
    dispose() {
      scene.remove(key, rim);
      env.dispose();
      scene.environment = null;
    },
  };
}
