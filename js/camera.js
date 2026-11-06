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

  toggle() { this.mode = this.mode === 'follow' ? 'filmer' : 'follow'; return this.mode; }
  snap() { this.first = true; }

  update(dt, player, col) {
    const cfg = CAMERA[this.mode];
    const p = player.pos;

    // which way should the camera face?
    let want = this.yaw;
    if (player.state === 'ride' || player.state === 'walk' || player.state === 'grind') {
      want = player.state === 'grind' ? Math.atan2(player.vel.x, player.vel.z) : player.heading;
      if (player.state === 'ride' && player.speed < 0.3) want = this.yaw; // don't swing when stopped
    } else if (player.state === 'air') {
      const h = Math.hypot(player.vel.x, player.vel.z);
      if (h > 3 && !(player.air && player.air.vert)) want = Math.atan2(player.vel.x, player.vel.z);
    }
    if (this.first) { this.yaw = want; }
    this.yaw = dampAngle(this.yaw, want, cfg.lag * this.sensitivity, dt);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.desired.set(p.x - fx * cfg.distance, p.y + cfg.height, p.z - fz * cfg.distance);
    if (cfg.side) { this.desired.x += -fz * cfg.side; this.desired.z += fx * cfg.side; }
    // keep above the ground / ramps
    const g = col.ground(this.desired.x, this.desired.z, this.desired.y + 50);
    this.desired.y = Math.max(this.desired.y, g.h + CAMERA.minAboveGround);

    if (this.first) this.camera.position.copy(this.desired);
    else this.camera.position.lerp(this.desired, 1 - Math.exp(-9 * dt));
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
}
