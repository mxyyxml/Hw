// =============================================================================
//  map.js — JEW BOARD CITY: the whole skate map, built from scratch.
//
//  World bounds x -150..150, z -150..170. North is -z.
//
//    NW  Beit Sefer schoolyard (10-stair)      N   Hill street (downhill)
//    NE  Mega ramp (14 m roll-in, designed gap)
//    C   Kikar Plaza (spawn): fountain ledges, stair terrace, gap, long rail
//    E   Park HaYarkon skatepark: halfpipe, mini, spine, pyramid, bowl
//    SE  Industrial yard (container gap, docks) + 2-level parking garage
//    SW  Secret backyard pool         S   Tayelet beachfront promenade & sea
//
//  Only the low-level builders (box / wedge / quarter / rail / ledge / bowl /
//  jump designer) come from world.js; every placement here is new.
// =============================================================================
import * as THREE from 'three';
import { C } from './world.js';

const H = Math.PI / 2;
const SIN85 = Math.sin(85 * Math.PI / 180);

export const MAP_BOUNDS = { minX: -150, maxX: 150, minZ: -150, maxZ: 170 };
export const MAP_BOWLS = [
  { x: 122, z: 18, R: 9, D: 3 },            // Park HaYarkon bowl
  { x: -28, z: 74, R: 6, D: 2.4, tag: 'pool' },   // secret backyard pool
];
export const MAP_SPOTS = [
  { name: 'Kikar Plaza (spawn)',        x: 0,    y: 0,    z: 2,    heading: Math.PI },
  { name: 'Stair Terrace',              x: -6,   y: 0.85, z: -26,  heading: 0 },
  { name: 'Mega Ramp (14 m)',           x: 112,  y: 14,   z: -146, heading: 0 },
  { name: 'Hill Street',                x: -55,  y: 8,    z: -134, heading: 0 },
  { name: 'Park HaYarkon',              x: 92,   y: 0,    z: -4,   heading: Math.PI },
  { name: 'Beit Sefer 10-Stair',        x: -105, y: 1.7,  z: -106, heading: 0 },
  { name: 'Parking Garage Roof',        x: 124,  y: 7,    z: 120,  heading: -H },
  { name: 'Container Gap',              x: 140,  y: 7,    z: 4,    heading: 0 },
  { name: 'Tayelet Beach Promenade',    x: -120, y: 1.2,  z: 134,  heading: H },
  { name: 'Secret Backyard Pool',       x: -10,  y: 0,    z: 84,   heading: -H },
];

// stair set descending toward +z from a platform at z < zTop (handrails, hubbas, bank behind)
function stairs(W, { xc, zTop, W: width, n, tag, rails }) {
  const stepH = 0.17, stepD = 0.38, Ht = n * stepH, PW = width + 6, PD = 12;
  W.box({ x: xc, z: zTop - PD / 2, w: PW, d: PD, h: Ht, tag: tag + '_top' }, C.concrete, C.concreteSide);
  for (let i = 1; i < n; i++) {
    const z0 = zTop + (i - 1) * stepD;
    W.box({ x: xc, z: z0 + stepD / 2, w: width, d: stepD, h: Ht - i * stepH, tag: tag + '_steps', noShadow: true }, i % 2 ? 0xd6d0c4 : 0xc9c2b4, C.concreteSide);
  }
  const sideW = (PW - width) / 2, run = (n - 1) * stepD;
  for (const sgn of [-1, 1]) {
    W.wedge({ x: xc + sgn * (width / 2 + sideW / 2), z: zTop + run / 2, w: sideW, d: run, h0: Ht, h1: stepH, tag: tag + '_hubba' }, C.concrete, C.concreteSide);
    const ex = xc + sgn * (width / 2 + 0.06);
    W.col.addRail([ex, Ht, zTop + 0.05], [ex, stepH, zTop + run - 0.05], 'hubba');
  }
  W.wedge({ x: xc, z: zTop - PD - 3.5, w: PW, d: 7, h0: 0, h1: Ht, tag: tag + '_bank' }, C.ramp, C.rampSide);
  const slope = stepH / stepD, z0 = zTop - 0.3, z1 = zTop + run + 0.35;
  for (const sgn of rails) {
    const rx = xc + sgn * (width / 2 - 0.6), y = (z) => Ht + 0.6 - Math.max(0, z - zTop) * slope;
    W.rail([rx, Ht + 0.6, z0 - 0.8], [rx, y(zTop), zTop], 'handrail_flat');
    W.rail([rx, y(zTop), zTop], [rx, y(z1), z1], 'handrail');
  }
  W.col.addZone({ x: xc, z: zTop + run + stepD + 4, w: PW, d: 8, tag: tag + '_land' });
  W.patch(xc - PW / 2, zTop + run + 0.1, xc + PW / 2, zTop + run + 8, 0xcfc3ad, 0.016);
}

// a parked car (collision + simple body, cabin, glass and wheels)
// A modelled hatchback / sedan: a bevelled body extruded from a real side profile,
// a glass cabin with body-coloured roof and pillars, wheel arches, five-spoke rims,
// head- and tail-lights, mirrors and number plates.
let _carGeo = null;
function carParts() {
  if (_carGeo) return _carGeo;
  const ext = (pts, depth, bevel) => {
    const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 }).translate(0, 0, -depth / 2);
  };
  // side profile, x = along the car (front at +x), y = up
  const body = ext([[-2.1, 0.32], [2.05, 0.32], [2.15, 0.48], [2.12, 0.72], [1.95, 0.82], [1.0, 0.9], [-1.3, 0.92], [-2.05, 0.9], [-2.15, 0.7], [-2.15, 0.45]], 1.62, 0.09);
  const cabin = ext([[-1.65, 0.92], [0.95, 0.92], [0.25, 1.38], [-1.25, 1.4], [-1.75, 1.0]], 1.46, 0.05);
  const roof = ext([[-1.2, 1.36], [0.22, 1.36], [0.2, 1.42], [-1.18, 1.44]], 1.42, 0.03);
  const pillars = [ext([[-0.43, 0.92], [-0.33, 0.92], [-0.33, 1.38], [-0.43, 1.38]], 1.5, 0.01)];
  // wheel: tyre + rim with five spokes, built pointing along z (the car's width axis)
  const tyre = new THREE.TorusGeometry(0.25, 0.085, 8, 20);
  const rim = [new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16).rotateX(Math.PI / 2)];
  for (let k = 0; k < 5; k++) rim.push(new THREE.BoxGeometry(0.035, 0.17, 0.03).translate(0, 0.085, 0.04).rotateZ(k * Math.PI * 2 / 5));
  const arch = new THREE.CylinderGeometry(0.4, 0.4, 1.66, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
  _carGeo = { body, cabin, roof, pillars, tyre, rim, arch };
  return _carGeo;
}
function car(W, x, z, yaw, color) {
  const P = carParts(), G = W.geo;
  W.col.addBox({ x, z, w: 1.8, d: 4.3, h: 1.45, yaw, tag: 'car' });
  // the profile runs along local x; turn it so the car's length lies along the yaw direction
  const M = (lx, ly, lz) => new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeRotationY(yaw - Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz));
  const add = (g, m, c) => G.addGeometry(g.clone(), m, c);
  add(P.body, M(0, 0, 0), color);
  add(P.cabin, M(0, 0, 0), 0x1e2730);
  add(P.roof, M(0, 0, 0), color);
  for (const g of P.pillars) add(g, M(0, 0, 0), color);
  for (const ax of [-1.3, 1.35]) {
    add(P.arch, M(ax, 0.33, 0), 0x15181b);
    for (const side of [-1, 1]) {
      add(P.tyre, M(ax, 0.33, side * 0.8), 0x1b1b1b);
      for (const g of P.rim) add(g, M(ax, 0.33, side * 0.84).multiply(new THREE.Matrix4().makeRotationY(side < 0 ? Math.PI : 0)), 0xb9bec4);
    }
  }
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.1, 0.32), M(2.17, 0.68, side * 0.56), 0xfff6d8);      // headlights
    add(new THREE.BoxGeometry(0.06, 0.12, 0.3), M(-2.18, 0.72, side * 0.6), 0xb3202a);      // tail-lights
    add(new THREE.BoxGeometry(0.16, 0.09, 0.06), M(0.75, 1.0, side * 0.92), color);         // mirrors
  }
  add(new THREE.BoxGeometry(0.03, 0.12, 0.5), M(2.22, 0.42, 0), 0xf2f2f2);                // plates
  add(new THREE.BoxGeometry(0.03, 0.12, 0.5), M(-2.24, 0.5, 0), 0xf2d34a);               // (Israeli rear plates are yellow)
  G.castShadow([[x - 1, 0, z - 2.2], [x + 1, 0, z - 2.2], [x - 1, 0, z + 2.2], [x + 1, 0, z + 2.2], [x, 1.4, z]], 0);
}

// A Tel Aviv "White City" apartment block, all real geometry: white / cream stucco,
// a glazed shopfront with an awning, dark window bands on every floor, Bauhaus
// ribbon balconies with solid parapets (style 0), or plain fronts with AC units
// and roller shutters (style 1); on the roof a parapet, solar water heaters
// (dud shemesh: tilted panel + white tank), a water tank and an aerial.
const ACCENT = [0xf3efe6, 0xe9d8c4, 0xd9e2e3, 0xf0e1cf, 0xe3e7dc];
function block(W, x, z, w, d, h, col, k) {
  const STUCCO = [C.stucco, C.stuccoShade];
  const G = W.geo, wall = STUCCO[k % 2], acc = ACCENT[k % ACCENT.length], style = k % 3 === 2 ? 1 : 0;
  const GLASS = 0x2b3743, FRAME = 0x9aa1a6, rect = (cx, cz, sx, sz, y0, y1, top, side) => G.prism({ x: cx, z: cz, w: sx, d: sz }, [y1, y1, y1, y1], y0, top, side ?? top);
  W.box({ x, z, w, d, h, tag: 'building' }, wall, wall);
  // ground floor: shop glass all round + plinth band + awnings on the long sides
  rect(x, z, w + 0.12, d + 0.12, 0.45, 3.1, GLASS);
  rect(x, z, w + 0.3, d + 0.3, 3.1, 3.6, acc);
  const aw = [0x8e2c2c, 0x2c5f8e, 0x2c8e5a, 0x8e6d2c][k % 4];
  // the four facades: n = outward normal, L = facade length
  const sides = [[0, -1, w, d], [0, 1, w, d], [-1, 0, d, w], [1, 0, d, w]];
  for (const [nx, nz, L, D] of sides) {
    const fx = x + nx * D / 2, fz = z + nz * D / 2, along = nx === 0;
    const R = (off, len, dep, y0, y1, c, side) => rect(fx + nx * off, fz + nz * off, along ? len : dep, along ? dep : len, y0, y1, c, side);
    if (L > 10) G.prism({ x: fx + nx * 0.7, z: fz + nz * 0.7, w: along ? L * 0.8 : 1.4, d: along ? 1.4 : L * 0.8 }, along ? (nz < 0 ? [3.65, 3.65, 3.3, 3.3] : [3.3, 3.3, 3.65, 3.65]) : (nx < 0 ? [3.65, 3.3, 3.3, 3.65] : [3.3, 3.65, 3.65, 3.3]), 3.25, aw, aw);
    for (let fy = 3.6; fy + 3 <= h - 0.3; fy += 3.2) {
      const long = L > 12;
      // window band (glass + a light frame line above and below)
      R(0.04, L * 0.82, 0.08, fy + 0.9, fy + 2.5, GLASS);
      R(0.06, L * 0.84, 0.1, fy + 0.82, fy + 0.92, FRAME);
      if (style === 0 && long) {
        // Bauhaus ribbon balcony: slab + solid parapet (the white horizontal stripes)
        R(0.6, L * 0.7, 1.2, fy - 0.08, fy + 0.08, acc);
        R(1.15, L * 0.7, 0.12, fy + 0.08, fy + 1.05, acc);
      } else {
        // AC units under some windows, roller-shutter boxes over the glass
        for (let i = 0; i < Math.floor(L / 6); i++) {
          const t = (i + 0.5) / Math.floor(L / 6) - 0.5;
          if ((i + k + Math.round(fy)) % 3 === 0) rect(fx + nx * 0.35 + (along ? t * L * 0.8 : 0), fz + nz * 0.35 + (along ? 0 : t * L * 0.8), along ? 0.9 : 0.6, along ? 0.6 : 0.9, fy + 0.15, fy + 0.75, 0xd6d8d8, 0xb9bcbd);
        }
        R(0.12, L * 0.82, 0.22, fy + 2.5, fy + 2.75, acc);
      }
    }
  }
  // roof: parapet ring, solar water heaters, water tank, aerial
  const P = 0.25;
  rect(x, z - d / 2 + P / 2, w, P, h, h + 0.9, acc); rect(x, z + d / 2 - P / 2, w, P, h, h + 0.9, acc);
  rect(x - w / 2 + P / 2, z, P, d, h, h + 0.9, acc); rect(x + w / 2 - P / 2, z, P, d, h, h + 0.9, acc);
  const n = 2 + (k % 3);
  for (let i = 0; i < n; i++) {
    const sx = x - w / 2 + 2 + (i + 0.5) * (w - 4) / n, sz = z - d * 0.15;
    G.prism({ x: sx, z: sz, w: 1.2, d: 1.8 }, [h + 1.2, h + 1.2, h + 0.35, h + 0.35], h, 0x1f2e4a, FRAME);          // tilted collector
    G.addGeometry(new THREE.CylinderGeometry(0.32, 0.32, 1.4, 10).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(sx, h + 1.55, sz - 1.05), 0xf2f2f0);   // hot-water tank
    G.beam([sx - 0.5, h, sz - 1.05], [sx - 0.5, h + 1.3, sz - 1.05], 0.06, FRAME); G.beam([sx + 0.5, h, sz - 1.05], [sx + 0.5, h + 1.3, sz - 1.05], 0.06, FRAME);
  }
  if (k % 2 === 0) {
    G.addGeometry(new THREE.CylinderGeometry(1.1, 1.1, 1.8, 12), new THREE.Matrix4().makeTranslation(x + w * 0.3, h + 0.9, z + d * 0.25), 0xa9adb0);
    G.beam([x - w * 0.3, h, z + d * 0.3], [x - w * 0.3, h + 4, z + d * 0.3], 0.05, FRAME);
    G.beam([x - w * 0.3 - 0.8, h + 3.4, z + d * 0.3], [x - w * 0.3 + 0.8, h + 3.4, z + d * 0.3], 0.04, FRAME);
  }
}

// street lamp: tapered round pole, base plinth, curved arm and a lantern head
function lamp(W, x, z, y = 0) {
  const G = W.geo;
  W.col.addBox({ x, z, w: 0.22, d: 0.22, h: y + 5, tag: 'lamp' });
  G.addGeometry(new THREE.CylinderGeometry(0.16, 0.18, 0.6, 12), new THREE.Matrix4().makeTranslation(x, y + 0.3, z), C.metal);
  G.addGeometry(new THREE.CylinderGeometry(0.055, 0.09, 4.7, 10), new THREE.Matrix4().makeTranslation(x, y + 2.95, z), C.metal);
  const arc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 5.2, 0), new THREE.Vector3(0, 5.75, 0), new THREE.Vector3(0.9, 5.6, 0));
  G.addGeometry(new THREE.TubeGeometry(arc, 10, 0.045, 8), new THREE.Matrix4().makeTranslation(x, y, z), C.metal);
  G.addGeometry(new THREE.CylinderGeometry(0.12, 0.26, 0.22, 12), new THREE.Matrix4().makeTranslation(x + 0.95, y + 5.5, z), C.metal);
  G.addGeometry(new THREE.CylinderGeometry(0.22, 0.2, 0.06, 12), new THREE.Matrix4().makeTranslation(x + 0.95, y + 5.37, z), 0xfff3b0);
}

export function buildMap(W) {
  const G = W.geo, F = W.foliage, P = W.props, col = W.col;

  // ============================================================ ROADS (visual) & lawns
  const road = (x0, z0, x1, z1, alongX) => {
    W.patch(x0, z0, x1, z1, C.street, 0.012);
    if (alongX) { const zc = (z0 + z1) / 2; for (let x = x0 + 2; x < x1 - 3; x += 6) W.patch(x, zc - 0.1, x + 3, zc + 0.1, C.line, 0.016); }
    else { const xc = (x0 + x1) / 2; for (let z = z0 + 2; z < z1 - 3; z += 6) W.patch(xc - 0.1, z, xc + 0.1, z + 3, C.line, 0.016); }
  };
  road(-150, 46, 150, 56, true);           // Sderot avenue (east–west)
  road(42, -150, 50, 112, false);           // north–south avenue east of the plaza
  road(-150, -44, 40, -36, true);           // northern street
  // zebra crossings where the avenues meet, either side of the junction
  const zebra = (x0, z0, x1, z1, alongX) => {
    if (alongX) for (let x = x0; x < x1; x += 0.9) W.patch(x, z0, x + 0.5, z1, 0xf2f2ee, 0.017);
    else for (let z = z0; z < z1; z += 0.9) W.patch(x0, z, x1, z + 0.5, 0xf2f2ee, 0.017);
  };
  zebra(42, 40, 50, 44, true); zebra(42, 58, 50, 62, true); zebra(36, 46, 40, 56, false); zebra(52, 46, 56, 56, false);
  zebra(30, -44, 34, -36, false); zebra(-12, -44, -8, -36, false);
  // bike-share docks (green bikes) and bus shelters along the avenue sidewalk
  const bikes = (bx, bz) => {
    G.prism({ x: bx, z: bz, w: 6, d: 0.3 }, [0.12, 0.12, 0.12, 0.12], 0, 0x7a7f84, 0x7a7f84);
    for (let i = 0; i < 5; i++) {
      const x = bx - 2.4 + i * 1.2;
      G.beam([x, 0, bz], [x, 0.9, bz], 0.08, 0x5e9e3a);
      for (const dz of [-0.75, 0.75]) G.addGeometry(new THREE.TorusGeometry(0.33, 0.035, 6, 16).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, 0.36, bz + dz), 0x1d1d1d);
      G.beam([x, 0.45, bz - 0.75], [x, 0.85, bz + 0.6], 0.05, 0x5e9e3a);
    }
  };
  const shelter = (sx, sz) => {
    col.addBox({ x: sx, z: sz, w: 4, d: 0.2, h: 2.6, tag: 'shelter' });
    G.prism({ x: sx, z: sz, w: 4, d: 0.08 }, [2.5, 2.5, 2.5, 2.5], 0.1, 0xa9c4d4, 0xa9c4d4);
    G.prism({ x: sx, z: sz + 0.6, w: 4.4, d: 1.6 }, [2.75, 2.75, 2.75, 2.75], 2.6, 0x2c5f8e, 0x2c5f8e);
    for (const ox of [-2, 2]) G.beam([sx + ox, 0, sz], [sx + ox, 2.6, sz], 0.1, C.metal);
  };
  for (const bx of [-120, -70, 70, 120]) bikes(bx, 44.2);
  for (const sx of [-95, 95]) shelter(sx, 43.6);
  const lawn = (x0, z0, x1, z1, trees = 0, seed = 1) => {
    W.patch(x0, z0, x1, z1, C.grass, 0.013); F.addLawn(x0, z0, x1, z1, 0.013); col.addLawn(x0, z0, x1, z1);
    let s = seed * 7919;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let i = 0; i < trees; i++) {
      const x = x0 + 2 + r() * (x1 - x0 - 4), z = z0 + 2 + r() * (z1 - z0 - 4);
      if (r() < 0.75) { col.addBox({ x, z, w: 0.45, d: 0.45, h: 3, tag: 'tree' }); F.addTree(x, z, 0.85 + r() * 0.45); }
      else F.addBush(x, z, 0.8 + r() * 0.5);
    }
  };
  lawn(-40, 58, -10, 66, 6, 2);
  lawn(10, 58, 40, 104, 14, 3);
  lawn(-148, -30, -70, 40, 26, 4);
  lawn(55, 58, 66, 108, 6, 5);
  lawn(-60, -30, -44, 40, 8, 6);
  lawn(-40, -100, 2, -70, 16, 7);           // Gan Meir park, north of the plaza
  lawn(60, -146, 98, -72, 26, 8);           // park beside the mega ramp
  for (const [x, z, yaw] of [[-19, -68, H], [-30, -102, H], [79, -70, H], [79, -148, H]]) W.ledge({ x, z, w: 0.6, d: 2.4, h: 0.45, yaw, tag: 'bench' }, C.bench, C.metal, 'bench');
  // parked cars along the avenue
  const CARS = [0xb23a48, 0x2d4059, 0xe0e0e0, 0x3a6351, 0x8d6e63, 0x1d1d1d];
  let ci = 0;
  for (let x = -140; x < 140; x += 11) {
    if (Math.abs(x) < 14 || (x > 36 && x < 58)) continue;
    car(W, x, 57.3, H, CARS[ci++ % CARS.length]);
  }

  // ============================================================ KIKAR PLAZA (centre, spawn)
  W.patch(-40, -20, 40, 44, C.plaza);
  for (let x = -40; x < 40; x += 8) for (let z = -20; z < 44; z += 8) if (((x + z) / 8) % 2 === 0) W.patch(x, z, x + 8, Math.min(z + 8, 44), C.plazaDark, 0.014);
  // fountain-planter ringed by 8 grindable granite ledges
  {
    const cx = 0, cz = 14, R = 4.6;
    W.box({ x: cx, z: cz, w: 6, d: 6, h: 0.5, tag: 'planter' }, 0x5d7a3f, C.concreteSide);
    col.addBox({ x: cx, z: cz, w: 0.6, d: 0.6, h: 3, tag: 'tree' }); F.addTree(cx, cz, 1.15, 0.5);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      W.ledge({ x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R, w: 3.5, d: 0.6, h: 0.5, yaw: -a - H, tag: 'fountain' }, C.ledge, C.ledgeSide, 'fountain');
    }
  }
  // Star of David inlaid in the paving
  G.addGeometry(W._starOfDavid(2.4, 0.22, 0.02).rotateX(-H), new THREE.Matrix4().makeTranslation(0, 0.02, 30), 0x0038b8);
  // stair terrace along the north edge: 3-stair and 5-stair with handrails
  stairs(W, { xc: -26, zTop: -20, W: 5, n: 3, tag: 'stair3', rails: [-1] });
  stairs(W, { xc: -6, zTop: -20, W: 6, n: 5, tag: 'stair5', rails: [-1, 1] });
  W.ledge({ x: 13, z: -26, w: 12, d: 0.7, h: 0.9, tag: 'ledge' }, C.ledge, C.ledgeSide);   // terrace ledge
  // the long rail and granite ledges
  W.rail([-16, 0.5, 38], [16, 0.5, 38], 'longrail');
  W.ledge({ x: -22, z: 10, w: 0.7, d: 9, h: 0.45 });
  W.ledge({ x: 22, z: 10, w: 0.7, d: 9, h: 0.45 });
  W.ledge({ x: -30, z: 26, w: 0.8, d: 6, h: 0.55, yaw: 0.45 }, C.concrete, C.concreteSide);
  W.ledge({ x: 0, z: -6, w: 3, d: 7, h: 0.22, tag: 'manualpad' }, C.pad, C.padSide, 'manualpad');
  W.ledge({ x: 30, z: -10, w: 6, d: 2.5, h: 0.2, tag: 'manualpad' }, C.pad, C.padSide, 'manualpad');
  W.wedge({ x: -12, z: 26, w: 2, d: 1.8, h0: 0, h1: 0.55, yaw: Math.PI, tag: 'kicker' }, C.kicker, C.kickerSide);
  // plaza gap: bank → block A … gap … block B → bank
  W.wedge({ x: 18, z: 26, w: 4, d: 6, h0: 0, h1: 0.9, yaw: H, tag: 'gapA' }, C.ramp, C.rampSide);
  W.box({ x: 22, z: 26, w: 4, d: 6, h: 0.9, tag: 'gapA' }, C.concrete, C.concreteSide);
  W.box({ x: 29.5, z: 26, w: 4, d: 6, h: 0.9, tag: 'gapB' }, C.concrete, C.concreteSide);
  W.wedge({ x: 33.5, z: 26, w: 4, d: 6, h0: 0.9, h1: 0, yaw: H, tag: 'gapB' }, C.ramp, C.rampSide);
  col.addZone({ x: 31.5, z: 26, w: 8, d: 6, tag: 'gapB' });
  W.patch(24, 23, 27.5, 29, 0xd9b45a, 0.016);
  for (const [x, z, yaw] of [[-36, 0, 0], [36, 0, 0], [-14, 42, H], [14, -14, H]]) W.ledge({ x, z, w: 0.6, d: 2.4, h: 0.45, yaw, tag: 'bench' }, C.bench, C.metal, 'bench');
  for (const [x, z] of [[-38, -18], [38, -18], [-38, 42], [38, 42], [-20, 44], [20, 44]]) lamp(W, x, z);
  for (const [x, z] of [[-34, 34], [34, 36], [-2, -14]]) { col.addBox({ x: x - 0.17, z, w: 2.0, d: 0.6, h: 0.95, tag: 'bin' }); P.add('metal_trash_can', x, z, 0); }

  // ============================================================ PARK HAYARKON (east skatepark)
  W.patch(56, -62, 146, 40, 0xd6d0c4, 0.012);
  W._fence(56, -62, 104, -62); W._fence(120, -62, 146, -62); W._fence(146, -62, 146, 40);   // gap: the mega-ramp run-out
  {
    // halfpipe along z
    const R = 3.3, L = R * SIN85, cx = 102, cz = -40, flat = 6, width = 12, deck = 3;
    const lip = W.quarter({ x: cx - flat / 2 - L / 2, z: cz, w: width, d: L, R, yaw: -H, tag: 'halfpipe' }, C.ramp, C.rampSide);
    W.quarter({ x: cx + flat / 2 + L / 2, z: cz, w: width, d: L, R, yaw: H, tag: 'halfpipe' }, C.ramp, C.rampSide);
    for (const sgn of [-1, 1]) {
      W.box({ x: cx + sgn * (flat / 2 + L + deck / 2), z: cz, w: deck, d: width, h: lip, tag: 'halfpipe_deck' }, C.wood, C.woodSide);
      const x = cx + sgn * (flat / 2 + L + 0.02);
      W.rail([x, lip + 0.02, cz - width / 2 + 0.2], [x, lip + 0.02, cz + width / 2 - 0.2], 'coping', C.coping, false);
    }
    W.patch(cx - flat / 2, cz - width / 2, cx + flat / 2, cz + width / 2, 0x8d9aa3);
  }
  {
    // mini ramp
    const R = 2.1, L = R * SIN85, cx = 74, cz = -40, flat = 4, width = 8;
    const lip = W.quarter({ x: cx - flat / 2 - L / 2, z: cz, w: width, d: L, R, yaw: -H, tag: 'miniramp' }, C.wood, C.woodSide);
    W.quarter({ x: cx + flat / 2 + L / 2, z: cz, w: width, d: L, R, yaw: H, tag: 'miniramp' }, C.wood, C.woodSide);
    for (const sgn of [-1, 1]) {
      W.box({ x: cx + sgn * (flat / 2 + L + 1.25), z: cz, w: 2.5, d: width, h: lip, tag: 'miniramp_deck' }, C.wood, C.woodSide);
      const x = cx + sgn * (flat / 2 + L + 0.02);
      W.rail([x, lip + 0.02, cz - width / 2 + 0.2], [x, lip + 0.02, cz + width / 2 - 0.2], 'coping', C.coping, false);
    }
  }
  // spine: two quarters back to back
  {
    const R = 2.6, L = R * Math.sin(80 * Math.PI / 180), x0 = 92, z0 = -14;
    W._qp(x0 - L / 2, z0, 10, R, H, 0, 80, 'spine');
    W._qp(x0 + L / 2, z0, 10, R, -H, 0, 80, 'spine');
  }
  W._pyramid(76, 8, 6, 6, 1.2, 3, 'pyramid');
  W.rail([76, 1.6, 4.2], [76, 1.6, 11.8], 'pyramid_rail');
  W._qp(141, -30, 10, 3, H, 2.5, 80, 'park_quarter');
  W._qp(141, -6, 10, 3, H, 2.5, 80, 'park_quarter');
  W.rail([62, 0.35, 22], [74, 0.35, 22], 'flatbar');
  W.ledge({ x: 96, z: 30, w: 10, d: 0.7, h: 0.6, tag: 'hubba' }, C.ledge, C.ledgeSide);
  W.wedge({ x: 66, z: 0, w: 2.2, d: 2, h0: 0, h1: 0.6, yaw: Math.PI, tag: 'kicker' }, C.kicker, C.kickerSide);
  for (const [x, z] of [[58, -60], [144, -60], [58, 38], [144, 38]]) W._floodlight(x, z, 10);

  // ============================================================ MEGA RAMP (north-east)
  {
    const x = 112, w = 8;
    W.box({ x, z: -147, w, d: 6, h: 14, tag: 'mega_top' }, C.wood, C.woodSide);
    W.wedge({ x, z: -128, w, d: 32, h0: 14, h1: 0, tag: 'mega_rollin' }, C.mega, C.megaSide);
    for (let z = -142; z <= -116; z += 4) {
      const hh = 14 * (1 - (z + 144) / 32);
      for (const sx of [-w / 2 + 0.2, w / 2 - 0.2]) G.beam([x + sx, 0, z], [x + sx, hh, z], 0.18, C.metal);
    }
    G.beam([x - w / 2, 15, -150], [x + w / 2, 15, -150], 0.08, C.metal);
    const v = 0.97 * Math.sqrt(2 * 13 * 14);        // measured: the smooth roll-in keeps ~97% of the drop
    const j = W._designJump({ x, w, z0: -108, h: 2.6, d: 5.5, v, name: 'mega', label: 'Mega Gap', points: 1500 });
    const R = 4.2, L = R * SIN85;
    const lip = W.quarter({ x, z: j.end + 8 + L / 2, w: w + 2, d: L, R, tag: 'mega_quarter' }, C.mega, C.megaSide);
    W.box({ x, z: j.end + 8 + L + 1.5, w: w + 2, d: 3, h: lip, tag: 'mega_deck' }, C.wood, C.woodSide);
    W.patch(x - 5, -112, x + 5, j.end + 8, 0xe0d2c0);
  }

  // ============================================================ HILL STREET (north)
  {
    const x = -55, z0 = -130, z1 = -46, top = 8, w = 12, slope = top / (z1 - z0);
    const sh = (z) => top - (z - z0) * slope;               // downhill toward +z
    W.box({ x, z: -138, w, d: 16, h: top, tag: 'street_top' }, C.concrete, C.concreteSide);
    W.wedge({ x, z: (z0 + z1) / 2, w, d: z1 - z0, h0: top, h1: 0, tag: 'street' }, C.street, C.streetSide);
    for (const sx of [-w / 2 - 0.2, w / 2 + 0.2]) W.wedge({ x: x + sx, z: (z0 + z1) / 2, w: 0.4, d: z1 - z0, h0: top + 0.35, h1: 0.35, tag: 'curb' }, C.concrete, C.concreteSide);
    for (let z = z0 + 2; z < z1 - 3; z += 6) {
      const a = sh(z) + 0.02, b = sh(z + 3) + 0.02;
      G.quad([x - 0.12, a, z], [x + 0.12, a, z], [x + 0.12, b, z + 3], [x - 0.12, b, z + 3], C.line, [0, 1, slope]);
    }
    for (const zc of [-110, -80]) W.wedge({ x: x - 2.5, z: zc, w: 2.2, d: 2, h0: sh(zc - 1) + 0.01, h1: sh(zc + 1) + 0.55, tag: 'kicker' }, C.kicker, C.kickerSide);
    W.rail([x + 4, sh(-118) + 0.45, -118], [x + 4, sh(-60) + 0.45, -60], 'streetrail');
    W.ledge({ x: x - 3, z: -38, w: 0.7, d: 6, h: 0.45 });
  }

  // ============================================================ BEIT SEFER SCHOOLYARD (north-west)
  {
    W.box({ x: -105, z: -118, w: 70, d: 40, h: 1.7, tag: 'stair10_top' }, 0xd6d0c4, C.concreteSide);
    stairs(W, { xc: -105, zTop: -98, W: 7, n: 10, tag: 'stair10', rails: [-1, 1] });
    W.patch(-138, -136, -112, -110, 0xb5533c, 1.71);                    // basketball court
    W.patch(-125.2, -136, -124.8, -110, 0xffffff, 1.715);
    for (const [x, z] of [[-90, -110], [-84, -116], [-78, -110]]) {     // picnic tables (grindable)
      W.ledge({ x, z, w: 2.6, d: 0.8, h: 2.45, base: 1.7, tag: 'table' }, C.bench, C.woodSide, 'table');
      for (const dz of [-0.8, 0.8]) W.ledge({ x, z: z + dz, w: 2.6, d: 0.35, h: 2.15, base: 1.7, tag: 'bench' }, C.bench, C.woodSide, 'bench');
    }
    block(W, -105, -144, 60, 10, 12, 0xd8c8a8, 1);                         // the school building
    W._canvasPlane(10, 1.2, (c, w, h) => { c.fillStyle = '#f0ede4'; c.fillRect(0, 0, w, h); c.fillStyle = '#0038b8'; c.font = `bold ${h * 0.55}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('בית ספר', w / 2, h / 2); }, [-105, 7, -138.9], 0);
  }

  // ============================================================ PARKING GARAGE + INDUSTRIAL YARD (south-east)
  {
    W.box({ x: 100, z: 116, w: 60, d: 48, h: 3.5, tag: 'garage1' }, 0x8f8f8a, 0x77776f);
    W.wedge({ x: 65, z: 100, w: 6, d: 10, h0: 0, h1: 3.5, yaw: H, tag: 'garage_ramp' }, C.concrete, C.concreteSide);
    W.box({ x: 115, z: 122, w: 30, d: 36, h: 7, tag: 'garage_roof' }, 0x9a9a94, 0x77776f);
    W.wedge({ x: 95, z: 110, w: 6, d: 10, h0: 3.5, h1: 7, yaw: H, tag: 'garage_ramp' }, C.concrete, C.concreteSide);
    for (let x = 74; x < 130; x += 3) W.patch(x, 94, x + 0.12, 99, 0xf2f2f2, 3.52);   // parking bays
    W.ledge({ x: 115, z: 104.6, w: 26, d: 0.5, h: 7.6, base: 7, tag: 'roof_ledge' }, C.concrete, C.concreteSide);
    W.ledge({ x: 115, z: 139.4, w: 26, d: 0.5, h: 7.6, base: 7, tag: 'roof_ledge' }, C.concrete, C.concreteSide);
    W.rail([102, 7.45, 112], [102, 7.45, 132], 'roof_rail');
    W.quarter({ x: 128.6, z: 122, w: 30, d: 2.6 * SIN85, R: 2.6, base: 7, yaw: H, tag: 'roof_quarter' }, C.ramp, C.rampSide);
    for (const [x, z] of [[74, 136], [126, 96]]) { col.addBox({ x, z, w: 0.6, d: 0.6, h: 3.5, tag: 'pillar' }); }
    // industrial: loading dock + container gap
    W.box({ x: 62, z: 140, w: 12, d: 14, h: 1.2, tag: 'dock' }, C.concrete, C.concreteSide);
    W._bank(62, 130.5, 12, 5, 1.2, 0, 'dock_bank');
    // container line: a 4 m roll-in tower gives the speed a real gap needs
    W.box({ x: 140, z: 4, w: 5, d: 6, h: 7, tag: 'container_top' }, C.wood, C.woodSide);
    W.wedge({ x: 140, z: 19, w: 5, d: 24, h0: 7, h1: 0, tag: 'container_rollin' }, C.mega, C.megaSide);
    for (let z = 9; z <= 27; z += 4.5) for (const sx of [-2.3, 2.3]) G.beam([140 + sx, 0, z], [140 + sx, 7 * (1 - (z - 7) / 24), z], 0.15, C.metal);
    W._designJump({ x: 140, w: 5, z0: 34, h: 1.4, d: 3.2, v: 0.97 * Math.sqrt(2 * 13 * 7), name: 'container', label: 'Container Gap', points: 600 });
    for (const [x, z] of [[134.5, 44], [145.5, 44]]) W.box({ x, z, w: 2.4, d: 6, h: 2.6, tag: 'container' }, 0x2c5f8e, 0x1f4566);
    const drum = (x, z) => { col.addBox({ x, z, w: 0.62, d: 0.62, h: 0.93, tag: 'drum' }); P.add('barrel_03', x, z, x * 3.1); };
    drum(70, 128); drum(70.7, 128.7); drum(69.4, 129.1); P.add('old_tyre', 71.6, 129.9, 1.2, 1, 0.3);
    col.addBox({ x: 74, z: 128, w: 1.16, d: 0.52, h: 0.45, tag: 'crate' }); P.add('wooden_crate_02', 74, 128, H);
    P.add('trashbag', 68.8, 127, 0.7);
    for (const [x, z] of [[58, 60], [58, 108]]) { col.addBox({ x, z, w: 0.6, d: 0.5, h: 1.12, tag: 'utility' }); P.add('utility_box_01', x, z, 0); }
  }

  // ============================================================ SECRET BACKYARD POOL (south-west)
  {
    // the bowl itself is in MAP_BOWLS; a fence hides it with one gap to sneak in
    W._fence(-40, 62, -16, 62); W._fence(-40, 62, -40, 88); W._fence(-16, 62, -16, 80); W._fence(-40, 88, -16, 88);
    block(W, -28, 96, 18, 10, 8, 0xe8dcc0, 4);
  }

  // ============================================================ TAYELET BEACHFRONT (south)
  {
    const PH = 1.2, z0 = 118, z1 = 150;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 260).rotateX(-H),
      new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.94 }));
    sea.position.set(0, 0.02, 170 + 130); sea.receiveShadow = true; W.scene.add(sea); W.sea = sea;
    W.patch(-150, z1, 150, 172, C.sand, 0.02); W.patch(-150, 166, 150, 172, C.sandWet, 0.03);
    col.addLawn(-150, z1 + 0.05, 150, 172);
    W.box({ x: -60, z: (z0 + z1) / 2, w: 180, d: z1 - z0, h: PH, tag: 'promenade' }, C.promenade, C.concreteSide);
    col.addRail([-149.5, PH, z1 - 0.04], [29.5, PH, z1 - 0.04], 'seawall');
    for (const xc of [-120, -70, -10]) {                                   // stairs down to the sand + handrail
      const n = 7, stepH = PH / n, stepD = 0.38;
      for (let i = 1; i < n; i++) W.box({ x: xc, z: z1 + (i - 0.5) * stepD, w: 6, d: stepD, h: PH - i * stepH, tag: 'tlv_steps', noShadow: true }, i % 2 ? 0xd6d0c4 : 0xc9c2b4, C.concreteSide);
      const run = (n - 1) * stepD, slope = stepH / stepD;
      W.rail([xc, PH + 0.6, z1 - 0.6], [xc, PH + 0.6, z1], 'handrail_flat');
      W.rail([xc, PH + 0.6, z1], [xc, PH + 0.6 - (run + 0.3) * slope, z1 + run + 0.3], 'handrail');
    }
    for (const xc of [-140, -40, 20]) W.wedge({ x: xc, z: z0 - 3, w: 8, d: 6, h0: 0, h1: PH, tag: 'tlv_bank' }, C.concrete, C.concreteSide);
    W.wedge({ x: 34, z: (z0 + z1) / 2, w: 8, d: z1 - z0, h0: 0, h1: PH, yaw: -H, tag: 'tlv_ramp' }, C.concrete, C.concreteSide);
    for (let x = -140, k = 0; x < 25; x += 26, k++) {                     // benches, palm planters, lamps, inlaid stars
      W.ledge({ x, z: 136, w: 3.2, d: 0.6, h: PH + 0.45, base: PH, tag: 'tlv_bench' }, C.ledge, C.ledgeSide);
      W.ledge({ x: x + 13, z: 126, w: 2.2, d: 2.2, h: PH + 0.5, base: PH, tag: 'tlv_planter' }, C.concrete, C.concreteSide);
      F.addPalm(x + 13, 126, 0.9 + (k % 4) * 0.08, PH + 0.5);
      lamp(W, x + 6, 121, PH);
      G.addGeometry(W._starOfDavid(1.3, 0.16, 0.02).rotateX(-H), new THREE.Matrix4().makeTranslation(x + 6, PH + 0.012, 136), 0x0038b8);
    }
    // beach: umbrellas, loungers, palms, lifeguard tower, star sculpture
    const STR = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d];
    for (let i = 0, x = -146; x < 146; x += 17, i++) {
      if ([-120, -70, -10].some((s) => Math.abs(x - s) < 6)) continue;
      const z = 157 + (i % 2) * 4;
      G.beam([x, 0, z], [x, 2.3, z], 0.05, 0xdddddd);
      G.addGeometry(new THREE.ConeGeometry(1.4, 0.55, 12, 1, true), new THREE.Matrix4().makeTranslation(x, 2.25, z), STR[i % 4]);
      for (const dx of [-1.2, 1.2]) G.prism({ x: x + dx, z: z + 1.2, w: 0.65, d: 1.9 }, [0.32, 0.32, 0.32, 0.32], 0.05, 0xf2efe6, 0xc9c2b4);
    }
    for (let x = -136; x < 146; x += 31) { F.addPalm(x, 153, 1.05, 0); col.addBox({ x, z: 153, w: 0.4, d: 0.4, h: 3, tag: 'tree' }); }
    {
      const x = 60, z = 160;
      for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { G.beam([x + ox, 0, z + oz], [x + ox, 2.6, z + oz], 0.14, 0xe9e4d8); col.addBox({ x: x + ox, z: z + oz, w: 0.3, d: 0.3, h: 2.6, tag: 'lifeguard' }); }
      G.prism({ x, z, w: 3.4, d: 3.4 }, [5, 5, 5, 5], 2.6, 0xf0ede4, 0x3d7ea6);
      G.prism({ x, z, w: 4.2, d: 4.2 }, [5.4, 5.4, 5.4, 5.4], 5, 0xe63946, 0xe63946);
    }
    G.addGeometry(W._starOfDavid(2.4, 0.28, 0.3), new THREE.Matrix4().makeTranslation(100, 3.1, 160), 0x0038b8);
    G.beam([100, 0, 160], [100, 0.8, 160], 0.4, 0xd6d0c4); col.addBox({ x: 100, z: 160, w: 0.6, d: 0.6, h: 5.5, tag: 'sculpture' });
    // menorah monument at the promenade's east end
    {
      const x = 22, z = 128, y0 = PH, GOLD = 0xc9a227;
      W.box({ x, z, w: 3.2, d: 1.2, h: y0 + 0.9, base: y0, tag: 'menorah_plinth' }, 0xd6d0c4, 0xc9c2b4);
      const top = y0 + 0.9 + 3.2;
      G.beam([x, y0 + 0.9, z], [x, top, z], 0.16, GOLD);
      for (let i = 1; i <= 3; i++) {
        const r = i * 0.42, pts = [];
        for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; pts.push([x - Math.cos(a) * r, top - Math.sin(a) * r * 1.15, z]); }
        for (let k = 0; k < 10; k++) G.beam(pts[k], pts[k + 1], 0.12, GOLD);
        for (const sx of [-1, 1]) G.prism({ x: x + sx * r, z, w: 0.22, d: 0.22 }, [top + 0.12, top + 0.12, top + 0.12, top + 0.12], top - 0.02, GOLD, GOLD);
      }
      G.prism({ x, z, w: 0.22, d: 0.22 }, [top + 0.12, top + 0.12, top + 0.12, top + 0.12], top - 0.02, GOLD, GOLD);
    }
    // white Bauhaus blocks on pilotis behind the promenade (glass lobby = collision)
    for (let x = -140, k = 0; x < -60; x += 34, k++) {
      const z = 100, w = 20, d = 14, h = 12 + (k % 3) * 3.2;
      col.addBox({ x, z, w: w - 2, d: d - 2, h, tag: 'building' });
      G.prism({ x, z, w: w - 2, d: d - 2 }, [2.8, 2.8, 2.8, 2.8], 0, 0x3b4a58, 0x3b4a58);
      for (const [ox, oz] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) G.prism({ x: x + ox, z: z + oz, w: 0.45, d: 0.45 }, [2.8, 2.8, 2.8, 2.8], 0, C.stucco, C.stuccoShade);
      G.prism({ x, z, w, d }, [h, h, h, h], 2.8, C.stucco, C.stucco);
      G.castShadow([[x - w / 2, 2.8, z - d / 2], [x + w / 2, 2.8, z - d / 2], [x - w / 2, 2.8, z + d / 2], [x + w / 2, 2.8, z + d / 2], [x - w / 2, h, z - d / 2], [x + w / 2, h, z + d / 2]], 0);
      for (let y = 4.2; y < h - 0.8; y += 3.2) {
        G.prism({ x, z, w: w + 0.06, d: d + 0.06 }, [y + 0.9, y + 0.9, y + 0.9, y + 0.9], y, 0x2f3b47, 0x2f3b47);
        G.addGeometry(new THREE.CylinderGeometry(2.4, 2.4, 0.95, 20, 1, false, 0, Math.PI), new THREE.Matrix4().makeTranslation(x + w / 2 - 2.4, y - 0.1, z + d / 2), C.stucco);
      }
      G.prism({ x, z, w: w + 0.4, d: d + 0.4 }, [h + 0.3, h + 0.3, h + 0.3, h + 0.3], h, C.stuccoShade, C.stuccoShade);
      G.addGeometry(W._starOfDavid(1.6, 0.2, 0.08), new THREE.Matrix4().makeTranslation(x, h - 2.2, z + d / 2 + 0.06), 0x0038b8);
    }
    // synagogue on the avenue
    {
      const x = -4, z = 92, w = 14, d = 10, h = 9;
      W.box({ x, z, w, d, h, tag: 'synagogue' }, C.stuccoShade, C.stucco);
      for (let i = -2; i <= 2; i++) G.prism({ x: x + i * 2.2, z: z - d / 2 - 0.04, w: 1.0, d: 0.1 }, [6.5, 6.5, 6.5, 6.5], 2.5, 0x3d5a80, 0x3d5a80);
      G.addGeometry(W._starOfDavid(1.5, 0.22, 0.12), new THREE.Matrix4().makeTranslation(x, 7.4, z - d / 2 - 0.1), 0x0038b8);
      G.addGeometry(W._starOfDavid(0.9, 0.14, 0.12), new THREE.Matrix4().makeTranslation(x, h + 1.2, z), 0xc9a227);
      W._canvasPlane(5, 0.8, (c, w2, h2) => { c.fillStyle = '#f0ede4'; c.fillRect(0, 0, w2, h2); c.fillStyle = '#0038b8'; c.font = `bold ${h2 * 0.6}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('בית כנסת', w2 / 2, h2 / 2); }, [x, 1.9, z - d / 2 - 0.08], Math.PI);
    }
    // Israeli flags (one shared texture, instanced) along the promenade & on the roofs
    const flags = [];
    for (let x = -146; x < 28; x += 24) { col.addBox({ x, z: 148.5, w: 0.2, d: 0.2, h: PH + 6, tag: 'pole' }); G.beam([x, PH, 148.5], [x, PH + 6, 148.5], 0.08, 0xdddddd); flags.push([x + 0.92, PH + 5.3, 148.5]); }
    for (let x = -140, k = 0; x < -60; x += 34, k++) { const h = 12 + (k % 3) * 3.2; G.beam([x, h + 0.3, 100], [x, h + 3.5, 100], 0.08, 0xdddddd); flags.push([x + 0.92, h + 2.8, 100]); }
    const c = document.createElement('canvas'); c.width = 512; c.height = 370;
    const x2 = c.getContext('2d'), fw = 512, fh = 370;
    x2.fillStyle = '#fff'; x2.fillRect(0, 0, fw, fh); x2.fillStyle = '#0038b8'; x2.fillRect(0, fh * 0.1, fw, fh * 0.15); x2.fillRect(0, fh * 0.75, fw, fh * 0.15);
    x2.lineWidth = fh * 0.035; x2.strokeStyle = '#0038b8';
    for (const rot of [0, Math.PI]) { x2.beginPath(); for (let k = 0; k < 3; k++) { const a = rot + k * 2 * Math.PI / 3; x2[k ? 'lineTo' : 'moveTo'](fw / 2 + Math.sin(a) * fh * 0.2, fh / 2 - Math.cos(a) * fh * 0.2); } x2.closePath(); x2.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const fg = new THREE.PlaneGeometry(1.8, 1.3, 12, 1), fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) { const xx = fp.getX(i) + 0.9; fp.setZ(i, Math.sin(xx * 2.2) * 0.12 * (xx / 1.8)); }
    fg.computeVertexNormals();
    const im = new THREE.InstancedMesh(fg, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }), flags.length);
    const M = new THREE.Matrix4();
    flags.forEach((p, i) => im.setMatrixAt(i, M.makeTranslation(...p)));
    im.castShadow = true; im.computeBoundingSphere(); W.scene.add(im);
  }

  // ============================================================ CITY BLOCKS around the edges (not the seafront)
  const COLS = [0xc9b79c, 0xb5654f, 0xd8d2c4, 0x8c9a9e, 0xa86b4f, 0xcfc0a5, 0x9e8f7e, 0xbfae95];
  let k = 0;
  const B = MAP_BOUNDS;
  for (let x = B.minX; x < B.maxX; x += 22) block(W, x + 11, B.minZ - 9, 18, 16, 8 + 4 * ((k * 7919) % 5), COLS[k++ % COLS.length], k);
  for (let z = B.minZ; z < 110; z += 22) {
    block(W, B.minX - 9, z + 11, 16, 18, 8 + 4 * ((k * 7919) % 5), COLS[k++ % COLS.length], k);
    block(W, B.maxX + 9, z + 11, 16, 18, 8 + 4 * ((k * 7919) % 5), COLS[k++ % COLS.length], k);
  }
  // blocks lining the avenue between districts
  for (const [x, z, w, d, h] of [[-120, 72, 24, 12, 14], [-88, 72, 20, 12, 10], [-60, 78, 14, 24, 12], [8, -60, 26, 12, 16], [-20, -60, 18, 12, 12], [24, -112, 26, 30, 20], [-8, -118, 18, 18, 14]]) block(W, x, z, w, d, h, COLS[k++ % COLS.length], k);
  W.col.linkRails();
}
