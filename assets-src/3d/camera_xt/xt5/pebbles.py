"""r7 (round 4) leatherette grain: rounded, blob-shaped pebbles of mixed size on a continuous base (pure numpy).

Round-3 review: the r6 grain (flat Voronoi islands cut by thin crevices with glossy rims) read as crocodile skin or
crazed glaze; the camera's leatherette (official renders, refs/closeups/photo_leatherette_grip.jpg) is rounded,
blob-shaped pebbles of mixed size with soft valleys and no crack network: ~0.3-0.8 mm on the body front, ~1-1.5 mm on
the grip (the grip is the coarser one).

pebble_field() lays the pebbles out by variable-radius Poisson-disc dart throwing (blue noise, so no grid shows), in a
space stretched along v so the pebbles come out wider than tall, gives each a jittered size, a slight random tilt and
a domed profile (flat-ish top, smoothstep-like shoulder into the valley), lets overlapping neighbours merge (max), and
warps the domain at the pebble scale so the outlines are irregular blobs rather than ellipses. The pebble size can vary
along u (size_fn), which lets one strip map cross-fade from the body grain to the grip grain without a seam.

Returns height (mm), cavity (0 valley floor .. 1 pebble top), pebble id per pixel (-1 on the base) and the pebble count.
"""
import math

import numpy as np


def pnoise(h, w, f0, seed, bw=0.5, wrap=True):
    """Periodic band-limited noise (unit peak) on an h x w grid, centre frequency f0 in cycles per pixel."""
    F = np.fft.fft2(np.random.default_rng(seed).standard_normal((h, w)))
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    f = np.sqrt(fx ** 2 + fy ** 2)
    x = np.real(np.fft.ifft2(F * np.exp(-((f - f0) ** 2) / (2 * (f0 * bw) ** 2))))
    return x / (np.abs(x).max() + 1e-12)


def poisson(Wmm, Hmm, r_fn, seed, elong=1.0, wrap_u=False, wrap_v=True, tries=24):
    """Variable-radius dart throwing in (u, v * elong) space. r_fn(u) = minimum centre spacing (in the stretched
    space) at u. Returns an (n, 2) array of (u, v) in mm."""
    rng = np.random.default_rng(seed)
    Hs = Hmm * elong
    rmin = min(r_fn(u) for u in np.linspace(0, Wmm, 64))
    rmax = max(r_fn(u) for u in np.linspace(0, Wmm, 64))
    cell = rmin / math.sqrt(2)
    nu, nv = int(math.ceil(Wmm / cell)), int(math.ceil(Hs / cell))
    grid = {}
    pts = []
    rad = []
    reach = int(math.ceil(rmax / cell)) + 1

    def ok(u, v, r):
        ci, cj = int(u / cell), int(v / cell)
        for di in range(-reach, reach + 1):
            ii = ci + di
            if wrap_u:
                ii %= nu
            elif ii < 0 or ii >= nu:
                continue
            for dj in range(-reach, reach + 1):
                jj = (cj + dj) % nv if wrap_v else cj + dj
                lst = grid.get((ii, jj))
                if not lst:
                    continue
                for k in lst:
                    du = abs(pts[k][0] - u)
                    dv = abs(pts[k][1] - v)
                    if wrap_u:
                        du = min(du, Wmm - du)
                    if wrap_v:
                        dv = min(dv, Hs - dv)
                    if du * du + dv * dv < (0.5 * (r + rad[k])) ** 2:
                        return False
        return True

    def add(u, v, r):
        pts.append((u, v))
        rad.append(r)
        grid.setdefault((int(u / cell) % nu if wrap_u else int(u / cell), int(v / cell) % nv), []).append(len(pts) - 1)

    # Bridson: grow from an active list (gives an even, gap-free blue-noise cover)
    u0, v0 = rng.uniform(0, Wmm), rng.uniform(0, Hs)
    add(u0, v0, r_fn(u0))
    active = [0]
    while active:
        a = active[rng.integers(len(active))]
        pu, pv = pts[a]
        r = rad[a]
        placed = False
        for _ in range(tries):
            ang = rng.uniform(0, 2 * math.pi)
            d = rng.uniform(1.0, 1.6) * r
            u, v = pu + d * math.cos(ang), pv + d * math.sin(ang)
            if wrap_u:
                u %= Wmm
            elif u < 0 or u >= Wmm:
                continue
            if wrap_v:
                v %= Hs
            elif v < 0 or v >= Hs:
                continue
            rc = r_fn(u)
            if ok(u, v, rc):
                add(u, v, rc)
                active.append(len(pts) - 1)
                placed = True
                break
        if not placed:
            active.remove(a)
    P = np.array(pts)
    P[:, 1] /= elong
    return P, np.array(rad)


def pebble_field(W, H, px, size_fn, seed=7, elong=1.35, wrap_u=False, wrap_v=True, depth_fn=None, fill=0.93,
                 size_jit=(0.72, 1.12), tilt=0.10, warp=0.13, prof=(2.6, 0.55), micro=0.004, filler=True):
    """W x H px at px mm per pixel. size_fn(u_mm) -> pebble spacing (mm, along u; across v it is / elong);
    depth_fn(u_mm) -> pebble height (mm). fill: pebble radius as a share of half the spacing (< 1 leaves valleys)."""
    Wmm, Hmm = W * px, H * px
    depth_fn = depth_fn or (lambda u: 0.1)
    P, R = poisson(Wmm, Hmm, size_fn, seed, elong=elong, wrap_u=wrap_u, wrap_v=wrap_v)
    rng = np.random.default_rng(seed + 1)
    n = len(P)
    # small filler pebbles in the larger gaps: a second, finer layer that only shows where the first leaves the base
    h = np.zeros((H, W), np.float32)
    pid = np.full((H, W), -1, np.int32)
    top = np.zeros((H, W), np.float32)
    # domain warp at the pebble scale (irregular blob outlines); the warp's scale follows the local pebble size
    s_cols = np.array([size_fn((i + 0.5) * px) for i in range(W)], np.float32)
    wu = pnoise(H, W, 1.0 / (0.9 * s_cols.mean() / px), seed + 2)
    wv = pnoise(H, W, 1.0 / (0.9 * s_cols.mean() / px), seed + 3)
    wu2 = pnoise(H, W, 1.0 / (0.45 * s_cols.mean() / px), seed + 4)
    wv2 = pnoise(H, W, 1.0 / (0.45 * s_cols.mean() / px), seed + 5)
    scale = s_cols[None, :]
    WU = (warp * (wu + 0.5 * wu2)) * scale
    WV = (warp * (wv + 0.5 * wv2)) * scale / elong
    lay = [(P, R, 0)]
    if filler:
        Pf, Rf = poisson(Wmm, Hmm, lambda u: 0.62 * size_fn(u), seed + 9, elong=elong, wrap_u=wrap_u, wrap_v=wrap_v)
        lay.append((Pf, Rf, 1))
    k = 0
    p_exp, q_exp = prof
    for PP, RR, layer in lay:
        for (u0, v0), sp in zip(PP, RR):
            sj = rng.uniform(*size_jit) * (0.78 if layer else 1.0)
            a = 0.5 * sp * fill * sj                      # semi-axis along u (mm)
            b = a / elong * rng.uniform(0.85, 1.15)       # across v
            th = rng.normal(0.0, 0.22)
            hm = depth_fn(u0) * rng.uniform(0.8, 1.0) * (0.75 if layer else 1.0)
            tu, tv = rng.normal(0.0, tilt, 2)
            ext = max(a, b) + warp * sp * 1.6
            i0, i1 = int((u0 - ext) / px) - 1, int((u0 + ext) / px) + 2
            j0, j1 = int((v0 - ext) / px) - 1, int((v0 + ext) / px) + 2
            cols = np.arange(i0, i1)
            rows = np.arange(j0, j1)
            if wrap_u:
                cols_i = cols % W
            else:
                keep = (cols >= 0) & (cols < W)
                cols, cols_i = cols[keep], cols[keep]
            if wrap_v:
                rows_i = rows % H
            else:
                keep = (rows >= 0) & (rows < H)
                rows, rows_i = rows[keep], rows[keep]
            if len(cols) == 0 or len(rows) == 0:
                continue
            U = (cols + 0.5) * px
            V = (rows + 0.5) * px
            ix = np.ix_(rows_i, cols_i)
            du = U[None, :] - u0 + WU[ix]
            dv = V[:, None] - v0 + WV[ix]
            c, s = math.cos(th), math.sin(th)
            x = (c * du + s * dv) / a
            y = (-s * du + c * dv) / b
            rho = np.sqrt(x * x + y * y)
            inside = rho < 1.0
            if not inside.any():
                continue
            f = np.where(inside, (1.0 - np.clip(rho, 0, 1) ** p_exp) ** q_exp, 0.0)
            hh = hm * f * (1.0 + tu * x * 0.5 + tv * y * 0.5)
            cur = h[ix]
            win = hh > cur
            h[ix] = np.where(win, hh, cur)
            pid[ix] = np.where(win & inside, k, pid[ix])
            top[ix] = np.where(win, f, top[ix])
            k += 1
    h += micro * pnoise(H, W, 1.0 / (0.06 / px), seed + 6)
    return h, top, pid, k


def normal_rgba(h, px, strength=1.0):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * px)
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * px)
    nx, ny, nz = -dx * strength, -dy * strength, np.ones_like(h)
    ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    return np.stack([0.5 + 0.5 * nx / ln, 0.5 + 0.5 * ny / ln, 0.5 + 0.5 * nz / ln, np.ones_like(h)], -1)


def preview(h, px, strength=1.0, light=(0.0, 0.75, 0.66)):
    """Quick Lambert + soft spec shading of the height field (light from the top of the image, v up = row 0?)."""
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * px)
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * px)
    n = np.stack([-dx * strength, dy * strength, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = np.array(light) / np.linalg.norm(light)
    d = np.clip(n @ L, 0, 1)
    return d
