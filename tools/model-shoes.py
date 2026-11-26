# =============================================================================
#  model-shoes.py — models the skate shoes in Blender (run with Blender's Python
#  module: `pip install bpy`, then `python tools/model-shoes.py assets/models/shoes`).
#
#  Three silhouettes: 'vulc' (slim low-top), 'hightop', 'chunky' (puffy cupsole).
#  Each shoe is built from parts, like a real one:
#    * sole: last-shaped outline, rounded bottom edge, rubber toe bumper (vulc),
#      a thin dark foxing stripe round the top
#    * upper: lofted over the last, Catmull-Clark subdivided, ankle opening cut
#      out, given real thickness (solidify) so the lip shows
#    * padded collar: a tube that follows the opening's edge
#    * tongue: a curved padded slab rising out of the throat
#    * suede overlays: toe cap and heel counter (accent material)
#    * laces criss-crossing through metal eyelets
#  Units are metres in the game's foot frame: sole bottom at y = 0, heel at
#  z = -0.078, toe at z = +0.218, x = across (+x = inner side of the right shoe).
#  Exported as glTF (Y-up) with materials named upper / accent / sole / foxing /
#  lace / metal, which the game swaps for its own (colour-able) materials.
# =============================================================================
import bpy, bmesh, math, os, sys
from mathutils import Vector

OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets/models/shoes'
os.makedirs(OUT, exist_ok=True)
Z0, Z1 = -0.078, 0.218


def G(x, y, z):                      # game (x, y up, z toe) → Blender (x, -z, y)
    return Vector((x, -z, y))


def sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def mat(name, rgb, rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    return m


MATS = {}


def mesh_obj(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(MATS[material])
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def apply_mods(ob):
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


class Shoe:
    def __init__(self, style):
        self.style = style
        self.HI = style == 'hightop'
        self.CH = style == 'chunky'
        self.puff = 0.006 if self.CH else 0.0
        self.SOLE = 0.036 if self.CH else 0.024

    # half-widths of the last on the outer (-x) and inner (+x) side
    def widths(self, t):
        base = 0.03 + 0.016 * math.sin(min(1, t * 1.25) * math.pi * 0.55) + 0.006 * math.sin(t * math.pi)
        toe = math.sqrt(max(0, 1 - ((t - 0.8) / 0.2) ** 2)) if t > 0.8 else 1
        heel = math.sqrt(max(0, 1 - ((0.07 - t) / 0.07) ** 2)) if t < 0.07 else 1
        arch = 1 - 0.09 * math.exp(-((t - 0.42) / 0.12) ** 2)          # straighter inner side at the arch
        w = base * toe * heel + 0.0015 + self.puff
        return w * 1.04, w * arch          # outer bulges a little more (5th metatarsal)

    def height(self, t):                 # upper height above the sole along the foot
        p = self.puff
        if self.HI and t < 0.62:
            return 0.15 - 0.03 * sstep(0.3, 0.62, t) - 0.04 * sstep(0.4, 0.62, t)
        if t < 0.32:
            return 0.09 - 0.006 * t + p
        if t < 0.68:
            return 0.088 + p - (t - 0.32) * 0.09
        return max(0.014, 0.056 + p - (t - 0.68) * 0.14)

    def surf(self, t, a, inflate=0.0, ybase=None):
        """point on the upper: t along (0 heel → 1 toe), a around (0 outer → π inner)"""
        wo, wi = self.widths(t)
        w = (wo if math.cos(a) > 0 else wi) + inflate
        z = Z0 + (Z1 - Z0) * t
        y0 = (self.SOLE - 0.003) if ybase is None else ybase
        h = (self.height(t) + inflate * 0.5) * min(1, math.sqrt(max(1e-6, min(wo, wi) / 0.026)))
        c, s = math.cos(a), math.sin(a)
        x = -w * math.copysign(abs(c) ** 0.8, c)
        return G(x, y0 + h * (max(0, s) ** 0.55), z), (x, y0 + h * (max(0, s) ** 0.55), z)

    def loft(self, t0, t1, NZ, NA, inflate=0.0, keep=None):
        bm = bmesh.new()
        rows = []
        for j in range(NZ + 1):
            t = t0 + (t1 - t0) * j / NZ
            rows.append([bm.verts.new(self.surf(t, math.pi * i / NA, inflate)[0]) for i in range(NA + 1)])
        for j in range(NZ):
            for i in range(NA):
                q = [rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]]
                if keep:
                    c = sum((v.co for v in q), Vector()) / 4
                    if not keep(c):
                        continue
                try:
                    bm.faces.new(q)
                except ValueError:
                    pass
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        return bm

    # ---- the ankle opening (an ellipse in plan view, sloping down to the throat)
    def in_opening(self, c):
        x, z, y = c.x, -c.y, c.z
        if self.HI:
            cz, rz, rx, top = 0.0, 0.07, 0.034, 0.128 - 0.25 * max(0, z - 0.0)
        else:
            cz, rz, rx, top = 0.008, (0.058 if self.CH else 0.068), 0.036, 0.078 + self.puff - 0.18 * max(0, z - 0.0) + 0.05 * max(0, -z - 0.03)
        inside = (x / rx) ** 2 + ((z - cz) / rz) ** 2 < 1
        if z < -0.052:                     # the heel counter stays whole (no notch at the back)
            return False
        return inside and y > top - 0.01

    def build(self):
        parts = []
        # ---------------- sole
        bm = bmesh.new()
        N = 72
        ring = []
        for k in range(N):
            # walk the outline: outer side heel→toe, then inner side toe→heel
            u = k / N
            t = u * 2 if u < 0.5 else (1 - u) * 2
            wo, wi = self.widths(min(0.999, max(0.001, t)))
            side = -1 if u < 0.5 else 1
            w = (wo if side < 0 else wi) + 0.004 + (0.004 if self.CH else 0)
            ring.append((side * w, Z0 - 0.003 + (Z1 - Z0 + 0.006) * t, t))
        def sole_h(t):
            h = self.SOLE
            if not self.CH:
                h += 0.012 * sstep(0.82, 1.0, t)          # rubber toe bumper climbs the toe
            return h
        levels = [(0.0, 0.86), (0.004, 0.97), (0.009, 1.0), (None, 1.0)]
        rings = []
        for (yy, sc) in levels:
            rr = []
            for (x, z, t) in ring:
                y = sole_h(t) if yy is None else yy
                zc = (Z0 + Z1) / 2
                rr.append(bm.verts.new(G(x * sc, y, zc + (z - zc) * (0.985 + 0.015 * sc))))
            rings.append(rr)
        for a, b in zip(rings, rings[1:]):
            for k in range(N):
                bm.faces.new([a[k], a[(k + 1) % N], b[(k + 1) % N], b[k]])
        bm.faces.new(list(reversed(rings[0])))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        parts.append(mesh_obj('sole', bm, 'sole'))
        # foxing stripe (a thin dark band round the top of the sole)
        bm = bmesh.new()
        r1 = [bm.verts.new(G(x * 1.012, sole_h(t) - 0.009, (Z0 + Z1) / 2 + (z - (Z0 + Z1) / 2) * 1.004)) for (x, z, t) in ring]
        r2 = [bm.verts.new(G(x * 1.012, sole_h(t) - 0.005, (Z0 + Z1) / 2 + (z - (Z0 + Z1) / 2) * 1.004)) for (x, z, t) in ring]
        for k in range(N):
            bm.faces.new([r1[k], r1[(k + 1) % N], r2[(k + 1) % N], r2[k]])
        parts.append(mesh_obj('foxing', bm, 'foxing'))

        # ---------------- upper: loft, subdivide, cut the opening, thickness
        bm = self.loft(0.0, 1.0, 34, 18)
        up = mesh_obj('upper', bm, 'upper')
        sub = up.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
        apply_mods(up)
        bm = bmesh.new(); bm.from_mesh(up.data)
        kill = [f for f in bm.faces if self.in_opening(f.calc_center_median())]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
        # relax the cut edge so the opening is a smooth curve, not a staircase
        edge = [v for v in bm.verts if v.is_boundary and v.co.z > self.SOLE + 0.02]
        for _ in range(6):
            bmesh.ops.smooth_vert(bm, verts=edge, factor=0.6, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        loop = self.boundary_loop(bm)
        bm.to_mesh(up.data); bm.free()
        so = up.modifiers.new('solid', 'SOLIDIFY'); so.thickness = 0.003; so.offset = -1; so.use_rim = True
        apply_mods(up)
        parts.append(up)

        # ---------------- padded collar following the opening edge
        if loop:
            cu = bpy.data.curves.new('collar', 'CURVE'); cu.dimensions = '3D'
            sp = cu.splines.new('POLY'); sp.points.add(len(loop) - 1)
            for i, p in enumerate(loop):
                sp.points[i].co = (*p, 1)
            sp.use_cyclic_u = True
            cu.bevel_depth = 0.011 if self.CH else (0.008 if self.HI else 0.0065)
            cu.bevel_resolution = 3
            ob = bpy.data.objects.new('collar', cu); bpy.context.scene.collection.objects.link(ob)
            ob.data.materials.append(MATS['upper'])
            parts.append(self.to_mesh(ob))

        # ---------------- tongue: a curved padded slab out of the throat
        bm = bmesh.new()
        tz0 = 0.4 if not self.HI else 0.33
        rows = []
        NT = 10
        for j in range(NT + 1):
            s = j / NT
            t = tz0 + (0.62 - tz0) * (1 - s)                       # s = 0 low in the throat → 1 top
            _, (x0, ytop, zz) = self.surf(t, math.pi / 2)
            y = ytop + 0.002 + s * s * (0.012 if self.HI else 0.01) + (0.003 if self.CH else 0)
            z = zz - s * 0.02
            hw = 0.022 + 0.004 * s + (0.004 if self.CH else 0)
            rows.append([bm.verts.new(G(hw * (i / 3 - 1), y - 0.004 * abs(i / 3 - 1) ** 2, z)) for i in range(7)])
        for j in range(NT):
            for i in range(6):
                bm.faces.new([rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]])
        tg = mesh_obj('tongue', bm, 'upper')
        so = tg.modifiers.new('solid', 'SOLIDIFY'); so.thickness = 0.009 if self.CH else 0.006; so.offset = -1
        sub = tg.modifiers.new('sub', 'SUBSURF'); sub.levels = 1
        apply_mods(tg)
        parts.append(tg)

        # ---------------- suede overlays: toe cap & heel counter
        toe = self.loft(0.74, 1.0, 12, 18, inflate=0.0018)
        o = mesh_obj('toecap', toe, 'accent'); s2 = o.modifiers.new('sub', 'SUBSURF'); s2.levels = 1; apply_mods(o); parts.append(o)
        heel_top = (0.06 if not self.HI else 0.1) + self.puff
        heel = self.loft(0.0, 0.24, 10, 18, inflate=0.0018, keep=lambda c: c.z < heel_top)
        o = mesh_obj('heel', heel, 'accent'); s2 = o.modifiers.new('sub', 'SUBSURF'); s2.levels = 1; apply_mods(o); parts.append(o)

        # ---------------- eyelets + criss-cross laces
        rows = 7 if self.HI else 5
        t_hi = 0.36 if self.HI else 0.44
        pts = []
        for k in range(rows):
            t = t_hi + (0.66 - t_hi) * k / (rows - 1)
            pr = []
            for a in (math.pi / 2 - 0.42, math.pi / 2 + 0.42):
                p, _ = self.surf(t, a, inflate=0.003)
                pr.append(p)
            pts.append(pr)
        for pr in pts:
            for p in pr:
                bpy.ops.mesh.primitive_torus_add(major_radius=0.0034, minor_radius=0.0011, major_segments=10, minor_segments=4, location=p)
                e = bpy.context.active_object; e.data.materials.append(MATS['metal']); parts.append(e)
        cu = bpy.data.curves.new('laces', 'CURVE'); cu.dimensions = '3D'
        def seg(a, b):
            sp = cu.splines.new('BEZIER'); sp.bezier_points.add(1)
            mid = (a + b) / 2 + Vector((0, 0, 0.004))
            for bp, p in zip(sp.bezier_points, (a, b)):
                bp.co = p; bp.handle_left = bp.handle_right = p + (mid - p) * 0.5
        for k in range(rows - 1):
            seg(pts[k][0], pts[k + 1][1])
            seg(pts[k][1], pts[k + 1][0])
        seg(pts[0][0], pts[0][1])
        cu.bevel_depth = 0.0019; cu.bevel_resolution = 1; cu.resolution_u = 6
        ob = bpy.data.objects.new('laces', cu); bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(MATS['lace'])
        parts.append(self.to_mesh(ob))
        # a bow-less tuck: two short lace ends on the top row
        return parts

    def boundary_loop(self, bm):
        """ordered points of the opening's edge (the longest high boundary loop)"""
        bm.edges.ensure_lookup_table()
        bnd = [e for e in bm.edges if e.is_boundary and min(v.co.z for v in e.verts) > self.SOLE + 0.02]
        if not bnd:
            return None
        adj = {}
        for e in bnd:
            a, b = e.verts
            adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
        start = max(adj, key=lambda v: v.co.z)
        loop, prev, cur = [start], None, start
        while True:
            nxt = [v for v in adj.get(cur, []) if v is not prev]
            if not nxt or nxt[0] is start or len(loop) > 2000:
                break
            prev, cur = cur, nxt[0]
            loop.append(cur)
        # push it slightly out and down so the tube sits on the lip
        return [tuple(v.co + Vector((0, 0, -0.002))) for v in loop]

    def to_mesh(self, ob):
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.convert(target='MESH')
        return bpy.context.active_object


for style in ('vulc', 'hightop', 'chunky'):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    MATS.clear()
    for n, c in (('upper', (0.9, 0.9, 0.9)), ('accent', (0.7, 0.7, 0.7)), ('sole', (0.95, 0.93, 0.88)),
                 ('foxing', (0.1, 0.1, 0.1)), ('lace', (0.95, 0.95, 0.95)), ('metal', (0.5, 0.52, 0.55))):
        MATS[n] = mat(n, c)
    parts = Shoe(style).build()
    for o in bpy.context.scene.objects:
        o.select_set(o.type == 'MESH')
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    shoe = bpy.context.active_object
    shoe.name = 'shoe_' + style
    tris = sum(len(p.vertices) - 2 for p in shoe.data.polygons)
    path = os.path.join(OUT, f'shoe_{style}.gltf')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLTF_SEPARATE', export_yup=True, export_apply=True,
                              export_normals=True, export_materials='EXPORT', use_selection=False)
    print(f'{style}: {tris} tris → {path}', flush=True)
