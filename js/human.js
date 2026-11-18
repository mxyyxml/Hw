// =============================================================================
//  human.js — fits the realistic MakeHuman body (CC0, see humanData.js) onto the
//  skater's skeleton. The mesh is skinned to the same 13 bones the animation
//  drives, so every pose, push, flip, grind and ragdoll moves a real human body.
//
//  Clothes, hair, brows and facial hair are real layers on top of the skin:
//  each one is CUT out of the body surface along a smooth line (a neckline, a
//  sleeve end, a hem, a hairline) — triangles crossing the line are split
//  exactly on it, so edges are clean curves instead of a jagged paint border.
//  The cut piece is then pushed out from the skin (loose where fabric hangs,
//  tight where it's held) and given a folded hem so the fabric has thickness.
//  Every layer is skinned to the same bones, so it moves with the body.
// =============================================================================
import * as THREE from 'three';
import { HUMAN } from './humanData.js';
import { assetURL } from './textures.js';

// textures for the MakeHuman assets (photo skin, hair / brow / lash cut-outs, eyes)
const _tex = {};
export function humanTex(name, srgb = true) {
  if (_tex[name]) return _tex[name];
  const t = new THREE.Texture(); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  const img = new Image(); img.onload = () => { t.image = img; t.needsUpdate = true; }; img.src = assetURL('assets/human/' + name);
  return (_tex[name] = t);
}

const dec = (b64, Type) => {
  const bin = atob(b64), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Type(u8.buffer);
};
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const DOWN = new THREE.Vector3(0, -1, 0);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// regions written by the converter
const R = { head: 0, neck: 1, collar: 2, torso: 3, upperArm: 4, foreArm: 5, hand: 6, pelvis: 7, thigh: 8, shin: 9, foot: 10, hair: 11 };
const ARM = (r) => r === R.upperArm || r === R.foreArm || r === R.hand;
const HEAD = (r) => r === R.head || r === R.neck || r === R.hair;

// ---- garment styles ----------------------------------------------------------
// sleeve: where the sleeve ends along the arm (0 shoulder → 1 wrist), null = none
// base: fabric thickness, drape: extra looseness toward the hem, sleeveLoose:
// extra room at the sleeve end, hem: how far below the waist the top hangs
export const TOPS = {
  none:       null,
  tank:       { sleeve: null, base: 0.0035, drape: 0.006, sleeveLoose: 0, hem: 0.07, neck: 'scoop' },
  tee:        { sleeve: 0.36, base: 0.007, drape: 0.014, sleeveLoose: 0.012, hem: 0.09, neck: 'crew' },
  bigtee:     { sleeve: 0.47, base: 0.011, drape: 0.026, sleeveLoose: 0.02, hem: 0.16, neck: 'crew' },
  longsleeve: { sleeve: 0.9, base: 0.006, drape: 0.01, sleeveLoose: 0.006, hem: 0.09, neck: 'crew' },
  hoodie:     { sleeve: 0.9, base: 0.014, drape: 0.022, sleeveLoose: 0.008, hem: 0.11, neck: 'hood', cuff: true },
  jacket:     { sleeve: 0.92, base: 0.016, drape: 0.02, sleeveLoose: 0.012, hem: 0.1, neck: 'collar' },
  flannel:    { sleeve: 0.9, base: 0.009, drape: 0.018, sleeveLoose: 0.01, hem: 0.12, neck: 'collar' },
  jersey:     { sleeve: 0.3, base: 0.008, drape: 0.02, sleeveLoose: 0.02, hem: 0.12, neck: 'vee' },
};
// rise: waistband height vs the natural waist, hem: 'ankle' | 'knee' | 'calf',
// base: thickness, bag: extra room down the leg, flare: extra room at the hem
export const PANTS = {
  jeans:  { rise: -0.005, hem: 'ankle', base: 0.007, bag: 0.008, flare: 0.006 },
  skinny: { rise: -0.01, hem: 'ankle', base: 0.0045, bag: 0, flare: 0 },
  baggy:  { rise: -0.03, hem: 'ankle', base: 0.011, bag: 0.03, flare: 0.022 },
  cargo:  { rise: -0.01, hem: 'ankle', base: 0.011, bag: 0.022, flare: 0.012 },
  shorts: { rise: -0.01, hem: 'knee', base: 0.009, bag: 0.016, flare: 0.012 },
  chinos: { rise: 0, hem: 'calf', base: 0.007, bag: 0.01, flare: 0.004 },
};
// hair: shell thickness on top / at the sides, plus hanging strand cards
export const HAIR = {
  bald:     null,
  buzz:     { top: 0.0018, side: 0.0014 },
  mohawk:   { top: 0.05, side: 0.0015, clump: 0.008, strip: 0.03 },
  // real modelled hair (MakeHuman CC0 proxies) over a thin hair-coloured scalp
  short:    { top: 0.002, side: 0.0016, proxy: 'short02' },
  crop:     { top: 0.002, side: 0.0016, proxy: 'short04' },
  flow:     { top: 0.002, side: 0.0016, proxy: 'bob02' },
  long:     { top: 0.002, side: 0.0016, proxy: 'long01' },
  ponytail: { top: 0.002, side: 0.0016, proxy: 'ponytail01' },
  curly:    { top: 0.004, side: 0.002, proxy: 'afro01' },
};

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

// ---- procedural strand textures (hair shell & hair cards) --------------------
let _hairTex = null, _cardTex = null;
function hairTextures() {
  if (_hairTex) return { shell: _hairTex, card: _cardTex };
  const rnd = mulberry(7);
  // shell: fine vertical streaks, light/dark (tinted by hair colour)
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#b8b8b8'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    const px = rnd() * 256, len = 30 + rnd() * 120, py = rnd() * 256, l = 120 + rnd() * 135;
    x.strokeStyle = `rgba(${l},${l},${l},${0.25 + rnd() * 0.4})`; x.lineWidth = 0.6 + rnd() * 1.4;
    x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + (rnd() - 0.5) * 10, py + len / 2, px + (rnd() - 0.5) * 6, py + len); x.stroke();
  }
  _hairTex = new THREE.CanvasTexture(c);
  _hairTex.wrapS = _hairTex.wrapT = THREE.RepeatWrapping; _hairTex.colorSpace = THREE.SRGBColorSpace;
  // cards: strands with alpha, thick at the root (top), thin & sparse at the tips
  const d = document.createElement('canvas'); d.width = 128; d.height = 256;
  const y = d.getContext('2d');
  y.clearRect(0, 0, 128, 256);
  for (let i = 0; i < 260; i++) {
    const px = 6 + rnd() * 116, len = 150 + rnd() * 106, l = 130 + rnd() * 125, w = 1 + rnd() * 2.2;
    const g = y.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(${l},${l},${l},1)`); g.addColorStop(0.75, `rgba(${l},${l},${l},0.9)`); g.addColorStop(1, `rgba(${l},${l},${l},0)`);
    y.strokeStyle = g; y.lineWidth = w;
    const bend = (rnd() - 0.5) * 18;
    y.beginPath(); y.moveTo(px, 0); y.quadraticCurveTo(px + bend, len * 0.5, px + bend * 1.6, len); y.stroke();
  }
  _cardTex = new THREE.CanvasTexture(d); _cardTex.colorSpace = THREE.SRGBColorSpace;
  return { shell: _hairTex, card: _cardTex };
}
export { hairTextures };
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Build the skinned human body. sk = the Skater (bones, .mat for current materials)
export function buildHuman(sk) {
  const n = HUMAN.count;
  const male = dec(HUMAN.positions, Float32Array);
  const fd = HUMAN.femaleDelta ? dec(HUMAN.femaleDelta, Int16Array) : null;
  const female = new Float32Array(male.length);
  for (let i = 0; i < male.length; i++) female[i] = male[i] + (fd ? fd[i] / 1000 : 0);
  const index = dec(HUMAN.indices, Uint16Array);
  const si = dec(HUMAN.skinIndex, Uint8Array), sw = dec(HUMAN.skinWeight, Uint8Array);
  const swf = new Float32Array(sw.length);
  for (let i = 0; i < sw.length; i++) swf[i] = sw[i] / 255;
  const reg = dec(HUMAN.regions, Uint8Array);
  const J = HUMAN.joints;
  const eyeY = J['l-eye'][1], eyeZ = J['l-eye'][2], eyeX = J['l-eye'][0], mouthY = J.mouth[1];
  const neckY = J.neck[1], shY = J['l-shoulder'][1], shX = J['l-shoulder'][0];
  const waistY = J['spine-4'][1], hipY = J['l-upper-leg'][1], kneeY = J['l-knee'][1], ankleY = J['l-ankle'][1];
  const headC = [0, (eyeY + J['head-2'][1]) / 2 - 0.02, eyeZ - 0.09];

  // per-vertex arm parameter: 0 at the shoulder → 1 at the wrist (arm regions only)
  const armT = new Float32Array(n);
  const shoulder = { l: V(J['l-shoulder']), r: V(J['r-shoulder']) }, wrist = { l: V(J['l-hand']), r: V(J['r-hand']) };
  const tmp = new THREE.Vector3();

  // ---------------------------------------------------------------- the skin
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(male);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(si), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(swf, 4));
  const uv = new Float32Array(n * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  let base = null, normals = null, shape = null;
  const useShape = (want) => {
    if (want === shape) return;
    shape = want; base = want === 'female' ? female : male;
    pos.set(base); g.setIndex(new THREE.BufferAttribute(index, 1)); g.computeVertexNormals();
    normals = g.attributes.normal.array.slice();
    for (let i = 0; i < n; i++) {
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      uv[i * 2] = (Math.atan2(x, z) / Math.PI + 1) * 1.5; uv[i * 2 + 1] = y * 4;
      if (ARM(reg[i])) {
        const s = x > 0 ? 'l' : 'r', a = shoulder[s], b = wrist[s];
        tmp.set(b.x - a.x, b.y - a.y, b.z - a.z);
        armT[i] = ((x - a.x) * tmp.x + (y - a.y) * tmp.y + (z - a.z) * tmp.z) / tmp.lengthSq();
      } else armT[i] = -1;
    }
    g.attributes.uv.needsUpdate = true;
  };
  // the visible skin: split on UV seams so the photo skin texture maps cleanly
  // (g stays welded: it gives seam-free normals and drives the clothing cuts)
  const cuv = dec(HUMAN.cornerUV, Uint16Array), uvs = dec(HUMAN.uv, Float32Array);
  const skey = new Map(), sv = [], suv = [], cornerS = new Uint32Array(index.length);
  for (let k = 0; k < index.length; k++) {
    const key = index[k] * 65536 + cuv[k];
    let id = skey.get(key);
    if (id === undefined) { id = sv.length; skey.set(key, id); sv.push(index[k]); suv.push(uvs[cuv[k] * 2], uvs[cuv[k] * 2 + 1]); }
    cornerS[k] = id;
  }
  const ns = sv.length, gs = new THREE.BufferGeometry();
  const spos = new Float32Array(ns * 3), snrm = new Float32Array(ns * 3), ssi = new Uint16Array(ns * 4), ssw = new Float32Array(ns * 4);
  for (let j = 0; j < ns; j++) for (let c = 0; c < 4; c++) { ssi[j * 4 + c] = si[sv[j] * 4 + c]; ssw[j * 4 + c] = swf[sv[j] * 4 + c]; }
  gs.setAttribute('position', new THREE.BufferAttribute(spos, 3));
  gs.setAttribute('normal', new THREE.BufferAttribute(snrm, 3));
  gs.setAttribute('skinIndex', new THREE.BufferAttribute(ssi, 4));
  gs.setAttribute('skinWeight', new THREE.BufferAttribute(ssw, 4));
  gs.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
  const syncSkin = () => {
    for (let j = 0; j < ns; j++) for (let c = 0; c < 3; c++) { spos[j * 3 + c] = base[sv[j] * 3 + c]; snrm[j * 3 + c] = normals[sv[j] * 3 + c]; }
    gs.attributes.position.needsUpdate = true; gs.attributes.normal.needsUpdate = true;
    gs.computeBoundingSphere();
  };
  useShape('male'); syncSkin();

  // MakeHuman proxies (hair styles, eyebrows, eyelashes), fitted to the body by the converter
  const proxyGeo = {};
  const proxy = (name, female) => {
    const P = HUMAN.proxies && HUMAN.proxies[name];
    if (!P) return null;
    const k = name + (female ? 'F' : 'M');
    if (proxyGeo[k]) return proxyGeo[k];
    const p = dec(P.positions, Float32Array).slice();
    if (female) { const d = dec(P.femaleDelta, Int16Array); for (let i = 0; i < p.length; i++) p[i] += d[i] / 1000; }
    const w = dec(P.skinWeight, Uint8Array), wf = new Float32Array(w.length);
    for (let i = 0; i < w.length; i++) wf[i] = w[i] / 255;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(dec(P.uv, Float32Array), 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(Array.from(dec(P.skinIndex, Uint8Array)), 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(wf, 4));
    geo.setIndex(new THREE.BufferAttribute(dec(P.indices, Uint16Array), 1));
    geo.computeVertexNormals();
    return (proxyGeo[k] = geo);
  };

  // ---------------------------------------------------------------- fields
  // f < 0 = covered by the layer. All are smooth functions of position so the
  // cut lines are smooth curves.
  const topField = (i, T) => {
    const r = reg[i];
    if (r === R.head || r === R.hair || r === R.foot) return 1;
    const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2], ax = Math.abs(x);
    const front = sstep(-0.02, 0.06, z);
    if (ARM(r)) {
      if (T.sleeve === null) return Math.max(0.02, 0.2 - armT[i]);
      return armT[i] - T.sleeve;
    }
    let f = (waistY - T.hem) - y;                                        // hem
    // neckline
    let ny;
    const bell = (w) => Math.max(0, 1 - (ax / w) * (ax / w));
    if (T.neck === 'scoop') ny = shY + 0.035 - 0.15 * front * bell(0.115) - 0.06 * (1 - front) * bell(0.1);
    else if (T.neck === 'vee') ny = neckY - 0.02 - 0.1 * front * Math.max(0, 1 - ax / 0.07);
    else if (T.neck === 'hood') ny = neckY - 0.005 - 0.03 * front * bell(0.08);
    else if (T.neck === 'collar') ny = neckY + 0.012 - 0.07 * front * Math.max(0, 1 - ax / 0.055);
    else ny = neckY - 0.022 - 0.035 * front * bell(0.075);
    f = Math.max(f, y - ny);
    if (T.sleeve === null) {
      // tank armhole: an oval around the shoulder joint, leaving a strap on top
      const ex = (ax - (shX + 0.02)) / 0.095, ey = (y - (shY - 0.07)) / 0.15;
      f = Math.max(f, 1 - Math.sqrt(ex * ex + ey * ey)) ;
      if (r === R.upperArm || armT[i] > 0.02) f = Math.max(f, 0.02);
    }
    return f;
  };
  const topThick = (i, T, f) => {
    const y = base[i * 3 + 1];
    let th = T.base;
    if (ARM(reg[i])) th += T.sleeveLoose * sstep(0.05, Math.max(0.1, T.sleeve || 0.1), armT[i]) + (T.cuff ? 0.006 * sstep(T.sleeve - 0.06, T.sleeve, armT[i]) : 0);
    else {
      // fabric hangs straight down from the chest instead of hugging the waist
      th += T.drape * sstep(0, 1, (shY - 0.12 - y) / Math.max(0.05, shY - 0.12 - (waistY - T.hem)));
      // sit over the jeans' waistband where they overlap
      th += 0.016 * sstep(waistY + 0.06, waistY + 0.01, y);
    }
    return th;
  };
  const pantsField = (i, P) => {
    const r = reg[i];
    if (ARM(r) || HEAD(r)) return 1;
    const y = base[i * 3 + 1];
    const hemY = P.hem === 'knee' ? kneeY + 0.03 : P.hem === 'calf' ? ankleY + 0.1 : ankleY + 0.035;
    return Math.max(y - (waistY + P.rise), hemY - y);
  };
  const pantsThick = (i, P) => {
    const y = base[i * 3 + 1];
    const leg = sstep(hipY - 0.02, hipY - 0.2, y);                        // 0 at the seat → 1 on the legs
    const lower = sstep(kneeY + 0.1, ankleY + 0.05, y);                   // toward the hem
    return P.base + P.bag * leg * (0.6 + 0.4 * lower) + P.flare * lower + 0.004 * sstep(waistY - 0.03, waistY, y);
  };
  const hairField = (i, H, hat) => {
    const r = reg[i];
    if (!HEAD(r)) return 1;
    const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
    // hairline: high on the forehead, dropping behind the ears to the nape
    const back = sstep(eyeZ - 0.07, eyeZ - 0.135, z);
    let line = eyeY + 0.068 - 0.014 * Math.min(1, (Math.abs(x) / 0.055) ** 2) + back * -0.105
      + 0.004 * Math.sin(x * 140 + 1) + 0.003 * Math.sin(x * 310);    // a slightly irregular hairline
    // sideburns in front of the ears
    const ear = Math.exp(-(((z - (eyeZ - 0.1)) / 0.018) ** 2)) * sstep(0.055, 0.07, Math.abs(x));
    line -= ear * 0.045;
    let f = line - y;
    if (H.strip) f = Math.max(f, Math.abs(x) - H.strip - (y < eyeY + 0.02 ? 0.04 : 0));
    if (hat) f = Math.max(f, y - (eyeY + 0.03));          // under a hat only the edge shows
    return f;
  };
  const browField = (i) => {
    const r = reg[i];
    if (r !== R.head && r !== R.hair) return 1;
    const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
    if (z < eyeZ - 0.03) return 1;
    const dx = (Math.abs(x) - eyeX * 1.08) / 0.024;
    const yc = eyeY + 0.024 + 0.004 * (1 - dx * dx) - 0.003 * dx;
    const dy = (y - yc) / (0.0034 + 0.0016 * (1 - dx));
    return Math.sqrt(dx * dx + dy * dy) - 1;
  };
  const beardField = (i, style) => {
    const r = reg[i];
    if (r !== R.head && r !== R.neck) return 1;
    const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2], ax = Math.abs(x);
    if (z < eyeZ - 0.105) return 1;
    // lips stay bare
    const lip = 1 - Math.hypot(x / 0.027, (y - (mouthY - 0.003)) / 0.0105);
    if (style === 'mustache') return Math.max(Math.hypot(x / 0.034, (y - (mouthY + 0.013)) / 0.008) - 1, lip, eyeZ - 0.04 - z);
    if (style === 'goatee') {
      const ring = Math.max(ax - 0.03 - 0.006 * sstep(mouthY, mouthY - 0.05, y), (mouthY - 0.07) - y, y - (mouthY + 0.022));
      return Math.max(ring, lip, eyeZ - 0.055 - z);
    }
    // full beard / stubble: cheeks below the cheekbones, jaw, chin and under the chin
    const cheek = eyeY - 0.04 - 0.02 * sstep(0.02, 0.06, ax);
    return Math.max(y - cheek, (mouthY - 0.085) - y + 0.02 * sstep(eyeZ - 0.02, eyeZ - 0.09, z), lip);
  };

  // ---------------------------------------------------------------- clipping
  // Cut the body surface where field < 0. thick(i, f) = how far each vertex is
  // pushed out. Returns a skinned BufferGeometry (with a folded hem) or null.
  const layer = (field, thick, opts = {}) => {
    const F = new Float32Array(n);
    for (let i = 0; i < n; i++) F[i] = field(i);
    const P = [], N = [], SI = [], SW = [], UV = [], TH = [], OUT = [];
    const vmap = new Int32Array(n).fill(-1), emap = new Map();
    const addV = (i) => {
      if (vmap[i] >= 0) return vmap[i];
      const k = P.length / 3; vmap[i] = k;
      P.push(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]); N.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
      for (let c = 0; c < 4; c++) { SI.push(si[i * 4 + c]); SW.push(swf[i * 4 + c]); }
      UV.push(uv[i * 2], uv[i * 2 + 1]); TH.push(thick(i, F[i]));
      return k;
    };
    const cut = (a, b) => {
      const key = a < b ? a * n + b : b * n + a;
      if (emap.has(key)) return emap.get(key);
      const t = F[a] / (F[a] - F[b]);
      const k = P.length / 3;
      for (let c = 0; c < 3; c++) { P.push(base[a * 3 + c] + (base[b * 3 + c] - base[a * 3 + c]) * t); N.push(normals[a * 3 + c] + (normals[b * 3 + c] - normals[a * 3 + c]) * t); }
      // blend the two skin-weight sets, keep the 4 strongest
      const w = new Map();
      for (const [v, s] of [[a, 1 - t], [b, t]]) for (let c = 0; c < 4; c++) { const bi = si[v * 4 + c], ww = swf[v * 4 + c] * s; if (ww > 0) w.set(bi, (w.get(bi) || 0) + ww); }
      const top = [...w.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
      let tot = 0; for (const e of top) tot += e[1];
      for (let c = 0; c < 4; c++) { SI.push(top[c] ? top[c][0] : 0); SW.push(top[c] ? top[c][1] / tot : 0); }
      let du = uv[b * 2] - uv[a * 2];
      if (Math.abs(du) > 1.5) du = 0;                    // don't interpolate across the texture wrap
      UV.push(uv[a * 2] + du * t, uv[a * 2 + 1] + (uv[b * 2 + 1] - uv[a * 2 + 1]) * t);
      TH.push(thick(a, 0) * (1 - t) + thick(b, 0) * t);
      emap.set(key, k);
      return k;
    };
    const tris = [];
    for (let t = 0; t < index.length; t += 3) {
      const v = [index[t], index[t + 1], index[t + 2]];
      const inside = v.map((i) => F[i] < 0);
      const cnt = inside[0] + inside[1] + inside[2];
      if (cnt === 0) continue;
      if (cnt === 3) { tris.push(addV(v[0]), addV(v[1]), addV(v[2])); continue; }
      // Sutherland–Hodgman against f < 0
      const poly = [];
      for (let k = 0; k < 3; k++) {
        const a = v[k], b = v[(k + 1) % 3], ia = inside[k], ib = inside[(k + 1) % 3];
        if (ia) poly.push(addV(a));
        if (ia !== ib) poly.push(cut(a, b));
      }
      for (let k = 1; k + 1 < poly.length; k++) tris.push(poly[0], poly[k], poly[k + 1]);
    }
    if (!tris.length) return null;
    const cnt0 = P.length / 3;
    // push each vertex out along the skin normal by its thickness (+ optional extra shaping)
    for (let k = 0; k < cnt0; k++) {
      const nx = N[k * 3], ny = N[k * 3 + 1], nz = N[k * 3 + 2], l = Math.hypot(nx, ny, nz) || 1;
      let th = TH[k];
      if (opts.shape) th = opts.shape(P[k * 3], P[k * 3 + 1], P[k * 3 + 2], th);
      OUT.push(nx / l, ny / l, nz / l);
      P[k * 3] += nx / l * th; P[k * 3 + 1] += ny / l * th; P[k * 3 + 2] += nz / l * th;
    }
    // relax the cloth: fabric bridges over small body detail (pecs, abs, knees)
    // instead of shrink-wrapping it. Laplacian smoothing that keeps the cut edge.
    if (opts.smooth) {
      const nb = Array.from({ length: cnt0 }, () => []);
      const ec = new Map();
      for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
        const a = tris[t + k], b = tris[t + (k + 1) % 3];
        nb[a].push(b);
        const key = a < b ? a * 1e6 + b : b * 1e6 + a; ec.set(key, (ec.get(key) || 0) + 1);
      }
      const edge = new Uint8Array(cnt0);
      for (const [key, c] of ec) if (c === 1) { edge[Math.floor(key / 1e6)] = 1; edge[key % 1e6] = 1; }
      const S0 = new Float32Array(P);                       // offset positions before relaxing
      const Q = new Float32Array(P);
      for (let it = 0; it < opts.smooth; it++) {
        for (let k = 0; k < cnt0; k++) {
          const L = nb[k]; if (!L.length || edge[k]) continue;
          let x = 0, y = 0, z = 0;
          for (const j of L) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; }
          const w = opts.smoothW ?? 0.5;
          Q[k * 3] = P[k * 3] + (x / L.length - P[k * 3]) * w;
          Q[k * 3 + 1] = P[k * 3 + 1] + (y / L.length - P[k * 3 + 1]) * w;
          Q[k * 3 + 2] = P[k * 3 + 2] + (z / L.length - P[k * 3 + 2]) * w;
        }
        for (let k = 0; k < cnt0 * 3; k++) P[k] = Q[k];
      }
      // relaxing pulls cloth inward over convex spots (shoulders, hips): never let
      // it sink below 70% of its thickness, or the skin would show through
      for (let k = 0; k < cnt0; k++) {
        const ox = OUT[k * 3], oy = OUT[k * 3 + 1], oz = OUT[k * 3 + 2];
        const sinkBy = (S0[k * 3] - P[k * 3]) * ox + (S0[k * 3 + 1] - P[k * 3 + 1]) * oy + (S0[k * 3 + 2] - P[k * 3 + 2]) * oz;
        const allow = TH[k] * 0.3;
        if (sinkBy > allow) { const d = sinkBy - allow; P[k * 3] += ox * d; P[k * 3 + 1] += oy * d; P[k * 3 + 2] += oz * d; }
      }
    }
    // folded hem: every open edge gets a strip back down to the skin, so the
    // fabric has a visible thickness (duplicated verts → crisp edge shading)
    if (opts.hem !== false) {
      const ecount = new Map();
      for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
        const a = tris[t + k], b = tris[t + (k + 1) % 3], key = a < b ? a * 1e6 + b : b * 1e6 + a;
        ecount.set(key, (ecount.get(key) || 0) + 1);
      }
      const dup = (k, inner) => {
        const j = P.length / 3;
        const th = inner ? TH[k] * (opts.hemDepth ?? 0.85) : 0;
        P.push(P[k * 3] - OUT[k * 3] * th, P[k * 3 + 1] - OUT[k * 3 + 1] * th, P[k * 3 + 2] - OUT[k * 3 + 2] * th);
        for (let c = 0; c < 4; c++) { SI.push(SI[k * 4 + c]); SW.push(SW[k * 4 + c]); }
        UV.push(UV[k * 2], UV[k * 2 + 1] + 0.05);
        return j;
      };
      for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
        const a = tris[t + k], b = tris[t + (k + 1) % 3], key = a < b ? a * 1e6 + b : b * 1e6 + a;
        if (ecount.get(key) !== 1) continue;
        const a0 = dup(a, false), b0 = dup(b, false), a1 = dup(a, true), b1 = dup(b, true);
        tris.push(b0, a0, a1, b0, a1, b1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setIndex(tris);
    geo.computeVertexNormals();
    geo.userData.covered = F;
    return geo;
  };

  // ---------------------------------------------------------------- meshes
  sk.root.updateMatrixWorld(true);                       // bones are in the fitted bind pose now
  const skel = new THREE.Skeleton(sk.bones);
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const mesh = new THREE.SkinnedMesh(gs, [sk.mat.skin, sk.mat.hair, hidden]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  sk.body.add(mesh);
  sk.root.updateMatrixWorld(true);
  mesh.bind(skel, mesh.matrixWorld);
  const bindMatrix = mesh.bindMatrix.clone();
  const headIndex = sk.bones.indexOf(sk.head);

  const layers = [];
  const addLayer = (geo, mat, opts = {}) => {
    if (!geo) return null;
    const m = new THREE.SkinnedMesh(geo, mat);
    m.castShadow = opts.shadow !== false; m.receiveShadow = true;
    m.frustumCulled = false;
    if (opts.order) m.renderOrder = opts.order;
    sk.body.add(m);
    m.bind(skel, bindMatrix);
    layers.push(m);
    return m;
  };
  const clearLayers = () => {
    for (const m of layers) { m.parent.remove(m); if (!m.userData.cached) m.geometry.dispose(); if (m.userData.ownMat) m.material.dispose(); }
    layers.length = 0;
    if (cards) { cards.parent.remove(cards); cards.geometry.dispose(); cards = null; }
  };
  let cards = null;

  // Strand cards for longer hair: little curved ribbons rooted on the scalp that
  // hang down (sides, back, or a fringe over the forehead). Rigid on the head bone.
  const makeCards = (H, F, kind, hat) => {
    const rnd = mulberry(kind.length * 31 + 5);
    const roots = [];
    for (let i = 0; i < n; i++) {
      if (F[i] >= -0.004 || !HEAD(reg[i])) continue;
      const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      if (kind === 'fringe') { if (z > eyeZ - 0.035 && y > eyeY + 0.04 && Math.abs(x) < 0.06) roots.push(i); }
      else if (z < eyeZ - 0.03 && y < eyeY + (hat ? 0.03 : 0.075) && y > eyeY - 0.11) roots.push(i);
      else if (!hat && kind === 'long' && y > eyeY + 0.03) roots.push(i);
    }
    if (!roots.length) return null;
    const count = kind === 'long' ? 240 : kind === 'flow' ? 190 : 34;
    const P = [], UVc = [], I = [];
    const segs = 4;
    for (let c = 0; c < count; c++) {
      const i = roots[Math.floor(rnd() * roots.length)];
      const nx = normals[i * 3], ny = normals[i * 3 + 1], nz = normals[i * 3 + 2];
      const thk = H.side + 0.002;
      let px = base[i * 3] + nx * thk, py = base[i * 3 + 1] + ny * thk, pz = base[i * 3 + 2] + nz * thk;
      const len = kind === 'long' ? 0.22 + rnd() * 0.14 : kind === 'flow' ? 0.07 + rnd() * 0.06 : 0.05 + rnd() * 0.03;
      const w = kind === 'fringe' ? 0.03 : 0.05 + rnd() * 0.02;
      // direction: out from the head, then down (gravity); fringe sweeps sideways
      let dx = nx * 0.5, dy = -1, dz = nz * 0.5 + (kind === 'fringe' ? 0.6 : 0);
      if (kind === 'fringe') dx += (rnd() - 0.5) * 0.8 + Math.sign(base[i * 3] || 1) * 0.3;
      // ribbon width runs along the head surface (perpendicular to normal & direction)
      const side = new THREE.Vector3(dx, dy, dz).cross(new THREE.Vector3(nx, ny, nz)).normalize().multiplyScalar(w / 2);
      const b0 = P.length / 3;
      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        P.push(px - side.x, py - side.y, pz - side.z, px + side.x, py + side.y, pz + side.z);
        UVc.push(0, t, 1, t);
        // step: keep hugging the head / shoulders: push outward from the head centre
        const minR = 0.105 + H.side;
        const step = len / segs;
        let sx = dx, sy = dy, sz = dz; const sl = Math.hypot(sx, sy, sz); sx /= sl; sy /= sl; sz /= sl;
        px += sx * step; py += sy * step; pz += sz * step;
        const qx = px - headC[0], qy = py - headC[1], qz = pz - headC[2], ql = Math.hypot(qx, qy, qz);
        if (ql < minR && py > neckY - 0.02) { px = headC[0] + qx / ql * minR; py = headC[1] + qy / ql * minR; pz = headC[2] + qz / ql * minR; }
        dy -= 0.25; dx *= 0.8; dz *= 0.8;                 // curls down more toward the tip
      }
      for (let s = 0; s < segs; s++) { const a = b0 + s * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UVc, 2));
    geo.setIndex(I);
    // body space (bind) → head bone space
    const toHead = new THREE.Matrix4().multiplyMatrices(skel.boneInverses[headIndex], bindMatrix);
    geo.applyMatrix4(toHead);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, sk.mat.hairCard);
    m.castShadow = true; m.receiveShadow = true;
    sk.head.add(m);
    return m;
  };

  // textured cut-out material for a proxy (hair / brows / lashes), tinted
  const cutout = (tex, color, alphaTest = 0.5) => {
    const Mat = sk.mat.hair.isMeshStandardMaterial ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;
    return new Mat({ map: humanTex(tex), color, alphaTest, side: THREE.DoubleSide, ...(Mat === THREE.MeshStandardMaterial ? { roughness: 0.55 } : {}) });
  };
  const addProxy = (name, mat, shadow = true) => {
    const geo = proxy(name, shape === 'female');
    if (!geo) return;
    const m = addLayer(geo, mat, { shadow });
    m.userData.cached = true; m.userData.ownMat = true;
  };

  const setOutfit = (o) => {
    const prevShape = shape;
    useShape(o.body === 'female' ? 'female' : 'male');
    if (shape !== prevShape) syncSkin();
    clearLayers();
    const M = sk.mat;
    const T = TOPS[o.top] === undefined ? TOPS.tee : TOPS[o.top];
    const PN = PANTS[o.pants] || PANTS.jeans;
    const H = HAIR[o.hairStyle] === undefined ? HAIR.short : HAIR[o.hairStyle];
    const hat = o.hat && o.hat !== 'none';
    // clothes
    let topGeo = null;
    if (T) topGeo = layer((i) => topField(i, T), (i) => topThick(i, T), { smooth: 10 });
    const pantsGeo = layer((i) => pantsField(i, PN), (i) => pantsThick(i, PN), { smooth: 4 });
    addLayer(pantsGeo, M.pants);
    if (o.pants === 'cargo') {
      // big side pockets on the thighs
      const pocket = (i) => {
        if (reg[i] !== R.thigh) return 1;
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        return Math.max(Math.hypot(z / 0.055, (y - (hipY - 0.27)) / 0.08) - 1, 0.13 - Math.abs(x));
      };
      addLayer(layer(pocket, (i) => pantsThick(i, PN) + 0.012, { smooth: 2 }), M.pantsDark);
    }
    addLayer(topGeo, M.top);
    // hair: a shell over the scalp (thick on top, tapering at the hairline)
    let hairF = null;
    if (H) {
      const curl = (x, y, z) => Math.sin(x * 260) * Math.sin(y * 230 + 1.3) * Math.sin(z * 250 + 0.7);
      const clump = (x, y, z) => Math.sin(x * 90 + z * 40) * Math.sin(y * 70 - z * 55 + 2.1);
      const hairThick = (i, f) => {
        const y = base[i * 3 + 1];
        const topW = sstep(eyeY + 0.02, eyeY + 0.1, y);
        let th = H.side + (H.top - H.side) * topW;
        if (hat) th = Math.min(th, 0.004);
        return th * sstep(0, 0.035, -f) + 0.0012;
      };
      const geo = layer((i) => hairField(i, H, hat), hairThick, {
        hemDepth: 0.6,
        shape: (x, y, z, th) => th + (H.clump || 0) * (H.curls ? curl(x, y, z) * 0.9 + 0.3 : clump(x, y, z)) * Math.min(1, th / 0.01),
      });
      hairF = geo && geo.userData.covered;
      addLayer(geo, M.hair);
      if (H.cards && hairF) cards = makeCards(H, hairF, H.cards, hat);
      if (H.proxy && !hat) addProxy(H.proxy, cutout(H.proxy + '.webp', M.hair.color, 0.45));
    }
    // eyebrows & eyelashes (real MakeHuman meshes)
    if (HUMAN.proxies && HUMAN.proxies.eyebrow001) {
      addProxy('eyebrow001', cutout('eyebrow001.webp', M.brow.color, 0.3), false);
      addProxy('eyelashes01', cutout('eyelashes01.webp', new THREE.Color(0x1a1410), 0.3), false);
    } else addLayer(layer(browField, () => 0.0018, { hem: false }), M.brow, { shadow: false });
    // facial hair
    if (o.facialHair && o.facialHair !== 'none') {
      const stub = o.facialHair === 'stubble';
      addLayer(layer((i) => beardField(i, o.facialHair), (i, f) => (stub ? 0.0009 : 0.0045 * sstep(0, 0.01, -f) + 0.001), { hem: !stub }),
        stub ? M.stubble : M.hair, { shadow: !stub });
    }
    // skin: drop what is well covered (so it can't poke through when bending),
    // paint the scalp under hair with the hair colour, hide the feet (sneakers)
    const covered = (geo, i, m) => geo && geo.userData.covered[i] < -m;
    const lists = [[], [], []];
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t], b = index[t + 1], c = index[t + 2];
      const ra = reg[a];
      const A = cornerS[t], B = cornerS[t + 1], Cc = cornerS[t + 2];
      if (ra === R.foot && reg[b] === R.foot && reg[c] === R.foot) { lists[2].push(A, B, Cc); continue; }
      const allIn = (geo, m) => covered(geo, a, m) && covered(geo, b, m) && covered(geo, c, m);
      if (allIn(topGeo, 0.03) || allIn(pantsGeo, 0.03)) continue;
      if (H && hairF && hairF[a] < -0.006 && hairF[b] < -0.006 && hairF[c] < -0.006) { lists[1].push(A, B, Cc); continue; }
      lists[0].push(A, B, Cc);
    }
    const all = new Uint16Array(lists[0].length + lists[1].length + lists[2].length);
    let off = 0;
    gs.clearGroups();
    lists.forEach((L, m) => { all.set(L, off); gs.addGroup(off, L.length, m); off += L.length; });
    gs.setIndex(new THREE.BufferAttribute(all, 1));
    mesh.material = [M.skin, M.hair, hidden];
    // pre-existing extras that layer on top (hood, belt) read these
    return { topHem: T ? waistY - T.hem : null };
  };

  return { mesh, setOutfit, layers };
}
