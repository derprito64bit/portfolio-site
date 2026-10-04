# build_camera.py: the camera GLB family, milestone m2 (W-C13, issue #16): the 1:1 silver Fujifilm X-T5.
#
# ONE script emits the three LODs (front-door-plan W-D019): LOD0 (web full tier, <= 100k tris and 800 kB gz, D-021),
# LOD1 (web lite tier, <= 15k tris and 150 kB gz) and the Manor LOD (<= 1.5k tris, flat FlatToon slots).
#   - The model is the modeller's round-4 X-T5 (xt5/xt5model.py: hand-modelled by script from measured references,
#     D-015; silver and black, D-014), imported as a module. LOD1 is the same model with its detail knobs turned down
#     (xt5lib.LODQ). The Manor LOD is built here from the same measured proportions (control map, hump, plates).
#   - The real FUJIFILM and X-T5 lettering (D-011) is two decal nodes, mark_fujifilm (hump front) and mark_xt5 (top
#     plate front), on every LOD: quads that sample one alpha-tested lettering atlas (cam_lettering / mat_lettering,
#     albedo + normal). The atlas also holds the owner's [d64] monogram for strap_tag (W-D006: never on the body).
#   - A strap (node strap: a cord loop and a disc anchor on each lug) carries strap_tag, the [d64] tag on the
#     grip-side anchor, which faces the hero poses (tokens.stage.poses, yaw toward -X).
#
# Run headless (scripts/build/glb/build.ps1 does this inside the blender lane, GPU only):
#   blender -b --factory-startup --python build_camera.py -- --out <export dir> --blend <.blend outside the repos>
#       --tex <texture cache outside the repos> --mono-font <static Bricolage TTF (build.ps1 makes it)>
#       [--report <json>] [--gpu-script <blender_gpu.py>]
# Units: modelled in mm (refs frame), exported in metres, glTF +Y up, the lens looks down +Z, +X is the camera's left.
import json
import math
import os
import sys

sys.dont_write_bytecode = True        # no __pycache__ next to the sources
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


GPU_SCRIPT = arg("--gpu-script") or os.environ.get(
    "ION_BLENDER_GPU", r"C:\Users\Aaron\Documents\GitHub\project.ion\.claude\worktrees\overhaul\scripts\fork\blender_gpu.py")
exec(open(GPU_SCRIPT).read())  # D-012: GPU only, never cycles.device = CPU

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "xt5"))
import xt5lib  # noqa: E402
import xt5model as X  # noqa: E402
from xt5lib import AX_X, MM, TO_BLENDER, Geo, T, catmull, fillet_poly, loft, revolve  # noqa: E402

OUT = os.path.abspath(arg("--out", os.path.join(HERE, "export")))
BLEND = os.path.abspath(arg("--blend", os.path.join(os.path.expanduser("~"), "camera_xt.blend")))
TEX = os.path.abspath(arg("--tex", os.path.join(os.path.dirname(BLEND), "tex")))
MONO_FONT = arg("--mono-font")
REPORT = arg("--report")
FILES = {"lod0": "camera_xt_lod0.glb", "lod1": "camera_xt_lod1.glb", "manor": "camera_xt_manor.glb"}

# Detail knobs per web LOD (xt5lib.LODQ). LOD0 is the modeller's full detail, with a 0.5-degree limited dissolve
# (flat runs only). LOD1: fewer revolve steps, plain bands, no meshed text, a 4-degree dissolve, then a shared
# collapse ratio down to LOD1_TARGET (lite tier, D-021 cap 15k).
LOD1_Q = {"rev": 0.25, "rev_lens": 0.3, "rev_min": 6, "knurl": False, "gear": False, "text": False, "bevel_segs": 1}
LOD0_DISSOLVE_DEG, LOD1_DISSOLVE_DEG = 0.5, 4.0
LOD1_TARGET = int(arg("--lod1-target", 14000))
# Texture sizes per LOD (px): the chassis leather strip (normal; colour and roughness at half), the tileable thumb
# rest / door grains (normal; colour and roughness at half) and the lettering atlas (4:1.5 aspect).
TEX_SIZE = {"lod0": {"strip": 2048, "tile": 256, "atlas": 1024},
            "lod1": {"strip": 512, "tile": 64, "atlas": 512},
            "manor": {"atlas": 256}}
LIFT = 0.05          # decal lift above its face (mm): above the 14-bit position quantization of the body (0.008 mm)


def srgb(h):
    """Linear RGBA of a hex colour (shader socket values)."""
    return X.srgb(h)


def hex01(h):
    """sRGB-encoded RGB of a hex colour (byte-image pixel values: Image.pixels are not colour-managed)."""
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


# ===================================================================================== lettering atlas
# Master atlas 2048 x 768 px at 64 px/mm (top-down rows). Regions hold the marks at their real size, so a decal quad
# maps mm to atlas px 1:1 at that scale; the web LODs ship it downsampled (TEX_SIZE).
ATLAS_W, ATLAS_H, ATLAS_PPM = 2048, 768, 64.0
MARGIN = 0.3         # mm of transparent border round each mark inside its quad


def mark_edges():
    """FUJIFILM and X-T5 outlines (logos.json, traced from the calibrated official front render) as edge lists in
    face mm: [((x0, y0), (x1, y1)), ...] over every ring (outer and holes; the fill is even-odd)."""
    out = {}
    for k in ("FUJIFILM", "X-T5"):
        edges = []
        for ext, holes in X.LOGOS[k]["polys"]:
            for ring in [ext] + holes:
                edges += [(tuple(ring[i]), tuple(ring[(i + 1) % len(ring)])) for i in range(len(ring))]
        out[k] = edges
    return out


def text_edges(s, size, fontpath, align_x="CENTER"):
    """Outline edges (mm, local XY) of a text in a font: the font curve meshed without fill, so the outlines are
    rasterised even-odd (immune to the fill's triangle orientation)."""
    cu = bpy.data.curves.new("t", "FONT")
    cu.body = s
    cu.size = size
    cu.align_x = align_x
    cu.align_y = "CENTER"
    cu.resolution_u = 8
    cu.fill_mode = "NONE"
    cu.font = xt5lib.font(fontpath)
    ob = bpy.data.objects.new("t", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    edges = [((me.vertices[e.vertices[0]].co.x, me.vertices[e.vertices[0]].co.y),
              (me.vertices[e.vertices[1]].co.x, me.vertices[e.vertices[1]].co.y)) for e in me.edges]
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bpy.data.meshes.remove(me)
    return edges


def edges_bbox(edges):
    xs = [p[0] for e in edges for p in e]
    ys = [p[1] for e in edges for p in e]
    return min(xs), min(ys), max(xs), max(ys)


def monogram_edges(cap_mm=2.6):
    """[d64] typeset in Bricolage Grotesque (opsz 96, wght 800: tokens.monogram). Returns (edges, (xa, xb)): the
    brackets lie left of xa and right of xb (amber, the identity colour), d64 between (on-dark ink)."""
    if not MONO_FONT or not os.path.exists(MONO_FONT):
        raise SystemExit(f"--mono-font missing ({MONO_FONT}); build.ps1 makes the static Bricolage instance")
    size = cap_mm / 0.7                      # Bricolage cap height ~0.7 em
    full = text_edges("[d64]", size, MONO_FONT)
    x0, _, x1, _ = edges_bbox(full)
    lw = edges_bbox(text_edges("[", size, MONO_FONT))
    rw = edges_bbox(text_edges("]", size, MONO_FONT))
    return full, (x0 + (lw[2] - lw[0]) + 0.05, x1 - (rw[2] - rw[0]) - 0.05)


def raster_fill(edges_px, w, h, nonzero=False, ss=4):
    """Coverage (h, w) of the fill of directed edges given in region px (top-down), ss x ss supersampled. Even-odd
    for the traced logos (rings with holes, orientation unknown); non-zero for font outlines, whose variable-font
    contours overlap (stem and bar of the 4, the brackets' arms)."""
    E = np.array(edges_px, np.float64).reshape(-1, 4)
    xa, ya, xb, yb = E[:, 0], E[:, 1], E[:, 2], E[:, 3]
    W, H = w * ss, h * ss
    cols = (np.arange(W) + 0.5) / ss
    hit = np.zeros((H, W), bool)
    for r in range(H):
        y = (r + 0.5) / ss
        up = (ya <= y) & (yb > y)
        dn = (yb <= y) & (ya > y)
        m = up | dn
        if not m.any():
            continue
        xs = xa[m] + (y - ya[m]) * (xb[m] - xa[m]) / (yb[m] - ya[m])
        o = np.argsort(xs, kind="stable")
        xs, wind = xs[o], np.where(up[m], 1, -1)[o]
        acc = 0
        for i in range(len(xs) - 1):
            acc = acc + wind[i] if nonzero else acc ^ 1
            if acc != 0:
                hit[r] |= (cols >= xs[i]) & (cols < xs[i + 1])
    return hit.reshape(h, ss, w, ss).mean(axis=(1, 3)).astype(np.float32)


def build_atlas():
    """Rasterises the marks into the master atlas. Returns (rgba float array top-down, regions{mark: {'mm': (x0, y0,
    x1, y1) in face mm, 'uv': (u0, v0, u1, v1) atlas fractions, top-down}})."""
    cov = np.zeros((ATLAS_H, ATLAS_W), np.float32)
    col = np.zeros((ATLAS_H, ATLAS_W, 3), np.float32)
    ink = hex01("#0e0e0e")          # black-filled print on the silver plates (D-014)
    amber = hex01("#E39B2B")        # tokens accent.amber: brackets mean identity (W-D006)
    paper = hex01("#ECE8E0")        # tokens door.on-dark
    regions = {}
    slots = {"FUJIFILM": (32, 24), "X-T5": (32, 448), "D64": (1180, 400)}   # top-left px of each region
    marks = {k: (e, None) for k, e in mark_edges().items()}
    marks["D64"] = monogram_edges()
    for k, (edges, split) in marks.items():
        x0, y0, x1, y1 = edges_bbox(edges)
        x0, y0, x1, y1 = x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN
        sx, sy = slots[k]
        w, h = int(math.ceil((x1 - x0) * ATLAS_PPM)), int(math.ceil((y1 - y0) * ATLAS_PPM))
        x1, y0 = x0 + w / ATLAS_PPM, y1 - h / ATLAS_PPM                  # whole pixels: the quad maps 1:1
        assert sx + w <= ATLAS_W and sy + h <= ATLAS_H, (k, w, h)
        px = [((a[0] - x0) * ATLAS_PPM, (y1 - a[1]) * ATLAS_PPM, (b[0] - x0) * ATLAS_PPM, (y1 - b[1]) * ATLAS_PPM)
              for a, b in edges]
        cov[sy:sy + h, sx:sx + w] = raster_fill(px, w, h, nonzero=split is not None)
        if split is None:
            col[sy:sy + h, sx:sx + w] = ink
        else:
            mm_x = x0 + (np.arange(w) + 0.5) / ATLAS_PPM
            is_br = (mm_x < split[0]) | (mm_x > split[1])
            col[sy:sy + h, sx:sx + w] = np.where(is_br[None, :, None], amber, paper)
        regions[k] = {"mm": (x0, y0, x1, y1), "uv": (sx / ATLAS_W, sy / ATLAS_H, (sx + w) / ATLAS_W, (sy + h) / ATLAS_H)}
    rgba = np.concatenate([col, cov[..., None]], -1)
    return rgba, regions


def atlas_normal(cov, strength=0.06):
    """Tangent-space normal of a slightly raised print (height = blurred coverage, ~0.03 mm), top-down array."""
    h = cov.astype(np.float32)
    for _ in range(3):                                    # small box blur: soft print edges
        h = (h + np.roll(h, 1, 0) + np.roll(h, -1, 0) + np.roll(h, 1, 1) + np.roll(h, -1, 1)) / 5.0
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx, ny, nz = -dx * strength * ATLAS_PPM, dy * strength * ATLAS_PPM, np.ones_like(h)   # rows run down: flip y
    ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    return np.stack([0.5 + 0.5 * nx / ln, 0.5 + 0.5 * ny / ln, 0.5 + 0.5 * nz / ln, np.ones_like(h)], -1)


def downsample(arr, w, h, normal=False):
    """Area-average a top-down (H, W, 4) array to (h, w, 4) by integer factors; renormalise normal maps."""
    H, W = arr.shape[:2]
    fy, fx = H // h, W // w
    assert fy * h == H and fx * w == W, (W, H, w, h)
    out = arr.reshape(h, fy, w, fx, arr.shape[2]).mean(axis=(1, 3))
    if normal:
        n = out[..., :3] * 2 - 1
        n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-9
        out[..., :3] = n * 0.5 + 0.5
    return out


def save_image(name, arr_topdown, colorspace, alpha):
    """New packed PNG image from a top-down float array (Blender rows run bottom-up)."""
    old = bpy.data.images.get(name)
    if old is not None:
        bpy.data.images.remove(old)
    h, w = arr_topdown.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=alpha)
    if alpha:
        img.alpha_mode = "STRAIGHT"
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.clip(arr_topdown[::-1], 0.0, 1.0).astype(np.float32).ravel())
    os.makedirs(os.path.join(TEX, "web"), exist_ok=True)
    img.filepath_raw = os.path.join(TEX, "web", name + ".png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def image_array(img):
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)[::-1].copy()           # top-down


def lettering_material(name, albedo_img, normal_img, metal=0.0, rough=0.5):
    """Alpha-tested decal material (glTF alphaMode MASK, cutoff 0.5: image alpha through Math Round)."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n_ in list(nt.nodes):
        if n_.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL"):
            nt.nodes.remove(n_)
    b = next(n_ for n_ in nt.nodes if n_.type == "BSDF_PRINCIPLED")
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = albedo_img
    tex.interpolation = "Linear"
    rnd = nt.nodes.new("ShaderNodeMath")
    rnd.operation = "ROUND"
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], rnd.inputs[0])
    nt.links.new(rnd.outputs["Value"], b.inputs["Alpha"])
    if normal_img is not None:
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = normal_img
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    try:
        m.surface_render_method = "DITHERED"
    except (AttributeError, TypeError):
        pass
    return m


# ===================================================================================== decals and strap geometry
def decal_quad(name, region, M, mat_key="decal"):
    """A 2-triangle decal: the region's mm rectangle (face coords) placed by M (face -> refs mm), atlas UVs."""
    x0, y0, x1, y1 = region["mm"]
    u0, v0, u1, v1 = region["uv"]
    g = Geo(name)
    vs = [(x0, y0, 0.0), (x1, y0, 0.0), (x1, y1, 0.0), (x0, y1, 0.0)]
    uvs = [[(u0, 1 - v1), (u1, 1 - v1), (u1, 1 - v0), (u0, 1 - v0)]]   # Blender UVs run bottom-up
    g.add(vs, [(0, 1, 2, 3)], mat_key, smooth=False, M=M, uvs=uvs)
    return g


def mark_frames():
    """Face frames (local x right, y up, z out) of the two marks on the body: FUJIFILM on the hump's vertical front
    face (Z 15.25, X-T5 hump_dims), X-T5 on the top plate's front face (Z 14.0, logos.json plane_z)."""
    zf = X.hump_dims(75.0)[0]
    zx = X.LOGOS["X-T5"]["plane_z"]
    return {"mark_fujifilm": ("FUJIFILM", T(0, 0, zf + LIFT)), "mark_xt5": ("X-T5", T(0, 0, zx + LIFT))}


ANCHOR = {"drop": 19.0, "r": 7.0, "t": 2.6, "cord_r": 0.8}     # mm: disc centre below the eyelet, radius, thickness


def strap_geo(lod):
    """The strap: on each lug a cord loop through the eyelet (the lug's Z-axis hole, LUG_HOLE_R 1.35) hanging to a
    disc anchor beside the body side. Returns (geo, tag_frame): tag_frame places the [d64] decal on the grip-side
    anchor's outer face (normal -X, reading toward +Z for a viewer outside)."""
    seg = {"lod0": (8, 2, 32), "lod1": (6, 1, 16), "manor": (4, 1, 8)}[lod]     # cord sides, path steps, disc steps
    sides, nper, ndisc = seg
    g = Geo("strap_mesh")
    tag_frame = None
    a = ANCHOR
    for key in ("strap_right", "strap_left"):
        xc, yc, zc = X.STRAP[key]
        yd = yc - a["drop"]
        top = yc + X.LUG_HOLE_R - a["cord_r"] - 0.05
        half = 2.0 + a["cord_r"] + 0.05                     # the lug plate is 4 mm thick (z +-2)
        ctrl = [(top, zc), (yc - 1.2, zc + half), (yc - 5.0, zc + half), (yd + a["r"] + 2.5, zc + 1.6),
                (yd + a["r"] - 1.0, zc + 0.6), (yd + a["r"] - 1.0, zc - 0.6), (yd + a["r"] + 2.5, zc - 1.6),
                (yc - 5.0, zc - half), (yc - 1.2, zc - half)]
        path = catmull(ctrl, n_per=nper, closed=True)
        pts = [Vector((xc, y, z)) for (y, z) in path]
        n = len(pts)
        verts, faces = [], []
        for i, p in enumerate(pts):
            tng = (pts[(i + 1) % n] - pts[i - 1]).normalized()
            b_ = Vector((1.0, 0.0, 0.0))
            nn = tng.cross(b_).normalized()
            for k in range(sides):
                th = math.tau * k / sides
                verts.append(tuple(p + (nn * math.cos(th) + b_ * math.sin(th)) * a["cord_r"]))
        for i in range(n):
            for k in range(sides):
                i2, k2 = (i + 1) % n, (k + 1) % sides
                faces.append((i * sides + k, i2 * sides + k, i2 * sides + k2, i * sides + k2))
        cord = Geo("cord")
        cord.add(verts, faces, "strap", smooth=True)
        X._orient(cord, lambda c_, pts=pts: c_ - min(pts, key=lambda q: (q - c_).length))
        g.merge(cord)
        r, t = a["r"], a["t"]                              # anodised black faces, a bright chamfered rim
        disc = Geo("disc")
        disc.merge(revolve([(0.0, -t / 2), (r - 0.5, -t / 2)], ndisc, "black"))
        disc.merge(revolve([(r - 0.5, -t / 2), (r, -t / 2 + 0.5), (r, t / 2 - 0.5), (r - 0.5, t / 2)], ndisc, "chrome"))
        disc.merge(revolve([(r - 0.5, t / 2), (0.0, t / 2)], ndisc, "black"))
        g.merge(disc, T(xc, yd, zc) @ AX_X)
        if key == "strap_right":                           # grip side, -X: faces the hero poses
            tag_frame = Matrix(((0, 0, -1, xc - t / 2 - LIFT), (0, 1, 0, yd), (1, 0, 0, zc), (0, 0, 0, 1)))
    return g, tag_frame


def add_decals_and_strap(coll, mats, regions, lod, empties):
    """mark_fujifilm, mark_xt5 (body decals), and strap -> strap_mesh + strap_tag. Returns the new objects."""
    objs = {}
    for node, (k, M) in mark_frames().items():
        g = decal_quad(node, regions[k], M)
        objs[node] = g.finish(mats, (0, 0, 0), coll)
    sg, tag_M = strap_geo(lod)
    strap = bpy.data.objects.new("strap", None)
    strap.empty_display_size = 0.004
    coll.objects.link(strap)
    empties["strap"] = strap
    so = sg.finish(mats, (0, 0, 0), coll)
    so.parent = strap
    objs["strap_mesh"] = so
    tg = decal_quad("strap_tag", regions["D64"], tag_M @ T(-(regions["D64"]["mm"][0] + regions["D64"]["mm"][2]) / 2,
                                                           -(regions["D64"]["mm"][1] + regions["D64"]["mm"][3]) / 2, 0))
    to = tg.finish(mats, (0, 0, 0), coll)
    to.parent = strap
    objs["strap_tag"] = to
    return objs


# ===================================================================================== web materials
LEATHER = ("cam_leather", "cam_leather_pad", "cam_leather_coarse")
# Cycles-only node effects the glTF exporter cannot carry (lathe streaks, sensor gradient, EVF glow): their flat
# web values, chosen as the middle of each effect's range (renders: the modeller's round-4 sheets).
WEB_FLAT = {
    "cam_bayonet": {"Base Color": "#cdcac4", "Roughness": 0.27},
    "cam_sensor": {"Base Color": "#874577"},
    "cam_evf_glass": {"Emission Color": "#24473a"},
}


def web_materials():
    """The web look of the modeller's Cycles materials (glTF metallic-roughness, three r186). At web scale the
    bead-blast micro-normal (0.12 mm grain) mips to flat and the radial anisotropy has no tangents, so both go; the
    leather keeps its pebble maps, with a constant specular level instead of the colour map's alpha."""
    for m in bpy.data.materials:
        if not m.use_nodes or not m.name.startswith("cam_") or m.name == "cam_lettering":
            continue
        nt = m.node_tree
        b = next((n_ for n_ in nt.nodes if n_.type == "BSDF_PRINCIPLED"), None)
        if b is None:
            continue
        if m.name in LEATHER:
            for lk in list(b.inputs["Specular IOR Level"].links):
                nt.links.remove(lk)
            b.inputs["Specular IOR Level"].default_value = 0.5
            continue
        for sock in ("Normal", "Tangent", "Base Color", "Roughness", "Emission Color"):
            for lk in list(b.inputs[sock].links):
                nt.links.remove(lk)
        b.inputs["Anisotropic"].default_value = 0.0
        for sock, v in WEB_FLAT.get(m.name, {}).items():
            b.inputs[sock].default_value = srgb(v) if isinstance(v, str) else v
        if m.name == "cam_evf_glass":
            b.inputs["Emission Strength"].default_value = 1.0


def leather_images():
    """{material: {'n'|'c'|'r': (TexImage node, original image)}} of the three leatherette materials."""
    out = {}
    for name in LEATHER:
        m = bpy.data.materials[name]
        d = {}
        for n_ in m.node_tree.nodes:
            if n_.type == "TEX_IMAGE" and n_.image is not None:
                d[n_.image.name.split("_")[-1].split(".")[0]] = (n_, n_.image)
        out[name] = d
    return out


def set_web_textures(lod, leather, atlas_rgba, atlas_n, lettering_mat):
    """Point the leather and lettering materials at this LOD's downsampled maps (TEX_SIZE)."""
    sz = TEX_SIZE[lod]
    for name, d in leather.items():
        for kind, (node, orig) in d.items():
            arr = image_array(orig)
            H, W = arr.shape[:2]
            full = sz["strip"] if name == "cam_leather" else sz["tile"]
            w = full if kind == "n" else full // 2
            h = H * w // W
            small = downsample(arr, w, h, normal=(kind == "n"))
            if kind == "c":
                small[..., 3] = 1.0                      # alpha held the Cycles specular level: opaque for the web
            node.image = save_image(f"{name}_{kind}_{lod}", small, "sRGB" if kind == "c" else "Non-Color",
                                    alpha=False)
    w = sz["atlas"]
    h = ATLAS_H * w // ATLAS_W
    nodes = [n_ for n_ in lettering_mat.node_tree.nodes if n_.type == "TEX_IMAGE"]
    nodes[0].image = save_image(f"lettering_albedo_{lod}", downsample(atlas_rgba, w, h), "sRGB", alpha=True)
    nodes[1].image = save_image(f"lettering_normal_{lod}", downsample(atlas_n, w // 2, h // 2, normal=True),
                                "Non-Color", alpha=False)          # the print's edge relief: half the albedo size


# ===================================================================================== Manor LOD
def dp_simplify(pts, tol):
    """Douglas-Peucker on a closed 2D ring."""
    def rdp(seq):
        if len(seq) < 3:
            return seq
        (ax, ay), (bx, by) = seq[0], seq[-1]
        L = math.hypot(bx - ax, by - ay) or 1e-9
        dmax, imax = 0.0, 0
        for i in range(1, len(seq) - 1):
            px, py = seq[i]
            d = abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / L
            if d > dmax:
                dmax, imax = d, i
        if dmax <= tol:
            return [seq[0], seq[-1]]
        return rdp(seq[:imax + 1])[:-1] + rdp(seq[imax:])
    clean = []                               # fillet_poly repeats points on straight corners: drop them first
    for p in pts:
        if not clean or math.dist(p, clean[-1]) > 1e-4:
            clean.append(tuple(p))
    if math.dist(clean[0], clean[-1]) <= 1e-4:
        clean.pop()
    pts = clean
    i0 = max(range(len(pts)), key=lambda i: pts[i][0])          # split the ring at its two extreme points
    ring = pts[i0:] + pts[:i0]
    j0 = max(range(len(ring)), key=lambda i: math.dist(ring[i], ring[0]))
    out = rdp(ring[:j0 + 1])[:-1] + rdp(ring[j0:] + [ring[0]])[:-1]
    dedup = [out[0]]
    for p in out[1:]:
        if math.dist(p, dedup[-1]) > 1e-4:
            dedup.append(p)
    return dedup


def prism(ring, y0, y1, mat, name):
    return loft([(y0, ring), (y1, ring)], mat, smooth=False)


def build_manor(coll, mats, regions, pivots):
    """The Manor viewmodel (<= 1.5k tris): the same measured outlines at coarse resolution, flat slots
    (mat_silver, mat_graphite, mat_glass_dark, mat_brass) plus mat_lettering for the marks; pivots shutter_button and
    lens only (the Manor drives the rest from its UI); every marker and decal of the web LODs."""
    body = Geo("body")
    pts, rad, seg = X.chassis_ctrl(30.0)
    ring = dp_simplify(fillet_poly(pts, rad, seg), 0.9)
    body.merge(prism(ring, 0.0, X.Y_PLATE, "silver", "base"))
    body.merge(prism(dp_simplify(fillet_poly(pts, rad, seg, offset=-0.1), 0.9), X.Y_PLATE, X.Y_TOP0, "leather", "shell"))
    tp, tr, ts = X.top_ctrl(68.0)
    body.merge(prism(dp_simplify(fillet_poly(tp, tr, ts), 0.9), X.Y_TOP0, X.Y_TOP, "silver", "top"))
    lv = []
    for y in (X.Y_TOP - 0.2, 69.9, X.HUMP_FACET_Y, 88.0, 91.0):
        F, Rh, wl, wr = X.hump_dims(y)
        lv.append((y, [(wl, F), (-wr, F), (-wr, Rh), (wl, Rh)]))
    body.merge(loft(lv, X.hump_mat, smooth=False))
    for cid in ("iso_dial", "shutter_speed_dial", "ev_comp_dial"):
        c = X.cm(cid)
        R_ = X.DIA[cid] / 2
        yb, yt = c["size"]["knurl_band_y"]
        if cid == "ev_comp_dial":
            yb = X.Y_TOP
        body.merge(xt5lib.cyl(R_, yb, c["size"]["top_face_y"], 12, "silver"),
                   T(c["pos"]["x"], 0, c["pos"]["z"]) @ xt5lib.AX_Y)
    for cid in ("drive_dial", "still_movie_dial"):
        c = X.cm(cid)
        y0, y1 = c["size"]["band_y"]
        body.merge(xt5lib.cyl(X.DIA[cid] / 2, y0, y1, 12, "silver", cap0=False, cap1=False),
                   T(c["pos"]["x"], 0, c["pos"]["z"]) @ xt5lib.AX_Y)
    c = X.cm("on_off_switch")
    body.merge(xt5lib.cyl(c["size"]["dia"] / 2, X.Y_TOP, 76.8, 10, "silver"), T(c["pos"]["x"], 0, c["pos"]["z"]) @ xt5lib.AX_Y)
    c = X.cm("front_command_dial")
    body.merge(xt5lib.cyl(c["size"]["dia"] / 2, 65.0, 68.3, 10, "black"), T(c["pos"]["x"], 0, c["pos"]["z"]) @ xt5lib.AX_Y)
    c = X.cm("lcd")["size"]
    body.merge(xt5lib.rbox(c["housing_x"][1] - c["housing_x"][0], c["housing_y"][1] - c["housing_y"][0], 5.8, mat="black",
                           center=((c["housing_x"][0] + c["housing_x"][1]) / 2, (c["housing_y"][0] + c["housing_y"][1]) / 2,
                                   -21.5)))
    gx0, gx1 = c["cover_glass_x"]
    gy0, gy1 = c["cover_glass_y"]
    body.merge(xt5lib.rbox(gx1 - gx0, gy1 - gy0, 0.2, mat="glass", center=((gx0 + gx1) / 2, (gy0 + gy1) / 2, -24.45)))
    e = X.cm("evf_eyepiece")["size"]
    body.merge(xt5lib.rbox(e["eyecup_x"][1] - e["eyecup_x"][0], e["eyecup_y"][1] - e["eyecup_y"][0],
                           e["eyecup_z"][1] - e["eyecup_z"][0], mat="rubber",
                           center=((e["eyecup_x"][0] + e["eyecup_x"][1]) / 2, (e["eyecup_y"][0] + e["eyecup_y"][1]) / 2,
                                   (e["eyecup_z"][0] + e["eyecup_z"][1]) / 2)))
    body.merge(xt5lib.disc(9.3, 37.05, 8, "glass", M=T(0, 72.8, 0) @ xt5lib.AX_NZ))      # eyepiece, facing -Z
    body.merge(xt5lib.cyl(30.55, 13.6, X.MOUNT_Z, 16, "silver", cap0=False), T(0, 35.0, 0))
    c = X.cm("af_assist_lamp")["pos"]
    body.merge(xt5lib.cyl(1.6, X.Z_F, X.Z_F + 0.8, 6, "amber"), T(c["x"], c["y"], 0))
    for key in ("strap_right", "strap_left"):            # lug plates with the eyelet as a square hole would add
        xc, yc, zc = X.STRAP[key]                         # tris: solid tabs (the cord hides the eyelet)
        tip = X.LUG_TIP[key]
        base = X.X_R + 1.0 if xc < 0 else X.X_L - 1.0
        body.merge(xt5lib.rbox(abs(tip - base), 7.2, 4.0, mat="silver", center=((tip + base) / 2, 67.9, zc)))
    objs = {"body": body.finish(mats, (0, 0, 0), coll)}
    empties = {}
    # shutter button and lens: pivots with their parts (the Manor presses and swaps them), at LOD0's exact pivot
    # locations (rig.mjs: swapping LODs never moves a pivot); parts authored in pivot-local mm
    sb = Geo("shutter_button_mesh").merge(xt5lib.cyl(X.cm("shutter_button")["size"]["dia"] / 2, 0.0, 1.6, 10, "silver"),
                                          xt5lib.AX_Y)
    lens = Geo("lens_mesh")
    lens.merge(revolve([(21.6, 0.0), (28.05, 0.0), (29.2, 1.6), (29.2, 26.0), (30.0, 27.0), (30.0, 37.0), (29.2, 38.0),
                        (29.2, 43.5), (27.0, 45.9), (21.5, 45.9)], 12, "silver"))
    lens.merge(revolve([(21.5, 45.9), (19.0, 44.4)], 12, "black"))
    lens.merge(revolve([(19.0, 44.4), (0.0, 43.4)], 12, "glass"))
    to_ref = TO_BLENDER.inverted()
    for name, g in (("shutter_button", sb), ("lens", lens)):
        loc = Vector(pivots[name])
        piv = tuple(to_ref @ (loc / MM))
        e_ = bpy.data.objects.new(name, None)
        e_.location = loc
        coll.objects.link(e_)
        empties[name] = e_
        mo = g.transformed(T(*piv)).finish(mats, piv, coll)
        mo.parent = e_
        mo.location = (0, 0, 0)
        objs[name + "_mesh"] = mo
    for name, loc in (("lens_mount", (0.0, 35.0, X.MOUNT_Z)), ("strap_left", X.STRAP["strap_left"]),
                      ("strap_right", X.STRAP["strap_right"]), ("print_exit", (36.0, X.Y_TOP + 0.4, -16.0))):
        e_ = bpy.data.objects.new(name, None)
        e_.location = (TO_BLENDER @ Vector(loc)) * MM
        coll.objects.link(e_)
        empties[name] = e_
    objs.update(add_decals_and_strap(coll, mats, regions, "manor", empties))
    return objs, empties


def manor_materials(lettering):
    """FlatToon slots (W-D019): flat colours (no textures) mapped onto the Manor palette; mat_lettering carries the
    lettering atlas (alpha-tested)."""
    def flat(name, hex_, rough):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = next(n_ for n_ in m.node_tree.nodes if n_.type == "BSDF_PRINCIPLED")
        b.inputs["Base Color"].default_value = srgb(hex_)
        b.inputs["Metallic"].default_value = 0.0
        b.inputs["Roughness"].default_value = rough
        return m
    silver = flat("mat_silver", "#BFC3C5", 0.6)
    graphite = flat("mat_graphite", "#1C1D1F", 0.8)
    glass = flat("mat_glass_dark", "#0B0C10", 0.2)
    brass = flat("mat_brass", "#C59A45", 0.6)
    return {"silver": silver, "leather": graphite, "black": graphite, "rubber": graphite, "chrome": silver,
            "strap": graphite, "glass": glass, "amber": brass, "decal": lettering}


# ===================================================================================== LOD reduction
def dissolve_flat(objs, angle_deg):
    """Limited dissolve per mesh (bmesh.ops.dissolve_limit): merges faces that meet within angle_deg and drops
    vertices on straight runs, never across a material, seam, sharp edge or UV boundary. The lofts carry many
    collinear levels on flat walls (the chassis has 30), so this sheds triangles without changing a surface: UVs are
    linear on a flat run, and flat shading is the same before and after."""
    import bmesh
    for o in objs.values():
        if o.type != "MESH" or len(o.data.polygons) < 8:
            continue
        # never the leatherette: its unwrap is not linear in position (the strip is pinned to the grip crease, which
        # moves with height), so a merged face would interpolate the grain into streaks
        leather = {i for i, m in enumerate(o.data.materials) if m is not None and m.name.startswith("cam_leather")}
        bm = bmesh.new()
        bm.from_mesh(o.data)
        free_e = [e for e in bm.edges if not any(f.material_index in leather for f in e.link_faces)]
        free_v = [v for v in bm.verts if not any(f.material_index in leather for f in v.link_faces)]
        bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(angle_deg), use_dissolve_boundaries=False,
                                 verts=free_v, edges=free_e, delimit={"MATERIAL", "SEAM", "SHARP", "UV"})
        bm.to_mesh(o.data)
        bm.free()


def collapse_to(objs, target, only):
    """If the LOD is still over target, collapse-decimate the listed meshes (the body shell and other irregular
    parts; never the round silhouettes: lens, dials, rings) by one shared ratio (lite tier only), then re-mark sharp
    edges at the modeller's default crease (32 degrees) so hard edges stay hard."""
    per = tri_count(objs)
    total = sum(per.values())
    if total <= target:
        return 1.0
    big = {n: t for n, t in per.items() if n in only}
    ratio = max(0.05, 1.0 - (total - target) / sum(big.values()))
    for n in big:
        o = objs[n]
        mod = o.modifiers.new("lod", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
        old, name = o.data, o.data.name
        o.modifiers.remove(mod)
        o.data = me
        bpy.data.meshes.remove(old)
        me.name = name
        me.set_sharp_from_angle(angle=math.radians(32.0))
    return ratio


# ===================================================================================== export and report
def tri_count(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    per = {}
    for name, o in objs.items():
        if o.type != "MESH":
            continue
        me = o.evaluated_get(dg).data
        me.calc_loop_triangles()
        per[name] = len(me.loop_triangles)
    return per


def export(coll, path):
    for o in bpy.context.scene.objects:
        o.select_set(o.name in coll.objects)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
                              export_apply=True, export_texcoords=True, export_normals=True, export_tangents=False,
                              export_extras=True, export_animations=False, export_cameras=False, export_lights=False,
                              export_image_format="AUTO")
    print("GLB", path)


def retire(coll, suffix):
    """Rename an exported LOD's objects and meshes so the next LOD can reuse the rig names."""
    for o in list(coll.objects):
        o.name = o.name + suffix
        if o.type == "MESH":
            o.data.name = o.data.name + suffix
    coll.hide_render = True
    coll.hide_viewport = True


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    exec(open(GPU_SCRIPT).read())        # the factory reset drops device prefs: apply the GPU settings again
    mats = X.build_materials(TEX)
    # lettering atlas + its material (cam_lettering on the web LODs, mat_lettering on the Manor LOD)
    atlas_rgba, regions = build_atlas()
    atlas_n = atlas_normal(atlas_rgba[..., 3])
    master = save_image("lettering_albedo_master", atlas_rgba, "sRGB", alpha=True)
    master_n = save_image("lettering_normal_master", atlas_n, "Non-Color", alpha=False)
    cam_lettering = lettering_material("cam_lettering", master, master_n)
    mats["decal"] = cam_lettering
    mats["strap"] = X.material("cam_strap", "#161616", 0.0, 0.78)     # woven cord, matt black
    report = {"atlas": {k: {"mm": [round(v, 3) for v in r["mm"]], "uv": [round(v, 5) for v in r["uv"]]}
                        for k, r in regions.items()}, "lods": {}}

    # ---------------- LOD0: the modeller's full detail
    c0 = bpy.data.collections.new("LOD0")
    bpy.context.scene.collection.children.link(c0)
    objs, empties, per_part = X.assemble(mats, c0)
    objs.update(add_decals_and_strap(c0, mats, regions, "lod0", empties))
    dissolve_flat(objs, LOD0_DISSOLVE_DEG)
    os.makedirs(os.path.dirname(BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND)                  # the Cycles source of truth (outside the repos)
    print("SAVED", BLEND)
    web_materials()
    leather = leather_images()
    set_web_textures("lod0", leather, atlas_rgba, atlas_n, cam_lettering)
    per = tri_count(objs)
    report["lods"]["lod0"] = {"tris": sum(per.values()), "nodes": per, "authored": per_part}
    export(c0, os.path.join(OUT, FILES["lod0"]))
    pivots = {n: tuple(e.location) for n, e in empties.items()}
    retire(c0, "__lod0")

    # ---------------- LOD1: the same model with the detail knobs down (lite tier)
    xt5lib.LODQ.update(LOD1_Q)
    c1 = bpy.data.collections.new("LOD1")
    bpy.context.scene.collection.children.link(c1)
    objs, empties, per_part = X.assemble(mats, c1)
    objs.update(add_decals_and_strap(c1, mats, regions, "lod1", empties))
    dissolve_flat(objs, LOD1_DISSOLVE_DEG)
    ratio = collapse_to(objs, LOD1_TARGET, only=[n for n in objs if not n.startswith(("lens", "mark_", "strap_tag"))])
    set_web_textures("lod1", leather, atlas_rgba, atlas_n, cam_lettering)
    per = tri_count(objs)
    report["lods"]["lod1"] = {"tris": sum(per.values()), "nodes": per, "authored": per_part, "collapse": round(ratio, 4)}
    export(c1, os.path.join(OUT, FILES["lod1"]))
    retire(c1, "__lod1")

    # ---------------- Manor LOD: flat FlatToon slots, same proportions
    xt5lib.LODQ.update({"rev": 1.0, "knurl": True, "gear": True, "text": True, "bevel_segs": 0})
    mat_lettering = lettering_material("mat_lettering", master, None, rough=0.6)
    w = TEX_SIZE["manor"]["atlas"]
    mat_lettering.node_tree.nodes["Image Texture"].image = save_image(
        "lettering_albedo_manor", downsample(atlas_rgba, w, ATLAS_H * w // ATLAS_W), "sRGB", alpha=True)
    cm_ = bpy.data.collections.new("MANOR")
    bpy.context.scene.collection.children.link(cm_)
    objs, empties = build_manor(cm_, manor_materials(mat_lettering), regions, pivots)
    per = tri_count(objs)
    report["lods"]["manor"] = {"tris": sum(per.values()), "nodes": per}
    export(cm_, os.path.join(OUT, FILES["manor"]))
    for k, v in report["lods"].items():
        print("TRIS", k, v["tris"])
    if REPORT:
        os.makedirs(os.path.dirname(os.path.abspath(REPORT)), exist_ok=True)
        json.dump(report, open(REPORT, "w"), indent=1)


main()
