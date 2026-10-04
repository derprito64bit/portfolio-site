"""Geometry helpers for the X-T5 build (Blender 5.0, bpy + bmesh + numpy). Hand-modelled by script, no generators.

All geometry is authored in the reference frame of refs/refs.json, in millimetres:
  +X camera's own left, +Y up, +Z out of the lens; X=0 lens axis, Y=0 base plane, Z=0 sensor plane.
Geo.finish() converts to Blender (Z up, metres): blender = 0.001 * (X, -Z, Y), so a glTF export (+Y up) gives back
(X, Y, Z) in metres, the m1 rig frame.
"""
import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

TAU = 2 * math.pi
MM = 0.001
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # ref (X,Y,Z) -> blender (X,-Z,Y)

# m2 (build_camera.py): detail knobs per LOD. LOD0 keeps these defaults (the modeller's full detail); LOD1 (lite
# tier, <= 15k tris, D-021) turns them down: fewer revolve steps, plain bands for knurl and gear teeth, no meshed text.
LODQ = {"rev": 1.0, "rev_min": 6, "knurl": True, "gear": True, "text": True, "bevel_segs": None}


def lod_n(n):
    """Revolve steps for the current LOD: n x LODQ['rev'], never below LODQ['rev_min'] (or n itself if smaller)."""
    f = LODQ["rev"]
    if f >= 1.0:
        return n
    return max(min(n, LODQ["rev_min"]), int(round(n * f)))


# ----------------------------------------------------------------------------------------------- matrices
def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def R(axis, deg):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def frame(origin, normal, up_hint=(0, 1, 0)):
    """Matrix mapping local +Z to `normal` (unit) at `origin`; local +Y points as close to up_hint as possible."""
    n = Vector(normal).normalized()
    u = Vector(up_hint)
    if abs(n.dot(u.normalized())) > 0.99:
        u = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
    x = u.cross(n).normalized()
    y = n.cross(x).normalized()
    M = Matrix(((x.x, y.x, n.x, origin[0]), (x.y, y.y, n.y, origin[1]), (x.z, y.z, n.z, origin[2]), (0, 0, 0, 1)))
    return M


# axis helpers: revolve() builds around local +Z; these orient it
AX_Y = R("X", -90)      # local +Z -> +Y (dials, buttons on top)
AX_Z = Matrix.Identity(4)  # local +Z -> +Z (front-facing parts)
AX_NZ = R("X", 180)     # local +Z -> -Z (rear-facing parts)
AX_X = R("Y", 90)       # local +Z -> +X (port side)
AX_NX = R("Y", -90)     # local +Z -> -X (grip side)
AX_NY = R("X", 90)      # local +Z -> -Y (bottom)


# ----------------------------------------------------------------------------------------------- accumulator
class Geo:
    """Raw verts/faces with a material key and a smooth flag per face."""

    def __init__(self, name):
        self.name = name
        self.v = []
        self.f = []
        self.m = []
        self.s = []
        self.uv = []    # per face: list of (u,v) per corner, or None

    def add(self, verts, faces, mat, smooth=True, M=None, uvs=None):
        o = len(self.v)
        if M is not None:
            verts = [tuple(M @ Vector(p)) for p in verts]
        self.v.extend([tuple(p) for p in verts])
        for k, f in enumerate(faces):
            self.f.append(tuple(i + o for i in f))
            self.m.append(mat if isinstance(mat, str) else mat[k])
            self.s.append(smooth if isinstance(smooth, bool) else smooth[k])
            self.uv.append(uvs[k] if uvs is not None else None)
        return self

    def add_bm(self, bm, mat, smooth=True, M=None):
        bm.verts.ensure_lookup_table()
        idx = {v: i for i, v in enumerate(bm.verts)}
        verts = [tuple(v.co) for v in bm.verts]
        faces = [[idx[v] for v in f.verts] for f in bm.faces]
        self.add(verts, faces, mat, smooth, M)
        bm.free()
        return self

    def merge(self, other, M=None):
        o = len(self.v)
        verts = other.v if M is None else [tuple(M @ Vector(p)) for p in other.v]
        self.v.extend(verts)
        self.f.extend([tuple(i + o for i in f) for f in other.f])
        self.m.extend(other.m)
        self.s.extend(other.s)
        self.uv.extend(other.uv)
        return self

    def transformed(self, M):
        g = Geo(self.name)
        g.merge(self, M)
        return g

    def tris(self):
        return sum(len(f) - 2 for f in self.f)

    def set_sharp(self, deg):
        """r4: per-face crease threshold (degrees) for this Geo's smooth faces, stored in the smooth flag as a float;
        finish() marks edges between two such faces sharp above it (the body keeps 32 deg elsewhere)."""
        self.s = [float(deg) if sm else sm for sm in self.s]
        return self

    def finish(self, mats, origin=(0, 0, 0), coll=None, sharp_deg=32.0, merge_dist=0.0015, box_uv=None):
        """Make a Blender mesh object (bmesh build: bad faces are skipped, not misaligned). origin (ref mm) becomes
        the object origin (pivot)."""
        keys = []
        for k in self.m:
            if k not in keys:
                keys.append(k)
        kidx = {k: i for i, k in enumerate(keys)}
        o = Vector(origin)
        tile = box_uv or 24.0
        bm = bmesh.new()
        bv = [bm.verts.new(tuple((TO_BLENDER @ (Vector(p) - o)) * MM)) for p in self.v]
        uvl = bm.loops.layers.uv.new("UVMap")
        sdl = bm.faces.layers.float.new("sharp_deg")
        V = self.v
        for fi, f in enumerate(self.f):
            ids = []
            given0 = self.uv[fi]
            given = [] if given0 is not None else None
            for ci, i in enumerate(f):
                if not ids or ids[-1] != i:
                    ids.append(i)
                    if given is not None:
                        given.append(given0[ci])
            if len(ids) > 1 and ids[0] == ids[-1]:
                ids.pop()
                if given is not None:
                    given.pop()
            if len(set(ids)) < 3 or len(set(ids)) != len(ids):
                continue
            try:
                bf = bm.faces.new([bv[i] for i in ids])
            except ValueError:
                continue
            bf.material_index = kidx[self.m[fi]]
            bf.smooth = bool(self.s[fi])
            bf[sdl] = self.s[fi] if type(self.s[fi]) is float else 0.0
            if given is not None and len(given) == len(ids):
                for li, lp in enumerate(bf.loops):
                    lp[uvl].uv = given[li]
                continue
            # box projection in ref mm (leatherette grain): pick the dominant axis of the ref-space normal
            nx = ny = nz = 0.0
            for k in range(len(ids)):
                a, b = V[ids[k]], V[ids[(k + 1) % len(ids)]]
                nx += (a[1] - b[1]) * (a[2] + b[2])
                ny += (a[2] - b[2]) * (a[0] + b[0])
                nz += (a[0] - b[0]) * (a[1] + b[1])
            ax = max(range(3), key=lambda i: abs((nx, ny, nz)[i]))
            for li, lp in enumerate(bf.loops):
                p = V[ids[li]]
                a, b = [(p[2], p[1]), (p[0], p[2]), (p[0], p[1])][ax]
                lp[uvl].uv = (a / tile, b / tile)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=merge_dist * MM)
        bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges)
        bm.edges.index_update()
        extra = []
        for e in bm.edges:
            lf = e.link_faces
            if len(lf) == 2:
                a, b = lf[0][sdl], lf[1][sdl]
                if a > 0 and b > 0 and e.calc_face_angle(0.0) > math.radians(min(a, b)):
                    extra.append(e.index)
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        if "sharp_deg" in me.attributes:
            me.attributes.remove(me.attributes["sharp_deg"])
        for k in keys:
            me.materials.append(mats[k])
        me.set_sharp_from_angle(angle=math.radians(sharp_deg))
        if extra:
            att = me.attributes.get("sharp_edge") or me.attributes.new("sharp_edge", "BOOLEAN", "EDGE")
            for i in extra:
                att.data[i].value = True
        ob = bpy.data.objects.new(self.name, me)
        ob.location = (TO_BLENDER @ o) * MM
        (coll or bpy.context.scene.collection).objects.link(ob)
        return ob


def geo_object(geo, name="tmp"):
    """Raw-mm Blender object (no axis conversion) with one placeholder material per key ('k:<key>')."""
    keys = list(dict.fromkeys(geo.m))
    bm = bmesh.new()
    bv = [bm.verts.new(p) for p in geo.v]
    for fi, f in enumerate(geo.f):
        ids = []
        for i in f:
            if not ids or ids[-1] != i:
                ids.append(i)
        if len(ids) > 1 and ids[0] == ids[-1]:
            ids.pop()
        if len(set(ids)) < 3 or len(set(ids)) != len(ids):
            continue
        try:
            bf = bm.faces.new([bv[i] for i in ids])
        except ValueError:
            continue
        bf.material_index = keys.index(geo.m[fi])
        bf.smooth = bool(geo.s[fi])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0015)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for k in keys:
        m = bpy.data.materials.get("k:" + k) or bpy.data.materials.new("k:" + k)
        me.materials.append(m)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def object_geo(ob, name):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    keys = [m.name[2:] if m else "x" for m in me.materials]
    g = Geo(name)
    g.add([tuple(v.co) for v in me.vertices], [tuple(p.vertices) for p in me.polygons],
          [keys[p.material_index] for p in me.polygons], [p.use_smooth for p in me.polygons])
    bpy.data.meshes.remove(me)
    return g


def boolean(geo, cutters, op="DIFFERENCE"):
    """Exact boolean of a closed Geo with closed cutter Geos; cutter faces keep their own material keys."""
    a = geo_object(geo, "bool_a")
    tmp = [a]
    for c in cutters:
        b = geo_object(c, "bool_b")
        b.hide_render = True
        tmp.append(b)
        mod = a.modifiers.new("b", "BOOLEAN")
        mod.operation = op
        mod.object = b
        mod.solver = "EXACT"
        try:
            mod.material_mode = "TRANSFER"
        except (AttributeError, TypeError):
            pass
    g = object_geo(a, geo.name)
    for o in tmp:
        me = o.data
        bpy.data.objects.remove(o)
        bpy.data.meshes.remove(me)
    return g


# ----------------------------------------------------------------------------------------------- 2D polygons
def poly_area(P):
    return 0.5 * sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))


def fillet_poly(ctrl, radii, segs, offset=0.0, min_r=0.03):
    """Rounded polygon. ctrl CCW [(x, z)], radii/segs per corner (segs 0 = sharp). offset > 0 grows outward.
    Topology (point count) depends only on segs, so levels with different offsets/positions can be lofted."""
    if poly_area(ctrl) < 0:
        out = fillet_poly(list(reversed(ctrl)), list(reversed(radii)), list(reversed(segs)), offset, min_r)
        return list(reversed(out))
    n = len(ctrl)
    P = [np.array(p, float) for p in ctrl]
    nrm = []
    for i in range(n):
        d = P[(i + 1) % n] - P[i]
        d = d / (np.linalg.norm(d) + 1e-12)
        nrm.append(np.array([d[1], -d[0]]))     # outward normal of edge i -> i+1 for CCW
    Q, rr = [], []
    for i in range(n):
        n1, n2 = nrm[i - 1], nrm[i]
        m = (n1 + n2) / max(1.0 + float(n1 @ n2), 1e-6)
        Q.append(P[i] + offset * m)
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        cross = (b - a)[0] * (c - b)[1] - (b - a)[1] * (c - b)[0]
        r = radii[i] + (offset if cross > 0 else -offset)
        rr.append(max(r, min_r))
    out = []
    for i in range(n):
        a, b, c = Q[i - 1], Q[i], Q[(i + 1) % n]
        if segs[i] == 0:
            out.append(tuple(b))
            continue
        u, w = a - b, c - b
        lu, lw = np.linalg.norm(u), np.linalg.norm(w)
        u, w = u / lu, w / lw
        cosphi = float(np.clip(u @ w, -1, 1))
        phi = math.acos(cosphi)
        if phi > math.pi - 1e-4:            # straight: same point count, merged later by remove_doubles
            out.extend([tuple(b)] * (segs[i] + 1))
            continue
        r = rr[i]
        t = r / math.tan(phi / 2)
        tmax = 0.499 * min(lu, lw)
        if t > tmax:
            t = tmax
            r = t * math.tan(phi / 2)
        s, e = b + u * t, b + w * t
        bis = (u + w) / np.linalg.norm(u + w)
        cen = b + bis * (r / math.sin(phi / 2))
        a0 = math.atan2(s[1] - cen[1], s[0] - cen[0])
        a1 = math.atan2(e[1] - cen[1], e[0] - cen[0])
        da = (a1 - a0 + math.pi) % TAU - math.pi
        for k in range(segs[i] + 1):
            ang = a0 + da * k / segs[i]
            out.append((cen[0] + r * math.cos(ang), cen[1] + r * math.sin(ang)))
    return out


def catmull(points, n_per=4, closed=False):
    """Catmull-Rom spline through points, n_per samples per span (endpoints kept)."""
    P = [np.array(p, float) for p in points]
    out = []
    m = len(P)
    spans = m if closed else m - 1
    for i in range(spans):
        p0 = P[i - 1] if (i > 0 or closed) else P[0]
        p1, p2 = P[i], P[(i + 1) % m]
        p3 = P[(i + 2) % m] if (i + 2 < m or closed) else P[-1]
        for k in range(n_per):
            t = k / n_per
            t2, t3 = t * t, t * t * t
            q = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append(tuple(q))
    if not closed:
        out.append(tuple(P[-1]))
    return out


def circle2(cx, cz, r, n, a0=0.0):
    return [(cx + r * math.cos(a0 + TAU * k / n), cz + r * math.sin(a0 + TAU * k / n)) for k in range(n)]


# ----------------------------------------------------------------------------------------------- lofts
def loft(levels, mat, cap_bottom=True, cap_top=True, smooth=True, closed=True, axis="Y"):
    """levels: [(h, [(a, b), ...])] equal counts. axis 'Y': points are (x, z) at height y=h.
    axis 'Z': points are (x, y) at z=h. axis 'X': points are (z, y) at x=h. mat: key or fn(face_center, normal)."""
    g = Geo("loft")
    n = len(levels[0][1])
    verts = []
    for h, pts in levels:
        assert len(pts) == n, (len(pts), n)
        for a, b in pts:
            if axis == "Y":
                verts.append((a, h, b))
            elif axis == "Z":
                verts.append((a, b, h))
            else:
                verts.append((h, b, a))
    faces = []
    L = len(levels)
    m = n if closed else n - 1
    for j in range(L - 1):
        for i in range(m):
            i2 = (i + 1) % n
            faces.append((j * n + i, j * n + i2, (j + 1) * n + i2, (j + 1) * n + i))
    if cap_bottom:
        faces.append(tuple(reversed(range(0, n))))
    if cap_top:
        faces.append(tuple(range((L - 1) * n, L * n)))
    # orientation fix: outward normals. Check with signed volume.
    vol = 0.0
    V = np.array(verts)
    for f in faces:
        p0 = V[f[0]]
        for k in range(1, len(f) - 1):
            vol += np.dot(p0, np.cross(V[f[k]], V[f[k + 1]]))
    if vol < 0:
        faces = [tuple(reversed(f)) for f in faces]
    if callable(mat):
        keys = []
        for f in faces:
            c = V[list(f)].mean(axis=0)
            nn = np.cross(V[f[1]] - V[f[0]], V[f[2]] - V[f[0]])
            if len(f) > 3:
                nn = np.zeros(3)
                for k in range(len(f)):
                    a, b = V[f[k]], V[f[(k + 1) % len(f)]]
                    nn += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
            nn = nn / (np.linalg.norm(nn) + 1e-12)
            keys.append(mat(c, nn))
        g.add(verts, faces, keys, smooth)
    else:
        g.add(verts, faces, mat, smooth)
    return g


def round_levels(h0, h1, r, segs, bottom=True, top=True, base_off=0.0, extra=None):
    """(h, offset) pairs for a profile with quarter-round edges of radius r at the bottom and/or top."""
    lv = []
    if bottom:
        for k in range(segs + 1):
            a = (math.pi / 2) * k / segs
            lv.append((h0 + r * (1 - math.cos(a)), base_off - r * (1 - math.sin(a))))
    else:
        lv.append((h0, base_off))
    for e in (extra or []):
        lv.append(e)
    if top:
        for k in range(segs + 1):
            a = (math.pi / 2) * k / segs
            lv.append((h1 - r * (1 - math.sin(a)), base_off - r * (1 - math.cos(a))))
    else:
        lv.append((h1, base_off))
    lv.sort(key=lambda t: t[0])
    return lv


# ----------------------------------------------------------------------------------------------- revolve
def revolve(profile, n, mat, smooth=True, a0=0.0, arc=None, M=None, name="rev", phase=0.0):
    """Surface of revolution around local +Z. profile: [(r, z)], r=0 ends become poles.
    Faces wind outward when the profile runs bottom->top on the outside (r>0, z increasing)."""
    n = lod_n(n)
    g = Geo(name)
    verts, faces = [], []
    rings = []
    full = arc is None
    steps = n if full else n
    for (r, z) in profile:
        if r <= 1e-9:
            verts.append((0.0, 0.0, z))
            rings.append([len(verts) - 1])
            continue
        ring = []
        cnt = n if full else n + 1
        for k in range(cnt):
            a = a0 + phase * TAU / n + (TAU * k / n if full else arc * k / n)
            verts.append((r * math.cos(a), r * math.sin(a), z))
            ring.append(len(verts) - 1)
        rings.append(ring)
    for j in range(len(rings) - 1):
        A, B = rings[j], rings[j + 1]
        if len(A) == 1 and len(B) == 1:
            continue
        if len(A) == 1:
            m = len(B) if full else len(B) - 1
            for k in range(m):
                faces.append((A[0], B[k], B[(k + 1) % len(B)]))
        elif len(B) == 1:
            m = len(A) if full else len(A) - 1
            for k in range(m):
                faces.append((A[k], A[(k + 1) % len(A)], B[0]))
        else:
            m = len(A) if full else len(A) - 1
            for k in range(m):
                k2 = (k + 1) % len(A)
                faces.append((A[k], A[k2], B[k2], B[k]))
    g.add(verts, faces, mat, smooth, M)
    return g


def disc(r, z, n, mat, M=None, up=True, r_in=0.0):
    prof = [(r, z), (r_in, z)] if up else [(r_in, z), (r, z)]
    return revolve(prof, n, mat, M=M)


def cyl(r, z0, z1, n, mat, M=None, cap0=True, cap1=True, chamfer=0.0, chamfer0=0.0, smooth=True):
    prof = []
    if cap0:
        prof.append((0.0, z0))
    if chamfer0 > 0:
        prof += [(r - chamfer0, z0), (r, z0 + chamfer0)]
    else:
        prof.append((r, z0))
    if chamfer > 0:
        prof += [(r, z1 - chamfer), (r - chamfer, z1)]
    else:
        prof.append((r, z1))
    if cap1:
        prof.append((0.0, z1))
    return revolve(prof, n, mat, M=M, smooth=smooth)


# ----------------------------------------------------------------------------------------------- knurl / gears
def knurl_band(r, z0, z1, n_around, n_rows, depth, mat, M=None, phase=0.0):
    """Pyramid cross-knurl on a cylinder around local +Z: a grid of square-base pyramids (4 tris each)."""
    if not LODQ["knurl"]:                     # m2 LOD1: a plain band at the pyramids' mid height
        return revolve([(r + depth * 0.5, z0), (r + depth * 0.5, z1)], n_around, mat, M=M)
    g = Geo("knurl")
    verts, faces = [], []
    grid = {}
    for j in range(n_rows + 1):
        z = z0 + (z1 - z0) * j / n_rows
        for i in range(n_around):
            a = TAU * (i + phase) / n_around
            grid[(i, j)] = len(verts)
            verts.append((r * math.cos(a), r * math.sin(a), z))
    for j in range(n_rows):
        zc = z0 + (z1 - z0) * (j + 0.5) / n_rows
        for i in range(n_around):
            a = TAU * (i + 0.5 + phase) / n_around
            apex = len(verts)
            verts.append(((r + depth) * math.cos(a), (r + depth) * math.sin(a), zc))
            i2 = (i + 1) % n_around
            v00, v10, v11, v01 = grid[(i, j)], grid[(i2, j)], grid[(i2, j + 1)], grid[(i, j + 1)]
            faces += [(v00, v10, apex), (v10, v11, apex), (v11, v01, apex), (v01, v00, apex)]
    g.add(verts, faces, mat, False, M)
    return g


def gear(r_root, r_tip, teeth, z0, z1, mat, M=None, cap=True, tip_frac=0.35, smooth=False):
    """Toothed wheel around local +Z: trapezoid teeth."""
    pts = []
    for t in range(teeth):
        a = TAU * t / teeth
        da = TAU / teeth
        pts.append((r_root, a))
        pts.append((r_tip, a + da * (0.5 - tip_frac / 2)))
        pts.append((r_tip, a + da * (0.5 + tip_frac / 2)))
    ring = [(rr * math.cos(a), rr * math.sin(a)) for rr, a in pts]
    lv = [(z0, ring), (z1, ring)]
    g = loft(lv, mat, cap_bottom=cap, cap_top=cap, smooth=smooth, axis="Z")
    if M is not None:
        g = g.transformed(M)
    return g


def straight_knurl(r, z0, z1, ridges, depth, mat, M=None, flat_frac=0.5):
    """Straight (axial) knurl: alternating ridge/groove ring, open ends."""
    ring = []
    for t in range(ridges):
        a = TAU * t / ridges
        da = TAU / ridges
        ring.append((r * math.cos(a), r * math.sin(a)))
        ring.append((r * math.cos(a + da * flat_frac * 0.5), r * math.sin(a + da * flat_frac * 0.5)))
        rr = r - depth
        ring.append((rr * math.cos(a + da * 0.5), rr * math.sin(a + da * 0.5)))
        ring.append((rr * math.cos(a + da * (1 - flat_frac * 0.5)), rr * math.sin(a + da * (1 - flat_frac * 0.5))))
    # dedupe last two to keep a clean pattern
    g = loft([(z0, ring), (z1, ring)], mat, cap_bottom=False, cap_top=False, smooth=False, axis="Z")
    return g.transformed(M) if M is not None else g


# ----------------------------------------------------------------------------------------------- boxes
def rbox(sx, sy, sz, r=0.0, segs=2, mat="x", M=None, center=(0, 0, 0)):
    """Rounded box (bmesh bevel of all edges), centred, local axes."""
    if LODQ["bevel_segs"] is not None:
        segs = min(segs, LODQ["bevel_segs"])
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((sx, sy, sz)), verts=bm.verts)
    if r > 0 and segs > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=r, offset_type="OFFSET", segments=segs, profile=0.5,
                        affect="EDGES", clamp_overlap=True)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    g = Geo("box")
    g.add_bm(bm, mat, True, M)
    return g


def slab(poly2d, z0, z1, mat, M=None, r=0.0, segs=2, smooth=True):
    """Extrude a 2D polygon (x, y) along local Z from z0 to z1, optional rounded top edge (r, segs)."""
    if poly_area(poly2d) < 0:
        poly2d = list(reversed(poly2d))
    if r > 0:
        lv = [(z0, poly2d)]
        for k in range(segs + 1):
            a = (math.pi / 2) * k / segs
            lv.append((z1 - r * (1 - math.sin(a)), offset_ring(poly2d, -r * (1 - math.cos(a)))))
    else:
        lv = [(z0, poly2d), (z1, poly2d)]
    g = loft(lv, mat, axis="Z", smooth=smooth)
    return g.transformed(M) if M is not None else g


def plane_M(origin, d, u):
    """Right-handed frame: local X -> d, local Y -> u (orthogonalised), local Z -> d x u."""
    d = Vector(d).normalized()
    u = Vector(u).normalized()
    n = d.cross(u).normalized()
    u = n.cross(d).normalized()
    return Matrix(((d.x, u.x, n.x, origin[0]), (d.y, u.y, n.y, origin[1]), (d.z, u.z, n.z, origin[2]), (0, 0, 0, 1)))


def slab_on(poly, origin, d, u, z0, z1, mat, r=0.0, segs=2, smooth=True):
    """Extrude a polygon authored in plane coords (a along d, b along u) along n = d x u (always a proper rotation)."""
    return slab(poly, z0, z1, mat, M=plane_M(origin, d, u), r=r, segs=segs, smooth=smooth)


def segs_geo(segments, width, mat, M=None, depth=0.03):
    """Stroked polyline glyphs: each ((x0, y0), (x1, y1)) becomes a thin box in local XY, raised along +Z."""
    g = Geo("strokes")
    for (x0, y0), (x1, y1) in segments:
        L = math.hypot(x1 - x0, y1 - y0)
        a = math.degrees(math.atan2(y1 - y0, x1 - x0))
        g.merge(rbox(L + width, width, depth, mat=mat), T((x0 + x1) / 2, (y0 + y1) / 2, depth / 2) @ R("Z", a))
    return g.transformed(M) if M is not None else g


def offset_ring(pts, d):
    """Offset a CCW closed point ring along vertex normals (small offsets on smooth rings)."""
    n = len(pts)
    P = np.array(pts, float)
    out = []
    for i in range(n):
        a, b, c = P[i - 1], P[i], P[(i + 1) % n]
        t = c - a
        t = t / (np.linalg.norm(t) + 1e-12)
        nn = np.array([t[1], -t[0]])
        out.append(tuple(b + nn * d))
    return out


# ----------------------------------------------------------------------------------------------- polygons with holes
def fill_polys(polys, z0, z1, mat, M=None, name="fill"):
    """polys: [[ext [(x,y)], holes [[(x,y)]]]] -> extruded solid between z0 and z1 (local +Z) via a 2D curve fill
    (Blender triangulates the holes). If z1 == z0, a single flat face set facing +Z."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    for ext, holes in polys:
        for ring in [ext] + holes:
            sp = cu.splines.new("POLY")
            sp.points.add(len(ring) - 1)
            for k, (x, y) in enumerate(ring):
                sp.points[k].co = (x, y, 0.0, 1.0)
            sp.use_cyclic_u = True
    thick = abs(z1 - z0)
    cu.extrude = thick / 2 if thick > 0 else 0.0
    ob = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bpy.data.meshes.remove(me)
    if thick > 0:
        bmesh.ops.translate(bm, vec=Vector((0, 0, (z0 + z1) / 2)), verts=bm.verts)
    else:
        # keep only the +Z facing faces
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < 0.5], context="FACES")
        bmesh.ops.translate(bm, vec=Vector((0, 0, z0)), verts=bm.verts)
    g = Geo(name)
    g.add_bm(bm, mat, False, M)
    return g


_FONTS = {}


def font(path):
    if path not in _FONTS:
        _FONTS[path] = bpy.data.fonts.load(path, check_existing=True)
    return _FONTS[path]


def text_geo(s, size, mat, fontpath=None, align_x="CENTER", align_y="CENTER", thick=0.0, M=None, spacing=1.0,
             res=None, bold=0.0):
    """Flat text in local XY (+Z up), centred; optional thickness. Returns Geo. res (curve subdivisions per Bezier
    segment) defaults by size: size < 2.5 mm -> 1, < 6 mm -> 2, else 3 (r3 triangle budget; Blender's cap height is
    ~0.5 x size, so glyphs under ~3 mm tall stay smooth at the 12 px/mm of the comparison renders)."""
    if not LODQ["text"]:                      # m2 LOD1: no meshed text (the marks are decals on every LOD)
        return Geo("text")
    if res is None:
        res = 1 if size < 2.5 else (2 if size < 6.0 else 3)
    cu = bpy.data.curves.new("t", "FONT")
    cu.body = s
    cu.size = size
    cu.align_x = align_x
    cu.align_y = align_y
    cu.resolution_u = res
    cu.space_character = spacing
    if fontpath:
        cu.font = font(fontpath)
    cu.extrude = thick / 2
    if bold:
        cu.offset = bold
    ob = bpy.data.objects.new("t", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bpy.data.meshes.remove(me)
    if thick > 0:
        bmesh.ops.translate(bm, vec=Vector((0, 0, thick / 2)), verts=bm.verts)
    else:
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < 0.5], context="FACES")
    g = Geo("text")
    g.add_bm(bm, mat, False, M)
    return g


def wrap_cyl(g, r, axis_M):
    """Bend a flat Geo authored in local (u=x, v=y, w=z) onto a cylinder of radius r around local +Z' where the
    flat's u maps to arc length, v to height, w to radial lift; axis_M places the cylinder."""
    out = Geo(g.name)
    verts = []
    for (u, v, w) in g.v:
        a = u / r
        rr = r + w
        verts.append(tuple(axis_M @ Vector((rr * math.cos(a), rr * math.sin(a), v))))
    out.v = verts
    out.f, out.m, out.s, out.uv = list(g.f), list(g.m), list(g.s), list(g.uv)
    return out
