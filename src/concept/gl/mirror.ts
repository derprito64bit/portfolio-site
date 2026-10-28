// Mirrors DOM display type into a 2D canvas each frame so the glass can refract it. The DOM keeps the real,
// selectable text (made transparent while GL runs); the mirror reads each split part's live rect, so GSAP SplitText
// reveals (translate plus line masks) and opacity on any ancestor carry over exactly.

interface Part {
  el: HTMLElement;
  text: string;
  clip: HTMLElement | null;
}

interface Item {
  root: HTMLElement;
  parts: Part[];
  font: string;
  letterSpacing: string;
  color: string;
  baseline: number;
}

export class TextMirror {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  items: Item[] = [];
  dpr = 1;
  w = 0;
  h = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context');
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    for (const it of this.items) this.measure(it);
  }

  /** Register a root whose visible text is made of `parts` (SplitText chars or words). */
  add(root: HTMLElement, parts: HTMLElement[]) {
    this.remove(root);
    const item: Item = {
      root,
      parts: parts.map((el) => ({ el, text: el.textContent ?? '', clip: el.closest<HTMLElement>('.m-mask') })),
      font: '',
      letterSpacing: '0px',
      color: '#ECEAE4',
      baseline: 0,
    };
    this.measure(item);
    this.items.push(item);
  }

  remove(root: HTMLElement) {
    this.items = this.items.filter((i) => i.root !== root);
  }

  private measure(it: Item) {
    const first = it.parts[0]?.el ?? it.root;
    const cs = getComputedStyle(first);
    const stretch = stretchKeyword(cs.fontStretch);
    it.font = `${cs.fontStyle === 'italic' ? 'italic ' : ''}${cs.fontWeight} ${stretch} ${cs.fontSize} ${cs.fontFamily}`;
    it.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
    it.color = getComputedStyle(it.root).getPropertyValue('--tc').trim() || '#ECEAE4';
    const ctx = this.ctx;
    ctx.font = it.font;
    const m = ctx.measureText('Hg');
    const asc = m.fontBoundingBoxAscent;
    const desc = m.fontBoundingBoxDescent;
    const lh = parseFloat(cs.lineHeight);
    const boxH = Number.isFinite(lh) ? lh : asc + desc;
    it.baseline = (boxH - (asc + desc)) / 2 + asc;
  }

  draw() {
    const { ctx, dpr } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = 'alphabetic';
    for (const it of this.items) {
      const op = chainOpacity(it.root);
      if (op < 0.003) continue;
      if (typeof it.root.checkVisibility === 'function' && !it.root.checkVisibility({ visibilityProperty: true })) continue;
      const rr = it.root.getBoundingClientRect();
      if (rr.bottom < -200 || rr.top > this.h + 200 || rr.width === 0) continue;
      ctx.font = it.font;
      (ctx as unknown as { letterSpacing: string }).letterSpacing = it.letterSpacing;
      ctx.fillStyle = it.color;
      for (const p of it.parts) {
        const o = op * partOpacity(p.el, it.root);
        if (o < 0.003) continue;
        const r = p.el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > this.h) continue;
        ctx.save();
        if (p.clip) {
          const c = p.clip.getBoundingClientRect();
          ctx.beginPath();
          ctx.rect(c.left - 2, c.top, c.width + 4, c.height);
          ctx.clip();
        }
        ctx.globalAlpha = o;
        ctx.fillText(p.el.textContent ?? '', r.left, r.top + it.baseline);
        ctx.restore();
      }
    }
  }
}

function stretchKeyword(v: string): string {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return v || 'normal';
  if (n <= 62) return 'extra-condensed';
  if (n <= 81) return 'condensed';
  if (n <= 94) return 'semi-condensed';
  if (n <= 106) return 'normal';
  if (n <= 118) return 'semi-expanded';
  if (n <= 137) return 'expanded';
  return 'extra-expanded';
}

function chainOpacity(el: HTMLElement): number {
  let o = 1;
  let n: HTMLElement | null = el;
  while (n && n !== document.body) {
    const s = n.style.opacity;
    if (s !== '') o *= parseFloat(s);
    if (n.style.visibility === 'hidden' || n.hidden) return 0;
    n = n.parentElement;
  }
  return o;
}

function partOpacity(el: HTMLElement, root: HTMLElement): number {
  let o = 1;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    const s = n.style.opacity;
    if (s !== '') o *= parseFloat(s);
    n = n.parentElement;
  }
  return o;
}
