# build_camera.py: the camera rig, milestone m1 (W-C13, issue #16).
# Source: the Wave 1b evidence script (portfolio-evidence/wave1b/w-3d-art/src/build_camera.py, w-3d-art), kept
# as is except for the m1 changes below. Milestone m2 replaces the body with the 1:1 X-T5 rebuild (D-011).
#
# m1 changes against the evidence script (W-D019 rig API, D-011, D-012):
#   1. Runs scripts/fork/blender_gpu.py first (D-012: Blender on the GPU only, even for an export-only run).
#   2. The [ ] monogram on the hump is removed: the camera body keeps FUJIFILM and X-T5 lettering only (D-011,
#      tokens.monogram.cameraPlacement). The real marks arrive in m2 as decal nodes mark_fujifilm and mark_xt5.
#   3. Markers strap_left and strap_right (W-D019) at the strap-ring centres. Left and right are the camera's own
#      sides (photographer's view): +X is the camera's left, as in the evidence script.
#   4. Material cam_lettering (W-D019): the dial engravings move from cam_paint to cam_lettering; cam_paint keeps the
#      index ticks. LOD1 gains the engravings and ticks so both web LODs carry the same eight materials.
#
# Run headless (scripts/build/glb/build.ps1 does this, inside the blender lane):
#   blender -b --factory-startup --python build_camera.py -- --out <export dir> --blend <.blend path outside the repos>
# Builds three LODs from ONE source (LOD0 web full tier, LOD1 web lite tier, LODM Manor FlatToon) and exports one
# GLB per LOD. Units: modelled in mm, exported in metres, glTF +Y up, the lens looks down +Z.
import bpy, bmesh, math, sys, os, json
from mathutils import Vector, Matrix
import numpy as np

GPU_SCRIPT = os.environ.get("ION_BLENDER_GPU",
                            r"C:\Users\Aaron\Documents\GitHub\project.ion\.claude\worktrees\overhaul\scripts\fork\blender_gpu.py")
exec(open(GPU_SCRIPT).read())  # D-012: GPU only, never cycles.device = CPU

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default
OUT = os.path.abspath(arg("--out", os.getcwd()))
BLEND = arg("--blend", "")
SCRATCH = os.path.dirname(os.path.abspath(BLEND)) if BLEND else __import__("tempfile").gettempdir()
MM = 0.001

# ---------------- reference dimensions (documented, see README) ----------------
W, D = 129.5, 34.0          # body slab width / depth (X-T5 W 129.5 mm; depth 63.8 incl. grip + eyecup)
Z_TOP = 66.0                # top-plate shoulder height
LX, LZ = 10.0, 35.0         # lens axis (front view: +X = camera's left)
Y_FRONT, Y_BACK = -D / 2, D / 2

LODS = {
    # seg: bevel segments, cyl: round segments, knurl: ridges on dials, ap/foc: ridges on lens rings
    "LOD0": dict(seg=3, cyl=64, knurl=48, ap=60, foc=90, text=True, small=True, flat=False),
    "LOD1": dict(seg=1, cyl=32, knurl=24, ap=30, foc=0, text=True, small=False, flat=False),  # m1: text on
    "LODM": dict(seg=0, cyl=14, knurl=0, ap=0, foc=0, text=False, small=False, flat=True),
}

# ---------------- materials (glTF metallic-roughness) ----------------
def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]

def make_leather_normal(path, n=256, cells=22, strength=2.2, seed=7):
    """Tileable pebble-grain normal map built with an FFT band-pass (periodic by construction)."""
    rng = np.random.default_rng(seed)
    F = np.fft.fft2(rng.standard_normal((n, n)))
    fy = np.fft.fftfreq(n)[:, None]; fx = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx ** 2 + fy ** 2); f0 = cells / n
    h = np.real(np.fft.ifft2(F * np.exp(-((f - f0) ** 2) / (2 * (f0 * 0.35) ** 2))))
    h = (h - h.min()) / (h.max() - h.min()); h = np.tanh((h - 0.5) * 4.0)
    fine = np.real(np.fft.ifft2(F * np.exp(-((f - 0.22) ** 2) / (2 * 0.05 ** 2))))
    h = h + 0.18 * fine / np.abs(fine).max()
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx, ny, nz = -dx * strength, -dy * strength, np.ones_like(h)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    rgba = np.stack([0.5 + 0.5 * nx / l, 0.5 + 0.5 * ny / l, 0.5 + 0.5 * nz / l, np.ones_like(h)], -1)
    img = bpy.data.images.new("cam_leather_n", n, n, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path; img.file_format = "PNG"; img.save()
    return img

def material(name, base, metal, rough, normal_img=None, thin_film=0.0, coat=0.0, emit=None):
    if name in bpy.data.materials: return bpy.data.materials[name]
    m = bpy.data.materials.new(name); m.use_nodes = True; m.use_backface_culling = True
    nt = m.node_tree; b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = srgb(base)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    if coat:
        b.inputs["Coat Weight"].default_value = coat; b.inputs["Coat Roughness"].default_value = 0.03
    if thin_film:
        b.inputs["Thin Film Thickness"].default_value = thin_film
        b.inputs["Thin Film IOR"].default_value = 1.38
    if emit:
        b.inputs["Emission Color"].default_value = srgb(emit); b.inputs["Emission Strength"].default_value = 1.0
    if normal_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = normal_img
        nm = nt.nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = 0.35
        nt.links.new(tex.outputs["Color"], nm.inputs["Color"]); nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m

def build_materials(flat):
    if flat:  # Manor: four flat slots that map onto Mat palette indices (FlatToon ignores textures)
        return {
            "leather": material("mat_graphite", "#1C1D1F", 0.0, 0.8),
            "silver": material("mat_silver", "#BFC3C5", 0.0, 0.6),
            "black": material("mat_graphite", "#1C1D1F", 0.0, 0.8),
            "rubber": material("mat_graphite", "#1C1D1F", 0.0, 0.8),
            "amber": material("mat_brass", "#C59A45", 0.0, 0.6),
            "glass": material("mat_glass_dark", "#0B0C10", 0.0, 0.2),
            "paint": material("mat_silver", "#BFC3C5", 0.0, 0.6),
            "lettering": material("mat_silver", "#BFC3C5", 0.0, 0.6),  # m2: its own mat_lettering slot
        }
    nimg = make_leather_normal(os.path.join(SCRATCH, "cam_leather_n.png"))  # embedded in the GLB; file stays outside
    return {
        "leather": material("cam_leather", "#121314", 0.0, 0.58, normal_img=nimg),
        "silver": material("cam_silver", "#C9CCCE", 1.0, 0.30),
        "black": material("cam_black_metal", "#202124", 1.0, 0.36),
        "rubber": material("cam_rubber", "#101011", 0.0, 0.82),
        "amber": material("cam_amber", "#E39B2B", 0.85, 0.28),
        "glass": material("cam_glass", "#06070A", 0.0, 0.03, thin_film=380.0, coat=1.0),
        "paint": material("cam_paint", "#ECEDEA", 0.0, 0.45),
        # Engraving fill, a touch brighter and more matte than cam_paint. It must differ from every other material:
        # gltf-transform optimize runs dedup first, which merges materials that differ only by name.
        "lettering": material("cam_lettering", "#F4F4F0", 0.0, 0.5),
    }

# ---------------- bmesh helpers (all in mm) ----------------
class Part:
    """Accumulates geometry per material for one exported node."""
    def __init__(self, name, origin=(0, 0, 0), local=True):
        self.name, self.origin, self.local = name, Vector(origin), local; self.bms = {}
    def bm(self, key):
        if key not in self.bms: self.bms[key] = bmesh.new()
        return self.bms[key]

def tag_uv_box(bm, tile=24.0):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            co = lp.vert.co
            a, b = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
            lp[uv].uv = (a / tile, b / tile)

def add_into(dst, src, mat=Matrix.Identity(4)):
    me = bpy.data.meshes.new("tmp"); src.to_mesh(me); src.free()
    me.transform(mat); dst.from_mesh(me); bpy.data.meshes.remove(me)

def rbox(size, center, r, seg):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if seg and r > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, offset_type="OFFSET", segments=seg,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    return bm

def hull(points, r, seg):
    bm = bmesh.new(); vs = [bm.verts.new(p) for p in points]
    res = bmesh.ops.convex_hull(bm, input=vs)
    bmesh.ops.delete(bm, geom=[g for g in res["geom_interior"] + res["geom_unused"] if isinstance(g, bmesh.types.BMVert)], context="VERTS")
    bmesh.ops.dissolve_limit(bm, angle_limit=0.01, verts=bm.verts, edges=bm.edges)
    if seg and r > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, offset_type="OFFSET", segments=seg,
                        profile=0.5, affect="EDGES", clamp_overlap=True)
    return bm

def ring(r_out, h, n, ridges=0, depth=0.0, chamfer=0.0, r_top=None, z0=0.0, cap_top=True, cap_bot=True):
    """Z-axis cylinder band from z0 to z0+h. ridges>0 gives machined knurl (alternating radius)."""
    bm = bmesh.new(); r_top = r_out if r_top is None else r_top
    m = ridges * 2 if ridges else n
    def circ(z, rr, knurl):
        out = []
        for i in range(m):
            a = 2 * math.pi * i / m; k = rr - (depth if (knurl and i % 2) else 0.0)
            out.append(bm.verts.new((k * math.cos(a), k * math.sin(a), z)))
        return out
    knurl = ridges > 0
    rings = [circ(z0, r_out, knurl), circ(z0 + h, r_top, knurl)]
    if chamfer > 0:
        rings.append(circ(z0 + h + chamfer * 0.6, r_top - depth - chamfer, False))
    for a_, b_ in zip(rings, rings[1:]):
        for i in range(m):
            j = (i + 1) % m; bm.faces.new((a_[i], a_[j], b_[j], b_[i]))
    if cap_top: bm.faces.new(rings[-1])
    if cap_bot: bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def torus(R, r, n1, n2):
    bm = bmesh.new()
    grid = [[bm.verts.new(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
             for b in [2 * math.pi * j / n2 for j in range(n2)]] for a in [2 * math.pi * i / n1 for i in range(n1)]]
    for i in range(n1):
        for j in range(n2):
            bm.faces.new((grid[i][j], grid[(i + 1) % n1][j], grid[(i + 1) % n1][(j + 1) % n2], grid[i][(j + 1) % n2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm

def text_bm(s, size):
    cu = bpy.data.curves.new("t", "FONT"); cu.body = s; cu.size = size
    cu.align_x = "CENTER"; cu.align_y = "CENTER"; cu.resolution_u = 2
    ob = bpy.data.objects.new("t", cu); bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bm = bmesh.new(); bm.from_mesh(me)
    bpy.data.objects.remove(ob); bpy.data.curves.remove(cu); bpy.data.meshes.remove(me)
    return bm

def T(x=0, y=0, z=0): return Matrix.Translation((x, y, z))
RX90 = Matrix.Rotation(math.radians(90), 4, "X")    # maps +Z axis to -Y (lens axis points to the front)

# ---------------- the camera ----------------
def build(lod, mats):
    P = LODS[lod]; seg, cyl = P["seg"], P["cyl"]
    parts = []
    body = Part("body", local=False)
    # silver top plate and bottom plate, leatherette band between (inset so it reads as a separate skin)
    add_into(body.bm("silver"), rbox((W, D, 20.0), (0, 0, Z_TOP - 10), 2.0, seg))
    add_into(body.bm("silver"), rbox((W, D, 4.0), (0, 0, 2.0), 1.2, seg))
    lb = rbox((W - 0.8, D - 0.8, 43.5), (0, 0, 24.75), 1.5, seg)
    gr = rbox((24.0, 10.0, 42.0), (-52.0, -19.5, 25.0), 4.0, max(seg, 1) if seg else 0)   # front grip
    if not P["flat"]: tag_uv_box(lb); tag_uv_box(gr)
    add_into(body.bm("leather"), lb); add_into(body.bm("leather"), gr)
    # EVF hump over the lens axis, eyecup behind it, hot shoe on top
    hump = hull([(LX + sx * 19.0, -15.0, Z_TOP) for sx in (-1, 1)] + [(LX + sx * 19.0, 16.0, Z_TOP) for sx in (-1, 1)] +
                [(LX + sx * 14.5, -7.0, Z_TOP + 20.0) for sx in (-1, 1)] + [(LX + sx * 14.5, 14.0, Z_TOP + 20.0) for sx in (-1, 1)],
                2.2, seg)
    add_into(body.bm("silver"), hump)
    add_into(body.bm("rubber"), rbox((30.0, 13.0, 20.0), (LX, 21.0, Z_TOP + 9.0), 4.0, seg))
    add_into(body.bm("glass"), rbox((19.0, 1.0, 12.0), (LX, 27.6, Z_TOP + 9.5), 1.5, min(seg, 2)))
    add_into(body.bm("black"), rbox((20.0, 17.0, 2.6), (LX, 3.5, Z_TOP + 21.2), 0.6, min(seg, 1)))
    # m1: the evidence script's [ ] monogram on the hump's front slant is removed (D-011). That face carries the
    # FUJIFILM mark in m2 (decal node mark_fujifilm).
    # print slot: a dark 32 x 1.4 mm slot at the rear of the top plate (camera's left), the print exits here
    add_into(body.bm("rubber"), rbox((32.0, 1.4, 0.6), (46.0, 14.9, Z_TOP + 0.05), 0.0, 0))
    # lens mount ring (silver) on the front face
    add_into(body.bm("silver"), ring(29.5, 2.5, cyl, r_top=29.0), T(LX, Y_FRONT + 0.3, LZ) @ RX90)
    # strap lugs: post on each end, triangular ring on LOD0
    for sx in (-1, 1):
        post = ring(2.6, 4.0, max(cyl // 4, 8)); add_into(body.bm("black"), post, T(sx * (W / 2), 0, 56.0) @ Matrix.Rotation(math.radians(sx * 90), 4, "Y"))
        if P["small"]:
            add_into(body.bm("black"), torus(5.0, 0.8, 18, 6), T(sx * (W / 2 + 4.5), 0, 51.0) @ Matrix.Rotation(math.radians(90), 4, "Y"))
    if P["small"]:
        add_into(body.bm("rubber"), rbox((18.0, 5.0, 13.0), (-49.0, 19.0, 50.0), 2.0, seg))          # thumb rest
        add_into(body.bm("glass"), rbox((74.0, 0.8, 50.0), (-8.0, Y_BACK + 0.35, 27.0), 1.2, 2))     # rear screen
        add_into(body.bm("glass"), ring(1.8, 0.6, 16), T(46.0, Y_FRONT - 0.1, 42.0) @ RX90)          # AF assist window
        add_into(body.bm("black"), ring(6.0, 4.0, 0, ridges=24, depth=0.35), T(-47.0, Y_FRONT - 4.0, 45.0))  # front command dial
        add_into(body.bm("silver"), ring(3.2, 1.6, 20), T(LX - 33.0, Y_FRONT - 0.1, 30.0) @ RX90)    # lens release
    parts.append(body)

    # top dials: each is its own node with its origin on its spin axis (press / spin / detent verbs)
    def dial(name, cx, cy, r, h, labels, size):
        p = Part(name, (cx, cy, Z_TOP))
        add_into(body.bm("black"), ring(r + 2.0, 3.0, cyl), T(cx, cy, Z_TOP))
        if P["knurl"]:
            add_into(p.bm("silver"), ring(r, h, 0, ridges=P["knurl"], depth=0.45, chamfer=0.9, z0=3.0))
        else:
            add_into(p.bm("silver"), ring(r, h, cyl, z0=3.0))
        add_into(p.bm("silver"), ring(3.6, 2.2, max(cyl // 2, 10), z0=3.0 + h + (0.5 if P["knurl"] else 0)))  # lock button
        ztop = 3.0 + h + (0.55 if P["knurl"] else 0.0) + 0.08
        if P["text"] and labels:
            n = len(labels); span = 300.0
            for i, s in enumerate(labels):
                a = math.radians(-90 - span / 2 + span * i / max(n - 1, 1)); rr = r * 0.66
                add_into(p.bm("lettering"), text_bm(s, size), T(rr * math.cos(a), rr * math.sin(a), ztop) @ Matrix.Rotation(a + math.pi / 2, 4, "Z"))
        if P["small"] or P["text"]:
            # index tick (paint) on the black base ring, toward the front
            add_into(body.bm("paint"), rbox((0.6, 1.4, 0.1), (cx, cy - (r + 1.3), Z_TOP + 3.05), 0, 0))
        return p
    parts.append(dial("dial_shutter", -27.0, 0.0, 14.0, 9.0,
                      ["B", "1", "4", "15", "60", "250", "1000", "A"], 1.6))
    parts.append(dial("dial_ev", -56.0, 6.0, 11.0, 8.0, ["-3", "-2", "-1", "0", "+1", "+2", "+3", "C"], 1.6))
    look = dial("dial_look", 46.0, -2.0, 13.5, 9.0, None, 0)
    # film-look dial: five detents, one amber pointer notch on its rim (look names live in the DOM, not the mesh)
    add_into(look.bm("amber"), rbox((1.6, 2.4, 6.0), (0, -13.6, 3.0 + 4.5), 0.3, min(seg, 1)))
    if P["small"]:
        for k in range(5):
            a = math.radians(-90 + (k - 2) * 30)
            add_into(look.bm("paint"), rbox((0.7, 2.4, 0.1), (0, 0, 0), 0, 0), T(9.5 * math.cos(a), 9.5 * math.sin(a), 3.0 + 9.0 + 0.63) @ Matrix.Rotation(a + math.pi / 2, 4, "Z"))
    parts.append(look)
    # shutter button: amber, on an on/off collar with a lever tab (press verb)
    add_into(body.bm("black"), ring(7.0, 3.0, cyl), T(-47.0, -12.0, Z_TOP))                 # on/off collar
    add_into(body.bm("black"), rbox((6.0, 3.0, 2.0), (-53.5, -17.0, Z_TOP + 1.5), 0.5, min(seg, 1)))
    btn = Part("shutter_button", (-47.0, -12.0, Z_TOP + 3.0))
    add_into(btn.bm("amber"), ring(4.3, 3.6, cyl, chamfer=0.6 if seg else 0))
    if P["small"]: add_into(btn.bm("black"), ring(1.4, 0.3, 16, z0=4.1))
    parts.append(btn)

    # lens: own node at the mount, aperture and focus rings as child nodes (spin verbs, detents in code)
    lens = Part("lens", (LX, Y_FRONT - 2.2, LZ))
    def L(bmkey, r, l, z0, r_top=None, part=None, ridges=0, depth=0.0, open_top=False):
        add_into((part or lens).bm(bmkey), ring(r, l, cyl, ridges=ridges, depth=depth, r_top=r_top, z0=z0,
                                               cap_top=not open_top, cap_bot=not open_top), RX90)
    L("black", 27.5, 3.0, 0.0)
    ap = Part("lens_aperture_ring", lens.origin)
    L("black", 29.0, 9.0, 3.0, part=ap, ridges=P["ap"], depth=0.5)
    L("black", 28.5, 3.0, 12.0)
    if not P["flat"]:
        add_into(lens.bm("amber"), ring(0.7, 0.6, 12), T(0, -13.5, 28.4))           # index dot on the band
    foc = Part("lens_focus_ring", lens.origin)
    L("rubber", 30.0, 16.0, 15.0, part=foc, ridges=P["foc"], depth=0.45)
    L("black", 29.0, 11.0, 31.0, r_top=27.6, open_top=True)                          # front barrel (open: the glass shows)
    L("black", 27.6, 1.0, 42.0, r_top=24.0, open_top=True)                           # chamfered front lip
    rw = ring(24.0, 3.45, cyl, z0=39.6, cap_top=False, cap_bot=False); bmesh.ops.reverse_faces(rw, faces=rw.faces)
    add_into(lens.bm("black"), rw, RX90)                                                     # recess wall, seen from inside
    # front element: shallow spherical cap, coated glass
    g = bmesh.new(); n = cyl; rings_ = 4 if not P["flat"] else 1; rr = 24.0; sag = 2.2
    verts = []
    for k in range(rings_ + 1):
        t = k / rings_; rad = rr * (1 - t); z = 39.6 + sag * (1 - (rad / rr) ** 2)
        if k == rings_: verts.append([g.verts.new((0, 0, 39.6 + sag))]); break
        verts.append([g.verts.new((rad * math.cos(2 * math.pi * i / n), rad * math.sin(2 * math.pi * i / n), z)) for i in range(n)])
    for k in range(rings_):
        a_, b_ = verts[k], verts[k + 1]
        for i in range(n):
            j = (i + 1) % n
            if len(b_) == 1: g.faces.new((a_[i], a_[j], b_[0]))
            else: g.faces.new((a_[i], a_[j], b_[j], b_[i]))
    g.normal_update()
    if sum(f.normal.z for f in g.faces) < 0: bmesh.ops.reverse_faces(g, faces=g.faces)
    add_into(lens.bm("glass"), g, RX90)
    parts += [lens, ap, foc]
    if P["flat"]:
        # Manor: the viewmodel only needs the shutter press and the lens swap, so every other part merges into
        # the body (one Unity submesh per Mat). Dials and rings are fixed in the Manor (wheel/Q/E/F drive the UI).
        keep = {"body", "shutter_button", "lens"}
        for p in parts:
            if p.name in keep: continue
            dst = lens if p.name.startswith("lens_") else body
            off = Matrix.Identity(4) if dst is lens else T(*p.origin)
            for key, b in list(p.bms.items()): add_into(dst.bm(key), b, off)
        parts = [p for p in parts if p.name in keep]
    return parts

def realize(parts, mats, coll, flat):
    objs = {}
    for p in parts:
        me = bpy.data.meshes.new(p.name); bm = bmesh.new(); keys = []
        for key, src in p.bms.items():
            idx = len(keys); keys.append(key)
            tmp = bpy.data.meshes.new("t"); src.to_mesh(tmp)
            for poly in tmp.polygons: poly.material_index = idx
            bm.from_mesh(tmp); bpy.data.meshes.remove(tmp)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
        # beauty triangulation: even triangles, so the "Show the mesh" reveal reads as craft, not fan clutter
        bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method="BEAUTY", ngon_method="BEAUTY")
        if not p.local: bmesh.ops.translate(bm, vec=-p.origin, verts=bm.verts)
        bmesh.ops.scale(bm, vec=Vector((MM, MM, MM)), verts=bm.verts)
        bm.to_mesh(me); bm.free()
        for key in keys: me.materials.append(mats[key])
        if flat:
            for poly in me.polygons: poly.use_smooth = False
        else:
            for poly in me.polygons: poly.use_smooth = True
            me.set_sharp_from_angle(angle=math.radians(32))
        if not p.local:
            ob = bpy.data.objects.new(p.name, me); coll.objects.link(ob); objs[p.name] = ob; continue
        piv = bpy.data.objects.new(p.name, None); piv.empty_display_size = 0.01; piv.location = p.origin * MM
        coll.objects.link(piv); ob = bpy.data.objects.new(p.name + "_mesh", me); coll.objects.link(ob)
        ob.parent = piv; objs[p.name] = piv; objs[p.name + "_mesh"] = ob
    # hierarchy: lens rings pivot inside the lens pivot (same axis)
    for child, parent in (("lens_aperture_ring", "lens"), ("lens_focus_ring", "lens")):
        if child not in objs: continue
        c, pa = objs[child], objs[parent]; rel = c.location - pa.location; c.parent = pa; c.location = rel
    # empties for the scene role: where the print leaves the camera, the lens mount, and the strap anchors at the
    # strap-ring centres (m1, W-D019; +X is the camera's left). Every LOD carries the same markers at the same place.
    for name, loc in (("print_exit", (46.0, 14.9, Z_TOP + 0.4)), ("lens_mount", (LX, Y_FRONT - 2.2, LZ)),
                      ("strap_left", (W / 2 + 4.5, 0.0, 51.0)), ("strap_right", (-(W / 2 + 4.5), 0.0, 51.0))):
        e = bpy.data.objects.new(name, None); e.location = Vector(loc) * MM; e.empty_display_size = 0.01; coll.objects.link(e)
    return objs

def tri_count(objs):
    dg = bpy.context.evaluated_depsgraph_get(); total = 0; per = {}
    for ob in objs.values():
        if ob.type != "MESH": continue
        me = ob.evaluated_get(dg).data; me.calc_loop_triangles(); per[ob.name] = len(me.loop_triangles); total += per[ob.name]
    return total, per

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    exec(open(GPU_SCRIPT).read())  # the factory reset drops the device preferences: apply the GPU settings again
    os.makedirs(OUT, exist_ok=True)
    report = {}
    for lod in ("LOD0", "LOD1", "LODM"):
        coll = bpy.data.collections.new(lod); bpy.context.scene.collection.children.link(coll)
        mats = build_materials(LODS[lod]["flat"])
        objs = realize(build(lod, mats), mats, coll, LODS[lod]["flat"])
        total, per = tri_count(objs)
        report[lod] = {"tris": total, "nodes": per, "materials": sorted({m.name for o in objs.values() if o.type == "MESH" for m in o.data.materials})}
        for o in bpy.context.scene.objects: o.select_set(False)
        for o in coll.objects: o.select_set(True)
        fn = {"LOD0": "camera_xt_lod0.glb", "LOD1": "camera_xt_lod1.glb", "LODM": "camera_xt_manor.glb"}[lod]
        bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, fn), export_format="GLB", use_selection=True,
                                  export_yup=True, export_apply=True, export_texcoords=not LODS[lod]["flat"],
                                  export_normals=True, export_materials="EXPORT", export_extras=False)
        for o in coll.objects: o.name = o.name + "__" + lod
        if lod != "LOD0": coll.hide_render = True; coll.hide_viewport = True
    if BLEND:  # the .blend never enters a repo (rules.web.md rule 7)
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(BLEND))
    with open(os.path.join(SCRATCH, "tri-report.json"), "w", newline="\n") as f:  # rig.json carries the counts
        json.dump(report, f, indent=1, sort_keys=True); f.write("\n")
    print("TRI_REPORT", json.dumps({k: (v["tris"], v["materials"]) for k, v in report.items()}))

main()
