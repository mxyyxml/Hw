// =============================================================================
//  skater.js — the original low-poly skater, outfits (Closet) and
//  procedural animation. Player.js feeds an animation state each frame (crouch,
//  push phase, flip angles, grab, grind, manual, bail, walk...) and this file
//  turns it into joint rotations. No skeletal animation files.
// =============================================================================
import * as THREE from 'three';
import { DEFAULT_OUTFIT } from './config.js';

const THIGH = 0.42, SHIN = 0.42;          // leg bone lengths
const DECK_Y = 0.105;                     // height of the deck top above the ground

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

function joint(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}

export class Skater {
  constructor(scene) {
    this.scene = scene;
    // ------------------------------------------------------------ shared materials (outfit colours)
    const M = (c) => new THREE.MeshLambertMaterial({ color: c });
    this.mat = {
      skin: M(0xe0ac69), skinDark: M(0xc0905a), hair: M(0x2b1d14),
      top: M(0x2a9d8f), topDark: M(0x21867a), topTrim: M(0xffffff),
      pants: M(0x3d5a80), pantsDark: M(0x2f4766),
      shoe: M(0xf1f1f1), sole: M(0x222222), lace: M(0xdddddd),
      hat: M(0xf4743b), hatDark: M(0xd65a22), visor: M(0x1d1d1d),
      pack: M(0x264653), packDark: M(0x1b343d),
      grip: M(0x1d1d1d), deck: M(0xe9c46a), deckSide: M(0xc9a24a),
      truck: M(0xb8bcc2), wheel: M(0xf8f4e3), eye: M(0x1d1d1d),
    };
    this.root = new THREE.Group();
    scene.add(this.root);
    const box = (parent, w, h, d, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    };
    this._box = box;

    // ------------------------------------------------------------ board
    // manualPivot moves to the tail/nose wheels for manuals
    this.manualPivot = joint(this.root, 0, 0, 0);
    this.manualInner = joint(this.manualPivot, 0, 0, 0);
    this.boardHolder = joint(this.manualInner, 0, 0, 0);   // offset used when carrying
    this.board = joint(this.boardHolder, 0, DECK_Y - 0.012, 0);
    this.board.rotation.order = 'YZX';                      // shuv (Y) then flip (Z)
    this.wheels = this._makeBoard(this.board);
    // loose board used during bails (flies off on its own)
    this.looseBoard = new THREE.Group();
    this.looseWheels = this._makeBoard(this.looseBoard);
    this.looseBoard.visible = false;
    scene.add(this.looseBoard);

    // ------------------------------------------------------------ body
    // Built facing its own +Z, then turned 90° so it stands sideways on the board.
    this.bodyBase = joint(this.manualInner, 0, DECK_Y, 0);
    this.body = joint(this.bodyBase, 0, 0, 0);
    this.body.rotation.y = Math.PI / 2;
    this.hips = joint(this.body, 0, 0.8, 0);
    const m = this.mat;
    box(this.hips, 0.32, 0.16, 0.2, m.pants, 0, 0.02, 0);
    box(this.hips, 0.33, 0.04, 0.21, m.sole, 0, 0.09, 0);       // belt
    this.torso = joint(this.hips, 0, 0.08, 0);
    box(this.torso, 0.36, 0.48, 0.22, m.top, 0, 0.24, 0);
    // outfit extras (shown / hidden by applyOutfit)
    this.parts = {
      hood: box(this.torso, 0.3, 0.14, 0.1, m.topDark, 0, 0.44, -0.13),
      pocket: box(this.torso, 0.26, 0.12, 0.02, m.topDark, 0, 0.12, 0.115),
      strings: [box(this.torso, 0.015, 0.12, 0.015, m.lace, -0.05, 0.38, 0.115), box(this.torso, 0.015, 0.12, 0.015, m.lace, 0.05, 0.38, 0.115)],
      jacketOpen: box(this.torso, 0.1, 0.46, 0.02, m.topTrim, 0, 0.24, 0.112),
      collar: box(this.torso, 0.38, 0.06, 0.24, m.topDark, 0, 0.47, 0),
      flannel: [],
      pack: box(this.torso, 0.28, 0.34, 0.12, m.pack, 0, 0.26, -0.17),
      packStraps: [box(this.torso, 0.04, 0.4, 0.02, m.packDark, -0.1, 0.27, 0.115), box(this.torso, 0.04, 0.4, 0.02, m.packDark, 0.1, 0.27, 0.115)],
      cargo: [],
    };
    for (let i = 0; i < 3; i++) this.parts.flannel.push(box(this.torso, 0.365, 0.025, 0.225, m.topDark, 0, 0.08 + i * 0.15, 0));
    for (let i = 0; i < 2; i++) this.parts.flannel.push(box(this.torso, 0.025, 0.47, 0.225, m.topDark, -0.09 + i * 0.18, 0.24, 0));

    // head
    this.head = joint(this.torso, 0, 0.5, 0);
    box(this.head, 0.1, 0.08, 0.1, m.skin, 0, 0.03, 0);              // neck
    box(this.head, 0.24, 0.26, 0.24, m.skin, 0, 0.19, 0);            // head
    box(this.head, 0.05, 0.05, 0.05, m.skinDark, 0, 0.17, 0.13);     // nose
    box(this.head, 0.035, 0.035, 0.01, m.eye, -0.055, 0.22, 0.121);  // eyes
    box(this.head, 0.035, 0.035, 0.01, m.eye, 0.055, 0.22, 0.121);
    box(this.head, 0.04, 0.07, 0.06, m.skinDark, -0.125, 0.19, 0);   // ears
    box(this.head, 0.04, 0.07, 0.06, m.skinDark, 0.125, 0.19, 0);
    this.hair = [
      box(this.head, 0.26, 0.08, 0.26, m.hair, 0, 0.32, -0.01),
      box(this.head, 0.26, 0.16, 0.06, m.hair, 0, 0.25, -0.12),
      box(this.head, 0.03, 0.1, 0.18, m.hair, -0.125, 0.27, -0.03),
      box(this.head, 0.03, 0.1, 0.18, m.hair, 0.125, 0.27, -0.03),
    ];
    // hats
    const H = () => joint(this.head, 0, 0, 0);
    this.hats = { beanie: H(), cap: H(), capBack: H(), helmet: H(), bucket: H() };
    box(this.hats.beanie, 0.27, 0.13, 0.27, m.hat, 0, 0.32, 0);
    box(this.hats.beanie, 0.28, 0.05, 0.28, m.hatDark, 0, 0.255, 0);
    box(this.hats.beanie, 0.08, 0.08, 0.08, m.hatDark, 0, 0.42, 0);
    for (const [g, dir] of [[this.hats.cap, 1], [this.hats.capBack, -1]]) {
      box(g, 0.27, 0.09, 0.27, m.hat, 0, 0.34, 0);
      box(g, 0.24, 0.02, 0.14, m.hatDark, 0, 0.305, dir * 0.19);
      box(g, 0.05, 0.03, 0.05, m.hatDark, 0, 0.395, 0);
    }
    box(this.hats.helmet, 0.3, 0.15, 0.3, m.hat, 0, 0.34, 0);
    box(this.hats.helmet, 0.31, 0.04, 0.31, m.hatDark, 0, 0.28, 0);
    box(this.hats.helmet, 0.2, 0.02, 0.05, m.visor, 0, 0.32, 0.16);
    box(this.hats.bucket, 0.27, 0.11, 0.27, m.hat, 0, 0.35, 0);
    box(this.hats.bucket, 0.38, 0.025, 0.38, m.hatDark, 0, 0.3, 0);

    // arms: shoulder → elbow → hand
    this.arms = [];
    for (const sgn of [-1, 1]) {
      const sh = joint(this.torso, sgn * 0.23, 0.44, 0);
      box(sh, 0.11, 0.3, 0.11, m.top, 0, -0.15, 0);
      const el = joint(sh, 0, -0.3, 0);
      const fore = box(el, 0.1, 0.27, 0.1, m.top, 0, -0.13, 0);
      const cuff = box(el, 0.105, 0.04, 0.105, m.topDark, 0, -0.25, 0);
      box(el, 0.09, 0.1, 0.09, m.skin, 0, -0.31, 0);
      this.arms.push({ sh, el, sgn, fore, cuff });
    }
    // legs: hip → knee → foot   (index 0 = front foot (nose side), 1 = back foot)
    this.legs = [];
    for (const sgn of [-1, 1]) {
      const hip = joint(this.hips, sgn * 0.1, 0, 0);
      hip.rotation.order = 'ZXY';
      box(hip, 0.15, THIGH, 0.16, m.pants, 0, -THIGH / 2, 0);
      this.parts.cargo.push(box(hip, 0.04, 0.12, 0.12, m.pantsDark, sgn * 0.09, -0.26, 0));
      const knee = joint(hip, 0, -THIGH, 0);
      const shin = box(knee, 0.13, SHIN, 0.14, m.pants, 0, -SHIN / 2, 0);
      const sock = box(knee, 0.125, 0.06, 0.135, m.lace, 0, -SHIN + 0.06, 0);
      const foot = joint(knee, 0, -SHIN, 0);
      box(foot, 0.13, 0.08, 0.28, m.shoe, 0, -0.005, 0.02);
      box(foot, 0.135, 0.025, 0.29, m.sole, 0, -0.05, 0.02);
      box(foot, 0.06, 0.012, 0.1, m.lace, 0, 0.037, 0.06);
      this.legs.push({ hip, knee, foot, sgn, shin, sock });
    }

    // blob shadow (cheap fake shadow, used on Low graphics)
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    this.blob = blob;
    scene.add(blob);

    // animation memory
    this.a = { crouch: 0, lean: 0, push: 0, tuck: 0, grab: 0, manual: 0, slide: 0, walk: 0, bail: 0, armsOut: 0, dip: 0 };
    this.walkPhase = 0;
    this.wheelAngle = 0;
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._q3 = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0); this._n = new THREE.Vector3(); this._fwd = new THREE.Vector3(0, 0, 1);

    this.applyOutfit(DEFAULT_OUTFIT);
  }

  _makeBoard(parent) {
    const m = this.mat, box = this._box;
    box(parent, 0.22, 0.012, 0.8, m.grip, 0, 0.006, 0);
    box(parent, 0.215, 0.014, 0.79, m.deck, 0, -0.007, 0);
    box(parent, 0.225, 0.006, 0.6, m.deckSide, 0, -0.015, 0);
    for (const z of [-0.37, 0.37]) { // kicktails
      const tail = box(parent, 0.22, 0.022, 0.12, m.deck, 0, 0.026, z);
      tail.rotation.x = z > 0 ? -0.35 : 0.35;
    }
    const wheels = [];
    for (const z of [-0.26, 0.26]) {
      box(parent, 0.06, 0.035, 0.05, m.truck, 0, -0.03, z);       // baseplate / hanger
      box(parent, 0.2, 0.025, 0.035, m.truck, 0, -0.052, z);       // axle
      for (const x of [-0.1, 0.1]) {
        const spin = joint(parent, x, -0.064, z);                  // spins around X
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.035, 8), m.wheel);
        w.rotation.z = Math.PI / 2; w.castShadow = true;
        spin.add(w);
        wheels.push(spin);
      }
    }
    return wheels;
  }

  // ---------------------------------------------------------------- outfits
  applyOutfit(o) {
    o = { ...DEFAULT_OUTFIT, ...o };
    const m = this.mat, dark = (hex, f = 0.78) => new THREE.Color(hex).multiplyScalar(f);
    m.skin.color.setHex(o.skin); m.skinDark.color.copy(dark(o.skin, 0.86));
    m.hair.color.setHex(o.hairColor);
    m.top.color.setHex(o.topColor); m.topDark.color.copy(dark(o.topColor, o.top === 'flannel' ? 0.55 : 0.78));
    m.pants.color.setHex(o.pantsColor); m.pantsDark.color.copy(dark(o.pantsColor));
    m.shoe.color.setHex(o.shoeColor);
    m.hat.color.setHex(o.hatColor); m.hatDark.color.copy(dark(o.hatColor));
    m.deck.color.setHex(o.deckColor); m.deckSide.color.copy(dark(o.deckColor, 0.85));
    const P = this.parts, show = (x, v) => (Array.isArray(x) ? x : [x]).forEach((p) => { p.visible = v; });
    show(P.hood, o.top === 'hoodie'); show(P.pocket, o.top === 'hoodie'); show(P.strings, o.top === 'hoodie');
    show(P.jacketOpen, o.top === 'jacket'); show(P.collar, o.top === 'jacket' || o.top === 'flannel');
    show(P.flannel, o.top === 'flannel');
    show(P.pack, !!o.backpack); show(P.packStraps, !!o.backpack);
    show(P.cargo, o.pants === 'cargo');
    for (const A of this.arms) {           // t-shirt = bare forearms
      A.fore.material = o.top === 'tee' ? m.skin : m.top;
      A.cuff.visible = o.top !== 'tee';
    }
    for (const L of this.legs) {           // shorts = bare shins + socks
      L.shin.material = o.pants === 'shorts' ? m.skin : m.pants;
      L.sock.visible = o.pants === 'shorts';
    }
    for (const [k, g] of Object.entries(this.hats)) g.visible = o.hat === k;
    this.hair[0].visible = o.hat === 'none';   // top hair hides under any hat
    this.outfit = o;
  }

  // Place the skater: pos = wheel contact point, yaw = facing, normal = ground up,
  // bank = lean into a carve (radians, around the travel direction)
  setTransform(pos, yaw, normal, dt, alignRate = 14, bank = 0) {
    this.root.position.copy(pos);
    this._q2.setFromAxisAngle(this._up, yaw);
    this._n.copy(normal || this._up).normalize();
    this._q.setFromUnitVectors(this._up, this._n);
    this._q.multiply(this._q2);
    if (bank) { this._q3.setFromAxisAngle(this._fwd, bank); this._q.multiply(this._q3); }
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

  // loose board during bails (world-space position & quaternion)
  setLooseBoard(visible, pos, quat) {
    this.looseBoard.visible = visible;
    this.board.visible = !visible;
    if (visible) { this.looseBoard.position.copy(pos); this.looseBoard.quaternion.copy(quat); }
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
    a.bail = mode === 'bail' ? Math.min(1, a.bail + dt * 3) : damp(a.bail, 0, 20, dt);
    a.armsOut = damp(a.armsOut, (mode === 'grind' || mode === 'manual') ? 1 : 0.35, 6, dt);
    a.dip = damp(a.dip, 0, 6, dt);                 // landing knee-bend recovers
    if (st.landDip) a.dip = Math.max(a.dip, st.landDip);

    // ---------------- wheels roll with speed
    this.wheelAngle += (st.wheelSpeed || 0) * dt / 0.03;
    for (const w of this.wheels) w.rotation.x = this.wheelAngle;

    // ---------------- board flip / shuv
    this.board.rotation.y = st.shuvAngle || 0;
    this.board.rotation.z = st.flipAngle || 0;
    this.board.position.y = DECK_Y - 0.012 + (st.boardLift || 0);

    // manual: pivot around the tail (pitch > 0) or nose (pitch < 0) wheels
    const piv = a.manual >= 0 ? -0.3 : 0.3;
    this.manualPivot.position.z = piv; this.manualInner.position.z = -piv;
    this.manualPivot.rotation.x = -a.manual;

    // ---------------- body pose
    const stand = 0.8, low = 0.48;
    let hipH = lerp(stand, low, Math.min(1, Math.max(a.crouch, a.tuck * 0.55, a.grab * 0.95) + a.dip * 0.6));
    const pushing = st.pushPhase >= 0 && mode === 'ride';
    a.push = damp(a.push, pushing ? 1 : 0, 10, dt);
    hipH -= a.push * 0.1;
    this.hips.position.set(0, hipH, 0);

    // legs: 2-bone IK down to the deck. Front leg (0) is toward the nose (body -X)
    const footX = 0.24;
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      const fx = (i === 0 ? -footX : footX) - L.sgn * 0.1;
      const d = Math.min(Math.hypot(hipH, fx), THIGH + SHIN - 0.001);
      const k = Math.acos(Math.min(1, d / (THIGH + SHIN)));
      L.hip.rotation.set(-k, 0, Math.atan2(fx, hipH));
      L.knee.rotation.x = 2 * k;
      L.foot.rotation.set(-k, 0, -L.hip.rotation.z);
    }
    if (a.push > 0.01) {          // back leg swings along the board
      const L = this.legs[1];
      const ph = st.pushPhase * Math.PI * 2;
      L.hip.rotation.x = lerp(L.hip.rotation.x, -0.15, a.push);
      L.hip.rotation.z = lerp(L.hip.rotation.z, 0.25 + Math.sin(ph) * 0.55, a.push);
      L.knee.rotation.x = lerp(L.knee.rotation.x, 0.15 + Math.max(0, Math.cos(ph)) * 0.5, a.push);
    }
    if (a.tuck > 0.01) for (const L of this.legs) { L.knee.rotation.x += a.tuck * 0.35; L.hip.rotation.x -= a.tuck * 0.15; }

    // torso: crouch / grab / steering lean; manuals lean back
    this.torso.rotation.x = 0.15 + a.crouch * 0.35 + a.grab * 0.5 + a.lean * 0.25 + a.dip * 0.3;
    this.torso.rotation.z = -a.manual * 0.9 + a.slide * 0.1;
    this.head.rotation.y = -1.25 + a.lean * 0.15;
    this.head.rotation.x = -0.1 - a.crouch * 0.2;

    const t = performance.now() / 1000;
    for (const A of this.arms) {
      const wobble = (mode === 'manual' || mode === 'grind') ? Math.sin(t * 7 + A.sgn) * 0.15 : 0;
      A.sh.rotation.set(0.1 + a.dip * 0.3, 0, A.sgn * (0.25 + a.armsOut * 0.75 + wobble + a.dip * 0.4));
      A.el.rotation.set(-0.4, 0, 0);
    }
    if (a.grab > 0.01) {
      const A = this.arms[st.grabHand === 'back' ? 1 : 0];
      A.sh.rotation.x = lerp(A.sh.rotation.x, 0.9, a.grab);
      A.sh.rotation.z = lerp(A.sh.rotation.z, A.sgn * 0.1, a.grab);
      A.el.rotation.x = lerp(A.el.rotation.x, -0.2, a.grab);
    }
    this.bodyBase.position.set(0, DECK_Y + (st.boardLift || 0), 0);
    this.bodyBase.rotation.set(0, 0, 0);
    this.body.rotation.set(0, Math.PI / 2, 0);
    this.boardHolder.position.set(0, 0, 0);
    this.boardHolder.rotation.set(0, 0, 0);

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
      this.boardHolder.position.set(lerp(0, 0.33, a.walk), lerp(0, 0.75, a.walk), lerp(0, -0.05, a.walk));
      this.boardHolder.rotation.set(0, 0, lerp(0, Math.PI / 2, a.walk));
    }

    // ---------------- bail: the body tumbles (roll angle comes from Player physics)
    if (mode === 'bail') {
      const b = a.bail, tb = st.bailTime || 0, roll = st.bailRoll || 0;
      this.bodyBase.position.y = 0.15;
      this.bodyBase.rotation.set(-roll, 0, Math.sin(tb * 5) * 0.25 * (1 - b));
      this.hips.position.y = lerp(hipH, 0.35, b);
      for (const A of this.arms) A.sh.rotation.set(-1.4 * b + Math.sin(tb * 9 + A.sgn) * 0.4, 0, A.sgn * (0.7 + Math.sin(tb * 13 + A.sgn) * 0.5));
      for (const L of this.legs) { L.hip.rotation.x = -0.5 * b + Math.sin(tb * 11 + L.sgn) * 0.35; L.knee.rotation.x = 0.7 * b; }
    }
  }
}
