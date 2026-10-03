// WCAG 2.3.1 flash analysis (general flash and red flash) on a frame sequence, after the W3C definitions:
// - a general flash is a pair of opposing changes in relative luminance of 10% or more of the maximum, where the
//   darker image is below 0.80, over a combined area of 25% or more of any 10-degree visual field
//   (341 x 256 px on a 1024 x 768 screen at typical viewing distance);
// - a red flash is a pair of opposing transitions involving a saturated red (R / (R + G + B) >= 0.8, with a change in
//   (R - G - B) x 320 of more than 20);
// - more than 3 flashes in any one-second window fails.
// Frames: [{ data: Uint8Array RGB or RGBA, width, height, channels }], all the same size, captured at `fps`.

const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const LUT = Float64Array.from({ length: 256 }, (_, i) => lin(i / 255));

/** The 10-degree field window for this frame size, scaled from 341 x 256 at 1024 x 768. */
export function fieldWindow(width, height) {
  const s = Math.sqrt((width * height) / (1024 * 768));
  return { w: Math.max(1, Math.round(341 * s)), h: Math.max(1, Math.round(256 * s)) };
}

/** Largest count of marked pixels inside any field window (summed-area table, stride 4). */
function maxWindowArea(mask, width, height, win) {
  const W = width + 1;
  const sat = new Uint32Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += mask[y * width + x];
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row;
    }
  }
  const ww = Math.min(win.w, width);
  const wh = Math.min(win.h, height);
  let best = 0;
  for (let y = 0; y + wh <= height; y += 4) {
    for (let x = 0; x + ww <= width; x += 4) {
      const a = sat[(y + wh) * W + x + ww] - sat[y * W + x + ww] - sat[(y + wh) * W + x] + sat[y * W + x];
      if (a > best) best = a;
    }
  }
  return { area: best, windowArea: ww * wh };
}

/** Per-frame-pair transitions: +1 (brighter), -1 (darker) or 0, for general and red flashes. */
function transitions(frames) {
  const { width, height } = frames[0];
  const win = fieldWindow(width, height);
  const n = width * height;
  const lum = frames.map((f) => {
    const out = new Float64Array(n);
    const ch = f.channels;
    for (let i = 0; i < n; i++) out[i] = 0.2126 * LUT[f.data[i * ch]] + 0.7152 * LUT[f.data[i * ch + 1]] + 0.0722 * LUT[f.data[i * ch + 2]];
    return out;
  });
  const red = frames.map((f) => {
    const out = new Float64Array(n);
    const sat = new Uint8Array(n);
    const ch = f.channels;
    for (let i = 0; i < n; i++) {
      const r = f.data[i * ch] / 255, g = f.data[i * ch + 1] / 255, b = f.data[i * ch + 2] / 255;
      out[i] = Math.max(0, (r - g - b) * 320);
      sat[i] = r + g + b > 0 && r / (r + g + b) >= 0.8 ? 1 : 0;
    }
    return { v: out, sat };
  });
  const general = [];
  const redT = [];
  const inc = new Uint8Array(n);
  const dec = new Uint8Array(n);
  const rinc = new Uint8Array(n);
  const rdec = new Uint8Array(n);
  for (let k = 1; k < frames.length; k++) {
    const a = lum[k - 1], b = lum[k];
    const ra = red[k - 1], rb = red[k];
    for (let i = 0; i < n; i++) {
      const d = b[i] - a[i];
      const darker = Math.min(a[i], b[i]);
      inc[i] = d >= 0.1 && darker < 0.8 ? 1 : 0;
      dec[i] = d <= -0.1 && darker < 0.8 ? 1 : 0;
      const involvesRed = ra.sat[i] || rb.sat[i];
      const rd = rb.v[i] - ra.v[i];
      rinc[i] = involvesRed && rd > 20 ? 1 : 0;
      rdec[i] = involvesRed && rd < -20 ? 1 : 0;
    }
    const threshold = 0.25;
    const ai = maxWindowArea(inc, width, height, win);
    const ad = maxWindowArea(dec, width, height, win);
    general.push(ai.area >= threshold * ai.windowArea ? 1 : ad.area >= threshold * ad.windowArea ? -1 : 0);
    const ri = maxWindowArea(rinc, width, height, win);
    const rdd = maxWindowArea(rdec, width, height, win);
    redT.push(ri.area >= threshold * ri.windowArea ? 1 : rdd.area >= threshold * rdd.windowArea ? -1 : 0);
  }
  return { general, red: redT };
}

/** Most flashes (pairs of opposing transitions) in any one-second window. */
function maxFlashesPerSecond(trans, fps) {
  const events = [];
  let last = 0;
  trans.forEach((s, i) => {
    if (s !== 0 && s !== last) {
      events.push(i);
      last = s;
    }
  });
  let best = 0;
  for (let i = 0; i < events.length; i++) {
    let j = i;
    while (j < events.length && events[j] - events[i] < fps) j++;
    best = Math.max(best, Math.floor((j - i) / 2));
  }
  return best;
}

export function analyse(frames, fps = 60) {
  if (frames.length < 2) return { pass: true, frames: frames.length, generalPerSecond: 0, redPerSecond: 0 };
  const t = transitions(frames);
  const generalPerSecond = maxFlashesPerSecond(t.general, fps);
  const redPerSecond = maxFlashesPerSecond(t.red, fps);
  return { pass: generalPerSecond <= 3 && redPerSecond <= 3, frames: frames.length, fps, generalPerSecond, redPerSecond, window: fieldWindow(frames[0].width, frames[0].height) };
}
