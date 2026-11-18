// =============================================================================
//  foliage.js — trees, bushes and grass tufts built from real leaf & grass
//  photos (ambientCG LeafSet024 / Foliage001 and Poly Haven bark, all CC0;
//  see tools/make-foliage.py).
//
//  A tree = a tapered, slightly bent trunk with a few branches (bark texture)
//  plus ~40 alpha-cut "leaf cluster" cards spread over the crown. The cards'
//  normals point out from the crown centre, so light wraps around the crown
//  like a real canopy instead of showing flat planes. Every tree, bush and
//  tuft is GPU-instanced (a handful of draw calls for the whole city) and the
//  leaves sway in the wind.
// =============================================================================
import * as THREE from 'three';
import { assetURL } from './textures.js';

const rngOf = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

function loadTex(path, srgb = true, repeat = false) {
  const t = new THREE.Texture();
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  const img = new Image();
  img.onload = () => { t.image = img; t.needsUpdate = true; };
  img.src = assetURL(path);
  return t;
}

// ---- shared wind uniform: leaves & grass bend with height, phase by position
const wind = { value: 0 };
function addWind(mat, amp) {
  mat.onBeforeCompile = (sh) => {
    // two-sided cards keep their crown-shaped normals on both faces (no dark backsides)
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
    sh.uniforms.uWind = wind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
        #endif
        float h = max(0.0, transformed.y);
        float ph = wp.x * 0.35 + wp.z * 0.27;
        transformed.x += sin(uWind * 1.7 + ph) * ${amp.toFixed(4)} * h;
        transformed.z += cos(uWind * 1.3 + ph * 1.3) * ${(amp * 0.7).toFixed(4)} * h;
      }`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp;
}

// ---- unit geometries ----------------------------------------------------------
// tapered tube along a polyline [{x,y,z,r}], bark UVs
function tube(pts, radial, out) {
  const { P, N, U, I } = out;
  const base = P.length / 3;
  let v = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    const d = new THREE.Vector3(q.x - o.x, q.y - o.y, q.z - o.z).normalize();
    const a = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const s1 = new THREE.Vector3().crossVectors(d, a).normalize(), s2 = new THREE.Vector3().crossVectors(d, s1);
    if (i > 0) v += Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) / (Math.PI * 2 * 0.25);
    for (let k = 0; k <= radial; k++) {
      const t = k / radial * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      const nx = s1.x * c + s2.x * s, ny = s1.y * c + s2.y * s, nz = s1.z * c + s2.z * s;
      P.push(p.x + nx * p.r, p.y + ny * p.r, p.z + nz * p.r); N.push(nx, ny, nz); U.push(k / radial * 2, v);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < radial; k++) {
    const a = base + i * (radial + 1) + k, b = a + radial + 1;
    I.push(a, b, a + 1, a + 1, b, b + 1);
  }
}
function geo(o) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(o.U, 2));
  g.setIndex(o.I);
  return g;
}

// one tree variant (unit size: ~7 m tall); cards = leaf cluster count
function treeVariant(seed, cards) {
  const r = rngOf(seed);
  const bark = { P: [], N: [], U: [], I: [] }, leaf = { P: [], N: [], U: [], I: [] };
  const lean = (r() - 0.5) * 0.4;
  const trunk = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6, y = t * 4.2;
    trunk.push({ x: Math.sin(t * 2.2 + seed) * 0.12 + lean * t, y, z: Math.cos(t * 1.7 + seed) * 0.1, r: 0.2 * (1 - t * 0.55) + (i === 0 ? 0.07 : 0) });
  }
  tube(trunk, 8, bark);
  const C = { x: lean * 0.9, y: 4.7 + r() * 0.4, z: 0 }, RX = 2.3 + r() * 0.5, RY = 1.9 + r() * 0.4;
  // main branches toward the crown
  for (let b = 0; b < 5; b++) {
    const a = b / 5 * Math.PI * 2 + r(), y0 = 2.5 + r() * 1.3, L = 1.4 + r() * 0.9;
    const s = trunk[Math.round(y0 / 4.2 * 6)];
    const pts = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3;
      pts.push({ x: s.x + Math.cos(a) * L * t, y: y0 + t * L * 0.75, z: s.z + Math.sin(a) * L * t, r: 0.085 * (1 - t * 0.7) });
    }
    tube(pts, 5, bark);
  }
  // leaf cards over the crown ellipsoid (denser outside, a few inside)
  for (let c = 0; c < cards; c++) {
    let dx, dy, dz;
    do { dx = r() * 2 - 1; dy = r() * 2 - 1; dz = r() * 2 - 1; } while (dx * dx + dy * dy + dz * dz > 1);
    const k = 0.45 + 0.55 * Math.sqrt(dx * dx + dy * dy + dz * dz);
    const px = C.x + dx * RX * k / (Math.hypot(dx, dy, dz) || 1) * (0.55 + r() * 0.45);
    const py = C.y + dy * RY * k / (Math.hypot(dx, dy, dz) || 1) * (0.55 + r() * 0.45);
    const pz = C.z + dz * RX * k / (Math.hypot(dx, dy, dz) || 1) * (0.55 + r() * 0.45);
    const size = 1.7 + r() * 1.0;
    // card plane: random orientation, roughly facing out from the crown
    const nrm = new THREE.Vector3(px - C.x + (r() - 0.5) * 2, (py - C.y) * 0.5 + (r() - 0.5) * 2, pz - C.z + (r() - 0.5) * 2).normalize();
    const up = Math.abs(nrm.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const sx = new THREE.Vector3().crossVectors(up, nrm).normalize().multiplyScalar(size / 2);
    const sy = new THREE.Vector3().crossVectors(nrm, sx).normalize().multiplyScalar(size / 2);
    const u0 = r() < 0.5 ? 0 : 0.5;
    const base = leaf.P.length / 3;
    for (const [a, b, u, v] of [[-1, -1, 0, 0], [1, -1, 0.5, 0], [1, 1, 0.5, 1], [-1, 1, 0, 1]]) {
      const x = px + sx.x * a + sy.x * b, y = py + sx.y * a + sy.y * b, z = pz + sx.z * a + sy.z * b;
      leaf.P.push(x, y, z);
      // normal: out from the crown centre (soft, volumetric canopy lighting)
      const n = new THREE.Vector3((x - C.x) / RX, (y - C.y) / RY + 0.35, (z - C.z) / RX).normalize();
      leaf.N.push(n.x, n.y, n.z);
      leaf.U.push(u0 + u, v);
    }
    leaf.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { bark: geo(bark), leaf: geo(leaf) };
}

// bush: a dome of cards (unit radius 1)
function bushVariant(seed, cards) {
  const r = rngOf(seed);
  const leaf = { P: [], N: [], U: [], I: [] };
  for (let c = 0; c < cards; c++) {
    const a = r() * Math.PI * 2, e = r() * 1.2;
    const px = Math.cos(a) * Math.cos(e) * 0.7, py = 0.25 + Math.sin(e) * 0.55, pz = Math.sin(a) * Math.cos(e) * 0.7;
    const size = 0.9 + r() * 0.5;
    const nrm = new THREE.Vector3(px + (r() - 0.5), py * 0.4 + (r() - 0.5), pz + (r() - 0.5)).normalize();
    const sx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), nrm).normalize().multiplyScalar(size / 2);
    if (sx.lengthSq() < 1e-6) sx.set(size / 2, 0, 0);
    const sy = new THREE.Vector3().crossVectors(nrm, sx).normalize().multiplyScalar(size / 2);
    const u0 = r() < 0.5 ? 0 : 0.5, base = leaf.P.length / 3;
    for (const [aa, b, u, v] of [[-1, -1, 0, 0], [1, -1, 0.5, 0], [1, 1, 0.5, 1], [-1, 1, 0, 1]]) {
      const x = px + sx.x * aa + sy.x * b, y = Math.max(0.02, py + sx.y * aa + sy.y * b), z = pz + sx.z * aa + sy.z * b;
      leaf.P.push(x, y, z);
      const n = new THREE.Vector3(x, (y - 0.2) + 0.4, z).normalize();
      leaf.N.push(n.x, n.y, n.z); leaf.U.push(u0 + u, v);
    }
    leaf.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return geo(leaf);
}

// palm frond texture (procedural): a midrib with long leaflets, alpha cut-out
let _frond = null;
function frondTexture() {
  if (_frond) return _frond;
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const x = c.getContext('2d'), r = rngOf(5);
  x.clearRect(0, 0, 128, 512);
  for (let y = 10; y < 500; y += 6) {
    const L = 58 * Math.sin(Math.PI * (y / 512)) + 6;
    for (const s of [-1, 1]) {
      const g = 90 + r() * 60;
      x.strokeStyle = `rgb(${g * 0.55 | 0},${g | 0},${g * 0.35 | 0})`; x.lineWidth = 3;
      x.beginPath(); x.moveTo(64, y); x.quadraticCurveTo(64 + s * L * 0.5, y + 8, 64 + s * L, y + 22 + r() * 6); x.stroke();
    }
  }
  x.strokeStyle = '#7a8a3a'; x.lineWidth = 4; x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 512); x.stroke();
  _frond = new THREE.CanvasTexture(c); _frond.colorSpace = THREE.SRGBColorSpace;
  return _frond;
}

// palm: a leaning, slightly curved ringed trunk + a crown of drooping fronds (unit ≈ 8 m)
function palmVariant(seed) {
  const r = rngOf(seed);
  const bark = { P: [], N: [], U: [], I: [] }, fr = { P: [], N: [], U: [], I: [] };
  const lean = 0.5 + r() * 0.6, la = r() * Math.PI * 2, trunk = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, off = lean * t * t;
    trunk.push({ x: Math.cos(la) * off, y: t * 7.5, z: Math.sin(la) * off, r: 0.2 - t * 0.06 + (i % 2) * 0.012 });
  }
  tube(trunk, 7, bark);
  const top = trunk[10];
  for (let f = 0; f < 13; f++) {
    const a = f / 13 * Math.PI * 2 + r() * 0.3, len = 2.6 + r() * 0.8, up = 0.6 - r() * 0.5;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const b0 = fr.P.length / 3, segs = 6;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, w = 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05));
      const px = top.x + dir.x * len * t, pz = top.z + dir.z * len * t, py = top.y + up * len * t - 1.6 * t * t;
      for (const sg of [-1, 1]) {
        fr.P.push(px + side.x * w * sg, py, pz + side.z * w * sg);
        const n = new THREE.Vector3(dir.x * 0.3, 1, dir.z * 0.3).normalize();
        fr.N.push(n.x, n.y, n.z); fr.U.push(sg < 0 ? 0 : 1, 1 - t);
      }
    }
    for (let s = 0; s < segs; s++) { const q = b0 + s * 2; fr.I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  return { bark: geo(bark), leaf: geo(fr) };
}

// grass tuft: two crossed cards, 0.35 m tall
function tuftGeo() {
  const o = { P: [], N: [], U: [], I: [] };
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI / 2 + 0.3, cx = Math.cos(a) * 0.22, cz = Math.sin(a) * 0.22, b = o.P.length / 3;
    for (const [s, y, u, v] of [[-1, 0, 0, 0], [1, 0, 1, 0], [1, 0.36, 1, 1], [-1, 0.36, 0, 1]]) {
      o.P.push(cx * s, y, cz * s); o.N.push(0, 1, 0); o.U.push(u, v);
    }
    o.I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return geo(o);
}

export class Foliage {
  constructor(scene) {
    this.scene = scene;
    this.trees = []; this.bushes = []; this.lawns = []; this.palms = [];
    this.group = new THREE.Group();
    scene.add(this.group);
  }
  addTree(x, z, s = 1, y = 0) { this.trees.push({ x, y, z, s }); }
  addBush(x, z, r = 0.7, y = 0) { this.bushes.push({ x, y, z, r }); }
  addPalm(x, z, s = 1, y = 0) { this.palms.push({ x, y, z, s }); }
  addLawn(x0, z0, x1, z1, y = 0) { this.lawns.push({ x0, z0, x1, z1, y }); }

  // (re)build every instanced mesh for a graphics level
  build(level) {
    for (const c of [...this.group.children]) { this.group.remove(c); c.geometry.dispose(); }
    const hi = level !== 'low';
    if (!this.tex) {
      this.tex = {
        leaves: loadTex('assets/textures/leaves.webp'), tuft: loadTex('assets/textures/grasstuft.webp'),
        bark: loadTex('assets/textures/bark.jpg', true, true), barkN: loadTex('assets/textures/bark_n.jpg', false, true),
      };
    }
    const T = this.tex;
    const Mat = hi ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;
    const leafMat = new Mat({ map: T.leaves, alphaTest: 0.45, side: THREE.DoubleSide, ...(hi ? { roughness: 0.75 } : {}) });
    addWind(leafMat, 0.012);
    const barkMat = new Mat({ map: T.bark, color: 0x9a8a7a, ...(hi ? { normalMap: T.barkN, roughness: 0.95 } : {}) });
    const tuftMat = new Mat({ map: T.tuft, alphaTest: 0.4, side: THREE.DoubleSide, color: 0xb8c49a, ...(hi ? { roughness: 0.9 } : {}) });
    addWind(tuftMat, 0.12);
    this.mats = [leafMat, barkMat, tuftMat];
    const inst = (g, mat, list, mk, shadow) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(g, mat, list.length);
      const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
      list.forEach((it, i) => { mk(it, p, e, sc, i); M.compose(p, q.setFromEuler(e), sc); m.setMatrixAt(i, M); });
      m.castShadow = shadow && hi; m.receiveShadow = hi;
      m.computeBoundingSphere();
      this.group.add(m);
    };
    // trees: 3 variants
    const V = [11, 23, 37].map((s) => treeVariant(s, hi ? 70 : 40));
    for (let v = 0; v < 3; v++) {
      const L = this.trees.filter((_, i) => i % 3 === v);
      const mk = (t, p, e, sc, i) => { p.set(t.x, t.y, t.z); e.set(0, (t.x * 7.3 + t.z * 3.1) % (Math.PI * 2), 0); sc.setScalar(t.s); };
      inst(V[v].bark, barkMat, L, mk, true);
      inst(V[v].leaf, leafMat, L, mk, true);
    }
    // palms
    if (this.palms.length) {
      const frondMat = new Mat({ map: frondTexture(), alphaTest: 0.4, side: THREE.DoubleSide, ...(hi ? { roughness: 0.7 } : {}) });
      addWind(frondMat, 0.01);
      const palmBark = new Mat({ map: T.bark, color: 0xb59a7a, ...(hi ? { normalMap: T.barkN, roughness: 0.95 } : {}) });
      this.mats.push(frondMat, palmBark);
      const PV = [3, 8].map((sd) => palmVariant(sd));
      for (let v = 0; v < 2; v++) {
        const L = this.palms.filter((_, i) => i % 2 === v);
        const mk = (t, p, e, sc) => { p.set(t.x, t.y, t.z); e.set(0, (t.x * 3.3 + t.z * 1.7) % (Math.PI * 2), 0); sc.setScalar(t.s); };
        inst(PV[v].bark, palmBark, L, mk, true);
        inst(PV[v].leaf, frondMat, L, mk, true);
      }
    }
    // bushes
    const B = [5, 9].map((s) => bushVariant(s, hi ? 18 : 11));
    for (let v = 0; v < 2; v++) {
      const L = this.bushes.filter((_, i) => i % 2 === v);
      inst(B[v], leafMat, L, (b, p, e, sc) => { p.set(b.x, b.y, b.z); e.set(0, b.x * 3.7 + b.z, 0); sc.set(b.r, b.r * (0.8 + ((b.x * 13) % 1) * 0.3), b.r); }, true);
    }
    // grass tufts on lawns & around tree bases (High/Ultra only)
    if (hi) {
      const tufts = [], r = rngOf(99);
      for (const l of this.lawns) {
        const area = (l.x1 - l.x0) * (l.z1 - l.z0);
        const n = Math.min(2600, Math.floor(area * 0.5));
        for (let i = 0; i < n; i++) tufts.push({ x: l.x0 + r() * (l.x1 - l.x0), y: l.y, z: l.z0 + r() * (l.z1 - l.z0), s: 0.6 + r() * 0.8 });
      }
      for (const t of this.trees) for (let i = 0; i < 10; i++) {
        const a = r() * Math.PI * 2, d = 0.4 + r() * 1.6;
        tufts.push({ x: t.x + Math.cos(a) * d, y: t.y, z: t.z + Math.sin(a) * d, s: 0.7 + r() * 0.9 });
      }
      inst(tuftGeo(), tuftMat, tufts.slice(0, 16000), (t, p, e, sc) => { p.set(t.x, t.y + 0.01, t.z); e.set(0, t.x * 5.1 + t.z * 2.3, 0); sc.set(t.s, t.s * (0.7 + (t.z * 7 % 1) * 0.6), t.s); }, false);
    }
  }

  update(time) { wind.value = time; }
}
