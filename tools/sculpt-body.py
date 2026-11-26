# =============================================================================
#  sculpt-body.py — high-detail sculpt of the skater's body in Blender, baked to
#  a tangent-space normal map on the game mesh's skin UVs (the usual game-art
#  workflow: sculpt high, bake onto the low-poly model).
#
#    node tools/export-body.mjs <dir>            # skin_male.obj / skin_female.obj
#    python tools/sculpt-body.py <dir> <out-dir> # (Blender's Python module: pip install bpy)
#
#  The sculpt, per body:
#    * Catmull-Clark subdivision ×2 (≈ 210k faces) of the welded body
#    * anatomy definition: an "unsharp mask" on the surface — the difference
#      between the body and a heavily relaxed copy is pushed further out, which
#      deepens the grooves between muscles (deltoid, pecs, abs, forearm,
#      quads, calves), collarbones, knuckles, kneecaps and the face's planes
#    * fine skin: low-amplitude noise for pores / skin grain
#  Output: <out-dir>/skin_n_<shape>.png (2048², OpenGL / three.js convention).
# =============================================================================
import bpy, bmesh, os, sys, time
from mathutils import Vector

D, OUT = sys.argv[1], sys.argv[2]
RES = 2048
DEFINE = {'male': 0.9, 'female': 0.55}       # how strongly muscle forms are sharpened


def read_obj(path):
    V, T, F = [], [], []
    for line in open(path):
        p = line.split()
        if not p:
            continue
        if p[0] == 'v':
            V.append(tuple(map(float, p[1:4])))
        elif p[0] == 'vt':
            T.append(tuple(map(float, p[1:3])))
        elif p[0] == 'f':
            F.append([tuple(int(x) - 1 for x in c.split('/')) for c in p[1:4]])
    return V, T, F


def build_low(name, V, T, F):
    me = bpy.data.meshes.new(name)
    me.from_pydata(V, [], [[c[0] for c in f] for f in F])
    uvl = me.uv_layers.new(name='UV')
    for poly, f in zip(me.polygons, F):
        for li, c in zip(poly.loop_indices, f):
            uvl.data[li].uv = T[c[1]]
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def sculpt_high(low, amount):
    hi = low.copy(); hi.data = low.data.copy(); hi.name = 'high'
    bpy.context.scene.collection.objects.link(hi)
    bm = bmesh.new(); bm.from_mesh(hi.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.to_mesh(hi.data); bm.free()
    sub = hi.modifiers.new('sub', 'SUBSURF'); sub.levels = sub.render_levels = 2
    bpy.context.view_layer.objects.active = hi
    bpy.ops.object.modifier_apply(modifier='sub')
    me = hi.data
    n = len(me.vertices)
    P = [v.co.copy() for v in me.vertices]
    N = [v.normal.copy() for v in me.vertices]
    nb = [[] for _ in range(n)]
    for e in me.edges:
        a, b = e.vertices
        nb[a].append(b); nb[b].append(a)
    # relaxed copy: many Laplacian passes melt the muscle forms away
    S = [p.copy() for p in P]
    for _ in range(40):
        S = [S[i] * 0.4 + sum((S[j] for j in nb[i]), Vector()) * (0.6 / len(nb[i])) if nb[i] else S[i] for i in range(n)]
    # unsharp mask along the normal: grooves get deeper, forms read stronger
    for i, v in enumerate(me.vertices):
        d = (P[i] - S[i]).dot(N[i])
        d = max(-0.006, min(0.006, d))
        v.co = P[i] + N[i] * d * amount
    me.update()
    # skin grain: tiny noise displacement (pores read in the bake as soft grain)
    tex = bpy.data.textures.new('pores', 'VORONOI'); tex.noise_scale = 0.0025; tex.distance_metric = 'DISTANCE'
    dm = hi.modifiers.new('pores', 'DISPLACE'); dm.texture = tex; dm.strength = 0.00025; dm.mid_level = 0.5
    bpy.ops.object.modifier_apply(modifier='pores')
    for p in me.polygons:
        p.use_smooth = True
    return hi


def bake(low, hi, path):
    img = bpy.data.images.new('nrm', RES, RES, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    m = bpy.data.materials.new('bake'); m.use_nodes = True
    node = m.node_tree.nodes.new('ShaderNodeTexImage'); node.image = img
    m.node_tree.nodes.active = node
    low.data.materials.clear(); low.data.materials.append(m)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = 0.012
    sc.render.bake.max_ray_distance = 0.03
    sc.render.bake.margin = 8
    sc.render.bake.normal_space = 'TANGENT'
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True); low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type='NORMAL')
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()


os.makedirs(OUT, exist_ok=True)
for shape in ('male', 'female'):
    t = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    V, T, F = read_obj(os.path.join(D, f'skin_{shape}.obj'))
    low = build_low('low', V, T, F)
    hi = sculpt_high(low, DEFINE[shape])
    print(f'{shape}: sculpt {len(hi.data.polygons)} faces in {time.time() - t:.0f}s', flush=True)
    bake(low, hi, os.path.join(OUT, f'skin_n_{shape}.png'))
    print(f'{shape}: baked in {time.time() - t:.0f}s', flush=True)
