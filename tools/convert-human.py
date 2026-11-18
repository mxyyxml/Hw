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
MALE = [('universal-male-young-maxmuscle-averageweight.target', 0.42),
        ('male-young-averagemuscle-averageweight-idealproportions.target', 0.7),
        ('female-young-averagemuscle-averageweight-mincup-averagefirmness.target', 1.0),   # flat chest
        # athletic skater build: V-shaped back, broader chest & shoulders, slimmer
        # hips and a flatter seat (all MakeHuman modelling targets, CC0)
        ('torso-vshape-incr.target', 0.55),
        ('torso-scale-horiz-incr.target', 0.25),
        ('hip-scale-horiz-decr.target', 0.5),
        ('buttocks-volume-decr.target', 0.7),
        ('torso-muscle-pectoral-decr.target', 0.45),
        ('neck-scale-horiz-incr.target', 0.3),
        ('l-upperarm-shoulder-muscle-incr.target', 0.4),
        ('r-upperarm-shoulder-muscle-incr.target', 0.4),
        ('caucasian-male-young.target', 0.5)]               # male face & frame
# a real young woman: female face and figure (chest, waist, hips), fit and sporty
FEMALE = [('caucasian-female-young.target', 1.0),
          ('female-young-averagemuscle-averageweight-idealproportions.target', 0.6),
          ('female-young-averagemuscle-averageweight-maxcup-averagefirmness.target', 0.45),
          ('universal-female-young-maxmuscle-averageweight.target', 0.25)]

def read_target(path):
    t = {}
    for line in open(path):
        if line.startswith('#') or not line.strip():
            continue
        a = line.split()
        t[int(a[0])] = (float(a[1]), float(a[2]), float(a[3]))
    return t

V, VT, groups, body_faces, body_fvt = [], [], {}, [], []
cur = None
for line in open(src):
    if line.startswith('v '):
        V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '):
        VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '):
        cur = line.split()[1]
    elif line.startswith('f '):
        idx = [int(p.split('/')[0]) - 1 for p in line.split()[1:]]
        if cur == 'body':
            body_faces.append(idx)
            body_fvt.append([int(p.split('/')[1]) - 1 for p in line.split()[1:]])
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

def centre(name, VV=None):
    VV = VV or V
    idx = groups['joint-' + name]
    return [sum(VV[i][k] for i in idx) / len(idx) for k in range(3)]

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
JB = {k: to_body(v) for k, v in J.items()}
# the woman keeps her natural proportions (same scale as the man), stands on y = 0
# and gets her own joints: the game re-fits the skeleton to her body
JF = {n: centre(n, VF) for n in J}
legF = dist(JF['l-upper-leg'], JF['l-knee']) + dist(JF['l-knee'], JF['l-ankle'])
SF, yminF, zcF = S, min(VF[i][1] for i in used), JF['pelvis'][2]
to_bodyF = lambda p: [p[0] * SF, (p[1] - yminF) * SF, (p[2] - zcF) * SF]
PF = [to_bodyF(VF[i]) for i in used]
JBF = {k: to_bodyF(v) for k, v in JF.items()}

# ---- sculpt: MakeHuman's base has a strong lower-back sway and very prominent
# glutes. Flatten the seat and fill the lumbar curve a little so the silhouette
# reads as a normal athletic young guy (and jeans hang straight from the seat).
def sculpt(points, k):
    hipY, waistY = JB['l-upper-leg'][1], JB['spine-4'][1]
    g = lambda y, c, s_: math.exp(-((y - c) / s_) ** 2)
    for p in points:
        if p[2] >= 0:
            continue
        x, y = p[0], p[1]
        if abs(x) > 0.2 and y < waistY:               # hanging arms/hands: leave alone
            continue
        seat = 0.24 * g(y, hipY + 0.005, 0.075)        # biggest at the widest part of the seat
        fold = 0.1 * g(y, hipY - 0.07, 0.04)           # tighter under-butt fold
        lumbar = 0.16 * g(y, waistY + 0.13, 0.05)      # fill the small of the back
        p[2] *= 1 - k * (seat + fold) + k * lumbar
sculpt(P, 0.45)
sculpt(PF, 0.1)

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
ZONES = {'hips': (0, 0.3), 'torso': (0.2, 0.12), 'head': (0.15, 0), 'sh': (0.22, 0.09), 'el': (0.09, 0),
         'leg': (0.1, 0.09), 'knee': (0.09, 0.18), 'foot': (0.2, 0)}

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
    # Blend zones (fraction of the bone's length) where skin is shared with the
    # parent / child bone. Short zones at knees, elbows and hips give a real crease
    # instead of a rubbery bend; longer zones at the waist and shoulders keep the
    # torso and deltoids smooth.
    w = {bi: 1.0}
    parent = BONES[bi][3]
    z0, z1 = ZONES[BONES[bi][0][:-1] if BONES[bi][0][-1] in 'LR' else BONES[bi][0]]
    ss = lambda x: x * x * (3 - 2 * x)
    if z0 and t < z0 and parent is not None:
        k = 0.5 + 0.5 * ss(t / z0)
        w = {bi: k, parent: 1 - k}
    elif z1 and t > 1 - z1 and bi in CHILD:
        k = 0.5 + 0.5 * ss((1 - t) / z1)
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

tris, corner_vt = [], []
for f, ft in zip(body_faces, body_fvt):
    f = [remap[i] for i in f]
    for k in range(1, len(f) - 1):
        tris += [f[0], f[k], f[k + 1]]
        corner_vt += [ft[0], ft[k], ft[k + 1]]
vt_used = sorted(set(corner_vt)); vt_map = {o: n for n, o in enumerate(vt_used)}

# ---- proxies (CC0 MakeHuman assets: hair, eyebrows, eyelashes) -----------------
# A proxy vertex sits on a triangle of the base mesh: w0*V[r0] + w1*V[r1] + w2*V[r2]
# plus an offset scaled by the body's size, so it fits any body shape.
pdir = sys.argv[4] if len(sys.argv) > 4 else None
PROXIES = ['short02', 'short04', 'bob02', 'long01', 'ponytail01', 'afro01', 'eyebrow001', 'eyelashes01']
def fit_proxy(name):
    refs, scl = [], {}
    lines = open(os.path.join(pdir, name, name + '.mhclo')).read().split('\n')
    i = 0
    while i < len(lines):
        a = lines[i].split()
        if a and a[0] in ('x_scale', 'y_scale', 'z_scale'):
            scl[a[0][0]] = (int(a[1]), int(a[2]), float(a[3]))
        if a and a[0] == 'verts':
            i += 1
            def num(b):
                try: [float(c) for c in b]; return len(b) in (1, 9)
                except ValueError: return False
            while i < len(lines) and not num(lines[i].split()): i += 1   # (a 'material' line may sit in between)
            while i < len(lines):
                b = lines[i].split()
                if not num(b): break
                refs.append(([int(b[0])], [1.0], [0, 0, 0]) if len(b) == 1 else ([int(x) for x in b[:3]], [float(x) for x in b[3:6]], [float(x) for x in b[6:9]]))
                i += 1
            continue
        i += 1
    pv, pvt, faces = [], [], []
    for line in open(os.path.join(pdir, name, name + '.obj')):
        if line.startswith('v '): pv.append(1)
        elif line.startswith('vt '): pvt.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('f '):
            faces.append([(int(q.split('/')[0]) - 1, int(q.split('/')[1]) - 1) for q in line.split()[1:]])
    assert len(refs) == len(pv), (name, len(refs), len(pv))
    def place(VV, tb):
        sc = [abs(VV[scl[ax][0]][k] - VV[scl[ax][1]][k]) / scl[ax][2] for k, ax in enumerate('xyz')]
        out = []
        for r, w, d in refs:
            q = [sum(VV[r[j]][k] * w[j] for j in range(len(r))) + d[k] * sc[k] for k in range(3)]
            out.append(tb(q))
        return out
    PM, PFm = place(V, to_body), place(VF, to_bodyF)
    # split vertices on UV seams
    key, verts, idx = {}, [], []
    for f in faces:
        ids = []
        for c in f:
            if c not in key: key[c] = len(verts); verts.append(c)
            ids.append(key[c])
        for k in range(1, len(ids) - 1): idx += [ids[0], ids[k], ids[k + 1]]
    pos, fdel, uvs, si, sw = [], [], [], [], []
    for v, t in verts:
        pos += PM[v]; fdel += [max(-32767, min(32767, int(round((PFm[v][k] - PM[v][k]) * 1000)))) for k in range(3)]
        uvs += pvt[t]
        # skin weights: blend those of the base vertices it sits on (head bone if they're helpers)
        acc = {}
        r, w, _ = refs[v]
        for j in range(len(r)):
            if r[j] in remap:
                b = remap[r[j]]
                for c in range(4): acc[skin_i[b][c]] = acc.get(skin_i[b][c], 0) + skin_w[b][c] * abs(w[j])
        if not acc: acc = {2: 1.0}
        top = sorted(acc.items(), key=lambda x: -x[1])[:4]
        while len(top) < 4: top.append((0, 0))
        tot = sum(x for _, x in top) or 1
        q = [int(round(255 * x / tot)) for _, x in top]; q[0] += 255 - sum(q)
        si += [i for i, _ in top]; sw += q
    return {'positions': b64('f', pos), 'femaleDelta': b64('h', fdel), 'uv': b64('f', uvs), 'indices': b64('H', idx),
            'skinIndex': b64('B', si), 'skinWeight': b64('B', sw), 'count': len(verts)}

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
    # photo-skin UVs: per-triangle-corner index into 'uv' (the body mesh is welded; the skin splits on seams)
    'uv': b64('f', [c for o in vt_used for c in VT[o]]),
    'cornerUV': b64('H', [vt_map[o] for o in corner_vt]),
    'proxies': {n: fit_proxy(n) for n in PROXIES} if pdir else {},
    'joints': {k: [round(x, 5) for x in v] for k, v in JB.items()},
    'jointsF': {k: [round(x, 5) for x in v] for k, v in JBF.items()},
}
with open(dst, 'w') as fh:
    fh.write('// Generated by tools/convert-human.py from the MakeHuman base mesh (CC0 1.0).\n')
    fh.write('// A realistic human body for the skater. Do not edit by hand.\n')
    fh.write('export const HUMAN = ' + json.dumps(out) + ';\n')
print('vertices', len(P), 'triangles', len(tris) // 3, 'scale', round(S, 5),
      'height', round(max(p[1] for p in P), 3), 'file', dst)
