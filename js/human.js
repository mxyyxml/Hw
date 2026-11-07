// =============================================================================
//  human.js — fits the realistic MakeHuman body (CC0, see humanData.js) onto the
//  skater's skeleton. The mesh is skinned to the same 13 bones the animation
//  drives, so every pose, push, flip, grind and ragdoll moves a real human body.
//  Clothes are painted on by body region (top / pants / shoes / skin) and given a
//  little thickness so they sit over the skin.
// =============================================================================
import * as THREE from 'three';
import { HUMAN } from './humanData.js';

const dec = (b64, Type) => {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Type(u8.buffer);
};
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const DOWN = new THREE.Vector3(0, -1, 0);

// regions written by the converter
const R = { head: 0, neck: 1, collar: 2, torso: 3, upperArm: 4, foreArm: 5, hand: 6, pelvis: 7, thigh: 8, shin: 9, foot: 10, hair: 11 };

// material slot per region for an outfit: 0 skin, 1 top, 2 pants, 3 shoes, 4 hair
function slot(r, o) {
  switch (r) {
    case R.hair: return 4;
    case R.collar: return o.top === 'tank' ? 0 : 1;
    case R.torso: return 1;
    case R.upperArm: return o.top === 'tank' ? 0 : 1;
    case R.foreArm: return (o.top === 'tee' || o.top === 'tank') ? 0 : 1;
    case R.pelvis: case R.thigh: return 2;
    case R.shin: return o.pants === 'shorts' ? 0 : 2;
    case R.foot: return 3;
    default: return 0;
  }
}
// cloth thickness (m) per material slot
const THICK = [0, 0.006, 0.009, 0.008, 0.005];

// Re-shape the skeleton to the human's proportions and set the bind pose.
// Returns the leg measurements the animation needs.
export function fitSkeleton(sk) {
  const J = {};
  for (const [k, v] of Object.entries(HUMAN.joints)) J[k] = V(v);
  const hipsY = (J['l-upper-leg'].y + J['r-upper-leg'].y) / 2;
  sk.hips.position.set(0, hipsY, 0);
  sk.torso.position.copy(J['spine-4']).sub(new THREE.Vector3(0, hipsY, 0)).setX(0);
  sk.head.position.copy(J.neck).sub(J['spine-4']).setX(0);
  const qWorld = (from, to) => new THREE.Quaternion().setFromUnitVectors(DOWN, to.clone().sub(from).normalize());
  const sides = [['r', 0], ['l', 1]];          // game index 0 = character's right (x < 0)
  let thigh = 0, shin = 0;
  for (const [s, i] of sides) {
    // legs
    const L = sk.legs[i], up = J[s + '-upper-leg'], kn = J[s + '-knee'], an = J[s + '-ankle'];
    L.hip.position.set(up.x, up.y - hipsY, up.z);
    thigh = up.distanceTo(kn); shin = kn.distanceTo(an);
    L.knee.position.set(0, -thigh, 0);
    L.foot.position.set(0, -shin, 0);
    const qh = qWorld(up, kn), qk = qWorld(kn, an);
    L.hip.quaternion.copy(qh);
    L.knee.quaternion.copy(qh.clone().invert().multiply(qk));
    L.foot.quaternion.copy(qk.clone().invert());            // feet flat in the bind pose
    // arms
    const A = sk.arms[i], sh = J[s + '-shoulder'], el = J[s + '-elbow'], wr = J[s + '-hand'];
    A.sh.position.copy(sh).sub(J['spine-4']);
    A.el.position.set(0, -sh.distanceTo(el), 0);
    if (A.hand) A.hand.position.set(0, -el.distanceTo(wr), 0);
    const qs = qWorld(sh, el), qe = qWorld(el, wr);
    A.sh.quaternion.copy(qs);
    A.el.quaternion.copy(qs.clone().invert().multiply(qe));
  }
  return {
    thigh, shin,
    footH: J['l-ankle'].y,                          // ankle height above the soles
    hipX: Math.abs(J['l-upper-leg'].x),
    joints: J,
  };
}

// Build the skinned human body. mats: { skin, top, pants, shoe }
export function buildHuman(sk, mats) {
  const n = HUMAN.count;
  const male = dec(HUMAN.positions, Float32Array);
  const fd = HUMAN.femaleDelta ? dec(HUMAN.femaleDelta, Int16Array) : null;
  const female = new Float32Array(male.length);
  for (let i = 0; i < male.length; i++) female[i] = male[i] + (fd ? fd[i] / 1000 : 0);
  let base = male;
  const index = dec(HUMAN.indices, Uint16Array);
  const si = dec(HUMAN.skinIndex, Uint8Array), sw = dec(HUMAN.skinWeight, Uint8Array);
  const reg = dec(HUMAN.regions, Uint8Array);
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(male);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(si), 4));
  const wf = new Float32Array(sw.length);
  for (let i = 0; i < sw.length; i++) wf[i] = sw[i] / 255;
  g.setAttribute('skinWeight', new THREE.BufferAttribute(wf, 4));
  // simple cylindrical UVs so the fabric textures wrap around limbs and torso
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
    uv[i * 2] = (Math.atan2(x, z) / Math.PI + 1) * 1.5; uv[i * 2 + 1] = y * 4;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.computeVertexNormals();
  let baseNormals = g.attributes.normal.array.slice();
  let shape = 'male';

  // triangle region = majority of its corners
  const triReg = new Uint8Array(index.length / 3);
  for (let t = 0; t < triReg.length; t++) {
    const a = reg[index[t * 3]], b = reg[index[t * 3 + 1]], c = reg[index[t * 3 + 2]];
    let r = (a === b || a === c) ? a : (b === c ? b : a);
    // clean waistline: shirt vs jeans decided by the triangle's centre height, not its corners
    const tset = new Set([a, b, c]);
    if (tset.has(R.torso) && tset.has(R.pelvis)) {
      const cy = (male[index[t * 3] * 3 + 1] + male[index[t * 3 + 1] * 3 + 1] + male[index[t * 3 + 2] * 3 + 1]) / 3;
      r = cy < HUMAN.joints['spine-4'][1] + 0.005 ? R.pelvis : R.torso;
    }
    triReg[t] = r;
  }

  const setOutfit = (o) => {
    // body shape (Closet → Body): swap the base positions and their normals
    const want = o.body === 'female' ? 'female' : 'male';
    if (want !== shape) {
      shape = want; base = want === 'female' ? female : male;
      pos.set(base); g.setIndex(new THREE.BufferAttribute(index, 1)); g.computeVertexNormals();
      baseNormals = g.attributes.normal.array.slice();
    }
    // regroup triangles by material and give clothes a little thickness
    const lists = [[], [], [], [], []];
    for (let t = 0; t < triReg.length; t++) lists[slot(triReg[t], o)].push(index[t * 3], index[t * 3 + 1], index[t * 3 + 2]);
    for (let i = 0; i < n; i++) {
      const th = THICK[slot(reg[i], o)];
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = base[i * 3 + k] + baseNormals[i * 3 + k] * th;
    }
    g.attributes.position.needsUpdate = true;
    const all = new Uint16Array(index.length);
    let off = 0;
    g.clearGroups();
    lists.forEach((L, m) => { all.set(L, off); g.addGroup(off, L.length, m); off += L.length; });
    g.setIndex(new THREE.BufferAttribute(all, 1));
    g.computeVertexNormals();
  };
  setOutfit({});

  // Seam covers: a waistband, jean hems at the ankles and shoe soles, fitted to
  // the body's real size at those heights (they hide the paint line between
  // clothes and look like proper garments).
  const slab = (yc, dy, test) => {
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, c = 0;
    for (let i = 0; i < n; i++) {
      const x = male[i * 3], y = male[i * 3 + 1], z = male[i * 3 + 2];
      if (Math.abs(y - yc) > dy || !test(x, z)) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); c++;
    }
    return c ? { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, rx: (maxX - minX) / 2, rz: (maxZ - minZ) / 2 } : null;
  };
  const J = HUMAN.joints;
  const ring = (bone, worldY, e, h, mat) => {
    if (!e) return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, h, 24, 1, true).scale(e.rx + 0.012, 1, e.rz + 0.012), mat);
    m.material.side = THREE.DoubleSide;
    m.castShadow = true;
    // bone-local position of the ring (bind pose)
    const wp = new THREE.Vector3(e.cx, worldY, e.cz);
    bone.updateMatrixWorld(true);
    sk.body.updateMatrixWorld(true);
    const bodyToBone = new THREE.Matrix4().copy(bone.matrixWorld).invert().multiply(sk.body.matrixWorld);
    m.position.copy(wp.applyMatrix4(bodyToBone));
    m.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(bodyToBone));
    bone.add(m);
    return m;
  };
  const waistY = J['spine-4'][1] + 0.005;
  sk.seams = [];
  sk.seams.push(ring(sk.hips, waistY + 0.004, slab(waistY, 0.012, (x) => Math.abs(x) < J['l-upper-leg'][0] + 0.12), 0.06, mats.belt));
  for (const [s, i] of [['r', 0], ['l', 1]]) {
    const ay = J[s + '-ankle'][1] + 0.035, side = i ? 1 : -1;
    const hem = ring(sk.legs[i].knee, ay, slab(ay, 0.01, (x) => x * side > 0.03), 0.03, mats.pants);
    if (hem) { hem.userData.hem = true; sk.seams.push(hem); }
  }
  const mesh = new THREE.SkinnedMesh(g, [mats.skin, mats.top, mats.pants, mats.shoe, mats.hair]);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  sk.body.add(mesh);
  sk.root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(sk.bones), mesh.matrixWorld);
  return { mesh, setOutfit };
}
