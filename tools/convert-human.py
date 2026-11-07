#!/usr/bin/env python3
"""
tools/convert-human.py — turns the MakeHuman base mesh (CC0, makehumancommunity.org)
into js/humanData.js for the skater.

  * keeps only the 'body' surface (drops helper / joint-marker geometry)
  * scales it so hip-to-ankle = 0.84 m (the game's leg length) and puts the soles at y = 0
  * reads the joint marker centres (hips, knees, ankles, shoulders, elbows, wrists, neck, eyes)
  * computes smooth skin weights for the game's 13-bone skeleton (blended near every joint)
  * labels each vertex with a body region so clothes can be painted on (top / pants / shoes / skin)

Usage:  python3 tools/convert-human.py base.obj js/humanData.js [folder-with-target-files]
        (targets from makehuman/data/targets/: macrodetails/, breast/, macrodetails/proportions/)
"""
import sys, base64, json, math, struct

src, dst = sys.argv[1], sys.argv[2]
# optional 3rd argument: folder holding MakeHuman .target files (all CC0)
tdir = sys.argv[3] if len(sys.argv) > 3 else None
MALE = [('universal-male-young-maxmuscle-averageweight.target', 0.6),
        ('female-young-averagemuscle-averageweight-mincup-averagefirmness.target', 1.0),   # flat chest
        ('male-young-averagemuscle-averageweight-idealproportions.target', 0.7)]
FEMALE = [('universal-female-young-maxmuscle-averageweight.target', 0.4)]

def read_target(path):
    t = {}
    for line in open(path):
        if line.startswith('#') or not line.strip():
            continue
        a = line.split()
        t[int(a[0])] = (float(a[1]), float(a[2]), float(a[3]))
    return t

V, groups, body_faces = [], {}, []
cur = None
for line in open(src):
    if line.startswith('v '):
        V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('g '):
        cur = line.split()[1]
    elif line.startswith('f '):
        idx = [int(p.split('/')[0]) - 1 for p in line.split()[1:]]
        if cur == 'body':
            body_faces.append(idx)
        else:
            groups.setdefault(cur, set()).update(idx)

# athletic male body = base + male target; the female body is stored as a delta
import os
V0 = [v[:] for v in V]
VF = [v[:] for v in V0]
if tdir:
    for name, w in MALE:
        for i, d in read_target(os.path.join(tdir, name)).items():
            for k in range(3): V[i][k] += d[k] * w
    for name, w in FEMALE:
        for i, d in read_target(os.path.join(tdir, name)).items():
            for k in range(3): VF[i][k] += d[k] * w

def centre(name):
    idx = groups['joint-' + name]
    return [sum(V[i][k] for i in idx) / len(idx) for k in range(3)]

J = {n: centre(n) for n in [
    'pelvis', 'spine-4', 'spine-3', 'neck', 'head', 'head-2',
    'l-upper-leg', 'l-knee', 'l-ankle', 'l-foot-2', 'r-upper-leg', 'r-knee', 'r-ankle', 'r-foot-2',
    'l-shoulder', 'l-elbow', 'l-hand', 'l-hand-2', 'r-shoulder', 'r-elbow', 'r-hand', 'r-hand-2',
    'l-eye', 'r-eye', 'mouth']}
J['l-knee'] = J['l-knee']; J['spine-4'] = J['spine-4']

used = sorted({i for f in body_faces for i in f})
remap = {old: new for new, old in enumerate(used)}
ymin = min(V[i][1] for i in used)
dist = lambda a, b: math.sqrt(sum((a[k] - b[k]) ** 2 for k in range(3)))
leg_len = dist(J['l-upper-leg'], J['l-knee']) + dist(J['l-knee'], J['l-ankle'])
S = 0.84 / leg_len
zc = J['pelvis'][2]
to_body = lambda p: [p[0] * S, (p[1] - ymin) * S, (p[2] - zc) * S]
P = [to_body(V[i]) for i in used]
PF = [to_body(VF[i]) for i in used]
JB = {k: to_body(v) for k, v in J.items()}

# ---- bones (game order) as segments: start joint → end joint, parent, side (+x = character's left)
hips_bot = [0, JB['l-upper-leg'][1] - 0.06, JB['pelvis'][2]]
BONES = [
    ('hips', hips_bot, JB['spine-4'], None, 0),
    ('torso', JB['spine-4'], JB['neck'], 0, 0),
    ('head', JB['neck'], JB['head-2'], 1, 0),
    ('shR', JB['r-shoulder'], JB['r-elbow'], 1, -1), ('elR', JB['r-elbow'], JB['r-hand-2'], 3, -1),
    ('shL', JB['l-shoulder'], JB['l-elbow'], 1, 1), ('elL', JB['l-elbow'], JB['l-hand-2'], 5, 1),
    ('legR', JB['r-upper-leg'], JB['r-knee'], 0, -1), ('kneeR', JB['r-knee'], JB['r-ankle'], 7, -1), ('footR', JB['r-ankle'], JB['r-foot-2'], 8, -1),
    ('legL', JB['l-upper-leg'], JB['l-knee'], 0, 1), ('kneeL', JB['l-knee'], JB['l-ankle'], 10, 1), ('footL', JB['l-ankle'], JB['l-foot-2'], 11, 1),
]
CHILD = {0: 1, 1: 2, 3: 4, 5: 6, 7: 8, 8: 9, 10: 11, 11: 12}

def seg_t_d(p, a, b):
    ab = [b[k] - a[k] for k in range(3)]
    L2 = sum(x * x for x in ab) or 1e-9
    t = max(0.0, min(1.0, sum((p[k] - a[k]) * ab[k] for k in range(3)) / L2))
    q = [a[k] + ab[k] * t for k in range(3)]
    return t, dist(p, q)

shoulder_x = abs(JB['l-shoulder'][0])
skin_i, skin_w, region = [], [], []
# regions: 0 head/face, 1 neck, 2 collar, 3 torso, 4 upperArm, 5 foreArm, 6 hand, 7 pelvis, 8 thigh, 9 shin, 10 foot
for p in P:
    best = None
    for bi, (name, a, b, parent, side) in enumerate(BONES):
        if side and p[0] * side < 0.02:          # limbs only on their own side of the body
            continue
        if name in ('hips', 'torso', 'head') and abs(p[0]) > shoulder_x + 0.02 and p[1] < JB['neck'][1]:
            continue                               # arm hanging beside the hip isn't torso
        t, d = seg_t_d(p, a, b)
        if name == 'head' and p[1] < JB['neck'][1] - 0.01:
            d += 0.05
        if best is None or d < best[0]:
            best = (d, bi, t)
    d, bi, t = best
    w = {bi: 1.0}
    parent = BONES[bi][3]
    if t < 0.22 and parent is not None:
        k = 0.5 + t / 0.44
        w = {bi: k, parent: 1 - k}
    elif t > 0.78 and bi in CHILD:
        k = 0.5 + (1 - t) / 0.44
        w = {bi: k, CHILD[bi]: 1 - k}
    items = sorted(w.items(), key=lambda x: -x[1])[:4]
    while len(items) < 4:
        items.append((0, 0.0))
    skin_i.append([i for i, _ in items])
    tot = sum(x for _, x in items) or 1
    q = [int(round(255 * x / tot)) for _, x in items]
    q[0] += 255 - sum(q)
    skin_w.append(q)
    name = BONES[bi][0]
    # clean cut lines (waistband, hems, sleeves) instead of jagged bone borders
    waistY = JB['spine-4'][1] + 0.005
    eye = JB['l-eye']
    if name == 'head':
        hair = p[1] > eye[1] + 0.042 or (p[1] > eye[1] - 0.07 and p[2] < eye[2] - 0.115)
        r = 11 if hair else (1 if p[1] < JB['neck'][1] + 0.05 else 0)
    elif name in ('torso', 'hips'):
        if p[1] < waistY: r = 7
        elif p[1] > JB['l-shoulder'][1] - 0.03: r = 2
        else: r = 3
    elif name.startswith('sh') or name.startswith('el'):
        s_ = 'l' if name.endswith('L') else 'r'
        ta, _ = seg_t_d(p, JB[s_ + '-shoulder'], JB[s_ + '-hand'])
        r = 4 if ta < 0.47 else (6 if ta > 0.93 else 5)
    else:
        s_ = 'l' if name.endswith('L') else 'r'
        if p[1] < JB[s_ + '-ankle'][1] + 0.035: r = 10
        elif p[1] > JB[s_ + '-knee'][1] + 0.04: r = 8
        else: r = 9
    region.append(r)

tris = []
for f in body_faces:
    f = [remap[i] for i in f]
    for k in range(1, len(f) - 1):
        tris += [f[0], f[k], f[k + 1]]

b64 = lambda fmt, arr: base64.b64encode(struct.pack('<%d%s' % (len(arr), fmt), *arr)).decode()
out = {
    'source': 'MakeHuman base mesh (CC0 1.0) — makehumancommunity.org',
    'count': len(P),
    'positions': b64('f', [c for p in P for c in p]),
    # female body as int16 millimetre offsets from the male one
    'femaleDelta': b64('h', [max(-32767, min(32767, int(round((PF[i][k] - P[i][k]) * 1000)))) for i in range(len(P)) for k in range(3)]),
    'indices': b64('H', tris),
    'skinIndex': b64('B', [c for s in skin_i for c in s]),
    'skinWeight': b64('B', [c for s in skin_w for c in s]),
    'regions': b64('B', region),
    'joints': {k: [round(x, 5) for x in v] for k, v in JB.items()},
}
with open(dst, 'w') as fh:
    fh.write('// Generated by tools/convert-human.py from the MakeHuman base mesh (CC0 1.0).\n')
    fh.write('// A realistic human body for the skater. Do not edit by hand.\n')
    fh.write('export const HUMAN = ' + json.dumps(out) + ';\n')
print('vertices', len(P), 'triangles', len(tris) // 3, 'scale', round(S, 5),
      'height', round(max(p[1] for p in P), 3), 'file', dst)
