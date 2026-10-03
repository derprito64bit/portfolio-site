"""Build the four self-hosted font subsets in public/fonts/ (W-D008). Run: npm run fonts

Ported from the w-type Wave 1b ship script after a read for the foundation crew. Build-only tools:
fonttools 4.66.1 and brotli 1.2.0 through uvx (deps.md); nothing here ships to the browser.

  bricolage-mark.woff2           only the wordmark glyphs "[] derprito64bit" + space; opsz 96, wdth 75-100, wght 300-800
  bricolage-display-wd90.woff2   Latin; opsz 72, wdth 90, wght 300-800
  bricolage-text.woff2           Latin; opsz 16, wdth 100, wght 400-700
  geist-mono-500.woff2           Latin; Geist Mono static 500 (edge print only)

Sources are google/fonts files at pinned commits, verified by SHA-256 before use (OFL-1.1, no Reserved Font Name).
"""
import hashlib
import io
import os
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'public', 'fonts')
CACHE = os.path.join(os.environ.get('TEMP') or os.environ.get('TMPDIR') or '/tmp', 'portfolio-site-fonts')

SOURCES = {
    'bricolage': {
        'url': 'https://raw.githubusercontent.com/google/fonts/9710da1eacb3be272583c3224dcb70f9da6eadbb/ofl/bricolagegrotesque/BricolageGrotesque%5Bopsz%2Cwdth%2Cwght%5D.ttf',
        'sha256': '413e7357809ddd12fd80a96a8a396de0e401638d4acd3cb3e37532f0472ac682',
    },
    'geistmono': {
        'url': 'https://raw.githubusercontent.com/google/fonts/9710da1eacb3be272583c3224dcb70f9da6eadbb/ofl/geistmono/GeistMono%5Bwght%5D.ttf',
        'sha256': 'd00e590b8eb3a59acc329b2d044fd143ae935090b7da33199ebee27cc7de8196',
    },
}

LATIN = ('U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,'
         'U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+2190-2199')
FEATURES = ['kern', 'ccmp', 'locl', 'mark', 'mkmk', 'tnum', 'lnum', 'pnum', 'case', 'frac', 'numr', 'dnom',
            'sups', 'ss09']
BUDGET_TOTAL = 100_000   # budgets.md: fonts <= 100 kB
BUDGET_PRELOAD = 46_000  # budgets.md: preloaded (mark + text) <= 46 kB


def source(key):
    spec = SOURCES[key]
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, key + '.ttf')
    if not os.path.exists(path):
        with urllib.request.urlopen(spec['url']) as r, open(path, 'wb') as f:
            f.write(r.read())
    digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
    if digest != spec['sha256']:
        os.remove(path)
        sys.exit(f'fonts: {key} source hash {digest} does not match the pin {spec["sha256"]}')
    return path


def uni(spec):
    out = []
    for part in spec.split(','):
        part = part.strip().replace('U+', '')
        if '-' in part:
            a, b = part.split('-')
            out.extend(range(int(a, 16), int(b, 16) + 1))
        elif part:
            out.append(int(part, 16))
    return out


def make(src, name, limits, text=None):
    # recalcTimestamp=False keeps the source's head.modified, so the same inputs give the same bytes.
    font = TTFont(src, lazy=False, recalcTimestamp=False)
    font = instancer.instantiateVariableFont(font, limits, updateFontNames=False)
    font.recalcTimestamp = False
    buf = io.BytesIO()
    font.save(buf)
    buf.seek(0)
    font = TTFont(buf, lazy=False, recalcTimestamp=False)
    o = subset.Options()
    o.flavor = 'woff2'
    o.layout_features = FEATURES
    o.name_IDs = ['*']
    o.name_legacy = True
    o.name_languages = ['*']
    o.notdef_outline = True
    o.hinting = False
    o.drop_tables += ['DSIG']
    s = subset.Subsetter(options=o)
    if text is not None:
        s.populate(text=text)
    else:
        s.populate(unicodes=uni(LATIN))
    s.subset(font)
    path = os.path.join(OUT, name)
    font.flavor = 'woff2'
    font.save(path)
    n = os.path.getsize(path)
    print(f'{name:32s} {n:7d} B')
    return n


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'derprito64bit'
    bri, gm = source('bricolage'), source('geistmono')
    os.makedirs(OUT, exist_ok=True)
    sizes = {
        'mark': make(bri, 'bricolage-mark.woff2', {'opsz': 96, 'wdth': (75, 100), 'wght': (300, 800)}, text='[] ' + name),
        'display': make(bri, 'bricolage-display-wd90.woff2', {'opsz': 72, 'wdth': 90, 'wght': (300, 800)}),
        'text': make(bri, 'bricolage-text.woff2', {'opsz': 16, 'wdth': 100, 'wght': (400, 700)}),
        'mono': make(gm, 'geist-mono-500.woff2', {'wght': 500}),
    }
    total = sum(sizes.values())
    preload = sizes['mark'] + sizes['text']
    print(f'total {total} B (limit {BUDGET_TOTAL}); preload mark + text {preload} B (limit {BUDGET_PRELOAD})')
    if total > BUDGET_TOTAL or preload > BUDGET_PRELOAD:
        sys.exit('fonts: over budget')


if __name__ == '__main__':
    main()
