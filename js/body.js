// =============================================================================
//  body.js — the skater's human body as ONE smooth skinned mesh.
//  The body is a set of tapered tubes (torso, neck, arms, legs) built around a
//  skeleton. Vertices near a joint are shared between the two bones on either
//  side (skin weights), so elbows, knees, shoulders and hips bend smoothly
//  like a real body instead of being separate blocks. Clothing is applied by
//  splitting the triangles into skin / top / pants material groups.
// =============================================================================
import * as THREE from 'three';

// Bone order used for skinning (see Skater constructor)
export const B = { hips: 0, torso: 1, head: 2, shL: 3, elL: 4, shR: 5, elR: 6, legL: 7, kneeL: 8, footL: 9, legR: 10, kneeR: 11, footR: 12 };

const SEGS = 14; // vertices around each ring

// Ring profiles: [y, radiusX, radiusZ, weights{bone: w}, zOffset]
// All positions are in the skater's body space at rest (standing, arms down).
function torsoRings() {
  const T = (y, rx, rz, w, z = 0) => [y, rx, rz, w, z];
  return {
    pelvis: [   // hips & waistband (pants)
      T(0.69, 0.11, 0.085, { [B.hips]: 1 }),
      T(0.74, 0.158, 0.1, { [B.hips]: 1 }),
      T(0.81, 0.168, 0.106, { [B.hips]: 1 }, -0.005),
      T(0.88, 0.158, 0.1, { [B.hips]: 0.8, [B.torso]: 0.2 }),
      T(0.92, 0.152, 0.097, { [B.hips]: 0.6, [B.torso]: 0.4 }),
    ],
    torso: [    // shirt / hoodie (slightly bigger so it sits over the pants)
      T(0.86, 0.163, 0.104, { [B.hips]: 0.8, [B.torso]: 0.2 }),
      T(0.96, 0.153, 0.1, { [B.hips]: 0.4, [B.torso]: 0.6 }),
      T(1.05, 0.158, 0.103, { [B.hips]: 0.1, [B.torso]: 0.9 }),
      T(1.14, 0.172, 0.112, { [B.torso]: 1 }, 0.006),
      T(1.22, 0.186, 0.117, { [B.torso]: 1 }, 0.01),
      T(1.29, 0.192, 0.108, { [B.torso]: 1 }, 0.004),
      T(1.345, 0.168, 0.094, { [B.torso]: 1 }),
      T(1.385, 0.1, 0.075, { [B.torso]: 0.85, [B.head]: 0.15 }),
      T(1.405, 0.062, 0.058, { [B.torso]: 0.6, [B.head]: 0.4 }),
    ],
    neck: [
      T(1.39, 0.06, 0.056, { [B.torso]: 0.7, [B.head]: 0.3 }),
      T(1.45, 0.052, 0.05, { [B.torso]: 0.2, [B.head]: 0.8 }, 0.005),
      T(1.53, 0.05, 0.048, { [B.head]: 1 }, 0.01),
    ],
  };
}

function legRings(side) { // side: -1 = left (bone L), +1 = right
  const leg = side < 0 ? B.legL : B.legR, knee = side < 0 ? B.kneeL : B.kneeR, foot = side < 0 ? B.footL : B.footR;
  const x = side * 0.09;
  const R = (y, rx, rz, w, z = 0) => [y, rx, rz, w, z, x];
  return {
    thigh: [
      R(0.86, 0.075, 0.085, { [B.hips]: 0.6, [leg]: 0.4 }),
      R(0.78, 0.088, 0.094, { [B.hips]: 0.25, [leg]: 0.75 }),
      R(0.66, 0.084, 0.09, { [leg]: 1 }),
      R(0.54, 0.073, 0.079, { [leg]: 1 }),
      R(0.44, 0.064, 0.068, { [leg]: 0.8, [knee]: 0.2 }, 0.004),
      R(0.38, 0.06, 0.064, { [leg]: 0.5, [knee]: 0.5 }, 0.006),
    ],
    shin: [
      R(0.39, 0.059, 0.063, { [leg]: 0.5, [knee]: 0.5 }, 0.006),
      R(0.33, 0.06, 0.066, { [leg]: 0.15, [knee]: 0.85 }),
      R(0.25, 0.062, 0.07, { [knee]: 1 }, -0.008),       // calf
      R(0.14, 0.048, 0.052, { [knee]: 1 }),
      R(0.05, 0.039, 0.042, { [knee]: 0.7, [foot]: 0.3 }),
      R(0.0, 0.04, 0.044, { [knee]: 0.4, [foot]: 0.6 }),
    ],
  };
}

function armRings(side) {
  const sh = side < 0 ? B.shL : B.shR, el = side < 0 ? B.elL : B.elR;
  const x = side * 0.228;
  const R = (y, rx, rz, w, z = 0) => [y, rx, rz, w, z, x];
  return {
    upperArm: [
      R(1.36, 0.05, 0.05, { [B.torso]: 0.6, [sh]: 0.4 }),
      R(1.31, 0.062, 0.06, { [B.torso]: 0.3, [sh]: 0.7 }),
      R(1.22, 0.056, 0.055, { [sh]: 1 }),
      R(1.1, 0.048, 0.048, { [sh]: 1 }),
      R(1.03, 0.044, 0.045, { [sh]: 0.65, [el]: 0.35 }),
      R(0.995, 0.043, 0.044, { [sh]: 0.5, [el]: 0.5 }),
    ],
    foreArm: [
      R(1.0, 0.043, 0.044, { [sh]: 0.5, [el]: 0.5 }),
      R(0.96, 0.045, 0.044, { [sh]: 0.2, [el]: 0.8 }),
      R(0.87, 0.04, 0.038, { [el]: 1 }),
      R(0.76, 0.03, 0.026, { [el]: 1 }),
      R(0.725, 0.029, 0.025, { [el]: 1 }),
    ],
  };
}

// Builds tubes; returns geometry plus a per-triangle part name list
function buildGeometry() {
  const pos = [], uv = [], skinIndex = [], skinWeight = [], tris = []; // tris: [a,b,c,part]
  const addRing = (r) => {
    const [y, rx, rz, w, zoff = 0, xc = 0] = r;
    const entries = Object.entries(w).map(([k, v]) => [+k, v]);
    while (entries.length < 4) entries.push([0, 0]);
    const start = pos.length / 3;
    for (let j = 0; j < SEGS; j++) {
      const a = (j / SEGS) * Math.PI * 2;
      pos.push(xc + Math.sin(a) * rx, y, zoff + Math.cos(a) * rz);
      uv.push(j / SEGS * 2, y * 4);
      skinIndex.push(entries[0][0], entries[1][0], entries[2][0], entries[3][0]);
      skinWeight.push(entries[0][1], entries[1][1], entries[2][1], entries[3][1]);
    }
    return start;
  };
  const addCap = (ringStart, r, part, up) => {
    const [y, , , w, zoff = 0, xc = 0] = r;
    const entries = Object.entries(w).map(([k, v]) => [+k, v]);
    while (entries.length < 4) entries.push([0, 0]);
    const c = pos.length / 3;
    pos.push(xc, y + (up ? 0.01 : -0.01), zoff); uv.push(0.5, y * 4);
    skinIndex.push(...entries.map((e) => e[0])); skinWeight.push(...entries.map((e) => e[1]));
    for (let j = 0; j < SEGS; j++) {
      const a = ringStart + j, b = ringStart + (j + 1) % SEGS;
      tris.push(up ? [c, a, b, part] : [c, b, a, part]);
    }
  };
  const tube = (rings, part, capBottom, capTop) => {
    // rings are listed in any vertical order; sort top → bottom for consistent winding
    const sorted = rings.slice().sort((p, q) => q[0] - p[0]);
    const starts = sorted.map(addRing);
    for (let i = 0; i < starts.length - 1; i++) {
      const s0 = starts[i], s1 = starts[i + 1];
      for (let j = 0; j < SEGS; j++) {
        const a = s0 + j, b = s0 + (j + 1) % SEGS, c = s1 + j, d = s1 + (j + 1) % SEGS;
        tris.push([a, c, b, part], [b, c, d, part]);
      }
    }
    if (capTop) addCap(starts[0], sorted[0], part, true);
    if (capBottom) addCap(starts[starts.length - 1], sorted[sorted.length - 1], part, false);
  };
  const t = torsoRings();
  tube(t.pelvis, 'pelvis', true, false);
  tube(t.torso, 'torso', false, true);
  tube(t.neck, 'neck', false, true);
  for (const side of [-1, 1]) {
    const L = legRings(side), A = armRings(side);
    tube(L.thigh, 'thigh', false, true);
    tube(L.shin, 'shin', true, false);
    tube(A.upperArm, 'upperArm', false, true);
    tube(A.foreArm, 'foreArm', true, false);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  return { g, tris };
}

// mats: { skin, top, pants }  →  returns { mesh, setOutfit(outfit) }
export function buildBody(bones, mats, parent) {
  const { g, tris } = buildGeometry();
  // fill the index buffer grouped by material: 0 = skin, 1 = top, 2 = pants
  const regionOf = (part, o) => {
    switch (part) {
      case 'neck': return 0;
      case 'torso': case 'upperArm': return 1;
      case 'foreArm': return o.top === 'tee' ? 0 : 1;
      case 'pelvis': case 'thigh': return 2;
      case 'shin': return o.pants === 'shorts' ? 0 : 2;
    }
    return 0;
  };
  const setOutfit = (o) => {
    const lists = [[], [], []];
    for (const [a, b, c, part] of tris) lists[regionOf(part, o)].push(a, b, c);
    g.setIndex([...lists[0], ...lists[1], ...lists[2]]);
    g.clearGroups();
    g.addGroup(0, lists[0].length, 0);
    g.addGroup(lists[0].length, lists[1].length, 1);
    g.addGroup(lists[0].length + lists[1].length, lists[2].length, 2);
    g.computeVertexNormals();
  };
  setOutfit({});
  const mesh = new THREE.SkinnedMesh(g, [mats.skin, mats.top, mats.pants]);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  parent.add(mesh);
  parent.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton, mesh.matrixWorld);
  return { mesh, setOutfit };
}
