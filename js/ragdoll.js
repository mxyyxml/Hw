// =============================================================================
//  ragdoll.js — real physics for bails, using the Rapier engine
//  (github.com/dimforge/rapier, Apache-2.0).
//
//  Riding stays on our own tuned skateboard controller (player.js) — like most
//  skate games, board handling is custom. But when you BAIL, the skater turns
//  into a physics ragdoll: 14 rigid bodies (pelvis, chest, head, arms, legs,
//  feet) linked by joints with human limits (knees and elbows only bend one
//  way), tumbling against the real park geometry. The board becomes its own
//  rigid body and bounces / slides away.
// =============================================================================
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { B } from './body.js';

// collision groups: (membership << 16) | filter
const WORLD = (0x0001 << 16) | 0xffff;
const RAG = (0x0002 << 16) | 0x0001 | 0x0004;   // ragdoll parts hit the world + board, not each other
const BOARD = (0x0004 << 16) | 0x0001 | 0x0002;

// collider per bone (shapes are offset along the bone, in the bone's frame)
const PARTS = {
  [B.hips]:  { shape: 'box', size: [0.15, 0.075, 0.1], off: [0, 0.01, 0] },
  [B.torso]: { shape: 'capsule', hh: 0.12, r: 0.13, off: [0, 0.26, 0] },
  [B.head]:  { shape: 'ball', r: 0.12, off: [0, 0.2, 0.01] },
  [B.shL]: { shape: 'capsule', hh: 0.1, r: 0.05, off: [0, -0.15, 0] },
  [B.shR]: { shape: 'capsule', hh: 0.1, r: 0.05, off: [0, -0.15, 0] },
  [B.elL]: { shape: 'capsule', hh: 0.12, r: 0.045, off: [0, -0.17, 0] },
  [B.elR]: { shape: 'capsule', hh: 0.12, r: 0.045, off: [0, -0.17, 0] },
  [B.legL]: { shape: 'capsule', hh: 0.13, r: 0.078, off: [0, -0.21, 0] },
  [B.legR]: { shape: 'capsule', hh: 0.13, r: 0.078, off: [0, -0.21, 0] },
  [B.kneeL]: { shape: 'capsule', hh: 0.15, r: 0.058, off: [0, -0.21, 0] },
  [B.kneeR]: { shape: 'capsule', hh: 0.15, r: 0.058, off: [0, -0.21, 0] },
  [B.footL]: { shape: 'box', size: [0.05, 0.035, 0.12], off: [0, -0.03, 0.035] },
  [B.footR]: { shape: 'box', size: [0.05, 0.035, 0.12], off: [0, -0.03, 0.035] },
};
// [parent, child, type, limits]  revolute joints bend around the bone's X axis
const JOINTS = [
  [B.hips, B.torso, 'ball'], [B.torso, B.head, 'ball'],
  [B.torso, B.shL, 'ball'], [B.torso, B.shR, 'ball'],
  [B.shL, B.elL, 'hinge', [-2.5, 0.05]], [B.shR, B.elR, 'hinge', [-2.5, 0.05]],
  [B.hips, B.legL, 'ball'], [B.hips, B.legR, 'ball'],
  [B.legL, B.kneeL, 'hinge', [-0.05, 2.5]], [B.legR, B.kneeR, 'hinge', [-0.05, 2.5]],
  [B.kneeL, B.footL, 'hinge', [-0.7, 0.6]], [B.kneeR, B.footR, 'hinge', [-0.7, 0.6]],
];
const PARENT = {};
for (const [p, c] of JOINTS) PARENT[c] = p;

export class Ragdoll {
  constructor() { this.ready = false; this.active = false; this.bodies = []; this.board = null; }

  // worldGroup: the park's merged meshes (world-space vertices) → one static trimesh each
  async init(worldGroup, gravity) {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    for (const mesh of worldGroup.children) {
      if (mesh.userData.cat === 'foliage') continue;             // leaves don't block falling bodies
      const pos = mesh.geometry.attributes.position.array;
      const idx = new Uint32Array(pos.length / 3);
      for (let i = 0; i < idx.length; i++) idx[i] = i;
      const desc = RAPIER.ColliderDesc.trimesh(new Float32Array(pos), idx)
        .setCollisionGroups(WORLD).setFriction(0.9).setRestitution(0.05);
      this.world.createCollider(desc);
    }
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._m = new THREE.Matrix4();
    this.ready = true;
  }

  // Turn the skater into a ragdoll, starting from its current pose and velocity
  spawn(skater, vel) {
    if (!this.ready) return false;
    this.clear(skater);
    skater.root.updateMatrixWorld(true);
    const bones = skater.bones;
    this.bodies = bones.map((bone, i) => {
      bone.matrixWorld.decompose(this._p, this._q, this._s);
      const spin = 2.5;
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(this._p.x, this._p.y, this._p.z)
        .setRotation({ x: this._q.x, y: this._q.y, z: this._q.z, w: this._q.w })
        .setLinvel(vel.x, vel.y + 1.0, vel.z)
        .setAngvel({ x: (Math.random() - 0.5) * spin, y: (Math.random() - 0.5) * spin, z: (Math.random() - 0.5) * spin })
        .setLinearDamping(0.08).setAngularDamping(0.9).setCcdEnabled(true));
      const P = PARTS[i];
      let c;
      if (P.shape === 'box') c = RAPIER.ColliderDesc.cuboid(...P.size);
      else if (P.shape === 'ball') c = RAPIER.ColliderDesc.ball(P.r);
      else c = RAPIER.ColliderDesc.capsule(P.hh, P.r);
      c.setTranslation(...P.off).setCollisionGroups(RAG).setFriction(0.8).setRestitution(0.08).setDensity(985);
      this.world.createCollider(c, body);
      return body;
    });
    // joints: the child's joint position, seen from the parent bone
    for (const [p, c, type, lim] of JOINTS) {
      const a = bones[c].position;
      const anchor1 = { x: a.x, y: a.y, z: a.z }, anchor2 = { x: 0, y: 0, z: 0 };
      let data;
      if (type === 'hinge') {
        data = RAPIER.JointData.revolute(anchor1, anchor2, { x: 1, y: 0, z: 0 });
        data.limitsEnabled = true; data.limits = lim;
      } else data = RAPIER.JointData.spherical(anchor1, anchor2);
      this.world.createImpulseJoint(data, this.bodies[p], this.bodies[c], true);
    }
    // the board flies off on its own
    skater.board.matrixWorld.decompose(this._p, this._q, this._s);
    this.board = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(this._p.x, this._p.y, this._p.z)
      .setRotation({ x: this._q.x, y: this._q.y, z: this._q.z, w: this._q.w })
      .setLinvel(vel.x * 1.15 + (Math.random() - 0.5) * 2, Math.max(vel.y, 0) + 2 + Math.random(), vel.z * 1.15 + (Math.random() - 0.5) * 2)
      .setAngvel({ x: (Math.random() - 0.5) * 16, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 16 })
      .setAngularDamping(0.3).setCcdEnabled(true));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.105, 0.045, 0.4).setTranslation(0, -0.03, 0)
      .setCollisionGroups(BOARD).setFriction(0.5).setRestitution(0.3).setDensity(600), this.board);
    this.active = true;
    return true;
  }

  step(dt) {
    if (!this.active) return;
    this.world.timestep = dt;
    this.world.step();
  }

  pelvisPosition(out) {
    const t = this.bodies[B.hips].translation();
    return out.set(t.x, t.y, t.z);
  }

  // copy the simulated bodies onto the skater's bones
  apply(skater) {
    if (!this.active) return;
    // flatten the rig's parent transforms so the hips bone is in world space
    skater.root.position.set(0, 0, 0); skater.root.quaternion.identity();
    for (const g of [skater.manualPivot, skater.manualInner, skater.bodyBase, skater.body]) { g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); }
    const rot = (b, q) => { const r = b.rotation(); return q.set(r.x, r.y, r.z, r.w); };
    const bones = skater.bones;
    const t = this.bodies[B.hips].translation();
    bones[B.hips].position.set(t.x, t.y, t.z);
    rot(this.bodies[B.hips], bones[B.hips].quaternion);
    for (let i = 0; i < bones.length; i++) {
      if (i === B.hips) continue;
      rot(this.bodies[PARENT[i]], this._q).invert();
      rot(this.bodies[i], this._q2);
      bones[i].quaternion.copy(this._q.multiply(this._q2));
    }
    const bt = this.board.translation();
    skater.setLooseBoard(true, this._p.set(bt.x, bt.y, bt.z), rot(this.board, this._q));
  }

  // remove the ragdoll and give the bones back to the animation system
  clear(skater) {
    for (const b of this.bodies) this.world.removeRigidBody(b);
    if (this.board) this.world.removeRigidBody(this.board);
    this.bodies = []; this.board = null;
    if (this.active && skater) for (const bone of skater.bones) bone.rotation.set(0, 0, 0);
    this.active = false;
  }
}
