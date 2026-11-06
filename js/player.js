// =============================================================================
//  player.js — the skater controller (physics + state machine).
//  States:
//    ride  : wheels on the ground (steer, push, brake, crouch, pop)
//    air   : airborne (spin, tricks, grabs) → land, grind or bail
//    grind : locked onto a rail / ledge edge
//    (manual is a sub-mode of ride: this.manual != null)
//    bail  : tumble, slow-mo, then respawn at the last stable spot
//    walk  : off the board (E)
//  All tuning numbers come from config.js.
// =============================================================================
import * as THREE from 'three';
import { PHYSICS as P, SHUVITS, GRABS, GRAB_POINTS, SPIN_POINTS_PER_180, BIG_AIR, GAPS, POWERSLIDE,
  GRINDS, GRIND, GRIND_POINTS, MANUALS, MANUAL_POINTS, MANUAL_BALANCE as MB } from './config.js';
import { resolveFlick, spinLabel } from './tricks.js';
import { PHYSICS2 as P2 } from './config.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

export class Player {
  constructor(world, input, skater) {
    this.world = world;
    this.col = world.col;
    this.input = input;
    this.skater = skater;
    this.listeners = [];

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.renderNormal = new THREE.Vector3(0, 1, 0);
    this.heading = 0;        // direction of travel on the ground
    this.fakie = false;      // riding backwards (model turned 180°)
    this.speed = 0;          // m/s along heading while riding
    this.state = 'ride';
    this.groundTag = null;
    this.groundVert = false; this.gvx = 0; this.gvz = 0;

    this.crouching = false; this.spaceStart = 0;
    this.wantPop = null; this.wantPush = false;
    this.lastPush = -10; this.pushPhase = -1;
    this.powersliding = false; this.slideTime = 0;
    this.lean = 0;
    this.time = 0;           // game time (affected by slow-mo)

    this.air = null;
    this.grind = null;
    this.manual = null;
    this.bailInfo = null;
    this.walkVy = 0; this.walkSpeed = 0;

    this.spawn = world.spots[0];
    this.customSpot = null;
    this.lastSafe = null; this.safeTimer = 0;
    this.timeScale = 1;

    this.respawnAt(this.spawn);
  }

  on(fn) { this.listeners.push(fn); }
  emit(type, data = {}) { for (const fn of this.listeners) fn(type, data); }

  // ------------------------------------------------------------------ spawning
  respawnAt(spot) {
    this.pos.set(spot.x, spot.y, spot.z);
    const g = this.col.ground(spot.x, spot.z, spot.y + 0.5);
    this.pos.y = g.h;
    this.normal.set(g.nx, g.ny, g.nz);
    this.heading = spot.heading; this.fakie = false;
    this.speed = 0; this.vel.set(0, 0, 0);
    this.state = 'ride';
    this.air = null; this.bailInfo = null; this.grind = null; this.manual = null;
    this.crouching = false; this.wantPop = null; this.powersliding = false;
    this.lastSafe = { x: this.pos.x, y: this.pos.y, z: this.pos.z, heading: this.heading };
    this.timeScale = 1;
    this.skater.setTransform(this.pos, this.modelYaw(), this.normal, 0);
    this.emit('respawn', {});
  }
  teleport(spot) { this.spawn = spot; this.customSpot = null; this.respawnAt(spot); }
  respawnLast() { this.respawnAt(this.customSpot || this.spawn); }
  setCustomSpot() {
    if (this.state !== 'ride' && this.state !== 'walk') return false;
    this.customSpot = { x: this.pos.x, y: this.pos.y, z: this.pos.z, heading: this.modelYaw() };
    return true;
  }

  modelYaw() {
    if (this.state === 'air' && this.air) return this.air.yaw;
    // (grind: heading follows the rail; sideways slides are drawn by the skater)
    return this.heading + (this.fakie ? Math.PI : 0);
  }

  // ------------------------------------------------------------------ per-frame input (edges)
  frameInput(realNow) {
    const inp = this.input;
    if (inp.pressed.walk) {
      if (this.state === 'ride' && this.speed < 3) this.enterWalk();
      else if (this.state === 'walk') this.exitWalk();
    }
    if (inp.pressed.respawn && this.state !== 'bail') this.respawnLast();
    if (inp.pressed.setSpot) this.emit('spotSet', { ok: this.setCustomSpot() });

    const canPop = this.state === 'ride' || this.state === 'grind';
    if (inp.pressed.pop) { this.spaceStart = realNow; this.crouching = true; }
    if (!inp.held.pop && this.crouching && inp.released.pop) {
      this.crouching = false;
      if (canPop) {
        const dirs = inp.dirEvents.filter((e) => e.t >= this.spaceStart && e.t >= realNow - P.flickWindow).map((e) => e.dir);
        this.wantPop = { hold: realNow - this.spaceStart, dirs };
      }
    }
    if (!inp.held.pop) this.crouching = false;

    // L = manual on / off (L + ↑ = nose manual); in the air it queues a manual for landing
    if (inp.pressed.manual) {
      if (this.state === 'ride') {
        if (this.manual) this.endManual();
        else if (this.speed > 0.8) this.startManual(inp.held.up);
      } else if (this.state === 'air') this.air.manualQueued = true;
    }

    if (this.state === 'ride' && !this.crouching && !this.manual) {
      if (inp.pressed.up && realNow - this.lastPush > P.pushCooldown) this.wantPush = true;
      else if (inp.held.up && realNow - this.lastPush > P.pushHoldInterval) this.wantPush = true;
      if (this.wantPush) this.lastPush = realNow;
    }
  }

  // ------------------------------------------------------------------ fixed-step update
  update(dt) {
    this.time += dt;
    if (this.pushPhase >= 0) { this.pushPhase += dt * 2.2; if (this.pushPhase >= 1) this.pushPhase = -1; }
    if (this.wantPop) {
      const w = this.wantPop; this.wantPop = null;
      if (this.state === 'ride') { if (this.manual) this.endManual(); this.pop(w); }
      else if (this.state === 'grind') this.popFromGrind(w);
    }
    switch (this.state) {
      case 'ride': this.updateRide(dt); break;
      case 'air': this.updateAir(dt); break;
      case 'grind': this.updateGrind(dt); break;
      case 'bail': this.updateBail(dt); break;
      case 'walk': this.updateWalk(dt); break;
    }
  }

  // forward direction along the ground plane for a given heading
  _tangent(heading, n, out) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const d = fx * n.x + fz * n.z;
    out.set(fx - d * n.x, -d * n.y, fz - d * n.z).normalize();
    return out;
  }

  // ------------------------------------------------------------------ RIDE
  updateRide(dt) {
    const inp = this.input, n = this.normal;
    const f = this._f || (this._f = new THREE.Vector3());

    // --- steering
    const turn = (inp.held.left ? 1 : 0) - (inp.held.right ? 1 : 0);
    let rate = lerp(P.turnRateLow, P.turnRateHigh, clamp(this.speed / P.pushMaxSpeed, 0, 1));
    if (this.crouching) rate *= P.crouchTurnBonus;
    this.heading += turn * rate * dt;
    this.yawRate = turn * rate;
    this.lean = turn * clamp(this.speed / 4, 0.3, 1);
    // hard carving at speed scrubs a little speed off (wheels slip sideways)
    if (turn && this.speed > 3) this.speed -= Math.abs(turn) * this.speed * P2.carveScrub * dt;

    // --- gravity pulls the board's direction downhill on side slopes (carving)
    const lx = Math.cos(this.heading), lz = -Math.sin(this.heading);   // "left" vector
    const ln = lx * n.x + lz * n.z;
    if (n.y < 0.999) this.heading += clamp(P.gravity * ln * n.y / Math.max(this.speed, 1.5), -4, 4) * dt;

    // --- manual balance (W / S lean)
    if (this.manual) { if (this.updateManual(dt)) return; }

    // --- push / brake / powerslide
    if (this.wantPush) {
      this.wantPush = false;
      if (this.speed < P.pushMaxSpeed && n.y > 0.97) {
        this.speed = Math.min(P.pushMaxSpeed, this.speed + P.pushImpulse);
        this.pushPhase = 0;
        this.emit('push');
      }
    }
    const braking = inp.held.down && !this.crouching && !this.manual;
    const wasSliding = this.powersliding;
    this.powersliding = braking && (this.speed > P.powerslideMinSpeed || (wasSliding && this.speed > 1.5));
    if (braking) this.speed -= (this.powersliding ? P.powerslideDecel : P.brakeDecel) * dt;
    if (this.powersliding) this.slideTime += dt;
    else if (wasSliding) {
      if (this.slideTime >= POWERSLIDE.minTime) this.emit('powerslide', { name: POWERSLIDE.name, points: POWERSLIDE.points, time: this.slideTime });
      this.slideTime = 0;
    }

    // --- rolling resistance (never reverses you)
    // different surfaces roll differently (rough street vs. smooth ramps)
    const grip = P2.surfaceFriction[this.groundTag] ?? 1;
    this.speed = Math.max(0, this.speed - (this.speed * P.rollFriction + P.rollDrag) * grip * dt);

    // --- gravity along the slope
    this._tangent(this.heading, n, f);
    this.speed += -P.gravity * f.y * dt;
    if (this.speed < 0) { // rolling backwards → you're now riding fakie
      this.heading += Math.PI; this.fakie = !this.fakie; this.speed = -this.speed;
      this._tangent(this.heading, n, f);
    }
    // pumping: hold W on a ramp transition while dropping in to gain speed
    if (inp.held.up && !this.crouching && !this.manual && n.y < 0.985 && f.y < -0.05) this.speed += P.pumpAccel * dt;
    this.speed = Math.min(this.speed, P.maxSpeed);
    this.vel.copy(f).multiplyScalar(this.speed);

    this._moveGrounded(dt);
  }

  // move along the ground with wall + launch handling (used by ride)
  _moveGrounded(dt) {
    const col = this.col;
    let nx = this.pos.x + this.vel.x * dt, ny = this.pos.y + this.vel.y * dt, nz = this.pos.z + this.vel.z * dt;
    let maxY = Math.max(this.pos.y, ny) + P.stepUp;
    const blk = col.blocker(nx, nz, maxY);
    if (blk) {
      if (this._hitWall(blk)) return;
      nx = this.pos.x + this.vel.x * dt; ny = this.pos.y + this.vel.y * dt; nz = this.pos.z + this.vel.z * dt;
      maxY = Math.max(this.pos.y, ny) + P.stepUp;
      if (col.blocker(nx, nz, maxY)) { nx = this.pos.x; nz = this.pos.z; ny = this.pos.y; this.speed *= 0.5; }
    }
    const g = col.ground(nx, nz, maxY);
    // launch if the ground drops away, or on a sharp convex edge (e.g. the lip of
    // a quarter-pipe) where we'd be moving away from the new surface
    const away = this.vel.x * g.nx + this.vel.y * g.ny + this.vel.z * g.nz;
    if (ny > g.h + P.launchTolerance || away > P.lipLaunchSpeed) {
      // the ground fell away (lip of a ramp, edge of a stair) → airborne
      this.pos.set(nx, ny, nz);
      this.launch(false);
      return;
    }
    this.pos.set(nx, g.h, nz);
    this.normal.set(g.nx, g.ny, g.nz);
    this.groundTag = g.tag;
    this.groundVert = g.vert; this.gvx = g.vx; this.gvz = g.vz;

    // remember a "stable" spot for bail respawns
    this.safeTimer += dt;
    if (this.safeTimer > 0.5 && g.ny > 0.97 && this.state === 'ride') {
      this.safeTimer = 0;
      this.lastSafe = { x: this.pos.x, y: this.pos.y, z: this.pos.z, heading: this.modelYaw() };
    }
  }

  // returns true if the move should be aborted (bailed)
  _hitWall(blk) {
    const nrm = this.col.wallNormal(blk, this.pos.x, this.pos.z, this._wn || (this._wn = {}));
    const vn = this.vel.x * nrm.x + this.vel.z * nrm.z;
    if (vn < 0) {
      if (-vn > P.wallBailSpeed && this.state !== 'walk') { this.bail('Hit a wall!'); return true; }
      // slide along the wall; a near head-on hit just stops you
      const vh = Math.hypot(this.vel.x, this.vel.z);
      this.vel.x -= vn * nrm.x * 1.05; this.vel.z -= vn * nrm.z * 1.05;
      if (-vn > 0.8 * vh) { this.vel.x *= 0.2; this.vel.z *= 0.2; }
      if (this.state === 'ride') {
        const h = Math.hypot(this.vel.x, this.vel.z);
        if (h > 0.4) this.heading = Math.atan2(this.vel.x, this.vel.z);
        this.speed = h * 0.85;
        this.vel.x *= 0.85; this.vel.z *= 0.85;
      }
      this.emit('wall', { speed: -vn });
    }
    return false;
  }

  // ------------------------------------------------------------------ POP / LAUNCH
  pop(popInfo) {
    const t = clamp(popInfo.hold / P.popChargeTime, 0, 1);
    const pop = lerp(P.popMin, P.popMax, t);
    const n = this.normal;
    this.vel.x += n.x * pop; this.vel.y += n.y * pop; this.vel.z += n.z * pop;
    this.launch(true);
    this.emit('pop', { strength: t });
    this.startPopTrick(popInfo);
  }

  // Flick input → trick. The trick is "performed" now (board starts flipping)
  // and only counts if you land it.
  startPopTrick(popInfo) {
    const def = resolveFlick(popInfo.dirs);
    this.startAirTrick(def);
  }

  startAirTrick(def) {
    const A = this.air;
    A.tricks.push({ name: def.name, base: def.name, points: def.points });
    if (def.time > 0) A.trick = { def, t: 0 };
    this.emit('trick', { name: def.name });
  }

  launch(popped) {
    const wasVert = this.groundVert && !popped;
    if (wasVert) {
      // vert launch: kill the outward part so you fly straight up and come back down
      const vx = this.gvx, vz = this.gvz;
      const out = this.vel.x * vx + this.vel.z * vz;
      this.vel.x -= vx * (out + P.vertInwardSpeed);
      this.vel.z -= vz * (out + P.vertInwardSpeed);
      this.pos.x -= vx * 0.06; this.pos.z -= vz * 0.06;
    }
    if (this.powersliding) { this.powersliding = false; this.slideTime = 0; }
    if (this.manual) this.endManual();
    this.state = 'air';
    this.air = {
      yaw: this.modelYaw(), spin: 0, spinVel: 0, time: 0,
      takeoffTag: this.groundTag, takeoffY: this.pos.y, maxY: this.pos.y, vert: wasVert,
      tricks: [], trick: null, flipAngle: 0, shuvAngle: 0,
      grab: null, grabTime: 0, manualQueued: false,
    };
  }

  // ------------------------------------------------------------------ AIR
  updateAir(dt) {
    const inp = this.input, A = this.air;
    A.time += dt;
    this.vel.y -= P.gravity * dt;
    const drag = 1 - P.airDrag * dt;
    this.vel.x *= drag; this.vel.z *= drag;

    // spin with A/D (not while Shift is held — that's for shuvits)
    if (!inp.held.shift && !inp.held.grind) { // K + ←/→ picks a slide instead of spinning
      // a direction used to pick a grab doesn't also spin you until released
      const lock = A.grab ? A.grab.lockDir : null;
      if (lock && !inp.held[lock] && A.grab) A.grab.lockDir = null;
      const l = inp.held.left && lock !== 'left', r = inp.held.right && lock !== 'right';
      // spins wind up and wind down (angular momentum) instead of starting instantly
      const dir = (l ? 1 : 0) - (r ? 1 : 0);
      if (dir) {
        const target = dir * P.airSpinRate;
        A.spinVel += clamp(target - A.spinVel, -P2.spinAccel * dt, P2.spinAccel * dt);
      } else A.spinVel *= Math.exp(-P2.spinDecay * dt);
      const spin = A.spinVel * dt;
      A.yaw += spin; A.spin += spin;
    } else {
      A.spinVel *= Math.exp(-P2.spinDecay * dt);
      A.yaw += A.spinVel * dt; A.spin += A.spinVel * dt;
    }
    this.updateAirTricks(dt);

    const nx = this.pos.x + this.vel.x * dt, ny = this.pos.y + this.vel.y * dt, nz = this.pos.z + this.vel.z * dt;
    const maxY = this.pos.y + P.stepUp;
    const blk = this.col.blocker(nx, nz, Math.max(maxY, ny + P.stepUp));
    if (blk) {
      if (this._hitWall(blk)) return;
      this.pos.y = ny;
      return; // stay at old xz this step
    }
    if (this.checkRails && this.checkRails(nx, ny, nz)) return;
    const g = this.col.ground(nx, nz, Math.max(maxY, ny + P.stepUp));
    if (ny <= g.h) { this.pos.set(nx, g.h, nz); this.land(g); return; }
    this.pos.set(nx, ny, nz);
    if (ny > A.maxY) A.maxY = ny;
  }

  updateAirTricks(dt) {
    const A = this.air, inp = this.input;
    // --- board rotation of the current flip / shuvit
    if (A.trick) {
      A.trick.t += dt;
      const p = Math.min(1, A.trick.t / A.trick.def.time);
      const e = 1 - (1 - p) * (1 - p) * 0.35 - 0.65 * (1 - p); // slightly eased
      A.flipAngle = A.trick.def.flips * TAU * e;
      A.shuvAngle = A.trick.def.shuv * Math.PI * e;
      if (p >= 1) { A.trick = null; A.flipAngle = 0; A.shuvAngle = 0; }
    }
    // --- Shift + ← / → = shuvit (one at a time, not while grabbing)
    if (!A.trick && !A.grab && inp.held.shift && (inp.pressed.left || inp.pressed.right)) {
      this.startAirTrick(inp.pressed.left ? SHUVITS.left : SHUVITS.right);
    }
    // --- J = grab (direction held picks which grab)
    if (inp.pressed.grab && !A.grab && !A.trick) {
      const dir = inp.heldDir();
      const def = GRABS[dir] || GRABS.none;
      A.grab = { def, time: 0, hand: dir === 'down' || dir === 'right' ? 'back' : 'front', lockDir: dir === 'left' || dir === 'right' ? dir : null };
      this.emit('grabStart', { name: def.name });
    }
    if (A.grab) {
      A.grab.time += dt;
      if (!inp.held.grab) this.endGrab();
    }
  }

  endGrab() {
    const A = this.air, G = A.grab;
    if (!G) return;
    A.grab = null;
    if (G.time >= GRAB_POINTS.minTime) {
      A.tricks.push({ name: G.def.name, base: G.def.name, points: Math.round(GRAB_POINTS.base + GRAB_POINTS.perSecond * G.time) });
      this.emit('trick', { name: G.def.name, grab: true, time: G.time });
    }
  }

  // ------------------------------------------------------------------ LANDING
  land(g) {
    const A = this.air, v = this.vel;
    const n = this._ln || (this._ln = new THREE.Vector3());
    n.set(g.nx, g.ny, g.nz);
    const vn = v.dot(n);
    const vtx = v.x - vn * n.x, vty = v.y - vn * n.y, vtz = v.z - vn * n.z;
    const impact = -vn;
    this.normal.copy(n);
    this.groundTag = g.tag; this.groundVert = g.vert; this.gvx = g.vx; this.gvz = g.vz;

    const fail = this.landingProblem(impact, vtx, vtz);
    if (fail) { this.bail(fail); return; }

    const vth = Math.hypot(vtx, vtz);
    if (vth > 0.8) {
      const travel = Math.atan2(vtx, vtz);
      const diff = Math.abs(wrapAngle(A.yaw - travel));
      this.heading = travel;
      this.fakie = diff > Math.PI / 2;
    } else {
      this.heading = A.yaw; this.fakie = false;
    }
    this.speed = Math.hypot(vtx, vty, vtz) * P.landSpeedKeep;
    // big impacts: knees absorb it and you lose some speed
    if (impact > P2.hardLandingImpact) this.speed *= Math.max(0.5, 1 - P2.hardLandingLoss * (impact - P2.hardLandingImpact));
    this.landDip = clamp(impact / 9, 0.12, 1);
    this.state = 'ride';
    this._tangent(this.heading, n, this.vel).multiplyScalar(this.speed);
    const info = this.landInfo(g, impact);
    this.air = null;
    // landing with Space still held → keep the crouch for the next pop
    if (this.input.held.pop) { this.crouching = true; this.spaceStart = performance.now() / 1000; }
    const queued = A.manualQueued || this.input.held.manual;
    this.emit('land', info);
    if (queued && this.speed > 0.8) this.startManual(this.input.held.up);
  }

  // returns a bail reason string, or null if the landing is clean
  landingProblem(impact, vtx, vtz) {
    const A = this.air;
    if (impact > P.maxLandingImpact) return 'Too much impact!';
    if (A.trick) {
      const p = A.trick.t / A.trick.def.time;
      if (p < P.flipCompleteThreshold) return 'Didn\'t finish the ' + A.trick.def.name + '!';
      A.trick = null; A.flipAngle = 0; A.shuvAngle = 0; // close enough — snap it
    }
    if (A.grab && P.bailIfGrabbingOnLand) return 'Still grabbing!';
    const vth = Math.hypot(vtx, vtz);
    if (vth > 0.8) {
      const travel = Math.atan2(vtx, vtz);
      const d = Math.abs(wrapAngle(A.yaw - travel));
      const off = Math.min(d, Math.PI - d);              // forward or fakie are both fine
      if (off > P.landAngleTolerance * Math.PI / 180) return 'Landed sideways!';
    }
    return null;
  }

  landInfo(g, impact) {
    const A = this.air;
    if (A.grab) this.endGrab();
    const tricks = A.tricks.slice();
    // spins: prefix the first trick ("BS 180 Kickflip") or add a plain spin
    const sp = spinLabel(A.spin);
    let spinName = null;
    if (sp.halfTurns > 0) {
      const bonus = SPIN_POINTS_PER_180 * sp.halfTurns;
      if (tricks.length) { tricks[0] = { ...tricks[0], name: sp.label + ' ' + tricks[0].name, points: tricks[0].points + bonus }; }
      else tricks.push({ name: sp.label, base: 'Spin', points: bonus });
      spinName = tricks[0].name;
    }
    if (A.time >= BIG_AIR.minAirTime && tricks.length) tricks.push({ name: BIG_AIR.name, base: BIG_AIR.name, points: BIG_AIR.points });
    // gaps: took off from one tagged spot and landed in another
    const zones = this.col.zonesAt(this.pos.x, this.pos.z);
    if (g.tag) zones.push(g.tag);
    const gaps = [];
    for (const gp of GAPS) {
      if (A.takeoffTag === gp.from && zones.includes(gp.to) && !gaps.find((x) => x.name === gp.name)) {
        gaps.push({ name: gp.name, base: gp.name, points: gp.points, gap: true });
      }
    }
    return {
      tricks, gaps, spinName, airTime: A.time, spin: A.spin,
      takeoffTag: A.takeoffTag, landTag: g.tag, zones,
      height: A.maxY - A.takeoffY, impact,
    };
  }

  // ------------------------------------------------------------------ GRIND
  // called from updateAir with the next position; returns true if we snapped on
  checkRails(nx, ny, nz) {
    const A = this.air;
    if (this.vel.y > 1.5 || A.time < 0.06) return false;
    const hit = this.col.findRail({ x: nx, y: ny, z: nz }, this.vel, this.time, GRIND);
    if (!hit) return false;
    // board still flipping → can't lock in yet (it will snap once the flip is done)
    if (A.trick) {
      if (A.trick.t / A.trick.def.time < P.flipCompleteThreshold) return false;
      A.trick = null; A.flipAngle = 0; A.shuvAngle = 0;
    }
    const r = hit.rail;
    let s = this.vel.x * r.dx + this.vel.y * r.dy + this.vel.z * r.dz;
    if (Math.abs(s) < 1) s = (s < 0 ? -1 : 1) * 1;
    const def = this.input.held.grind ? (GRINDS[this.input.heldDir()] || GRINDS.none) : GRINDS.auto;
    // record the air's tricks as "landed" onto the rail
    const fake = { tag: r.tag, nx: 0, ny: 1, nz: 0 };
    this.pos.set(r.ax + r.dx * hit.t, r.ay + r.dy * hit.t, r.az + r.dz * hit.t);
    const info = this.landInfo(fake, 0);
    info.onRail = true;
    this.state = 'grind';
    this.air = null;
    this.grind = { rail: r, t: hit.t, s, def, time: 0 };
    this.heading = Math.atan2(r.dx * s, r.dz * s);
    this._updateGrindYaw();
    this.emit('land', info);
    this.emit('grindStart', { name: def.name, tag: r.tag });
    return true;
  }

  _updateGrindYaw() {
    const G = this.grind, r = G.rail;
    const h = Math.hypot(r.dx, r.dz);
    if (h > 0.05) this.heading = Math.atan2(r.dx * Math.sign(G.s), r.dz * Math.sign(G.s));
  }

  updateGrind(dt) {
    const G = this.grind, r = G.rail;
    G.time += dt;
    G.s += -P.gravity * r.dy * dt;                 // sloped rails speed you up / slow you down
    G.s *= 1 - (P2.grindFriction[G.def.name] ?? GRIND.friction) * dt;
    G.t += G.s * dt;
    // flow onto a connected rail segment
    if (G.t > r.len && r.next) { G.t -= r.len; G.rail = r.next; return this.updateGrind(0); }
    if (G.t < 0 && r.prev) { G.rail = r.prev; G.t += r.prev.len; return this.updateGrind(0); }
    this._updateGrindYaw();
    this.vel.set(r.dx * G.s, r.dy * G.s, r.dz * G.s);
    this.pos.set(r.ax + r.dx * G.t, r.ay + r.dy * G.t, r.az + r.dz * G.t);
    this.normal.set(0, 1, 0);
    if (G.t < 0 || G.t > r.len || Math.abs(G.s) < GRIND.minSpeed) this.exitGrind(false);
  }

  exitGrind(popped) {
    const G = this.grind;
    G.rail.lastLeft = this.time;
    const pts = Math.round(GRIND_POINTS.base + GRIND_POINTS.perSecond * G.time);
    this.grind = null;
    this.groundTag = G.rail.tag; this.groundVert = false;
    if (!popped) this.vel.y += GRIND.exitPop;
    this.state = 'air';   // so modelYaw() is computed for the air
    this.launch(popped);
    this.emit('grindEnd', { name: G.def.name, base: G.def.name, time: G.time, tag: G.rail.tag, points: pts });
  }

  popFromGrind(popInfo) {
    const t = clamp(popInfo.hold / P.popChargeTime, 0, 1);
    this.vel.y += lerp(P.popMin, P.popMax, t);
    this.exitGrind(true);
    this.emit('pop', { strength: t });
    this.startPopTrick(popInfo);
  }

  // ------------------------------------------------------------------ MANUAL
  startManual(nose) {
    if (this.manual || this.state !== 'ride') return;
    this.powersliding = false;
    this.manual = { nose: !!nose, def: nose ? MANUALS.nose : MANUALS.normal, b: (Math.random() - 0.5) * 0.1, bv: 0, time: 0, noise: 0, noiseT: 0 };
    this.emit('manualStart', { name: this.manual.def.name });
  }

  // returns true if the manual made you bail
  updateManual(dt) {
    const M = this.manual, inp = this.input;
    M.time += dt;
    M.noiseT -= dt;
    if (M.noiseT <= 0) { M.noise = (Math.random() * 2 - 1); M.noiseT = 0.3 + Math.random() * 0.4; }
    const inst = MB.instability + MB.growth * M.time;
    const lean = (inp.held.up ? 1 : 0) - (inp.held.down ? 1 : 0); // W = weight forward
    M.bv += (inst * M.b + M.noise * MB.drift - lean * MB.control) * dt;
    M.bv *= 1 - MB.damping * dt;
    M.b += M.bv * dt;
    if (Math.abs(M.b) >= 1) { this.bail('Lost your balance!'); return true; }
    if (this.speed < 0.5) this.endManual();
    return false;
  }

  endManual() {
    const M = this.manual;
    if (!M) return;
    this.manual = null;
    const pts = Math.round(MANUAL_POINTS.base + MANUAL_POINTS.perSecond * M.time);
    this.emit('manualEnd', { name: M.def.name, base: M.def.name, time: M.time, points: pts, counts: M.time >= MANUAL_POINTS.minTime });
  }

  // true while a combo should stay "open" (in the air, grinding, manualling)
  isHoldingCombo() { return this.state === 'air' || this.state === 'grind' || !!this.manual; }

  // ------------------------------------------------------------------ BAIL
  bail(reason) {
    if (this.state === 'bail') return;
    this.state = 'bail';
    this.crouching = false; this.powersliding = false;
    const h = Math.hypot(this.vel.x, this.vel.z);
    const bq = this.skater.root.quaternion.clone();
    this.bailInfo = {
      reason, start: performance.now() / 1000, t: 0,
      vx: this.vel.x, vy: Math.max(this.vel.y, 0) + 1.2, vz: this.vel.z,
      yaw: this.modelYaw(),
      // the body rolls forward faster the faster you were going
      roll: 0, rollVel: Math.min(12, 1.5 + h / 0.7),
      // the board flies off on its own
      boardPos: this.pos.clone().add(new THREE.Vector3(0, 0.15, 0)),
      boardVel: new THREE.Vector3(this.vel.x * 1.15 + (Math.random() - 0.5) * 2, Math.max(this.vel.y, 0) + 2 + Math.random() * 1.5, this.vel.z * 1.15 + (Math.random() - 0.5) * 2),
      boardQuat: bq,
      boardSpin: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 18),
    };
    this.air = null; this.grind = null; this.manual = null;
    this.emit('bail', { reason });
  }

  updateBail(dt) {
    const B = this.bailInfo;
    B.t += dt;
    const fr = Math.exp(-2.5 * dt);
    B.vx *= fr; B.vz *= fr;
    B.vy -= P.gravity * dt;
    let nx = this.pos.x + B.vx * dt, nz = this.pos.z + B.vz * dt, ny = this.pos.y + B.vy * dt;
    if (this.col.blocker(nx, nz, this.pos.y + P.stepUp)) { nx = this.pos.x; nz = this.pos.z; B.vx = B.vz = 0; }
    const g = this.col.ground(nx, nz, this.pos.y + P.stepUp);
    let grounded = false;
    if (ny <= g.h) {
      ny = g.h; grounded = true;
      B.vy = B.vy < -2 ? -B.vy * P2.bodyBounce : 0;
      this.normal.set(g.nx, g.ny, g.nz);
      B.vx *= Math.exp(-3 * dt); B.vz *= Math.exp(-3 * dt);   // sliding on the ground
    }
    this.pos.set(nx, ny, nz);
    // body roll: tumbles while fast, then settles lying down
    B.roll += B.rollVel * dt;
    if (grounded) B.rollVel *= Math.exp(-4 * dt);
    if (grounded && Math.abs(B.rollVel) < 1.5) {
      const target = Math.round((B.roll - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2;
      B.roll += (target - B.roll) * (1 - Math.exp(-6 * dt));
    }
    this._updateLooseBoard(dt);
    if (performance.now() / 1000 - B.start > P.bailRespawnDelay) {
      const s = this.lastSafe || this.spawn;
      this.respawnAt(s);
    }
  }

  // the board flies, bounces and slides on its own after a bail
  _updateLooseBoard(dt) {
    const B = this.bailInfo, p = B.boardPos, v = B.boardVel, w = B.boardSpin;
    v.y -= P.gravity * dt;
    const nx = p.x + v.x * dt, nz = p.z + v.z * dt;
    if (this.col.blocker(nx, nz, p.y + 0.1)) { v.x *= -0.4; v.z *= -0.4; }
    else { p.x = nx; p.z = nz; }
    p.y += v.y * dt;
    const g = this.col.ground(p.x, p.z, p.y + 0.3);
    const rest = g.h + 0.075;
    let onGround = false;
    if (p.y <= rest) {
      p.y = rest; onGround = true;
      if (v.y < 0) { v.y = -v.y * P2.boardBounce; if (v.y < 0.8) v.y = 0; w.multiplyScalar(0.55); }
      const f = Math.exp(-P2.boardFriction * dt);
      v.x *= f; v.z *= f;
    }
    // integrate spin
    const ang = w.length();
    if (ang > 1e-4) {
      const dq = this._dq || (this._dq = new THREE.Quaternion());
      dq.setFromAxisAngle(this._ax ? this._ax.copy(w).divideScalar(ang) : (this._ax = w.clone().divideScalar(ang)), ang * dt);
      B.boardQuat.premultiply(dq);
    }
    // once it's resting, settle flat (wheels up or down, whichever is closer)
    if (onGround && v.y === 0) {
      w.multiplyScalar(Math.exp(-6 * dt));
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(B.boardQuat);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(B.boardQuat);
      const yaw = Math.atan2(fwd.x, fwd.z);
      const target = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      if (up.y < 0) target.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
      B.boardQuat.slerp(target, 1 - Math.exp(-8 * dt));
    }
  }

  // ------------------------------------------------------------------ WALK
  enterWalk() {
    this.state = 'walk'; this.speed = 0; this.walkVy = 0;
    this.heading = this.modelYaw(); this.fakie = false;
    this.emit('walk', { on: true });
  }
  exitWalk() {
    this.state = 'ride'; this.speed = 0; this.fakie = false;
    this.emit('walk', { on: false });
  }
  updateWalk(dt) {
    const inp = this.input;
    const turn = (inp.held.left ? 1 : 0) - (inp.held.right ? 1 : 0);
    this.heading += turn * P.walkTurnRate * dt;
    const move = (inp.held.up ? 1 : 0) - (inp.held.down ? 0.6 : 0);
    const spd = move * (inp.held.shift ? P.runSpeed : P.walkSpeed);
    this.walkSpeed = Math.abs(spd);
    this.walkVy -= P.gravity * dt;
    const nx = this.pos.x + Math.sin(this.heading) * spd * dt;
    const nz = this.pos.z + Math.cos(this.heading) * spd * dt;
    const maxY = this.pos.y + P.walkStepUp;
    if (this.col.blocker(nx, nz, maxY)) { this.walkSpeed = 0; return; }
    const g = this.col.ground(nx, nz, maxY);
    let ny = this.pos.y + this.walkVy * dt;
    if (ny <= g.h || (this.walkVy <= 0 && ny - g.h < 0.08)) { ny = g.h; this.walkVy = 0; }
    this.pos.set(nx, ny, nz);
    this.normal.set(0, 1, 0);
  }

  // ------------------------------------------------------------------ RENDER SYNC
  // Called once per rendered frame after physics.
  sync(dt) {
    const sk = this.skater;
    let yaw = this.modelYaw();
    const up = this._up || (this._up = new THREE.Vector3(0, 1, 0));
    let n = this.normal, rate = 14;
    if (this.state === 'air' || this.state === 'grind') { n = up; rate = this.state === 'grind' ? 10 : 3; }
    if (this.state === 'walk') n = up;
    if (this.state === 'bail') yaw = this.bailInfo.yaw;
    if (this.state === 'ride' && this.powersliding) yaw += (this.fakie ? -1 : 1) * 1.25;
    if (this.state === 'grind' && this.grind.def.sideways) yaw += (this.grind.def.name === 'Lipslide' ? -1 : 1) * Math.PI / 2;
    // lean into carves: bank angle from the sideways (centripetal) acceleration
    let bank = 0;
    if (this.state === 'ride' && !this.powersliding) {
      bank = -Math.atan2(this.speed * (this.yawRate || 0), P.gravity);
      bank = clamp(bank, -P2.maxBank, P2.maxBank) * (this.fakie ? -1 : 1);
    }
    this.bankSmooth = (this.bankSmooth || 0) + (bank - (this.bankSmooth || 0)) * (1 - Math.exp(-8 * dt));
    if (this.state === 'bail') { n = up; rate = 20; }
    sk.setTransform(this.pos, yaw, n, dt, rate, this.bankSmooth);
    if (this.state === 'bail') sk.setLooseBoard(true, this.bailInfo.boardPos, this.bailInfo.boardQuat);
    else sk.setLooseBoard(false);
    // wheels keep spinning in the air and slowly stop
    if (this.state === 'ride') this.wheelSpeed = this.speed;
    else if (this.state === 'grind' || this.state === 'walk') this.wheelSpeed = 0;
    else this.wheelSpeed = (this.wheelSpeed || 0) * Math.exp(-1.5 * dt);
    const g = this.col.ground(this.pos.x, this.pos.z, this.pos.y + 0.05);
    sk.setBlob(this.pos.x, g.h, this.pos.z, this.pos.y - g.h);
    sk.animate(this.animState(), dt);
  }

  animState() {
    const A = this.air;
    return {
      mode: this.manual ? 'manual' : this.state,
      crouch: this.crouching ? 1 : (this.powersliding ? 0.5 : 0),
      lean: this.state === 'ride' ? this.lean : 0,
      pushPhase: this.pushPhase,
      flipAngle: A ? A.flipAngle : 0,
      shuvAngle: A ? A.shuvAngle : 0,
      boardLift: A ? (A.trick ? 0.22 : 0.12) * Math.min(1, A.time * 6) : 0,
      grab: !!(A && A.grab), grabHand: A && A.grab ? A.grab.hand : 'front',
      sideways: !!(this.grind && this.grind.def.sideways),
      manualPitch: this.grind ? -this.grind.def.pitch : (this.manual ? (this.manual.nose ? -0.3 : 0.3) + this.manual.b * 0.12 : 0),
      bailTime: this.bailInfo ? this.bailInfo.t : 0,
      bailRoll: this.bailInfo ? this.bailInfo.roll : 0,
      walkSpeed: this.walkSpeed,
      wheelSpeed: this.wheelSpeed || 0,
      landDip: this._takeDip(),
    };
  }
  _takeDip() { const d = this.landDip || 0; this.landDip = 0; return d;
  }

  // speed for the HUD (m/s)
  displaySpeed() {
    if (this.state === 'ride') return this.speed;
    if (this.state === 'walk') return this.walkSpeed;
    return Math.hypot(this.vel.x, this.vel.y, this.vel.z);
  }
}
