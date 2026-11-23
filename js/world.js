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

// ---- colour palette (natural, slightly muted tones) --------------------------
const C = {
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
  beam(a, b, thick, color) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const geo = new THREE.BoxGeometry(thick, thick, len).toNonIndexed();
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
    this.spots = [
      { name: 'Plaza (spawn)',      x: 8,   y: 0,  z: 12,  heading: Math.PI },
      { name: 'Stair Plaza',        x: 26,  y: 1.7, z: -50, heading: 0 },
      { name: 'Mega-Ramp Roll-in',  x: -90, y: 14, z: -95.4, heading: 0 },
      { name: 'Downhill Street',    x: 0,   y: 10, z: 146, heading: Math.PI },
      { name: 'Southside Skatepark', x: 37.5, y: 0, z: 95, heading: Math.PI / 2 },
      { name: 'Mega Park – The Drop (12 m)', x: 123, y: 12, z: 26, heading: Math.PI / 2 },
      { name: 'Mega Park – Big Bank & Rail', x: 122, y: 6, z: 56, heading: Math.PI / 2 },
      { name: 'Mega Park – Mega Bowl', x: 160, y: 0, z: -60, heading: Math.PI / 2 },
      { name: 'Titan Park – Mega Air Line (22 m)', x: 40, y: 22, z: 169.6, heading: 0 },
      { name: 'Titan Park – Rail Line', x: 85, y: 12, z: 169.6, heading: 0 },
      { name: 'Titan Park – Drop Line', x: 130, y: 10, z: 166, heading: 0 },
      { name: 'Titan Park – Giant Bowl & Wall', x: 190, y: 0, z: 200, heading: 0 },
      { name: 'Tel Aviv Beach Promenade', x: -73, y: 1.2, z: 168, heading: 0 },
    ];
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
    this.geo.beam(a, b, 0.07, color);
    if (!posts) return;
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const n = Math.max(2, Math.ceil(len / 3) + 1);
    for (let i = 0; i < n; i++) {
      const t = 0.04 + 0.92 * (i / (n - 1));
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      const gy = this.col.ground(x, z, y - 0.05).h;
      this.geo.beam([x, gy, z], [x, y, z], 0.06, C.metal);
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
    const BOWLS = [
      { x: -50, z: 10, R: 8, D: 2.6 },          // plaza bowl
      { x: 84, z: 121, R: 8.5, D: 2.3 },        // skatepark flow bowl
      { x: 176, z: -60, R: 11, D: 4 },          // Mega Park deep bowl
      { x: 190, z: 222, R: 14, D: 5 },          // Titan Park giant bowl
    ];
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
    this._plaza();
    this._stairs();
    this._eastRamps();
    this._megaRamp();
    this._street();
    this._skatepark();
    this._megaPark();
    this._titanPark();
    this._cityDetail();
    this._telAviv();
    this._telAvivJewish();
    this._terrain();
    this._decor();
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

  // ---------------------------------------------------------------- centre plaza
  _plaza() {
    const H = Math.PI / 2;
    this.patch(-30, -25, 30, 32, C.plaza);
    // checker tiles for a little texture
    for (let x = -30; x < 30; x += 6) for (let z = -25; z < 32; z += 6) {
      if (((x + z) / 6) % 2 === 0) this.patch(x, z, x + 6, Math.min(z + 6, 32), C.plazaDark, 0.014);
    }

    // long flat rail (challenge rail)
    this.rail([-15, 0.5, 18], [15, 0.5, 18], 'longrail');

    // ledges
    this.ledge({ x: -14, z: 2, w: 0.7, d: 8, h: 0.45 });
    this.ledge({ x: 14, z: 2, w: 0.7, d: 8, h: 0.45 });
    this.ledge({ x: 0, z: -12, w: 12, d: 0.7, h: 0.4 });
    this.ledge({ x: -22, z: -6, w: 0.8, d: 6, h: 0.55, yaw: 0.5 }, C.concrete, C.concreteSide);

    // manual pads (edges grindable too)
    this.ledge({ x: 0, z: 4, w: 3, d: 6, h: 0.22, tag: 'manualpad' }, C.pad, C.padSide, 'manualpad');
    this.ledge({ x: -22, z: 22, w: 6, d: 2.5, h: 0.2, tag: 'manualpad' }, C.pad, C.padSide, 'manualpad');

    // kickers
    this.wedge({ x: 20, z: 6, w: 2, d: 1.8, h0: 0, h1: 0.55, yaw: Math.PI, tag: 'kicker' }, C.kicker, C.kickerSide);
    this.wedge({ x: -8, z: 26, w: 2, d: 1.6, h0: 0, h1: 0.5, yaw: H, tag: 'kicker' }, C.kicker, C.kickerSide);

    // funbox: two banks + flat top, with a rail down the middle
    this.wedge({ x: 0, z: -23.25, w: 6, d: 2.5, h0: 0, h1: 0.6, tag: 'funbox_n' }, C.ramp, C.rampSide);
    this.box({ x: 0, z: -20, w: 6, d: 4, h: 0.6, tag: 'funbox' }, C.wood, C.woodSide);
    this.wedge({ x: 0, z: -16.75, w: 6, d: 2.5, h0: 0.6, h1: 0, tag: 'funbox_s' }, C.ramp, C.rampSide);
    this.rail([0, 0.95, -21.8], [0, 0.95, -18.2], 'funrail');
    this.col.addZone({ x: 0, z: -12.5 + 0.0, w: 6, d: 5, tag: 'funbox_s_land' });
    this.col.addZone({ x: 0, z: -27.5, w: 6, d: 5, tag: 'funbox_n_land' });

    // plaza gap: bank → block A ... gap ... block B → bank
    this.wedge({ x: 20, z: 24, w: 4, d: 6, h0: 0, h1: 0.9, yaw: H, tag: 'gapA' }, C.ramp, C.rampSide);
    this.box({ x: 24, z: 24, w: 4, d: 6, h: 0.9, tag: 'gapA' }, C.concrete, C.concreteSide);
    this.box({ x: 31.5, z: 24, w: 4, d: 6, h: 0.9, tag: 'gapB' }, C.concrete, C.concreteSide);
    this.wedge({ x: 35.5, z: 24, w: 4, d: 6, h0: 0.9, h1: 0, yaw: H, tag: 'gapB' }, C.ramp, C.rampSide);
    this.col.addZone({ x: 33.5, z: 24, w: 8, d: 6, tag: 'gapB' });
    this.patch(26, 21, 29.5, 27, 0xd9b45a, 0.016); // paint in the gap

    // benches (grindable)
    for (const [x, z, yaw] of [[-27, 8, 0], [27, -8, 0], [-10, -22, H], [10, 30, H]]) {
      this.ledge({ x, z, w: 0.6, d: 2.4, h: 0.45, yaw, tag: 'bench' }, C.bench, C.metal, 'bench');
    }
  }

  // ---------------------------------------------------------------- stair plaza (north)
  _stairs() {
    this._stairSet({ xc: -36, W: 5, n: 3, tag: 'stair3', rails: [-1] });
    this._stairSet({ xc: -8, W: 6, n: 5, tag: 'stair5', rails: [-1, 1] });
    this._stairSet({ xc: 26, W: 7, n: 10, tag: 'stair10', rails: [-1, 1] });
    // connecting ledges up top
    this.ledge({ x: -8, z: -48, w: 6, d: 0.7, h: 0.85 + 0.42, base: 0.85, tag: 'ledge' }, C.ledge, C.ledgeSide);
  }

  _stairSet({ xc, W, n, tag, rails }) {
    const stepH = 0.17, stepD = 0.38, zTop = -40;
    const H = n * stepH;
    const PW = W + 6, PD = 12; // platform size
    // platform
    this.box({ x: xc, z: zTop - PD / 2, w: PW, d: PD, h: H, tag: tag + '_top' }, C.concrete, C.concreteSide);
    // stairs (n-1 treads below the platform)
    for (let i = 1; i < n; i++) {
      const z0 = zTop + (i - 1) * stepD;
      this.box({ x: xc, z: z0 + stepD / 2, w: W, d: stepD, h: H - i * stepH, tag: tag + '_steps', noShadow: true },
        i % 2 ? 0xd6d0c4 : 0xc9c2b4, C.concreteSide);
    }
    // side blocks next to the stairs, flush with platform (gives a hubba-like edge)
    const sideW = (PW - W) / 2;
    const run = (n - 1) * stepD;
    for (const sgn of [-1, 1]) {
      const sx = xc + sgn * (W / 2 + sideW / 2);
      this.wedge({ x: sx, z: zTop + run / 2, w: sideW, d: run, h0: H, h1: stepH, tag: tag + '_hubba' }, C.concrete, C.concreteSide);
      const ex = xc + sgn * (W / 2 + 0.06);
      this.col.addRail([ex, H, zTop + 0.05], [ex, stepH, zTop + run - 0.05], 'hubba');
    }
    // bank up to the platform from behind
    this.wedge({ x: xc, z: zTop - PD - 3.5, w: PW, d: 7, h0: 0, h1: H, tag: tag + '_bank' }, C.ramp, C.rampSide);
    // handrails following the nosing line, 0.6 m above it
    const slope = stepH / stepD;
    const z0 = zTop - 0.3, z1 = zTop + run + 0.35;
    for (const sgn of rails) {
      const rx = xc + sgn * (W / 2 - 0.6);
      const y = (z) => H + 0.6 - Math.max(0, z - zTop) * slope;
      this.rail([rx, H + 0.6, z0 - 0.8], [rx, y(zTop), zTop], 'handrail_flat');
      this.rail([rx, y(zTop), zTop], [rx, y(z1), z1], 'handrail');
    }
    // landing zone for gap detection
    this.col.addZone({ x: xc, z: zTop + run + stepD + 4, w: PW, d: 8, tag: tag + '_land' });
    this.patch(xc - PW / 2, zTop + run + 0.1, xc + PW / 2, zTop + run + 8, 0xcfc3ad, 0.016);
  }

  // ---------------------------------------------------------------- halfpipe & mini-ramp (east)
  _eastRamps() {
    const H = Math.PI / 2;
    const sin85 = Math.sin(85 * Math.PI / 180);
    // Halfpipe: two quarters facing each other across a 6 m flat bottom, running along z
    {
      const R = 3.3, L = R * sin85, cx = 63.5, flat = 6, width = 12, cz = 0;
      const lipW = this.quarter({ x: cx - flat / 2 - L / 2, z: cz, w: width, d: L, R, yaw: -H, tag: 'halfpipe' }, C.ramp, C.rampSide);
      this.quarter({ x: cx + flat / 2 + L / 2, z: cz, w: width, d: L, R, yaw: H, tag: 'halfpipe' }, C.ramp, C.rampSide);
      const deck = 3;
      this.box({ x: cx - flat / 2 - L - deck / 2, z: cz, w: deck, d: width, h: lipW, tag: 'halfpipe_deck' }, C.wood, C.woodSide);
      this.box({ x: cx + flat / 2 + L + deck / 2, z: cz, w: deck, d: width, h: lipW, tag: 'halfpipe_deck' }, C.wood, C.woodSide);
      for (const sgn of [-1, 1]) {
        const x = cx + sgn * (flat / 2 + L + 0.02);
        this.rail([x, lipW + 0.02, cz - width / 2 + 0.2], [x, lipW + 0.02, cz + width / 2 - 0.2], 'coping', C.coping, false);
      }
      this.patch(cx - flat / 2, cz - width / 2, cx + flat / 2, cz + width / 2, 0x8d9aa3);
    }
    // Mini-ramp
    {
      const R = 2.1, L = R * sin85, cx = 63.5, flat = 4, width = 8, cz = 30;
      const lip = this.quarter({ x: cx - flat / 2 - L / 2, z: cz, w: width, d: L, R, yaw: -H, tag: 'miniramp' }, C.wood, C.woodSide);
      this.quarter({ x: cx + flat / 2 + L / 2, z: cz, w: width, d: L, R, yaw: H, tag: 'miniramp' }, C.wood, C.woodSide);
      for (const sgn of [-1, 1]) {
        this.box({ x: cx + sgn * (flat / 2 + L + 1.25), z: cz, w: 2.5, d: width, h: lip, tag: 'miniramp_deck' }, C.wood, C.woodSide);
        const x = cx + sgn * (flat / 2 + L + 0.02);
        this.rail([x, lip + 0.02, cz - width / 2 + 0.2], [x, lip + 0.02, cz + width / 2 - 0.2], 'coping', C.coping, false);
      }
    }
    // a quarter + kicker line between them
    this.wedge({ x: 50, z: 14, w: 2.4, d: 2, h0: 0, h1: 0.7, yaw: H, tag: 'kicker' }, C.kicker, C.kickerSide);
    const q = this.quarter({ x: 80, z: 14, w: 8, d: 2.7 * sin85, R: 2.7, yaw: H, tag: 'quarter' }, C.ramp, C.rampSide);
    this.box({ x: 80 + 2.7 * sin85 / 2 + 1.5, z: 14, w: 3, d: 8, h: q, tag: 'quarter_deck' }, C.wood, C.woodSide);
  }

  // ---------------------------------------------------------------- mega-ramp (far west)
  _megaRamp() {
    const x = -90, w = 8;
    const sin85 = Math.sin(85 * Math.PI / 180);
    this.box({ x, z: -97.5, w, d: 6, h: 14, tag: 'mega_top' }, C.wood, C.woodSide);
    this.wedge({ x, z: -78.5, w, d: 32, h0: 14, h1: 0, tag: 'mega_rollin' }, C.mega, C.megaSide);
    this.wedge({ x, z: -54, w, d: 6, h0: 0, h1: 2.8, tag: 'mega_kicker' }, C.mega, C.megaSide);
    this.wedge({ x, z: -34, w: w + 2, d: 18, h0: 3.2, h1: 0, tag: 'mega_land' }, C.mega, C.megaSide);
    this.col.addZone({ x, z: -30, w: w + 2, d: 26, tag: 'mega_land' });
    const R = 4.6, L = R * sin85;
    const lip = this.quarter({ x, z: 4 + L / 2, w: w + 2, d: L, R, tag: 'mega_quarter' }, C.mega, C.megaSide);
    this.box({ x, z: 4 + L + 1.5, w: w + 2, d: 3, h: lip, tag: 'mega_deck' }, C.wood, C.woodSide);
    this.patch(x - 5, -63, x + 5, 4, 0xe0d2c0);
    // scaffold legs under the roll-in (visual)
    for (let z = -92; z <= -66; z += 4) {
      const hh = 14 * (1 - (z + 94.5) / 32);
      for (const sx of [-w / 2 + 0.2, w / 2 - 0.2]) this.geo.beam([x + sx, 0, z], [x + sx, hh, z], 0.18, C.metal);
    }
    // safety rails along the tower top (visual)
    this.geo.beam([x - w / 2, 15, -100.4], [x + w / 2, 15, -100.4], 0.08, C.metal);
  }

  // ---------------------------------------------------------------- downhill street (south)
  _street() {
    const z0 = 45, z1 = 140, top = 10, w = 12;
    const slope = top / (z1 - z0);
    const sh = (z) => (z - z0) * slope;
    this.wedge({ x: 0, z: (z0 + z1) / 2, w, d: z1 - z0, h0: 0, h1: top, tag: 'street' }, C.street, C.streetSide);
    this.box({ x: 0, z: 147.5, w, d: 15, h: top, tag: 'street_top' }, C.concrete, C.concreteSide);
    // barriers so you don't fly off the side (sloped walls 1 m above the road)
    for (const sx of [-w / 2 - 0.2, w / 2 + 0.2]) {
      this.wedge({ x: sx, z: (z0 + z1) / 2, w: 0.4, d: z1 - z0, h0: 1.0, h1: top + 1.0, tag: 'barrier' }, C.concrete, C.concreteSide);
    }
    for (const sx of [-w / 2 - 0.2, w / 2 + 0.2]) this.box({ x: sx, z: 147.5, w: 0.4, d: 15, h: top + 1, tag: 'barrier' }, C.concrete, C.concreteSide);
    this.box({ x: 0, z: 155, w: w + 0.8, d: 0.4, h: top + 1, tag: 'barrier' }, C.concrete, C.concreteSide);
    // lane markings
    for (let z = z0 + 2; z < z1 - 3; z += 6) {
      const a = sh(z) + 0.02, bb = sh(z + 3) + 0.02;
      this.geo.quad([-0.12, a, z], [0.12, a, z], [0.12, bb, z + 3], [-0.12, bb, z + 3], C.line, [0, 1, -slope]);
    }
    // kickers on the hill (pointing downhill = toward -z)
    for (const zc of [112, 78]) {
      this.wedge({ x: -2.5, z: zc, w: 2.2, d: 2, h0: sh(zc + 1) + 0.01, h1: sh(zc - 1) + 0.55, yaw: Math.PI, tag: 'kicker' }, C.kicker, C.kickerSide);
    }
    // long downhill rail along the right side
    this.rail([4, sh(125) + 0.45, 125], [4, sh(62) + 0.45, 62], 'streetrail');
    // a ledge at the bottom of the hill
    this.ledge({ x: -4, z: 36, w: 0.7, d: 6, h: 0.45 });
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

  // ---------------------------------------------------------------- MEGA PARK (far east)
  // Big-air zone: a 12 m drop-in tower into a giant roll-in, an 18 m kicker gap
  // to a long landing, a 6 m vert quarter, a 6 m bank with a 30 m down-rail,
  // a 4 m deep bowl, a giant spine, a big pyramid, bleachers and floodlights.
  _megaPark() {
    const X0 = 116, X1 = 230, Z0 = -100, Z1 = 100;
    let slab = [[X0, Z0, X1, Z1]];
    const hole = [163.5, -72.5, 188.5, -47.5];
    slab = slab.flatMap(([x0, z0, x1, z1]) => {
      if (hole[2] <= x0 || hole[0] >= x1 || hole[3] <= z0 || hole[1] >= z1) return [[x0, z0, x1, z1]];
      const out = [];
      if (hole[0] > x0) out.push([x0, z0, hole[0], z1]);
      if (hole[2] < x1) out.push([hole[2], z0, x1, z1]);
      if (hole[1] > z0) out.push([hole[0], z0, hole[2], hole[1]]);
      if (hole[3] < z1) out.push([hole[0], hole[3], hole[2], z1]);
      return out;
    });
    for (const [x0, z0, x1, z1] of slab) this.patch(x0, z0, x1, z1, C.concrete, 0.022);  // park slab, clear of the ground below
    const E = Math.PI / 2, Wd = -Math.PI / 2;

    // ---- THE DROP: 12 m tower → giant curved roll-in (heading +x)
    const zc = 26, lane = 12;
    this.box({ x: 121, z: zc, w: 10, d: lane, h: 12, tag: 'drop_tower' }, C.wood, C.woodSide);
    const R = 18.2, L = R * Math.sin(70 * Math.PI / 180);
    const lip = this.quarter({ x: 126 + L / 2, z: zc, w: lane, d: L, R, yaw: Wd, tag: 'drop_rollin' }, C.ramp, C.rampSide);
    this.rail([126.02, lip + 0.02, zc - lane / 2 + 0.2], [126.02, lip + 0.02, zc + lane / 2 - 0.2], 'coping', C.coping, false);
    for (let x = 117; x <= 125; x += 4) for (const sz of [-1, 1]) this.geo.beam([x, 12, zc + sz * (lane / 2 - 0.1)], [x, 13.1, zc + sz * (lane / 2 - 0.1)], 0.06, C.metal);
    this.geo.beam([116.2, 13.1, zc - lane / 2], [116.2, 13.1, zc + lane / 2], 0.06, C.metal);
    // giant kicker → 18 m gap → long landing → 6 m vert quarter
    this.wedge({ x: 164, z: zc, w: lane, d: 8, h0: 0, h1: 3.5, yaw: E, tag: 'mega2_kicker' }, C.ramp, C.rampSide);
    this.wedge({ x: 189, z: zc, w: lane + 2, d: 30, h0: 2.6, h1: 0, yaw: E, tag: 'mega2_land' }, C.ramp, C.rampSide);
    this.col.addZone({ x: 189, z: zc, w: 30, d: lane + 2, tag: 'mega2_land' });
    this.patch(168, zc - lane / 2, 174, zc + lane / 2, 0xd9b45a, 0.04);
    this._qp(221.5 - 1, zc, lane + 2, 6.6, E, 3, 85, 'mega2_quarter');

    // ---- BIG BANK & 30 m DOWN-RAIL (heading +x)
    const zb = 56;
    this.box({ x: 122, z: zb, w: 8, d: 12, h: 6, tag: 'bigbank_top' }, C.concrete, C.concreteSide);
    this.wedge({ x: 141, z: zb, w: 12, d: 30, h0: 0, h1: 6, yaw: Wd, tag: 'bigbank' }, C.ramp, C.rampSide);
    const bankH = (x) => 6 * (1 - (x - 126) / 30);
    this.rail([126.5, bankH(126.5) + 0.55, zb + 2], [155.5, bankH(155.5) + 0.55, zb + 2], 'megarail');
    this.rail([118.5, 6.55, zb + 2], [126.5, bankH(126.5) + 0.55, zb + 2], 'megarail_flat');
    // hubba ledge down the other side of the bank
    this.wedge({ x: 141, z: zb - 5.7, w: 0.6, d: 30, h0: 0.45, h1: 6.45, yaw: Wd, tag: 'hubba' }, C.ledge, C.ledgeSide);
    this.col.addRail([126, 6.45, zb - 5.42], [156, 0.45, zb - 5.42], 'hubba');
    this.col.addRail([126, 6.45, zb - 5.98], [156, 0.45, zb - 5.98], 'hubba');

    // ---- MEGA BOWL rim deck + giant spine + big pyramid + quarter wall
    const spineL = 4.6 * Math.sin(65 * Math.PI / 180);
    this.quarter({ x: 150, z: -20 + spineL / 2, w: 16, d: spineL, R: 4.6, yaw: Math.PI, tag: 'spine' }, C.ramp, C.rampSide);
    const sLip = this.quarter({ x: 150, z: -20 - spineL / 2, w: 16, d: spineL, R: 4.6, yaw: 0, tag: 'spine' }, C.ramp, C.rampSide);
    this.rail([142.2, sLip + 0.02, -20], [157.8, sLip + 0.02, -20], 'coping', C.coping, false);
    this._pyramid(205, -45, 10, 8, 2.2, 5, 'megapyramid');
    this.rail([201, 2.6, -45], [209, 2.6, -45], 'parkrail');
    for (const [x, w] of [[132, 18], [214, 18]]) this._qp(x, -95.3, w, 4.2, Math.PI, 2.5, 82, 'park_quarter');

    // ---- perimeter, floodlights, bleachers, banners
    this._fence(X0, Z0, X1, Z0 + 0.4);
    this._fence(X0, Z1 - 0.4, X1, Z1);
    this._fence(X1 - 0.4, Z0, X1, Z1);
    this._fence(X0, Z0, X0 + 0.4, -10); this._fence(X0, 76, X0 + 0.4, Z1);
    for (const [x, z] of [[118, -98], [228, -98], [118, 98], [228, 98], [172, -2], [172, 82]]) this._floodlight(x, z, 12);
    for (let r = 0; r < 4; r++) {                    // bleachers facing the big-air lane
      this.box({ x: 190, z: 4 - r * 1.1, w: 26, d: 1.1, h: 0.45 * (r + 1), tag: 'bleacher' }, C.concrete, C.concreteSide);
    }
    for (let i = 0; i < 5; i++) {                    // banners on the bleachers
      const bx = 180 + i * 5, col = [0xf4743b, 0x2a9d8f, 0xf2c14e, 0x457b9d, 0xe63946][i];
      this.geo.prism({ x: bx, z: 0.2, w: 3.5, d: 0.05 }, [3.6, 3.6, 3.6, 3.6], 2.2, col, col);
      this.geo.beam([bx - 1.75, 0, 0.2], [bx - 1.75, 3.6, 0.2], 0.05, C.metal);
      this.geo.beam([bx + 1.75, 0, 0.2], [bx + 1.75, 3.6, 0.2], 0.05, C.metal);
    }
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

  // ---------------------------------------------------------------- TITAN PARK (far south)
  // The giant park: four long lines that start from drop-in towers (so your speed
  // into every jump is predictable), plus a transition zone.
  _titanPark() {
    const X0 = 20, X1 = 228, Z0 = 162, Z1 = 396, g = PHYSICS.gravity;
    // floor slab, cut around the giant bowl
    let slab = [[X0, Z0, X1, Z1]];
    const hole = [174.5, 206.5, 205.5, 237.5];
    slab = slab.flatMap(([x0, z0, x1, z1]) => {
      if (hole[2] <= x0 || hole[0] >= x1 || hole[3] <= z0 || hole[1] >= z1) return [[x0, z0, x1, z1]];
      const out = [];
      if (hole[0] > x0) out.push([x0, z0, hole[0], z1]);
      if (hole[2] < x1) out.push([hole[2], z0, x1, z1]);
      if (hole[1] > z0) out.push([hole[0], z0, hole[2], hole[1]]);
      if (hole[3] < z1) out.push([hole[0], hole[3], hole[2], z1]);
      return out;
    });
    for (const [x0, z0, x1, z1] of slab) this.patch(x0, z0, x1, z1, C.concrete, 0.022);  // park slab, clear of the ground below
    const tower = (x, w, h, z0, z1, tag) => {
      this.box({ x, z: (z0 + z1) / 2, w, d: z1 - z0, h, tag }, C.wood, C.woodSide);
      for (let zz = z0 + 0.5; zz <= z1; zz += 2.5) for (const sx of [-1, 1]) this.geo.beam([x + sx * (w / 2 - 0.1), h, zz], [x + sx * (w / 2 - 0.1), h + 1.1, zz], 0.05, C.metal);
      this.geo.beam([x - w / 2, h + 1.1, z0 + 0.1], [x + w / 2, h + 1.1, z0 + 0.1], 0.05, C.metal);
      for (let zz = z0 + 1; zz < z1; zz += 4) for (const sx of [-1, 1]) this.geo.beam([x + sx * (w / 2 - 0.3), 0, zz], [x + sx * (w / 2 - 0.3), h, zz], 0.2, C.metal);
    };

    // ===== LINE A — MEGA AIR: 22 m tower → 40 m roll-in → two big designed jumps → vert quarter
    {
      const x = 40, w = 14;
      tower(x, w, 22, 163, 171, 'titanA_top');
      this.wedge({ x, z: 191, w, d: 40, h0: 22, h1: 0, tag: 'titanA_rollin' }, C.ramp, C.rampSide);
      let v = 0.93 * Math.sqrt(2 * g * 22);
      let z = 211;
      v = this._coast(v, 8); z += 8;
      let j = this._designJump({ x, w, z0: z, h: 4, d: 9, v, name: 'titanA1', label: 'Titan Gap', points: 2500 });
      z = j.end; v = this._coast(j.vOut, 14); z += 14;
      if (z < 300) {
        j = this._designJump({ x, w, z0: z, h: 3.2, d: 7, v, name: 'titanA2', label: 'Titan Gap II', points: 2500 });
        z = j.end; v = this._coast(j.vOut, 10); z += 10;
      }
      const R = 7, L = R * Math.sin(85 * Math.PI / 180);
      this.quarter({ x, z: z + L / 2, w: w + 2, d: L, R, yaw: 0, tag: 'titanA_quarter' }, C.ramp, C.rampSide);
      this.box({ x, z: z + L + 1.5, w: w + 2, d: 3, h: R * (1 - Math.cos(85 * Math.PI / 180)), tag: 'titanA_deck' }, C.concrete, C.concreteSide);
      this.lineEnds = { A: z + L + 3 };
    }

    // ===== LINE B — RAIL LINE: 12 m tower → roll-in onto a 3 m deck of ledges & rails → 17-stair → street
    {
      const x = 85, w = 16, deckH = 3;
      tower(x, w, 12, 163, 171, 'titanB_top');
      this.wedge({ x, z: 181, w, d: 20, h0: 12, h1: deckH, tag: 'titanB_rollin' }, C.ramp, C.rampSide);
      this.box({ x, z: 221, w, d: 60, h: deckH, tag: 'titanB_deck' }, C.concrete, C.concreteSide);
      this.ledge({ x: x - 4.5, z: 205, w: 0.6, d: 14, h: deckH + 0.45, base: deckH }, C.ledge, C.ledgeSide);
      this.ledge({ x: x + 4.5, z: 230, w: 0.6, d: 16, h: deckH + 0.45, base: deckH }, C.ledge, C.ledgeSide);
      this.rail([x, deckH + 0.5, 213], [x, deckH + 0.5, 238], 'titanrail');
      this.ledge({ x: x - 4, z: 244, w: 3, d: 5, h: deckH + 0.22, base: deckH, tag: 'manualpad' }, C.pad, C.padSide, 'manualpad');
      // 17-stair down to the ground with two long handrails
      const n = 17, stepH = deckH / n, tread = 0.38, zTop = 251;
      for (let i = 1; i < n; i++) this.box({ x, z: zTop + (i - 1) * tread + tread / 2, w: 10, d: tread, h: deckH - i * stepH, tag: 'titanB_steps', noShadow: true }, i % 2 ? 0xd6d0c4 : 0xc9c2b4, C.concreteSide);
      for (const sx of [-1, 1]) this.box({ x: x + sx * 6.5, z: zTop + 3.05, w: 3, d: 6.1, h: 0.1, tag: 'titanB_side' }, C.concrete, C.concreteSide);
      const run = (n - 1) * tread, slope = stepH / tread;
      for (const sx of [-1, 1]) {
        const rx = x + sx * 4.4, y = (zz) => deckH + 0.6 - Math.max(0, zz - zTop) * slope;
        this.rail([rx, deckH + 0.6, zTop - 2], [rx, deckH + 0.6, zTop], 'handrail_flat');
        this.rail([rx, deckH + 0.6, zTop], [rx, y(zTop + run + 0.3), zTop + run + 0.3], 'handrail');
      }
      this.col.addZone({ x, z: zTop + run + 7, w: 14, d: 12, tag: 'titanB_land' });
      GAPS.push({ name: '17-Stair', from: 'titanB_deck', to: 'titanB_land', points: 1800 });
      // street section after the stairs: long flat bar, kinked ledge, bank-to-ledge
      this.rail([x - 3, 0.4, 272], [x - 3, 0.4, 300], 'flatbar');
      this.ledge({ x: x + 3, z: 290, w: 0.6, d: 18, h: 0.5 }, C.ledge, C.ledgeSide);
      this._bank(x, 312, w, 6, 1.5, 0, 'titanB_bank');
      this.box({ x, z: 318, w, d: 6, h: 1.5, tag: 'titanB_block' }, C.concrete, C.concreteSide);
      this._bank(x, 324, w, 6, 1.5, Math.PI, 'titanB_bank');
      this.ledge({ x, z: 318, w: 4, d: 0.6, h: 1.95, base: 1.5 }, C.ledge, C.ledgeSide);
    }

    // ===== LINE C — DROP LINE: 10 m deck → roll off onto a long landing → designed kicker gap → quarter
    {
      const x = 130, w = 14, H = 10;
      tower(x, w, H, 163, 185, 'titanC_top');
      this.wedge({ x, z: 200.2, w: w + 2, d: 30, h0: H - 0.25, h1: 0, tag: 'titanC_land' }, C.ramp, C.rampSide);
      this.col.addZone({ x, z: 200.2, w: w + 2, d: 30, tag: 'titanC_land' });
      GAPS.push({ name: 'The Big Drop', from: 'titanC_top', to: 'titanC_land', points: 1500 });
      // speed at the bottom: a few pushes on the deck (~6 m/s) + 10 m of drop
      // calibrated from test rides: a lazy push (4 m/s) to a full push (8 m/s) on the deck
      // arrives at the kicker at ~13.5–15 m/s
      let v = 0.89 * Math.sqrt(30 + 2 * g * H);
      let z = 215.2;
      v = this._coast(v, 12); z += 12;
      const j = this._designJump({ x, w, z0: z, h: 3, d: 6.5, v, name: 'titanC1', label: 'Drop Line Gap', points: 2000 });
      z = j.end + 10;
      const R = 5.5, L = R * Math.sin(85 * Math.PI / 180);
      this.quarter({ x, z: z + L / 2, w: w + 2, d: L, R, yaw: 0, tag: 'titanC_quarter' }, C.ramp, C.rampSide);
      this.box({ x, z: z + L + 1.5, w: w + 2, d: 3, h: R * (1 - Math.cos(85 * Math.PI / 180)), tag: 'titanC_deck' }, C.concrete, C.concreteSide);
    }

    // ===== FUNBOX SECTION between the lines
    {
      this._pyramid(62, 285, 8, 6, 1.2, 3, 'titanfun');
      this.rail([59, 1.6, 285], [65, 1.6, 285], 'parkrail');
      this.ledge({ x: 62, z: 310, w: 0.6, d: 14, h: 0.5 }, C.ledge, C.ledgeSide);
      this.ledge({ x: 62, z: 330, w: 5, d: 3, h: 0.22, tag: 'manualpad' }, C.pad, C.padSide, 'manualpad');
      this.rail([58, 0.4, 345], [66, 0.4, 365], 'flatbar');
    }

    // ===== TRANSITION ZONE: giant bowl (5 m deep), big spine, mega hip, 8 m quarter wall
    {
      const sL = 5 * Math.sin(65 * Math.PI / 180);
      this.quarter({ x: 188, z: 290 + sL / 2, w: 22, d: sL, R: 5, yaw: Math.PI, tag: 'spine' }, C.ramp, C.rampSide);
      const sLip = this.quarter({ x: 188, z: 290 - sL / 2, w: 22, d: sL, R: 5, yaw: 0, tag: 'spine' }, C.ramp, C.rampSide);
      this.rail([177.2, sLip + 0.02, 290], [198.8, sLip + 0.02, 290], 'coping', C.coping, false);
      this._pyramid(190, 335, 10, 8, 2.5, 5.5, 'titanhip');
      this.rail([186, 2.9, 335], [194, 2.9, 335], 'parkrail');
      const R = 9, L = R * Math.sin(85 * Math.PI / 180), lip = R * (1 - Math.cos(85 * Math.PI / 180));
      this.quarter({ x: 188, z: 389.5 - L / 2, w: 64, d: L, R, yaw: 0, tag: 'titan_wall' }, C.ramp, C.rampSide);
      this.box({ x: 188, z: 392.7, w: 64, d: 6.4, h: lip, tag: 'titan_wall_deck' }, C.concrete, C.concreteSide);
      this.rail([156.2, lip + 0.02, 389.5], [219.8, lip + 0.02, 389.5], 'coping', C.coping, false);
    }

    // ===== perimeter, lights
    this._fence(X0, Z0, X0 + 0.4, Z1); this._fence(X1 - 0.4, Z0, X1, Z1); this._fence(X0, Z1 - 0.4, X1, Z1);
    this._fence(X0, Z0, 31, Z0 + 0.4); this._fence(140, Z0, X1, Z0 + 0.4);
    for (const [x, z] of [[22, 164], [226, 164], [22, 394], [226, 394], [108, 280], [160, 260], [160, 360]]) this._floodlight(x, z, 14);
    if (typeof console !== 'undefined') console.info('Titan Park jumps', JSON.stringify(this.jumpLog));
  }

  // ---------------------------------------------------------------- city detail
  // roads with markings, curbs, lawns, more trees / bushes, hydrants, bus stop,
  // parked cars, rooftop units — makes the world feel lived-in
  _cityDetail() {
    const asphalt = C.street;
    // an east–west avenue south of the plaza + a north–south road to the Mega Park
    const road = (x0, z0, x1, z1, alongX) => {
      this.patch(x0, z0, x1, z1, asphalt, 0.011);
      const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2;
      if (alongX) for (let x = x0 + 1; x < x1 - 3; x += 6) this.patch(x, mid - 0.08, x + 3, mid + 0.08, C.line, 0.0125);
      else for (let z = z0 + 1; z < z1 - 3; z += 6) this.patch(mid - 0.08, z, mid + 0.08, z + 3, C.line, 0.0125);
    };
    road(-108, 38, 112, 44, true);
    road(106, -105, 112, 38, false);
    // crosswalk stripes where the avenue meets the downhill street
    for (let i = 0; i < 6; i++) this.patch(-6 + i * 2, 38.2, -5 + i * 2, 43.8, C.line, 0.0126);
    // rideable curbs along the avenue (low enough to roll up)
    for (const z of [37.85, 44.15]) {
      for (const [x0, x1] of [[-108, -7], [7, 33], [101, 112]]) {
        this.box({ x: (x0 + x1) / 2, z, w: x1 - x0, d: 0.3, h: 0.11, tag: 'curb', noShadow: true }, C.concrete, C.concreteSide);
      }
    }
    // lawns
    for (const [x0, z0, x1, z1] of [[-105, 46, -20, 105], [-105, 108, -20, 150], [100, 46, 112, 150], [-28, -105, 100, -78], [40, -66, 100, -40]]) {
      this.patch(x0, z0, x1, z1, C.grass, 0.012);
      this.foliage.addLawn(x0, z0, x1, z1, 0.012);
      this.col.addLawn(x0, z0, x1, z1);
    }
    // more trees & bushes on the lawns (deterministic scatter)
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const tree = (x, z, s = 1) => {
      this.col.addBox({ x, z, w: 0.45 * s, d: 0.45 * s, h: 3 * s, tag: 'tree' });
      this.foliage.addTree(x, z, s);
    };
    for (const [x0, z0, x1, z1, n] of [[-100, 50, -25, 100, 26], [-100, 112, -25, 148, 14], [-25, -102, 95, -82, 16], [44, -64, 96, -44, 10]]) {
      for (let i = 0; i < n; i++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        if (rnd() < 0.7) tree(x, z, 0.8 + rnd() * 0.5);
        else { this.foliage.addBush(x, z, 0.9 + rnd() * 0.4); this.foliage.addBush(x + 0.8, z + 0.5, 0.6 + rnd() * 0.3); }
      }
    }
    // hydrants
    for (const [x, z] of [[-30, 36.6], [20, 36.6], [60, 45.4], [-70, 45.4], [104.5, 0]]) {
      this.col.addBox({ x, z, w: 0.3, d: 0.3, h: 0.7, tag: 'hydrant' });
      this.geo.addGeometry(new THREE.CylinderGeometry(0.12, 0.14, 0.6, 10), new THREE.Matrix4().makeTranslation(x, 0.3, z), 0xc0392b);
      this.geo.addGeometry(new THREE.SphereGeometry(0.12, 10, 6), new THREE.Matrix4().makeTranslation(x, 0.62, z), 0xc0392b);
      this.geo.addGeometry(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 6).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 0.4, z), 0xa93226);
    }
    // bus shelter
    {
      const x = -45, z = 36;
      this.box({ x, z: z - 0.9, w: 4, d: 0.1, h: 2.4, tag: 'shelter' }, 0x9fb3bd, C.metal);
      this.geo.prism({ x, z, w: 4.4, d: 2 }, [2.6, 2.6, 2.6, 2.6], 2.45, C.metal, C.metal);
      for (const sx of [-2, 2]) this.geo.beam([x + sx, 0, z + 0.9], [x + sx, 2.45, z + 0.9], 0.07, C.metal);
      this.ledge({ x, z: z - 0.55, w: 3, d: 0.45, h: 0.45, tag: 'bench' }, C.bench, C.metal, 'bench');
    }
    // parked cars along the avenue
    const CAR = [0xb23a48, 0x2d4059, 0xe0e0e0, 0x3a6351, 0x1d1d1d, 0xc9a227];
    [[-90, 46.2], [-78, 46.2], [-60, 46.2], [52, 46.2], [66, 46.2], [92, 36], [-95, 36]].forEach(([x, z], i) => {
      const col = CAR[i % CAR.length], r = { x, z, w: 4.2, d: 1.8, yaw: 0 };
      this.col.addBox({ ...r, h: 1.0, tag: 'car' });
      this.geo.prism(r, [0.95, 0.95, 0.95, 0.95], 0.28, col, col);
      this.geo.prism({ x: x - 0.2, z, w: 2.2, d: 1.6 }, [1.45, 1.45, 1.45, 1.45], 0.95, 0x27323d, col);
      this.geo.prism({ x: x - 0.2, z, w: 1.9, d: 1.5 }, [1.48, 1.48, 1.48, 1.48], 1.45, col, col);
      for (const [wx, wz] of [[1.3, -0.85], [1.3, 0.85], [-1.3, -0.85], [-1.3, 0.85]]) {
        this.geo.addGeometry(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x + wx, 0.32, z + wz), 0x1b1b1b);
      }
      this.geo.castShadow(GeoBuilder.prismPoints(r, [1.45, 1.45, 1.45, 1.45], 0), 0);
    });
  }

  // ---------------------------------------------------------------- distant terrain
  // Rolling hills far outside the city (no collision), coloured with a bit of
  // atmospheric haze so the horizon isn't just a flat edge.
  _terrain() {
    const cx = 60, cz = 140, S = 80, RINGS = 9, r0 = 335, r1 = 520;
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

  // ---------------------------------------------------------------- Tel Aviv beach (west)
  // Inspired by a Mediterranean beachfront: open sea, a sand beach with umbrellas
  // and a lifeguard tower, a raised tiled promenade with a grindable sea-wall
  // edge, stair sets with handrails down to the sand, banks up from the street,
  // palm trees, and white Bauhaus-style apartment blocks across the road.
  _telAviv() {
    const z0 = 158, z1 = 394, PH = 1.2;                       // promenade height
    // the sea (visual), beach sand (slows you down like grass), wet sand at the waterline
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(260, 330).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.94 }));
    sea.position.set(-110 - 130, 0.02, (z0 + z1) / 2 + 20);
    sea.receiveShadow = true;
    this.scene.add(sea); this.sea = sea;
    this.patch(-112, z0 - 4, -86, z1 + 2, C.sand, 0.02);
    this.patch(-112, z0 - 4, -106, z1 + 2, C.sandWet, 0.03);
    this.col.addLawn(-112, z0 - 4, -86.05, z1 + 2);
    // raised promenade with a grindable sea-wall edge
    this.box({ x: -73, z: (z0 + z1) / 2, w: 26, d: z1 - z0, h: PH, tag: 'promenade' }, C.promenade, C.concreteSide);
    this.col.addRail([-85.96, PH, z0 + 0.5], [-85.96, PH, z1 - 0.5], 'seawall');
    // stair sets down to the beach with a handrail
    for (const zc of [205, 275, 345]) {
      const n = 7, stepH = PH / n, stepD = 0.38, W = 6;
      for (let i = 1; i < n; i++) {
        const x = -86 - (i - 0.5) * stepD;
        this.box({ x, z: zc, w: stepD, d: W, h: PH - i * stepH, tag: 'tlv_steps', noShadow: true }, i % 2 ? 0xd6d0c4 : 0xc9c2b4, C.concreteSide);
      }
      const run = (n - 1) * stepD, slope = stepH / stepD;
      this.rail([-86 + 0.6, PH + 0.6, zc], [-86, PH + 0.6, zc], 'handrail_flat');
      this.rail([-86, PH + 0.6, zc], [-86 - run - 0.3, PH + 0.6 - (run + 0.3) * slope, zc], 'handrail');
    }
    // a bank from the promenade down to the sand
    this.wedge({ x: -90, z: 240, w: 8, d: 8, h0: 0, h1: PH, yaw: Math.PI / 2, tag: 'tlv_bank' }, C.concrete, C.concreteSide);
    // banks up from the street, plus the north / south ends
    for (const zc of [178, 250, 322, 384]) this.wedge({ x: -57, z: zc, w: 8, d: 6, h0: 0, h1: PH, yaw: -Math.PI / 2, tag: 'tlv_bank' }, C.concrete, C.concreteSide);
    this.wedge({ x: -73, z: z0 - 4, w: 26, d: 8, h0: 0, h1: PH, tag: 'tlv_ramp' }, C.concrete, C.concreteSide);
    // promenade furniture: granite benches (ledges), palm planters (ledges), lamps
    for (let z = 172; z < z1 - 8; z += 28) {
      this.ledge({ x: -79, z, w: 0.6, d: 3.2, h: PH + 0.45, base: PH, tag: 'tlv_bench' }, C.ledge, C.ledgeSide);
      this.ledge({ x: -67, z: z + 14, w: 2.2, d: 2.2, h: PH + 0.5, base: PH, tag: 'tlv_planter' }, C.concrete, C.concreteSide);
      this.foliage.addPalm(-67, z + 14, 0.9 + ((z * 7) % 5) * 0.06, PH + 0.5);
      this.col.addBox({ x: -62, z: z + 6, w: 0.25, d: 0.25, h: PH + 5, tag: 'lamp' });
      this.geo.beam([-62, PH, z + 6], [-62, PH + 5, z + 6], 0.12, C.metal);
      this.geo.prism({ x: -62.6, z: z + 6, w: 1.2, d: 0.35 }, [PH + 5.15, PH + 5.15, PH + 5.15, PH + 5.15], PH + 4.95, 0xfff3b0, 0xfff3b0);
    }
    // beach: umbrellas, loungers, palms and a lifeguard tower on stilts
    const STRIPES = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d];
    for (let i = 0, z = 186; z < z1 - 6; z += 19, i++) {
      if (Math.abs(z - 205) < 6 || Math.abs(z - 275) < 6 || Math.abs(z - 345) < 6 || Math.abs(z - 240) < 7) continue;
      const x = -98 + (i % 2) * 4;
      this.geo.beam([x, 0, z], [x, 2.3, z], 0.05, 0xdddddd);
      this.geo.addGeometry(new THREE.ConeGeometry(1.4, 0.55, 12, 1, true), new THREE.Matrix4().makeTranslation(x, 2.25, z), STRIPES[i % 4]);
      this.geo.castShadow([[x - 1.4, 2.0, z - 1.4], [x + 1.4, 2.0, z - 1.4], [x - 1.4, 2.0, z + 1.4], [x + 1.4, 2.0, z + 1.4]], 0);
      for (const dz of [-1.2, 1.2]) this.geo.prism({ x: x + 1.2, z: z + dz, w: 1.9, d: 0.65 }, [0.32, 0.32, 0.32, 0.32], 0.05, 0xf2efe6, 0xc9c2b4);
    }
    for (let z = 196; z < z1; z += 37) { this.foliage.addPalm(-90.5, z + 9, 1.05, 0); this.col.addBox({ x: -90.5, z: z + 9, w: 0.4, d: 0.4, h: 3, tag: 'tree' }); }
    { const x = -99, z = 300;
      for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) this.geo.beam([x + ox, 0, z + oz], [x + ox, 2.6, z + oz], 0.14, 0xe9e4d8);
      this.geo.prism({ x, z, w: 3.4, d: 3.4 }, [5, 5, 5, 5], 2.6, 0xf0ede4, 0x3d7ea6);
      this.geo.prism({ x, z, w: 4.2, d: 4.2 }, [5.4, 5.4, 5.4, 5.4], 5, 0xe63946, 0xe63946);
      this.geo.castShadow(GeoBuilder.prismPoints({ x, z, w: 3.4, d: 3.4 }, [5.4, 5.4, 5.4, 5.4], 2.6), 0);
      for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) this.col.addBox({ x: x + ox, z: z + oz, w: 0.3, d: 0.3, h: 2.6, tag: 'lifeguard' });   // you can ride under it
    }
    // the beach road between the promenade and the buildings
    this.patch(-53, z0 - 4, -43, z1, C.street, 0.018);
    for (let z = z0; z < z1 - 4; z += 6) this.patch(-48.1, z, -47.9, z + 3, C.line, 0.022);
    // white Bauhaus-style apartment blocks: ribbon windows, rounded corner balconies, pilotis
    let k = 0;
    for (let z = 172; z < z1 - 10; z += 30, k++) {
      const x = -30 + (k % 2) * 6, w = 16, d = 18, h = 12 + (k % 3) * 3.2;
      // the ground floor is a recessed glass lobby behind the pilotis (that's what you collide with)
      this.col.addBox({ x, z, w: w - 2, d: d - 2, h, tag: 'building' });
      this.geo.prism({ x, z, w: w - 2, d: d - 2 }, [2.8, 2.8, 2.8, 2.8], 0, 0x3b4a58, 0x3b4a58);
      for (const [ox, oz, ww, dd] of [[0, -(d - 2) / 2, w - 2, 0.12], [0, (d - 2) / 2, w - 2, 0.12], [-(w - 2) / 2, 0, 0.12, d - 2], [(w - 2) / 2, 0, 0.12, d - 2]])
        this.geo.prism({ x: x + ox, z: z + oz, w: ww + 0.02, d: dd + 0.02 }, [0.25, 0.25, 0.25, 0.25], 0, C.stuccoShade, C.stuccoShade);   // stucco plinth
      for (const [ox, oz] of [[-7, -8], [7, -8], [-7, 8], [7, 8], [0, -8], [0, 8]]) {
        this.col.addBox({ x: x + ox, z: z + oz, w: 0.5, d: 0.5, h: 2.8, tag: 'pilotis' });
        this.geo.prism({ x: x + ox, z: z + oz, w: 0.45, d: 0.45 }, [2.8, 2.8, 2.8, 2.8], 0, C.stucco, C.stuccoShade);
      }
      this.geo.prism({ x, z, w, d }, [h, h, h, h], 2.8, C.stucco, C.stucco);
      this.geo.castShadow(GeoBuilder.prismPoints({ x, z, w, d }, [h, h, h, h], 2.8), 0);
      for (let y = 4.2; y < h - 0.8; y += 3.2) {
        this.geo.prism({ x, z, w: w + 0.06, d: d + 0.06 }, [y + 0.9, y + 0.9, y + 0.9, y + 0.9], y, 0x2f3b47, 0x2f3b47);   // ribbon windows
        // rounded corner balcony (west side, facing the sea)
        this.geo.addGeometry(new THREE.CylinderGeometry(2.4, 2.4, 0.95, 20, 1, false, Math.PI, Math.PI), new THREE.Matrix4().makeTranslation(x - w / 2, y - 0.1, z + d / 2 - 2.4), C.stucco);
        this.geo.prism({ x: x - w / 2 - 0.9, z, w: 1.8, d: d - 5 }, [y + 0.35, y + 0.35, y + 0.35, y + 0.35], y - 0.55, C.stucco, C.stuccoShade);
      }
      this.geo.prism({ x, z, w: w + 0.4, d: d + 0.4 }, [h + 0.3, h + 0.3, h + 0.3, h + 0.3], h, C.stuccoShade, C.stuccoShade);   // roof parapet
    }
  }

  // graffiti on walls + cracks, oil, gum, scuffs and grime on the ground (one draw call)
  _decals() {
    const D = new Decals(this.scene), b = this.col.bounds, r = (() => { let sd = 91; return () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }; })();
    let k = 0;
    // inner faces of the buildings around the city (every other one gets a piece)
    for (let x = b.minX; x < b.maxX; x += 22) {
      if (k++ % 2 === 0) D.graffiti([x + 11 + (r() - 0.5) * 6, 5.2, b.minZ - 1], [0, 0, 1], 6 + r() * 2, k % 4);
      if (k % 3 === 0) D.graffiti([x + 11 + (r() - 0.5) * 6, 5.2, b.maxZ + 1], [0, 0, -1], 6 + r() * 2, (k + 1) % 4);
    }
    for (let z = b.minZ; z < b.maxZ; z += 22) {
      if (k++ % 2 === 0 && z < 150) D.graffiti([b.minX, 5.2, z + 11 + (r() - 0.5) * 6], [1, 0, 0], 6 + r() * 2, k % 4);
      if (k % 3 === 0) D.graffiti([b.maxX, 5.2, z + 11 + (r() - 0.5) * 6], [-1, 0, 0], 6 + r() * 2, (k + 2) % 4);
    }
    // the beach sea wall
    for (const z of [180, 230, 300, 368]) D.graffiti([-86.02, 0.62, z], [-1, 0, 0], 2.2, (z / 10 | 0) % 4);
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

  // Jewish & Israeli character for the Tel Aviv beachfront
  _telAvivJewish() {
    const BLUE = 0x0038b8, GOLD = 0xc9a227, PH = 1.2;
    const israelFlag = (x, w, h) => {
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#0038b8';
      x.fillRect(0, h * 0.1, w, h * 0.15); x.fillRect(0, h * 0.75, w, h * 0.15);
      // Star of David in the middle
      const cx = w / 2, cy = h / 2, r = h * 0.2;
      x.lineWidth = h * 0.035; x.strokeStyle = '#0038b8';
      for (const rot of [0, Math.PI]) {
        x.beginPath();
        for (let k = 0; k < 3; k++) { const a = rot + k * 2 * Math.PI / 3; x[k ? 'lineTo' : 'moveTo'](cx + Math.sin(a) * r, cy - Math.cos(a) * r); }
        x.closePath(); x.stroke();
      }
    };
    // every Israeli flag shares one texture and is GPU-instanced per size (few draw calls)
    const flags = {};
    const flag = (w, h, pos, rotY, wave) => (flags[w + 'x' + h] || (flags[w + 'x' + h] = { w, h, wave, list: [] })).list.push([pos, rotY]);
    const flagPole = (px, py, pz, hgt = 6, rotY = 0) => {
      this.col.addBox({ x: px, z: pz, w: 0.2, d: 0.2, h: py + hgt, tag: 'pole' });
      this.geo.beam([px, py, pz], [px, py + hgt, pz], 0.08, 0xdddddd);
      flag(1.8, 1.3, [px + Math.cos(rotY) * 0.92, py + hgt - 0.7, pz - Math.sin(rotY) * 0.92], rotY, 0.12);
    };
    // flags along the promenade (sea side) and on every apartment roof
    for (let z = 166; z < 392; z += 28) flagPole(-84.5, PH, z, 6);
    for (let z = 172, k = 0; z < 384; z += 30, k++) { const x = -30 + (k % 2) * 6, h = 12 + (k % 3) * 3.2; flagPole(x, h + 0.3, z, 3.2); }
    // Stars of David inlaid in the promenade, between the benches
    for (let z = 180; z < 390; z += 28) {
      this.geo.addGeometry(this._starOfDavid(1.3, 0.16, 0.02).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(-73, PH + 0.012, z), BLUE);
    }
    // a blue Star of David on the street-facing wall of each building
    for (let z = 172, k = 0; z < 384; z += 30, k++) {
      const x = -30 + (k % 2) * 6, h = 12 + (k % 3) * 3.2;
      this.geo.addGeometry(this._starOfDavid(1.6, 0.2, 0.08).rotateY(-Math.PI / 2), new THREE.Matrix4().makeTranslation(x - 8.06, h - 2.2, z - 4), BLUE);
    }
    // big Star of David sculpture on the beach and a menorah at the promenade entrance
    this.geo.addGeometry(this._starOfDavid(2.4, 0.28, 0.3).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(-100, 3.1, 258), BLUE);
    this.geo.beam([-100, 0, 258], [-100, 0.8, 258], 0.4, 0xd6d0c4);
    this.col.addBox({ x: -100, z: 258, w: 0.6, d: 0.6, h: 5.5, tag: 'sculpture' });
    { // seven-branched menorah on a stone plinth
      const x = -64, z = 161, y0 = PH;
      this.box({ x, z, w: 3.2, d: 1.2, h: y0 + 0.9, base: y0, tag: 'menorah_plinth' }, 0xd6d0c4, 0xc9c2b4);
      const top = y0 + 0.9 + 3.2;
      this.geo.beam([x, y0 + 0.9, z], [x, top, z], 0.16, GOLD);
      for (let i = 1; i <= 3; i++) {
        const r = i * 0.42, pts = [];
        for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; pts.push([x - Math.cos(a) * r, top - Math.sin(a) * r * 1.15, z]); }
        for (let k = 0; k < 10; k++) this.geo.beam(pts[k], pts[k + 1], 0.12, GOLD);
        for (const sx of [-1, 1]) this.geo.prism({ x: x + sx * r, z, w: 0.22, d: 0.22 }, [top + 0.12, top + 0.12, top + 0.12, top + 0.12], top - 0.02, GOLD, GOLD);
      }
      this.geo.prism({ x, z, w: 0.22, d: 0.22 }, [top + 0.12, top + 0.12, top + 0.12, top + 0.12], top - 0.02, GOLD, GOLD);
      this._canvasPlane(3.0, 0.5, (c, w, h) => { c.fillStyle = '#2f3b47'; c.fillRect(0, 0, w, h); c.fillStyle = '#f2e6c0'; c.font = `bold ${h * 0.62}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('תל אביב–יפו', w / 2, h / 2); }, [x, y0 + 0.5, z - 0.62], Math.PI);
    }
    // synagogue on the beach road: white hall, arched windows, a Star of David window and roof star
    { const x = -4, z = 252, w = 14, d = 10, h = 9;
      this.box({ x, z: z - 2, w, d, h, tag: 'synagogue' }, C.stuccoShade, C.stucco);
      for (let i = -2; i <= 2; i++) this.geo.prism({ x: x - w / 2 - 0.04, z: z - 2 + i * 1.8, w: 0.1, d: 0.9 }, [6.5, 6.5, 6.5, 6.5], 2.5, 0x3d5a80, 0x3d5a80);
      this.geo.addGeometry(this._starOfDavid(1.5, 0.22, 0.12).rotateY(-Math.PI / 2), new THREE.Matrix4().makeTranslation(x - w / 2 - 0.1, 7.4, z - 2), BLUE);
      this.geo.addGeometry(this._starOfDavid(0.9, 0.14, 0.12), new THREE.Matrix4().makeTranslation(x, h + 1.2, z - 2), GOLD);
      this.geo.beam([x, h, z - 2], [x, h + 0.3, z - 2], 0.1, GOLD);
      this._canvasPlane(5, 0.8, (c, w2, h2) => { c.fillStyle = '#f0ede4'; c.fillRect(0, 0, w2, h2); c.fillStyle = '#0038b8'; c.font = `bold ${h2 * 0.6}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('בית כנסת', w2 / 2, h2 / 2); }, [x - w / 2 - 0.08, 1.9, z - 2], -Math.PI / 2);
    }
    // blue & white bunting over the beach road, and Hebrew beach signs
    for (let z = 186; z < 380; z += 40) {
      for (let k = 0; k < 9; k++) {
        const xx = -52 + k * 1.1, sag = Math.sin(Math.PI * k / 8) * 0.8;
        flag(0.6, 0.45, [xx, 7 - sag, z], 0, 0.04);
      }
      this.geo.beam([-52.6, 0, z], [-52.6, 7.2, z], 0.1, C.metal); this.geo.beam([-42.6, 0, z], [-42.6, 7.2, z], 0.1, C.metal);
      this.col.addBox({ x: -52.6, z, w: 0.2, d: 0.2, h: 7.2, tag: 'pole' }); this.col.addBox({ x: -42.6, z, w: 0.2, d: 0.2, h: 7.2, tag: 'pole' });
    }
    {
      const c = document.createElement('canvas'); c.width = 512; c.height = 370;
      israelFlag(c.getContext('2d'), c.width, c.height);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
      const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3();
      for (const F of Object.values(flags)) {
        const g = new THREE.PlaneGeometry(F.w, F.h, 12, 1), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i) + F.w / 2; p.setZ(i, Math.sin(x * 2.2) * F.wave * (x / F.w)); }
        g.computeVertexNormals();
        const im = new THREE.InstancedMesh(g, mat, F.list.length);
        F.list.forEach(([pos, rotY], i) => im.setMatrixAt(i, M4.compose(v.set(...pos), q.setFromAxisAngle(up, rotY), one)));
        im.castShadow = true; im.computeBoundingSphere();
        this.scene.add(im);
      }
    }
    for (const [z, text] of [[200, 'חוף הים'], [270, 'שלום'], [340, 'ברוכים הבאים']]) {
      this._canvasPlane(2.4, 0.6, (c, w, h) => { c.fillStyle = '#0038b8'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffffff'; c.font = `bold ${h * 0.58}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2); }, [-85.8, PH + 2.6, z + 4], -Math.PI / 2);
      this.geo.beam([-85.8, PH, z + 4], [-85.8, PH + 2.3, z + 4], 0.07, C.metal);
    }
  }

  // ---------------------------------------------------------------- Southside Skatepark (south-east)
  // An original fenced concrete park: quarter-pipe lines, a spine, a pyramid with
  // hip corners and a top rail, a 3-step-3 with a kinked rail, a funbox with an
  // A-frame rail, manual pads, a flat bar, a euro gap, rollers, a big quarter
  // and a flow bowl.
  _skatepark() {
    const X0 = 35, X1 = 100, Z0 = 50, Z1 = 140;
    const N = Math.PI, S = 0, E = Math.PI / 2, Wd = -Math.PI / 2; // yaw that makes a ramp RISE toward -z, +z, +x, -x
    const sin = Math.sin, cos = Math.cos;

    // floor slab (cut around the flow bowl)
    let slab = [[X0, Z0, X1, Z1]];
    const hole = [74, 111, 94, 131];
    slab = slab.flatMap(([x0, z0, x1, z1]) => {
      if (hole[2] <= x0 || hole[0] >= x1 || hole[3] <= z0 || hole[1] >= z1) return [[x0, z0, x1, z1]];
      const out = [];
      if (hole[0] > x0) out.push([x0, z0, hole[0], z1]);
      if (hole[2] < x1) out.push([hole[2], z0, x1, z1]);
      if (hole[1] > z0) out.push([hole[0], z0, hole[2], hole[1]]);
      if (hole[3] < z1) out.push([hole[0], hole[3], hole[2], z1]);
      return out;
    });
    for (const [x0, z0, x1, z1] of slab) this.patch(x0, z0, x1, z1, C.concrete, 0.022);  // park slab, clear of the ground below

    // ---- helpers
    const bank = (x, z, w, len, h, yaw, tag = 'bank') =>
      this.wedge({ x, z, w, d: len, h0: 0, h1: h, yaw, tag }, C.ramp, C.rampSide);
    const corner = (x, z, L, h, toX, toZ, tag = 'hip') => {
      // pick the rotation whose high corner points toward (toX, toZ)
      const yaw = [0, Math.PI / 2, Math.PI, -Math.PI / 2].find((y) => Math.sign(cos(y) + sin(y)) === Math.sign(toX) && Math.sign(cos(y) - sin(y)) === Math.sign(toZ));
      this.col.addCorner({ x, z, w: L, d: L, h, yaw, tag });
      const c = cos(yaw), s2 = sin(yaw), hl = L / 2;
      const Wp = (lx, y, lz) => [x + lx * c + lz * s2, y, z - lx * s2 + lz * c];
      const P00 = Wp(-hl, 0, -hl), P10 = Wp(hl, 0, -hl), P01 = Wp(-hl, 0, hl), P11 = Wp(hl, h, hl), P11b = Wp(hl, 0, hl);
      this.geo.tri(P00, P10, P11, C.ramp, [0, 1, 0]);
      this.geo.tri(P00, P11, P01, C.ramp, [0, 1, 0]);
      this.geo.tri(P10, P11b, P11, C.rampSide, [Wp(1, 0, 0)[0] - x, 0, Wp(1, 0, 0)[2] - z]);
      this.geo.tri(P01, P11b, P11, C.rampSide, [Wp(0, 0, 1)[0] - x, 0, Wp(0, 0, 1)[2] - z]);
      this.geo.castShadow([P00, P10, P01, P11, P11b], 0);
    };
    // quarter pipe + deck + coping. maxDeg < ~69° = not "vert" (you fly over, e.g. a spine)
    const qp = (x, z, w, R, yaw, deck, maxDeg = 80, tag = 'park_quarter') => {
      const L = R * sin(maxDeg * Math.PI / 180);
      const lip = this.quarter({ x, z, w, d: L, R, yaw, tag }, C.ramp, C.rampSide);
      const dx = sin(yaw), dz = cos(yaw), px = cos(yaw), pz = -sin(yaw);
      if (deck > 0) this.box({ x: x + dx * (L / 2 + deck / 2), z: z + dz * (L / 2 + deck / 2), w, d: deck, yaw, h: lip, tag: tag + '_deck' }, C.concrete, C.concreteSide);
      const lx = x + dx * (L / 2 + 0.02), lz = z + dz * (L / 2 + 0.02);
      this.rail([lx - px * (w / 2 - 0.15), lip + 0.02, lz - pz * (w / 2 - 0.15)], [lx + px * (w / 2 - 0.15), lip + 0.02, lz + pz * (w / 2 - 0.15)], 'coping', C.coping, false);
      return lip;
    };
    // pyramid: flat deck + 4 banks + 4 hip corners
    const pyramid = (px, pz, sx, sz, h, L) => {
      this.box({ x: px, z: pz, w: sx, d: sz, h, tag: 'pyramid' }, C.concrete, C.concreteSide);
      bank(px, pz - sz / 2 - L / 2, sx, L, h, S, 'pyramid');
      bank(px, pz + sz / 2 + L / 2, sx, L, h, N, 'pyramid');
      bank(px - sx / 2 - L / 2, pz, sz, L, h, E, 'pyramid');
      bank(px + sx / 2 + L / 2, pz, sz, L, h, Wd, 'pyramid');
      for (const ix of [-1, 1]) for (const iz of [-1, 1]) {
        corner(px + ix * (sx / 2 + L / 2), pz + iz * (sz / 2 + L / 2), L, h, -ix, -iz);
      }
    };

    // ---- perimeter: low concrete wall with a fence on top, entrances west & north
    const wall = (x0, z0, x1, z1) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Math.max(0.4, x1 - x0), d = Math.max(0.4, z1 - z0);
      this.box({ x: cx, z: cz, w, d, h: 0.9, tag: 'wall' }, C.concrete, C.concreteSide);
      const len = Math.max(w, d), n = Math.ceil(len / 3);
      for (let i = 0; i <= n; i++) {
        const t = i / n, fx = x0 + (x1 - x0) * t, fz = z0 + (z1 - z0) * t;
        this.geo.beam([fx, 0.9, fz], [fx, 2.4, fz], 0.05, C.metal);
      }
      this.geo.beam([x0, 2.4, z0], [x1, 2.4, z1], 0.04, C.metal);
      this.geo.beam([x0, 1.65, z0], [x1, 1.65, z1], 0.025, C.metal);
    };
    wall(X0, Z0, 60, Z0 + 0.4); wall(74, Z0, X1, Z0 + 0.4);          // north (gap x 60..74)
    wall(X0, Z1 - 0.4, X1, Z1);                                        // south
    wall(X0, Z0, X0 + 0.4, 88); wall(X0, 102, X0 + 0.4, Z1);          // west (gap z 88..102)
    wall(X1 - 0.4, Z0, X1, Z1);                                        // east

    // ---- north: quarter-pipe line, spine, pyramid, flat bar
    qp(48, 53.78, 16, 2.6, N, 2);
    qp(87, 53.78, 18, 2.6, N, 2);
    const spineL = 2.2 * sin(65 * Math.PI / 180);
    this.quarter({ x: 50, z: 66 + spineL / 2, w: 10, d: spineL, R: 2.2, yaw: N, tag: 'spine' }, C.ramp, C.rampSide);
    const spineLip = this.quarter({ x: 50, z: 66 - spineL / 2, w: 10, d: spineL, R: 2.2, yaw: S, tag: 'spine' }, C.ramp, C.rampSide);
    this.rail([45.2, spineLip + 0.02, 66], [54.8, spineLip + 0.02, 66], 'coping', C.coping, false);
    pyramid(85, 68, 6, 4, 1.0, 3);
    this.rail([82.6, 1.36, 68], [87.4, 1.36, 68], 'parkrail');
    this.rail([62, 0.38, 60], [74, 0.38, 60], 'flatbar');

    // ---- middle: 3-step-3 with a kinked rail (stairs go down toward +x)
    const top = 1.02, tread = 0.38;
    this.box({ x: 40, z: 81, w: 6, d: 8, h: top, tag: 'kink_top' }, C.concrete, C.concreteSide);
    bank(40, 74.5, 6, 5, top, S, 'kink_bank');
    const stepsAt = [[43, 0.85], [43 + tread, 0.68]];
    for (const [x, h] of stepsAt) this.box({ x: x + tread / 2, z: 81, w: tread, d: 8, h, tag: 'kink_steps', noShadow: true }, 0xd6d0c4, C.concreteSide);
    this.box({ x: 43.76 + 1.25, z: 81, w: 2.5, d: 8, h: 0.51, tag: 'kink_landing' }, C.concrete, C.concreteSide);
    for (const [x, h] of [[46.26, 0.34], [46.26 + tread, 0.17]]) this.box({ x: x + tread / 2, z: 81, w: tread, d: 8, h, tag: 'kink_steps', noShadow: true }, 0xc9c2b4, C.concreteSide);
    const K = [[39.5, 1.62], [43, 1.62], [43.95, 1.11], [46.26, 1.11], [47.3, 0.62]];
    for (let i = 0; i < K.length - 1; i++) this.rail([K[i][0], K[i][1], 81], [K[i + 1][0], K[i + 1][1], 81], 'kinkrail');
    this.ledge({ x: 40.25, z: 84.4, w: 5.5, d: 0.6, h: top + 0.4, base: top, tag: 'ledge' });
    this.col.addZone({ x: 52, z: 81, w: 8, d: 8, tag: 'kink_land' });

    // manual pads, picnic table, benches
    this.ledge({ x: 58, z: 82, w: 2.5, d: 6, h: 0.25, tag: 'manualpad' }, C.pad, C.padSide, 'manualpad');
    this.ledge({ x: 60, z: 94, w: 6, d: 2, h: 0.22, tag: 'manualpad' }, C.pad, C.padSide, 'manualpad');
    this.ledge({ x: 66, z: 104, w: 2.4, d: 0.9, h: 0.75, tag: 'table' }, C.wood, C.woodSide, 'table');
    this.ledge({ x: 45, z: 100, w: 2.4, d: 0.6, h: 0.45, tag: 'bench' }, C.bench, C.metal, 'bench');
    this.ledge({ x: 95, z: 108, w: 0.6, d: 2.4, h: 0.45, tag: 'bench' }, C.bench, C.metal, 'bench');

    // funbox with an A-frame rail and grindable box edges
    this.box({ x: 78, z: 86, w: 4, d: 4, h: 0.8, tag: 'funbox2' }, C.concrete, C.concreteSide);
    bank(74.5, 86, 4, 3, 0.8, E, 'funbox2');
    bank(81.5, 86, 4, 3, 0.8, Wd, 'funbox2');
    this.col.addRail([76.05, 0.8, 84.05], [79.95, 0.8, 84.05], 'ledge');
    this.col.addRail([76.05, 0.8, 87.95], [79.95, 0.8, 87.95], 'ledge');
    const A = [[73.3, 0.47], [76, 1.25], [80, 1.25], [82.7, 0.47]];
    for (let i = 0; i < A.length - 1; i++) this.rail([A[i][0], A[i][1], 86], [A[i + 1][0], A[i + 1][1], 86], 'aframe');

    // euro gap: bank → gap → block against the east wall
    bank(89, 98, 6, 4, 1.1, E, 'euro_bank');
    this.box({ x: 96.05, z: 98, w: 7.1, d: 6, h: 1.1, tag: 'euro_land' }, C.concrete, C.concreteSide);
    this.patch(91, 95, 92.5, 101, 0xd9b45a, 0.04);

    // ---- south: rollers, long ledge, big quarter, flow bowl
    for (let i = 0; i < 4; i++) {
      const bx = 40 + i * 6.2;
      this.wedge({ x: bx + 0.8, z: 115, w: 6, d: 1.6, h0: 0, h1: 0.45, yaw: E, tag: 'roller' }, C.ramp, C.rampSide);
      this.wedge({ x: bx + 2.4, z: 115, w: 6, d: 1.6, h0: 0, h1: 0.45, yaw: Wd, tag: 'roller' }, C.ramp, C.rampSide);
    }
    this.ledge({ x: 68, z: 126, w: 0.6, d: 10, h: 0.5, tag: 'ledge' }, C.ledge, C.ledgeSide);
    qp(52, 136.7, 22, 3.2, S, 1.5);

    // floodlights in the corners
    for (const [x, z] of [[37, 52.5], [98, 52.5], [37, 138], [98, 138]]) {
      this.box({ x, z, w: 0.3, d: 0.3, h: 8, tag: 'lamp' }, C.metal, C.metal);
      this.geo.prism({ x, z, w: 1.4, d: 0.5 }, [8.4, 8.4, 8.4, 8.4], 7.9, 0xfff3b0, C.metal);
    }
    // a park sign by the west entrance
    this.box({ x: 33.6, z: 86.5, w: 0.15, d: 0.15, h: 2.6, tag: 'sign' }, C.metal, C.metal);
    this.geo.prism({ x: 33.6, z: 86.5, w: 0.1, d: 2.6 }, [3.2, 3.2, 3.2, 3.2], 2.4, 0x2a9d8f, 0x2a9d8f);
  }

  // ---------------------------------------------------------------- buildings, trees, lamps
  _decor() {
    const b = this.col.bounds;
    let k = 0;
    // buildings ring around the playable area
    const ring = [];
    for (let x = b.minX; x < b.maxX; x += 22) { ring.push([x + 11, b.minZ - 9]); ring.push([x + 11, b.maxZ + 9]); }
    for (let z = b.minZ; z < b.maxZ; z += 22) { ring.push([b.minX - 9, z + 11]); ring.push([b.maxX + 9, z + 11]); }
    for (const [x, z] of ring) {
      if (x < b.minX && z > 150) continue;            // the Tel Aviv beach: open sea to the west
      const h = 8 + 4 * ((k * 7919) % 5); // whole floors (texture = 4 m per floor)
      const col = BUILDING_COLORS[k % BUILDING_COLORS.length];
      this.geo.prism({ x, z, w: 18, d: 16, yaw: 0 }, [h, h, h, h], 0, col, col);
      this.geo.castShadow(GeoBuilder.prismPoints({ x, z, w: 18, d: 16 }, [h, h, h, h], 0), 0);
      this.geo.prism({ x, z, w: 18.3, d: 16.3 }, [h + 0.4, h + 0.4, h + 0.4, h + 0.4], h, 0x6c6f72, 0x6c6f72); // roof edge
      // REMASTER: real facade relief — a stone band at every floor, a deep cornice
      // and corner pilasters, so the blocks catch light and cast their own shadows
      const trim = [0xd8d0c0, 0xc9c1b0, 0xb9b3a7][k % 3];
      for (let y = 4; y < h - 0.5; y += 4) this.geo.prism({ x, z, w: 18.35, d: 16.35 }, [y + 0.22, y + 0.22, y + 0.22, y + 0.22], y, trim, trim);
      this.geo.prism({ x, z, w: 18.9, d: 16.9 }, [h - 0.05, h - 0.05, h - 0.05, h - 0.05], h - 0.55, trim, trim);   // cornice
      for (const [ox, oz] of [[-9, -8], [9, -8], [-9, 8], [9, 8]]) this.geo.prism({ x: x + ox, z: z + oz, w: 0.7, d: 0.7 }, [h - 0.5, h - 0.5, h - 0.5, h - 0.5], 3.4, trim, trim);
      // rooftop details: AC units, a water tank or a stair hut
      this.geo.prism({ x: x - 4, z: z + 3, w: 2.2, d: 1.6 }, [h + 1.4, h + 1.4, h + 1.4, h + 1.4], h, 0xb7b9ba, 0x8f9193);
      this.geo.prism({ x: x + 3, z: z - 4, w: 1.4, d: 1.4 }, [h + 1.1, h + 1.1, h + 1.1, h + 1.1], h, 0xb7b9ba, 0x8f9193);
      if (k % 3 === 0) {
        this.geo.addGeometry(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 12), new THREE.Matrix4().makeTranslation(x + 4, h + 3.2, z + 3), 0x8a6a4a);
        for (const [ox, oz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) this.geo.beam([x + 4 + ox, h, z + 3 + oz], [x + 4 + ox, h + 2.1, z + 3 + oz], 0.08, C.metal);
      } else this.geo.prism({ x: x + 5, z: z + 4, w: 3, d: 3 }, [h + 2.6, h + 2.6, h + 2.6, h + 2.6], h, col, col);
      // street level: shop windows and an awning
      this.geo.prism({ x, z, w: 18.15, d: 16.15 }, [3.2, 3.2, 3.2, 3.2], 0.4, 0x2f3b47, 0x2f3b47);
      this.geo.prism({ x, z, w: 18.9, d: 16.9 }, [3.6, 3.6, 3.4, 3.4], 3.3, [0x8e2c2c, 0x2c5f8e, 0x2c8e5a, 0x8e6d2c][k % 4], [0x8e2c2c, 0x2c5f8e, 0x2c8e5a, 0x8e6d2c][k % 4]);
      k++;
    }
    // trees (trunk is solid, crown is decoration)
    const trees = [[-30, 32], [30, -25], [-30, -25], [40, 40], [-40, 40], [45, -30], [-70, -20], [-70, 40],
      [-20, 60], [20, 60], [-20, 100], [20, 100], [90, -40], [105, 45], [30, 90], [-60, 90], [-25, -70], [10, -75], [50, -70]];
    for (const [x, z] of trees) {
      this.col.addBox({ x, z, w: 0.5, d: 0.5, h: 3, tag: 'tree' });
      this.foliage.addTree(x, z, 1.05);
      this.foliage.addLawn(x - 1.6, z - 1.6, x + 1.6, z + 1.6, 0);
    }
    // lamp posts
    for (const [x, z] of [[-30, 0], [30, 0], [-30, 30], [30, 30], [12, -30], [-50, -10], [63, -10], [63, 42]]) {
      this.box({ x, z, w: 0.2, d: 0.2, h: 4.5, tag: 'lamp' }, C.metal, C.metal);
      this.geo.prism({ x, z, w: 0.6, d: 0.6 }, [4.8, 4.8, 4.8, 4.8], 4.5, 0xfff3b0, 0xfff3b0);
    }
    this._props();
  }

  // ---------------------------------------------------------------- street furniture
  _props() {
    // trash cans (photo-scanned model), with trash bags piled next to some
    let k = 0;
    for (const [x, z] of [[-18, 30], [18, -28], [-33, 10], [33, 12], [5, 34], [-45, -5], [56, 20]]) {
      // the model is a pair of cans side by side (≈2 m along its local x)
      this.col.addBox({ x: x - 0.17, z, w: 2.0, d: 0.6, h: 0.95, tag: 'bin' });
      this.props.add('metal_trash_can', x, z, 0);
      if (k % 2 === 0) this.props.add('trashbag', x + 0.55, z + 0.35, k * 2.1, 0.9);
      k++;
    }
    // sidewalk utility boxes
    for (const [x, z, yaw] of [[-38, 35.2, 0], [36, 35.2, 0], [-8, 35.4, 0]]) {
      this.col.addBox({ x, z, w: 0.6, d: 0.5, h: 1.12, tag: 'utility' });
      this.props.add('utility_box_01', x, z, yaw);
    }
    // DIY corners: oil drums, crates and an old tyre
    const drum = (x, z) => { this.col.addBox({ x, z, w: 0.62, d: 0.62, h: 0.93, tag: 'drum' }); this.props.add('barrel_03', x, z, x * 3.1); };
    const crate = (x, z, yaw) => {
      const c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
      this.col.addBox({ x, z, w: 0.52 * c + 1.16 * sn, d: 0.52 * sn + 1.16 * c, h: 0.45, tag: 'crate' });
      this.props.add('wooden_crate_02', x, z, yaw);
    };
    drum(42, 30); drum(42.7, 30.7); drum(41.4, 31.1); crate(44.2, 29.6, 0.3); this.props.add('old_tyre', 43.6, 31.9, 1.2, 1, 0.3);
    drum(-40, -19); crate(-41.3, -20.4, 1.4); crate(-39.6, -21.2, 0.1); this.props.add('old_tyre', -38.8, -19.6, 0.4, 1, 0.3);
    this.props.add('trashbag', -40.8, -18.2, 0.7); this.props.add('trashbag', 40.6, 29.6, 2.0, 1.1);
    // planters with bushes (their edges are grindable)
    for (const [x, z] of [[-26, -18], [26, 17], [-12, 36], [40, -10]]) {
      this.ledge({ x, z, w: 1.6, d: 1.6, h: 0.5, tag: 'planter' }, C.concrete, C.concreteSide, 'planter');
      this.foliage.addBush(x, z, 0.75, 0.5); this.foliage.addBush(x + 0.3, z + 0.25, 0.5, 0.5);
    }
    // parked cars near the bottom of the hill
    const CAR_COLORS = [0xb23a48, 0x2d4059, 0xe0e0e0, 0x3a6351];
    [[16, 40, 0], [-16, 41, 0], [22, 47, 0.08], [-22, 38, -0.05]].forEach(([x, z, yaw], i) => {
      const col = CAR_COLORS[i % CAR_COLORS.length];
      const r = { x, z, w: 1.8, d: 4.2, yaw };
      this.col.addBox({ ...r, h: 1.0, tag: 'car' });
      this.geo.prism(r, [0.95, 0.95, 0.95, 0.95], 0.28, col, col);                           // body
      this.geo.prism({ x, z: z - 0.2, w: 1.6, d: 2.2, yaw }, [1.45, 1.45, 1.45, 1.45], 0.95, 0x27323d, col); // cabin (glass)
      this.geo.prism({ x, z: z - 0.2, w: 1.5, d: 1.9, yaw }, [1.48, 1.48, 1.48, 1.48], 1.45, col, col);    // roof
      for (const [wx, wz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const w = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10).rotateZ(Math.PI / 2);
        this.geo.addGeometry(w, new THREE.Matrix4().makeRotationY(yaw).setPosition(x + wx * c + wz * s, 0.32, z - wx * s + wz * c), 0x1b1b1b);
      }
      this.geo.castShadow(GeoBuilder.prismPoints(r, [1.45, 1.45, 1.45, 1.45], 0), 0);
    });
  }
}
