"""r6 leatherette textures for the X-T5 (Blender 5.0 / numpy), hand-authored procedurally (no scans, D-015).

Round-2 review: the grain read as rounded 'popcorn' pebbles / matte Voronoi cells with outline cracks, half the
reference contrast, grey crevices, no glints. The official renders (refs/closeups, *_silver2k) show flat-topped,
irregular, polygonal islands 0.8-1.5 mm across (wider than tall on the side panels), separated by sharp, deep,
near-black crevices; the islands are satin to glossy and their upper bevels catch the top light.

leather_set() writes three tileable maps on the 24 mm box-UV tile (refs mm / 24) for one grain variant:
  <name>_n.png   tangent-space normal (non-colour), from a height field in mm
  <name>_c.png   RGB base colour (sRGB, crevices near black), A = Specular IOR Level (0 in the crevices)
  <name>_r.png   G = roughness (glTF metallicRoughness layout: R 1, G roughness, B metal 0)
and returns the three images. The material wiring is plain image -> socket links, so the glTF exporter writes them
as baseColorTexture, metallicRoughnessTexture, normalTexture and KHR_materials_specular's specularTexture (A).
"""
import os

import bpy
import numpy as np


def _srgb_to_lin(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _hex(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)])


def _pnoise(n, f0, seed, bw=0.5):
    """Periodic band-limited noise (unit peak) on an n x n grid, centre frequency f0 in cycles per pixel."""
    F = np.fft.fft2(np.random.default_rng(seed).standard_normal((n, n)))
    fy = np.fft.fftfreq(n)[:, None]
    fx = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx ** 2 + fy ** 2)
    x = np.real(np.fft.ifft2(F * np.exp(-((f - f0) ** 2) / (2 * (f0 * bw) ** 2))))
    return x / np.abs(x).max()


def _ss(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def grain_height(n=1024, tile=24.0, cell=1.05, stretch=1.35, jitter=0.85, warp=0.06, crev=0.045, bevel=0.10,
                 depth=0.15, dome=0.035, tilt=0.07, micro=0.006, seed=11):
    """Height (mm) and cavity (0 crevice .. 1 island top) of a polygonal island grain.

    cell: island height (mm, along v); stretch: width / height (along u); jitter: seed scatter inside its cell (0..1);
    warp: domain warp (mm) that makes the island edges irregular; crev: crevice half width (mm); bevel: width of the
    island's edge bevel (mm); depth: crevice depth (mm); dome: crown rise of each island (mm); tilt: random slope of
    each island top (mm per mm); micro: fine surface noise (mm)."""
    rng = np.random.default_rng(seed)
    gv = max(4, int(round(tile / cell)))
    gu = max(4, int(round(tile / (cell * stretch))))
    su, sv = tile / gu, tile / gv
    jit = rng.uniform(0.5 - jitter / 2, 0.5 + jitter / 2, (gv, gu, 2))
    tl = rng.normal(0.0, tilt, (gv, gu, 2))
    hv = rng.uniform(0.85, 1.0, (gv, gu))
    px = tile / n
    c = (np.arange(n) + 0.5) * px
    U, V = np.meshgrid(c, c)                                   # U along columns (u), V along rows (v), mm
    U = U + warp * _pnoise(n, 1.0 / (0.55 / px), seed + 1)
    V = V + warp * _pnoise(n, 1.0 / (0.55 / px), seed + 2)
    ci = np.floor(U / su).astype(int)
    cj = np.floor(V / sv).astype(int)
    big = 1e9
    F1 = np.full(U.shape, big)
    F2 = np.full(U.shape, big)
    s1 = np.zeros(U.shape + (2,))
    s2 = np.zeros(U.shape + (2,))
    id1 = np.zeros(U.shape + (2,), int)
    for dj in (-2, -1, 0, 1, 2):
        for di in (-1, 0, 1):
            ni, nj = (ci + di) % gu, (cj + dj) % gv
            sx = (ci + di + jit[nj, ni, 0]) * su
            sy = (cj + dj + jit[nj, ni, 1]) * sv
            d = (U - sx) ** 2 + (V - sy) ** 2
            p = np.stack([sx, sy], -1)
            c1 = d < F1
            c2 = (~c1) & (d < F2)
            F2 = np.where(c1, F1, np.where(c2, d, F2))
            s2 = np.where(c1[..., None], s1, np.where(c2[..., None], p, s2))
            F1 = np.where(c1, d, F1)
            s1 = np.where(c1[..., None], p, s1)
            id1 = np.where(c1[..., None], np.stack([nj, ni], -1), id1)
    sep = np.linalg.norm(s2 - s1, axis=-1)
    e = (F2 - F1) / (2.0 * np.maximum(sep, 1e-6))             # true distance to the shared Voronoi edge (mm)
    # island edge: a cliff out of the crevice that rolls over into the flat top (quadratic shoulder), so the edge
    # carries every tilt from ~60 deg down to 0 and catches the top light somewhere along it
    t_ = np.clip((e - crev) / bevel, 0.0, 1.0)
    top = 1.0 - (1.0 - t_) ** 2
    r_i = 0.5 * np.minimum(su, sv)
    crown = np.clip(1.0 - np.sqrt(F1) / (1.6 * r_i), 0.0, 1.0)
    t = tl[id1[..., 0], id1[..., 1]]
    slope = t[..., 0] * (U - s1[..., 0]) + t[..., 1] * (V - s1[..., 1])
    h = top * (depth * hv[id1[..., 0], id1[..., 1]] + dome * crown + slope)
    h = h + micro * _pnoise(n, 1.0 / (0.12 / px), seed + 3) * (0.3 + 0.7 * top)
    cav = _ss(crev * 0.5, crev + 0.25 * bevel, e)
    rim = cav * (1.0 - _ss(0.45, 1.0, t_))                     # the shoulder band round each island
    return h, cav, rim, id1, px


def leather_set(texdir, name, n=1024, col_top="#1e1e1f", col_crev="#030303", rough_top=0.40, rough_crev=0.85,
                spec_top=0.35, spec_crev=0.0, spec_rim=None, rough_rim=None, nscale=1.0, **grain):
    """spec_rim / rough_rim: specular level and roughness on the island shoulders (the worn, glossier edges that
    give the reference its bright rims); default = the top values."""
    h, cav, rim, id1, px = grain_height(n=n, **grain)
    spec_rim = spec_top if spec_rim is None else spec_rim
    rough_rim = rough_top if rough_rim is None else rough_rim
    rng = np.random.default_rng(grain.get("seed", 11) + 7)
    gv, gu = id1[..., 0].max() + 1, id1[..., 1].max() + 1
    var = rng.uniform(-1.0, 1.0, (gv, gu))[id1[..., 0], id1[..., 1]]       # per-island finish variation
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * px)
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * px)
    nx, ny, nz = -dx * nscale, -dy * nscale, np.ones_like(h)
    ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    nrm = np.stack([0.5 + 0.5 * nx / ln, 0.5 + 0.5 * ny / ln, 0.5 + 0.5 * nz / ln, np.ones_like(h)], -1)
    ct, cc = _hex(col_top), _hex(col_crev)
    lt = _srgb_to_lin(ct) * (1.0 + 0.12 * var[..., None])
    col_lin = _srgb_to_lin(cc) + (lt - _srgb_to_lin(cc)) * cav[..., None]
    col = np.where(col_lin <= 0.0031308, col_lin * 12.92, 1.055 * np.power(np.maximum(col_lin, 1e-9), 1 / 2.4) - 0.055)
    s_t = spec_top * (1.0 + 0.15 * var) + (spec_rim - spec_top) * (rim / np.maximum(cav, 1e-6))
    spec = spec_crev + (s_t - spec_crev) * cav
    crgba = np.concatenate([col, spec[..., None]], -1)
    r_t = rough_top * (1.0 + 0.10 * var) + (rough_rim - rough_top) * (rim / np.maximum(cav, 1e-6))
    rough = rough_crev + (r_t - rough_crev) * cav
    rrgba = np.stack([np.ones_like(h), rough, np.zeros_like(h), np.ones_like(h)], -1)
    os.makedirs(texdir, exist_ok=True)
    out = []
    for suf, arr, cs, alpha in (("n", nrm, "Non-Color", False), ("c", crgba, "sRGB", True), ("r", rrgba, "Non-Color", False)):
        nm = f"{name}_{suf}"
        old = bpy.data.images.get(nm)
        if old is not None:
            bpy.data.images.remove(old)
        img = bpy.data.images.new(nm, n, n, alpha=alpha)
        if alpha:
            img.alpha_mode = "CHANNEL_PACKED"
        img.colorspace_settings.name = cs
        img.pixels.foreach_set(np.clip(arr, 0.0, 1.0).astype(np.float32).ravel())
        img.filepath_raw = os.path.join(texdir, nm + ".png")
        img.file_format = "PNG"
        img.save()
        img.pack()
        out.append(img)
    return out


def _save(texdir, nm, arr, cs, alpha):
    old = bpy.data.images.get(nm)
    if old is not None:
        bpy.data.images.remove(old)
    H, W = arr.shape[:2]
    img = bpy.data.images.new(nm, W, H, alpha=alpha)
    if alpha:
        img.alpha_mode = "CHANNEL_PACKED"
    img.colorspace_settings.name = cs
    img.pixels.foreach_set(np.clip(arr, 0.0, 1.0).astype(np.float32).ravel())
    img.filepath_raw = os.path.join(texdir, nm + ".png")
    img.file_format = "PNG"
    img.save()
    img.pack()
    return img


def pebble_set(texdir, name, W, H, px, size_fn, depth_fn, wrap_u=True, seed=11, elong=1.4, fill=1.3,
               col_top="#2b2b2c", col_val="#121212", rough_top=0.46, rough_val=0.72, spec_top=0.5, spec_val=0.25,
               var=0.10, nscale=1.0, cdiv=1, prof=(2.6, 0.55), cav_k=0.5):
    """r7 (round-3 review): rounded blob pebbles (pebbles.pebble_field) instead of the r6 polygonal islands; no glossy
    rim network: the finish varies only between pebble tops and the soft valleys (cavity), plus a +-var per pebble.
    W x H px at px mm/px; size_fn / depth_fn of u (mm) let one strip cross-fade from the body grain to the grip grain.
    cdiv: the colour / roughness maps at 1/cdiv of the normal map's resolution (the cavity tone is lower frequency)."""
    import json as _json
    import pebbles
    key = _json.dumps(dict(W=W, H=H, px=px, size=[round(size_fn(u), 5) for u in np.linspace(0, W * px, 97)],
                           depth=[round(depth_fn(u), 5) for u in np.linspace(0, W * px, 97)], wrap_u=wrap_u,
                           seed=seed, elong=elong, fill=fill, col_top=col_top, col_val=col_val, rough_top=rough_top,
                           rough_val=rough_val, spec_top=spec_top, spec_val=spec_val, var=var, nscale=nscale,
                           cdiv=cdiv, prof=list(prof), cav_k=cav_k, v=3), sort_keys=True)
    kf = os.path.join(texdir, f"{name}.key.json")
    files = [os.path.join(texdir, f"{name}_{s}.png") for s in ("n", "c", "r")]
    if os.path.exists(kf) and open(kf).read() == key and all(os.path.exists(f) for f in files):
        out = []                                        # cached: same parameters, maps already on disk
        for f, cs, alpha in zip(files, ("Non-Color", "sRGB", "Non-Color"), (False, True, False)):
            nm = os.path.splitext(os.path.basename(f))[0]
            old = bpy.data.images.get(nm)
            if old is not None:
                bpy.data.images.remove(old)
            img = bpy.data.images.load(f)
            img.name = nm
            img.colorspace_settings.name = cs
            if alpha:
                img.alpha_mode = "CHANNEL_PACKED"
            img.pack()
            out.append(img)
        print("PEBBLES cached", name)
        return out
    h, top, pid, k = pebbles.pebble_field(W, H, px, size_fn, seed=seed, elong=elong, wrap_u=wrap_u,
                                          depth_fn=depth_fn, fill=fill, prof=tuple(prof))
    nrm = pebbles.normal_rgba(h, px, nscale)
    rng = np.random.default_rng(seed + 7)
    pv = rng.uniform(-1.0, 1.0, k + 1)[np.where(pid >= 0, pid, k)]
    # cavity from the height (0 valley floor .. 1 above half the local pebble height): the creases where merged
    # pebbles meet stay light, only the real valleys between pebbles darken (soft, not a crack network)
    dcol = np.array([depth_fn((i + 0.5) * px) for i in range(W)], np.float32)[None, :]
    cav = np.clip(h / (cav_k * dcol), 0.0, 1.0) ** 0.7
    if cdiv > 1:
        cav = cav.reshape(H // cdiv, cdiv, W // cdiv, cdiv).mean(axis=(1, 3))
        pv = pv.reshape(H // cdiv, cdiv, W // cdiv, cdiv).mean(axis=(1, 3))
    ct, cv = _srgb_to_lin(_hex(col_top)), _srgb_to_lin(_hex(col_val))
    lt = ct * (1.0 + var * pv[..., None])
    col_lin = cv + (lt - cv) * cav[..., None]
    col = np.where(col_lin <= 0.0031308, col_lin * 12.92, 1.055 * np.power(np.maximum(col_lin, 1e-9), 1 / 2.4) - 0.055)
    spec = spec_val + (spec_top * (1.0 + 0.5 * var * pv) - spec_val) * cav
    rough = rough_val + (rough_top * (1.0 - 0.5 * var * pv) - rough_val) * cav
    os.makedirs(texdir, exist_ok=True)
    one = np.ones_like(rough)
    out = [_save(texdir, f"{name}_n", nrm, "Non-Color", False),
           _save(texdir, f"{name}_c", np.concatenate([col, spec[..., None]], -1), "sRGB", True),
           _save(texdir, f"{name}_r", np.stack([one, rough, np.zeros_like(rough), one], -1), "Non-Color", False)]
    open(kf, "w").write(key)
    print("PEBBLES", name, k, "pebbles", f"{W}x{H}")
    return out


def leather_material(m, imgs, nstrength=1.0, coat=0.0, ior=1.5):
    """Rewire a Principled material to a leather_set(): colour + specular (A), roughness (G), normal."""
    nt = m.node_tree
    b = next(n_ for n_ in nt.nodes if n_.type == "BSDF_PRINCIPLED")
    for n_ in list(nt.nodes):
        if n_.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL"):
            nt.nodes.remove(n_)
    imn, imc, imr = imgs
    tn = nt.nodes.new("ShaderNodeTexImage")
    tn.image = imn
    tc = nt.nodes.new("ShaderNodeTexImage")
    tc.image = imc
    tr = nt.nodes.new("ShaderNodeTexImage")
    tr.image = imr
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = nstrength
    nt.links.new(tc.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tc.outputs["Alpha"], b.inputs["Specular IOR Level"])
    nt.links.new(tr.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Metallic"].default_value = 0.0
    b.inputs["IOR"].default_value = ior
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = 0.3
    return m
