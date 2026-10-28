// GL prints (W-S2, then W-C4; W-D013, W-D016, D-026). Loaded by the prints' pre-GL script after stage:gl-start.
// - One entity per [data-print] slot on the page camera (1 unit = 1 CSS px). It draws only while its print develops
//   or lifts, so at rest no slot is .is-gl and nothing is drawn.
// - It registers the real develop (ruling 2): window.__stage.registerEffect('develop', impl); ids it does not serve go
//   to next. A develop draws d from 0 under the still for one frame, then takes the slot, runs its token duration on
//   the stage clock (so __stage.seek drives it), and at d = 1 drops the DOM veil and gives the slot back in the same
//   frame; it keeps drawing d = 1 under the still for two more frames (WebKit presents a canvas a frame late).
// - The texture is the DOM still's own art at the canvas's device pixels: the strip's <symbol> rasterized as an SVG
//   image (the browser's own rasterizer, the same system mono face), or the decoded cover in its window. Focus never
//   moves.
// - The hover lift (H1) is GL only: the pre-GL script asks for it on a fine pointer, never on focus.
// Written as closures, not classes, so the minifier can shorten its state (the GL budget, #14 B1).
import { LinearFilter, Mesh, NoColorSpace, PlaneGeometry, Texture, WebGLRenderer } from 'three';
import { createDevelopMaterial, developCurve, grainScale } from '../effects/develop/index.ts';
import type { Entity, FrameInfo, GLApi } from '../../stage/gl/index.ts';
import type { Slot } from '../../stage/slots.ts';

export interface PrintsGL {
  /** Every developing print (or those of `ids`) jumps to d = 1 and hands back now (A4, reduced motion, a loss). */
  finish(ids?: string[]): void;
  lift(id: string, on: boolean): void;
}
interface Hooks {
  readonly tier: string;
  take(id: string): void;
  give(id: string): void;
  invalidate(): void;
  registerEffect(name: string, impl: unknown): void;
}
interface Opts {
  duration?: number;
  delay?: number;
}
type Done = { id: string; d: 1; developed: true };
interface PrintEntity extends Entity {
  develop(o?: Opts): Promise<Done>;
  finish(): void;
  lift(on: boolean): void;
}

const ents = new Map<string, PrintEntity>();

function print(id: string, gl: GLApi, st: Hooks): PrintEntity {
  let slot: Slot | null = null;
  let mesh: any = null;
  /** The card's box in the slot (CSS px), read when the slot's size changes. */
  let c = [0, 0, 0, 0];
  let sw = -1;
  // The develop: its resolve, start on the stage clock (-1 until its first frame), duration, delay.
  let done: ((r: Done) => void) | null = null;
  let t0 = -1;
  let dur = 1;
  let delay = 0;
  let d = 1;
  let on = false;
  let frames = 0;
  let taken = false;
  let tail = 0;
  let lift = 0;
  let liftTo = 0;
  const res: Done = { id, d: 1, developed: true };
  const card = () => slot?.el.querySelector<HTMLElement>('.print-card') ?? null;
  const tilt = () => Number(slot?.el.dataset.tilt) || 0;
  const measure = () => {
    const el = card();
    if (!slot || !el) return;
    sw = slot.w + slot.h * 1e4;
    c = [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight];
  };
  const drop = (free: boolean) => {
    if (!mesh) return;
    gl.pageScene.remove(mesh);
    if (free) {
      mesh.geometry.dispose();
      mesh.material.uniforms.uMap.value.dispose();
      mesh.material.dispose();
    }
    mesh = null;
  };
  /** The material and its texture, the still's own art at the canvas's device pixels. */
  const build = async (): Promise<boolean> => {
    const el = card();
    if (!slot || !el) return false;
    measure();
    const w = Math.min(1024, Math.round(c[2] * gl.renderer.getPixelRatio()));
    const h = Math.round((w * 86) / 54);
    if (w < 2) return false;
    if (mesh && Math.abs(mesh.material.uniforms.uMap.value.image.width - w) < 3) return true;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const x = cv.getContext('2d') as CanvasRenderingContext2D;
    let img = el.querySelector('img');
    // A cover fills the 46 x 62 window on paper (object-fit: cover at its focus); a strip is its <symbol> as an SVG
    // image filling the card. One object-fit computation draws both.
    const [wx, wy, ww, wh] = img ? [(w * 4) / 54, (h * 5) / 86, (w * 46) / 54, (h * 62) / 86] : [0, 0, w, h];
    if (img) {
      x.fillStyle = '#F6F5F1';
      x.fillRect(0, 0, w, h);
      x.rect(wx, wy, ww, wh);
      x.clip();
    } else {
      img = new Image();
      img.src = URL.createObjectURL(new Blob([(document.getElementById(`ts-${slot.el.dataset.strip}`)?.outerHTML ?? '').replace('<symbol', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"`).replace('</symbol>', '</svg>')], { type: 'image/svg+xml' }));
    }
    await img.decode();
    URL.revokeObjectURL(img.src); // a strip's blob; a no-op for a cover's URL
    const [iw, ih] = [img.naturalWidth, img.naturalHeight];
    const k = Math.max(ww / iw, wh / ih);
    const [fx, fy] = (img.style.objectPosition || '50% 50%').split(' ').map(parseFloat);
    x.drawImage(img, wx + ((ww - iw * k) * fx) / 100, wy + ((wh - ih * k) * fy) / 100, iw * k, ih * k);
    if (!slot) return false;
    drop(true);
    const tex = new Texture(cv);
    tex.colorSpace = NoColorSpace; // display-space maths: the still's sRGB bytes as they are (W-D016)
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const lite = st.tier === 'lite';
    const m = createDevelopMaterial({ map: tex, lite, seed: (id.length * 131 + id.charCodeAt(id.length - 1)) % 97, grain: grainScale(w, [54, 86], lite ? 3 : 2) });
    m.depthTest = false;
    mesh = new Mesh(new PlaneGeometry(1, 1), m);
    mesh.frustumCulled = mesh.visible = false;
    gl.pageScene.add(mesh);
    return true;
  };
  const release = () => {
    if (taken) st.give(id);
    taken = false;
  };
  /** d = 1: the DOM still is the developed print again and the slot goes back, in this frame. */
  const complete = () => {
    const r = done;
    slot?.el.removeAttribute('data-wet');
    done = null;
    release();
    tail = 2;
    r?.(res);
  };
  const visible = () => (Boolean(done) && on) || lift > 0 || tail > 0;
  const e: PrintEntity = {
    id,
    persistent: false,
    bind(s) {
      slot = s;
      sw = -1;
    },
    unbind() {
      e.finish();
      slot = null;
      if (mesh) mesh.visible = false;
    },
    async develop(o) {
      if (done || !(await build().catch(() => false))) return res;
      t0 = -1;
      delay = o?.delay ?? 0;
      dur = o?.duration ?? 2400;
      d = frames = 0;
      on = false;
      st.invalidate();
      return new Promise((r) => (done = r));
    },
    finish() {
      if (done) complete();
      liftTo = lift = 0;
      release();
    },
    async lift(up) {
      if (up && !(await build().catch(() => false))) return;
      liftTo = up ? 1 : 0;
      frames = taken ? 2 : 0;
      st.invalidate();
    },
    step(dt, time) {
      let moving = tail > 0;
      if (tail > 0) tail--;
      if (done) {
        if (t0 < 0) t0 = time + delay;
        const p = (time - t0) / dur;
        if (p < 0) return true;
        on = moving = true;
        d = p < 1 ? developCurve(p) : 1;
      }
      if (lift !== liftTo) {
        lift += (liftTo - lift) * (1 - Math.exp(-dt / 0.13)); // 50% in 90 ms (J5)
        if (Math.abs(liftTo - lift) < 0.004) lift = liftTo;
        moving = true;
      }
      const want = (Boolean(done) && on) || lift > 0;
      // Drawn under the still for one frame first, then taken: the slot never shows a frame without the print.
      if (want && !taken && ++frames > 1) {
        taken = true;
        st.take(id);
      }
      if (done && d >= 1 && taken) complete();
      if (!want) release();
      return moving;
    },
    place(f: FrameInfo) {
      if (!mesh) return;
      mesh.visible = visible() && Boolean(slot?.near);
      if (!mesh.visible || !slot) return;
      if (slot.w + slot.h * 1e4 !== sw) measure();
      const [cx, cy, cw, ch] = c;
      const u = mesh.material.uniforms;
      // The lift's quad margin (share of the quad per side) for the shader's contact shadow, only while lifted.
      const px = +(lift > 0) * 0.065;
      const py = +(lift > 0) * 0.05;
      const k = 1 + 0.025 * lift;
      u.uD.value = done ? d : 1;
      u.uShadow.value = lift;
      u.uPad.value.set(px, py);
      u.uRadius.value = 3 / cw;
      mesh.position.set(slot.cx - slot.w / 2 - scrollX + cx + cw / 2 - f.W / 2, f.H / 2 - (slot.cy - slot.h / 2 - f.sy + cy + ch / 2) + 5 * lift, 0);
      mesh.scale.set((cw * k) / (1 - 2 * px), (ch * k) / (1 - 2 * py), 1);
      mesh.rotation.z = (-tilt() * Math.PI) / 180;
    },
    visible,
    snap: () => e.finish(),
    // After a loss the old objects are only dropped (freeing them would hit the restored context); rebuilt on demand.
    restore: () => drop(false),
    dispose() {
      e.finish();
      drop(true);
      ents.delete(id);
    },
  };
  return e;
}

/** Bind the prints and register the develop; the pre-GL script calls this once GL is ready. */
export function install(st: Hooks, gl: GLApi): PrintsGL | null {
  // The stage's own renderer (importing it also keeps three in the stage's chunk instead of splitting it out).
  if (!(gl.renderer instanceof WebGLRenderer)) return null;
  gl.registerEntityFactory({
    match: (s) => s.kind === 'print' && !s.fixture && 'print' in s.el.dataset,
    create: (s) => {
      const e = print(s.id, gl, st);
      ents.set(s.id, e);
      return e;
    },
  });
  st.registerEffect('develop', (id: string, o: Opts | undefined, next: (id: string, o?: Opts) => Promise<Done>) => ents.get(id)?.develop(o) ?? next(id, o));
  const finish = (ids?: string[]) => ents.forEach((e, id) => (!ids || ids.includes(id)) && e.finish());
  // A lost context: the stage has handed every slot back; the prints are developed now, not later.
  gl.renderer.domElement.addEventListener('webglcontextlost', () => finish());
  return { finish, lift: (id, up) => void ents.get(id)?.lift(up) };
}
