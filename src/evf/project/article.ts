// The project page's article, fetched and adopted (D-041, D-055, W-V1 A2). The Viewfinder never builds project content
// from strings: it fetches /work/<slug>/ (same origin), parses it with DOMParser and moves the article's children into
// #proj's column. The h1 becomes an h2 (the dialog's title: #proj-title), and an id already in the document is dropped,
// so ids stay unique. One parse per project per visit; a failed fetch is forgotten, so the next open retries.

const cache = new Map<string, Promise<Document>>();
let requests = 0;

/** The project page, parsed (cached). */
export function loadArticle(slug: string): Promise<Document> {
  let p = cache.get(slug);
  if (!p) {
    requests++;
    p = fetch(`/work/${slug}/`, { credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw new Error(`/work/${slug}/: ${r.status}`);
        return r.text();
      })
      .then((t) => {
        const doc = new DOMParser().parseFromString(t, 'text/html');
        if (!doc.querySelector('article.pj')) throw new Error(`/work/${slug}/: no project article`);
        return doc;
      });
    p.catch(() => cache.delete(slug));
    cache.set(slug, p);
  }
  return p;
}

/** Starts the fetch and parse; errors wait for the open that needs them. */
export function prefetch(slug: string) {
  loadArticle(slug).catch(() => {});
}

/** Has this project been parsed already? */
export const parsed = (slug: string) => cache.has(slug);
/** How many page requests this visit has made (the prefetch test reads it under ?vf-test). */
export const requestCount = () => requests;

/** Moves a parsed page's article into `col`. Returns the page's title. */
export function adopt(doc: Document, col: HTMLElement): { title: string; article: HTMLElement } {
  const art = doc.querySelector<HTMLElement>('article.pj');
  if (!art) throw new Error('no project article');
  const nodes = [...art.children].map((n) => document.importNode(n, true) as HTMLElement);
  const holder = document.createElement('div');
  holder.append(...nodes);
  const h1 = holder.querySelector('h1');
  if (h1) {
    const h2 = document.createElement('h2');
    for (const a of [...h1.attributes]) h2.setAttribute(a.name, a.value);
    h2.append(...h1.childNodes);
    h2.id = 'proj-title';
    h2.tabIndex = -1;
    h1.replaceWith(h2);
  }
  // the old column's ids leave with it; anything still in the document wins
  col.replaceChildren();
  holder.querySelectorAll<HTMLElement>('[id]').forEach((e) => {
    if (e.id !== 'proj-title' && document.getElementById(e.id)) e.removeAttribute('id');
  });
  col.append(...holder.childNodes);
  col.dataset.slug = art.dataset.slug ?? '';
  return { title: doc.title, article: art };
}
