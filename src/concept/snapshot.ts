// Draws the intro page into a canvas, element by element from its live layout, so the raise can carry the exact page
// through the eyepiece shader. Only leaf elements marked data-snap (and the name's letters) are drawn.

const STRETCH: Record<string, string> = {
  '50%': 'ultra-condensed', '62.5%': 'extra-condensed', '75%': 'condensed', '87.5%': 'semi-condensed',
  '100%': 'normal', '112.5%': 'semi-expanded', '125%': 'expanded', '150%': 'extra-expanded', '200%': 'ultra-expanded',
};

function opacityOf(el: Element, stop: Element) {
  let o = 1;
  for (let e: Element | null = el; e && e !== stop; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity || '1');
  return o;
}

export function drawSnapshot(root: HTMLElement, canvas: HTMLCanvasElement, dpr: number, skip: Element[] = []) {
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H); // transparent: the eyepiece pass draws the waiting frame behind the page
  const els = root.querySelectorAll<HTMLElement>('[data-snap], .name .ch');
  els.forEach((el) => {
    if (skip.some((s) => s.contains(el))) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    ctx.globalAlpha = opacityOf(el, root);
    const kind = el.dataset.snap ?? 'text';
    if (kind === 'fill') {
      ctx.fillStyle = cs.backgroundColor;
      ctx.fillRect(r.left, r.top, r.width, r.height);
      return;
    }
    if (kind === 'box') {
      const bt = parseFloat(cs.borderTopWidth), bb = parseFloat(cs.borderBottomWidth);
      const bl = parseFloat(cs.borderLeftWidth), br = parseFloat(cs.borderRightWidth);
      ctx.fillStyle = cs.borderTopColor;
      if (bt) ctx.fillRect(r.left, r.top, r.width, bt);
      if (bb) ctx.fillRect(r.left, r.bottom - bb, r.width, bb);
      if (bl) ctx.fillRect(r.left, r.top, bl, r.height);
      if (br) ctx.fillRect(r.right - br, r.top, br, r.height);
      return;
    }
    let text = el.textContent ?? '';
    if (cs.textTransform === 'uppercase') text = text.toUpperCase();
    const size = parseFloat(cs.fontSize);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${STRETCH[cs.fontStretch] ?? 'normal'} ${size}px ${cs.fontFamily}`;
    try { (ctx as any).letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing; } catch { /* older engines */ }
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText('Hg');
    const A = m.fontBoundingBoxAscent, Dsc = m.fontBoundingBoxDescent;
    const lh = parseFloat(cs.lineHeight) || r.height;
    const top = r.top + parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
    const baseline = top + (lh - (A + Dsc)) / 2 + A;
    ctx.fillText(text.trim(), r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), baseline);
    if (el.classList.contains('ph')) {
      ctx.strokeStyle = 'rgba(236,233,226,0.32)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(r.left + 0.5, r.top + 0.5, r.width - 1, r.height - 1);
      ctx.setLineDash([]);
    }
  });
  ctx.globalAlpha = 1;
}
