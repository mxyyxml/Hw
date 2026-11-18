// =============================================================================
//  replay.js — records the last few seconds of the skater (every animated node:
//  board, trucks' pivot, body, all 13 bones, the loose board during bails) into
//  a fixed ring buffer, and plays it back with a cinematic camera that cuts
//  between a low tracking shot, a slow orbit and a fixed tripod angle.
//  Press Y to watch the replay, Y / Esc to return.
// =============================================================================
import * as THREE from 'three';

const SECONDS = 12, RATE = 60, FRAMES = SECONDS * RATE, PER = 7;   // pos xyz + quat xyzw

export class Replay {
  constructor(skater, camera) {
    this.sk = skater; this.camera = camera;
    const s = skater;
    this.nodes = [s.root, s.manualPivot, s.manualInner, s.boardHolder, s.board, s.bodyBase, s.body, ...s.bones, s.looseBoard];
    this.buf = new Float32Array(FRAMES * (this.nodes.length * PER + 2));
    this.stride = this.nodes.length * PER + 2;           // + loose board visible + wheel angle
    this.count = 0; this.head = 0; this.acc = 0;
    this.playing = false;
  }

  // call once per rendered frame while playing normally
  record(dt) {
    if (this.playing) return;
    this.acc += dt;
    if (this.acc < 1 / RATE) return;
    this.acc %= 1 / RATE;
    const o = this.head * this.stride, b = this.buf;
    this.nodes.forEach((n, i) => {
      const k = o + i * PER;
      b[k] = n.position.x; b[k + 1] = n.position.y; b[k + 2] = n.position.z;
      b[k + 3] = n.quaternion.x; b[k + 4] = n.quaternion.y; b[k + 5] = n.quaternion.z; b[k + 6] = n.quaternion.w;
    });
    b[o + this.stride - 2] = this.sk.looseBoard.visible ? 1 : 0;
    b[o + this.stride - 1] = this.sk.wheelAngle || 0;
    this.head = (this.head + 1) % FRAMES;
    this.count = Math.min(FRAMES, this.count + 1);
  }

  _apply(f) {
    const o = f * this.stride, b = this.buf;
    this.nodes.forEach((n, i) => {
      const k = o + i * PER;
      n.position.set(b[k], b[k + 1], b[k + 2]);
      n.quaternion.set(b[k + 3], b[k + 4], b[k + 5], b[k + 6]);
    });
    this.sk.looseBoard.visible = b[o + this.stride - 2] > 0.5;
    this.sk.board.visible = !this.sk.looseBoard.visible;
    for (const w of this.sk.wheels) w.rotation.x = b[o + this.stride - 1];
  }

  start() {
    if (this.count < RATE) return false;
    this.playing = true; this.t = 0;
    this.camState = { fov: this.camera.fov, pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
    // keep "now" to restore afterwards
    this.nowFrame = (this.head - 1 + FRAMES) % FRAMES;
    return true;
  }
  stop() {
    if (!this.playing) return;
    this.playing = false;
    this._apply(this.nowFrame);
    this.camera.fov = this.camState.fov; this.camera.position.copy(this.camState.pos); this.camera.quaternion.copy(this.camState.quat);
    this.camera.updateProjectionMatrix();
  }

  // advance playback; returns false when it has finished
  update(dt) {
    if (!this.playing) return false;
    this.t += dt;
    const dur = this.count / RATE;
    if (this.t >= dur) { this.stop(); return false; }
    const f = Math.floor(this.t * RATE);
    const frame = (this.head - this.count + f + FRAMES) % FRAMES;
    this._apply(frame);
    this.sk.root.updateMatrixWorld(true);
    // cinematic camera: cut between three shots every ~3 s
    const p = this.sk.root.position, shot = Math.floor(this.t / 3) % 3, u = (this.t % 3) / 3;
    const cam = this.camera;
    if (shot === 0) {            // low tracking shot from the side, like a filmer on a board
      if (!this._trk || this._trkShot !== Math.floor(this.t / 3)) { this._trk = new THREE.Vector3(2.2, 0.35, 1.2); this._trkShot = Math.floor(this.t / 3); }
      cam.position.set(p.x + this._trk.x, p.y + this._trk.y, p.z + this._trk.z);
      cam.fov = 70;
    } else if (shot === 1) {     // slow orbit
      const a = this.t * 0.45;
      cam.position.set(p.x + Math.sin(a) * 4.2, p.y + 1.6, p.z + Math.cos(a) * 4.2);
      cam.fov = 50;
    } else {                     // fixed tripod: stays put where the cut happened
      if (this._triShot !== Math.floor(this.t / 3)) { this._tri = new THREE.Vector3(p.x - 5, p.y + 1.2, p.z + 5); this._triShot = Math.floor(this.t / 3); }
      cam.position.copy(this._tri);
      cam.fov = 40 - u * 8;      // slow push-in
    }
    cam.lookAt(p.x, p.y + 0.9, p.z);
    cam.updateProjectionMatrix();
    return true;
  }
}
