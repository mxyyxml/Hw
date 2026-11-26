# =============================================================================
#  cloth-sim.py — drape every garment with Blender's cloth simulator.
#
#  Input: a folder of OBJs dumped from the game (bind pose): body_<shape>.obj,
#  joints_<shape>.json and <shape>_<top|pants>_<style>.obj (the garment exactly
#  as the game builds it). Each garment is simulated as real cloth over its body
#  (gravity, body collision, a little extra fabric so it buckles into folds,
#  pinned at the collar / waistband), and the per-vertex movement is written to
#  bake.json. tools/bake-cloth.mjs packs that into js/clothBake.js.
#
#  Run (Blender's Python module, `pip install bpy`):
#     python cloth-sim.py <folder> [only-this-key ...]
# =============================================================================
import bpy, json, os, sys, time

D = sys.argv[1]
ONLY = set(sys.argv[2:])
SMOOTH = 4

# per style: extra fabric (negative shrink = grow), bending stiffness, mass
LOOSE = {
    'tee': (0.025, 1.0), 'bigtee': (0.05, 0.8), 'tank': (0.015, 0.8), 'longsleeve': (0.025, 1.0), 'crewneck': (0.03, 1.6),
    'hoodie': (0.04, 2.0), 'ziphoodie': (0.04, 2.0), 'flannel': (0.035, 1.4), 'jacket': (0.03, 3.0), 'windbreaker': (0.06, 1.0),
    'jersey': (0.04, 0.8), 'jeans': (0.03, 2.0), 'baggy': (0.06, 1.6), 'skinny': (0.01, 2.0), 'cargo': (0.05, 1.6),
    'chinos': (0.03, 1.6), 'shorts': (0.035, 1.4), 'boardshorts': (0.05, 1.0),
}


def read_obj(path):
    V, F = [], []
    with open(path) as f:
        for line in f:
            p = line.split()
            if not p:
                continue
            if p[0] == 'v':
                V.append(tuple(float(x) for x in p[1:4]))
            elif p[0] == 'f':
                F.append(tuple(int(x) - 1 for x in p[1:4]))
    return V, F


def make(name, V, F):
    me = bpy.data.meshes.new(name)
    me.from_pydata(V, [], F)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def smooth(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def simulate(key, gpath, body, J):
    shape, kind, style = key.split(':')
    V, F = read_obj(gpath)
    cloth = make('cloth', V, F)
    # pin weights: collar / shoulders for tops, waistband for bottoms; a light
    # pull everywhere else keeps it from sliding down the A-posed arms
    vg = cloth.vertex_groups.new(name='pin')
    for i, (x, y, z) in enumerate(V):
        if kind == 'top':
            w = 0.06 + 0.94 * smooth(J['shY'] - 0.06, J['neckY'], y)
        else:
            w = 0.06 + 0.94 * smooth(J['waistY'] - 0.1, J['waistY'] - 0.02, y)
        vg.add([i], w, 'REPLACE')
    grow, bend = LOOSE.get(style, (0.05, 0.6))
    m = cloth.modifiers.new('Cloth', 'CLOTH')
    s = m.settings
    s.quality = 8
    s.mass = 0.25
    s.tension_stiffness = s.compression_stiffness = 12
    s.shear_stiffness = 6
    s.bending_stiffness = bend
    s.air_damping = 2
    s.shrink_min = -grow                  # grown fabric buckles into folds against the body
    s.vertex_group_mass = 'pin'
    s.pin_stiffness = 2
    c = m.collision_settings
    c.distance_min = 0.004
    c.collision_quality = 4
    c.use_self_collision = True
    c.self_distance_min = 0.003
    m.point_cache.frame_start = 1
    m.point_cache.frame_end = 60
    scene = bpy.context.scene
    for f in range(1, 61):
        scene.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = cloth.evaluated_get(dg)
    # the game mesh is coarse: keep the big folds, drop vertex-level jitter (most
    # visible on the free hems) by relaxing the movement field over the mesh
    n = len(V)
    dl = [[ev.data.vertices[i].co[k] - V[i][k] for k in range(3)] for i in range(n)]
    nb = [set() for _ in range(n)]
    for a, b, c in F:
        nb[a].update((b, c)); nb[b].update((a, c)); nb[c].update((a, b))
    for _ in range(SMOOTH):
        dl = [[0.5 * dl[i][k] + 0.5 * sum(dl[j][k] for j in nb[i]) / len(nb[i]) if nb[i] else dl[i][k] for k in range(3)] for i in range(n)]
    out = [0] * (n * 3)
    for i in range(n):
        for k in range(3):
            d = dl[i][k] * 1e4                   # 0.1 mm units
            out[i * 3 + k] = int(max(-32000, min(32000, round(d))))
    bpy.data.objects.remove(cloth, do_unlink=True)
    return len(V), out


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.gravity = (0, -9.81, 0)              # the game's world is Y-up
scene.frame_start, scene.frame_end = 1, 60
bake_path = os.path.join(D, 'bake.json')
bake = json.load(open(bake_path)) if os.path.exists(bake_path) else {}
for shape in ('male', 'female'):
    bpath = os.path.join(D, f'body_{shape}.obj')
    if not os.path.exists(bpath):
        continue
    BV, BF = read_obj(bpath)
    body = make('body_' + shape, BV, BF)
    col = body.modifiers.new('Collision', 'COLLISION')
    body.collision.thickness_outer = 0.004
    body.collision.cloth_friction = 8
    J = json.load(open(os.path.join(D, f'joints_{shape}.json')))
    for fn in sorted(os.listdir(D)):
        if not fn.startswith(shape + '_') or not fn.endswith('.obj'):
            continue
        key = fn[:-4].replace('_', ':', 2)
        if ONLY and key not in ONLY:
            continue
        t = time.time()
        n, d = simulate(key, os.path.join(D, fn), body, J)
        bake[key] = {'n': n, 'd': d}
        mx = max(abs(x) for x in d) / 1e4
        print(f'{key}: {n} verts, max move {mx * 100:.1f} cm, {time.time() - t:.1f}s', flush=True)
        json.dump(bake, open(bake_path, 'w'))
    bpy.data.objects.remove(body, do_unlink=True)
