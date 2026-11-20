// =============================================================================
//  camera.js — two camera styles, switched with C:
//    follow : close chase cam behind the direction of travel
//    filmer : wider, lower "follow filmer" angle off to the side
//  Tweak distances / lag in config.CAMERA. Sensitivity scales how fast it swings.
// =============================================================================
import * as THREE from 'three';
import { CAMERA } from './config.js';

const dampAngle = (a, b, rate, dt) => {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * (1 - Math.exp(-rate * dt));
};

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'follow';
    this.yaw = 0;
    this.sensitivity = 1;
    this.target = new THREE.Vector3();
    this.desired = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.first = true;
    this.shake = 0;
    this._shakeOff = new THREE.Vector3();
  }

  // camera jolt (e.g. on a hard landing)
  addShake(amount) { this.shake = Math.min(0.35, this.shake + amount); }

  // C cycles: close follow → wide filmer → low fisheye filmer
  toggle() {
    const order = ['follow', 'filmer', 'fisheye', 'first'];
    this.mode = order[(order.indexOf(this.mode) + 1) % order.length];
    return this.mode;
  }
  snap() { this.first = true; }

  update(dt, player, col) {
    const cfg = CAMERA[this.mode];
    const p = player.pos;

    // which way should the camera face?
    let want = this.yaw;
    if (player.state === 'ride' || player.state === 'walk' || player.state === 'grind' || player.state === 'wallride') {
      want = player.state === 'grind' || player.state === 'wallride' ? Math.atan2(player.vel.x, player.vel.z) : player.heading;
      if (player.state === 'ride' && player.speed < 0.3) want = this.yaw; // don't swing when stopped
    } else if (player.state === 'air') {
      const h = Math.hypot(player.vel.x, player.vel.z);
      if (h > 3 && !(player.air && player.air.vert)) want = Math.atan2(player.vel.x, player.vel.z);
    }
    if (this.first) { this.yaw = want; }
    if (this.mode === 'first' && player.skater && player.skater._eyes) return this._firstPerson(dt, player, want, cfg);
    // walking: stay right behind the player so turning the camera = turning the player
    let lag = player.state === 'walk' ? Math.max(cfg.lag * 2.4, 12) : cfg.lag;
    // just rolled back down a ramp (fakie): glide round to the new direction over ~1 s
    // instead of whipping 180° in a blink
    if (player.reversedAt !== undefined && player.time - player.reversedAt < 1.6) lag = Math.min(lag, 1.4);
    this.yaw = dampAngle(this.yaw, want, lag * this.sensitivity, dt);
    // right-mouse orbit while skating (springs back when you let go)
    this.orbit = this.orbit || 0;
    if (!this.dragging) this.orbit *= Math.exp(-2.5 * dt);

    const fx = Math.sin(this.yaw + this.orbit), fz = Math.cos(this.yaw + this.orbit);
    // big airs: pull back and up a little so the whole jump and the landing stay in frame
    let air = 0;
    if (player.state === 'air') air = Math.min(1, Math.max(0, (p.y - col.ground(p.x, p.z, p.y).h - 1.2) / 4));
    this._air = (this._air || 0) + (air - (this._air || 0)) * (1 - Math.exp(-2.5 * dt));
    const dist = cfg.distance * (1 + 0.35 * this._air), hgt = cfg.height + 0.9 * this._air;
    this.desired.set(p.x - fx * dist, p.y + hgt, p.z - fz * dist);
    if (cfg.side) { this.desired.x += -fz * cfg.side; this.desired.z += fx * cfg.side; }
    // keep above the ground / ramps
    const g = col.ground(this.desired.x, this.desired.z, this.desired.y + 50);
    this.desired.y = Math.max(this.desired.y, g.h + CAMERA.minAboveGround);
    // OCCLUSION: walk the line from the skater's head to the camera; if a wall, building
    // or ramp is in the way, pull the camera in to just in front of it
    {
      const hx = p.x, hy = p.y + 1.3, hz = p.z;
      const dx = this.desired.x - hx, dy = this.desired.y - hy, dz = this.desired.z - hz;
      for (let k = 1; k <= 14; k++) {
        const t = k / 14, x = hx + dx * t, y = hy + dy * t, z = hz + dz * t;
        const b = col.blocker(x, z, y);
        if (b && b.type === 'box') {          // walls & buildings (ramps are terrain: the ground clamp handles them)
          const tb = Math.max(0.15, (k - 1.3) / 14);
          this.desired.set(hx + dx * tb, hy + dy * tb + 0.25 * (1 - tb), hz + dz * tb);
          this._occluded = 0.25;
          break;
        }
      }
      // never end up inside something: lift onto its top
      const inside = col.blocker(this.desired.x, this.desired.z, this.desired.y);
      if (inside && inside.type !== 'bounds') this.desired.y = col.ground(this.desired.x, this.desired.z, 1e4).h + CAMERA.minAboveGround;
    }

    if (this.first) this.camera.position.copy(this.desired);
    else this.camera.position.lerp(this.desired, 1 - Math.exp(-(this._occluded > 0 ? 22 : 9) * dt));
    if (this._occluded > 0) this._occluded -= dt;
    // small camera shake that dies away quickly
    if (this.shake > 0.001) {
      this._shakeOff.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(this.shake);
      this.camera.position.add(this._shakeOff);
      this.shake *= Math.exp(-9 * dt);
    }
    this.look.set(p.x, p.y + cfg.lookHeight, p.z);
    if (this.first) this.target.copy(this.look);
    else this.target.lerp(this.look, 1 - Math.exp(-16 * dt));
    this.camera.lookAt(this.target);

    // field of view widens a little with speed (sense of speed)
    const fov = cfg.fov + Math.min(12, player.displaySpeed() * 0.55);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-3 * dt));
      this.camera.updateProjectionMatrix();
    }
    this.first = false;
  }

  // FIRST PERSON: the camera is the rider's eyes (between the two eyeballs, a touch
  // forward), so it carries every real head movement — the push stroke, crouches,
  // landings, balance sway, bails. It looks where you're going, tipped down to see
  // the board and the ground ahead; right-mouse drag looks around.
  _firstPerson(dt, player, want, cfg) {
    const sk = player.skater, e0 = sk._eyes[0], e1 = sk._eyes[1];
    const a = this._fpA || (this._fpA = new THREE.Vector3()), b = this._fpB || (this._fpB = new THREE.Vector3());
    sk.root.updateMatrixWorld(true);
    e0.getWorldPosition(a); e1.getWorldPosition(b); a.add(b).multiplyScalar(0.5);
    this.yaw = dampAngle(this.yaw, want, (player.state === 'walk' ? 14 : 7) * this.sensitivity, dt);
    this.orbit = this.orbit || 0;
    if (!this.dragging) this.orbit *= Math.exp(-2.5 * dt);
    const yaw = this.yaw + this.orbit;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    a.x += fx * 0.11; a.z += fz * 0.11; a.y += 0.015;    // just in front of the eyes (head & shoulders stay behind the near plane)
    const pitchWant = player.state === 'walk' ? -0.08 : player.state === 'air' ? -0.42 : -0.3;
    this._fpPitch = (this._fpPitch ?? pitchWant) + (pitchWant - (this._fpPitch ?? pitchWant)) * (1 - Math.exp(-4 * dt));
    const cp = Math.cos(this._fpPitch);
    this.camera.position.copy(a);
    if (this.shake > 0.001) { this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4; this.shake *= Math.exp(-9 * dt); }
    this.camera.lookAt(a.x + fx * cp, a.y + Math.sin(this._fpPitch), a.z + fz * cp);
    const fov = cfg.fov + Math.min(10, player.displaySpeed() * 0.4);
    if (Math.abs(this.camera.fov - fov) > 0.05) { this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-3 * dt)); this.camera.updateProjectionMatrix(); }
    this.first = false;
  }
}
