// =============================================================================
//  world.js — builds the whole park procedurally.
//  Every obstacle is added twice: once to the CollisionWorld (physics) and once
//  to a GeoBuilder (visuals). All static visuals are merged into ONE mesh with
//  vertex colours, so the whole city costs a single draw call.
//
//  Map overview (x = east, z = south, metres):
//     North  (z ≈ -40..-60) : stair plaza — 3-, 5- and 10-stair with handrails
//     Centre (around 0,0)   : ledges, manual pads, long rail, funbox, plaza gap
//     East   (x ≈ 55..72)   : halfpipe + mini-ramp
//     West   (x ≈ -50)      : bowl
//     Far west (x ≈ -90)    : mega-ramp (roll-in tower → kicker → gap → landing)
//     South  (z ≈ 45..150)  : downhill street
// =============================================================================
import * as THREE from 'three';
import { CollisionWorld } from './physics.js';
import { getTexture, getNormal, TEX_SCALE } from './textures.js';
import { GAPS, PHYSICS } from './config.js';
import { Foliage } from './foliage.js';
import { Props } from './props.js';
import { Decals } from './decals.js';
import { buildMap, MAP_BOUNDS, MAP_BOWLS, MAP_SPOTS } from './map.js';

// ---- colour palette (natural, slightly muted tones) --------------------------
export const C = {
  ground:   0x9a978f, plaza: 0xcbbfa8, plazaDark: 0xb9ab92, grass: 0x6f9a52,
  concrete: 0xb4afa5, concreteSide: 0x958f85,
  ledge:    0xa86450, ledgeSide: 0x8a503f,           // red granite ledges
  pad:      0x9aa294, padSide: 0x7a8274,
  ramp:     0x5d6166, rampSide: 0xc19a6b,           // grey skatelite top, plywood sides
  wood:     0xc8a273, woodSide: 0x9c7650,
  metal:    0x4a4e57, rail: 0xd9a93a, coping: 0xc8ccd0,
  kicker:   0x6a5f57, kickerSide: 0xb58e60,
  mega:     0x6b625a, megaSide: 0x8f6a44,
  street:   0x4a4c51, streetSide: 0x8f8a82, line: 0xeeeae0,
  bowl:     0xb7c2c6, bowlDeck: 0xc2b9a6,
  trunk:    0x6b4a2e, leaf: 0x3f6f32, leaf2: 0x587f3f,
  bench:    0x8a6a4a,
  sand: 0xe2cc9c, sandWet: 0xc9b083, promenade: 0xd9c7a8, stucco: 0xf0ede4, stuccoShade: 0xd9d4c8,
};
const BUILDING_COLORS = [0xc9b79c, 0xb5654f, 0xd8d2c4, 0x8c9a9e, 0xa86b4f, 0xcfc0a5, 0x9e8f7e, 0xbfae95];

// Which procedural texture each colour uses (see textures.js). Unlisted = plain.
const CAT = new Map();
const setCat = (name, list) => list.forEach((h) => CAT.set(h, name));
setCat('concrete', [C.ground, C.concrete, C.concreteSide, C.ledge, C.ledgeSide, C.pad, C.padSide, C.streetSide, C.bowl, 0xd6d0c4, 0xc9c2b4, 0xa7b3b8]);
setCat('tiles', [C.plaza, C.plazaDark, C.bowlDeck, 0xcfc3ad, 0xe0d2c0]);
setCat('asphalt', [C.street]);
setCat('wood', [C.wood, C.woodSide, C.rampSide, C.kickerSide, C.megaSide, C.trunk, C.bench]);
setCat('ramp', [C.ramp, C.kicker, C.mega, 0x8d9aa3]);
setCat('grass', [C.grass]);
setCat('sand', [C.sand, C.sandWet]);
setCat('stucco', [C.stucco, C.stuccoShade]);
setCat('tiles', [C.promenade]);
setCat('foliage', [C.leaf, C.leaf2]); // tree leaves: their own green, no photo
setCat('building', BUILDING_COLORS);
// the colour in each category that shows the photo texture untinted
const CAT_REF = { concrete: C.concrete, tiles: C.plaza, asphalt: C.street, wood: C.wood, ramp: C.ramp, grass: C.grass, building: 0xb5654f };

// Direction TOWARD the sun (matches the DirectionalLight offset in main.js)
// (measured from the sky photo: elevation ≈ 48°, so shadows line up with the sun in the sky)
export const SUN = { x: 53.4, y: 74.3, z: 40.3 };

// merge non-indexed copies of several geometries (position + normal only)
function mergeGeos(list) {
  const pos = [], nor = [];
  for (let g of list) {
    g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals();
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}

// convex hull of 2D points (monotone chain) — used for the fake ground shadows
function hull2D(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// =============================================================================
//  GeoBuilder — accumulates flat-shaded, vertex-coloured, textured triangles,
//  bucketed by texture category (one draw call per category).
// =============================================================================
class GeoBuilder {
  constructor() { this.buckets = {}; this._c = new THREE.Color(); this.shadowPos = []; }

  // Fake ground shadow: project 3D points along the sun direction onto y = baseY
  // and fill their convex hull with a dark transparent polygon (Low graphics).
  castShadow(points, baseY = 0) {
    const sx = SUN.x / SUN.y, sz = SUN.z / SUN.y;
    const proj = points.map(([x, y, z]) => [x - sx * Math.max(0, y - baseY), z - sz * Math.max(0, y - baseY)]);
    const h = hull2D(proj);
    if (h.length < 3) return;
    const y = baseY + 0.022;
    for (let i = 1; i < h.length - 1; i++) {
      this.shadowPos.push(h[0][0], y, h[0][1], h[i + 1][0], y, h[i + 1][1], h[i][0], y, h[i][1]);
    }
  }
  // corners of a (possibly sloped) prism, for shadows
  static prismPoints(r, tops, base) {
    const yaw = r.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw), hx = r.w / 2, hz = r.d / 2;
    const L = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    const out = [];
    L.forEach(([lx, lz], i) => {
      const x = r.x + lx * c + lz * s, z = r.z - lx * s + lz * c;
      out.push([x, base, z], [x, tops[i], z]);
    });
    return out;
  }
  _bucket(cat) { return this.buckets[cat] || (this.buckets[cat] = { pos: [], nor: [], col: [], uv: [] }); }

  // Photo textures carry their own colour, so a vertex colour becomes a TINT
  // relative to the category's main colour (main colour → white = untinted photo).
  _setColor(color, cat) {
    this._c.setHex(color);
    const ref = CAT_REF[cat];
    if (ref !== undefined) {
      const r = this._ref || (this._ref = new THREE.Color());
      r.setHex(ref);
      this._c.r = Math.min(1.6, Math.max(0.3, this._c.r / r.r));
      this._c.g = Math.min(1.6, Math.max(0.3, this._c.g / r.g));
      this._c.b = Math.min(1.6, Math.max(0.3, this._c.b / r.b));
    }
  }

  // push one vertex: world-space planar UVs + fake ambient occlusion near the ground
  _vert(B, cat, x, y, z, nx, ny, nz) {
    const s = 1 / TEX_SCALE[cat];
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    if (ay >= ax && ay >= az) B.uv.push(x * s, z * s);
    else if (ax >= az) B.uv.push(z * s, y * s);
    else B.uv.push(x * s, y * s);
    let ao = 1;
    if (ay < 0.6 && y > -0.05) ao = 0.6 + 0.4 * Math.min(1, Math.max(0, y) / 1.4);
    B.pos.push(x, y, z); B.nor.push(nx, ny, nz);
    B.col.push(this._c.r * ao, this._c.g * ao, this._c.b * ao);
  }

  // a, b, c: [x,y,z]. hint: rough outward direction, fixes winding automatically
  tri(a, b, c, color, hint) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return; // degenerate
    nx /= len; ny /= len; nz /= len;
    if (hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) {
      const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz;
    }
    const cat = CAT.get(color) || 'plain';
    const B = this._bucket(cat);
    this._setColor(color, cat);
    for (const p of [a, b, c]) this._vert(B, cat, p[0], p[1], p[2], nx, ny, nz);
  }
  quad(a, b, c, d, color, hint) { this.tri(a, b, c, color, hint); this.tri(a, c, d, color, hint); }

  // triangle with per-vertex normals (smooth shading for curved ramps / bowl)
  triN(a, b, c, na, nb, nc, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (Math.hypot(fx, fy, fz) < 1e-9) return;
    if (fx * (na[0] + nb[0] + nc[0]) + fy * (na[1] + nb[1] + nc[1]) + fz * (na[2] + nb[2] + nc[2]) < 0) {
      let t = b; b = c; c = t; t = nb; nb = nc; nc = t;
    }
    const cat = CAT.get(color) || 'plain';
    const B = this._bucket(cat);
    this._setColor(color, cat);
    this._vert(B, cat, a[0], a[1], a[2], na[0], na[1], na[2]);
    this._vert(B, cat, b[0], b[1], b[2], nb[0], nb[1], nb[2]);
    this._vert(B, cat, c[0], c[1], c[2], nc[0], nc[1], nc[2]);
  }
  quadN(a, b, c, d, na, nb, nc, nd, color) { this.triN(a, b, c, na, nb, nc, color); this.triN(a, c, d, na, nc, nd, color); }

  // A rectangular prism whose 4 top corners can have different heights.
  // r = {x,z,w,d,yaw}; tops = [hA,hB,hC,hD] for local corners
  // A(-x,-z) B(+x,-z) C(+x,+z) D(-x,+z); base = bottom height.
  prism(r, tops, base, topColor, sideColor) {
    const yaw = r.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const hx = r.w / 2, hz = r.d / 2;
    const W = (lx, y, lz) => [r.x + lx * c + lz * s, y, r.z - lx * s + lz * c];
    const dir = (lx, lz) => [lx * c + lz * s, 0, -lx * s + lz * c];
    const L = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    const T = L.map((p, i) => W(p[0], tops[i], p[1]));
    const B = L.map((p) => W(p[0], base, p[1]));
    this.quad(T[0], T[1], T[2], T[3], topColor, [0, 1, 0]);
    const sideHints = [dir(0, -1), dir(1, 0), dir(0, 1), dir(-1, 0)];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      this.quad(B[i], B[j], T[j], T[i], sideColor ?? topColor, sideHints[i]);
    }
  }

  // Thin box between two 3D points (rails, posts, coping)
  // round = a steel tube (rails, posts) instead of a square bar
  beam(a, b, thick, color, round = false) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const geo = round ? new THREE.CylinderGeometry(thick / 2, thick / 2, len, 12).rotateX(Math.PI / 2).toNonIndexed() : new THREE.BoxGeometry(thick, thick, len).toNonIndexed();
    const m = new THREE.Matrix4();
    const mid = new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    m.lookAt(mid, new THREE.Vector3(b[0], b[1], b[2]), Math.abs(dy / len) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    m.setPosition(mid);
    this.addGeometry(geo, m, color);
  }

  addGeometry(geo, matrix, color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(matrix);
    g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    const cat = CAT.get(color) || 'plain';
    const B = this._bucket(cat);
    this._setColor(color, cat);
    for (let i = 0; i < p.length; i += 3) this._vert(B, cat, p[i], p[i + 1], p[i + 2], n[i], n[i + 1], n[i + 2]);
  }

  // one mesh per texture category
  build() {
    const group = new THREE.Group();
    for (const [cat, B] of Object.entries(this.buckets)) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g);
      mesh.userData.cat = cat;
      mesh.receiveShadow = true;
      mesh.castShadow = cat !== 'grass' && cat !== 'tiles';
      group.add(mesh);
    }
    return group;
  }
}

// =============================================================================
//  World
// =============================================================================
export class World {
  constructor(scene) {
    this.scene = scene;
    this.col = new CollisionWorld();
    this.geo = new GeoBuilder();
    this.foliage = new Foliage(scene);            // real-leaf trees, bushes & grass (instanced)
    this.props = new Props(scene);                // photo-scanned street props (Poly Haven, CC0)
    // Teleport spots. The first one is the default respawn point.
    this.spots = MAP_SPOTS;
    Object.assign(this.col.bounds, MAP_BOUNDS);
    this._build();
    this.props.load(() => this.props.setQuality(this._foliageLevel || 'low'));
  }

  // ---- combined builders (collision + visuals) ----------------------------------
  box(o, top, side) {
    this.col.addBox(o);
    this.geo.prism(o, [o.h, o.h, o.h, o.h], o.base ?? -0.05, top, side);
    const b = Math.max(0, o.base ?? 0);
    if (o.h - b > 0.1 && !o.noShadow) this.geo.castShadow(GeoBuilder.prismPoints(o, [o.h, o.h, o.h, o.h], b), b);
  }
  wedge(o, top, side) { // h0 at local -Z edge, h1 at local +Z edge
    this.col.addWedge(o);
    this.geo.prism(o, [o.h0, o.h0, o.h1, o.h1], o.base ?? -0.05, top, side);
    if (!o.noShadow) this.geo.castShadow(GeoBuilder.prismPoints(o, [o.h0, o.h0, o.h1, o.h1], 0), 0);
  }
  // quarter pipe rising toward local +Z. Returns the lip height.
  quarter(o, top, side) {
    const R = o.R, base = o.base || 0;
    const len = o.d; // must be <= R * sin(85°)
    this.col.addQuarter(o);
    const yaw = o.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const hx = o.w / 2, hz = o.d / 2;
    const W = (lx, y, lz) => [o.x + lx * c + lz * s, y, o.z - lx * s + lz * c];
    const dir = (lx, lz) => [lx * c + lz * s, 0, -lx * s + lz * c];
    const N = 12;
    const prof = [];
    for (let i = 0; i <= N; i++) {
      // more segments near the top where the curve is tight
      const t = Math.sin((i / N) * Math.PI / 2);
      const d = len * t;
      prof.push([d - hz, base + R - Math.sqrt(Math.max(R * R - d * d, 0))]);
    }
    // analytic surface normal at each profile point → smooth shading
    const nAt = (i) => {
      const d = len * Math.sin((i / N) * Math.PI / 2);
      const slope = Math.min(d / Math.sqrt(Math.max(R * R - d * d, 1e-6)), 12);
      const h = dir(0, -slope), inv = 1 / Math.hypot(h[0], 1, h[2]);
      return [h[0] * inv, inv, h[2] * inv];
    };
    for (let i = 0; i < N; i++) {
      const [z0, y0] = prof[i], [z1, y1] = prof[i + 1];
      // riding surface
      const n0 = nAt(i), n1 = nAt(i + 1);
      this.geo.quadN(W(-hx, y0, z0), W(hx, y0, z0), W(hx, y1, z1), W(-hx, y1, z1), n0, n0, n1, n1, top);
      // side walls
      this.geo.quad(W(-hx, base, z0), W(-hx, base, z1), W(-hx, y1, z1), W(-hx, y0, z0), side, dir(-1, 0));
      this.geo.quad(W(hx, base, z0), W(hx, base, z1), W(hx, y1, z1), W(hx, y0, z0), side, dir(1, 0));
    }
    const lip = prof[N][1];
    this.geo.quad(W(-hx, base, hz), W(hx, base, hz), W(hx, lip, hz), W(-hx, lip, hz), side, dir(0, 1));
    this.geo.castShadow([W(-hx, base, -hz), W(hx, base, -hz), W(-hx, base, hz), W(hx, base, hz), W(-hx, lip, hz), W(hx, lip, hz), W(-hx, lip * 0.5, hz - len * 0.25), W(hx, lip * 0.5, hz - len * 0.25)], base);
    return lip;
  }
  rail(a, b, tag, color = C.rail, posts = true) {
    this.col.addRail(a, b, tag);
    this.geo.beam(a, b, 0.07, color, true);
    if (!posts) return;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(2, Math.ceil(len / 3) + 1);
    for (let i = 0; i < n; i++) {
      const t = 0.04 + 0.92 * (i / (n - 1));
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      const gy = this.col.ground(x, z, y - 0.05).h;
      this.geo.beam([x, gy, z], [x, y, z], 0.06, C.metal, true);
    }
  }
  // grindable ledge: a box whose two long top edges are rails
  ledge(o, top = C.ledge, side = C.ledgeSide, tag = 'ledge') {
    this.box({ ...o, tag: o.tag || tag }, top, side);
    const yaw = o.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
    const W = (lx, lz) => [o.x + lx * c + lz * s, o.h, o.z - lx * s + lz * c];
    const long = o.d >= o.w;
    const hx = o.w / 2 - 0.04, hz = o.d / 2 - 0.04;
    if (long) {
      this.col.addRail(W(-hx, -hz), W(-hx, hz), tag);
      this.col.addRail(W(hx, -hz), W(hx, hz), tag);
    } else {
      this.col.addRail(W(-hx, -hz), W(hx, -hz), tag);
      this.col.addRail(W(-hx, hz), W(hx, hz), tag);
    }
  }
  patch(x0, z0, x1, z1, color, y = 0.012) { // decorative flat ground colour
    this.geo.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], color, [0, 1, 0]);
  }

  // =============================================================================
  _build() {
    const g = this.geo;
    const b = this.col.bounds;

    // ---------------------------------------------------------------- ground
    // bowls are sunk into the ground, so the ground has a square hole around each
    const BOWLS = MAP_BOWLS;
    const E = 80; // visual ground extends beyond bounds
    const gx0 = b.minX - E, gx1 = b.maxX + E, gz0 = b.minZ - E, gz1 = b.maxZ + E;
    const up = [0, 1, 0];
    let rects = [[gx0, gz0, gx1, gz1]];
    for (const B of BOWLS) {
      const SQ = B.R + 1.5, h = [B.x - SQ, B.z - SQ, B.x + SQ, B.z + SQ], next = [];
      for (const [x0, z0, x1, z1] of rects) {
        if (h[2] <= x0 || h[0] >= x1 || h[3] <= z0 || h[1] >= z1) { next.push([x0, z0, x1, z1]); continue; }
        if (h[0] > x0) next.push([x0, z0, h[0], z1]);
        if (h[2] < x1) next.push([h[2], z0, x1, z1]);
        const ax0 = Math.max(x0, h[0]), ax1 = Math.min(x1, h[2]);
        if (h[1] > z0) next.push([ax0, z0, ax1, h[1]]);
        if (h[3] < z1) next.push([ax0, h[3], ax1, z1]);
      }
      rects = next;
    }
    for (const [x0, z0, x1, z1] of rects) g.quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], C.ground, up);

    // grass outside the playable area & some lawns
    this.patch(gx0, gz0, b.minX - 2, gz1, C.grass, 0.01);
    this.patch(b.maxX + 2, gz0, gx1, gz1, C.grass, 0.01);
    this.patch(b.minX - 2, gz0, b.maxX + 2, b.minZ - 2, C.grass, 0.01);
    this.patch(b.minX - 2, b.maxZ + 2, b.maxX + 2, gz1, C.grass, 0.01);

    for (const B of BOWLS) this._bowl(B, B.R + 1.5);
    buildMap(this);          // JEW BOARD CITY (js/map.js)
    this._terrain();
    this.col.linkRails();

    // ---------------------------------------------------------------- meshes
    this.mesh = g.build();
    this._decals();
    this.scene.add(this.mesh);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(g.shadowPos, 3));
    this.fakeShadows = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
      color: 0x1c2333, transparent: true, opacity: 0.26, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      // stencil: each pixel is darkened only once, even where shadows overlap
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
    }));
    this.fakeShadows.renderOrder = 1;
    this.scene.add(this.fakeShadows);
    this.setQuality('low');
  }

  // Low = cheap Lambert shading. High = physically based (MeshStandardMaterial)
  // with sharper (anisotropic) textures. Materials are cached per level.
  setQuality(level) {
    if (this._foliageLevel !== level) { this._foliageLevel = level; this.foliage.build(level); }
    this.props.setQuality(level);
    this._mats = this._mats || {};
    for (const mesh of this.mesh.children) {
      const cat = mesh.userData.cat, key = level + cat;
      if (!this._mats[key]) {
        const map = getTexture(cat, level === 'high' ? 8 : 1);
        this._mats[key] = level === 'high'
          ? new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: cat === 'plain' ? 0.45 : 0.92, metalness: cat === 'plain' ? 0.35 : 0 })
          : new THREE.MeshLambertMaterial({ vertexColors: true, map });
        // High: real surface relief from the photo normal maps
        if (level === 'high') {
          const mat = this._mats[key];
          getNormal(cat, (n) => { mat.normalMap = n; mat.normalScale.set(0.8, 0.8); mat.needsUpdate = true; });
        }
      }
      mesh.material = this._mats[key];
    }
    // real shadow maps on High; cheap painted-on shadows on Low
    if (this.fakeShadows) this.fakeShadows.visible = level !== 'high';
  }

  // ---------------------------------------------------------------- bowl (west)
  _bowl(B, SQ) {
    const g = this.geo;
    this.col.addBowl({ ...B, tag: 'bowl' });
    const S = 40, K = 9;
    const flatR = B.R - B.D;
    const ring = (phi) => ({ r: flatR + B.D * Math.sin(phi), y: -B.D * Math.cos(phi) });
    const P = (r, y, th) => [B.x + r * Math.cos(th), y, B.z + r * Math.sin(th)];
    for (let j = 0; j < S; j++) {
      const t0 = (j / S) * Math.PI * 2, t1 = ((j + 1) / S) * Math.PI * 2;
      // floor
      g.tri([B.x, -B.D, B.z], P(flatR, -B.D, t0), P(flatR, -B.D, t1), C.bowl, [0, 1, 0]);
      // walls
      for (let k = 0; k < K; k++) {
        const a = ring((k / K) * Math.PI / 2), c = ring(((k + 1) / K) * Math.PI / 2);
        const p0 = (k / K) * Math.PI / 2, p1 = ((k + 1) / K) * Math.PI / 2;
        const N = (phi, th) => [-Math.sin(phi) * Math.cos(th), Math.cos(phi), -Math.sin(phi) * Math.sin(th)];
        g.quadN(P(a.r, a.y, t0), P(a.r, a.y, t1), P(c.r, c.y, t1), P(c.r, c.y, t0),
          N(p0, t0), N(p0, t1), N(p1, t1), N(p1, t0), k % 3 === 2 ? 0xa7b3b8 : C.bowl);
      }
      // deck between the round rim and the square hole in the ground
      const sq0 = SQ / Math.max(Math.abs(Math.cos(t0)), Math.abs(Math.sin(t0)));
      const sq1 = SQ / Math.max(Math.abs(Math.cos(t1)), Math.abs(Math.sin(t1)));
      g.quad(P(B.R, 0, t0), P(B.R, 0, t1), P(sq1, 0, t1), P(sq0, 0, t0), C.bowlDeck, [0, 1, 0]);
      // coping ring (visual)
      g.beam(P(B.R + 0.03, 0.03, t0), P(B.R + 0.03, 0.03, t1), 0.09, C.coping);
    }
  }







  // ---------------------------------------------------------------- reusable ramp builders
  // yaw makes a ramp RISE toward: -z = PI, +z = 0, +x = PI/2, -x = -PI/2
  _bank(x, z, w, len, h, yaw, tag = 'bank') {
    this.wedge({ x, z, w, d: len, h0: 0, h1: h, yaw, tag }, C.ramp, C.rampSide);
  }
  _corner(x, z, L, h, toX, toZ, tag = 'hip') {
    const yaw = [0, Math.PI / 2, Math.PI, -Math.PI / 2].find((y) => Math.sign(Math.cos(y) + Math.sin(y)) === Math.sign(toX) && Math.sign(Math.cos(y) - Math.sin(y)) === Math.sign(toZ));
    this.col.addCorner({ x, z, w: L, d: L, h, yaw, tag });
    const c = Math.cos(yaw), s2 = Math.sin(yaw), hl = L / 2;
    const Wp = (lx, y, lz) => [x + lx * c + lz * s2, y, z - lx * s2 + lz * c];
    const P00 = Wp(-hl, 0, -hl), P10 = Wp(hl, 0, -hl), P01 = Wp(-hl, 0, hl), P11 = Wp(hl, h, hl), P11b = Wp(hl, 0, hl);
    this.geo.tri(P00, P10, P11, C.ramp, [0, 1, 0]);
    this.geo.tri(P00, P11, P01, C.ramp, [0, 1, 0]);
    this.geo.tri(P10, P11b, P11, C.rampSide, [Wp(1, 0, 0)[0] - x, 0, Wp(1, 0, 0)[2] - z]);
    this.geo.tri(P01, P11b, P11, C.rampSide, [Wp(0, 0, 1)[0] - x, 0, Wp(0, 0, 1)[2] - z]);
    this.geo.castShadow([P00, P10, P01, P11, P11b], 0);
  }
  _qp(x, z, w, R, yaw, deck, maxDeg = 80, tag = 'park_quarter') {
    const L = R * Math.sin(maxDeg * Math.PI / 180);
    const lip = this.quarter({ x, z, w, d: L, R, yaw, tag }, C.ramp, C.rampSide);
    const dx = Math.sin(yaw), dz = Math.cos(yaw), px = Math.cos(yaw), pz = -Math.sin(yaw);
    if (deck > 0) this.box({ x: x + dx * (L / 2 + deck / 2), z: z + dz * (L / 2 + deck / 2), w, d: deck, yaw, h: lip, tag: tag + '_deck' }, C.concrete, C.concreteSide);
    const lx = x + dx * (L / 2 + 0.02), lz = z + dz * (L / 2 + 0.02);
    this.rail([lx - px * (w / 2 - 0.15), lip + 0.02, lz - pz * (w / 2 - 0.15)], [lx + px * (w / 2 - 0.15), lip + 0.02, lz + pz * (w / 2 - 0.15)], 'coping', C.coping, false);
    return { lip, L };
  }
  _pyramid(px, pz, sx, sz, h, L, tag = 'pyramid') {
    this.box({ x: px, z: pz, w: sx, d: sz, h, tag }, C.concrete, C.concreteSide);
    this._bank(px, pz - sz / 2 - L / 2, sx, L, h, 0, tag);
    this._bank(px, pz + sz / 2 + L / 2, sx, L, h, Math.PI, tag);
    this._bank(px - sx / 2 - L / 2, pz, sz, L, h, Math.PI / 2, tag);
    this._bank(px + sx / 2 + L / 2, pz, sz, L, h, -Math.PI / 2, tag);
    for (const ix of [-1, 1]) for (const iz of [-1, 1]) this._corner(px + ix * (sx / 2 + L / 2), pz + iz * (sz / 2 + L / 2), L, h, -ix, -iz, tag);
  }
  _fence(x0, z0, x1, z1, h = 0.9) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.max(0.4, x1 - x0), d = Math.max(0.4, z1 - z0);
    this.box({ x: cx, z: cz, w, d, h, tag: 'wall' }, C.concrete, C.concreteSide);
    const len = Math.max(w, d), n = Math.ceil(len / 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n, fx = x0 + (x1 - x0) * t, fz = z0 + (z1 - z0) * t;
      this.geo.beam([fx, h, fz], [fx, h + 1.5, fz], 0.05, C.metal);
    }
    this.geo.beam([x0, h + 1.5, z0], [x1, h + 1.5, z1], 0.04, C.metal);
    this.geo.beam([x0, h + 0.75, z0], [x1, h + 0.75, z1], 0.025, C.metal);
  }
  _floodlight(x, z, h = 10) {
    this.box({ x, z, w: 0.35, d: 0.35, h, tag: 'lamp' }, C.metal, C.metal);
    this.geo.prism({ x, z, w: 1.8, d: 0.6 }, [h + 0.5, h + 0.5, h + 0.5, h + 0.5], h - 0.1, 0xfff3b0, C.metal);
  }


  // ---------------------------------------------------------------- JUMP DESIGNER
  // Builds kicker → gap → knuckle deck → landing slope (all heading +z) so that a
  // rider arriving at the kicker at ~v m/s lands about 40% of the way down the
  // landing, with the landing angled to match the flight path (soft touchdown).
  // It then checks the realistic speed range (8% slower … 6% faster): the slow
  // rider must still clear the gap, the fast rider must still land on the slope
  // (no overshoot onto the flat). Returns where the landing ends and the speed
  // you'll have at the bottom.
  _designJump({ x, w, z0, h, d, v, name, label, points = 1000 }) {
    const g = PHYSICS.gravity, th = Math.atan2(h, d);
    const lip = (vv) => 0.965 * Math.sqrt(Math.max(1, vv * vv - 2 * g * h));
    const hL = h * 0.85;
    const fly = (vv, yT) => {                       // where the flight path comes down through height yT
      const vl = lip(vv), vx = vl * Math.cos(th), vy = vl * Math.sin(th);
      const t = (vy + Math.sqrt(vy * vy + 2 * g * (h - yT))) / g;
      return { x: vx * t, vyEnd: vy - g * t, vx };
    };
    // Landing slope: matched to the flight angle, but gentle enough that the
    // landing is long enough for the whole speed range (1.5× the spread between a
    // slow and a fast rider). A slight mismatch is fine — touchdown impact is
    // checked below and kept well under the bail limit.
    const mid = fly(v, 0.6 * hL);
    const spread = fly(v * 1.06, 0.6 * hL).x - fly(v * 0.92, 0.6 * hL).x;
    const mMatch = Math.abs(mid.vyEnd) / mid.vx;
    let m = Math.min(mMatch * 0.9, hL / (1.5 * spread + 4));
    m = Math.max(0.12, Math.min(0.8, m));
    const impactAt = (mm) => {                      // normal speed into the slope at the nominal touchdown
      const a = Math.atan(mm), vx = mid.vx, vy = mid.vyEnd;   // vy < 0
      return Math.abs(-vy * Math.cos(a) - vx * Math.sin(a));
    };
    while (impactAt(m) > 8 && m < mMatch) m *= 1.08;
    let Ll, xs, gap, dk;
    const landX = (vv) => {                         // step the real flight over the piecewise ground
      const vl = lip(vv); let vx = vl * Math.cos(th), vy = vl * Math.sin(th), px = 0, py = h;
      for (let i = 0; i < 3000; i++) {
        vy -= g * 0.004; vx *= 1 - 0.01 * 0.004; px += vx * 0.004; py += vy * 0.004;
        const gy = px < gap ? 0 : px < xs ? hL : px < xs + Ll ? hL - m * (px - xs) : 0;
        if (i > 5 && py <= gy) return px;
      }
      return px;
    };
    for (let it = 0; it < 10; it++) {
      Ll = hL / m;
      xs = fly(v, hL - m * 0.4 * Ll).x - 0.4 * Ll;
      dk = 2; gap = xs - dk;
      if (landX(v * 1.06) > xs + 0.9 * Ll && m > 0.13) { m *= 0.88; continue; }   // longer, shallower landing
      break;
    }
    const slow = landX(v * 0.92);
    if (slow < gap + 0.5) { gap = Math.max(1.5, slow - 1.0); dk = xs - gap; }       // pull the knuckle closer
    const zl = z0 + d;
    this.wedge({ x, z: z0 + d / 2, w, d, h0: 0, h1: h, yaw: 0, tag: name + '_kick' }, C.ramp, C.rampSide);
    this.box({ x, z: zl + gap + dk / 2, w: w + 2, d: dk, h: hL, tag: name + '_land' }, C.concrete, C.concreteSide);
    this.wedge({ x, z: zl + xs + Ll / 2, w: w + 2, d: Ll, h0: hL, h1: 0, yaw: 0, tag: name + '_land' }, C.ramp, C.rampSide);
    this.patch(x - w / 2, zl, x + w / 2, zl + gap, 0xd9b45a, 0.04);
    this.col.addZone({ x, z: zl + gap + (dk + Ll) / 2, w: w + 2, d: dk + Ll, tag: name + '_land' });
    GAPS.push({ name: label, from: name + '_kick', to: name + '_land', points });
    const vl = lip(v);
    const vOut = 0.9 * Math.sqrt(vl * vl + 2 * g * h);    // calibrated against test rides (landing + slope friction)
    (this.jumpLog = this.jumpLog || []).push({ name, v: +v.toFixed(1), lip: +vl.toFixed(1), gap: +gap.toFixed(1), slope: +m.toFixed(2), landLen: +Ll.toFixed(1), slowLand: +slow.toFixed(1), fastLand: +landX(v * 1.06).toFixed(1), xs: +xs.toFixed(1) });
    return { end: zl + xs + Ll, vOut };
  }
  // speed after rolling `dist` metres on flat ground (same friction as the game)
  _coast(v, dist) {
    for (let s = 0; s < dist; s += 0.5) v = Math.max(1, v - (v * PHYSICS.rollFriction + PHYSICS.rollDrag) * 0.5 / v);
    return v;
  }



  // ---------------------------------------------------------------- distant terrain
  // Rolling hills far outside the city (no collision), coloured with a bit of
  // atmospheric haze so the horizon isn't just a flat edge.
  _terrain() {
    const cx = 0, cz = 10, S = 80, RINGS = 9, r0 = 250, r1 = 430;
    const haze = new THREE.Color(0x9aa3b2), base = new THREE.Color(0x4f7a3a), rock = new THREE.Color(0x7d7468);
    const pos = [], col = [], c = new THREE.Color();
    const h = (a, r) => {
      const t = (r - r0) / (r1 - r0);
      const n = Math.sin(a * 3 + 1.3) * 0.5 + Math.sin(a * 7.1 + 0.4) * 0.3 + Math.sin(a * 13.7) * 0.2;
      return Math.max(0, (10 + n * 12) * Math.sin(Math.min(1, t * 1.4) * Math.PI / 2) + t * t * 22);
    };
    const P = (i, j) => { const a = (j / S) * Math.PI * 2, r = r0 + (r1 - r0) * (i / RINGS); return [cx + Math.cos(a) * r, h(a, r) - 0.5, cz + Math.sin(a) * r, i / RINGS]; };
    const push = (p) => {
      pos.push(p[0], p[1], p[2]);
      c.copy(base).lerp(rock, Math.min(1, Math.max(0, p[1] - 18) / 30)).lerp(haze, 0.18 + p[3] * 0.45);
      col.push(c.r, c.g, c.b);
    };
    for (let i = 0; i < RINGS; i++) for (let j = 0; j < S; j++) {
      const a = P(i, j), b = P(i, j + 1), d = P(i + 1, j), e = P(i + 1, j + 1);
      push(a); push(e); push(b); push(a); push(d); push(e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    this.hills = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
    this.scene.add(this.hills);
  }


  // graffiti on walls + cracks, oil, gum, scuffs and grime on the ground (one draw call)
  _decals() {
    const D = new Decals(this.scene), b = this.col.bounds, r = (() => { let sd = 91; return () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }; })();
    let k = 0;
    // inner faces of the buildings around the city (every other one gets a piece)
    for (let x = b.minX; x < b.maxX; x += 22) {
      if (k++ % 2 === 0) D.graffiti([x + 11 + (r() - 0.5) * 6, 5.2, b.minZ - 1], [0, 0, 1], 6 + r() * 2, k % 4);
    }
    for (let z = b.minZ; z < b.maxZ; z += 22) {
      if (z > 105) continue;                              // seafront: no buildings
      if (k++ % 2 === 0) D.graffiti([b.minX, 5.2, z + 11 + (r() - 0.5) * 6], [1, 0, 0], 6 + r() * 2, k % 4);
      if (k % 3 === 0) D.graffiti([b.maxX, 5.2, z + 11 + (r() - 0.5) * 6], [-1, 0, 0], 6 + r() * 2, (k + 2) % 4);
    }
    // the beach sea wall
    for (const x of [-130, -95, -45, 5]) D.graffiti([x, 0.62, 150.02], [0, 0, 1], 2.2, ((x + 200) / 10 | 0) % 4);
    // ground marks on flat paving and roads
    const okTag = (t) => t === null || t === 'street' || t === 'street_top' || t === 'promenade';
    let placed = 0;
    for (let i = 0; i < 40000 && placed < 2400; i++) {
      const x = b.minX + 2 + r() * (b.maxX - b.minX - 4), z = b.minZ + 2 + r() * (b.maxZ - b.minZ - 4);
      const g = this.col.ground(x, z, 2);
      if (g.ny < 0.995 || !okTag(g.tag) || (g.h > 0.05 && g.tag !== 'promenade') || this.col.onLawn(x, z)) continue;
      const q = r();
      const kind = q < 0.42 ? (q * 7 | 0) % 3 : q < 0.52 ? 3 : q < 0.68 ? 4 : q < 0.84 ? 5 : q < 0.96 ? 6 : 7;
      const size = kind === 7 ? 0.8 : kind <= 2 ? 1.6 + r() * 2.2 : 0.9 + r() * 1.6;
      D.ground(x, g.h + 0.02, z, size, kind, r() * Math.PI * 2);
      placed++;
    }
    D.build();
    this.decals = D;
  }

  // Star of David: two interlaced triangle outlines (extruded), centred, in the XY plane
  _starOfDavid(size, bar, depth = 0.05) {
    const tri = (rot) => {
      const sh = new THREE.Shape(), hole = new THREE.Path();
      const P = (r, k) => [Math.sin(rot + k * 2 * Math.PI / 3) * r, Math.cos(rot + k * 2 * Math.PI / 3) * r];
      const ro = size, ri = size - bar * 2;
      sh.moveTo(...P(ro, 0)); sh.lineTo(...P(ro, 1)); sh.lineTo(...P(ro, 2)); sh.closePath();
      hole.moveTo(...P(ri, 0)); hole.lineTo(...P(ri, 2)); hole.lineTo(...P(ri, 1)); hole.closePath();
      sh.holes.push(hole);
      return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
    };
    const a = tri(0), b = tri(Math.PI);
    const g = mergeGeos([a, b]);
    g.translate(0, 0, -depth / 2);
    return g;
  }

  // flag / sign with a canvas texture (a separate mesh: it needs its own picture)
  _canvasPlane(w, h, draw, pos, rotY = 0, wave = 0) {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
    draw(c.getContext('2d'), c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const g = new THREE.PlaneGeometry(w, h, wave ? 12 : 1, 1);
    if (wave) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) + w / 2; p.setZ(i, Math.sin(x * 2.2) * wave * (x / w)); } g.computeVertexNormals(); }
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.y = rotY; m.castShadow = true;
    this.scene.add(m);
    return m;
  }




}
