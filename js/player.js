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
import { QUICK_TRICKS, FLIP_TRICKS } from './config.js';
import { PHYSICS as P, SHUVITS, GRABS, GRAB_POINTS, SPIN_POINTS_PER_180, BIG_AIR, GAPS, POWERSLIDE,
  GRINDS, GRIND, GRIND_POINTS, MANUALS, MANUAL_POINTS, MANUAL_BALANCE as MB } from './config.js';
import { resolveFlick, spinLabel } from './tricks.js';
import { PHYSICS2 as P2, PUSH } from './config.js';

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
    if (this.ragdoll && this.ragdoll.active) this.ragdoll.clear(this.skater);
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
      if (this.state === 'ride' && this.speed < 4) this.enterWalk();
      else if (this.state === 'walk') {
        if (this.walkVy !== 0) this.wantBoard = true;   // mid-jump: hop on as you land
        else this.exitWalk();
      }
    }
    if (inp.pressed.respawn && this.state !== 'bail') this.respawnLast();
    if (inp.pressed.setSpot) this.emit('spotSet', { ok: this.setCustomSpot() });

    const canPop = this.state === 'ride' || this.state === 'grind';
    if (inp.pressed.pop) { this.spaceStart = realNow; this.crouching = true; }
    if (!inp.held.pop && this.crouching && inp.released.pop) {
      this.crouching = false;
      if (canPop) {
        // forgiving flicks: keys pressed a moment before Space, together with it, or slowly all count
        const rel = inp.releasedAt.pop || realNow;   // keys pressed AFTER letting go of Space don't count
        const dirs = inp.dirEvents.filter((e) => e.t >= this.spaceStart - P.flickPreWindow && e.t >= realNow - P.flickWindow && e.t <= rel + 0.005).map((e) => e.dir);
        this.wantPop = { hold: realNow - this.spaceStart, dirs };
      }
    }
    if (!inp.held.pop) this.crouching = false;

    // one-key tricks: on the ground they pop straight into the trick; just after
    // take-off they turn the ollie into a late flip
    for (const key of Object.keys(QUICK_TRICKS)) {
      if (!inp.pressed[key]) continue;
      const q = QUICK_TRICKS[key];
      const def = typeof q === 'string' ? FLIP_TRICKS.find((t) => t.name === q) : q;
      if (canPop) {
        const hold = this.crouching ? realNow - this.spaceStart : 0.45;
        this.crouching = false;
        this.wantPop = { hold, dirs: [], forced: def, holdKey: key };
      } else if (this.state === 'air') { this.air.lateTrick = def; this.air.lateKey = key; }
    }

    // while grinding (and not winding up a pop): arrows / K switch the grind
    if (this.state === 'grind' && !this.crouching) {
      if (inp.pressed.up) this.switchGrind(GRINDS.up);
      else if (inp.pressed.down) this.switchGrind(GRINDS.down);
      else if (inp.pressed.left) this.switchGrind(GRINDS.left);
      else if (inp.pressed.right) this.switchGrind(GRINDS.right);
      else if (inp.pressed.grind) this.switchGrind(inp.held.up || inp.held.down || inp.held.left || inp.held.right ? GRINDS[inp.heldDir()] : GRINDS.none);
    }

    // L = manual on / off (L + ↑ = nose manual); in the air it queues a manual for landing
    if (inp.pressed.manual) {
      if (this.state === 'ride') {
        if (this.manual) this.endManual();
        else if (this.speed > 0.8) this.startManual(inp.held.up);
      } else if (this.state === 'air') this.air.manualQueued = true;
    }

    if (this.state === 'ride' && !this.crouching && !this.manual) {
      // a tap starts one push stroke (or queues the next); holding keeps pushing
      if (inp.pressed.up) { if (this.pushPhase < 0) this.wantPush = true; else this.pushQueued = true; }
      else if (inp.held.up && this.pushPhase < 0) this.wantPush = true;
    }
  }

  // ------------------------------------------------------------------ fixed-step update
  update(dt) {
    this.time += dt;
    this.updatePushStroke(dt);
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

  // A push is a stroke: the foot plants, sweeps back (speed builds while it's on
  // the ground), then lifts and returns to the board. Each push adds less the
  // faster you already go, so speed tops out naturally around pushMaxSpeed.
  updatePushStroke(dt) {
    if (this.pushPhase < 0) return;
    const ok = this.state === 'ride' && !this.manual && !this.crouching && this.normal.y > 0.97;
    if (!ok) { this.pushPhase = -1; this.pushQueued = false; return; }
    const prev = this.pushPhase;
    this.pushPhase += dt / PUSH.cycle;
    const p = this.pushPhase;
    if (prev < PUSH.contactStart && p >= PUSH.contactStart) this.emit('push');
    if (p > PUSH.contactStart && p < PUSH.contactEnd) {
      const falloff = Math.max(0, 1 - Math.pow(this.speed / P.pushMaxSpeed, 2));
      this.speed += PUSH.speedPerPush / ((PUSH.contactEnd - PUSH.contactStart) * PUSH.cycle) * falloff * dt;
    }
    if (p >= 1) {
      this.pushPhase = -1;
      if (this.pushQueued || this.input.held.up) this.pushPhase = 0; // keep pushing
      this.pushQueued = false;
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
    if (this.sketch) this.sketch = Math.max(0, this.sketch - dt * 1.4);   // wobble after a sketchy landing
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
      if (this.pushPhase < 0 && n.y > 0.97 && !this.crouching) this.pushPhase = 0;
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
    let leaving = ny > g.h + P.launchTolerance || away > P.lipLaunchSpeed;
    if (leaving && this.state === 'ride') {
      // DROP-IN: rolling off a deck/lip onto a ramp that falls away in front of you
      // keeps the wheels on the ramp (you lean into it), instead of flying off
      const hs = Math.hypot(this.vel.x, this.vel.z) || 1;
      const slopeAlong = (g.gx * this.vel.x + g.gz * this.vel.z) / hs;   // < 0 = ramp goes down ahead
      const onRamp = g.surf ? (g.surf.type === 'quarter' || g.surf.type === 'wedge' || g.surf.type === 'corner') : !!g.tag;
      if (onRamp && slopeAlong < -0.35 && this.vel.y < 1.0 && this.speed < P2.dropInMaxSpeed && ny - g.h < P2.dropInMaxGap) {
        leaving = false;
        if (!this._droppingIn) this.emit('dropIn');
        this._droppingIn = 0.3;
      }
    }
    if (this._droppingIn) this._droppingIn = Math.max(0, this._droppingIn - dt);
    if (leaving) {
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
    const def = popInfo.forced || resolveFlick(popInfo.dirs);
    this.startAirTrick(def, popInfo.holdKey);
  }

  startAirTrick(def, holdKey) {
    const A = this.air;
    const entry = { name: def.name, base: def.name, points: def.points };
    A.tricks.push(entry);
    // holdKey: action that, while held, keeps the board flipping (Double / Triple)
    if (def.time > 0) A.trick = { def, t: 0, loops: 0, entry, holdKey: holdKey || (def.flips ? 'down' : null) };
    this.emit('trick', { name: def.name });
  }

  // still holding the trick key when a flip finishes → flip again (if there's air)
  _extendFlip(A) {
    const T = A.trick;
    if (!T.def.flips || !T.holdKey || !this.input.held[T.holdKey] || T.loops >= P2.maxExtraFlips) return false;
    const g = this.col.ground(this.pos.x, this.pos.z, this.pos.y + 0.05);
    const h = this.pos.y - g.h, vy = this.vel.y;
    const tLand = (vy + Math.sqrt(vy * vy + 2 * P.gravity * Math.max(0, h))) / P.gravity;
    if (tLand < T.def.time * 1.1) return false;               // not enough air left for another full flip
    T.loops++; T.t = 0;
    const base = T.def.name.replace(/^Double /, '');
    T.entry.name = ['', 'Double ', 'Triple '][T.loops] + base;
    T.entry.base = T.entry.name;
    T.entry.points = Math.round(T.def.points * (1 + P2.extraFlipPoints * T.loops));
    this.emit('trick', { name: T.entry.name });
    return true;
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
    this._predictLanding();
    if (this.assist) this._landingAssist(dt, inp);

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

  // where / when will we land? (used to tilt the board to the landing ramp mid-air)
  _predictLanding() {
    const A = this.air;
    if (this.vel.y > 0.5) { A.tLand = 9; return; }
    const g = this.col.ground(this.pos.x, this.pos.z, this.pos.y + 0.05);
    const vy = -this.vel.y, h = this.pos.y - g.h;
    const t = (-vy + Math.sqrt(vy * vy + 2 * P.gravity * Math.max(0, h))) / P.gravity;
    const lg = this.col.ground(this.pos.x + this.vel.x * t, this.pos.z + this.vel.z * t, this.pos.y + 0.05);
    A.tLand = t;
    A.landN = A.landN || new THREE.Vector3();
    A.landN.set(lg.nx, lg.ny, lg.nz);
  }

  // LANDING ASSIST: just before touchdown, straighten a slightly crooked board
  // (if you're not spinning), and gently steer toward a landing ramp nearby.
  _landingAssist(dt, inp) {
    const A = this.air;
    if (A.time < 0.12 || this.vel.y > 0) return;
    const g = this.col.ground(this.pos.x, this.pos.z, this.pos.y + 0.05);
    const h = this.pos.y - g.h;
    const vy = -this.vel.y;
    const t = (-vy + Math.sqrt(vy * vy + 2 * P.gravity * Math.max(0, h))) / P.gravity; // ≈ time to land
    const spinning = (inp.held.left || inp.held.right) && !inp.held.grind && !inp.held.shift;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    // nearly-finished flip: help it finish before the wheels touch down
    if (A.trick && t < 0.3) {
      const p = A.trick.t / A.trick.def.time;
      if (p > 0.45) {
        const need = (1 - p) * A.trick.def.time;
        if (need > t * 0.9) A.trick.t += (need - t * 0.9) * Math.min(1, dt / Math.max(t, dt)) + dt * 0.5;
      }
    }
    if (t < 0.35 && !spinning && hs > 0.8 && !A.trick) {
      const travel = Math.atan2(this.vel.x, this.vel.z);
      let d = wrapAngle(A.yaw - travel);
      if (Math.abs(d) > Math.PI / 2) d = wrapAngle(d - Math.PI);           // fakie is fine too
      if (Math.abs(d) < P2.assistAlignDeg * Math.PI / 180) {
        const step = Math.min(Math.abs(d), P2.assistAlignRate * dt);
        A.yaw -= Math.sign(d) * step;
      }
    }
    // ramp magnet: once per jump, if you'd land on flat just before/after a
    // landing ramp that slopes away from you, adjust your carry to reach it
    if (!A.magnet && t < 0.6 && hs > 2) {
      A.magnet = true;
      const dx = this.vel.x / hs, dz = this.vel.z / hs;
      const lx = this.pos.x + this.vel.x * t, lz = this.pos.z + this.vel.z * t;
      const here = this.col.ground(lx, lz, this.pos.y);
      if (here.ny > 0.985) {
        let best = null;
        for (let k = -P2.assistMagnet; k <= P2.assistMagnet; k += 0.2) {
          const q = this.col.ground(lx + dx * k, lz + dz * k, this.pos.y);
          const slopeAlong = q.gx * dx + q.gz * dz;
          if (slopeAlong < -0.15 && (!best || Math.abs(k) < Math.abs(best))) best = k;
        }
        if (best !== null) {
          const f = clamp((hs * t + best + 0.4) / (hs * t), 0.8, 1.2);
          this.vel.x *= f; this.vel.z *= f;
        }
      }
    }
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
      if (p >= 1 && !this._extendFlip(A)) { A.trick = null; A.flipAngle = 0; A.shuvAngle = 0; }
    }
    // --- late flip: a one-key trick right after take-off replaces the plain ollie
    if (A.lateTrick) {
      const def = A.lateTrick; A.lateTrick = null;
      const plain = A.tricks.length === 0 || (A.tricks.length === 1 && (A.tricks[0].name === 'Ollie' || A.tricks[0].name === 'Nollie'));
      if (!A.trick && !A.grab && A.time <= P.lateFlipWindow && plain) {
        A.tricks = [];
        this.startAirTrick(def, A.lateKey);
      }
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
    let keep = 1;
    if (vth > 0.8) {
      // You roll the way the BOARD points (like real skating): if you land a bit
      // turned, the wheels steer you that way and you lose some speed.
      const travel = Math.atan2(vtx, vtz);
      const diff = Math.abs(wrapAngle(A.yaw - travel));
      this.fakie = diff > Math.PI / 2;
      const facing = this.fakie ? A.yaw + Math.PI : A.yaw;
      const off = Math.abs(wrapAngle(facing - travel));
      this.heading = facing;
      keep = Math.cos(off);
      if (off > P2.landClean * Math.PI / 180) { this.sketch = Math.min(1, 0.35 + off); this.emit('sketchy', { off }); }
    } else {
      this.heading = A.yaw; this.fakie = false;
    }
    this.speed = Math.hypot(vtx, vty, vtz) * P.landSpeedKeep * keep;
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

  // how crooked (radians) a landing may be at this speed before you bail
  landTolerance(speed) {
    const t = clamp((speed - P2.landSlowSpeed) / (P2.landFastSpeed - P2.landSlowSpeed), 0, 1);
    return lerp(P2.landMaxSlow, P2.landMaxFast, t) * Math.PI / 180 + 1e-6;
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
      if (off > this.landTolerance(vth)) return 'Landed sideways!';
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
    const def = this.chooseGrind(r);
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

  // Which grind you lock into:
  //   K + direction (any time) → that grind (K alone = Smith)
  //   holding ↑ / ↓ as you land on it → Nosegrind / 5-0
  //   board turned sideways to the rail (e.g. a 90° spin onto it) → Boardslide
  //   (→ held = Lipslide), otherwise 50-50
  chooseGrind(r) {
    const inp = this.input, dir = inp.heldDir();
    if (inp.held.grind) return GRINDS[dir] || GRINDS.none;
    const railYaw = Math.atan2(r.dx, r.dz);
    const d = Math.abs(wrapAngle((this.air ? this.air.yaw : this.heading) - railYaw));
    const off = Math.min(d, Math.PI - d);
    if (off > 50 * Math.PI / 180) return dir === 'right' ? GRINDS.right : GRINDS.left;
    if (dir === 'up') return GRINDS.up;
    if (dir === 'down') return GRINDS.down;
    return GRINDS.auto;
  }

  // switch grinds mid-rail (arrow keys while grinding) — each switch adds to the combo
  switchGrind(def) {
    const G = this.grind;
    if (!G || G.def === def) return;
    const pts = Math.round(GRIND_POINTS.base * 0.5 + GRIND_POINTS.perSecond * G.time);
    this.emit('grindEnd', { name: G.def.name, base: G.def.name, time: G.time, tag: G.rail.tag, points: pts, switched: true });
    G.def = def; G.time = 0;
    this.emit('grindStart', { name: def.name, tag: G.rail.tag });
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
    // real physics ragdoll (Rapier) if it's loaded; otherwise the simple tumble below
    this.bailInfo.ragdoll = !!(this.ragdoll && this.ragdoll.ready && this.ragdoll.spawn(this.skater, this.vel));
    this.emit('bail', { reason });
  }

  updateBail(dt) {
    const B = this.bailInfo;
    B.t += dt;
    if (B.ragdoll) {
      this.ragdoll.step(dt);
      this.ragdoll.pelvisPosition(this.pos);   // the camera follows the falling body
      if (performance.now() / 1000 - B.start > P.bailRespawnDelay) this.respawnAt(this.lastSafe || this.spawn);
      return;
    }
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
  // Off the board: the board stays on the ground where you stepped off
  enterWalk() {
    this.groundBoard = { pos: this.pos.clone().add(new THREE.Vector3(Math.sin(this.heading) * 0.5, 0.075, Math.cos(this.heading) * 0.5)),
      quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading) };
    this.moveTime = 0; this.wantBoard = false;
    this.state = 'walk'; this.walkVel = { x: Math.sin(this.heading) * this.speed * 0.5, z: Math.cos(this.heading) * this.speed * 0.5 };
    this.speed = 0; this.walkVy = 0;
    this.heading = this.modelYaw(); this.fakie = false;
    this.emit('walk', { on: true });
  }
  // Back on the board (E): you drop it and jump on, keeping your running speed
  exitWalk() {
    if (this.walkVy !== 0) { this.wantBoard = true; return; }
    // throw the board down and hop on — you land on it rolling with your run speed
    this.state = 'ride'; this.speed = Math.min(5.2, this.walkSpeed * 0.95); this.fakie = false;
    this.groundBoard = null; this.pushPhase = -1;
    const g = this.col.ground(this.pos.x, this.pos.z, this.pos.y + 0.3);
    this.normal.set(g.nx, g.ny, g.nz); this.groundTag = g.tag; this.groundVert = false;
    this._tangent(this.heading, this.normal, this.vel).multiplyScalar(this.speed);
    this.vel.y += 2.3;
    this.launch(true);
    this.air.hop = true;
    this.emit('walk', { on: false });
  }
  // Walking / running off the board — third-person controls where the camera
  // stays behind you: A/D (or right-mouse drag) TURN you and the camera turns
  // with you, W runs forward, S backs up. Turning has a little momentum,
  // Space jumps (with a short grace period after running off a ledge and a
  // buffered press just before landing), you slide along walls.
  updateWalk(dt) {
    const inp = this.input;
    const turnIn = (inp.held.left ? 1 : 0) - (inp.held.right ? 1 : 0);
    this.walkTurnVel = this.walkTurnVel || 0;
    this.walkTurnVel += clamp(turnIn * P.walkTurnRate - this.walkTurnVel, -14 * dt, 14 * dt);
    this.heading += this.walkTurnVel * dt + (this.mouseTurn || 0);
    this.mouseTurn = 0;
    const move = (inp.held.up ? 1 : 0) - (inp.held.down ? 0.55 : 0);
    this.moveTime = move > 0 ? (this.moveTime || 0) + dt : 0;
    const running = inp.held.shift || this.moveTime > P.autoRunTime;
    const target = move > 0 ? (running ? P.runSpeed : P.walkSpeed) * move : move * P.walkSpeed;
    this.walkVel = this.walkVel || { x: 0, z: 0 };
    const V = this.walkVel, onGround = this.walkVy === 0;
    if (onGround) this.coyote = 0.12; else this.coyote = Math.max(0, (this.coyote || 0) - dt);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const tx = fx * target - V.x, tz = fz * target - V.z, tl = Math.hypot(tx, tz);
    const rate = (Math.abs(target) > 0.01 ? P2.walkAccel : P2.walkDecel) * (onGround ? 1 : 0.3) * dt;
    if (tl > 0) { const k = Math.min(1, rate / tl); V.x += tx * k; V.z += tz * k; }
    this.walkSpeed = Math.hypot(V.x, V.z);
    // jump: buffered press + coyote time
    if (inp.pressed.pop) this.jumpBuffer = 0.15; else this.jumpBuffer = Math.max(0, (this.jumpBuffer || 0) - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.walkVy = P2.jumpSpeed + Math.min(0.6, this.walkSpeed * 0.08);   // a running jump goes a bit higher
      this.jumpBuffer = 0; this.coyote = 0;
      this.emit('jump');
    }
    this.walkVy -= P.gravity * dt;
    let nx = this.pos.x + V.x * dt, nz = this.pos.z + V.z * dt;
    const maxY = this.pos.y + (onGround ? P.walkStepUp : 0.1);
    const blk = this.col.blocker(nx, nz, maxY);
    if (blk) {                                       // slide along walls
      const n = this.col.wallNormal(blk, this.pos.x, this.pos.z, this._wn || (this._wn = {}));
      const vn = V.x * n.x + V.z * n.z;
      if (vn < 0) { V.x -= vn * n.x; V.z -= vn * n.z; }
      nx = this.pos.x + V.x * dt; nz = this.pos.z + V.z * dt;
      if (this.col.blocker(nx, nz, maxY)) { nx = this.pos.x; nz = this.pos.z; V.x = V.z = 0; }
    }
    const g = this.col.ground(nx, nz, maxY);
    let ny = this.pos.y + this.walkVy * dt;
    if (ny <= g.h || (this.walkVy <= 0 && ny - g.h < 0.06)) {
      if (this.walkVy < -9) this.emit('wall', { speed: -this.walkVy });   // heavy landing thud
      if (this.walkVy < -4) this.landDip = Math.min(1, -this.walkVy / 12);
      ny = g.h; this.walkVy = 0;
    }
    this.pos.set(nx, ny, nz);
    this.normal.set(0, 1, 0);
    if (this.wantBoard && this.walkVy === 0) { this.wantBoard = false; this.exitWalk(); return; }
  }

  // ------------------------------------------------------------------ RENDER SYNC
  // Called once per rendered frame after physics.
  sync(dt) {
    const sk = this.skater;
    if (this.state === 'bail' && this.bailInfo.ragdoll) {   // physics owns the body during a ragdoll bail
      this.ragdoll.apply(sk);
      const g = this.col.ground(this.pos.x, this.pos.z, this.pos.y + 0.05);
      sk.setBlob(this.pos.x, g.h, this.pos.z, this.pos.y - g.h);
      return;
    }
    let yaw = this.modelYaw();
    const up = this._up || (this._up = new THREE.Vector3(0, 1, 0));
    let n = this.normal, rate = 14;
    if (this.state === 'air' || this.state === 'grind') { n = up; rate = this.state === 'grind' ? 10 : 3; }
    // mid-air: as you come down onto a ramp the board tilts to match it, so you
    // can actually land drop-ins and transitions
    if (this.state === 'air' && this.air.landN && this.air.tLand < 0.45 && this.air.landN.y < 0.995) { n = this.air.landN; rate = 9; }
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
    else if (this.state === 'walk' && this.groundBoard) sk.setLooseBoard(true, this.groundBoard.pos, this.groundBoard.quat);
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
      sketch: this.sketch || 0,
      walkAir: this.state === 'walk' && this.walkVy !== 0,
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
