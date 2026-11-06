// =============================================================================
//  skater.js — "Pip", the original low-poly skater, plus procedural animation.
//  The model is a hierarchy of boxes. Player.js feeds an animation state each
//  frame (crouch, push phase, flip angles, grab, grind, manual, bail, walk...)
//  and this file turns it into joint rotations. No skeletal animation files.
// =============================================================================
import * as THREE from 'three';

const COL = {
  skin: 0xe0ac69, hoodie: 0x2a9d8f, hoodieDark: 0x21867a, pants: 0x5c677d, shoe: 0xf1f1f1,
  sole: 0x222222, beanie: 0xf4743b, beanieBand: 0xd65a22, deck: 0x1d1d1d, deckSide: 0xe9c46a,
  truck: 0xb8bcc2, wheel: 0xf8f4e3, backpack: 0x264653,
};

const THIGH = 0.42, SHIN = 0.42;          // leg bone lengths
const DECK_Y = 0.105;                     // height of the deck top above the ground

function box(w, h, d, color, y = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (y) g.translate(0, y, 0);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color }));
  m.castShadow = true;
  return m;
}
function joint(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

export class Skater {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);

    // ------------------------------------------------------------ board
    // manualPivot moves to the tail/nose wheels for manuals
    this.manualPivot = joint(this.root, 0, 0, 0);
    this.manualInner = joint(this.manualPivot, 0, 0, 0);
    this.boardHolder = joint(this.manualInner, 0, 0, 0);   // offset used for bails / carrying
    this.board = joint(this.boardHolder, 0, DECK_Y - 0.012, 0);
    this.board.rotation.order = 'YZX';                      // shuv (Y) then flip (Z)
    const deck = box(0.22, 0.024, 0.8, COL.deck); this.board.add(deck);
    const side = box(0.225, 0.012, 0.79, COL.deckSide, -0.012); this.board.add(side);
    for (const z of [-0.37, 0.37]) { // kicktails
      const tail = box(0.22, 0.024, 0.12, COL.deck); tail.position.set(0, 0.03, z); tail.rotation.x = z > 0 ? -0.35 : 0.35; this.board.add(tail);
    }
    for (const z of [-0.26, 0.26]) {
      const truck = box(0.18, 0.04, 0.05, COL.truck, -0.04); truck.position.z = z; this.board.add(truck);
      for (const x of [-0.1, 0.1]) {
        const wh = box(0.045, 0.06, 0.06, COL.wheel); wh.position.set(x, -0.065, z); this.board.add(wh);
      }
    }

    // ------------------------------------------------------------ body
    // The body is built facing its own +Z, then turned 90° so it stands sideways
    // on the board (board nose = body -X).
    this.bodyBase = joint(this.manualInner, 0, DECK_Y, 0);
    this.body = joint(this.bodyBase, 0, 0, 0);
    this.body.rotation.y = Math.PI / 2;
    this.hips = joint(this.body, 0, 0.8, 0);
    const pelvis = box(0.32, 0.16, 0.2, COL.pants, 0.02); this.hips.add(pelvis);
    this.torso = joint(this.hips, 0, 0.08, 0);
    this.torso.add(box(0.36, 0.48, 0.22, COL.hoodie, 0.24));
    const pocket = box(0.26, 0.12, 0.02, COL.hoodieDark, 0.14); pocket.position.z = 0.115; this.torso.add(pocket);
    const pack = box(0.28, 0.34, 0.12, COL.backpack, 0.26); pack.position.z = -0.16; this.torso.add(pack);
    this.head = joint(this.torso, 0, 0.5, 0);
    this.head.add(box(0.1, 0.08, 0.1, COL.skin, 0.03));           // neck
    this.head.add(box(0.24, 0.25, 0.24, COL.skin, 0.19));         // head
    this.head.add(box(0.26, 0.12, 0.26, COL.beanie, 0.3));        // beanie
    this.head.add(box(0.27, 0.05, 0.27, COL.beanieBand, 0.24));
    const pom = box(0.08, 0.08, 0.08, COL.beanieBand, 0.4); this.head.add(pom);
    const nose = box(0.05, 0.05, 0.05, 0xd19a5b, 0.17); nose.position.z = 0.13; this.head.add(nose);

    // arms: shoulder → elbow
    this.arms = [];
    for (const sgn of [-1, 1]) {
      const sh = joint(this.torso, sgn * 0.23, 0.44, 0);
      sh.add(box(0.11, 0.3, 0.11, COL.hoodie, -0.15));
      const el = joint(sh, 0, -0.3, 0);
      el.add(box(0.1, 0.27, 0.1, COL.hoodie, -0.13));
      el.add(box(0.09, 0.09, 0.09, COL.skin, -0.3));
      this.arms.push({ sh, el, sgn });
    }
    // legs: hip → knee → foot   (index 0 = front foot (nose side), 1 = back foot)
    this.legs = [];
    for (const sgn of [-1, 1]) {
      const hip = joint(this.hips, sgn * 0.1, 0, 0);
      hip.rotation.order = 'ZXY';
      hip.add(box(0.15, THIGH, 0.16, COL.pants, -THIGH / 2));
      const knee = joint(hip, 0, -THIGH, 0);
      knee.add(box(0.13, SHIN, 0.14, COL.pants, -SHIN / 2));
      const foot = joint(knee, 0, -SHIN, 0);
      foot.add(box(0.13, 0.07, 0.28, COL.shoe, -0.01));
      foot.add(box(0.135, 0.025, 0.29, COL.sole, -0.05));
      this.legs.push({ hip, knee, foot, sgn });
    }

    // blob shadow (cheap fake shadow, always on)
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    this.blob = blob;
    scene.add(blob);

    // animation memory
    this.a = { crouch: 0, lean: 0, push: 0, tuck: 0, grab: 0, manual: 0, slide: 0, walk: 0, bail: 0, carry: 0, armsOut: 0 };
    this.walkPhase = 0;
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0); this._n = new THREE.Vector3();
  }

  // Place the skater: pos = wheel contact point, yaw = facing, normal = ground up
  setTransform(pos, yaw, normal, dt, alignRate = 14) {
    this.root.position.copy(pos);
    this._q2.setFromAxisAngle(this._up, yaw);
    this._n.copy(normal || this._up).normalize();
    this._q.setFromUnitVectors(this._up, this._n);
    this._q.multiply(this._q2);
    // smooth the tilt so small bumps don't jitter
    if (dt > 0) this.root.quaternion.slerp(this._q, 1 - Math.exp(-alignRate * dt));
    else this.root.quaternion.copy(this._q);
  }

  setBlob(x, y, z, height) {
    this.blob.position.set(x, y + 0.03, z);
    const s = Math.max(0.35, 1 - height * 0.12);
    this.blob.scale.set(s, s, s);
    this.blob.material.opacity = 0.28 * s;
  }

  // st: animation state from Player (see Player.animState())
  animate(st, dt) {
    const a = this.a;
    const mode = st.mode;
    a.crouch = damp(a.crouch, st.crouch, 14, dt);
    a.lean = damp(a.lean, st.lean, 6, dt);
    a.tuck = damp(a.tuck, mode === 'air' ? 1 : 0, 10, dt);
    a.grab = damp(a.grab, st.grab ? 1 : 0, 12, dt);
    a.manual = damp(a.manual, st.manualPitch || 0, 12, dt);
    a.slide = damp(a.slide, st.sideways ? 1 : 0, 12, dt);
    a.walk = damp(a.walk, mode === 'walk' ? 1 : 0, 10, dt);
    a.bail = mode === 'bail' ? Math.min(1, a.bail + dt * 2.2) : damp(a.bail, 0, 20, dt);
    a.armsOut = damp(a.armsOut, (mode === 'grind' || mode === 'manual') ? 1 : 0.35, 6, dt);

    // ---------------- board flip / shuv / slide
    this.board.rotation.y = (st.shuvAngle || 0) + a.slide * Math.PI / 2;
    this.board.rotation.z = st.flipAngle || 0;
    this.board.position.y = DECK_Y - 0.012 + (st.boardLift || 0);

    // manual: pivot around the tail (pitch > 0) or nose (pitch < 0) wheels
    const piv = a.manual >= 0 ? -0.3 : 0.3;
    this.manualPivot.position.z = piv; this.manualInner.position.z = -piv;
    this.manualPivot.rotation.x = -a.manual;

    // ---------------- body pose
    // standing hip height above the deck; crouch lowers it
    const stand = 0.8, low = 0.48;
    let hipH = lerp(stand, low, Math.max(a.crouch, a.tuck * 0.55, a.grab * 0.95));
    // during push the front knee bends so the back foot reaches the ground
    const pushing = st.pushPhase >= 0 && mode === 'ride';
    a.push = damp(a.push, pushing ? 1 : 0, 10, dt);
    hipH -= a.push * 0.1;
    this.hips.position.y = hipH;
    this.hips.position.x = 0;

    // legs (2-bone IK down to the deck), front leg index 0 is toward board nose (body -X)
    const footX = 0.24;
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const fx = (i === 0 ? -footX : footX) - L.sgn * 0.1; // foot offset from its hip, along body X
      const d = Math.min(Math.hypot(hipH, fx), THIGH + SHIN - 0.001);
      const k = Math.acos(Math.min(1, d / (THIGH + SHIN)));   // knee half-angle
      L.hip.rotation.set(-k, 0, Math.atan2(fx, hipH)); // splay sideways, then bend knee forward
      L.knee.rotation.x = 2 * k;
      L.foot.rotation.set(-k, 0, -L.hip.rotation.z);
    }
    // pushing: back leg swings along the board
    if (a.push > 0.01) {
      const L = this.legs[1];
      const ph = st.pushPhase * Math.PI * 2;
      L.hip.rotation.x = lerp(L.hip.rotation.x, -0.15, a.push);
      L.hip.rotation.z = lerp(L.hip.rotation.z, 0.25 + Math.sin(ph) * 0.55, a.push);
      L.knee.rotation.x = lerp(L.knee.rotation.x, 0.15 + Math.max(0, Math.cos(ph)) * 0.5, a.push);
    }
    // in the air legs tuck up a bit more
    if (a.tuck > 0.01) for (const L of this.legs) { L.knee.rotation.x += a.tuck * 0.35; L.hip.rotation.x -= a.tuck * 0.15; }

    // torso lean: steering leans toe/heel side (body Z), manual leans back
    this.torso.rotation.x = 0.15 + a.crouch * 0.35 + a.grab * 0.5 + a.lean * 0.25;
    this.torso.rotation.z = -a.manual * 0.9 + a.slide * 0.1;
    this.head.rotation.y = -1.25 + a.lean * 0.15;
    this.head.rotation.x = -0.1 - a.crouch * 0.2;

    // arms out for balance; front arm reaches for the board when grabbing
    const t = performance.now() / 1000;
    for (const A of this.arms) {
      const wobble = (mode === 'manual' || mode === 'grind') ? Math.sin(t * 7 + A.sgn) * 0.15 : 0;
      A.sh.rotation.set(0.1, 0, A.sgn * (0.25 + a.armsOut * 0.75 + wobble));
      A.el.rotation.set(-0.4, 0, 0);
    }
    if (a.grab > 0.01) {
      const A = this.arms[st.grabHand === 'back' ? 1 : 0];
      A.sh.rotation.x = lerp(A.sh.rotation.x, 0.9, a.grab);
      A.sh.rotation.z = lerp(A.sh.rotation.z, A.sgn * 0.1, a.grab);
      A.el.rotation.x = lerp(A.el.rotation.x, -0.2, a.grab);
    }
    // the board rises toward the feet while tucked (looks like an ollie)
    this.bodyBase.position.y = DECK_Y + (st.boardLift || 0);

    // ---------------- walk mode: face forward, swing legs, carry board
    if (a.walk > 0.01) {
      this.walkPhase += dt * (st.walkSpeed || 0) * 3.2;
      const s = Math.sin(this.walkPhase);
      this.body.rotation.y = lerp(Math.PI / 2, 0, a.walk);
      this.bodyBase.position.y = lerp(DECK_Y, 0.04, a.walk);
      this.hips.position.y = lerp(hipH, 0.84, a.walk);
      for (let i = 0; i < 2; i++) {
        const L = this.legs[i], sw = (i === 0 ? s : -s) * 0.55 * Math.min(1, (st.walkSpeed || 0) / 2);
        L.hip.rotation.set(lerp(L.hip.rotation.x, sw, a.walk), 0, lerp(L.hip.rotation.z, 0, a.walk));
        L.knee.rotation.x = lerp(L.knee.rotation.x, Math.max(0, -sw) * 0.8, a.walk);
        L.foot.rotation.set(0, 0, 0);
      }
      this.torso.rotation.x = lerp(this.torso.rotation.x, 0.05, a.walk);
      this.torso.rotation.z = 0;
      this.head.rotation.y = lerp(this.head.rotation.y, 0, a.walk);
      this.arms[0].sh.rotation.set(-s * 0.4, 0, -0.15);
      this.arms[1].sh.rotation.set(-0.3, 0, 0.35);
      this.arms[1].el.rotation.set(-1.2, 0, 0);
      // board carried under the right arm
      this.boardHolder.position.set(lerp(0, 0.33, a.walk), lerp(0, 0.75, a.walk), lerp(0, -0.05, a.walk));
      this.boardHolder.rotation.set(0, 0, lerp(0, Math.PI / 2, a.walk));
    } else if (mode !== 'bail') {
      this.body.rotation.y = Math.PI / 2;
      this.boardHolder.position.set(0, 0, 0);
      this.boardHolder.rotation.set(0, 0, 0);
    }

    // ---------------- bail: body tumbles, board shoots off ahead
    if (mode === 'bail' || a.bail > 0.01) {
      const b = a.bail, tb = st.bailTime || 0;
      this.body.rotation.y = Math.PI / 2;
      this.body.rotation.z = 0;
      this.bodyBase.rotation.set(-b * 1.45, 0, Math.sin(tb * 9) * 0.3 * (1 - b));
      this.bodyBase.position.y = DECK_Y + 0.25 * Math.sin(Math.min(b, 1) * Math.PI) - b * 0.0;
      this.hips.position.y = lerp(hipH, 0.25, b);
      for (const A of this.arms) A.sh.rotation.set(-1.5 * b, 0, A.sgn * (0.6 + Math.sin(tb * 13 + A.sgn) * 0.5));
      for (const L of this.legs) { L.hip.rotation.x = -0.6 * b + Math.sin(tb * 11 + L.sgn) * 0.4; L.knee.rotation.x = 0.8 * b; }
      this.boardHolder.position.set(0, Math.max(0, Math.sin(tb * 3) * 0.4) * (1 - tb / 2), (st.boardSlide || 0));
      this.boardHolder.rotation.set(tb * 9, tb * 4, 0);
    } else {
      this.bodyBase.rotation.set(0, 0, 0);
    }
  }
}
