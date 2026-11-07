// =============================================================================
//  physics.js — the collision world.
//  The park is described with simple analytic shapes instead of triangle meshes,
//  which keeps ground queries cheap enough for a school Chromebook:
//    box     : flat top at height `h`, solid down to the ground (walls on its sides)
//    wedge   : sloped top, height h0 at the local -Z edge → h1 at the local +Z edge
//    quarter : quarter-pipe curve (radius R) rising toward local +Z
//    bowl    : round pool sunk into the ground
//  Rails are line segments; zones are tagged rectangles used for gap detection.
//  Each footprint is a rectangle centred on (x, z), size w × d, rotated by `yaw`.
// =============================================================================

const MAX_GRADIENT = 12; // caps slope (≈85°) so near-vertical walls stay stable

export class CollisionWorld {
  constructor() {
    this.surfaces = [];
    this.rails = [];
    this.zones = [];
    this.bowls = [];
    this.bounds = { minX: -110, maxX: 232, minZ: -110, maxZ: 155 };
    this.vertSlope = 2.6; // set from PHYSICS.vertSlope in main.js
    // scratch objects (avoid garbage every frame)
    this._s = { h: 0, gx: 0, gz: 0 };
    this._g = { h: 0, nx: 0, ny: 1, nz: 0, gx: 0, gz: 0, surf: null, vert: false, vx: 0, vz: 0, tag: null };
  }

  // ---- builders --------------------------------------------------------------
  _rect(o) {
    const yaw = o.yaw || 0;
    return { x: o.x, z: o.z, hx: o.w / 2, hz: o.d / 2, yaw, c: Math.cos(yaw), s: Math.sin(yaw), tag: o.tag || null };
  }
  addBox(o)   { const r = this._rect(o); r.type = 'box';   r.h = o.h; this.surfaces.push(r); return r; }
  addWedge(o) { const r = this._rect(o); r.type = 'wedge'; r.h0 = o.h0; r.h1 = o.h1; this.surfaces.push(r); return r; }
  // quarter pipe: footprint depth d must be <= R*sin(85°). base = floor height.
  addQuarter(o) {
    const r = this._rect(o); r.type = 'quarter'; r.R = o.R; r.base = o.base || 0;
    this.surfaces.push(r); return r;
  }
  // hip corner: square footprint, height = h * min(u, v) — two banks meeting at a
  // diagonal ridge. Low at local (-x,-z), high at local (+x,+z).
  addCorner(o) { const r = this._rect(o); r.type = 'corner'; r.h = o.h; this.surfaces.push(r); return r; }
  addBowl(o) { const b = { x: o.x, z: o.z, R: o.R, D: o.D, tag: o.tag || 'bowl' }; this.bowls.push(b); return b; }
  addZone(o) { const r = this._rect(o); this.zones.push(r); return r; }

  // a: [x,y,z], b: [x,y,z]
  addRail(a, b, tag) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.hypot(dx, dy, dz);
    const rail = {
      ax: a[0], ay: a[1], az: a[2],
      dx: dx / len, dy: dy / len, dz: dz / len, len, tag: tag || 'rail',
      lastLeft: -10,
    };
    this.rails.push(rail);
    return rail;
  }

  // Connect rails whose ends touch (e.g. the flat top of a handrail → its slope)
  // so a grind flows from one segment into the next.
  linkRails() {
    const near = (x1, y1, z1, x2, y2, z2) => Math.hypot(x1 - x2, y1 - y2, z1 - z2) < 0.08;
    for (const r of this.rails) {
      const bx = r.ax + r.dx * r.len, by = r.ay + r.dy * r.len, bz = r.az + r.dz * r.len;
      for (const o of this.rails) {
        if (o !== r && near(bx, by, bz, o.ax, o.ay, o.az)) { r.next = o; o.prev = r; }
      }
    }
  }

  // ---- local coordinates of a world point inside a footprint -------------------
  // returns local x,z in this._lx / this._lz
  _toLocal(r, x, z) {
    const dx = x - r.x, dz = z - r.z;
    this._lx = dx * r.c - dz * r.s;
    this._lz = dx * r.s + dz * r.c;
  }
  _inside(r, x, z) {
    this._toLocal(r, x, z);
    return Math.abs(this._lx) <= r.hx && Math.abs(this._lz) <= r.hz;
  }

  // Evaluate a surface at (x,z). Returns false if outside its footprint.
  _evalSurface(r, x, z, out) {
    if (!this._inside(r, x, z)) return false;
    let glx = 0, glz = 0; // local gradient
    if (r.type === 'box') {
      out.h = r.h;
    } else if (r.type === 'wedge') {
      const t = (this._lz + r.hz) / (2 * r.hz);
      out.h = r.h0 + (r.h1 - r.h0) * t;
      glz = (r.h1 - r.h0) / (2 * r.hz);
    } else if (r.type === 'corner') {
      const u = (this._lx + r.hx) / (2 * r.hx), v = (this._lz + r.hz) / (2 * r.hz);
      if (v < u) { out.h = r.h * v; glz = r.h / (2 * r.hz); }
      else { out.h = r.h * u; glx = r.h / (2 * r.hx); }
    } else { // quarter
      const d = this._lz + r.hz;
      const R = r.R;
      const q = Math.sqrt(Math.max(R * R - d * d, 1e-6));
      out.h = r.base + R - q;
      glz = Math.min(d / q, MAX_GRADIENT);
    }
    // local gradient → world gradient
    out.gx = glx * r.c + glz * r.s;
    out.gz = -glx * r.s + glz * r.c;
    return true;
  }

  // Ground under the bowl-aware base floor (several bowls allowed, they must not overlap)
  _base(x, z, out) {
    out.h = 0; out.gx = 0; out.gz = 0; out.bowl = null;
    for (const b of this.bowls) {
      const dx = x - b.x, dz = z - b.z;
      const r = Math.hypot(dx, dz);
      if (r >= b.R) continue;
      const flatR = b.R - b.D;
      out.bowl = b;
      if (r <= flatR) { out.h = -b.D; return; }
      const u = r - flatR;
      const q = Math.sqrt(Math.max(b.D * b.D - u * u, 1e-6));
      out.h = -q;
      const slope = Math.min(u / q, MAX_GRADIENT);
      out.gx = slope * dx / r; out.gz = slope * dz / r;
      return;
    }
  }

  // Highest walkable surface at (x,z) whose height is <= maxY.
  // Returns a shared object: { h, nx, ny, nz, surf, tag, vert, vx, vz }
  ground(x, z, maxY) {
    const g = this._g, s = this._s;
    this._base(x, z, s);
    let h = s.h, gx = s.gx, gz = s.gz, surf = null, tag = s.bowl ? s.bowl.tag : null;
    let vert = false, vx = 0, vz = 0;
    if (s.bowl) {
      const slope = Math.hypot(gx, gz);
      if (slope > 1e-6) { vx = gx / slope; vz = gz / slope; }
    }
    for (let i = 0; i < this.surfaces.length; i++) {
      const r = this.surfaces[i];
      if (!this._evalSurface(r, x, z, s)) continue;
      if (s.h <= maxY && s.h > h) {
        h = s.h; gx = s.gx; gz = s.gz; surf = r; tag = r.tag;
        vx = r.s; vz = r.c; // quarter pipes rise toward local +Z
      }
    }
    const slope = Math.hypot(gx, gz);
    vert = slope >= this.vertSlope && (surf === null ? !!s.bowl : surf.type === 'quarter');
    const inv = 1 / Math.sqrt(gx * gx + 1 + gz * gz);
    g.h = h; g.gx = gx; g.gz = gz;
    g.nx = -gx * inv; g.ny = inv; g.nz = -gz * inv;
    g.surf = surf; g.tag = tag; g.vert = vert; g.vx = vx; g.vz = vz;
    return g;
  }

  // A surface at (x,z) that is taller than maxY = a wall. Returns it (or null).
  blocker(x, z, maxY) {
    const b = this.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return BOUNDS_WALL;
    const s = this._s;
    for (let i = 0; i < this.surfaces.length; i++) {
      const r = this.surfaces[i];
      if (!this._evalSurface(r, x, z, s)) continue;
      if (s.h > maxY) return r;
    }
    return null;
  }

  // Horizontal outward normal of a wall, as seen from point (x,z) (usually the
  // position before the move). Writes into out {x,z}.
  wallNormal(r, x, z, out) {
    if (r === BOUNDS_WALL) {
      const b = this.bounds;
      const dists = [x - b.minX, b.maxX - x, z - b.minZ, b.maxZ - z];
      const i = dists.indexOf(Math.min(...dists));
      out.x = [1, -1, 0, 0][i]; out.z = [0, 0, 1, -1][i];
      return out;
    }
    this._toLocal(r, x, z);
    const ex = Math.abs(this._lx) - r.hx, ez = Math.abs(this._lz) - r.hz;
    let nlx = 0, nlz = 0;
    if (ex > ez) nlx = Math.sign(this._lx) || 1; else nlz = Math.sign(this._lz) || 1;
    out.x = nlx * r.c + nlz * r.s;
    out.z = -nlx * r.s + nlz * r.c;
    return out;
  }

  zonesAt(x, z) {
    const tags = [];
    for (const zr of this.zones) if (this._inside(zr, x, z)) tags.push(zr.tag);
    return tags;
  }

  // Find a rail to snap onto. p = board position, v = velocity.
  findRail(p, v, now, cfg) {
    let best = null, bestD = Infinity;
    const vh = Math.hypot(v.x, v.z);
    const cosAlign = Math.cos(cfg.alignDegrees * Math.PI / 180);
    for (const r of this.rails) {
      if (now - r.lastLeft < cfg.reSnapDelay) continue;
      const px = p.x - r.ax, py = p.y - r.ay, pz = p.z - r.az;
      let t = px * r.dx + py * r.dy + pz * r.dz;
      if (t < 0.15 || t > r.len - 0.15) continue;
      const cx = r.ax + r.dx * t, cy = r.ay + r.dy * t, cz = r.az + r.dz * t;
      const dh = Math.hypot(p.x - cx, p.z - cz);
      const dy = p.y - cy;
      if (dh > cfg.snapRadius || dy > cfg.snapAbove || dy < -cfg.snapBelow) continue;
      // must be moving ALONG the rail: enough sideways speed, lined up with it.
      // (fixes snapping onto coping when coming straight down from a vert air)
      const rh = Math.hypot(r.dx, r.dz);
      if (vh < (cfg.minHorizSpeed || 1.2)) continue;
      if (rh > 1e-3) {
        const dot = Math.abs((v.x * r.dx + v.z * r.dz) / (vh * rh));
        if (dot < cosAlign) continue;
      }
      if (Math.abs(v.y) > 3 * vh) continue;
      const d = dh + Math.abs(dy) * 0.5;
      if (d < bestD) { bestD = d; best = { rail: r, t }; }
    }
    return best;
  }
}

// sentinel wall used for the invisible world bounds
export const BOUNDS_WALL = { type: 'bounds', tag: 'bounds' };
