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
// - install() returns the prints by id: the pre-GL script finishes and lifts them there, and finishes them all on a lost
//   context (code that does not draw lives in the pre-GL script, #14 c5995444490 and ruling 6462781328 item 1).
// Written as closures, not classes, so the minifier can shorten its state (the GL budget, #14 B1).
import { CanvasTexture, Mesh, PlaneGeometry, WebGLRenderer } from 'three';
import { createDevelopMaterial, developCurve, grainScale } from '../effects/develop/index.ts';
import type { Entity, FrameInfo, GLApi } from '../../stage/gl/index.ts';
import type { Slot } from '../../stage/slots.ts';

/** A GL print, as the pre-GL script drives it. */
export interface Print {
  /** A developing print jumps to d = 1 and hands back now, and a lift drops (A4, reduced motion, a loss). */
  finish(): void;
  lift(on: boolean): void;
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
interface PrintEntity extends Entity, Print {
  develop(o?: Opts): Promise<Done>;
}

const ents = new Map<string, PrintEntity>();

function print(id: string, gl: GLApi, st: Hooks): PrintEntity {
  // State starts undefined where undefined reads the same as its rest value (the GL budget, #14 B1): no slot, no mesh,
  // not developing, nothing taken, no tail. A develop sets its own clock; lift and liftTo start at 0 (the easing reads them).
  let slot: Slot | undefined;
  let mesh: any;
  /** The material's uniforms and its texture's width. */
  let u: any;
  let tw: number;
  /** The card's centre from the slot's centre and its size (CSS px), read when the slot's size changes. */
  let c: number[];
  let sw: number;
  // The develop: its resolve, start on the stage clock (-1 until its first frame), duration, delay.
  let done: ((r: Done) => void) | undefined | null;
  let t0: number;
  let dur: number;
  let delay: number;
  let d: number;
  let on: boolean;
  let frames: number;
  let taken: boolean;
  let tail: number;
  let lift = 0;
  let liftTo = 0;
  const res: Done = { id, d: 1, developed: true };
  const card = () => slot?.el.querySelector<HTMLElement>('.print-card');
  const measure = () => {
    const el = card();
    if (slot && el) {
      sw = slot.w + slot.h * 1e4;
      c = [el.offsetLeft + (el.offsetWidth - slot.w) / 2, el.offsetTop + (el.offsetHeight - slot.h) / 2, el.offsetWidth, el.offsetHeight];
    }
  };
  /** Off the scene; `free` also frees it (never after a loss: freeing would hit the restored context). */
  const drop = (free?: boolean) => {
    if (!mesh) return;
    gl.pageScene.remove(mesh);
    if (free) {
      mesh.geometry.dispose();
      u.uMap.value.dispose();
      mesh.material.dispose();
    }
    mesh = null;
  };
  /** The material and its texture, the still's own art at the canvas's device pixels; false when there is none. */
  const build = async (): Promise<boolean> => {
    const el = card();
    if (!slot || !el) return false;
    measure();
    const w = Math.min(1024, Math.round(c[2] * gl.renderer.getPixelRatio()));
    const h = Math.round((w * 86) / 54);
    if (w < 2) return false;
    if (mesh && Math.abs(tw - w) < 3) return true;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const x = cv.getContext('2d') as CanvasRenderingContext2D;
    let img = el.querySelector('img');
    // A cover fills the 46 x 62 window on paper (object-fit: cover at its focus); a strip is its <symbol> as an SVG
    // image filling the card. One object-fit computation, as a source crop, draws both (a strip: k = 1 at '0 0').
    let win = [0, 0, w, h];
    if (img) {
      x.fillStyle = '#F6F5F1';
      x.fillRect(0, 0, w, h);
      // The window by the card's width, as the DOM's padding percentages are.
      win = [4, 5, 46, 62].map((v) => (v * w) / 54);
    } else {
      // <symbol ...>...</symbol> becomes <svg xmlns ...>...</svg>: its tags sliced off, its own namespace.
      const sym = document.getElementById(`ts-${slot.el.dataset.strip}`)!;
      img = new Image();
      img.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="${sym.namespaceURI}" width="${w}" height="${h}"${sym.outerHTML.slice(7, -9)}</svg>`);
    }
    await img.decode();
    const [wx, wy, ww, wh] = win;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const k = Math.min(iw / ww, ih / wh);
    // A cover carries its focus inline.
    const [fx, fy] = (img.style.objectPosition || '0 0').split(' ').map(parseFloat);
    x.drawImage(img, ((iw - ww * k) * fx) / 100, ((ih - wh * k) * fy) / 100, ww * k, wh * k, wx, wy, ww, wh);
    if (!slot) return false;
    drop(true);
    // colorSpace stays NoColorSpace (three's default): display-space maths on the still's sRGB bytes (W-D016).
    const tex = new CanvasTexture(cv);
    tex.minFilter = 1006; // three's LinearFilter: no mipmaps (the print draws near 1:1)
    tex.generateMipmaps = false;
    tw = w;
    const lite = st.tier === 'lite';
    const m = createDevelopMaterial({ map: tex, lite, seed: id.length * 131 + id.charCodeAt(id.length - 1), grain: grainScale(w, undefined, lite ? 3 : 2) });
    m.depthTest = false;
    u = m.uniforms;
    mesh = new Mesh(new PlaneGeometry(1, 1), m);
    mesh.visible = false;
    gl.pageScene.add(mesh);
    return true;
  };
  const ready = () => build().catch(() => false);
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
  const want = () => (Boolean(done) && on) || lift > 0;
  const visible = () => want() || tail > 0;
  const finish = () => {
    if (done) complete();
    liftTo = lift = 0;
    release();
  };
  // No `persistent` (the stage reads it as false): a print rebinds to nothing across a swap.
  const e: Omit<PrintEntity, 'persistent'> = {
    id,
    bind(s: Slot) {
      slot = s;
      sw = -1;
    },
    unbind() {
      finish();
      slot = undefined;
      if (mesh) mesh.visible = false;
    },
    async develop(o?: Opts) {
      if (done || !(await ready())) return res;
      t0 = -1;
      delay = o?.delay ?? 0;
      dur = o?.duration as number; // always a token duration (prints.ts); without one, NaN progress resolves at once
      d = frames = 0;
      on = false;
      st.invalidate();
      return new Promise<Done>((r) => (done = r));
    },
    finish,
    async lift(up: boolean) {
      if (up && !(await ready())) return;
      liftTo = up ? 1 : 0;
      frames = taken ? 2 : 0;
      st.invalidate();
    },
    step(dt: number, time: number) {
      let moving = tail-- > 0;
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
      const w = want();
      // Drawn under the still for one frame first, then taken: the slot never shows a frame without the print.
      if (w && !taken && ++frames > 1) {
        taken = true;
        st.take(id);
      }
      if (done && d >= 1 && taken) complete();
      if (!w) release();
      return moving;
    },
    place(f: FrameInfo) {
      if (!mesh) return;
      mesh.visible = visible() && Boolean(slot?.near);
      if (!mesh.visible) return;
      const s = slot as Slot;
      if (s.w + s.h * 1e4 !== sw) measure();
      const [cx, cy, cw, ch] = c;
      // The lift's quad margin (share of the quad per side) for the shader's contact shadow, only while lifted.
      const px = lift && 0.065;
      const py = lift && 0.05;
      const k = 1 + 0.025 * lift;
      u.uD.value = done ? d : 1;
      u.uShadow.value = lift;
      u.uPad.value.set(px, py);
      u.uRadius.value = 3 / cw;
      mesh.position.set(s.cx + cx - scrollX - f.W / 2, f.H / 2 - (s.cy + cy - f.sy) + 5 * lift, 0);
      mesh.scale.set((cw * k) / (1 - 2 * px), (ch * k) / (1 - 2 * py), 1);
      mesh.rotation.z = (-(Number(s.el.dataset.tilt) || 0) * Math.PI) / 180;
    },
    visible,
    snap: finish,
    // After a loss the old objects are only dropped (the stage calls restore() without arguments); rebuilt on demand.
    restore: drop,
    dispose() {
      finish();
      drop(true);
      ents.delete(id);
    },
  };
  ents.set(id, e as PrintEntity);
  return e as PrintEntity;
}

/** Bind the prints and register the develop; the pre-GL script calls this once GL is ready, and finishes and lifts
 *  the prints by id through what it returns (a lost context finishes them all there too). */
export function install(st: Hooks, gl: GLApi): Map<string, Print> {
  // Only on three's WebGLRenderer: the develop material is GLSL. (This import also keeps three in one chunk: a
  // src/gl/prints that imports only three.core makes rolldown split three in two, about 1.4 kB more GL, #14 B1.)
  if (gl.renderer instanceof WebGLRenderer) gl.registerEntityFactory({
    // data-print marks W-S2's print links (data-gl="print"): no other slot carries it (the /bench/ fixtures never do).
    match: (s) => 'print' in s.el.dataset,
    create: (s) => print(s.id, gl, st),
  });
  // An impl that returns undefined falls through to next (src/stage/effects.ts): other ids get the no-op.
  st.registerEffect('develop', (id: string, o?: Opts) => ents.get(id)?.develop(o));
  return ents;
}
