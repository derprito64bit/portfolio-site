"""Static Bricolage Grotesque instance for the camera's [d64] strap tag (W-C13 m2, W-D006, tokens.monogram).

Blender cannot pick a variable font's instance, so build.ps1 makes one before the Blender step:
  uvx --from fonttools[woff]==4.66.1 --with brotli==1.2.0 python scripts/build/glb/mono_font.py <out.ttf>
Source: public/fonts/bricolage-mark.woff2 (the wordmark subset W-F ships: '[] derprito64bit', OFL-1.1), instanced at
tokens.monogram's opsz 96, wght 800 (wdth 100). Build-only: the TTF stays in the asset cache, never in the repo.
"""
import os
import sys

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
SRC = os.path.join(ROOT, "public", "fonts", "bricolage-mark.woff2")
AXES = {"opsz": 96, "wdth": 100, "wght": 800}

out = sys.argv[1]
font = TTFont(SRC)
limits = {tag: v for tag, v in AXES.items() if tag in [a.axisTag for a in font["fvar"].axes]}
static = instancer.instantiateVariableFont(font, limits)
static.flavor = None
os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
static.save(out)
print("mono font", out, limits)
