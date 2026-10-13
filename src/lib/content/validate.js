// Content schema v2 rules (W-D005, W-D022). One rule set, used by the build (src/lib/content/index.ts),
// scripts/check/ph-gate.mjs and tests/harness/content. Zero dependencies, plain ESM so Node can import it.
//
// Placeholder rules, as locked:
// - display text is the token [PLACEHOLDER: what is missing];
// - asset, enum and link fields are "" while an entry is a placeholder;
// - a placeholder:true entry holds only tokens (or "") in its string fields, except identifiers and
//   presentation settings (EXEMPT below);
// - a placeholder:false entry needs a source and holds no token.

/** One token, matched exactly (W-D022). */
export const TOKEN = /\[PLACEHOLDER: [^[\]\r\n]{1,80}\]/g;
/** A whole-string token. */
export const TOKEN_ONLY = /^\[PLACEHOLDER: [^[\]\r\n]{1,80}\]$/;
/** Anything that looks like a placeholder marker, well-formed or not. */
export const MARKER = /\[?\bplace[- ]?holder\b/gi;
/** Banned copy (docs/agents/blocks/quality.md). This file and scripts/check are the only places it may appear. */
export const BANNED = /\b(seamless(ly)?|elevat(e|es|ed|ing)|immersive journey|unleash(es|ed|ing)?|cutting[- ]edge|bento|glassmorphism|revolutioni[sz](e|es|ed|ing)|next[- ]level|world[- ]class)\b/gi;
/** Em and en dashes are banned in copy (W-D023). */
export const DASHES = new RegExp('[\\u2013\\u2014]', 'g');

export const KINDS = ['software', 'game', '3d-art', 'robotics-cad'];
export const AWARD_KINDS = ['glass', 'trophy', 'plaque', 'certificate'];
export const METALS = ['', 'gold', 'silver', 'bronze'];
export const WORLD_STATUS = ['live', 'building', 'planned'];
export const CREDIT_MODES = ['public-domain', 'original'];
export const MEDIA_TYPES = { image: /\.(png|jpe?g)$/i, model: /\.glb$/i, video: /\.(mp4|webm)$/i };

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX = /^#[0-9A-Fa-f]{6}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Declared classes: field -> kind. d = display text, o = optional display, a = asset, l = link, e = enum,
 *  x = exempt string, b = boolean, n = number, c:<Class> = object, [d] / [c:<Class>] = arrays. */
export const CLASSES = {
  ProjectsFile: { schema: 'n', owner: 'x', projects: '[c:Project]' },
  Project: {
    slug: 'x', title: 'd', kind: 'e', role: 'd', year: 'd', blurb: 'd', body: '[d]', tools: '[d]', url: 'l',
    links: '[c:Link]', demo: 'l', cover: 'a', coverAlt: 'o', focus: 'c:Focus', media: '[c:Media]', look: 'x',
    tint: 'x', featured: 'b', hero: 'b', placeholder: 'b', source: 'x',
  },
  Link: { label: 'd', href: 'l' },
  Focus: { x: 'n', y: 'n' },
  Media: {
    type: 'x', src: 'a', alt: 'o', caption: 'o', poster: 'a', captions: 'a', audio: 'b', decorative: 'b',
  },
  HonoursFile: { schema: 'n', owner: 'x', awards: '[c:Honour]', medals: '[c:Honour]' },
  Honour: {
    slug: 'x', title: 'd', event: 'd', placement: 'd', year: 'd', kind: 'e', metal: 'e', photo: 'a',
    photoAlt: 'o', project: 'l', hero: 'b', placeholder: 'b', source: 'x',
  },
  WorldsFile: { schema: 'n', worlds: '[c:World]' },
  World: {
    slug: 'x', key: 'x', title: 'd', status: 'e', publishAfter: 'x', credit: 'c:Credit', still: 'a',
    stillAlt: 'o', teaser: 'b', placeholder: 'b', source: 'x',
  },
  Credit: { mode: 'e', artist: 'd', work: 'd', year: 'd', museum: 'd', museumUrl: 'l' },
  ProfileFile: {
    schema: 'n', owner: 'x', name: 'x', line: 'd', about: '[d]', email: 'l', links: '[c:Link]',
    placeholder: 'b', source: 'x',
  },
};

/**
 * Validate the four content files plus the film-look ids from tokens.
 * @param {{ projects: any, honours: any, worlds: any, profile: any, lookIds: string[] }} input
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateContent({ projects, honours, worlds, profile, lookIds }) {
  const errors = [];
  const warnings = [];
  const err = (file, path, msg) => errors.push(`content/${file} ${path}: ${msg}`);

  // ---------- 1. JsonUtility safety and declared classes ----------
  function shape(file, value, cls, path) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      err(file, path, `must be an object of class ${cls}`);
      return;
    }
    const fields = CLASSES[cls];
    for (const key of Object.keys(value)) {
      if (!IDENT.test(key)) err(file, `${path}.${key}`, 'key is not a C# field name (a dictionary?)');
      else if (!(key in fields)) err(file, `${path}.${key}`, `unknown field for ${cls}`);
    }
    for (const [key, kind] of Object.entries(fields)) {
      const v = value[key];
      const at = `${path}.${key}`;
      if (!(key in value)) { err(file, at, `missing (every ${cls} field is required)`); continue; }
      if (v === null) { err(file, at, 'null is not allowed; use "" or false'); continue; }
      if (kind === 'b') { if (typeof v !== 'boolean') err(file, at, 'must be true or false'); continue; }
      if (kind === 'n') { if (typeof v !== 'number' || !Number.isFinite(v)) err(file, at, 'must be a number'); continue; }
      if (kind.startsWith('c:')) { shape(file, v, kind.slice(2), at); continue; }
      if (kind.startsWith('[')) {
        if (!Array.isArray(v)) { err(file, at, 'must be an array'); continue; }
        const inner = kind.slice(1, -1);
        v.forEach((item, i) => {
          if (Array.isArray(item)) err(file, `${at}[${i}]`, 'nested arrays are not readable by JsonUtility');
          else if (inner.startsWith('c:')) shape(file, item, inner.slice(2), `${at}[${i}]`);
          else if (typeof item !== 'string') err(file, `${at}[${i}]`, 'must be a string');
        });
        continue;
      }
      if (typeof v !== 'string') err(file, at, 'must be a string');
    }
  }

  // ---------- 2. Copy hygiene for every string ----------
  function strings(file, value, path, visit) {
    if (typeof value === 'string') visit(value, path);
    else if (Array.isArray(value)) value.forEach((v, i) => strings(file, v, `${path}[${i}]`, visit));
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(file, v, `${path}.${k}`, visit);
  }
  function hygiene(file, root) {
    strings(file, root, '$', (s, at) => {
      const markers = s.match(MARKER) || [];
      const tokens = s.match(TOKEN) || [];
      if (markers.length !== tokens.length) err(file, at, `malformed or unmarked placeholder text "${s}"`);
      if (BANNED.test(s)) err(file, at, `banned phrase in "${s}"`);
      BANNED.lastIndex = 0;
      if (DASHES.test(s)) err(file, at, `em or en dash in "${s}" (write "2024 to 2026")`);
      DASHES.lastIndex = 0;
    });
  }

  // ---------- 3. Placeholder typing per entry ----------
  function entry(file, e, cls, path) {
    if (!e || typeof e !== 'object') return;
    const isPh = e.placeholder === true;
    if (e.placeholder === false) {
      if (!e.source) err(file, path, 'a confirmed entry (placeholder:false) needs a source');
      if (JSON.stringify(e).match(TOKEN)) err(file, path, 'placeholder:false but it still holds a token');
    }
    if (isPh) typed(file, e, cls, path);
  }
  function typed(file, value, cls, path) {
    for (const [key, kind] of Object.entries(CLASSES[cls])) {
      const v = value[key];
      const at = `${path}.${key}`;
      if (v === undefined || v === null) continue;
      if (kind.startsWith('c:')) { typed(file, v, kind.slice(2), at); continue; }
      if (kind.startsWith('[')) {
        const inner = kind.slice(1, -1);
        if (!Array.isArray(v)) continue;
        v.forEach((item, i) => {
          if (inner.startsWith('c:')) typed(file, item, inner.slice(2), `${at}[${i}]`);
          else if (inner === 'd' && !TOKEN_ONLY.test(item)) err(file, `${at}[${i}]`, `placeholder entry: "${item}" must be a token`);
        });
        continue;
      }
      if (typeof v !== 'string') continue;
      if (kind === 'd' && !TOKEN_ONLY.test(v)) err(file, at, `placeholder entry: display text "${v}" must be one token`);
      if (kind === 'o' && v !== '' && !TOKEN_ONLY.test(v)) err(file, at, `placeholder entry: "${v}" must be "" or one token`);
      if ((kind === 'a' || kind === 'l' || kind === 'e') && v !== '') err(file, at, `placeholder entry: asset, enum and link fields stay "" (got "${v}")`);
    }
  }

  // ---------- 4. Text alternatives (W-D005, rt-a11y) ----------
  function altRule(file, at, src, alt, decorative = false) {
    if (src && !alt && !decorative) err(file, at, 'a non-empty src needs a non-empty alt, or decorative:true');
  }

  const slugs = new Set();
  const slug = (file, at, s) => {
    if (!KEBAB.test(s || '')) err(file, at, 'slug must be kebab-case');
    if (slugs.has(s)) err(file, at, `duplicate slug ${s}`);
    slugs.add(s);
  };

  // ---------- projects.json ----------
  shape('projects.json', projects, 'ProjectsFile', '$');
  if (projects?.schema !== 2) err('projects.json', '$.schema', 'must be 2');
  hygiene('projects.json', projects);
  let featured = 0;
  let heroes = 0;
  (projects?.projects || []).forEach((p, i) => {
    const at = `$.projects[${i}]`;
    slug('projects.json', `${at}.slug`, p.slug);
    entry('projects.json', p, 'Project', at);
    if (!(p.kind === '' && p.placeholder) && !KINDS.includes(p.kind)) err('projects.json', `${at}.kind`, `one of ${KINDS.join(', ')} ("" only while a placeholder)`);
    if (!lookIds.includes(p.look)) err('projects.json', `${at}.look`, `one of ${lookIds.join(', ')} (D-006)`);
    if (!HEX.test(p.tint || '')) err('projects.json', `${at}.tint`, 'must be #RRGGBB');
    if (p.url && !/^https:\/\//.test(p.url)) err('projects.json', `${at}.url`, 'https only');
    if (p.demo && !/^\/[a-z0-9\-/]+\/$/.test(p.demo)) err('projects.json', `${at}.demo`, 'a site path like /arcade/<name>/');
    if (p.cover && !/^media\/[a-z0-9-]+\/[^/]+\.(png|jpe?g)$/i.test(p.cover)) err('projects.json', `${at}.cover`, 'media/<slug>/<file>.png|jpg (masters only, W-D026)');
    altRule('projects.json', `${at}.coverAlt`, p.cover, p.coverAlt);
    if (p.focus && !(p.focus.x >= 0 && p.focus.x <= 1 && p.focus.y >= 0 && p.focus.y <= 1)) err('projects.json', `${at}.focus`, 'x and y in 0..1');
    (p.links || []).forEach((l, j) => {
      if (l.href && !/^(https:\/\/|mailto:|\/)/.test(l.href)) err('projects.json', `${at}.links[${j}].href`, 'https, mailto or a site path');
    });
    (p.media || []).forEach((m, j) => {
      const mat = `${at}.media[${j}]`;
      const re = MEDIA_TYPES[m.type];
      if (!re) err('projects.json', `${mat}.type`, 'image, model or video');
      else if (m.src && !re.test(m.src)) err('projects.json', `${mat}.src`, `wrong file type for ${m.type}`);
      altRule('projects.json', `${mat}.alt`, m.src, m.alt, m.decorative);
      if (m.type !== 'image' && m.src && !m.poster) err('projects.json', mat, `a ${m.type} needs a poster image (static tier)`);
      if (m.type === 'video' && m.audio && !/\.vtt$/i.test(m.captions || '')) err('projects.json', `${mat}.captions`, 'a video with audio:true needs captions (a .vtt path)');
      if (m.type !== 'video' && (m.audio || m.captions)) err('projects.json', mat, 'audio and captions apply to video only');
      if (!m.src && p.placeholder === false) err('projects.json', mat, 'empty src on a confirmed project');
    });
    if (p.featured) featured++;
    if (p.hero) {
      heroes++;
      if (p.kind && p.kind !== 'robotics-cad') err('projects.json', at, 'the hero statue lives in the Workshop, so kind must be robotics-cad');
    }
  });
  if (featured > 8) err('projects.json', '$.projects', `${featured} featured; at most 8`);
  if (featured < 3) warnings.push('content/projects.json: fewer than 3 featured; the home page has 3 enlargements');
  if (heroes > 1) err('projects.json', '$.projects', 'at most one hero project (the Workshop statue)');
  const projectSlugs = new Set((projects?.projects || []).map((p) => p.slug));

  // ---------- honours.json ----------
  shape('honours.json', honours, 'HonoursFile', '$');
  if (honours?.schema !== 2) err('honours.json', '$.schema', 'must be 2');
  hygiene('honours.json', honours);
  let heroAwards = 0;
  for (const list of ['awards', 'medals']) {
    (honours?.[list] || []).forEach((h, i) => {
      const at = `$.${list}[${i}]`;
      slug('honours.json', `${at}.slug`, h.slug);
      entry('honours.json', h, 'Honour', at);
      const kinds = list === 'medals' ? ['medal'] : AWARD_KINDS;
      if (!(h.kind === '' && h.placeholder) && !kinds.includes(h.kind)) err('honours.json', `${at}.kind`, `one of ${kinds.join(', ')} ("" only while a placeholder)`);
      if (!METALS.includes(h.metal)) err('honours.json', `${at}.metal`, `one of ${METALS.map((m) => m || '""').join(', ')} ("" means unknown, never guessed)`);
      if (h.photo && !/\.(png|jpe?g)$/i.test(h.photo)) err('honours.json', `${at}.photo`, 'PNG or JPG master');
      altRule('honours.json', `${at}.photoAlt`, h.photo, h.photoAlt);
      if (h.project && !projectSlugs.has(h.project)) err('honours.json', `${at}.project`, 'unknown project slug');
      if (h.hero) {
        heroAwards++;
        if (list !== 'awards') err('honours.json', at, 'only an award can be the Hall hero');
      }
    });
  }
  if (heroAwards > 1) err('honours.json', '$', 'at most one hero award (the Hall apse)');

  // ---------- worlds.json ----------
  shape('worlds.json', worlds, 'WorldsFile', '$');
  if (worlds?.schema !== 2) err('worlds.json', '$.schema', 'must be 2');
  hygiene('worlds.json', worlds);
  let teasers = 0;
  (worlds?.worlds || []).forEach((w, i) => {
    const at = `$.worlds[${i}]`;
    slug('worlds.json', `${at}.slug`, w.slug);
    entry('worlds.json', w, 'World', at);
    if (w.key !== `pf.world.${w.slug}`) err('worlds.json', `${at}.key`, 'must be pf.world.<slug>');
    if (!(w.status === '' && w.placeholder) && !WORLD_STATUS.includes(w.status)) err('worlds.json', `${at}.status`, `one of ${WORLD_STATUS.join(', ')}`);
    if (w.publishAfter && !ISO.test(w.publishAfter)) err('worlds.json', `${at}.publishAfter`, 'YYYY-MM-DD or ""');
    const c = w.credit || {};
    if (!(c.mode === '' && w.placeholder) && !CREDIT_MODES.includes(c.mode)) err('worlds.json', `${at}.credit.mode`, `one of ${CREDIT_MODES.join(', ')}`);
    if (c.mode === 'original' && (c.artist || c.work || c.museum)) err('worlds.json', `${at}.credit`, 'an original world names no artist (D-007)');
    altRule('worlds.json', `${at}.stillAlt`, w.still, w.stillAlt);
    if (w.teaser) {
      teasers++;
      if (w.publishAfter) err('worlds.json', at, 'a teaser cannot wait on publishAfter');
    }
  });
  if (teasers > 1) err('worlds.json', '$.worlds', 'at most one teaser on the home page');

  // ---------- profile.json ----------
  shape('profile.json', profile, 'ProfileFile', '$');
  if (profile?.schema !== 2) err('profile.json', '$.schema', 'must be 2');
  hygiene('profile.json', profile);
  entry('profile.json', profile, 'ProfileFile', '$');
  if (profile?.email && !/^[^@\s]+@[^@\s]+$/.test(profile.email)) err('profile.json', '$.email', 'not an address');
  (profile?.links || []).forEach((l, j) => {
    if (l.href && !/^(https:\/\/|mailto:)/.test(l.href)) err('profile.json', `$.links[${j}].href`, 'https or mailto');
  });

  return { errors, warnings };
}

/** Frame code for the n-th project in file order (W-D022): 1A, 2A, ... */
export function frameCode(index) {
  return `${index + 1}A`;
}

/** Does a string hold a token? */
export function hasToken(s) {
  TOKEN.lastIndex = 0;
  const found = TOKEN.test(String(s));
  TOKEN.lastIndex = 0;
  return found;
}
