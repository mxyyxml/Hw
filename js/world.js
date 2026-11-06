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

// ---- colour palette ---------------------------------------------------------
const C = {
  ground:   0xa9a59c, plaza: 0xd9cdb8, plazaDark: 0xc4b59c, grass: 0x86b46b,
  concrete: 0xbdb7ab, concreteSide: 0x9c968b,
  ledge:    0xe07a5f, ledgeSide: 0xb85d45,
  pad:      0x81b29a, padSide: 0x5f8b75,
  ramp:     0x4ea1d3, rampSide: 0x2f6f99,
  wood:     0xd4a373, woodSide: 0xa47148,
  metal:    0x3d405b, rail: 0xf2c14e, coping: 0xd0d0d0,
  kicker:   0xf4a261, kickerSide: 0xc97c3f,
  mega:     0xe76f51, megaSide: 0xb04f36,
  street:   0x55575e, streetSide: 0x6d6f75, line: 0xf5f3ea,
  bowl:     0x8ecae6, bowlDeck: 0xcfc6b2,
  trunk:    0x7a5230, leaf: 0x4f8a3c, leaf2: 0x6aa84f,
  bench:    0x9b5de5,
};
const BUILDING_COLORS = [0xf6bd60, 0xf7ede2, 0xf5cac3, 0x84a59d, 0xf28482, 0xa2d2ff, 0xcdb4db, 0xffd6a5];

// =============================================================================
//  GeoBuilder — accumulates flat-shaded, vertex-coloured triangles
// =============================================================================
class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this._c = new THREE.Color(); }

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
    this._c.setHex(color);
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(this._c.r, this._c.g, this._c.b);
    }
  }
  quad(a, b, c, d, color, hint) { this.tri(a, b, c, color, hint); this.tri(a, c, d, color, hint); }

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
    this._c.setHex(color);
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.nor.push(n[i], n[i + 1], n[i + 2]);
      this.col.push(this._c.r, this._c.g, this._c.b);
    }
  }

  build(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return new THREE.Mesh(g, material);
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
    // Teleport spots. The first one is the default respawn point.
    this.spots = [
      { name: 'Plaza (spawn)',      x: 8,   y: 0,  z: 12,  heading: Math.PI },
      { name: 'Stair Plaza',        x: 26,  y: 1.7, z: -50, heading: 0 },
      { name: 'Mega-Ramp Roll-in',  x: -90, y: 14, z: -95.4, heading: 0 },
      { name: 'Downhill Street',    x: 0,   y: 10, z: 146, heading: Math.PI },
    ];
    this._build();
  }

  // ---- combined builders (collision + visuals) ----------------------------------
  box(o, top, side) {
    this.col.addBox(o);
    this.geo.prism(o, [o.h, o.h, o.h, o.h], o.base ?? -0.05, top, side);
  }
  wedge(o, top, side) { // h0 at local -Z edge, h1 at local +Z edge
    this.col.addWedge(o);
    this.geo.prism(o, [o.h0, o.h0, o.h1, o.h1], o.base ?? -0.05, top, side);
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
    for (let i = 0; i < N; i++) {
      const [z0, y0] = prof[i], [z1, y1] = prof[i + 1];
      // riding surface
      const nrm = dir(0, -1); nrm[1] = 1;
      this.geo.quad(W(-hx, y0, z0), W(hx, y0, z0), W(hx, y1, z1), W(-hx, y1, z1), top, [nrm[0] * 0.3, 1, nrm[2] * 0.3]);
      // side walls
      this.geo.quad(W(-hx, base, z0), W(-hx, base, z1), W(-hx, y1, z1), W(-hx, y0, z0), side, dir(-1, 0));
      this.geo.quad(W(hx, base, z0), W(hx, base, z1), W(hx, y1, z1), W(hx, y0, z0), side, dir(1, 0));
    }
    const lip = prof[N][1];
    this.geo.quad(W(-hx, base, hz), W(hx, base, hz), W(hx, lip, hz), W(-hx, lip, hz), side, dir(0, 1));
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
    const BOWL = { x: -50, z: 10, R: 8, D: 2.6 };
    const SQ = BOWL.R + 1.5; // square hole around the bowl
    const E = 80; // visual ground extends beyond bounds
    const gx0 = b.minX - E, gx1 = b.maxX + E, gz0 = b.minZ - E, gz1 = b.maxZ + E;
    const hx0 = BOWL.x - SQ, hx1 = BOWL.x + SQ, hz0 = BOWL.z - SQ, hz1 = BOWL.z + SQ;
    const up = [0, 1, 0];
    g.quad([gx0, 0, gz0], [hx0, 0, gz0], [hx0, 0, gz1], [gx0, 0, gz1], C.ground, up);
    g.quad([hx1, 0, gz0], [gx1, 0, gz0], [gx1, 0, gz1], [hx1, 0, gz1], C.ground, up);
    g.quad([hx0, 0, gz0], [hx1, 0, gz0], [hx1, 0, hz0], [hx0, 0, hz0], C.ground, up);
    g.quad([hx0, 0, hz1], [hx1, 0, hz1], [hx1, 0, gz1], [hx0, 0, gz1], C.ground, up);

    // grass outside the playable area & some lawns
    this.patch(gx0, gz0, b.minX - 2, gz1, C.grass, 0.01);
    this.patch(b.maxX + 2, gz0, gx1, gz1, C.grass, 0.01);
    this.patch(b.minX - 2, gz0, b.maxX + 2, b.minZ - 2, C.grass, 0.01);
    this.patch(b.minX - 2, b.maxZ + 2, b.maxX + 2, gz1, C.grass, 0.01);

    this._bowl(BOWL, SQ);
    this._plaza();
    this._stairs();
    this._eastRamps();
    this._megaRamp();
    this._street();
    this._decor();
    this.col.linkRails();

    // ---------------------------------------------------------------- mesh
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = g.build(mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.scene.add(this.mesh);
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
        const tm = (t0 + t1) / 2;
        const hint = [-Math.cos(tm), 0.6, -Math.sin(tm)];
        g.quad(P(a.r, a.y, t0), P(a.r, a.y, t1), P(c.r, c.y, t1), P(c.r, c.y, t0), k % 3 === 2 ? 0x7dbbd8 : C.bowl, hint);
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
    this.rail([-10, 0.5, 18], [10, 0.5, 18], 'longrail');

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
    this.patch(26, 21, 29.5, 27, 0xe9c46a, 0.016); // paint in the gap

    // benches (grindable)
    for (const [x, z, yaw] of [[-27, 8, 0], [27, -8, 0], [-10, -22, H], [10, 30, H]]) {
      this.ledge({ x, z, w: 0.6, d: 2.4, h: 0.45, yaw, tag: 'bench' }, C.bench, 0x7b3fc4, 'bench');
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
      this.box({ x: xc, z: z0 + stepD / 2, w: W, d: stepD, h: H - i * stepH, tag: tag + '_steps' },
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
      this.patch(cx - flat / 2, cz - width / 2, cx + flat / 2, cz + width / 2, 0x9fb7c9);
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

  // ---------------------------------------------------------------- buildings, trees, lamps
  _decor() {
    const b = this.col.bounds;
    let k = 0;
    // buildings ring around the playable area
    const ring = [];
    for (let x = b.minX; x < b.maxX; x += 22) { ring.push([x + 11, b.minZ - 9]); ring.push([x + 11, b.maxZ + 9]); }
    for (let z = b.minZ; z < b.maxZ; z += 22) { ring.push([b.minX - 9, z + 11]); ring.push([b.maxX + 9, z + 11]); }
    for (const [x, z] of ring) {
      const h = 8 + ((k * 7919) % 17);
      const col = BUILDING_COLORS[k % BUILDING_COLORS.length];
      this.geo.prism({ x, z, w: 18, d: 16, yaw: 0 }, [h, h, h, h], 0, col, col);
      // window strips
      for (let y = 2.5; y < h - 1; y += 3) {
        this.geo.prism({ x, z, w: 18.1, d: 16.1 }, [y + 0.9, y + 0.9, y + 0.9, y + 0.9], y, 0x3a506b, 0x3a506b);
      }
      this.geo.prism({ x, z, w: 18.3, d: 16.3 }, [h + 0.4, h + 0.4, h + 0.4, h + 0.4], h, 0x6c757d, 0x6c757d);
      k++;
    }
    // trees (trunk is solid, crown is decoration)
    const trees = [[-30, 32], [30, -25], [-30, -25], [40, 40], [-40, 40], [45, -30], [-70, -20], [-70, 40],
      [-20, 60], [20, 60], [-20, 100], [20, 100], [90, -40], [95, 60], [40, 90], [-60, 90], [-25, -70], [10, -75], [50, -70]];
    for (const [x, z] of trees) {
      this.box({ x, z, w: 0.5, d: 0.5, h: 3, tag: 'tree' }, C.trunk, C.trunk);
      const crown = new THREE.ConeGeometry(1.8, 3.6, 7);
      this.geo.addGeometry(crown, new THREE.Matrix4().makeTranslation(x, 4.4, z), (x + z) % 2 ? C.leaf : C.leaf2);
    }
    // lamp posts
    for (const [x, z] of [[-30, 0], [30, 0], [-30, 30], [30, 30], [12, -30], [-50, -10], [63, -10], [63, 42]]) {
      this.box({ x, z, w: 0.2, d: 0.2, h: 4.5, tag: 'lamp' }, C.metal, C.metal);
      this.geo.prism({ x, z, w: 0.6, d: 0.6 }, [4.8, 4.8, 4.8, 4.8], 4.5, 0xfff3b0, 0xfff3b0);
    }
  }
}
