"""W-C13 m2: the silver Fujifilm X-T5, hand-modelled by script from the reference pack (data/control_map.json).

The modeller's round-4 build (portfolio-assets/xt5/scripts/build_xt5.py, critic score 7/10 after four rounds),
imported as a module: ../build_camera.py runs blender_gpu.py first (D-012), then calls build_materials() and
assemble() once per web LOD and adds the lettering decals, the strap, the Manor LOD and the exports.
Frame: refs frame in mm (+X camera left, +Y up, +Z out of the lens; X=0 lens axis, Y=0 base, Z=0 sensor plane).
Blender gets 0.001 * (X, -Z, Y); a glTF export (+Y up) is the m1 rig frame in metres.
No generators (D-015): every surface is authored below from measured numbers. LOD0 budget <= 100k tris (D-021).
"""
import json
import math
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import xt5lib  # noqa: E402
import xt5tex  # noqa: E402
from xt5lib import *  # noqa: E402,F401,F403

ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
LOGOS = json.load(open(os.path.join(DATA, "logos.json")))
CM = {c["id"]: c for c in json.load(open(os.path.join(DATA, "control_map.json"), encoding="utf-8"))["control_map"]}


FONT_NUM = r"C:\Windows\Fonts\calibrib.ttf"      # dial numerals: compact bold sans (Bahnschrift's variable outlines
                                                 # fill badly in Blender; refs suggest Roboto Condensed Medium)
FONT_UI = r"C:\Windows\Fonts\arialbd.ttf"        # button legends
FONT_UI_R = r"C:\Windows\Fonts\arial.ttf"
FONT_LENS = r"C:\Windows\Fonts\segoeui.ttf"      # lens markings: humanist sans (Fujinon's '35' and f-numbers)
FONT_LENS_B = r"C:\Windows\Fonts\segoeuib.ttf"   # r7: bold f-numbers (round-3 review)
LIFT = 0.025                                    # decal lift above a surface (mm)

# ===================================================================================== materials
def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


# r6: the leatherette maps moved to xt5tex.leather_set (flat-topped polygonal islands, near-black crevices)


def beadblast_normal(path, n=1024, strength=1.0, seed=5):
    """r4: tileable bead-blast micro-normal on the 24 mm box-UV tile: overlapping shallow craters (~0.08-0.2 mm)
    from band-limited noise, the satin grain of the silver plates, dials and the XF35 barrel (D-014)."""
    import numpy as np
    rng = np.random.default_rng(seed)
    F = np.fft.fft2(rng.standard_normal((n, n)))
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx ** 2 + fy ** 2)
    f0 = 1.0 / 5.0                                  # ~5 px = 0.12 mm features
    h = np.real(np.fft.ifft2(F * np.exp(-((f - f0) ** 2) / (2 * (f0 * 0.45) ** 2))))
    h = h / np.abs(h).max()
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5
    nx, ny, nz = -dx * strength, -dy * strength, np.ones_like(h)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    rgba = np.stack([0.5 + 0.5 * nx / l, 0.5 + 0.5 * ny / l, 0.5 + 0.5 * nz / l, np.ones_like(h)], -1)
    img = bpy.data.images.new("cam_beadblast_n", n, n, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def material(name, base, metal, rough, normal_img=None, nstrength=0.6, thin_film=0.0, coat=0.0, emit=None,
             ior=1.5, aniso=0.0, spec=None, radial=False, trans=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = srgb(base)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    b.inputs["IOR"].default_value = ior
    if spec is not None:
        b.inputs["Specular IOR Level"].default_value = spec
    if trans:
        b.inputs["Transmission Weight"].default_value = trans
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.03
    if thin_film:
        b.inputs["Thin Film Thickness"].default_value = thin_film
        b.inputs["Thin Film IOR"].default_value = 1.38
    if emit:
        b.inputs["Emission Color"].default_value = srgb(emit)
        b.inputs["Emission Strength"].default_value = 1.0
    if aniso:
        b.inputs["Anisotropic"].default_value = aniso
        if radial:                                   # r4: circular brushing round the part's own axis (refs +Y =
            tg = nt.nodes.new("ShaderNodeTangent")   # the object's local Blender Z for the dials)
            tg.direction_type = "RADIAL"
            tg.axis = "Z"
            nt.links.new(tg.outputs["Tangent"], b.inputs["Tangent"])
    if normal_img is not None:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = normal_img
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = nstrength
        nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    return m


def glass_material(name, base, tint, spec_tint, spec=0.35, rough=0.012, coat=0.0):
    """r5 (orchestrator: sawtooth ring + flat glass with a hard horizon): multicoated lens glass seen from the front.
    Cycles: the coated surface reflection (a dark dielectric Principled, specular tinted by the coating and lowered
    toward an AR-coated element's ~1% reflectance) ADDED to a straight-through Transparent BSDF, so the inner elements
    stay visible behind it without refraction through an open shell (the refracted open dome was what drew the
    gear-tooth ring). glTF: the exporter follows the Principled node into the add shader and writes a dark glossy
    glass (KHR transmission is not used)."""
    m = material(name, base, 0.0, rough, spec=spec, coat=coat)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Specular Tint"].default_value = srgb(spec_tint)
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    tr.inputs["Color"].default_value = srgb(tint)
    add = nt.nodes.new("ShaderNodeAddShader")
    nt.links.new(b.outputs["BSDF"], add.inputs[0])
    nt.links.new(tr.outputs["BSDF"], add.inputs[1])
    nt.links.new(add.outputs["Shader"], out.inputs["Surface"])
    return m


def build_materials(texdir):
    os.makedirs(texdir, exist_ok=True)
    bimg = beadblast_normal(os.path.join(texdir, "cam_beadblast_n.png"), strength=1.6)
    # r4 (review: the silver read as flat grey paint): satin bead-blasted aluminium, metallic 1.0, base ~0.75 linear,
    # roughness ~0.35, fine bead-blast micro-normal; the dial tops spun (circular-brushed, anisotropic round the dial
    # axis) and ~10% darker; the XF35 barrel the same satin as the body, not polished
    M = {
        "leather_coarse": material("cam_leather_coarse", "#1e1e1f", 0.0, 0.32),   # r7: pebble maps (below)
        "leather_pad": material("cam_leather_pad", "#1e1e1f", 0.0, 0.42),         # r7: rear thumb rest
        "lens": material("cam_lens_silver", "#e1e1e0", 1.0, 0.40, normal_img=bimg, nstrength=0.2),
        "lens_ridge": material("cam_lens_ridge", "#e8e8e6", 1.0, 0.30, normal_img=bimg, nstrength=0.25),  # knurl tops
        "shoe": material("cam_shoe", "#b4b4b2", 1.0, 0.45, normal_img=bimg, nstrength=0.6),  # shoe leaf springs
        # r6: the shoe frame's dark satin metal (3/4 + back silver renders: grey rails with bright edges)
        "shoe_frame": material("cam_shoe_frame", "#929290", 1.0, 0.38, normal_img=bimg, nstrength=0.4),
        # r7 (round-3 review: near black; on the silver body the wheel is bead-blasted silver): the rear command dial
        "dial_rear": material("cam_dial_rear", "#dcdcda", 1.0, 0.45, normal_img=bimg, nstrength=0.25),
        "shoe_plate": material("cam_shoe_plate", "#ebebe9", 1.0, 0.55),     # shoe base plate (light, matte metal)
        "shoe_cover": material("cam_shoe_cover", "#111111", 0.0, 0.32),     # black plastic shoe cover (shipped)
        "silver": material("cam_silver", "#e1e1e0", 1.0, 0.35, normal_img=bimg, nstrength=0.15),  # plates
        "dial": material("cam_silver_dial", "#e1e1e0", 1.0, 0.35, normal_img=bimg, nstrength=0.15),  # knurl, rims
        # r6 (review: the dial tops read 20-35 levels darker than the deck; on the camera they are as bright or
        # brighter): brighter spun tops, rougher than the deck (bead-blasted then spun)
        "dial_top": material("cam_silver_dial_top", "#e8e8e6", 1.0, 0.46, aniso=0.8, radial=True),  # spun tops
        "chrome": material("cam_chrome", "#dcdcda", 1.0, 0.18),            # satin-polished rings, lugs, contacts
        "contact": material("cam_contact", "#f2f2f0", 1.0, 0.30),           # shoe centre contact (r5: domed, satin)
        "ring": material("cam_silver_ring", "#d4d4d2", 1.0, 0.24),         # drive + STILL/MOVIE rings
        # r6: lathe-turned stainless, a touch darker and greyer, with concentric machining streaks (lathe_tangent)
        "bayonet": material("cam_bayonet", "#d4d1cb", 1.0, 0.26, aniso=0.7),
        # r5 (front silver2k medians: surround 159 top / 77 side vs 49 / 31 rendered): satin grey anodised ring
        # r6 (review: ring r 285-305 px 68 vs 97): lighter and rougher
        "gunmetal": material("cam_gunmetal", "#b2b2b0", 1.0, 0.48, normal_img=bimg, nstrength=0.2),
        "throat": material("cam_throat", "#2c2c2c", 0.0, 0.55),          # r6: dark grey mount throat and baffles
        "pin": material("cam_pin", "#e0d8bc", 1.0, 0.28),                  # r6: pale silver-gold lens contacts
        "sensor_edge": material("cam_sensor_edge", "#d4dc9c", 0.0, 0.35),  # r7: pale green-yellow bottom strip
        "black": material("cam_black_metal", "#161616", 0.6, 0.50),        # black paint: rear plate, rings, buttons
        "black_gloss": material("cam_black_gloss", "#0b0b0b", 0.0, 0.12, coat=0.6),  # shoe insulator
        "slot": material("cam_slot", "#3a3a3a", 0.3, 0.6),                # rear-dial slot interior (dark grey)
        "leather": material("cam_leather", "#1e1e1f", 0.0, 0.40),
        "rubber": material("cam_rubber", "#141414", 0.0, 0.85),            # eyecup, seals, throat
        "glass": material("cam_glass", "#050608", 0.0, 0.02, ior=1.52, coat=0.0),
        "lcd_glass": material("cam_lcd_glass", "#121417", 0.0, 0.05, ior=1.52, coat=1.0),  # LCD cover glass
        "screen": material("cam_screen", "#0a0b0e", 0.0, 0.06, ior=1.52),  # LCD active area (off, ~3% darker)
        "coated": material("cam_coated", "#06080a", 0.0, 0.03, thin_film=420.0, coat=1.0),  # rear element (opaque)
        # r5: front elements: curved coated glass the eye sees through to the inner element stack (glass_material)
        # r7 (round-3 review: a dark, opaque teal disc with two blob highlights; the reference shows bright, cool
        # element reflections and inner element edges): brighter, cooler reflections, a clearer see-through tint
        "glass_front": glass_material("cam_glass_front", "#05080a", "#d6e0e2", "#d2eaff", spec=0.5, rough=0.015),
        "glass_inner": glass_material("cam_glass_inner", "#0c1412", "#a9c4be", "#c4e6ff", spec=1.0, rough=0.08),
        "bore": material("cam_lens_bore", "#353535", 0.0, 0.32),          # r5: matt black retaining rings inside
        # r7: the polished edges of the inner elements / retaining rings seen through the front glass
        "element_edge": material("cam_element_edge", "#b9bdc2", 1.0, 0.22),
        # r7 (round-3 review: the silver XF35's name-ring bevel is satin lens silver, slightly darker than the barrel,
        # with dark grey engraved legends; it was the black version's black ring with white text)
        "lens_name": material("cam_lens_name", "#c4c4c2", 1.0, 0.42, normal_img=bimg, nstrength=0.15),
        "lens_legend": material("cam_lens_legend", "#2a2a2a", 0.0, 0.55),
        # r7 (round-3 review: the XF16-50 zoom ring read smooth and near black, 36 vs 70-76): ribbed rubber that
        # catches light on every rib
        "kit_rubber": material("cam_kit_rubber", "#3a3a3a", 0.0, 0.62, spec=0.55),
        # r7 (round-3 review minors): the bayonet's claws, mostly in shadow (albedo ~0.25); the ON/OFF collar's dark
        # satin grey (albedo ~0.35, roughness ~0.4; 70-110 from behind, was 150-230)
        "bayonet_dark": material("cam_bayonet_dark", "#8a8a88", 1.0, 0.40),
        "satin_collar": material("cam_satin_collar", "#a0a09e", 1.0, 0.40, normal_img=bimg, nstrength=0.15),
        "coated_green": material("cam_coated_green", "#1e2c29", 0.0, 0.18, thin_film=560.0, coat=1.0, spec=1.0),  # r7: grey-green, not black
        "evf": material("cam_evf_glass", "#0f1f1b", 0.0, 0.10, coat=0.6, emit="#06140f"),  # EVF eyepiece
        "amber": material("cam_amber", "#b0962c", 0.0, 0.22, coat=1.0),   # AF-assist lens (#7e7019 lit photo)
        "accent": material("cam_accent", "#e15409", 0.0, 0.50, spec=0.3, emit="#e15409"),  # orange A, dots (r5: vivid)
        "paint": material("cam_paint", "#f6f6f2", 0.0, 0.40),             # white legends and ticks
        "lettering": material("cam_engraving", "#0e0e0e", 0.0, 0.60),    # black-filled engravings on silver
        # (m2: cam_lettering is the FUJIFILM / X-T5 / [d64] decal atlas, build_camera.py)
        "gold": material("cam_gold", "#c9a14a", 1.0, 0.25),               # contacts
        "lamp": material("cam_lamp", "#a7aea9", 0.0, 0.25, coat=1.0),     # indicator lamp diffuser (unlit)
        "satin_dark": material("cam_satin_dark", "#5c5c5b", 1.0, 0.34),   # dark satin metal (sync cap, tab ridges)
        # r6: the lens-release collar and fins, the M/C/S lever ring (front closeups: satin grey with bright chamfers)
        "satin_mid": material("cam_satin_mid", "#7e7e7c", 1.0, 0.36, normal_img=bimg, nstrength=0.15),
        # r5: magenta-violet (front ref 109,58,97); r6: no coat (the review: a highlight band across it), gradient
        "sensor": material("cam_sensor", "#a8307a", 0.0, 0.32, spec=0.25),
    }
    evf_glow(M["evf"])
    # r7 (round-3 review: an angular Voronoi crackle with a glossy rim network, too dark, the grip finer than the
    # body and a hard seam between them): rounded blob pebbles of mixed size on a continuous base with soft valleys
    # (pebbles.py); one chassis strip map that cross-fades from the body grain (~0.5 mm) to the coarser grip grain
    # (~1.2 mm) across the grip's inner wall; tileable maps for the thumb rest and for the card door / port covers
    st = LEATHER["strip"]

    def xf(u_tex, a, b):
        u = u_tex + LEA_U0
        return a + (b - a) * smoothstep(LEA_XF[0], LEA_XF[1], u)
    kw = dict(LEATHER["finish"])
    nst = kw.pop("nstrength")
    ior_ = kw.pop("ior")
    imgs = xt5tex.pebble_set(texdir, "cam_leather", LEA_W, LEA_H, LEA_PX,
                             lambda u: xf(u, st["body"], st["grip"]), lambda u: xf(u, st["dep_body"], st["dep_grip"]),
                             wrap_u=False, seed=st["seed"], elong=st["elong"], fill=st["fill"], cdiv=2,
                             prof=st["prof"], **kw)
    xt5tex.leather_material(M["leather"], imgs, nstrength=nst, ior=ior_)
    for k_, nm_ in (("leather_pad", "cam_leather_pad"), ("leather_coarse", "cam_leather_coarse")):
        v = LEATHER[k_.split("_")[1]]
        imgs = xt5tex.pebble_set(texdir, nm_, 1024, 1024, 24.0 / 1024, lambda u, s_=v["sp"]: s_,
                                 lambda u, d_=v["dep"]: d_, wrap_u=True, seed=v["seed"], elong=v["elong"],
                                 fill=st["fill"], prof=st["prof"], **kw)
        xt5tex.leather_material(M[k_], imgs, nstrength=nst, ior=ior_)
    lathe_tangent(M["bayonet"])
    lathe_streaks(M["bayonet"])
    # r7 (round-3 review: the XF35 barrel was flat matte grey; the reference has a satin vertical gradient and
    # concentric brushing): circumferential anisotropy round the lens axis (renders; glTF keeps the scalar factors)
    next(n for n in M["lens"].node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs["Anisotropic"].default_value = 0.55
    lathe_tangent(M["lens"])
    sensor_gradient(M["sensor"])
    next(n for n in M["accent"].node_tree.nodes if n.type == "BSDF_PRINCIPLED").inputs[
        "Emission Strength"].default_value = 0.35          # r5: the orange reads vivid (#e15409) under the cards
    return M


def _radius_node(nt, axis_y_mm=35.0):
    """Distance (mm) from the lens axis (refs X=0, Y=35 -> Blender x=0, z=0.035) of the shading point."""
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sub = nt.nodes.new("ShaderNodeVectorMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = (0.0, 0.0, axis_y_mm * 0.001)
    mul = nt.nodes.new("ShaderNodeVectorMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = (1000.0, 0.0, 1000.0)
    ln = nt.nodes.new("ShaderNodeVectorMath")
    ln.operation = "LENGTH"
    nt.links.new(geo.outputs["Position"], sub.inputs[0])
    nt.links.new(sub.outputs["Vector"], mul.inputs[0])
    nt.links.new(mul.outputs["Vector"], ln.inputs[0])
    return ln.outputs["Value"]


def lathe_streaks(m, rough=(0.18, 0.36), shade=(0.86, 1.0)):
    """r6 (review: the bayonet was smooth; the reference shows concentric lathe marks): 1D noise along the radius
    modulates roughness and brightness ring by ring, so the turned face reads as concentric streaks (renders only;
    glTF keeps the scalar factors)."""
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    r = _radius_node(nt)
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.noise_dimensions = "1D"
    nz.inputs["Scale"].default_value = 2.6
    nz.inputs["Detail"].default_value = 6.0
    nz.inputs["Roughness"].default_value = 0.65
    nt.links.new(r, nz.inputs["W"])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.3
    mr.inputs["From Max"].default_value = 0.7
    mr.inputs["To Min"].default_value = rough[0]
    mr.inputs["To Max"].default_value = rough[1]
    nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], b.inputs["Roughness"])
    base = tuple(b.inputs["Base Color"].default_value)
    mc = nt.nodes.new("ShaderNodeMapRange")
    mc.inputs["From Min"].default_value = 0.3
    mc.inputs["From Max"].default_value = 0.7
    mc.inputs["To Min"].default_value = shade[1]
    mc.inputs["To Max"].default_value = shade[0]
    nt.links.new(nz.outputs["Fac"], mc.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"

    def sock(coll, ident):
        return next(s for s in coll if s.identifier == ident)
    sock(mix.inputs, "Factor_Float").default_value = 1.0
    sock(mix.inputs, "A_Color").default_value = base
    cb = nt.nodes.new("ShaderNodeCombineColor")
    for k in ("Red", "Green", "Blue"):
        nt.links.new(mc.outputs["Result"], cb.inputs[k])
    nt.links.new(cb.outputs["Color"], sock(mix.inputs, "B_Color"))
    nt.links.new(sock(mix.outputs, "Result_Color"), b.inputs["Base Color"])


def sensor_gradient(m):
    """r6: the sensor package's magenta fading to dark toward the lower right (front silver2k), from the box UVs
    (refs mm / 24): t = 0 at the package's upper left (-12.6, 44.15), 1 at its lower right (12.6, 25.85)."""
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sp = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["UV"], sp.inputs["Vector"])

    def lin(src, mul_, add_):
        n_ = nt.nodes.new("ShaderNodeMath")
        n_.operation = "MULTIPLY_ADD"
        n_.inputs[1].default_value = mul_
        n_.inputs[2].default_value = add_
        nt.links.new(src, n_.inputs[0])
        return n_.outputs["Value"]
    tx = lin(sp.outputs["X"], 24.0 / 25.2 * 0.45, 12.6 / 25.2 * 0.45)
    ty = lin(sp.outputs["Y"], -24.0 / 18.3 * 0.55, 44.15 / 18.3 * 0.55)
    add = nt.nodes.new("ShaderNodeMath")
    add.operation = "ADD"
    add.use_clamp = True
    nt.links.new(tx, add.inputs[0])
    nt.links.new(ty, add.inputs[1])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, srgb("#b83a8c")     # r7 (round-3 review): bright magenta upper left ...
    els[1].position, els[1].color = 1.0, srgb("#5e5b62")     # ... to grey at the lower right
    e = els.new(0.55)
    e.color = srgb("#80406e")
    nt.links.new(add.outputs["Value"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])


# r7 leatherette grain (pebbles.py / xt5tex.pebble_set; lengths in mm). --leather <json> overrides keys per variant
# for tuning runs (work/r7 lea*). prof: the pebble dome (1 - rho^p)^q, rounded so each pebble's upper half catches the
# top light across its width (a flat top with a steep rim only lit a sub-pixel ring).
LEATHER = {
    # chassis strip: pebble spacing (mm along u; / elong across) and height (mm), body -> grip
    # (work/r7 lea1..lea11: body pebbles ~1.0 x 0.6 mm as the front silver2k crop, grip ~1.5 mm, rounder)
    "strip": dict(body=0.9, grip=1.5, dep_body=0.20, dep_grip=0.28, seed=11, elong=1.5, fill=1.42, prof=(2.4, 0.7)),
    "pad": dict(sp=0.9, dep=0.20, seed=23, elong=1.5),          # rear thumb rest + hook (tileable, 24 mm)
    "coarse": dict(sp=1.0, dep=0.21, seed=31, elong=1.7),       # card door + port covers (slightly coarser)
    # finish: pebble tops vs valley floors (cavity from the height); no glossy rim network (round-3 review, and the
    # site look); nscale bakes a 2.5x slope into the normal map (the official renders' relief) so glTF needs no scale
    "finish": dict(col_top="#202022", col_val="#080808", rough_top=0.34, rough_val=0.55, spec_top=0.8,
                   spec_val=0.2, var=0.10, cav_k=0.35, nscale=2.5, nstrength=1.0, ior=1.5),
}


def lathe_tangent(m, axis_y_mm=35.0):
    """r5 (review: the bayonet was flat grey, the camera's is lathe-turned steel with concentric machining marks):
    anisotropic tangent running round the lens axis (refs X=0, Y=35 -> Blender x=0, z=0.035), computed from the
    world position (the body object sits at the origin), so the highlights fan out radially as on turned metal."""
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sub = nt.nodes.new("ShaderNodeVectorMath")
    sub.operation = "MULTIPLY"
    sub.inputs[1].default_value = (1.0, 0.0, 1.0)
    off = nt.nodes.new("ShaderNodeVectorMath")
    off.operation = "SUBTRACT"
    off.inputs[1].default_value = (0.0, 0.0, axis_y_mm * 0.001)
    cr = nt.nodes.new("ShaderNodeVectorMath")
    cr.operation = "CROSS_PRODUCT"
    cr.inputs[0].default_value = (0.0, 1.0, 0.0)
    nm = nt.nodes.new("ShaderNodeVectorMath")
    nm.operation = "NORMALIZE"
    nt.links.new(geo.outputs["Position"], sub.inputs[0])
    nt.links.new(sub.outputs["Vector"], off.inputs[0])
    nt.links.new(off.outputs["Vector"], cr.inputs[1])
    nt.links.new(cr.outputs["Vector"], nm.inputs[0])
    nt.links.new(nm.outputs["Vector"], b.inputs["Tangent"])


def evf_glow(m, centre=(0.0, 72.8), r=9.3, tile=24.0):
    """Renders only (glTF keeps the flat factors): the lit OLED seen through the eyepiece as a radial glow, bright
    green-white in the middle, dark green at the rim (rear silver render). Uses the box-projected UVs (refs mm / 24)."""
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sub = nt.nodes.new("ShaderNodeVectorMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = (centre[0] / tile, centre[1] / tile, 0.0)
    ln = nt.nodes.new("ShaderNodeVectorMath")
    ln.operation = "LENGTH"
    mul = nt.nodes.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = tile / r
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, srgb("#6f9886")      # r4: darker eyepiece (review: evenly glowing disc)
    els[1].position, els[1].color = 1.0, srgb("#020504")
    e = els.new(0.5)
    e.color = srgb("#1d3f33")
    nt.links.new(tc.outputs["UV"], sub.inputs[0])
    nt.links.new(sub.outputs["Vector"], ln.inputs[0])
    nt.links.new(ln.outputs["Value"], mul.inputs[0])
    nt.links.new(mul.outputs["Value"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.6


# ===================================================================================== helpers
# Cap height per unit of Blender text size, measured on 'H' in Blender 5.0 (work/r3/captest.py). r3: the r2 table held
# the fonts' em-relative cap heights (0.716 / 0.644), so every legend came out at ~73% of its specified cap height.
CAPS = {"calibrib.ttf": 0.4594, "arial.ttf": 0.5247, "arialbd.ttf": 0.4998, "segoeui.ttf": 0.4096,
        "segoeuib.ttf": 0.4050}


def CAPF(fontpath):
    return CAPS.get(os.path.basename(fontpath).lower(), 0.5247)


CAP = 0.716


def cm(cid):
    return CM[cid]


def P(c):
    p = c["pos"]
    return p["x"], p["y"], p["z"]


def place_y(x, y, z, deg=0.0):
    """Local +Z -> +Y at (x, y, z), spin deg around Y."""
    return T(x, y, z) @ R("Y", deg) @ AX_Y


BOLD = 0.035          # r4: outline offset (mm) that thickens the dial numerals (review: lighter than the camera's)


def label_flat(g, s, cap, mat, M, fontpath=FONT_NUM, spacing=1.0, align_x="CENTER", bold=0.0, condense=1.0):
    t = text_geo(s, cap / CAPF(fontpath), mat, fontpath, spacing=spacing, align_x=align_x, bold=bold)
    if not t.v:                                 # m2 LOD1: text off
        return
    if condense != 1.0:
        if align_x == "LEFT":
            x0 = min(p[0] for p in t.v)
        elif align_x == "RIGHT":
            x0 = max(p[0] for p in t.v)
        else:
            x0 = 0.0
        t.v = [(x0 + (u - x0) * condense, v, w) for (u, v, w) in t.v]
    g.merge(t, M)


def dial_label_matrix(ytop, ang_deg, r, rule):
    """Frame for flat text on a dial top (dial axis at x=z=0), at polar angle ang (deg, from +X toward +Z).
    rule 'out': reads radially outward; 'in': reads radially inward; 'tan': tangential, glyph bottoms to the centre.
    Seen from above every rule gives non-mirrored text (reading x up = +Y)."""
    a = math.radians(ang_deg)
    rh = Vector((math.cos(a), 0, math.sin(a)))
    th = Vector((-math.sin(a), 0, math.cos(a)))
    if rule == "out":
        d, u = rh, -th
    elif rule == "in":
        d, u = -rh, th
    else:
        d, u = th, rh
    return plane_M(Vector((0, ytop, 0)) + rh * r, d, u)


def face_matrix(o, d, u):
    return plane_M(o, d, u)


def axis_frame(o, n, up=(0, 1, 0)):
    return T(*o) @ frame((0, 0, 0), n, up)


# ===================================================================================== body shell
X_L, X_R = 52.65, -76.85          # body sides (camera left +X, right -X)
Z_F = 14.0                        # front face
Y_PLATE = 3.4                     # base plate / leatherette seam (r2: 3.25 front, 3.6 rear in the silver refs)
Y_TOP0, Y_TOP = 63.1, 73.3        # top plate lower edge / shoulder (r2: front silver ref seam at 63.1, was 64.3)
Z_REAR_PANEL = -23.5              # rear plate right of the LCD
X_LCD_STEP = -37.3                # LCD pocket edge (r4: housing to -35.8, shadow gap -36..-37.3, back silver2k)

# grip outline in plan (x, z), measured on the calibrated top view (max over height); front face junction first
GRIP = [(-44.2, 14.0), (-45.3, 14.3), (-46.2, 15.0), (-47.0, 16.2), (-47.9, 18.1), (-48.9, 20.2), (-50.0, 22.2),
        (-51.1, 23.8), (-52.3, 25.1), (-53.7, 26.0), (-55.3, 26.6), (-57.1, 26.93), (-58.9, 26.88), (-60.5, 26.4),
        (-62.3, 25.5), (-64.2, 24.5), (-66.2, 23.4), (-68.2, 22.3), (-69.8, 21.5), (-71.2, 20.1), (-72.4, 18.1),
        (-73.5, 15.4), (-74.5, 11.8), (-75.4, 8.9), (-76.1, 6.0), (-76.6, 3.0), (-76.85, 0.2)]
GRIP_S = catmull(GRIP, n_per=2)

# grip front (max Z) against height, from the grip-side silhouette
GRIP_FRONT = [(0, 26.9), (42.0, 26.85), (44.5, 26.65), (46.1, 26.35), (47.75, 25.95), (49.35, 25.35), (50.95, 24.85),
              (52.55, 24.25), (54.15, 23.55), (55.75, 22.85), (57.35, 22.35), (58.95, 21.85), (60.55, 21.65),
              (62.15, 21.55), (66.0, 21.5)]


def interp(tab, y):
    for (y0, v0), (y1, v1) in zip(tab, tab[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0) if y1 > y0 else 0
            return v0 + (v1 - v0) * t
    return tab[0][1] if y < tab[0][0] else tab[-1][1]


# r2: the grip's inner wall meets the front face in a crisp crease whose X runs from -43.3 under the top plate to
# -48.9 below Y 44 (S-curve, front silver ref); the wall leaves the crease steeply, through a 1.2 mm fillet.
GRIP_JX = [(0.0, -48.9), (44.0, -48.9), (48.0, -48.1), (52.4, -46.5), (57.0, -44.5), (63.0, -43.3), (66.0, -43.2)]
GRIP_OUT = [p for p in GRIP_S if p[0] <= -48.85]
GRIP_RF = 1.2


def chassis_ctrl(y):
    s = (interp(GRIP_FRONT, y) - Z_F) / (26.93 - Z_F)
    rl = -19.0 if y <= 58.3 else Z_REAR_PANEL   # r4: flush above the LCD (a 0.5 mm step there poked a sliver
                                                # through the plate's lower chamfer under AF-ON)
    pts, rad, seg = [], [], []
    pts.append((X_L, Z_F)); rad.append(7.0); seg.append(8)
    xw = interp(GRIP_JX, y)
    for k in range(4):                         # concave fillet: front face -> inner wall
        th = (math.pi / 2) * k / 3
        pts.append((xw + GRIP_RF - GRIP_RF * math.sin(th), Z_F + GRIP_RF - GRIP_RF * math.cos(th)))
        rad.append(0.0); seg.append(0)
    x0, z0 = GRIP_OUT[0]
    z0s = Z_F + (z0 - Z_F) * s
    for t in (0.25, 0.5, 0.75):                # inner wall, leaving the crease steeply toward the leading edge
        pts.append((xw + (x0 - xw) * t * t, Z_F + GRIP_RF + (z0s - Z_F - GRIP_RF) * t)); rad.append(0.0); seg.append(0)
    for (x, z) in GRIP_OUT:
        pts.append((x, Z_F + (z - Z_F) * s if z > Z_F else z)); rad.append(0.0); seg.append(0)
    pts.append((X_R, Z_REAR_PANEL)); rad.append(3.5); seg.append(5)
    for xx in LIP_X[:3]:                       # r3: vertices for the silver lip behind AF-ON / the rear dial
        pts.append((xx, Z_REAR_PANEL)); rad.append(0.0); seg.append(0)
    pts.append((X_LCD_STEP, Z_REAR_PANEL)); rad.append(0.5); seg.append(2)
    pts.append((X_LCD_STEP if y <= 58.3 else X_LCD_STEP + 1.5, rl)); rad.append(0.5); seg.append(2)
    for xx in LIP_X[4:]:
        pts.append((xx, rl)); rad.append(0.0); seg.append(0)
    pts.append((X_L, rl)); rad.append(4.0); seg.append(6)
    return pts, rad, seg


# r3 (refs run 2, colour_zones): the silver top plate's lower edge and the silver base band's top edge vary by face.
LIP_X = (-52.0, -50.6, -49.4, -33.0, -32.2, -30.8)


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def seam_top(x, z, nx, nz):
    """Y of the top plate's lower edge at a perimeter point with outward plan normal (nx, nz): front 63.15, port
    side 64.3, grip side 63.65, rear 63.2 dropping to 60.9 behind AF-ON / the rear dial (X -50..-32)."""
    # r4: no drop behind AF-ON: the back silver2k render shows the silver ending at Y 63.2 all along the rear, with a
    # satin-black band (Y 61..63.2) under it that the run-2 colour zones read as plate (it made a bulge and a streak)
    vals = (63.15, 63.2, 64.3, 63.65)
    w = (max(0.0, nz) ** 2, max(0.0, -nz) ** 2, max(0.0, nx) ** 2, max(0.0, -nx) ** 2)
    return sum(a * b for a, b in zip(vals, w)) / max(1e-9, sum(w))


def seam_base(x, z, nx, nz):
    """Y of the silver base band's top edge: front 3.5 (3.1 on the grip front), port side 3.6, grip side 3.5,
    rear 3.25 (3.5 at the port end)."""
    front = 3.5 - 0.4 * (1.0 - smoothstep(-57.0, -55.0, x))
    rear = 3.25 + 0.25 * smoothstep(44.0, 47.0, x)
    vals = (front, rear, 3.6, 3.5)
    w = (max(0.0, nz) ** 2, max(0.0, -nz) ** 2, max(0.0, nx) ** 2, max(0.0, -nx) ** 2)
    return sum(a * b for a, b in zip(vals, w)) / max(1e-9, sum(w))


def ring_normals(pts):
    """Outward plan normals of a CCW (x, z) ring that may repeat points."""
    n = len(pts)
    out = []
    for i in range(n):
        j = 1
        while j < n and math.dist(pts[(i + j) % n], pts[i]) < 1e-6:
            j += 1
        k = 1
        while k < n and math.dist(pts[(i - k) % n], pts[i]) < 1e-6:
            k += 1
        a, c = pts[(i - k) % n], pts[(i + j) % n]
        tx, tz = c[0] - a[0], c[1] - a[1]
        L = math.hypot(tx, tz) or 1.0
        out.append((tz / L, -tx / L))
    return out


def remap_levels(g, levels, fn):
    """Move the vertices of a fresh loft Geo vertically: y += fn(x, y, z, nx, nz) (levels as given to loft)."""
    n = len(levels[0][1])
    for j, (_, pts) in enumerate(levels):
        nrm = ring_normals(pts)
        for i in range(n):
            vx, vy, vz = g.v[j * n + i]
            g.v[j * n + i] = (vx, vy + fn(vx, vy, vz, *nrm[i]), vz)
    return g


def chassis_mat(c, n):
    x, y, z = c
    if y < Y_PLATE - 0.02:
        return "silver"
    if n[2] < -0.6:
        return "black"
    # r7 (round-3 review: a hard seam where the grip's own material met the body's): one leatherette material all
    # round the chassis, on a continuous unwrap (chassis_leather_uv) whose strip map cross-fades from the body grain
    # to the coarser grip grain across the grip's inner wall
    return "leather"


def chassis_levels():
    lv = []
    r = 1.6                                    # r4: base band corners r ~1.6 (front/side silver2k; was 1.0)
    for k in range(4):
        a = (math.pi / 2) * k / 3
        lv.append((r * (1 - math.cos(a)), -r * (1 - math.sin(a))))
    lv += [(3.22, 0.0), (3.32, -0.10), (3.40, -0.32), (3.52, -0.32), (3.62, -0.10),
           (20.0, -0.10), (30.0, -0.10), (38.0, -0.10), (42.0, -0.10), (44.5, -0.10), (46.1, -0.10),
           (47.75, -0.10), (49.35, -0.10), (50.95, -0.10), (52.55, -0.10), (54.15, -0.10), (55.75, -0.10),
           (57.35, -0.10), (58.25, -0.10), (58.45, -0.10), (60.55, -0.10), (61.6, -0.10), (62.5, -0.10),
           (62.95, -0.40), (63.25, -1.1), (63.35, -1.6)]
    return lv


# ------------------------------------------------------------------ r7 chassis leatherette unwrap (one strip map)
# u runs round the chassis in mm: 0 at the start of the port-front corner arc, along the front face to the grip's
# inner crease (pinned to LEA_UC on every level, so the front face stretches <= 6% where the crease moves inboard
# under the top plate), over the grip (arc length, rescaled per level to end at LEA_UG on the grip side's flat
# part), along the grip side, and backwards (negative) from the port-front corner along the port side. The wrap of
# the strip map falls on the black-painted rear face. v = y. The strip map is LEA_W x LEA_H px at LEA_PX mm/px:
# non-repeating in u (u = LEA_U0 .. LEA_U0 + LEA_LU), tiling in v (period LEA_LV).
LEA_U0, LEA_PX, LEA_W, LEA_H = -40.0, 0.03, 8192, 768
LEA_LU, LEA_LV = LEA_W * LEA_PX, LEA_H * LEA_PX


def _ring_index_map(seg):
    counts = [s_ + 1 if s_ > 0 else 1 for s_ in seg]
    starts = [sum(counts[:k]) for k in range(len(counts))]
    G = len(GRIP_OUT)
    kg = next(k for k, (x, z) in enumerate(GRIP_OUT) if z <= Z_F)
    return {"i8": counts[0] - 1, "i9": starts[1], "ig": starts[8 + kg], "split": starts[15 + G]}


def _ring_arcs(ring):
    a = [0.0]
    for p, q in zip(ring, ring[1:]):
        a.append(a[-1] + math.dist(p, q))
    return a, a[-1] + math.dist(ring[-1], ring[0])


def _lea_constants():
    pts, rad, seg = chassis_ctrl(30.0)
    ring = fillet_poly(pts, rad, seg, offset=-0.10)
    ix = _ring_index_map(seg)
    a, P = _ring_arcs(ring)
    uc = a[ix["i9"]]
    spans = []
    for (y, off) in chassis_levels():
        if 3.6 <= y <= 62.6:
            p_, r_, s_ = chassis_ctrl(y)
            rg = fillet_poly(p_, r_, s_, offset=off)
            aa, _ = _ring_arcs(rg)
            spans.append(aa[ix["ig"]] - aa[ix["i9"]])
    return uc, uc + sum(spans) / len(spans)


LEA_UC, LEA_UG = _lea_constants()
LEA_XF = (LEA_UC + 0.5, LEA_UC + 6.5)       # body -> grip grain cross-fade (u mm): the fillet and the inner wall


def ring_u(ring, seg):
    ix = _ring_index_map(seg)
    a, P = _ring_arcs(ring)
    i8, i9, ig, sp = ix["i8"], ix["i9"], ix["ig"], ix["split"]
    u = []
    for i in range(len(ring)):
        if i <= i8:
            u.append(a[i])
        elif i < i9:
            u.append(a[i8] + (LEA_UC - a[i8]) * (a[i] - a[i8]) / max(1e-9, a[i9] - a[i8]))
        elif i <= ig:
            u.append(LEA_UC + (LEA_UG - LEA_UC) * (a[i] - a[i9]) / max(1e-9, a[ig] - a[i9]))
        elif i <= sp:
            u.append(LEA_UG + a[i] - a[ig])
        else:
            u.append(a[i] - P)
    return u, sp


def chassis_leather_uv(g):
    """Per-corner UVs for the chassis's leather faces from the continuous unwrap: every vertex is projected onto the
    rings of the two nearest loft levels (exact for the ring vertices; the throat cut on the front face projects onto
    the front segment)."""
    refs = []
    for (y, off) in chassis_levels():
        if 3.3 <= y <= 63.0:
            p_, r_, s_ = chassis_ctrl(y)
            ring = fillet_poly(p_, r_, s_, offset=off)
            u, sp = ring_u(ring, s_)
            refs.append((y, ring, u, sp))
    refs.sort(key=lambda t: t[0])

    def proj(ring, u, sp, x, z):
        best = (1e18, 0.0)
        n = len(ring)
        for i in range(n):
            j = (i + 1) % n
            if i == sp:
                continue
            (x0, z0), (x1, z1) = ring[i], ring[j]
            ex, ez = x1 - x0, z1 - z0
            L2 = ex * ex + ez * ez
            t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, ((x - x0) * ex + (z - z0) * ez) / L2))
            d = (x0 + ex * t - x) ** 2 + (z0 + ez * t - z) ** 2
            if d < best[0]:
                uj = u[j] if j != 0 else 0.0
                best = (d, u[i] + (uj - u[i]) * t)
        return best[1]
    cache = {}

    def uv(k):
        if k not in cache:
            x, y, z = g.v[k]
            ys = [r[0] for r in refs]
            j = max(0, min(len(refs) - 2, next((q for q in range(len(ys) - 1) if ys[q + 1] >= y), len(ys) - 2)))
            (ya, ra, ua, sa), (yb, rb, ub, sb) = refs[j], refs[j + 1]
            t = max(0.0, min(1.0, (y - ya) / max(1e-9, yb - ya)))
            uu = proj(ra, ua, sa, x, z) * (1 - t) + proj(rb, ub, sb, x, z) * t
            cache[k] = ((uu - LEA_U0) / LEA_LU, y / LEA_LV)
        return cache[k]
    nset = 0
    for fi, f in enumerate(g.f):
        if g.m[fi] != "leather":
            continue
        uvs = [uv(k) for k in f]
        us = [p[0] for p in uvs]
        if max(us) - min(us) > 0.5:          # never across the strip's wrap (the rear face is black anyway)
            continue
        g.uv[fi] = uvs
        nset += 1
    print("LEATHER_UV faces", nset)
    return g


def build_chassis():
    lv = chassis_levels()
    levels = []
    for (y, off) in lv:
        pts, rad, seg = chassis_ctrl(y)
        levels.append((y, fillet_poly(pts, rad, seg, offset=off)))

    def shift(x, y, z, nx, nz):                # r3: per-face seams (the top rings tuck under the plate's lower edge)
        d = 0.0
        if y >= 58.45:
            d += (seam_top(x, z, nx, nz) - Y_TOP0) * min(1.0, (y - 58.45) / (Y_TOP0 - 58.45))
        if 1.0 <= y <= 20.0:
            w = (y - 1.0) / (3.22 - 1.0) if y < 3.22 else (1.0 if y <= 3.62 else (20.0 - y) / (20.0 - 3.62))
            d += (seam_base(x, z, nx, nz) - Y_PLATE) * w
        return d
    return remap_levels(loft(levels, chassis_mat), levels, shift)


def top_rear(y):
    return -23.35 + (y - 62.95) * (5.65 / 10.35)     # inclined rear face: -23.35 at the seam, -17.7 at the shoulder


TOP_TILT = math.atan2(5.65, 10.35)
TOP_NRM = Vector((0, math.sin(TOP_TILT), -math.cos(TOP_TILT)))      # outward normal of the inclined rear face
TOP_UP = Vector((0, math.cos(TOP_TILT), math.sin(TOP_TILT)))        # up along that face


# r2: the silver block over the grip. In plan its front follows an arc concentric with the front command dial
# (r 8.9 round the shutter axis, top view: plate edge inside the teeth from X -43.4 to -54), then runs back to the
# grip-side corner along the measured top-view edge. The block face tops out at Z 21.6 (grip-side view: 21.4), the
# wheel rim (r 10.25) stands ~1.3 mm proud of it through a slot (see SLOT_* and build_slot_cutter).
CMD_C = (-52.5, 12.7)
BLOCK_R = 8.9
BLOCK_PTS = ([(CMD_C[0] + BLOCK_R * math.cos(math.radians(a)), CMD_C[1] + BLOCK_R * math.sin(math.radians(a)))
              for a in (8.5, 20, 32, 44, 56, 68, 80, 92, 104)]
             + [(-57.2, 20.35), (-60.5, 18.9), (-64.7, 16.7), (-70.0, 14.4), (-73.4, 12.2), (-75.5, 9.7), (-76.5, 6.6)])


def top_ctrl(y):
    R_ = top_rear(y)
    pts = ([(X_L, Z_F), (BLOCK_PTS[0][0], Z_F)] + BLOCK_PTS[1:] + [(X_R, 3.0), (X_R, R_)] + [(xx, R_) for xx in LIP_X]
           + [(X_L, R_)])
    rad = [7.5, 0.5] + [0.0] * (len(BLOCK_PTS) - 1) + [3.0, 9.0] + [0.0] * len(LIP_X) + [6.5]
    seg = [8, 2] + [0] * (len(BLOCK_PTS) - 1) + [4, 8] + [0] * len(LIP_X) + [7]     # r6: 4 segs (25 deg crease)
    return pts, rad, seg


SLOT_Y = (64.5, 68.8)        # front command dial window (front silver ref: X -62.2..-43, Y 64.5..68.8)
CMD_Y = (65.0, 68.3)         # wheel thickness seen in the window


def build_slot_cutter():
    y0, y1 = SLOT_Y
    # r7 (round-3 review: a black frame with 45-degree (octagonal) corners; the reference window is a rounded
    # rectangle with a silver lip): r 0.9 rounded corners, the cut's walls in the plate's silver
    rc = 0.9
    prof = [(0.0, y0), (11.0 - rc, y0)]
    prof += [(11.0 - rc + rc * math.sin(math.radians(a)), y0 + rc - rc * math.cos(math.radians(a))) for a in (30, 60)]
    prof += [(11.0, y0 + rc), (11.0, y1 - rc)]
    prof += [(11.0 - rc + rc * math.cos(math.radians(a)), y1 - rc + rc * math.sin(math.radians(a))) for a in (30, 60)]
    prof += [(11.0 - rc, y1), (0.0, y1)]
    return revolve(prof, 112, "silver").transformed(T(CMD_C[0], 0, CMD_C[1]) @ AX_Y)


TOP_CH = 0.42      # r4: crisp machined top edge: a 45-degree chamfer that catches a highlight line (was r 2.2 round)


# r6 (review: a bright fluted chrome roller filling a round-ended pill slot; the camera's is a dark gunmetal gear with
# ~20 deep, separated teeth showing, in a square-cornered window with a bright chamfered rim and black clearance round
# the wheel; back silver2k: window X -57.5..-40.8, Y 65.5..70.3, gear X -56.7..-41.9, teeth Y 66.6..69.8)
# r7: the wheel stands ~2.4 mm proud of the inclined face (grip-side silver2k: rim Z -23.8 vs the face -21.3 at Y 68;
# the top view shows a deep arc of teeth) and is wider than the window (control map dia 17), so the window clips it
REAR_DIAL = {"dia": 17.0, "rim_z": -23.0, "teeth_pitch": 1.3, "depth": 1.1, "y": (66.6, 69.8)}
# r7 (round-3 review: a near-black gear in a thick black-lined slot; on the silver body the wheel is bead-blasted
# silver with chunky teeth standing out of a silver-bevelled window): the window's outer edge on the inclined face is
# the measured window (back silver2k X -57.5..-40.8, Y 65.5..70.3); a 45-degree silver lip chamfers in to 0.2 mm
# round the wheel's silhouette, so only a 0.2 mm dark liner shows; dark is kept for the tooth gaps and the slot floor
REAR_WIN = (66.0, 70.3, 0.6, 0.6)            # outer window Y0, Y1, outer corner radius, lip depth (mm)
REAR_GAP = 0.2                                # dark clearance round the wheel (mm)


def rear_window(grow=0.0, inner=False):
    """Outer window (on the face) or, inner=True, the lip's inner edge: the wheel's back-view silhouette + REAR_GAP."""
    c = cm("rear_command_dial")
    if inner:
        gx, R_ = c["pos"]["x"], REAR_DIAL["dia"] / 2
        x0, x1 = gx - R_ - REAR_GAP, gx + R_ + REAR_GAP
        y0, y1 = REAR_DIAL["y"][0] - REAR_GAP, REAR_DIAL["y"][1] + REAR_GAP
        ox0, ox1 = c["size"]["window_x"]
        x0, x1 = max(x0, ox0 + 0.25), min(x1, ox1 - 0.25)
        y0, y1 = max(y0, REAR_WIN[0] + 0.25), min(y1, REAR_WIN[1] - 0.25)
        rc = 0.3
    else:
        x0, x1 = c["size"]["window_x"]
        y0, y1, rc = REAR_WIN[:3]
    return fillet_poly([(x0 - grow, y0 - grow), (x1 + grow, y0 - grow), (x1 + grow, y1 + grow), (x0 - grow, y1 + grow)],
                       [rc + grow] * 4, [3] * 4)


def build_rear_slot_cutters():
    """r4: the rear command dial's window cut into the inclined rear face (dark walls), and the small notch under its
    middle (back silver2k, DPR rear photo). r6: square corners (r 0.5); the cut is the window grown by the rim
    chamfer, which build_rear_slot_trim() fills with the bright chamfer and a dark liner at the window's own size."""
    c = cm("rear_command_dial")
    # cut straight forward (horizontal), so a level view from the back sees the wheel across the whole window
    cut = slab_on([(-x, y) for (x, y) in rear_window(0.0)], (0, 0, -26.0), (-1, 0, 0), (0, 1, 0), -12.5, 0.0,
                  "slot")
    # r6: the dark tab under the window's middle, 5.4 mm wide, its round end at Y 64.5 (back silver2k)
    notch = slab_on([(-x, y) for (x, y) in circle2(c["pos"]["x"], 67.2, 2.7, 28)], (0, 0, -26.0), (-1, 0, 0),
                    (0, 1, 0), -(top_rear(65.5) + 0.9 + 26.0), 0.0, "slot")
    return [cut, notch]


def build_rear_slot_trim(g):
    """r7: the window's silver lip (bead-blast deck silver) from the outer window on the inclined face, chamfered in
    and REAR_WIN[3] deep to the wheel's silhouette + 0.2 mm, then the dark liner walls forward to the slot floor at
    Z -13.45, and the floor."""
    dep = REAR_WIN[3]
    outer = rear_window(0.0)
    inner = rear_window(inner=True)
    assert len(outer) == len(inner)
    zo = [top_rear(y) - 0.02 for (_, y) in outer]
    zi = [top_rear(y) + dep for (_, y) in inner]          # a shallow chamfer: it reflects what the face reflects
    n = len(outer)
    verts = [(x, y, z) for (x, y), z in zip(outer, zo)] + [(x, y, z) for (x, y), z in zip(inner, zi)]
    verts += [(x, y, -13.45) for (x, y) in inner]
    faces_c = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    faces_l = [(n + i, n + (i + 1) % n, 2 * n + (i + 1) % n, 2 * n + i) for i in range(n)]
    cg = Geo("rim")
    cg.add(verts, faces_c, "silver")
    lg = Geo("liner")
    lg.add(verts, faces_l, "black")
    # orient both outward (toward the opening's axis = -Z viewer side): test one face normal against -Z / inward
    for gg, want in ((cg, -1.0), (lg, None)):
        f = gg.f[0]
        a, b, c_ = (Vector(gg.v[f[k]]) for k in range(3))
        nrm = (b - a).cross(c_ - a)
        if want is not None and nrm.z * want < 0:
            gg.f = [tuple(reversed(f_)) for f_ in gg.f]
        if want is None:
            # liner faces point into the opening: toward the window centre
            ctr = Vector((sum(p[0] for p in inner) / n, sum(p[1] for p in inner) / n, a.z))
            if nrm.dot(ctr - a) < 0:
                gg.f = [tuple(reversed(f_)) for f_ in gg.f]
    g.merge(cg)
    g.merge(lg)
    g.merge(fill_polys([[[(-x, y) for (x, y) in inner], []]], 0.0, 0.0, "black", name="slotfloor"),
            plane_M((0, 0, -13.45), (-1, 0, 0), (0, 1, 0)))
    return g


def build_top_plate():
    ch = TOP_CH
    lv = [(62.95, -0.40), (63.25, 0.0), (Y_TOP - ch - 0.06, 0.0), (Y_TOP - 0.06, -ch), (Y_TOP, -ch - 0.1)]
    levels = []
    for (y, off) in lv:
        pts, rad, seg = top_ctrl(y)
        levels.append((y, fillet_poly(pts, rad, seg, offset=off)))
    y_hi = Y_TOP - ch - 0.06

    def shift(x, y, z, nx, nz):                # r3: per-face lower edge, faded out by the top rounding
        return (seam_top(x, z, nx, nz) - Y_TOP0) * max(0.0, (y_hi - y) / (y_hi - Y_TOP0)) if y < y_hi else 0.0
    g = remap_levels(loft(levels, "silver"), levels, shift)
    return g


def hump_dims(y):
    """EVF hump plan per height: front F, rear Rh, half widths wl (+X) and wr (-X)."""
    # r4 (silver side + front 2000 px views): the FUJIFILM face is vertical at Z 15.25 from Y 69.9 to the facet at
    # 81.8; under it a 3.6 mm band leans back ~21 deg (Z 15.25 at Y 69.9 -> 13.9 at 66.3, into the top plate), the
    # darker strip of the silver front render (it faces the dark floor); the front facet falls 1.95 mm per mm
    # (side view: Z 15.2 at Y 81.84, 7.98 at 85.5)
    if y < 66.3:
        F = 13.9
    elif y < 69.9:
        F = 13.9 + 1.35 * (y - 66.3) / 3.6
    elif y <= HUMP_FACET_Y:
        F = 15.25
    else:
        F = 15.25 - (y - HUMP_FACET_Y) * 1.95
    Rh = -25.0 if y <= 88.0 else -25.0 + (y - 88.0)
    wr = interp(HUMP_W, y)
    wl = wr + 0.4 * max(0.0, min(1.0, (y - 77.6) / 5.0))
    return F, Rh, wl, wr


HUMP_FACET_Y = 81.8

# hump half width (-X side) against height, from the front and back silhouettes (flank steepens toward the top)
HUMP_W = [(60.0, 23.3), (77.6, 23.3), (82.8, 20.1), (83.45, 19.35), (84.75, 17.75), (86.65, 16.15), (88.85, 14.5),
          (90.3, 13.2), (91.0, 12.9)]


def hump_mat(c, n):
    if n[2] < -0.75:
        return "black"
    return "silver"


def build_hump():
    """r4: a crisp trapezoid prism: planar facets with 0.4 mm edge bevels (2 segments, so the shading keeps a sharp
    highlight line on every edge), no more 1-1.6 mm fillets and the r 0.7 top rounding."""
    ys = [63.6, 66.3, 69.9, 77.6, HUMP_FACET_Y, 82.8, 83.45, 84.75, 86.65, 88.0, 88.85, 90.3, 90.6]
    lv = [(y, 0.0) for y in ys]
    r = 0.4
    for k in range(1, 3):
        a = (math.pi / 2) * k / 2
        lv.append((90.6 + r * math.sin(a), -r * (1 - math.cos(a))))
    levels = []
    for (y, off) in lv:
        F, Rh, wl, wr = hump_dims(min(y, 91.0))
        pts = [(wl, F), (-wr, F), (-wr, Rh), (wl, Rh)]
        levels.append((y, fillet_poly(pts, [0.45, 0.45, 0.8, 0.8], [2, 2, 2, 2], offset=off)))
    return loft(levels, hump_mat)


def hump_flank(side, y):
    """x on the hump flank (side +1 = +X) at height y, and the flank's outward normal."""
    F, Rh, wl, wr = hump_dims(y)
    F2, R2, wl2, wr2 = hump_dims(y + 0.5)
    w0, w1 = (wl, wl2) if side > 0 else (wr, wr2)
    n = Vector((side * 0.5, (w0 - w1), 0)).normalized()
    return (wl if side > 0 else -wr), n


# ===================================================================================== parts on the body
# r6 (review: the mount sat 0.6-1.0 mm forward of the silver2k top / bottom views): the bayonet's front face at Z 17.75
# (top silver2k brightness edge 17.87; the X-mount flange distance is 17.7 mm). The lens flange seats here.
MOUNT_Z = 17.75


def build_mount(g, N=96):                  # r7: 128 -> 96 steps (0.015 mm chord error at r 27; D-021 budget)
    C = T(0, 35.0, 0)
    dz = MOUNT_Z - 18.4
    # surround ring: top silver2k shows its front edge at Z ~15.2 and the bayonet starting at ~16.65
    g.merge(revolve([(30.55, 13.6), (30.55, 15.6 + dz), (30.15, 16.7 + dz), (29.3, 17.15 + dz), (27.4, 17.3 + dz)], 112,
                    "gunmetal"), C)
    g.merge(revolve([(27.35, 17.3 + dz), (27.35, 18.05 + dz), (27.0, MOUNT_Z), (22.25, MOUNT_Z), (21.85, 18.0 + dz),
                     (21.85, 15.4 + dz)], N, "bayonet"), C)
    # r6 (review: a pure black throat; the reference's is dark grey with inner baffle steps): three steps in
    zt = 15.4 + dz
    g.merge(revolve([(21.85, zt), (21.2, zt), (21.2, 12.3), (20.4, 12.3), (20.4, 9.5), (19.6, 9.5), (19.6, 6.6),
                     (18.8, 6.6), (18.8, 4.0), (17.6, 3.0), (0.0, 3.0)], 64, "throat"), C)
    for a0 in (65.0, 155.0, 335.0):           # bayonet claws behind the front lip (top, left, right)
        # r7 (round-3 review: wide pale bars floating in the throat): narrow ~1 mm lips continuous with the ring, dark
        g.merge(revolve([(21.85, 15.6 + dz), (20.85, 15.6 + dz), (20.85, 17.6 + dz), (21.85, 17.6 + dz)], 16, "bayonet_dark",
                        arc=math.radians(50), a0=math.radians(a0)), C)
    for k in range(6):                         # screws on the bayonet face, 6 at r 25
        a = math.radians(60 * k)
        x, y = 25.0 * math.cos(a), 35.0 + 25.0 * math.sin(a)
        # r6 (review: domed heads 0.6 mm proud; reference +0.2): near-flush flat heads with a fine chamfer, a bold
        # Phillips cross, in a dark seam
        # r7 (round-3 review: heavy black cross recesses and outlines): a satin-dark seam and cross
        g.merge(revolve([(1.95, MOUNT_Z + 0.01), (1.75, MOUNT_Z + 0.01)], 24, "satin_dark"), T(x, y, 0))
        g.merge(revolve([(1.75, MOUNT_Z - 0.1), (1.75, MOUNT_Z + 0.08), (1.55, MOUNT_Z + 0.18), (0.0, MOUNT_Z + 0.2)],
                        24, "chrome"), T(x, y, 0))
        for d in (0, 90):
            g.merge(rbox(1.9, 0.32, 0.02, mat="satin_dark"), T(x, y, MOUNT_Z + 0.21) @ R("Z", d + 15))
    # r7 (round-3 review: a flat grey trapezoid; the reference block is a black crescent with raised ends)
    g.merge(revolve([(21.0, 12.0 + dz), (21.0, 15.2 + dz), (16.2, 15.2 + dz), (16.2, 12.0 + dz)], 24, "black",
                    arc=math.radians(80), a0=math.radians(230)), C)
    for a_end in (230.0, 304.0):
        g.merge(revolve([(21.0, 12.0 + dz), (21.0, 15.9 + dz), (16.2, 15.9 + dz), (16.2, 12.0 + dz)], 3, "black",
                        arc=math.radians(6), a0=math.radians(a_end)), C)
    for k in range(10):                        # 10 contacts at the bottom of the throat (r6: pale silver-gold)
        a = math.radians(238 + 64 * k / 9)
        g.merge(cyl(0.42, 15.2 + dz, 15.45 + dz, 10, "pin"), T(18.6 * math.cos(a), 35 + 18.6 * math.sin(a), 0))
    g.merge(revolve([(1.0, 18.2 + dz), (1.0, 19.0 + dz), (0.8, 19.3 + dz), (0.0, 19.4 + dz)], 20, "chrome"),
            T(-17.7, 17.2, 0))                                                         # lock pin
    g.merge(disc(0.95, MOUNT_Z + LIFT, 20, "accent"), T(-20.9, 48.5, 0))               # mount index dot
    # r6 (review: the bare 23.6 x 15.9 die with a highlight band; the reference shows the ~25.2 x 18.3 cover-glass
    # package, magenta fading to dark toward the lower right, a pale strip along its bottom edge)
    g.merge(rbox(25.2, 18.3, 0.4, mat="sensor"), T(0, 35, 4.0))
    g.merge(rbox(24.6, 0.45, 0.05, mat="sensor_edge"), T(0, 35 - 9.15 + 0.4, 4.22))
    return g


def ring_button(g, x, y, z, M_axis, ring_od, btn_d, proud=1.0, ring_mat="chrome", btn_mat="black", N=40,
                dome=0.25, ring_h=0.45):
    """Round button in a ring on a face; M_axis maps local +Z to the face's outward normal."""
    M = T(x, y, z) @ M_axis
    ro, ri = ring_od / 2, btn_d / 2 + 0.3
    g.merge(revolve([(ro, -0.3), (ro, ring_h - 0.15), (ro - 0.2, ring_h), (ri + 0.15, ring_h), (ri, ring_h - 0.2),
                     (ri, -0.3)], N, ring_mat), M)
    rb = btn_d / 2
    g.merge(revolve([(ri, 0.05), (rb, 0.05)], N, "rubber"), M)          # r2: dark gap round the button
    g.merge(revolve([(rb, -0.3), (rb, proud - 0.3), (rb - 0.3, proud), (rb * 0.5, proud + dome * 0.6),
                     (0.0, proud + dome)], N, btn_mat), M)
    return M


def build_front_controls(g):
    # AF-assist lamp: dark bezel with a bright rim, amber lens
    x, y, z = P(cm("af_assist_lamp"))
    M = T(x, y, Z_F)
    g.merge(revolve([(3.0, -0.2), (3.0, 0.45), (2.7, 0.75), (1.7, 0.75), (1.55, 0.55)], 40, "black"), M)
    g.merge(revolve([(1.55, 0.55), (1.2, 0.8), (0.0, 0.92)], 24, "amber"), M)
    g.merge(revolve([(3.02, 0.45), (2.85, 0.64)], 40, "chrome"), M)
    # Fn2 (chrome ring)
    x, y, z = P(cm("fn2_button"))
    ring_button(g, x, y, Z_F, Matrix.Identity(4), 7.9, 5.5, proud=1.1, ring_h=0.8)
    # lens release (r2): satin boss (dia 11.3) with a dark gap round a black button, joined to the mount surround by
    # two triangular guard fins (one above, one to the right), front silver ref
    x, y, z = P(cm("lens_release"))
    M = T(x, y, Z_F)
    # r4: broad satin ring (dia 11.8, ~2.2 mm wide), 0.4 mm black gap, dark button dia 7.0 (front closeup)
    # r6 (review: a flat dark ring, 51 vs 80): a raised collar in the gunmetal satin with 0.35 mm 45-degree chamfers
    # on both edges that catch bright highlights, a slightly crowned top
    g.merge(revolve([(5.9, -0.2), (5.9, 1.05), (5.55, 1.4), (4.85, 1.48), (4.3, 1.4), (3.95, 1.05),
                     (3.9, 0.3)], 48, "satin_mid"), M)
    g.merge(revolve([(3.9, 0.3), (3.5, 0.3)], 48, "rubber"), M)
    g.merge(revolve([(3.5, 0.0), (3.5, 1.45), (3.2, 1.75), (1.8, 1.85), (0.0, 1.9)], 48, "black"), M)
    mc = Vector((0.0, 35.0))
    bc = Vector((x, y))
    d = (mc - bc).normalized()
    contact = mc - d * 30.35
    for apex, qa in (((-27.1, 19.9), 118.0), ((-19.0, 10.0), -12.0)):
        q = (x + 5.5 * math.cos(math.radians(qa)), y + 5.5 * math.sin(math.radians(qa)))
        tri = [tuple(q), tuple(apex), (contact.x, contact.y), (x + 5.0 * d.x, y + 5.0 * d.y)]
        if poly_area(tri) < 0:
            tri = list(reversed(tri))
        # r6: the guard fins in the collar's satin, edges bevelled 0.35 mm (bright edge highlights)
        g.merge(slab(tri, -0.2, 1.3, "satin_mid", r=0.35, segs=2), T(0, 0, Z_F))
    # focus mode selector M / C / S (r2): flat black base with the letters on its upper-left arc, a raised satin
    # lever ring (dia 9.3) carrying the white index at 12 o'clock and the ridged tab at 6, recessed dark centre
    x, y, z = P(cm("focus_mode_selector"))
    M = T(x, y, Z_F)
    zb = 0.55
    g.merge(revolve([(6.55, -0.2), (6.55, zb - 0.15), (6.4, zb), (4.6, zb)], 56, "black"), M)
    # r4: a solid domed dark knob (dia 9.3) with a lighter satin rim; ridged tab at Y 8.0..10.5 (front closeup)
    # r6 (closeups/front_MCS_selector): the lever ring a graded satin-metal band (bright upper left), the index a bold
    # white bar, the legends bigger and bolder, the tab a chunky flared block with three rounded vertical ridges
    g.merge(revolve([(4.65, zb - 0.1), (4.65, 1.4), (4.45, 1.75), (4.0, 1.9), (3.55, 1.92)], 56, "satin_dark"), M)
    g.merge(revolve([(3.55, 1.92), (3.3, 1.85), (2.4, 2.1), (0.0, 2.2)], 56, "black"), M)
    g.merge(rbox(0.62, 1.75, 0.06, r=0.02, segs=1, mat="paint"), M @ T(0.0, 2.7, 2.12) @ R("X", -8))
    tab = [(-1.6, -3.3), (-2.45, -5.1), (-2.0, -5.75), (2.0, -5.75), (2.45, -5.1), (1.6, -3.3)]
    g.merge(slab(tab, zb - 0.1, 2.25, "black", r=0.35, segs=2), M)
    for k in range(3):
        g.merge(rbox(0.5, 2.1, 0.4, r=0.2, segs=2, mat="satin_dark"), M @ T(-0.75 + 0.75 * k, -4.6, 2.3))
    for s_, (lx, ly) in zip("MCS", ((34.5, 17.35), (36.85, 18.85), (39.0, 19.35))):
        ang = math.degrees(math.atan2(ly - y, lx - x)) - 90
        label_flat(g, s_, 1.85, "paint", T(lx, ly, Z_F + zb + LIFT) @ R("Z", ang), fontpath=FONT_UI)
    # flash sync terminal cap (knurled)
    # r6 (review: a plain black disc; the reference cap has a serrated rim visible from the front, ~36-40 teeth): a
    # toothed rim ring (teeth r 3.55..4.25, chamfered tops that catch the light) round a flat dark face
    x, y, z = P(cm("sync_terminal"))
    M = T(x, y, Z_F)
    g.merge(gear_chamfered(3.55, 4.25, 36, -0.1, 1.85, 0.16, "satin_dark", tip_frac=0.5, root_frac=0.22,
                           bottom=False), M)
    g.merge(disc(3.45, 1.85 + LIFT, 48, "black"), M)
    # microphones (refs run 2): two holes on the hump's sloping side flanks at X +-20.7, Z 8.3 (top-view footprint
    # 0.9 x 1.45 mm): where the half width is 20.7 the flank falls 3.2 mm in 5.2 mm, so the hole is an ellipse
    for sx in (-1, 1):
        yy = 77.6 + (23.3 - 20.7) / (23.3 - 20.1) * 5.2
        F_, R_, wl, wr = hump_dims(yy)                 # the +X flank is 0.4 mm wider: sit the hole on the surface
        xs = wl if sx > 0 else -wr
        n = Vector((sx * 3.2, 5.2, 0)).normalized()
        ell = [(0.45 * math.cos(TAU * k / 16), 0.72 * math.sin(TAU * k / 16)) for k in range(16)]
        g.merge(fill_polys([[ell, []]], 0.0, 0.0, "rubber", name="mic"),
                plane_M((xs + n.x * 0.03, yy + n.y * 0.03, 8.3), (-n.y, n.x, 0), (0, 0, 1)))
    return g


def build_logos(g):
    for name in ("FUJIFILM", "X-T5"):
        L = LOGOS[name]
        zp = hump_dims(75.0)[0] if name == "FUJIFILM" else L["plane_z"]      # r4: the face moved to Z 15.25
        g.merge(fill_polys(L["polys"], 0.0, 0.0, "lettering", name=name), T(0, 0, zp + LIFT))
    return g


def hull2(points):
    pts = sorted(set((round(a, 5), round(b, 5)) for a, b in points))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


# r4 (front + side silver2k): D-plate lugs 7.2 mm tall at the body (Y 64.3..71.5), tips at X -81.85 / 57.9, eyelets
# (strap markers) at the hole centres; 4 mm thick pills in the side views, centred at Z 0.6 (grip) / 1.2 (port)
STRAP = {"strap_right": (-79.05, 67.9, 0.6), "strap_left": (55.23, 67.9, 1.2)}   # r7: the hole centres (front silver2k)
LUG_TIP = {"strap_right": -81.85, "strap_left": 57.9}


def pill_slab(poly, z0, z1, r, segs, mat):
    """Extrude a CCW polygon (local XY) along Z with both faces' edges rounded by r (a pill in section)."""
    lv = []
    for k in range(segs + 1):
        a = (math.pi / 2) * k / segs
        lv.append((z0 + r * (1 - math.sin(a)), offset_ring(poly, -r * (1 - math.cos(a)))))
    for k in range(segs + 1):
        a = (math.pi / 2) * k / segs
        lv.append((z1 - r * (1 - math.cos(a)), offset_ring(poly, -r * (1 - math.sin(a)))))
    return loft(lv, mat, axis="Z")


LUG_HOLE_R = 1.35          # r7 (round-3 review): a clean through-hole along Z (front silver2k: 2.7 mm clear bore)
LUG_HOLE_CH = 0.45         # chamfer round the hole on both faces (the 3.6 mm dark ring of the front view)


def _orient(gg, outward_fn):
    """Flip every face of gg whose normal points against outward_fn(face centre)."""
    for i, f in enumerate(gg.f):
        P_ = [Vector(gg.v[k]) for k in f]
        nrm = Vector((0, 0, 0))
        for a_, b_ in zip(P_, P_[1:] + P_[:1]):
            nrm += a_.cross(b_)
        c_ = sum(P_, Vector()) / len(P_)
        if nrm.dot(outward_fn(c_)) < 0:
            gg.f[i] = tuple(reversed(f))
    return gg


def build_lugs(g):
    """r7 (round-3 review: the r6 boolean failed, so the hole read plugged from the front and slotted from the top):
    each lug is built directly as a solid D-plate (X from the body to the tip, Y 64.3..71.5, 4 mm along Z with
    rounded faces) with a clean chamfered 3.2 mm hole along Z: outer pill wall, chamfered hole wall and the two flat
    annular faces, welded by finish(); no boolean, no chrome liner. Seen from the top or the bottom it is a solid
    tongue; from the front and back the background shows through the hole. The strap markers stay at the hole
    centres (STRAP)."""
    for side, key in ((-1, "strap_right"), (1, "strap_left")):
        xc, yc, z = STRAP[key]
        base = X_R + 1.6 if side < 0 else X_L - 1.6       # buried 1.6 mm in the body (its rounding hidden)
        tip = LUG_TIP[key]
        pts = [(base, 64.3), (tip, 64.3), (tip, 71.5), (base, 71.5)]
        poly = fillet_poly(pts, [0.0, 3.3, 3.3, 0.0], [0, 8, 8, 0])
        if poly_area(poly) < 0:
            poly = list(reversed(poly))
        z0, z1, r, segs = z - 2.0, z + 2.0, 0.6, 3
        lv = []
        for k in range(segs + 1):
            a = (math.pi / 2) * k / segs
            lv.append((z0 + r * (1 - math.sin(a)), offset_ring(poly, -r * (1 - math.cos(a)))))
        for k in range(segs + 1):
            a = (math.pi / 2) * k / segs
            lv.append((z1 - r * (1 - math.cos(a)), offset_ring(poly, -r * (1 - math.sin(a)))))
        wall = loft(lv, "silver", cap_bottom=False, cap_top=False, axis="Z")
        cx_ = sum(p[0] for p in poly) / len(poly)
        cy_ = sum(p[1] for p in poly) / len(poly)
        _orient(wall, lambda c_: Vector((c_.x - cx_, c_.y - cy_, 0.0)))
        g.merge(wall)
        rh, ch = LUG_HOLE_R, LUG_HOLE_CH
        hole = revolve([(rh + ch, z0 + r * 0.0), (rh, z0 + ch), (rh, z1 - ch), (rh + ch, z1)], 40, "silver")
        hole = hole.transformed(T(xc, yc, 0))
        _orient(hole, lambda c_: Vector((xc - c_.x, yc - c_.y, 0.0)))
        g.merge(hole)
        circ = [(xc + (rh + ch) * math.cos(TAU * k / 40), yc + (rh + ch) * math.sin(TAU * k / 40)) for k in range(40)]
        outer0 = lv[0][1]
        outer1 = lv[-1][1]
        g.merge(fill_polys([[outer1, [list(reversed(circ))]]], 0.0, 0.0, "silver", name="lugf"), T(0, 0, z1))
        mir = plane_M((0, 0, z0), (-1, 0, 0), (0, 1, 0))          # the back face, normal -Z (coords a = -x)
        g.merge(fill_polys([[[(-x, y) for (x, y) in reversed(outer0)], [[(-x, y) for (x, y) in circ]]]], 0.0, 0.0,
                           "silver", name="lugb"), mir)
    return g


def build_side_panels(g):
    """r3 (refs run 2, closeups right_card_door / left_ports_closed on the 2000 px silver renders): the card door and
    the two connector covers sit proud of the body leatherette in dark grooves, with a coarser, glossier grain."""
    # grip side (-X): memory card door Z -22.5..2.3, Y 3.7..63.2 with a 2.3 mm chamfer at its top-rear corner; latch
    # recess Z -13.5..-8.8, Y 28.4..37.8 (raised tab at its rear half, arrow toward the front). Plane coords (a=z, b=y);
    # the body leatherette lies 0.1 inside X_R.
    def gripside(poly, z0, z1, mat, r=0.0, segs=1):
        return slab_on(poly, (X_R, 0, 0), (0, 0, 1), (0, 1, 0), z0, z1, mat, r=r, segs=segs)
    z0, z1, y0, y1 = -22.5, 2.3, 3.75, 63.2
    door_c = [(z0, y0), (z1, y0), (z1, y1), (z0 + 2.3, y1), (z0, y1 - 2.3)]
    g.merge(gripside(fillet_poly(door_c, [1.2, 1.2, 1.0, 0.6, 0.6], [3, 3, 3, 2, 2], offset=0.55), -0.12, 0.02, "rubber"))
    g.merge(gripside(fillet_poly(door_c, [1.2, 1.2, 1.0, 0.6, 0.6], [3, 3, 3, 2, 2]), -0.12, 0.08, "leather_coarse",
                     r=0.25, segs=2))
    lz0, lz1, ly0, ly1 = -13.46, -8.8, 28.4, 37.8
    g.merge(gripside(fillet_poly([(lz0, ly0), (lz1, ly0), (lz1, ly1), (lz0, ly1)], [0.9, 2.0, 2.0, 0.9], [2, 4, 4, 2]),
                     0.08, 0.1, "rubber"))
    tab = fillet_poly([(lz0 + 0.45, ly0 + 0.5), (lz0 + 2.2, ly0 + 0.5), (lz0 + 2.2, ly1 - 0.5), (lz0 + 0.45, ly1 - 0.5)],
                      [0.5, 0.9, 0.9, 0.5], [2, 3, 3, 2])
    g.merge(gripside(tab, 0.0, 0.24, "black", r=0.1, segs=1))
    arrow = [(-10.0, 32.55), (-9.35, 33.1), (-10.0, 33.65)]
    g.merge(fill_polys([[arrow, []]], 0.0, 0.0, "black", name="arrow"),
            plane_M((X_R - 0.11, 0, 0), (0, 0, 1), (0, 1, 0)))

    # port side (+X): connector covers. Upper frame Z 6.3..-18.1, Y 38.9..63.8 (to the port-side seam 64.3); lower
    # frame Z -1.4..-18.1, Y 4.3..38.6; inserts 0.9 mm in. Plane coords (a=-z, b=y), normal +X.
    def portside(poly, z0, z1, mat, r=0.0, segs=1):
        return slab_on(poly, (X_L, 0, 0), (0, 0, -1), (0, 1, 0), z0, z1, mat, r=r, segs=segs)
    # r5 (review + closeups/left_ports_closed): ONE black frame round both covers: the upper cover's front edge
    # (Z 6.3) runs down to Y 38.75, then turns rearward along a large concave curve (r ~3) into the lower cover's
    # front edge (Z -1.4), instead of two rectangles meeting in a square L
    union = [(-6.3, 38.75), (1.4, 38.75), (1.4, 4.3), (18.1, 4.3), (18.1, 63.8), (-6.3, 63.8)]
    urad, useg = [1.4, 3.0, 1.4, 1.4, 1.4, 1.4], [3, 5, 3, 3, 3, 3]
    g.merge(portside(fillet_poly(union, urad, useg, offset=0.35), -0.12, 0.02, "rubber"))
    g.merge(portside(fillet_poly(union, urad, useg), -0.12, 0.1, "black", r=0.08))
    for (za, zb, ya, yb) in ((6.3, -18.1, 38.9, 63.8), (-1.4, -18.1, 4.3, 38.6)):
        ins = fillet_poly([(-za + 0.9, ya + 0.9), (-zb - 0.9, ya + 0.9), (-zb - 0.9, yb - 0.9), (-za + 0.9, yb - 0.9)],
                          [0.9] * 4, [3] * 4)
        g.merge(portside(ins, -0.12, 0.16, "leather_coarse", r=0.06))
    # 'HDMI' blind-debossed in the lower cover's insert: Z -14.0..-4.85, Y 34.2..35.6 (reads front to rear)
    t = text_geo("HDMI", 1.4 / CAPF(FONT_UI), "black", FONT_UI)
    if t.v:                                    # m2 LOD1: text off
        us = [p[0] for p in t.v]
        sx = 9.15 / (max(us) - min(us))
        t.v = [(u * sx, v, w) for (u, v, w) in t.v]
        g.merge(t, plane_M((X_L + 0.165, 34.9, -9.42), (0, 0, -1), (0, 1, 0)))
    for zz in (1.75, 4.65):                    # speaker slots (Z 1.1..2.4 and 4.1..5.2, Y 20.3..24.0)
        sl = fillet_poly([(-zz - 0.58, 20.3), (-zz + 0.58, 20.3), (-zz + 0.58, 24.0), (-zz - 0.58, 24.0)], [0.55] * 4,
                         [3] * 4)
        g.merge(portside(sl, -0.12, 0.02, "rubber"))
    return g


def build_bottom(g):
    """r3 (bottom closeup on the 2000 px silver render): battery door X -71.2..-22.7 with a step in its top edge and
    a swept lower-right corner, outlined by a double groove; its hinge channel at the +X end (the door swings down
    from there); a smooth label patch in the lower-left corner; latch recess X -56.3..-48.9 with a slider bar and an
    arrow; three Phillips screws, four plain plugs, tripod socket, two accessory holes."""
    # plane coords on the base: (a = x, b = z); the normal (d x u) points down (-Y)
    def base(poly, z0, z1, mat, r=0.0, segs=1):
        return slab_on(poly, (0, 0, 0), (1, 0, 0), (0, 0, 1), z0, z1, mat, r=r, segs=segs)
    Mb = plane_M((0, 0, 0), (1, 0, 0), (0, 0, 1))

    def outline(poly, rad, o0, o1, mat, lift=LIFT, name="bline"):
        a = fillet_poly(poly, rad, [3] * len(poly), offset=o0)
        b_ = fillet_poly(poly, rad, [3] * len(poly), offset=o1)
        g.merge(fill_polys([[a, [list(reversed(b_))]]], 0.0, 0.0, mat, name=name), Mb @ T(0, 0, lift))
    door = [(-71.2, -14.9), (-35.3, -14.9), (-29.9, -11.2), (-22.7, -11.2), (-22.7, 9.6), (-28.8, 9.6), (-30.1, 10.9),
            (-71.2, 10.9)]
    rad = [3.0, 2.5, 2.5, 0.8, 0.8, 0.8, 0.8, 1.2]
    outline(door, rad, 0.22, -0.08, "black")                        # door edge groove
    outline(door, rad, -0.95, -1.12, "black")                       # inner step of the door panel
    g.merge(base(fillet_poly([(-25.2, -10.4), (-23.3, -10.4), (-23.3, 8.8), (-25.2, 8.8)], [0.5] * 4, [2] * 4),
                 0.0, 0.03, "black"))                               # hinge channel at the door's +X end
    label = [(-70.3, -13.2), (-68.9, -14.4), (-63.7, -14.4), (-63.7, -7.3), (-70.3, -7.3)]
    g.merge(fill_polys([[fillet_poly(label, [0.6, 0.6, 0.3, 0.3, 0.3], [2] * 5), []]], 0.0, 0.0, "dial", name="label"),
            Mb @ T(0, 0, LIFT * 0.6))
    # latch: shaded recess, raised slider bar with a dark outline, arrow toward +X
    lx0, lx1, lz0, lz1 = -56.3, -48.9, -7.2, 2.75
    outline([(lx0, lz0), (lx1, lz0), (lx1, lz1), (lx0, lz1)], [1.2] * 4, 0.12, -0.12, "black")
    g.merge(base(fillet_poly([(lx0 + 0.12, lz0 + 0.12), (lx1 - 0.12, lz0 + 0.12), (lx1 - 0.12, lz1 - 0.12),
                              (lx0 + 0.12, lz1 - 0.12)], [1.1] * 4, [3] * 4), -0.25, 0.018, "silver"))
    bar = fillet_poly([(-53.7, -6.9), (-51.5, -6.9), (-51.5, 2.4), (-53.7, 2.4)], [1.0] * 4, [3] * 4)
    outline([(-53.7, -6.9), (-51.5, -6.9), (-51.5, 2.4), (-53.7, 2.4)], [1.0] * 4, 0.18, 0.0, "black", lift=0.03)
    g.merge(base(bar, -0.2, 0.16, "silver", r=0.1, segs=1))
    g.merge(fill_polys([[[(-50.9, -2.9), (-49.6, -2.2), (-50.9, -1.5)], []]], 0.0, 0.0, "black", name="arrow"),
            Mb @ T(0, 0, LIFT))
    # tripod socket (X 0.0, Z -7.2): bright ring dia 7.6 round a flat grey socket floor
    x, z = 0.0, -7.2
    Ms = T(x, 0.0, z) @ AX_NY
    g.merge(revolve([(3.8, -0.2), (3.8, 0.05), (3.6, 0.14), (3.0, 0.14)], 48, "chrome"), Ms)
    g.merge(revolve([(3.0, 0.14), (2.9, 0.0), (2.9, -1.2), (0.0, -1.2)], 48, "bayonet"), Ms)
    # r5 (bottom silver2k: every insert sits in a fine dark seam that makes it read on the flat plate)
    g.merge(revolve([(4.08, 0.0), (3.8, 0.0)], 48, "black"), Ms @ T(0, 0, LIFT))
    g.merge(revolve([(2.9, -0.35), (2.55, -0.35)], 48, "black"), Ms)
    for (sx, sz) in ((-15.0, 6.5), (-15.0, -11.4), (5.0, -11.4)):     # Phillips screws, dia 3.3
        Mh = T(sx, 0, sz) @ AX_NY
        g.merge(revolve([(1.6, -0.1), (1.6, 0.12), (1.4, 0.38), (0.9, 0.52), (0.0, 0.56)], 24, "chrome"), Mh)
        g.merge(revolve([(1.92, 0.0), (1.6, 0.0)], 24, "black"), Mh @ T(0, 0, LIFT))   # r5: counterbore seam
        for d in (0, 90):                      # r4: raised domed head (dia 3.2) with a narrow cross slot
            g.merge(rbox(1.5, 0.26, 0.05, mat="lettering"), Mh @ T(0, 0, 0.53) @ R("Z", d))
    for (sx, sz) in ((48.2, 8.7), (48.2, -16.3), (-71.4, -16.3), (-58.5, 23.8)):   # plain plugs, dia 1.8
        Mh = T(sx, 0, sz) @ AX_NY
        g.merge(revolve([(0.95, -0.05), (0.95, 0.06), (0.75, 0.12), (0.0, 0.14)], 20, "chrome"), Mh)
        g.merge(revolve([(1.17, 0.0), (0.95, 0.0)], 20, "black"), Mh @ T(0, 0, LIFT))   # r5: seam ring
    Mh = T(-58.7, 0, 19.9) @ AX_NY                                   # accessory hole with a raised ring
    g.merge(revolve([(1.85, -0.05), (1.85, 0.12), (1.6, 0.2), (1.3, 0.2), (1.3, -1.5), (0, -1.5)], 32, "chrome"), Mh)
    hexa = [(45.6 + 2.1 * math.cos(math.radians(30 + 60 * k)), -11.4 + 2.1 * math.sin(math.radians(30 + 60 * k)))
            for k in range(6)]
    outline(hexa, [0.4] * 6, 0.15, -0.1, "black")                    # anti-twist pin hole in a hex recess
    Mh = T(45.6, 0, -11.4) @ AX_NY
    g.merge(revolve([(1.85, 0.02), (1.3, 0.02), (1.3, -1.5), (0, -1.5)], 24, "rubber"), Mh)
    return g


PAD_T = 1.9          # r3: thumb-rest pad 1.9 mm proud (rear Z -25.4; silver side/bottom views -25.3..-26.2)
HOOK_K = 1.22        # r3: thumb hook crest Z -29.0 (silver grip-side view -30.7, top -28.3, bottom -29.4)


def rear_slab(poly_xy, z0, z1, mat, r=0.0, segs=1, zface=Z_REAR_PANEL):
    """Slab on a rear face: polygon in (x, y), extruded toward -Z from the face."""
    return slab_on([(-x, y) for x, y in poly_xy], (0, 0, zface), (-1, 0, 0), (0, 1, 0), z0, z1, mat, r=r, segs=segs)


def bt_glyph():
    """Bluetooth rune as strokes (local XY, ~2.4 mm tall)."""
    s = [((-0.6, 0.55), (0.6, -0.55)), ((0.6, -0.55), (0.0, -1.1)), ((0.0, -1.1), (0.0, 1.1)),
         ((0.0, 1.1), (0.6, 0.55)), ((0.6, 0.55), (-0.6, -0.55))]
    return s


def build_rear(g):
    # thumb rest pad (leatherette), inner edge cut round the selector
    sel = cm("selector")["pos"]
    cx, cy = sel["x"], sel["y"]
    yb = Y_PLATE + 0.15                        # r2: the silver base band stays visible under the pad
    pts = [(-76.4, yb), (-53.6, yb), (-53.6, 12.4)]
    for k in range(13):
        th = math.radians(-70 + 140 * k / 12)
        pts.append((cx - 11.7 * math.cos(th), cy + 11.7 * math.sin(th)))
    pts += [(-50.5, 37.0), (-50.5, 62.55), (-76.4, 62.55)]
    rad = [1.5] + [0.0] * (len(pts) - 2) + [1.5]
    seg = [3] + [0] * (len(pts) - 2) + [3]
    g.merge(rear_slab(fillet_poly(pts, rad, seg), -1.0, PAD_T, "leather_pad", r=1.0, segs=3))   # r3: z0 -1.0 fills the corner

    # thumb hook (r2): a sculpted vertical ridge on the pad, crest at X -71.8 standing 3.2 mm proud (top view: rear
    # outline Z -28.3 at X -70..-73), hollowed inner flank facing the buttons (crease at X -69.5..-70, back view),
    # rounded outer flank into the grip corner; it fades in from Y 41 and rolls over into the top at Y 62.
    prof = [(-63.8, 0.0), (-65.3, 0.12), (-66.5, 0.42), (-67.5, 1.0), (-68.4, 1.8), (-69.2, 2.55), (-70.0, 3.05),
            (-70.8, 3.2), (-71.8, 3.15), (-72.8, 2.85), (-73.8, 2.3), (-74.7, 1.55), (-75.4, 0.8), (-75.9, 0.25),
            (-76.3, 0.0)]                      # r3: crest at X -70.8 (silver top view), was -71.9
    base = Z_REAR_PANEL - PAD_T + 0.35
    prof = [(xx, dz * HOOK_K) for (xx, dz) in prof]

    def hook_h(y):
        if y < 41.0:
            return 0.0
        if y < 47.5:
            t = (y - 41.0) / 6.5
            return t * t * (3 - 2 * t)
        if y <= 58.0:
            return 1.0
        t = min(1.0, (y - 58.0) / 3.4)
        return math.sqrt(max(0.0, 1.0 - t * t))
    levels = []
    for y in (40.6, 42.0, 43.5, 45.0, 46.4, 47.5, 50.5, 54.0, 56.8, 58.0, 59.1, 60.0, 60.7, 61.15, 61.4):
        h = hook_h(y)
        ring = [(xx, base - dz * h) for (xx, dz) in prof] + [(-76.3, Z_REAR_PANEL - PAD_T + 1.2),
                                                             (-63.8, Z_REAR_PANEL - PAD_T + 1.2)]
        levels.append((y, ring))
    g.merge(loft(levels, "leather_pad"))
    # indicator lamp: half-moon lens on the hook's outer flank, flat side toward the buttons
    x, y, z = P(cm("indicator_lamp"))
    dzl = 2.32 * HOOK_K
    zl = base - dzl
    nrm = Vector((-0.37, 0.0, -0.93)).normalized()
    Ml = plane_M((x, y, zl), (-0.93, 0.0, 0.37), (0, 1, 0))
    dee = [(-0.35, -0.78), (-0.35, 0.78)] + [(-0.35 + 0.78 * math.cos(math.radians(a)), 0.78 * math.sin(math.radians(a)))
                                            for a in range(70, -71, -20)]
    g.merge(slab(dee, -0.4, 0.12, "rubber"), Ml @ T(0, 0, 0) @ Matrix.Scale(1.18, 4))
    g.merge(slab(dee, -0.4, 0.16, "lamp"), Ml)
    # AEL and DISP/BACK
    x, y, z = P(cm("ael_button"))
    ring_button(g, x, y, Z_REAR_PANEL, AX_NZ, 7.0, 5.6, proud=1.3, ring_h=0.6, dome=0.15, ring_mat="black")
    label_flat(g, "AEL", 1.5, "paint", plane_M((x, y, Z_REAR_PANEL - 1.47), (-1, 0, 0), (0, 1, 0)), fontpath=FONT_UI)
    x, y, z = P(cm("disp_back_button"))
    ring_button(g, x, y, Z_REAR_PANEL, AX_NZ, 5.6, 4.6, proud=1.3, ring_h=0.6, dome=0.15, ring_mat="black")
    Mbt = plane_M((x, y, Z_REAR_PANEL - 1.46), (-1, 0, 0), (0, 1, 0))
    oval = [(1.0 * math.cos(t * TAU / 32), 1.45 * math.sin(t * TAU / 32)) for t in range(32)]
    g.merge(fill_polys([[oval, []]], 0.0, 0.0, "paint", name="bt"), Mbt)
    g.merge(segs_geo(bt_glyph(), 0.2, "black"), Mbt @ T(0, 0, 0.005))
    for k, s_ in enumerate(("DISP", "BACK")):
        label_flat(g, s_, 1.62, "paint", plane_M((-46.6, 10.0 - 2.4 * k, Z_REAR_PANEL - LIFT), (-1, 0, 0), (0, 1, 0)),
                   fontpath=FONT_UI_R, align_x="LEFT")
    # focus lever: surround ring + knob with a ribbed top
    x, y, z = P(cm("focus_lever"))
    M = T(x, y, Z_REAR_PANEL) @ AX_NZ
    g.merge(revolve([(4.7, -0.2), (4.7, 0.5), (4.45, 0.75), (3.0, 0.75), (2.9, 0.5)], 48, "black"), M)
    g.merge(revolve([(4.72, 0.5), (4.6, 0.7)], 48, "chrome"), M)
    g.merge(revolve([(2.7, 0.3), (2.7, 2.2), (2.5, 2.7), (1.6, 3.05), (0.0, 3.1)], 40, "black"), M)
    for k in range(12):
        g.merge(rbox(0.25, 0.9, 0.12, mat="black"), M @ R("Z", 30 * k) @ T(0, 1.75, 2.9))
    # selector: base ring, four arc keys, MENU/OK
    x, y, z = P(cm("selector"))
    M = T(x, y, Z_REAR_PANEL) @ AX_NZ
    g.merge(revolve([(9.6, -0.2), (9.6, 0.35), (9.35, 0.55), (4.7, 0.55)], 64, "black"), M)
    g.merge(revolve([(9.62, 0.35), (9.45, 0.52)], 64, "chrome"), M)
    for k in range(4):
        g.merge(revolve([(8.6, 0.55), (8.6, 1.0), (8.2, 1.25), (5.2, 1.05), (4.8, 0.7)], 12, "black",
                        arc=math.radians(80), a0=math.radians(5 + 90 * k + 45)), M)
    g.merge(revolve([(3.3, 0.3), (3.3, 1.3), (2.9, 1.6), (0.0, 1.75)], 48, "black"), M)
    for k, s_ in enumerate(("MENU", "OK")):
        label_flat(g, s_, 1.6, "paint", plane_M((x, y + 0.95 - 1.9 * k, Z_REAR_PANEL - 1.77), (-1, 0, 0), (0, 1, 0)), fontpath=FONT_UI)
    return g


def build_top_buttons(g):
    """Buttons on the inclined rear face of the top plate; Fn1 and ON/OFF on top; rear-dial window."""
    Fr = frame((0, 0, 0), TOP_NRM, (0, 1, 0))
    for cid, od, bd, lab in (("delete_button", 6.8, 5.0, "trash"), ("playback_button", 6.8, 5.0, "play"),
                             ("af_on_button", 7.4, 5.5, "AFON"), ("q_button", 6.8, 5.0, "Q")):
        x, y, z = P(cm(cid))
        zf = top_rear(y)
        # r5 (back silver2k + DPR rear photo): satin silver domes with black glyphs in a black ring, a thin bright
        # metal edge round the ring (was black buttons with white glyphs)
        Mb = ring_button(g, x, y, zf, Fr, od, bd, proud=1.0, ring_h=0.55, dome=0.12, ring_mat="black", btn_mat="dial")
        g.merge(revolve([(od / 2 + 0.12, -0.3), (od / 2 + 0.12, 0.2), (od / 2 - 0.05, 0.42)], 40, "chrome"), Mb)
        o = Vector((x, y, zf)) + TOP_NRM * 1.13
        Ml = plane_M(o, (-1, 0, 0), TOP_UP)
        if lab == "AFON":
            label_flat(g, "AF", 1.5, "lettering", Ml @ T(0, 0.85, 0), fontpath=FONT_UI)
            label_flat(g, "ON", 1.5, "lettering", Ml @ T(0, -0.85, 0), fontpath=FONT_UI)
        elif lab == "Q":
            label_flat(g, "Q", 2.2, "lettering", Ml, fontpath=FONT_UI)
        elif lab == "play":
            tri = [(-0.7, -0.75), (0.85, 0.0), (-0.7, 0.75)]
            box_out = fillet_poly([(-1.8, -1.2), (1.8, -1.2), (1.8, 1.2), (-1.8, 1.2)], [0.2] * 4, [1] * 4)
            box_in = fillet_poly([(-1.45, -0.85), (1.45, -0.85), (1.45, 0.85), (-1.45, 0.85)], [0.1] * 4, [1] * 4)
            g.merge(fill_polys([[box_out, [box_in]], [tri, []]], 0, 0, "lettering", name="play"), Ml)
        elif lab == "trash":
            body = [(-1.2, -1.3), (1.2, -1.3), (1.4, 0.9), (-1.4, 0.9)]
            slats = [[(-0.95, -1.05), (-0.6, -1.05), (-0.6, 0.65), (-0.95, 0.65)],
                     [(-0.18, -1.05), (0.18, -1.05), (0.18, 0.65), (-0.18, 0.65)],
                     [(0.6, -1.05), (0.95, -1.05), (0.95, 0.65), (0.6, 0.65)]]
            parts = [[body, slats], [[(-1.6, 1.05), (1.6, 1.05), (1.6, 1.35), (-1.6, 1.35)], []],
                     [[(-0.5, 1.35), (0.5, 1.35), (0.5, 1.6), (-0.5, 1.6)], []]]
            g.merge(fill_polys(parts, 0, 0, "lettering", name="trash"), Ml)
    x, y, z = P(cm("fn1_button"))
    ring_button(g, x, Y_TOP, z, AX_Y, 6.5, 4.4, proud=0.9, ring_h=0.5, ring_mat="chrome", btn_mat="dial", dome=0.15)
    for s_, (lx, lz) in (("ON", (-48.6, 2.9)), ("OFF", (-53.6, 2.5))):
        label_flat(g, s_, 1.6, "lettering", plane_M((lx, Y_TOP + LIFT, lz), (-1, 0, 0), (0, 0, 1)), fontpath=FONT_UI)
    for lx in (-48.6, -52.9):
        g.merge(disc(0.3, 0.0, 12, "lettering"), T(lx, Y_TOP + LIFT, 4.6) @ AX_Y)
    return g


SHOE_POCKET = (-10.4, 11.0, -22.7, -4.1)         # r4: ISO shoe frame X -10.4..11.0, Z -4.1..-22.9 (top silver2k)
                                                  # r6: the bed runs back to Z -25.2 (top silver2k), pocket to -25.3
# r6 (review: a flat plate with 1 mm strips; the reference has box-section rails ~3 mm tall over a recessed bed):
# back silver2k crop: C openings X 6.65..9.35, Y 88.75..90.95, rail tops ~91.3 (side views), outer walls ~1.15 thick
# at X +-10.5, the bed and its rear edge at Y 87.3..88.4, the front stop's rear face (grey) between the rails
SHOE_Y0 = 87.7                                    # pocket floor = underside of the base plate
SHOE_BED = 88.5                                   # top of the base plate / contact bed
SHOE_TOP = 91.1          # rail tops (flanges 0.6 thick, the channel 2.0 tall under them): the side and front silver2k
                         # silhouettes stay flat at 91.0-91.05 over the shoe (the back view's +0.5 is its perspective)
SHOE_LIP_TOP = 90.75     # the front stop's top, below the rails (back silver2k: 0.4 below the hump edge)
SHOE_GAP = 0.45          # dark groove between the rails' outer walls and the hump top (3/4 silver render)
SHOE_ZR = -22.5                                   # rear end of the rails (top silver2k: to the hump's rear edge)


def shoe_pocket_cutter():
    x0, x1, z0, z1 = SHOE_POCKET
    x0, x1, z1 = x0 - SHOE_GAP, x1 + SHOE_GAP, z1 + SHOE_GAP
    return rbox(x1 - x0, 4.0, z1 - z0, r=0.2, segs=1, mat="slot", center=((x0 + x1) / 2, SHOE_Y0 + 2.0, (z0 + z1) / 2))


SHOE_TAIL = (-3.9, 4.3, -24.9)      # r7: the insulator's tail notch in the hump's rear chamfer (X0, X1, rear Z)


def shoe_notch_cutter():
    """r7 (round-3 review: from behind only the centred black insulator shows between silver hump shoulders): a notch
    in the rear chamfer, as wide as the insulator, for its tail (the rails and bed stop before the chamfer)."""
    x0, x1, zr = SHOE_TAIL
    z0 = SHOE_POCKET[2] + 0.3
    return rbox(x1 - x0, 4.0, z0 - (zr - 1.0), r=0.15, segs=1, mat="black",
                center=((x0 + x1) / 2, SHOE_Y0 - 0.6 + 2.0, (z0 + zr - 1.0) / 2))


def shoe_plan(poly_xz):
    """(x, z) -> slab_on plane coords (a = x, b = -z) for horizontal slabs (normal +Y)."""
    return [(x, -z) for (x, z) in poly_xz]


def build_shoe_cover():
    """The black plastic hot-shoe cover the camera ships with (refs run 2): a tongue that slides under the rails and a
    cap over them, finger ridge at the rear, three fine ribs. Separate node 'hot_shoe_cover' (hidden in the renders
    compared with the official images, which show the bare shoe)."""
    x0, x1, z0, z1 = SHOE_POCKET
    g = Geo("hot_shoe_cover")
    tongue = fillet_poly(shoe_plan([(x0 + 1.3, z1 - 0.9), (x1 - 1.3, z1 - 0.9), (x1 - 1.3, SHOE_ZR),
                                    (x0 + 1.3, SHOE_ZR)]), [0.3] * 4, [1] * 4)
    g.merge(slab_on(tongue, (0, SHOE_BED + 0.05, 0), (1, 0, 0), (0, 0, -1), 0.0, 1.85, "shoe_cover"))
    cap = fillet_poly(shoe_plan([(x0 - 0.1, z1 + 0.1), (x1 + 0.1, z1 + 0.1), (x1 + 0.1, SHOE_ZR - 0.6),
                                 (x0 - 0.1, SHOE_ZR - 0.6)]), [0.6] * 4, [2] * 4)
    g.merge(slab_on(cap, (0, SHOE_TOP, 0), (1, 0, 0), (0, 0, -1), 0.0, 0.7, "shoe_cover", r=0.3, segs=2))
    g.merge(rbox(x1 - x0 - 1.0, 0.6, 1.2, r=0.2, segs=1, mat="shoe_cover"), T((x0 + x1) / 2, SHOE_TOP + 0.9, -21.8))
    for k in range(3):
        g.merge(rbox(x1 - x0 - 6.0, 0.12, 0.35, r=0.05, segs=1, mat="shoe_cover"),
                T((x0 + x1) / 2, SHOE_TOP + 0.72, -18.8 + 1.0 * k))
    return g, ((x0 + x1) / 2, SHOE_Y0, (z0 + z1) / 2)


def build_hot_shoe(g):
    """r4 (review: the shoe sat flush in a pocket): an ISO shoe frame X -10.4..11.0, Z -4.1..-22.9 standing 0.8 mm
    proud of the hump top: polished base plate in the pocket, side walls folded over into bead-blasted rails
    (X 11.0..6.6 / -10.4..-6.5, top Y 91.8), front stop lips; glossy black insulator X -3.7..4.1, Z -8.9..-23.0 with a
    curved chamfer on its -X front corner; chrome centre contact dia 3.6 at (0.2, -13.8); 2 x 2 chrome pins at
    X 2.4 / -2.1, Z -17.45 / -20.9; gold pin at the upper left (2.4, -10.8); lock-pin hole dia 2.0 at (0.1, -7.6)
    with a keyhole outline opening down to the insulator (top silver2k closeup)."""
    x0, x1, zf, _ = SHOE_POCKET[0], SHOE_POCKET[1], SHOE_POCKET[3], 0
    zr = SHOE_ZR
    up = ((1, 0, 0), (0, 0, -1))

    def hslab(poly_xz, y0, h, mat, r=0.0, segs=1):
        return slab_on(shoe_plan(poly_xz), (0, y0, 0), up[0], up[1], 0.0, h, mat, r=r, segs=segs)
    # r6: an ISO shoe frame in U section: base plate (the contact bed) in a pocket 3.3 mm deep, two box rails (outer
    # wall 1.15 thick, top flange 0.6 thick overhanging the bed to X +-6.5) whose C channels open to the rear, and a
    # front stop across the front between the rails; dark satin metal (back / 3/4 silver renders)
    zb = -22.6                                 # r7: the bed stops before the rear chamfer
    g.merge(hslab([(x0 + 0.05, zf), (x1 - 0.05, zf), (x1 - 0.05, zb), (x0 + 0.05, zb)], SHOE_Y0, SHOE_BED - SHOE_Y0,
                  "shoe_plate", r=0.12, segs=1))
    yb = SHOE_BED
    wt, ft = 1.15, 0.6                         # wall and flange thickness
    for sx, xo, xi in ((1, x1 - 0.15, 6.55), (-1, x0 + 0.1, -6.45)):
        wall = [(xo - sx * wt, zf), (xo, zf), (xo, zr), (xo - sx * wt, zr)]
        if sx < 0:
            wall = list(reversed(wall))
        g.merge(hslab(wall, SHOE_Y0 + 0.1, SHOE_TOP - SHOE_Y0 - 0.1, "shoe_frame", r=0.15, segs=1))
        fl = [(xi, zf), (xo, zf), (xo, zr), (xi, zr)]
        if sx < 0:
            fl = list(reversed(fl))
        g.merge(hslab(fl, SHOE_TOP - ft, ft, "shoe_frame", r=0.18, segs=2))
        # the channel floor under the flange: dark (the C opening reads black from behind)
        fl_floor = [(xi + sx * 0.1, zf - 0.6), (xo - sx * wt, zf - 0.6), (xo - sx * wt, zr), (xi + sx * 0.1, zr)]
        if sx < 0:
            fl_floor = list(reversed(fl_floor))
        g.merge(fill_polys([[shoe_plan(fl_floor), []]], 0.0, 0.0, "black", name="chan"),
                T(0, yb + 0.01, 0) @ plane_M((0, 0, 0), up[0], up[1]))
        # leaf spring inside the channel (the light strip seen through the C opening)
        sp = [(xo - sx * (wt + 0.25), zf - 3.0), (xo - sx * wt, zf - 3.0), (xo - sx * wt, zr + 1.5),
              (xo - sx * (wt + 0.25), zr + 1.5)]
        if sx < 0:
            sp = list(reversed(sp))
        g.merge(hslab(sp, yb + 0.6, 1.0, "shoe", r=0.08, segs=1))
    # front stop: a bridge across the front between the flanges' inner edges (its grey rear face is what the back
    # view sees between the rails), its top proud of the rails; the C channels stay open and dark to their front end
    g.merge(hslab([(-6.45, zf), (6.55, zf), (6.55, zf - 0.9), (-6.45, zf - 0.9)], yb - 0.05,
                  SHOE_LIP_TOP - yb + 0.05, "shoe", r=0.15, segs=1))
    for sx, xo, xi in ((1, x1 - 0.15, 6.55), (-1, x0 + 0.1, -6.45)):       # dark end walls of the channels
        g.merge(hslab([(xi, zf - 0.5), (xo - sx * wt, zf - 0.5), (xo - sx * wt, zf - 0.6), (xi, zf - 0.6)], yb,
                      SHOE_TOP - ft - yb, "black"))
    # lock-pin hole with its keyhole outline (dark), opening down into the insulator
    hc = (0.1, -7.5)

    def keyhole(rr, xl, xr, zb):
        arc = [(hc[0] + rr * math.cos(math.radians(a)), hc[1] + rr * math.sin(math.radians(a)))
               for a in range(-50, 231, 20)]
        return arc + [(xl, zb), (xr, zb)]
    g.merge(disc(0.95, 0.0, 24, "rubber"), place_y(hc[0], yb + 0.01, hc[1]))
    ko, ki = keyhole(1.35, -1.5, 1.7, -8.9), keyhole(1.17, -1.3, 1.5, -8.8)
    g.merge(fill_polys([[shoe_plan(ko), [shoe_plan(ki)]]], 0.0, 0.0, "rubber", name="key"),
            T(0, yb + 0.012, 0) @ plane_M((0, 0, 0), up[0], up[1]))
    # glossy black insulator
    # r6: set flush into the bed; it ends at Z -23.3 and the bed runs on behind it to -25.2 (top silver2k closeup)
    ins = [(4.1, -8.9), (-3.7, -8.9), (-3.7, -22.3), (4.1, -22.3)]
    ins = fillet_poly(shoe_plan(ins), [0.6, 3.9, 0.6, 0.6], [2, 6, 2, 2])
    g.merge(slab_on(ins, (0, yb - 0.4, 0), up[0], up[1], 0.0, 0.43, "black_gloss", r=0.1, segs=1))
    # r7: the insulator's tail runs on through the notch in the rear chamfer to its black rear face (back view)
    tx0, tx1, tzr = SHOE_TAIL
    g.merge(rbox(tx1 - tx0 - 0.2, yb + 0.03 - (SHOE_Y0 - 0.6), -22.0 - tzr, r=0.12, segs=1, mat="black_gloss",
                 center=((tx0 + tx1) / 2, (yb + 0.03 + SHOE_Y0 - 0.6) / 2, (-22.0 + tzr) / 2)))
    ytop = yb + 0.03
    g.merge(revolve([(1.8, -0.05), (1.8, 0.1), (1.6, 0.3), (1.1, 0.48), (0.0, 0.56)], 40, "contact"),
            place_y(0.2, ytop, -13.8))
    for (cx, cz) in ((2.4, -17.45), (-2.1, -17.45), (2.4, -20.9), (-2.1, -20.9)):
        g.merge(revolve([(0.75, -0.05), (0.75, 0.06), (0.55, 0.22), (0.25, 0.3), (0.0, 0.31)], 20, "chrome"),
                place_y(cx, ytop, cz))
    g.merge(revolve([(0.6, -0.05), (0.6, 0.1), (0.35, 0.2), (0.0, 0.22)], 16, "gold"), place_y(2.4, ytop, -10.8))
    return g


def build_hump_details(g):
    build_hot_shoe(g)
    # diopter knob (r2): outer face centred at (21.8, 83.6, -15.95), axis out of the +X flank tilted 35 deg above
    # horizontal (top view: flat face ellipse aspect 0.56; front view: rim diameter runs at ~39 deg), dia 8.4,
    # knurled side toward the hump. Nothing rises above the hump's flank line in the front/back views.
    al = math.radians(35.0)
    n = Vector((math.cos(al), math.sin(al), 0.0))
    M = axis_frame((21.8, 83.6, -15.95), n, (0, 0, 1))
    # r3: silver knob (top closeup: grey satin face, bright knurled rim)
    g.merge(revolve([(3.6, -5.0), (3.6, -3.4)], 40, "black"), M)
    g.merge(gear_chamfered(3.92, 4.2, 28, -3.4, -0.35, 0.15, "dial"), M)
    g.merge(revolve([(4.2, -0.35), (3.95, 0.0), (3.2, 0.0), (3.05, -0.08), (2.9, 0.02), (0.0, 0.06)], 40, "dial"),
            M)                                   # r4: bright bead-blasted face (was dark grey)
    # +/- beside the diopter, phi focal-plane mark: +X flank, reading front -> back (d = -Z)
    # r4 (top silver2k closeup): '+' / '-' inboard of the knob at X 16.5, Z -13.9 / -18.2; phi at X 18.0, Z 0.0
    for s_, zz in (("+", -13.9), ("–", -18.2)):
        xs2, n2 = hump_flank(1, 86.75)
        o = (xs2 + n2.x * LIFT, 86.75 + n2.y * LIFT, zz)
        label_flat(g, s_, 1.2, "lettering", plane_M(o, (0, 0, -1), (-n2.y, n2.x, 0)), fontpath=FONT_UI)
    xs3, n3 = hump_flank(1, 85.05)
    label_flat(g, "Φ", 1.8, "lettering", plane_M((xs3 + n3.x * LIFT, 85.05 + n3.y * LIFT, 0.0), (0, 0, -1), (-n3.y, n3.x, 0)),
               fontpath=FONT_UI)
    # VIEW MODE button and legend on the -X flank (reading back -> front, d = +Z)
    c = cm("viewmode_button")
    # r4 (top silver2k closeup): button at X -18.4, Z -17.7 (silver ring, silver cap, dark gap); legend beside it,
    # inboard (X -15.9), centred on Z -18.1 (Z -13.4..-22.8)
    yv = 84.2
    xs, n = hump_flank(-1, yv)
    M = axis_frame((xs, yv, -17.7), n, (0, 0, 1))
    g.merge(revolve([(2.5, -0.2), (2.5, 0.12), (2.25, 0.25), (1.8, 0.25), (1.75, 0.05)], 32, "chrome"), M)
    g.merge(revolve([(1.75, 0.05), (1.6, 0.05)], 32, "rubber"), M)
    g.merge(revolve([(1.6, -0.2), (1.6, 0.3), (1.3, 0.45), (0.0, 0.5)], 32, "dial"), M)
    xs2, n2 = hump_flank(-1, 87.0)
    label_flat(g, "VIEWMODE", 1.3, "lettering", plane_M((xs2 + n2.x * LIFT, 87.0 + n2.y * LIFT, -18.1), (0, 0, 1), (n2.y, -n2.x, 0)),
               fontpath=FONT_UI)
    # dial index bars on the hump ledges (white)
    for cid, side in (("iso_dial", 1), ("shutter_speed_dial", -1)):
        ix = cm(cid)["index_mark"]["pos"]
        yl = 81.0
        F, Rh, wl, wr = hump_dims(yl)
        xl = wl if side > 0 else -wr
        nn = Vector((side * 5.4, 2.9, 0)).normalized()
        if side > 0:                           # r4: the ISO index is a dark engraved 'U' with a bright rim (top closeup)
            yu = 83.0
            xu, nu = hump_flank(1, yu)
            Mu = plane_M((xu + nu.x * LIFT, yu + nu.y * LIFT, -2.8), (-nu.y, nu.x, 0), (0, 0, 1))
            u_out = [(-0.55, -0.85), (0.3, -0.85)] + [(0.3 + 0.85 * math.sin(math.radians(a)), -0.85 * math.cos(math.radians(a)))
                                                       for a in range(20, 180, 20)] + [(0.3, 0.85), (-0.55, 0.85)]
            u_in = [(-0.55, -0.5), (0.3, -0.5)] + [(0.3 + 0.5 * math.sin(math.radians(a)), -0.5 * math.cos(math.radians(a)))
                                                    for a in range(30, 180, 30)] + [(0.3, 0.5), (-0.55, 0.5)]
            g.merge(fill_polys([[u_out, []]], 0.0, 0.0, "chrome", name="u"), Mu)
            g.merge(fill_polys([[u_in, []]], 0.0, 0.0, "lettering", name="u2"), Mu @ T(0, 0, 0.01))
            continue
        g.merge(rbox(1.8, 0.7, 0.05, mat="paint"), plane_M((xl + nn.x * 0.02, yl + nn.y * 0.02, ix["z"]), (-side * 2.9, 5.4, 0) if side > 0 else (2.9, -5.4, 0), (0, 0, 1)))
    build_eyecup(g)
    return g


def shield_outline():
    """r4 eyecup outline (back silver2k at 37 px/mm, side views for the top): flat top Y 86.6 over X +-13, superelliptic
    top corners to the widest +-24.6 at Y 70..74.5, superelliptic bottom corners (r ~11) to Y 58.3, and a notch in the
    middle of the bottom (X +-11.4 at Y 61.6, slanted ends to +-13.3 at 58.3) where the bracket strip sits."""
    pts = []
    for k in range(13):                         # top-right corner: elliptic (11, 86.6) -> (24.6, 74.5) (front
        t = k / 12                              # silver2k: only a sliver X -21.5..-19, Y 81.5..84.6 shows by the hump)
        x = 11.0 + 13.6 * t
        pts.append((x, 74.5 + 12.1 * math.sqrt(max(0.0, 1 - t * t))))
    for k in range(1, 13):                      # bottom-right corner: (24.6, 70) -> (13.5, 58.3), exponent 2.5
        t = k / 12
        y = 70.0 - 11.7 * t
        pts.append((13.5 + 11.1 * max(0.0, 1 - t ** 2.5) ** (1 / 2.5), y))
    pts += [(11.4, 61.6)]
    right = pts
    left = [(-x, y) for (x, y) in reversed(right)]
    return right + left                         # CW from the top middle... closed, star-shaped from (0, 71.5)


def keyhole_opening():
    """r4: the cup's opening: round top (r 12 round (0, 71)), straight sides to Y 67.5, r 4.5 lower corners, a bottom
    edge at Y 63.0 and the keyhole channel X +-3.6 cut down through the lower rim to Y 61.9."""
    pts = []
    for k in range(25):
        a = math.pi * k / 24
        pts.append((12.0 * math.cos(a), 71.0 + 12.0 * math.sin(a)))
    poly = pts + [(-12.0, 63.0), (-3.6, 63.0), (-3.6, 61.9), (3.6, 61.9), (3.6, 63.0), (12.0, 63.0)]
    rad = [0.0] * 25 + [4.5, 0.6, 0.5, 0.5, 0.6, 4.5]
    seg = [0] * 25 + [6, 2, 2, 2, 2, 6]
    return fillet_poly(poly, rad, seg)


def build_eyecup(g):
    """r4 (review: boxy outline, top 0.8 mm high, plain round opening, no bracket strip or side pads): shield-shaped
    pillowy rubber cup (rear face Z -37.0, saddled 1.3 mm across X), keyhole opening, black bracket strip under it,
    raised side pads with two '=' ridges, a darker eyepiece behind a flat-topped / flat-bottomed tunnel."""
    outer_d = shield_outline()
    inner_d = keyhole_opening()
    cxy = (0.0, 71.5)
    key = [(3.6, 63.0), (3.6, 61.9), (-3.6, 61.9), (-3.6, 63.0), (11.4, 61.6), (-11.4, 61.6), (13.5, 58.3),
           (-13.5, 58.3), (12.0, 67.5), (-12.0, 67.5)]
    n_ring = xt5lib.lod_n(120)                 # m2: 120 steps on LOD0, fewer on LOD1
    angs = sorted(set([round(-math.pi / 2 + TAU * k / n_ring, 5) for k in range(n_ring)] +
                      [round((math.atan2(y - cxy[1], x - cxy[0]) + math.pi / 2) % TAU - math.pi / 2, 5)
                       for (x, y) in key]))
    angs2 = []
    for a in angs:
        if not angs2 or a - angs2[-1] > 0.006:
            angs2.append(a)
    inner = star_ring(inner_d, cxy, angs2)
    outer = star_ring(outer_d, cxy, angs2)
    # the rim's roll-over radii shrink where the lip is thin (keyhole bottom), so the two rims never cross
    gap = [math.dist(o_, i_) for o_, i_ in zip(outer, inner)]
    ro = [min(2.0, 0.6 * gp) for gp in gap]
    ri = [min(1.0, 0.3 * gp) for gp in gap]

    def offv(pts, ds):
        n = len(pts)
        out = []
        for i in range(n):
            ax, ay = pts[i - 1]
            cx_, cy_ = pts[(i + 1) % n]
            tx, ty = cx_ - ax, cy_ - ay
            L = math.hypot(tx, ty) or 1.0
            out.append((pts[i][0] + ty / L * ds[i], pts[i][1] - tx / L * ds[i]))
        return out
    lv = [(-25.3, offset_ring(outer, -0.3)), (-28.5, outer), (-31.5, outer)]
    for k in range(5):
        th = (math.pi / 2) * k / 4
        lv.append((-36.95 + 2.0 * (1 - math.sin(th)), offv(outer, [-r_ * (1 - math.cos(th)) for r_ in ro])))
    for k in range(4):
        th = (math.pi / 2) * k / 3
        lv.append((-36.95 + 1.0 * (1 - math.cos(th)), offv(inner, [r_ * (1 - math.sin(th)) for r_ in ri])))
    lv += [(-34.6, inner), (-30.6, inner)]
    cup = loft(lv, "rubber", cap_bottom=False, cap_top=False, axis="Z")
    zf_, zr_ = -25.3, -36.95
    cup.v = [(vx, vy, vz + 1.3 * (1 - min(1.0, (vx / 21.0) ** 2)) * max(0.0, (zf_ - vz) / (zf_ - zr_)) ** 2)
             for (vx, vy, vz) in cup.v]
    g.merge(cup)
    # side pads (left/right silver2k: Z -27.1..-33.3, Y 72.6..77.8) with two ridges (Y 73.9 / 75.3, Z -28.6..-31.7)
    for sx in (-1, 1):
        d = (0, 0, -1) if sx > 0 else (0, 0, 1)

        def pc(z, y):
            return (-z if sx > 0 else z, y)
        pad = fillet_poly([pc(-27.1, 72.6), pc(-33.3, 72.6), pc(-33.3, 77.8), pc(-27.1, 77.8)], [1.2] * 4, [3] * 4)
        g.merge(slab_on(pad, (sx * 24.15, 0, 0), d, (0, 1, 0), 0.0, 0.8, "rubber", r=0.3, segs=2))
        for yy in (73.9, 75.3):
            rid = fillet_poly([pc(-28.6, yy - 0.3), pc(-31.7, yy - 0.3), pc(-31.7, yy + 0.3), pc(-28.6, yy + 0.3)],
                              [0.28] * 4, [2] * 4)
            g.merge(slab_on(rid, (sx * 24.15, 0, 0), d, (0, 1, 0), 0.0, 1.12, "rubber", r=0.2, segs=1))
    # bracket strip under the cup: trapezoid X +-13.3 at Y 57.8 / +-11.4 at 61.75, the keyhole's round end cut into
    # its top (r 3.3 round (0, 62.6))
    notch = [(3.3 * math.cos(math.radians(a)), 62.6 + 3.3 * math.sin(math.radians(a))) for a in range(-30, -151, -15)]
    strip = [(-13.3, 57.8), (13.3, 57.8), (11.4, 61.75), (3.19, 61.75)] + notch + [(-3.19, 61.75), (-11.4, 61.75)]
    g.merge(rear_slab(fillet_poly(strip, [0.6, 0.6, 0.4, 0.2] + [0.0] * len(notch) + [0.2, 0.4],
                                  [2, 2, 2, 1] + [0] * len(notch) + [1, 2]), 5.5, 12.7, "shoe_cover",
                      zface=-23.5))
    # eye-sensor window, seen through the keyhole
    g.merge(rear_slab(fillet_poly([(-5.8, 59.0), (5.8, 59.0), (5.8, 65.5), (-5.8, 65.5)], [1.0] * 4, [2] * 4),
                      7.16, 7.2, "glass", zface=-23.5))
    # tunnel: flat top (Y 78.8) and bottom (Y 65.8) cut into the dia 18.6 eyepiece circle; backing plate round it
    yc, rg = 72.6, 9.3
    a_t = math.asin((78.8 - yc) / rg)
    a_b = math.asin((65.8 - yc) / rg)
    dcut = [(rg * math.cos(a), yc + rg * math.sin(a)) for a in [a_b + (a_t - a_b) * k / 10 for k in range(11)]]
    dcut += [(rg * math.cos(a), yc + rg * math.sin(a)) for a in [math.pi - a_t + (a_t - a_b) * k / 10 for k in range(11)]]
    plate = fillet_poly([(-12.7, 60.5), (12.7, 60.5), (12.7, 84.0), (-12.7, 84.0)], [3.0] * 4, [3] * 4)
    g.merge(fill_polys([[plate, [dcut]]], 0.0, 0.0, "rubber", name="evf_plate"),
            plane_M((0, 0, -30.62), (-1, 0, 0), (0, 1, 0)))
    tl = [(z, [(x, y) for (x, y) in dcut]) for z in (-30.62, -27.0)]
    g.merge(loft(tl, "rubber", cap_bottom=False, cap_top=False, axis="Z"))
    prof = [(9.3 * (1 - k / 8), 0.6 * (1 - (1 - k / 8) ** 2)) for k in range(9)]
    g.merge(revolve(prof, 72, "evf").transformed(T(0, yc, -26.9) @ R("Y", 180)))


def star_ring(poly, c, angs):
    """Intersections of rays from c at the given angles with a closed polyline that is star-shaped from c."""
    n = len(poly)
    out = []
    for a in angs:
        dx, dy = math.cos(a), math.sin(a)
        best = None
        for i in range(n):
            (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % n]
            ex, ey = x1 - x0, y1 - y0
            den = dx * ey - dy * ex
            if abs(den) < 1e-12:
                continue
            t = ((x0 - c[0]) * ey - (y0 - c[1]) * ex) / den
            u = ((x0 - c[0]) * dy - (y0 - c[1]) * dx) / den
            if t > 0 and -1e-9 <= u <= 1 + 1e-9 and (best is None or t > best):
                best = t
        out.append((c[0] + dx * best, c[1] + dy * best))
    return out


def build_dial_bases(g):
    """Fixed collars set into the top plate under the dials, and the EV index."""
    for cid in ("iso_dial", "shutter_speed_dial"):
        p = cm(cid)["pos"]
        yt_ = Y_TOP + 0.05 if cid == "iso_dial" else 73.65      # r4: no daylight gap under the STILL/MOVIE ring
        rc = DIA[cid] / 2 - 0.65                                  # r4: tucked under the dial (was a black ring
        g.merge(revolve([(rc, Y_TOP - 0.3), (rc, yt_), (rc - 1.2, yt_)], 64, "black"), place_y(p["x"], 0, p["z"]))
    p = cm("ev_comp_dial")["pos"]
    rc = DIA["ev_comp_dial"] / 2 - 0.65                           # round every dial in the top view)
    g.merge(revolve([(rc, Y_TOP - 0.3), (rc, Y_TOP + 0.3), (rc - 0.9, Y_TOP + 0.3)], 64, "black"), place_y(p["x"], 0, p["z"]))
    ix = cm("ev_comp_dial")["index_mark"]["pos"]
    g.merge(rbox(1.6, 0.04, 0.6, mat="lettering"), T(ix["x"] + 0.4, Y_TOP + 0.01, ix["z"]))   # r7: dark dash
    return g


# ===================================================================================== moving parts (authored around x=z=0, then placed)
SHUTTER_LABELS = ["A", "B", "T", "1", "2", "4", "8", "15", "30", "60", "125", "250X", "500", "1000", "2000", "4000", "8000"]


def dial_top(g, R_, yt, ytop, N=128):
    """r4 (review: flat near-white tops with a black rim line): the knurl tips stand 0.45 mm outside a crisp top
    edge (tiny 0.08 mm break, no dark bevel); a 1 mm bead-blasted band at the rim, then the spun (circular-brushed,
    anisotropic) top; a dark gap round the lock button."""
    g.merge(revolve([(R_ - 0.45, yt - 0.35), (R_ - 0.45, ytop - 0.08), (R_ - 0.53, ytop), (R_ - 1.5, ytop)], N, "dial"),
            AX_Y)
    g.merge(revolve([(R_ - 1.5, ytop), (3.3, ytop)], N, "dial_top"), AX_Y)
    g.merge(revolve([(3.3, ytop), (3.0, ytop - 0.15)], N, "rubber"), AX_Y)


def lock_button(g, ytop, N=64, drop=0.0):
    """r4: low disc 0.9 mm above the dial face with a soft dome (was a 1.0-1.3 mm stepped cylinder). r7: drop."""
    h = ytop - drop
    g.merge(revolve([(2.98, ytop - 0.3), (2.98, h + 0.5), (2.72, h + 0.82), (1.6, h + 0.92), (0.0, h + 0.95)],
                    N, "dial"), AX_Y)


def build_knurled_dial(name, c, top_labels, rows, lock_drop=0.0):
    p = c["pos"]
    s = c["size"]
    R_ = DIA.get(c["id"], s["dia"]) / 2
    yb, yt = s["knurl_band_y"]
    ytop = s["top_face_y"]
    g = Geo(name)
    n_around = 72                              # refs run 2: 72 pyramids round (pitch 1.04 mm on ISO / shutter)
    g.merge(revolve([(R_ - 0.45, yb), (R_ - 0.45, yt - 0.35)], 96, "dial"), AX_Y)
    g.merge(knurl_band(R_ - 0.45, yb + 0.05, yt - 0.35, n_around, rows, 0.45, "dial"), AX_Y)
    dial_top(g, R_, yt, ytop)
    g.merge(revolve([(0.0, yb), (R_ - 0.45, yb)], 96, "dial"), AX_Y)
    top_labels(g, ytop + LIFT)
    lock_button(g, ytop, drop=lock_drop)
    return g.transformed(T(p["x"], 0, p["z"])), (p["x"], yb, p["z"])


def build_iso_dial():
    c = cm("iso_dial")

    def labels(g, yl):
        # r2: 23 positions, 360/23 deg apart (1/3 stop each): A at the index (-X, 180 deg), 125 one step from A,
        # 200 at 3 steps, then a full stop per 3 steps to 12800 at 21, C at 22 (top view: 200 at 47, 400 at 93,
        # 800 at 142 ... 12800 at 327, C at 341 deg from A). Every position has the same rim dash at r ~10; the
        # numeral (or A / C) reads radially outward and ends just inside its dash ('125-', 'A-', 'C-').
        step = 360.0 / 23
        names = {0: ("A", "accent"), 1: ("125", "lettering"), 3: ("200", "lettering"), 6: ("400", "lettering"),
                 9: ("800", "lettering"), 12: ("1600", "lettering"), 15: ("3200", "lettering"),
                 18: ("6400", "lettering"), 21: ("12800", "lettering"), 22: ("C", "lettering")}
        for j in range(23):
            ang = 180.0 - step * j
            g.merge(rbox(0.85, 0.42, 0.03, mat="lettering"), dial_label_matrix(yl, ang, 10.0, "out"))
            if j in names:
                s_, mat = names[j]
                label_flat(g, s_, 1.66, mat, dial_label_matrix(yl, ang, 9.38, "out"), align_x="RIGHT", spacing=1.02,
                           bold=BOLD, condense=0.9)          # r4: +10%, heavier (review: 1.55 vs 1.7-1.85)
    return build_knurled_dial("dial_look", c, labels, 5)


def build_shutter_dial():
    c = cm("shutter_speed_dial")

    def labels(g, yl):
        step = 360.0 / 17
        for k, s_ in enumerate(SHUTTER_LABELS):
            ang = step * k
            mat = "accent" if s_ == "A" else "lettering"
            # r2: numerals enlarged to the reference size (top view: ~2.3 mm caps, long values run in from the rim)
            if s_ in ("15", "30", "60"):           # r4: +10%, heavier
                label_flat(g, s_, 1.87, mat, dial_label_matrix(yl, ang, 8.85, "tan"), bold=0.0, condense=0.92)
            elif len(s_) >= 3:
                label_flat(g, s_, 1.74 if len(s_) == 3 else 1.65, mat, dial_label_matrix(yl, ang, 10.3, "in"),
                           align_x="LEFT", bold=0.0, condense=0.9)
            else:
                label_flat(g, s_, 1.94, mat, dial_label_matrix(yl, ang, 9.0, "in"), bold=0.0, condense=0.92)
    return build_knurled_dial("dial_shutter", c, labels, 5, lock_drop=0.5)   # r7: lock button 0.5 mm lower


def build_ev_dial():
    c = cm("ev_comp_dial")
    p = c["pos"]
    s = c["size"]
    R_ = DIA["ev_comp_dial"] / 2
    yb, yt = s["knurl_band_y"]
    yb = Y_TOP + 0.02                          # r7: seated on the deck
    ytop = s["top_face_y"]
    g = Geo("dial_ev")
    n_around = 72                              # refs run 2: 72 pyramids round (pitch 0.92 mm on the EV dial)
    g.merge(revolve([(R_ - 0.45, yb), (R_ - 0.45, yt - 0.3)], 96, "dial"), AX_Y)
    g.merge(knurl_band(R_ - 0.45, yb + 0.05, yt - 0.3, n_around, 5, 0.45, "dial"), AX_Y)
    g.merge(revolve([(R_ - 0.45, yt - 0.3), (R_ - 0.45, ytop - 0.08), (R_ - 0.53, ytop), (R_ - 1.4, ytop)], 128,
                    "dial"), AX_Y)
    g.merge(revolve([(R_ - 1.4, ytop), (0.0, ytop)], 128, "dial_top"), AX_Y)     # spun top, no lock button
    g.merge(revolve([(0.0, yb), (R_ - 0.45, yb)], 96, "dial"), AX_Y)
    yl = ytop + LIFT + 0.02
    # r4 (top silver2k): numerals start at r 8.45 and read inward (the '0' centres at r ~7.6), cap 1.95
    labs = {0: "0", 45: "+1", 90: "+2", 135: "+3", 180: "C", 225: "–3", 270: "–2", 315: "–1"}
    for k in range(24):
        ang = 15.0 * k
        if ang in labs:
            label_flat(g, labs[ang], 1.95, "lettering", dial_label_matrix(yl, ang, 8.45, "in"), align_x="LEFT",
                       bold=BOLD, condense=0.95)
            g.merge(rbox(1.0, 0.42, 0.03, mat="lettering"), dial_label_matrix(yl, ang, 9.25, "in"))
        else:
            g.merge(rbox(0.7, 0.35, 0.03, mat="lettering"), dial_label_matrix(yl, ang, 9.25, "in"))
    return g.transformed(T(p["x"], 0, p["z"])), (p["x"], yb, p["z"])


def wrap_flat(t, R_, yc, ang_deg, lift=LIFT + 0.03):
    """Wrap a flat Geo authored in local (u, v) (centred) onto the outside of a vertical cylinder, as wrap_legend."""
    a0 = math.radians(ang_deg)
    out = Geo("legend")
    out.v = [((R_ + lift) * math.cos(a0 - u / R_), yc + v, (R_ + lift) * math.sin(a0 - u / R_)) for (u, v, w) in t.v]
    out.f, out.m, out.s, out.uv = t.f, t.m, t.s, t.uv
    return out


def pano_icon(cap, mat):
    """Panorama mode icon (drive ring): a wide frame whose top and bottom edges bow inward."""
    w, h, th = cap * 1.35, cap, 0.28
    n = 8
    top = [(-w / 2 + w * k / n, h / 2 - 0.22 * math.sin(math.pi * k / n)) for k in range(n + 1)]
    bot = [(w / 2 - w * k / n, -h / 2 + 0.22 * math.sin(math.pi * k / n)) for k in range(n + 1)]
    outer = bot + top
    itop = [(-w / 2 + th + (w - 2 * th) * k / n, h / 2 - th - 0.22 * math.sin(math.pi * k / n)) for k in range(n + 1)]
    ibot = [(w / 2 - th - (w - 2 * th) * k / n, -h / 2 + th + 0.22 * math.sin(math.pi * k / n)) for k in range(n + 1)]
    inner = list(reversed(ibot + itop))
    return fill_polys([[outer, [inner]]], 0.0, 0.0, mat, name="pano")


def wrap_legend(txt, cap, mat, R_, yc, ang_deg, font=FONT_NUM, lift=LIFT + 0.03, condense=0.76):
    """Text on the outside of a vertical cylinder (axis +Y at x=z=0), centred at ref angle ang, upright, reading
    toward decreasing angle (left to right for a viewer outside)."""
    t = text_geo(txt, cap / CAPF(font), mat, font)
    t.v = [(u * condense, v, w) for (u, v, w) in t.v]   # r3: condensed sans as on the rings
    a0 = math.radians(ang_deg)
    out = Geo("legend")
    vv = []
    for (u, v, w) in t.v:
        a = a0 - u / R_
        rr = R_ + lift
        vv.append((rr * math.cos(a), yc + v, rr * math.sin(a)))
    out.v = vv
    out.f, out.m, out.s, out.uv = t.f, t.m, t.s, t.uv
    return out


# r4: dial / ring diameters re-measured on the 2000 px silver front + top views (knurl tips; review: 0.6-0.9 mm small)
DIA = {"iso_dial": 24.3, "drive_dial": 24.3, "shutter_speed_dial": 24.4, "still_movie_dial": 24.3, "ev_comp_dial": 21.2}


def build_ring(name, c, legend, dots, tab_dir_deg, reach, tab_y):
    """Drive / STILL-MOVIE ring under a dial: polished silver band, black legend on its side, and (r4) a short chunky
    lever block (5.6 mm wide) with five vertical rounded fins on its outward face that run over its top edge
    (front + top silver2k closeups; was a long flat paddle with horizontal ridges)."""
    p = c["pos"]
    s = c["size"]
    R_ = DIA.get(c["id"], s["dia"]) / 2
    y0, y1 = s["band_y"]
    g = Geo(name)
    g.merge(revolve([(R_ - 1.2, y0), (R_ - 0.4, y0), (R_, y0 + 0.4), (R_, y1 - 0.3), (R_ - 0.3, y1), (R_ - 1.2, y1)], 128, "ring"), AX_Y)
    yc = (y0 + y1) / 2
    for (txt, ang, mat, cap) in legend:
        if txt == "[pano]":
            g.merge(wrap_flat(pano_icon(cap, mat), R_, yc, ang))
        else:
            g.merge(wrap_legend(txt, cap, mat, R_, yc, ang))
    for (ang, mat) in dots:
        a = math.radians(ang)
        nrm = (math.cos(a), 0, math.sin(a))
        g.merge(disc(0.55, 0.0, 16, mat), axis_frame((R_ * math.cos(a) * 1.0 + nrm[0] * (LIFT + 0.03), yc, R_ * math.sin(a) + nrm[2] * (LIFT + 0.03)), nrm))
    a = math.radians(tab_dir_deg)
    dirv = Vector((math.cos(a), 0, math.sin(a)))
    tang = Vector((-math.sin(a), 0, math.cos(a)))
    ty0, ty1 = tab_y
    hw = 2.8
    blk = fillet_poly([(-hw, R_ - 1.0), (hw, R_ - 1.0), (hw, reach - 0.3), (-hw, reach - 0.3)], [0.0, 0.0, 0.7, 0.7],
                      [0, 0, 3, 3])
    g.merge(slab_on(blk, (0, ty0, 0), tang, dirv, 0.0, ty1 - ty0, "dial", r=0.35, segs=2))
    for k in range(5):                          # fins: rounded bars 0.3 proud of the front and top faces
        off = -2.0 + 1.0 * k
        o = dirv * (reach - 0.3 - 0.35) + tang * off + Vector((0, (ty0 + 0.45 + ty1 + 0.28) / 2, 0))
        g.merge(rbox(0.56, ty1 + 0.28 - (ty0 + 0.45), 1.3, r=0.26, segs=2, mat="ring"), plane_M(o, tang, (0, 1, 0)))
    return g.transformed(T(p["x"], 0, p["z"])), (p["x"], y0, p["z"])


def build_shutter_button():
    """r4: domed satin button (dia 6.7) with a chrome cable-release socket ring (dia 3.2) round a threaded 2.2 mm hole;
    every ring on one 64-step grid (the r3 spikes came from merging 64- and 24-step rings)."""
    c = cm("shutter_button")
    x, y, z = P(c)
    g = Geo("shutter_button")
    N = 64
    yt = 78.35                                  # r7: front silver2k column: 0.6 mm lower than r6 (78.95)
    g.merge(revolve([(3.35, 76.6), (3.35, yt - 0.42), (3.18, yt - 0.14), (2.85, yt - 0.02), (2.2, yt), (1.6, yt - 0.06)],
                    N, "dial"), AX_Y)
    g.merge(revolve([(1.6, yt - 0.06), (1.5, yt - 0.02), (1.15, yt - 0.03), (1.1, yt - 0.05)], N,
                    "chrome"), AX_Y)
    thread = [(1.1, yt - 0.05)]
    for k in range(4):                          # threaded socket: shallow V rings down the bore
        yy = yt - 0.25 - 0.3 * k
        thread += [(0.98, yy), (1.1, yy - 0.15)]
    thread += [(1.1, yt - 1.4), (0.0, yt - 1.4)]
    g.merge(revolve(thread, N, "black"), AX_Y)
    return g.transformed(T(x, 0, z)), (x, cm("on_off_switch")["size"]["band_y"][1], z)


def build_power_switch():
    """r4 (review: the collar was knurled all round): ON/OFF collar of two smooth satin steps (dia 13.6, then 11.8)
    with small bevels; a curved eyebrow finger tab at Z 18.8..20.5 with five vertical ridges; the pointer at
    Z 6.2..7.9 a dark slot (top silver2k closeup)."""
    sw = cm("on_off_switch")
    x, y, z = P(sw)
    y0 = sw["size"]["band_y"][0]
    R_ = sw["size"]["dia"] / 2
    g = Geo("switch_power")
    N = 96
    yl, yu = 76.15, 77.45                       # lower ring top / upper ring top (right silver2k)
    g.merge(revolve([(3.75, y0), (R_, y0), (R_, yl - 0.3), (R_ - 0.3, yl), (5.98, yl), (5.9, yl + 0.08),
                     (5.9, yu - 0.22), (5.68, yu), (3.85, yu), (3.7, yu - 0.15), (3.7, y0)], N, "satin_collar"), AX_Y)
    # finger tab: annular sector r 6.3..8.0 round local -Z... the tab points to world +Z (front)
    zf0, zf1 = sw["size"]["finger_tab_z"]
    r0, r1 = zf0 - z - 0.4, zf1 - z
    half = math.radians(22.0)
    sector = []
    for k in range(9):
        a = math.pi / 2 - half + 2 * half * k / 8
        sector.append((r1 * math.cos(a), r1 * math.sin(a)))
    for k in range(9):
        a = math.pi / 2 + half - 2 * half * k / 8
        sector.append((r0 * math.cos(a), r0 * math.sin(a)))
    sector = [(xx, -zz) for (xx, zz) in sector]         # plan (x, z) -> slab plane (x, -z)
    g.merge(slab_on(sector, (0, y0 + 0.7, 0), (1, 0, 0), (0, 0, -1), 0.0, yu + 0.45 - (y0 + 0.7), "satin_collar", r=0.3,
                    segs=2))
    for k in range(6):                          # vertical ridges on the tab's outer face (r7: 6, review)
        a = math.pi / 2 + math.radians(-15 + 6 * k)
        p = Vector((r1 * math.cos(a), 0.0, r1 * math.sin(a)))
        n = Vector((math.cos(a), 0.0, math.sin(a)))
        g.merge(rbox(0.38, yu + 0.3 - (y0 + 0.9), 0.5, r=0.17, segs=1, mat="satin_collar"),
                plane_M((p.x + n.x * 0.05, (y0 + 0.9 + yu + 0.3) / 2, p.z + n.z * 0.05),
                        (-n.z, 0, n.x), (0, 1, 0)))
    # pointer: dark slot cut across the rear of the steps
    pz0, pz1 = sw["size"]["pointer_z"]
    g.merge(rbox(0.9, yu + 0.03 - 75.5, pz1 - pz0, r=0.15, segs=1, mat="rubber"),
            T(0, (yu + 0.03 + 75.5) / 2, (pz0 + pz1) / 2 - z))
    return g.transformed(T(x, 0, z)), (x, y0, z)


def gear_chamfered(r_root, r_tip, teeth, z0, z1, ch, mat, tip_frac=0.42, root_frac=0.30, cap=True, bottom=True):
    """Toothed wheel around local +Z with flat-topped teeth, flat roots and a chamfer ch on both faces' tooth edges.
    cap=False leaves the ends open (a knurl band closed by the neighbouring profile instead of two big n-gons).
    bottom=False: no chamfer and no cap at z0 (a part seated on a surface)."""
    if not xt5lib.LODQ["gear"]:                 # m2 LOD1: a plain chamfered band at 60% of the tooth height
        rr = r_root + (r_tip - r_root) * 0.6
        prof = ([(0.0, z0)] if (cap and bottom) else []) + ([(rr - ch, z0), (rr, z0 + ch)] if bottom else [(rr, z0)])
        prof += [(rr, z1 - ch), (rr - ch, z1)] + ([(0.0, z1)] if cap else [])
        return revolve(prof, max(48, teeth), mat)
    pts = []
    da = TAU / teeth
    for t in range(teeth):
        a = TAU * t / teeth
        pts += [(r_root, a - da * root_frac / 2), (r_root, a + da * root_frac / 2),
                (r_tip, a + da * (0.5 - tip_frac / 2)), (r_tip, a + da * (0.5 + tip_frac / 2))]

    def ring(sh):
        return [((rr - sh) * math.cos(a), (rr - sh) * math.sin(a)) for rr, a in pts]
    lv = ([(z0, ring(ch)), (z0 + ch, ring(0.0))] if bottom else [(z0, ring(0.0))]) + [(z1 - ch, ring(0.0)), (z1, ring(ch))]
    return loft(lv, mat, cap_bottom=cap and bottom, cap_top=cap, smooth=False, axis="Z")


def dark_roots(gg, r_root, mat, eps=0.02):
    """r7: recolour a gear_chamfered()'s tooth-gap floors (faces whose every vertex lies at r <= r_root, local Z axis):
    the silver wheel keeps dark gaps between its teeth (round-3 review)."""
    for i, f in enumerate(gg.f):
        if len(f) <= 4 and min(math.hypot(gg.v[k][0], gg.v[k][1]) for k in f) <= r_root + eps:   # floors + flanks
            gg.m[i] = mat
    return gg


def build_command_dial(name, c, mat, teeth_pitch=1.3, yr=None, depth=0.45, dia=None, zc=None, root_mat=None,
                       tip_frac=0.42, root_frac=0.30):
    """r2: 1.3 mm pitch, shallower flat-topped teeth with chamfered edges (front ref shows fine bright tooth tips)."""
    x, y, z = P(c)
    z = z if zc is None else zc
    s = c["size"]
    dia = dia or s["dia"]
    R_ = dia / 2
    y0, y1 = yr or s["y"]
    teeth = int(round(math.pi * dia / teeth_pitch))
    g = Geo(name)
    gw = gear_chamfered(R_ - depth, R_, teeth, y0, y1, 0.22, mat, tip_frac=tip_frac, root_frac=root_frac)
    if root_mat:
        dark_roots(gw, R_ - depth, root_mat)
    g.merge(gw, AX_Y)
    g.merge(cyl(R_ - depth - 0.05, y0 - 0.4, y0, 64, "black", cap0=True, cap1=False), AX_Y)    # hub below the rim
    return g.transformed(T(x, 0, z)), (x, y0, z)


LCD_ZR, LCD_ZF = -24.4, -18.6      # r3: rear glass face 0.4 mm further back (silver top view -24.7; spec depth 37.9)


def build_lcd():
    """LCD module on its two-axis tilt bracket (r3 rig, refs run 2 hinge correction):
       lcd            top hinge, axis +X: + tilts the screen up (bottom edge swings out), 0..90 deg
       lcd_tilt_down  bottom hinge (child), axis +X: - tilts it down (top edge swings out), -45..0 deg
       lcd_portrait   hinge along the screen's -X (grip-side) edge (child), axis +Y: + swings the +X edge, which
                      carries the tilt-lock release tab, out from the body, 0..60 deg
    Returns {node: (geo or None, pivot, parent)}."""
    c = cm("lcd")
    s = c["size"]
    hx0, hx1 = -35.8, s["housing_x"][1]     # r4: the grip-side frame is ~4 mm wide (back silver2k: frame to -35.7,
    hy0, hy1 = 0.5, s["housing_y"][1]       # shadow gap -36..-37.3), was -33.2
    g = Geo("lcd")
    zr, zf = LCD_ZR, LCD_ZF
    hous = fillet_poly([(hx0, hy0), (hx1, hy0), (hx1, hy1), (hx0, hy1)], [2.0] * 4, [4] * 4)
    lv = [(zf, hous), (zr + 0.6, hous), (zr + 0.15, offset_ring(hous, -0.35)), (zr, offset_ring(hous, -0.8))]
    g.merge(loft(lv, "black", axis="Z"))
    gx0, gx1 = s["cover_glass_x"]
    gy0, gy1 = s["cover_glass_y"]
    g.merge(rear_slab(fillet_poly([(gx0, gy0), (gx1, gy0), (gx1, gy1), (gx0, gy1)], [1.2] * 4, [3] * 4), 0.0, 0.18,
                      "lcd_glass", r=0.12, segs=1, zface=zr))
    ax0, ax1 = s["active_x"]
    ay0, ay1 = s["active_y"]
    g.merge(rear_slab([(ax0, ay0), (ax1, ay0), (ax1, ay1), (ax0, ay1)], 0.18, 0.186, "screen", zface=zr))
    # bottom finger lip along the whole lower edge (silver bottom view: rounded bar X -35.9..48, to Z ~-25.6)
    g.merge(rbox(hx1 - hx0 - 1.5, 2.6, 1.4, r=0.6, segs=2, mat="black"), T((hx0 + hx1) / 2, 1.8, zr + 0.1))
    tl = c["hinges"]["tilt_lock_release"]
    g.merge(rbox(1.6, 6.0, 3.2, r=0.4, segs=1, mat="black"), T(hx1 + 0.4, tl["y"], tl["z"]))
    g.merge(rbox(1.0, hy1 - hy0 - 6, 4.6, r=0.3, segs=1, mat="black"), T(hx1 - 0.2, (hy0 + hy1) / 2, -21.3))
    # tilt bracket: hinge barrels along the top and bottom edges, in the body's LCD pocket
    br = Geo("lcd_bracket")
    for yy in (hy1 - 1.2, hy0 + 1.4):
        br.merge(cyl(0.9, hx0 + 4.0, hx1 - 4.0, 16, "black").transformed(T(0, yy, zf - 0.2) @ AX_X))
    xc = (hx0 + hx1) / 2
    return {"lcd": (br, (xc, hy1 - 1.2, zf - 0.2), None),
            "lcd_tilt_down": (None, (xc, hy0 + 1.4, zf - 0.2), "lcd"),
            "lcd_portrait": (g, (hx0 + 0.6, (hy0 + hy1) / 2, zf - 0.2), "lcd_tilt_down")}


RIG_META = {
    "dial_look": {"verb": "spin", "axis": [0, 1, 0], "note": "ISO dial (m1 name kept)"},
    "dial_shutter": {"verb": "spin", "axis": [0, 1, 0]},
    "dial_ev": {"verb": "spin", "axis": [0, 1, 0]},
    "ring_drive": {"verb": "spin", "axis": [0, 1, 0], "range_deg": [-60, 60]},
    "ring_still_movie": {"verb": "spin", "axis": [0, 1, 0], "range_deg": [0, 24]},
    "shutter_button": {"verb": "press", "axis": [0, -1, 0], "travel_mm": 1.2},
    "switch_power": {"verb": "spin", "axis": [0, 1, 0], "range_deg": [0, 25]},
    "dial_cmd_front": {"verb": "spin", "axis": [0, 1, 0]},
    "dial_cmd_rear": {"verb": "spin", "axis": [0, 1, 0]},
    "lcd": {"verb": "tilt", "axis": [1, 0, 0], "range_deg": [0, 90], "note": "tilt up: bottom edge swings out"},
    "lcd_tilt_down": {"verb": "tilt", "axis": [1, 0, 0], "range_deg": [-45, 0], "note": "tilt down: top edge out"},
    "lcd_portrait": {"verb": "tilt", "axis": [0, 1, 0], "range_deg": [0, 60],
                     "note": "hinge on the -X (grip-side) edge; the +X edge with the release tab swings out"},
    "lens": {"verb": "swap"},
    "lens_aperture_ring": {"verb": "spin", "axis": [0, 0, 1], "detents": 22, "note": "A 16 11 8 5.6 4 2.8 2, 1/3 stops"},
    "lens_focus_ring": {"verb": "spin", "axis": [0, 0, 1]},
    "kit_xf1650": {"verb": "swap", "note": "XF16-50 kit lens, alternative to lens (XF35); hidden by default"},
    "hot_shoe_cover": {"verb": "remove", "axis": [0, 0, -1], "note": "shipped fitted; hidden in the comparison renders"},
}


# ===================================================================================== lens front optics (r5)
def dome(r_rim, z_rim, sag, fr=(1.0, 0.85, 0.6, 0.3)):
    """Spherical cap from the rim (r_rim, z_rim) to the axis, sag > 0 convex toward +z (the lens front), sag < 0
    concave; rings at the given fractions of the rim radius, then the pole."""
    R = (r_rim ** 2 + sag ** 2) / (2 * abs(sag))
    s = 1 if sag > 0 else -1
    zc = z_rim + sag - s * R                     # sphere centre on the axis
    prof = [(r_rim * f, zc + s * math.sqrt(R * R - (r_rim * f) ** 2)) for f in fr]
    return prof + [(0.0, z_rim + sag)]


def front_optics(rev, r_bore, z_lip, el1, steps, el2, el3, n=96, n_in=64):
    """r5 (orchestrator: the front element showed a gear-tooth ring and flat glass with a hard horizon): a real lens
    front. el1: the convex front element (r_rim, z_rim, sag) in coated glass the eye sees through; steps: the black
    bore stepping inward and back as smooth retaining / spacer rings [(r, z_front, z_back)], ending at the deepest
    radius; el2: an inner element (concave, magenta-coated glass) seated on the first step; el3: the deepest element,
    dark green-coated and opaque, closing the view. Every ring is a surface of revolution with one segment count per
    part, so no faceted intersections; normals of the bore face the axis."""
    r1, z1, s1 = el1
    rev([(r_bore, z_lip), (r1, z1)], "black", n)                          # seat lip round the front element
    rev(dome(r1, z1, s1), "glass_front", n)
    prof = [(r1, z1)]
    for r, zf_, zb in steps:
        if abs(prof[-1][1] - zf_) > 1e-6:
            prof.append((prof[-1][0], zf_))
        prof += [(r, zf_), (r, zb)]
    # r7 (round-3 review: no inner element edges): the bore's walls stay matt black, its ledges (the faces toward the
    # front, where each inner element / retaining ring sits) are polished edges that read as bright rings
    for a_, b_ in zip(prof, prof[1:]):
        ledge = abs(a_[1] - b_[1]) < 1e-6 and abs(a_[0] - b_[0]) > 1e-6
        rev([a_, b_], "element_edge" if ledge else "bore", n_in)
    rev(dome(*el2, fr=(1.0, 0.7, 0.38)), "glass_inner", n_in)
    rev(dome(*el3, fr=(1.0, 0.75, 0.42)), "coated_green", 48)


# ===================================================================================== lens: XF35mmF2 R WR (silver)
def build_lens():
    """XF35mmF2 R WR (silver), refs run 2: lens.lenses[0].profile_measured (official near-orthographic side render,
    diameters +-0.2 mm, z +-0.4 mm from the flange) and markings_measured. z is from the lens flange face, which seats
    on the body's bayonet front face (refs Z MOUNT_Z, r6: 17.75); r = dia / 2. Built as one outer profile (rear element
    -> flange -> barrel -> front rim -> filter thread -> name ring -> front element) so every face winds outward, split
    into the fixed barrel, the aperture ring and the focus ring (rig nodes lens, lens_aperture_ring, lens_focus_ring)."""
    zf = MOUNT_Z
    lens, ap, foc = Geo("lens"), Geo("lens_aperture_ring"), Geo("lens_focus_ring")
    N = 96                                       # r5: 112 -> 96 (0.016 mm chord error at r 29; D-021 budget)
    M = T(0, 35.0, zf)

    def rev(g, prof, mat, n=N, **kw):
        g.merge(revolve(prof, n, mat, **kw), M)

    # rear element, black rear housing, chrome bayonet (3 lugs), black mount ring, silver chamfer + fixed rear barrel
    rev(lens, [(0.0, -7.15), (5.0, -7.08), (9.0, -6.95), (12.0, -6.75)], "coated", 72)
    rev(lens, [(12.0, -6.75), (12.4, -6.95), (13.9, -6.95), (14.5, -6.5), (15.2, -5.6), (15.55, -4.7),
               (15.55, -4.4)], "black", 96)
    rev(lens, [(15.55, -4.4), (18.4, -4.4), (19.9, -4.25), (21.0, -4.0), (21.0, -1.0), (21.1, -0.9), (21.5, -0.9),
               (21.6, -0.8), (21.6, 0.0)], "chrome", 96)       # r4: plain chrome step (no dark wedges between lugs)
    # r4: no separate bayonet lugs: the official side render shows a plain chrome step (the lugs hide in the mount)
    rev(lens, [(21.6, 0.0), (27.6, 0.0), (28.05, 0.4), (28.05, 1.2)], "black")
    rev(lens, [(28.05, 1.2), (28.6, 1.35), (29.12, 1.9), (29.2, 2.3), (29.2, 8.3), (29.0, 8.5)], "lens")
    rev(lens, [(29.0, 8.5), (28.85, 8.6), (28.85, 9.3)], "lens")      # r7: a thin silver step (was a 0.8 mm black band)
    # aperture ring: chamfer, coarse knurl (124 flat-topped teeth, pitch 1.52), cone carrying the f-numbers
    # r4 (review): knurl z 9.4..16.6, flat-topped trapezoid teeth with deep valleys (was 10.45..16.55, shallow)
    rev(ap, [(28.85, 9.3), (29.25, 9.36)], "lens")
    ap.merge(gear_chamfered(29.25, 30.0, 124, 9.4, 16.6, 0.22, "lens_ridge", tip_frac=0.40, root_frac=0.20, cap=False),
             M)
    # r7 (round-3 review: a dashed black line along the top of the knurl): close the open tooth ends top and bottom
    rev(ap, [(29.0, 9.395), (29.78, 9.395)], "lens_ridge")
    rev(ap, [(29.78, 16.605), (29.0, 16.605)], "lens_ridge")
    AP_CONE = ((16.75, 29.6), (20.85, 27.75))
    rev(ap, [(29.25, 16.6), (29.6, 16.75), (27.75, 20.85), (27.3, 20.9)], "lens")
    # groove, fixed middle barrel (aperture index), cone down to the focus ring
    rev(lens, [(27.3, 20.9), (27.15, 20.95), (27.15, 21.2)], "rubber")      # r7: a thinner groove
    rev(lens, [(27.15, 21.2), (27.45, 21.35), (27.47, 25.3), (27.4, 25.5), (26.5, 27.45)], "lens")
    rev(lens, [(26.5, 27.45), (26.3, 27.5)], "rubber")
    # focus ring: fine knurl over its whole length (r4: z 27.8..37.0, review), 176 ridges, front cone
    rev(foc, [(26.3, 27.53), (26.55, 27.6), (26.55, 27.8)], "lens")
    foc.merge(gear_chamfered(26.55, 26.9, 176, 27.8, 37.0, 0.1, "lens_ridge", tip_frac=0.30, root_frac=0.14, cap=False),
              M)
    rev(foc, [(26.55, 37.0), (26.6, 37.1), (25.0, 38.65), (24.8, 38.7)], "lens")
    # front: step, fixed ring, groove, hood-bayonet base + 3 tabs, front rim, filter thread, name ring, front element
    rev(lens, [(24.8, 38.7), (24.45, 38.75), (24.45, 39.45), (25.0, 39.5), (25.0, 40.85), (24.7, 40.95), (23.9, 41.0),
               (23.9, 41.45), (23.15, 41.5), (23.15, 43.85), (23.1, 43.9), (23.1, 45.65), (22.85, 45.9), (21.75, 45.9),
               (21.55, 45.75)], "lens")
    thread = [(21.55, 45.75)]
    for k in range(3):                                                 # 43 mm filter thread: shallow V rings
        z = 45.4 - k * 0.55                                            # r7: 3 rings at 72 steps (D-021 budget)
        thread += [(21.38, z), (21.55, z - 0.27)]
    thread += [(21.55, 43.6)]
    rev(lens, thread, "lens", 72)
    # r7 (round-3 review: the black version's black name ring with white legends): the silver lens's name-ring bevel
    # is satin lens silver (lens_name, r 18.4..21.4), then a black, finely ribbed baffle cone ~3 mm deep (8 ribs),
    # then the front element, recessed below the baffle's top (glz_xf35f2_silver_01)
    rev(lens, [(21.55, 43.6), (21.4, 43.55), (18.4, 42.8)], "lens_name")
    baffle = [(18.4, 42.8), (18.15, 42.7)]
    for k in range(8):
        r_, z_ = 18.15 - 0.49 * k, 42.7 - 0.39 * k
        baffle += [(r_, z_ - 0.3), (r_ - 0.2, z_ - 0.36)]
    baffle += [(14.25, 39.6), (13.9, 39.5)]
    rev(lens, baffle, "bore", 64)
    # r5: convex front element seen through to a concave magenta-coated second element and a deep green-coated
    # third, inside smooth black retaining rings (no refraction, no faceted intersections); r7: recessed (sag 2.0,
    # apex 41.4 under the baffle top 42.7), polished element edges on the bore ledges
    glass = Geo("lens_glass")             # r5: the front optics are their own child mesh (light-linked glints)
    front_optics(lambda p_, m_, n_: rev(glass, p_, m_, n_), 13.9, 39.5, (13.6, 39.4, 2.0),
                 [(11.7, 37.0, 34.4), (10.2, 34.4, 32.2)], (11.7, 36.7, -1.8), (10.2, 32.6, 1.2))
    for a0, w in ((10.0, 40.0), (170.0, 40.0), (270.0, 48.0)):        # hood-bayonet tabs (z 42.7..43.9, dia 49)
        rev(lens, [(23.15, 42.7), (24.35, 42.75), (24.5, 42.9), (24.5, 43.75), (24.35, 43.9), (23.15, 43.9)], "lens",
            16, arc=math.radians(w), a0=math.radians(a0 - w / 2))
        for a in (a0 - w / 2, a0 + w / 2):
            ca, sa = math.cos(math.radians(a)), math.sin(math.radians(a))
            lens.merge(rbox(1.35, 0.05, 1.2, mat="lens"), M @ T(23.83 * ca, 23.83 * sa, 43.3) @ R("Z", a))
        ca, sa = math.cos(math.radians(a0 + w / 2 - 4)), math.sin(math.radians(a0 + w / 2 - 4))
        lens.merge(rbox(0.7, 0.9, 0.5, r=0.1, segs=1, mat="lens"), M @ T(24.55 * ca, 24.55 * sa, 43.6) @
                   R("Z", a0 + w / 2 - 4 - 90))                        # the small square stop on each tab

    def put(g, t, r_of_z, z_c, ang_deg, shear=0.0, lift=LIFT):
        """Wrap flat text (local u along the circumference, v along +z) on the barrel at angle ang (from +X toward
        +Y), reading toward increasing angle (left to right seen from above the lens with its front up, as in the
        official side render); r_of_z gives the surface radius (cones)."""
        a0 = math.radians(ang_deg)
        rr0 = r_of_z(z_c)
        vv = []
        for (u, v, w) in t.v:
            u = u + v * shear
            z = z_c + v
            rr = r_of_z(z) + lift
            a = a0 + u / rr0
            vv.append((rr * math.cos(a), 35.0 + rr * math.sin(a), zf + z))
        tt = Geo("w")
        tt.v = vv
        tt.f, tt.m, tt.s, tt.uv = t.f, t.m, t.s, t.uv
        g.merge(tt)

    def cyl_r(r):
        return lambda z: r

    def cone_r(z):
        (z0, r0), (z1, r1) = AP_CONE
        return r0 + (r1 - r0) * (z - z0) / (z1 - z0)

    # markings (refs markings_measured): '35' and the red index at 12 o'clock on the rear barrel, f-numbers on the
    # aperture cone (5.6 at the index, ~14 deg apart, oblique numerals, A in red), index lines, far-side legends
    put(lens, text_geo("35", 2.4 / CAPF(FONT_LENS), "lettering", FONT_LENS), cyl_r(29.2), 5.6, 90.0)
    lens.merge(rbox(1.95, 1.35, 0.05, mat="accent"), M @ T(0, 29.22, 2.72) @ R("X", -90))
    for k, s_ in enumerate(["2", "2.8", "4", "5.6", "8", "11", "16", "A"]):
        put(ap, text_geo(s_, 1.8 / CAPF(FONT_LENS_B), "accent" if s_ == "A" else "lettering", FONT_LENS_B), cone_r, 18.9,
            90.0 - 14.0 * (k - 3), shear=0.2)
    lens.merge(rbox(0.3, 0.05, 2.5, mat="lettering"), M @ T(0, 27.47 + 0.03, 22.85))
    lens.merge(rbox(0.5, 0.05, 1.8, mat="lettering"), M @ T(0, 23.13, 44.75))
    put(lens, text_geo("WEATHER RESISTANT", 1.15 / CAPF(FONT_UI_R), "lettering", FONT_UI_R, spacing=1.1), cyl_r(27.47),
        23.5, 270.0)
    put(lens, text_geo("MADE IN JAPAN", 1.1 / CAPF(FONT_UI_R), "lettering", FONT_UI_R, spacing=1.1), cyl_r(29.2),
        5.4, 262.0)
    put(lens, text_geo("CE", 1.6 / CAPF(FONT_UI_R), "lettering", FONT_UI_R), cyl_r(29.2), 5.4, 283.0)

    def front_ring_text(gg, pieces, cap, r, a_mid, font=FONT_UI_R, gap=0.55):
        """Markings on the conical name ring (r 15.0..21.4, z 41.95..43.55), running clockwise as seen from the
        front with letter tops outward (Fujinon style), centred on a_mid (deg). pieces: [(text, mat)] end to end."""
        geos = []
        for txt, mat in pieces:
            t = text_geo(txt, cap / CAPF(font), mat, font, spacing=1.12, align_x="LEFT")
            us = [p[0] for p in t.v]
            geos.append((t, min(us) if us else 0.0, (max(us) - min(us)) if us else 0.0))
        total = sum(w for _, _, w in geos) + gap * (len(geos) - 1)
        a = math.radians(a_mid) + 0.5 * total / r
        for t, u0, w in geos:
            us = [p[0] for p in t.v]
            vv = []
            for (u, v, w_) in t.v:
                aa, rr = a - (u - u0) / r, r + v
                zz = 42.8 + (rr - 18.4) * 0.25 + LIFT          # r7: the silver name ring (r 18.4..21.4)
                vv.append((rr * math.cos(aa), 35.0 + rr * math.sin(aa), zf + zz))
            tt = Geo("ft")
            tt.v = vv
            tt.f, tt.m, tt.s, tt.uv = t.f, t.m, t.s, t.uv
            gg.merge(tt)
            a -= (w + gap) / r
    front_ring_text(lens, [("FUJINON ASPHERICAL LENS", "lens_legend")], 1.1, 19.9, 90.0)   # r7: dark grey on silver
    front_ring_text(lens, [("SUPER EBC", "lens_legend"), ("XF", "accent"), ("35mm 1:2 R WR ø43", "lens_legend")], 1.1, 19.9,
                    270.0)
    return {"lens": (lens, (0.0, 35.0, zf), None),
            "lens_glass": (glass, (0.0, 35.0, zf), "lens"),
            "lens_aperture_ring": (ap, (0.0, 35.0, zf), "lens"),
            "lens_focus_ring": (foc, (0.0, 35.0, zf), "lens")}


# ===================================================================================== kit lens: XF16-50mmF2.8-4.8 R LM WR
def build_kit1650():
    """XF16-50mmF2.8-4.8 R LM WR (black, the current X-T5 kit lens) from refs lens.lenses[2].profile_measured (official
    near-orthographic side render, 21 px/mm; segment ends +-0.5 mm). Not the hero lens: a separate root node
    'kit_xf1650', hidden by default, so the 3/4 front view can be compared with the official kit render
    (refs/raw/glz_kit1650_silver_02.png). Zoom at 16 mm (barrel retracted), ribbed rubber zoom and focus rings."""
    zf = MOUNT_Z
    g = Geo("kit_xf1650")
    N = 96
    M = T(0, 35.0, zf)

    def rev(prof, mat, n=N, **kw):
        g.merge(revolve(prof, n, mat, **kw), M)
    rev([(0.0, -6.9), (8.0, -6.8), (13.0, -6.6)], "coated", 48)
    rev([(13.0, -6.6), (15.4, -6.6), (15.6, -4.0)], "black", 64)
    rev([(15.6, -4.0), (18.3, -3.9), (20.2, -3.6), (20.2, -0.3), (21.6, -0.2), (21.6, 0.0)], "chrome", 64)
    for a0, w in ((90.0, 54.0), (210.0, 40.0), (330.0, 44.0)):
        rev([(20.1, -3.7), (21.1, -3.7), (21.1, -2.2), (20.1, -2.2)], "chrome", 12, arc=math.radians(w),
            a0=math.radians(a0 - w / 2))
    rev([(21.6, 0.0), (27.6, 0.0), (28.05, 0.4), (28.05, 1.3), (28.95, 1.8), (30.5, 6.3), (30.7, 6.4),
         (31.9, 17.6), (31.6, 17.8)], "black")
    ap = gear_chamfered(31.95, 32.2, 120, 17.85, 24.65, 0.2, "black", tip_frac=0.4, root_frac=0.3, cap=False)
    g.merge(ap, M)
    rev([(31.95, 24.65), (31.75, 24.7), (31.75, 26.7), (31.85, 26.75), (31.85, 33.95), (32.0, 34.0)], "black")
    # r7 (round-3 review: the zoom ring read smooth and near black, rib contrast 6-9 vs 15-20): strongly ribbed rubber,
    # ~1 mm pitch, 0.45 mm deep, rounded crests, in a lighter, rougher rubber that catches light on every rib
    g.merge(ribbed_band(31.85, 0.45, 200, 34.0, 52.0, 0.3, "kit_rubber"), M)
    rev([(31.9, 52.0), (31.65, 52.1), (31.65, 53.4), (32.1, 53.5)], "black")
    g.merge(gear_chamfered(32.1, 32.5, 179, 53.5, 63.0, 0.3, "kit_rubber", tip_frac=0.5, root_frac=0.25, cap=False), M)
    rev([(32.1, 63.0), (31.8, 63.1), (31.8, 66.9), (31.2, 67.0), (30.45, 67.1), (30.45, 68.5), (31.8, 68.6),
         (31.8, 69.5), (30.45, 69.6), (30.45, 71.2), (30.2, 71.4), (29.1, 71.4), (29.0, 70.9), (29.0, 69.6)], "black")
    rev([(29.0, 69.6), (28.8, 69.4), (21.0, 66.9), (20.4, 66.6), (19.6, 64.0), (19.0, 63.6)], "black")
    # r5: the big, strongly convex front element (sag 4.4, kit 3/4 reference) over a concave second element and a
    # deep third, in stepped black rings
    glass = Geo("kit_xf1650_glass")

    def rev_glass(prof, mat, n=N, **kw):
        glass.merge(revolve(prof, n, mat, **kw), M)
    front_optics(rev_glass, 19.0, 63.6, (18.8, 63.4, 4.4), [(16.6, 60.6, 56.8), (13.2, 56.8, 51.6)], (16.6, 60.2, -2.8),
                 (13.2, 53.0, 1.6))

    def put(t, r, z_c, ang_deg, lift=LIFT):
        a0 = math.radians(ang_deg)
        vv = [((r + lift) * math.cos(a0 + u / r), 35.0 + (r + lift) * math.sin(a0 + u / r), zf + z_c + v)
              for (u, v, w) in t.v]
        tt = Geo("w")
        tt.v = vv
        tt.f, tt.m, tt.s, tt.uv = t.f, t.m, t.s, t.uv
        g.merge(tt)
    # zoom scale (white) on the band in front of the aperture ring, index line, orange mount index, '16-50', XF badge
    for k, s_ in enumerate(("16", "23", "35", "50")):
        put(text_geo(s_, 1.6 / CAPF(FONT_LENS), "paint", FONT_LENS), 31.85, 30.4, 90.0 - 13.0 * k)
    g.merge(rbox(0.3, 0.05, 1.6, mat="paint"), M @ T(0, 31.77, 25.7))
    g.merge(rbox(1.6, 0.05, 1.0, mat="accent"), M @ T(0, 31.02, 9.2))
    put(text_geo("16-50", 1.8 / CAPF(FONT_LENS), "paint", FONT_LENS), 31.3, 12.0, 90.0)
    put(text_geo("XF", 2.2 / CAPF(FONT_UI), "paint", FONT_UI), 31.5, 13.5, 35.0)
    put(text_geo("ZOOM", 0.9 / CAPF(FONT_UI), "paint", FONT_UI), 31.5, 11.6, 35.0)
    # aperture A / manual switch on the rear barrel (+X side, about 20 deg below the badge)
    sw = M @ T(31.2 * math.cos(math.radians(15)), 31.2 * math.sin(math.radians(15)), 12.5) @ R("Z", 15.0)
    g.merge(rbox(1.6, 2.4, 5.0, r=0.4, segs=1, mat="black"), sw)

    def front_ring_text(pieces, cap, r, a_mid, font=FONT_UI_R, gap=0.6):
        geos = []
        for txt, mat in pieces:
            t = text_geo(txt, cap / CAPF(font), mat, font, spacing=1.12, align_x="LEFT")
            us = [p[0] for p in t.v]
            geos.append((t, min(us) if us else 0.0, (max(us) - min(us)) if us else 0.0))
        total = sum(w for _, _, w in geos) + gap * (len(geos) - 1)
        a = math.radians(a_mid) + 0.5 * total / r
        for t, u0, w in geos:
            vv = []
            for (u, v, w_) in t.v:
                aa, rr = a - (u - u0) / r, r + v
                zz = 66.9 + (rr - 21.0) * (2.7 / 8.0) + LIFT
                vv.append((rr * math.cos(aa), 35.0 + rr * math.sin(aa), zf + zz))
            tt = Geo("ft")
            tt.v = vv
            tt.f, tt.m, tt.s, tt.uv = t.f, t.m, t.s, t.uv
            g.merge(tt)
            a -= (w + gap) / r
    # r7 (round-3 review: the legends were ~60% of the reference letter height over a shorter arc): x1.6
    front_ring_text([("FUJINON ASPHERICAL LENS", "paint")], 2.55, 24.7, 110.0, gap=0.9)
    front_ring_text([("SUPER EBC", "paint"), ("XF", "accent"), ("16-50mm 1:2.8-4.8 R LM WR ø58", "paint")], 2.15,
                    24.7, 300.0, gap=0.9)
    return g, glass, (0.0, 35.0, zf)


def ribbed_band(r_root, depth, ribs, z0, z1, ch, mat, K=6):
    """r7: axial ribs with rounded crests round local +Z (zoom-ring rubber): per rib K samples of a bump (flat floor
    ~30% of the pitch, steep flanks, a rounded crest), chamfered ends (ch), open ends (the neighbouring profiles close
    them), smooth-shaded so the crests read round."""
    if not xt5lib.LODQ["gear"]:                 # m2 LOD1: a plain band
        return revolve([(r_root + depth * 0.5, z0), (r_root + depth * 0.5, z1)], max(48, ribs), mat)
    pts = []
    for i in range(ribs):
        for k in range(K):
            t = k / K
            a = TAU * (i + t) / ribs
            s = 0.0 if t < 0.15 or t > 0.85 else math.sin(math.pi * (t - 0.15) / 0.7) ** 0.5
            pts.append((r_root + depth * s, a))

    def ring(sh):
        return [((rr - sh) * math.cos(a), (rr - sh) * math.sin(a)) for rr, a in pts]
    lv = [(z0, ring(ch)), (z0 + ch, ring(0.0)), (z1 - ch, ring(0.0)), (z1, ring(ch))]
    return loft(lv, mat, cap_bottom=False, cap_top=False, smooth=True, axis="Z")


# ===================================================================================== assembly
def assemble(mats, coll, with_kit=False, with_logos=False):
    """Builds the body and every rig node of the X-T5 into coll (the modeller's round-4 main(), minus the file I/O).

    m2 changes for the site (build_camera.py): the meshed logos stay out of the body unless with_logos (the
    lettering is the decal nodes mark_fujifilm / mark_xt5, D-011, W-D019); the strap lugs are their own node 'lugs'
    (the official 129.5 mm width excludes them, so the bounding-box gate leaves them out); the XF16-50 kit lens is
    built only with with_kit (a swap / comparison asset outside the LOD0 budget).
    Returns (objs, empties, per_part): mesh objects and pivot empties by name, authored triangles per part."""
    parts = {}
    throat = cyl(21.15, 3.2, 16.5, 96, "rubber", smooth=True).transformed(T(0, 35.0, 0))
    parts["shell_chassis"] = chassis_leather_uv(boolean(build_chassis(), [throat]))
    # r6 (review: the deck read 40-45 levels too bright): the 31-degree strip at the top chamfer's inner edge was
    # smooth-shaded into the flat deck n-gon, tilting the whole deck's normals up to ~15 deg toward the edges (so it
    # caught the bright walls); crease above 25 deg so the deck shades flat
    parts["shell_top_plate"] = boolean(build_top_plate(), [build_slot_cutter()] + build_rear_slot_cutters()).set_sharp(25.0)
    parts["shell_hump"] = boolean(build_hump(), [shoe_pocket_cutter(), shoe_notch_cutter()]).set_sharp(14.0)   # r4: crisp band crease
    parts["mount"] = build_mount(Geo("mount"))
    parts["front_controls"] = build_front_controls(Geo("front"))
    if with_logos:
        parts["logos"] = build_logos(Geo("logos"))
    parts["side_panels"] = build_side_panels(Geo("sides"))
    parts["bottom"] = build_bottom(Geo("bottom"))
    parts["rear"] = build_rear(Geo("rear"))
    parts["top_buttons"] = build_rear_slot_trim(build_top_buttons(Geo("topbtn")))
    parts["hump_details"] = build_hump_details(Geo("humpd"))
    parts["dial_bases"] = build_dial_bases(Geo("bases"))
    body = Geo("body")
    per_part = {}
    for k, gpart in parts.items():
        per_part["body/" + k] = gpart.tris()
        body.merge(gpart)
    objs = {"body": body.finish(mats, (0, 0, 0), coll)}
    lugs = build_lugs(Geo("lugs"))
    per_part["lugs"] = lugs.tris()
    objs["lugs"] = lugs.finish(mats, (0, 0, 0), coll)

    # ---------------- moving parts with pivots (W-D019 rig names kept: dial_look = the ISO dial position)
    nodes = {}
    g, piv = build_iso_dial(); nodes["dial_look"] = (g, piv, None)
    g, piv = build_shutter_dial(); nodes["dial_shutter"] = (g, piv, None)
    g, piv = build_ev_dial(); nodes["dial_ev"] = (g, piv, None)
    # r7 (round-3 review: legends too widely spaced, S ~11 deg off the rear index): 20 deg apart (condensed), S on the index
    drive_leg = [("[pano]", 8.0, "lettering", 1.6), ("ADV.", 348.0, "lettering", 1.75), ("BKT", 328.0, "lettering", 1.75),
                 ("CH", 308.0, "lettering", 1.75), ("CL", 288.0, "lettering", 1.75), ("S", 268.0, "lettering", 1.75),
                 ("HDR", 248.0, "lettering", 1.75)]
    g, piv = build_ring("ring_drive", cm("drive_dial"), drive_leg, [], 90.0, 12.5 - cm("drive_dial")["pos"]["z"],
                        (73.8, 77.9)); nodes["ring_drive"] = (g, piv, None)
    sm_leg = [("STILL", 296.0, "lettering", 1.7), ("MOVIE", 236.0, "lettering", 1.7)]
    g, piv = build_ring("ring_still_movie", cm("still_movie_dial"), sm_leg, [(283.0, "lettering"), (259.0, "accent")],
                        math.degrees(math.atan2(12.3 - (-2.3), -28.6 - (-33.6))), math.hypot(14.6, 5.0) - 0.3,
                        (74.4, 77.9))
    nodes["ring_still_movie"] = (g, piv, None)
    g, piv = build_shutter_button(); nodes["shutter_button"] = (g, piv, None)
    g, piv = build_power_switch(); nodes["switch_power"] = (g, piv, None)
    g, piv = build_command_dial("dial_cmd_front", cm("front_command_dial"), "satin_collar", yr=CMD_Y, teeth_pitch=1.75, depth=0.8, root_mat="black", tip_frac=0.45, root_frac=0.35); nodes["dial_cmd_front"] = (g, piv, None)
    g, piv = build_command_dial("dial_cmd_rear", cm("rear_command_dial"), "dial_rear", root_mat="black",
                                teeth_pitch=REAR_DIAL["teeth_pitch"], depth=REAR_DIAL["depth"], dia=REAR_DIAL["dia"],
                                yr=REAR_DIAL["y"], zc=REAR_DIAL["rim_z"] + REAR_DIAL["dia"] / 2, tip_frac=0.48, root_frac=0.36)
    nodes["dial_cmd_rear"] = (g, piv, None)
    nodes.update(build_lcd())
    g, piv = build_shoe_cover(); nodes["hot_shoe_cover"] = (g, piv, None)
    saved = xt5lib.LODQ["rev"]                 # m2: the lens is the hero's biggest round silhouette; LOD1 may give
    xt5lib.LODQ["rev"] = xt5lib.LODQ.get("rev_lens", saved)      # it more revolve steps than the body
    try:
        nodes.update(build_lens())
    finally:
        xt5lib.LODQ["rev"] = saved
    if with_kit:
        g, gg, piv = build_kit1650()
        nodes["kit_xf1650"] = (g, piv, None)
        nodes["kit_xf1650_glass"] = (gg, piv, "kit_xf1650")

    empties = {}
    for name, (g, piv, parent) in nodes.items():
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.005
        e.location = (TO_BLENDER @ Vector(piv)) * MM
        coll.objects.link(e)
        empties[name] = e
        for k, v in RIG_META.get(name, {}).items():
            e["rig_" + k] = v
        if g is None or not g.f:
            continue
        per_part[name] = g.tris()
        ob = g.transformed(Matrix.Identity(4))
        ob.name = name + "_mesh"
        mo = ob.finish(mats, piv, coll)
        mo.parent = e
        mo.location = (0, 0, 0)
        objs[name + "_mesh"] = mo
    world = {n: e.location.copy() for n, e in empties.items()}      # pivots are unrotated: offsets suffice
    for name, (g, piv, parent) in nodes.items():
        if parent and name in empties:
            c, pa = empties[name], empties[parent]
            c.parent = pa
            c.location = world[name] - world[parent]
    # markers (rig API): lens mount, strap anchors at the eyelet centres, print exit (site's instant-print beat)
    for name, loc in (("lens_mount", (0.0, 35.0, MOUNT_Z)), ("strap_left", STRAP["strap_left"]),
                      ("strap_right", STRAP["strap_right"]), ("print_exit", (36.0, Y_TOP + 0.4, -16.0))):
        e = bpy.data.objects.new(name, None)
        e.empty_display_size = 0.004
        e.location = (TO_BLENDER @ Vector(loc)) * MM
        coll.objects.link(e)
        empties[name] = e
    return objs, empties, per_part
