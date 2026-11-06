// =============================================================================
//  skater.js — the original skater, outfits (Closet), stance and procedural
//  animation. Limbs are low-poly capsules, the head is a sphere. Player.js feeds
//  an animation state each frame (crouch, push stroke, flips, grab, grind,
//  manual, bail, walk...) and this file turns it into joint rotations.
// =============================================================================
import * as THREE from 'three';
import { DEFAULT_OUTFIT, PUSH } from './config.js';

const THIGH = 0.42, SHIN = 0.42;          // leg bone lengths
const DECK_Y = 0.105;                     // height of the deck top above the ground

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const smooth = (t) => t * t * (3 - 2 * t);

function joint(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}

// capsule limb hanging down from its joint (length = joint-to-joint distance)
function limbGeo(r, len) { return new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 3, 8).translate(0, -len / 2, 0); }
function hemi(r, sy = 1) { return new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, sy, 1); }

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
    const mesh = (parent, geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
    };
    const box = (parent, w, h, d, mat, x, y, z) => mesh(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
    this._box = box; this._mesh = mesh;

    // ------------------------------------------------------------ board
    this.manualPivot = joint(this.root, 0, 0, 0);          // moves to tail/nose wheels for manuals
    this.manualInner = joint(this.manualPivot, 0, 0, 0);
    this.boardHolder = joint(this.manualInner, 0, 0, 0);   // offset used when carrying
    this.board = joint(this.boardHolder, 0, DECK_Y - 0.012, 0);
    this.board.rotation.order = 'YZX';                      // shuv (Y) then flip (Z)
    this.wheels = this._makeBoard(this.board);
    this.looseBoard = new THREE.Group();                    // flies off on its own during bails
    this.looseWheels = this._makeBoard(this.looseBoard);
    this.looseBoard.visible = false;
    scene.add(this.looseBoard);

    // ------------------------------------------------------------ body
    // Built facing its own +Z, then turned ±90° to stand sideways (regular/goofy).
    this.bodyBase = joint(this.manualInner, 0, DECK_Y, 0);
    this.body = joint(this.bodyBase, 0, 0, 0);
    this.hips = joint(this.body, 0, 0.8, 0);
    const m = this.mat;
    mesh(this.hips, new THREE.CapsuleGeometry(0.1, 0.14, 3, 8).rotateZ(Math.PI / 2).scale(1, 0.9, 0.9), m.pants, 0, 0.02, 0);
    mesh(this.hips, new THREE.CylinderGeometry(0.165, 0.165, 0.04, 12).scale(1, 1, 0.68), m.sole, 0, 0.09, 0); // belt
    this.torso = joint(this.hips, 0, 0.08, 0);
    // rounded torso: capsule squashed front-to-back, a bit wider at the shoulders
    mesh(this.torso, new THREE.CapsuleGeometry(0.16, 0.2, 4, 10).scale(1.12, 1, 0.7), m.top, 0, 0.25, 0);
    this.parts = {
      hood: mesh(this.torso, new THREE.SphereGeometry(0.12, 10, 6).scale(1.2, 0.6, 0.8), m.topDark, 0, 0.46, -0.1),
      pocket: box(this.torso, 0.24, 0.1, 0.02, m.topDark, 0, 0.13, 0.108),
      strings: [box(this.torso, 0.012, 0.12, 0.012, m.lace, -0.05, 0.38, 0.11), box(this.torso, 0.012, 0.12, 0.012, m.lace, 0.05, 0.38, 0.11)],
      jacketOpen: box(this.torso, 0.09, 0.42, 0.02, m.topTrim, 0, 0.25, 0.106),
      collar: mesh(this.torso, new THREE.TorusGeometry(0.09, 0.025, 6, 12).rotateX(Math.PI / 2), m.topDark, 0, 0.47, 0),
      flannel: [],
      pack: mesh(this.torso, new THREE.CapsuleGeometry(0.11, 0.14, 3, 8).scale(1.2, 1, 0.55), m.pack, 0, 0.27, -0.17),
      packStraps: [box(this.torso, 0.035, 0.36, 0.02, m.packDark, -0.1, 0.27, 0.11), box(this.torso, 0.035, 0.36, 0.02, m.packDark, 0.1, 0.27, 0.11)],
      cargo: [],
    };
    for (let i = 0; i < 3; i++) this.parts.flannel.push(mesh(this.torso, new THREE.CylinderGeometry(0.182, 0.182, 0.022, 12).scale(1, 1, 0.66), m.topDark, 0, 0.1 + i * 0.13, 0));

    // head
    this.head = joint(this.torso, 0, 0.5, 0);
    mesh(this.head, new THREE.CylinderGeometry(0.05, 0.055, 0.1, 8), m.skin, 0, 0.04, 0);        // neck
    mesh(this.head, new THREE.SphereGeometry(0.125, 14, 10).scale(1, 1.12, 1.02), m.skin, 0, 0.2, 0);
    mesh(this.head, new THREE.SphereGeometry(0.025, 6, 4).scale(1, 1, 1.3), m.skinDark, 0, 0.18, 0.125); // nose
    mesh(this.head, new THREE.SphereGeometry(0.017, 6, 4), m.eye, -0.045, 0.22, 0.112);
    mesh(this.head, new THREE.SphereGeometry(0.017, 6, 4), m.eye, 0.045, 0.22, 0.112);
    mesh(this.head, new THREE.SphereGeometry(0.03, 6, 4).scale(0.6, 1, 1), m.skinDark, -0.125, 0.2, 0);  // ears
    mesh(this.head, new THREE.SphereGeometry(0.03, 6, 4).scale(0.6, 1, 1), m.skinDark, 0.125, 0.2, 0);
    this.hair = [
      mesh(this.head, hemi(0.132, 1.05), m.hair, 0, 0.215, -0.008),                                    // top
      mesh(this.head, new THREE.SphereGeometry(0.13, 12, 8).scale(1, 0.75, 0.6), m.hair, 0, 0.19, -0.045), // back
    ];
    // hats
    const H = () => joint(this.head, 0, 0, 0);
    this.hats = { beanie: H(), cap: H(), capBack: H(), helmet: H(), bucket: H() };
    mesh(this.hats.beanie, hemi(0.142, 1.25), m.hat, 0, 0.225, 0);
    mesh(this.hats.beanie, new THREE.CylinderGeometry(0.145, 0.145, 0.06, 14), m.hatDark, 0, 0.235, 0);
    mesh(this.hats.beanie, new THREE.SphereGeometry(0.04, 8, 6), m.hatDark, 0, 0.405, 0);
    for (const [g, dir] of [[this.hats.cap, 1], [this.hats.capBack, -1]]) {
      mesh(g, hemi(0.138, 0.9), m.hat, 0, 0.24, 0);
      mesh(g, new THREE.CylinderGeometry(0.11, 0.11, 0.012, 12, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.25), m.hatDark, 0, 0.245, dir * 0.11);
      mesh(g, new THREE.SphereGeometry(0.018, 6, 4), m.hatDark, 0, 0.365, 0);
    }
    mesh(this.hats.helmet, hemi(0.16, 1.0), m.hat, 0, 0.21, 0);
    mesh(this.hats.helmet, new THREE.CylinderGeometry(0.162, 0.162, 0.03, 14), m.hatDark, 0, 0.215, 0);
    mesh(this.hats.bucket, new THREE.CylinderGeometry(0.12, 0.14, 0.12, 14), m.hat, 0, 0.32, 0);
    mesh(this.hats.bucket, new THREE.CylinderGeometry(0.2, 0.2, 0.012, 16), m.hatDark, 0, 0.265, 0);

    // arms: shoulder → elbow → hand
    this.arms = [];
    for (const sgn of [-1, 1]) {
      const sh = joint(this.torso, sgn * 0.21, 0.42, 0);
      mesh(sh, limbGeo(0.055, 0.3), m.top);
      const el = joint(sh, 0, -0.3, 0);
      const fore = mesh(el, limbGeo(0.048, 0.27), m.top);
      const cuff = mesh(el, new THREE.CylinderGeometry(0.052, 0.052, 0.04, 8), m.topDark, 0, -0.24, 0);
      mesh(el, new THREE.SphereGeometry(0.045, 8, 6).scale(0.9, 1.15, 0.75), m.skin, 0, -0.3, 0);
      this.arms.push({ sh, el, sgn, fore, cuff });
    }
    // legs: hip → knee → foot
    this.legs = [];
    for (const sgn of [-1, 1]) {
      const hip = joint(this.hips, sgn * 0.09, 0, 0);
      hip.rotation.order = 'ZXY';
      mesh(hip, limbGeo(0.075, THIGH), m.pants);
      this.parts.cargo.push(box(hip, 0.035, 0.11, 0.1, m.pantsDark, sgn * 0.075, -0.25, 0));
      const knee = joint(hip, 0, -THIGH, 0);
      const shin = mesh(knee, limbGeo(0.064, SHIN), m.pants);
      const sock = mesh(knee, new THREE.CylinderGeometry(0.058, 0.058, 0.07, 8), m.lace, 0, -SHIN + 0.07, 0);
      const foot = joint(knee, 0, -SHIN, 0);
      mesh(foot, new THREE.CapsuleGeometry(0.055, 0.17, 3, 8).rotateX(Math.PI / 2).scale(1.1, 0.75, 1), m.shoe, 0, -0.01, 0.03);
      box(foot, 0.125, 0.025, 0.29, m.sole, 0, -0.05, 0.03);
      box(foot, 0.05, 0.01, 0.09, m.lace, 0, 0.032, 0.07);
      this.legs.push({ hip, knee, foot, sgn, shin, sock });
    }

    // blob shadow (cheap fake shadow, used on Low graphics)
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.45, 14),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2;
    this.blob = blob;
    scene.add(blob);

    this.a = { crouch: 0, lean: 0, push: 0, tuck: 0, grab: 0, manual: 0, slide: 0, walk: 0, bail: 0, armsOut: 0, dip: 0 };
    this.walkPhase = 0;
    this.wheelAngle = 0;
    this.stance = 1; // 1 = regular, -1 = goofy
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._q3 = new THREE.Quaternion();
    this._up = new THREE.Vector3(0, 1, 0); this._n = new THREE.Vector3(); this._fwd = new THREE.Vector3(0, 0, 1);

    this.applyOutfit(DEFAULT_OUTFIT);
  }

  _makeBoard(parent) {
    const m = this.mat, box = this._box, mesh = this._mesh;
    // deck: a slightly concave rounded shape (capsule squashed flat)
    mesh(parent, new THREE.CapsuleGeometry(0.108, 0.58, 4, 10).rotateX(Math.PI / 2).scale(1, 0.1, 1), m.deck, 0, -0.004, 0);
    box(parent, 0.205, 0.006, 0.66, m.grip, 0, 0.008, 0);
    for (const z of [-0.36, 0.36]) {           // kicktails
      const tail = mesh(parent, new THREE.CylinderGeometry(0.105, 0.105, 0.022, 12, 1, false, z > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI), m.deck, 0, 0.02, z * 0.95);
      tail.rotation.x = z > 0 ? -0.32 : 0.32;
      tail.scale.set(1, 1, 0.9);
    }
    const wheels = [];
    for (const z of [-0.25, 0.25]) {
      box(parent, 0.06, 0.03, 0.055, m.truck, 0, -0.025, z);      // baseplate
      mesh(parent, new THREE.CylinderGeometry(0.014, 0.014, 0.2, 6).rotateZ(Math.PI / 2), m.truck, 0, -0.052, z); // axle
      box(parent, 0.13, 0.03, 0.035, m.truck, 0, -0.045, z);      // hanger
      for (const x of [-0.1, 0.1]) {
        const spin = joint(parent, x, -0.064, z);
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.034, 10), m.wheel);
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
    for (const A of this.arms) { A.fore.material = o.top === 'tee' ? m.skin : m.top; A.cuff.visible = o.top !== 'tee'; }
    for (const L of this.legs) { L.shin.material = o.pants === 'shorts' ? m.skin : m.pants; L.sock.visible = o.pants === 'shorts'; }
    for (const [k, g] of Object.entries(this.hats)) g.visible = o.hat === k;
    this.hair[0].visible = o.hat === 'none';
    this.stance = o.stance === 'goofy' ? -1 : 1;
    this.mongo = o.pushStyle === 'mongo';
    this.outfit = o;
  }

  setTransform(pos, yaw, normal, dt, alignRate = 14, bank = 0) {
    this.root.position.copy(pos);
    this._q2.setFromAxisAngle(this._up, yaw);
    this._n.copy(normal || this._up).normalize();
    this._q.setFromUnitVectors(this._up, this._n);
    this._q.multiply(this._q2);
    if (bank) { this._q3.setFromAxisAngle(this._fwd, bank); this._q.multiply(this._q3); }
    if (dt > 0) this.root.quaternion.slerp(this._q, 1 - Math.exp(-alignRate * dt));
    else this.root.quaternion.copy(this._q);
  }

  setBlob(x, y, z, height) {
    this.blob.position.set(x, y + 0.03, z);
    const s = Math.max(0.35, 1 - height * 0.12);
    this.blob.scale.set(s, s, s);
    this.blob.material.opacity = 0.28 * s;
  }

  setLooseBoard(visible, pos, quat) {
    this.looseBoard.visible = visible;
    this.board.visible = !visible;
    if (visible) { this.looseBoard.position.copy(pos); this.looseBoard.quaternion.copy(quat); }
  }

  // Two-bone leg IK toward a foot target (tx,ty,tz) given relative to the hip, in body space
  _legIK(L, tx, ty, tz) {
    const len = Math.min(Math.hypot(tx, ty, tz), THIGH + SHIN - 0.001);
    const k = Math.acos(Math.min(1, len / (THIGH + SHIN)));      // knee half-angle
    const splay = Math.atan2(tx, -ty);
    const fwd = Math.atan2(tz, Math.hypot(tx, ty));
    L.hip.rotation.set(-(k + fwd), 0, splay);
    L.knee.rotation.x = 2 * k;
    L.foot.rotation.set(fwd - k, 0, -splay);
  }

  animate(st, dt) {
    const a = this.a, s = this.stance;
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
    a.dip = damp(a.dip, 0, 6, dt);
    if (st.landDip) a.dip = Math.max(a.dip, st.landDip);
    const pushing = st.pushPhase >= 0 && mode === 'ride';
    a.push = damp(a.push, pushing ? 1 : 0, 12, dt);

    // wheels
    this.wheelAngle += (st.wheelSpeed || 0) * dt / 0.03;
    for (const w of this.wheels) w.rotation.x = this.wheelAngle;

    // board flip / shuv / pop lift
    this.board.rotation.y = st.shuvAngle || 0;
    this.board.rotation.z = st.flipAngle || 0;
    this.board.position.y = DECK_Y - 0.012 + (st.boardLift || 0);

    // manual pivot (tail wheels for manual, nose wheels for nose manual)
    const piv = a.manual >= 0 ? -0.3 : 0.3;
    this.manualPivot.position.z = piv; this.manualInner.position.z = -piv;
    this.manualPivot.rotation.x = -a.manual;

    // ---------------- base pose
    const stand = 0.8, low = 0.48;
    let hipH = lerp(stand, low, Math.min(1, Math.max(a.crouch, a.tuck * 0.55, a.grab * 0.95) + a.dip * 0.6));
    hipH -= a.push * 0.17;                    // bend the standing knee so the push foot reaches the floor
    this.hips.position.set(0, hipH, 0);
    this.bodyBase.position.set(0, DECK_Y + (st.boardLift || 0), 0);
    this.bodyBase.rotation.set(0, 0, 0);
    // open the shoulders toward the nose while pushing
    this.body.rotation.set(0, s * Math.PI / 2 * (1 - a.push * 0.35), 0);
    this.boardHolder.position.set(0, 0, 0);
    this.boardHolder.rotation.set(0, 0, 0);

    // legs stand on the deck: leg 0 at body -X, leg 1 at body +X.
    // Regular: body -X is the board nose. Goofy turns the body the other way, so
    // body +X is the nose and the right foot leads.
    const footX = 0.24;
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i];
      this._legIK(L, (i === 0 ? -footX : footX) - L.sgn * 0.09, -hipH, 0);
    }
    // ---------------- push stroke: the pushing foot steps off, plants beside the
    // board, sweeps back toward the tail, lifts and comes back to the deck.
    if (a.push > 0.01 && st.pushPhase >= 0) {
      const ph = st.pushPhase, c0 = PUSH.contactStart, c1 = PUSH.contactEnd;
      const tailX = s;                              // body-X direction of the board tail
      const backIdx = s > 0 ? 1 : 0;                 // back foot pushes; mongo = front foot
      const idx = this.mongo ? 1 - backIdx : backIdx;
      const L = this.legs[idx];
      const dirTail = tailX;
      const ground = -hipH - DECK_Y + 0.02;
      const onDeck = [(idx === 0 ? -footX : footX) - L.sgn * 0.09, -hipH, 0];
      const start = [dirTail * -0.12 - L.sgn * 0.09, ground, 0.22];
      const end = [dirTail * 0.42 - L.sgn * 0.09, ground, 0.18];
      let t;
      if (ph < c0) { const u = smooth(ph / c0); t = onDeck.map((v, j) => lerp(v, start[j], u)); t[1] += Math.sin(u * Math.PI) * 0.1; }
      else if (ph < c1) { const u = (ph - c0) / (c1 - c0); t = start.map((v, j) => lerp(v, end[j], u)); }
      else { const u = smooth((ph - c1) / (1 - c1)); t = end.map((v, j) => lerp(v, onDeck[j], u)); t[1] += Math.sin(u * Math.PI) * 0.14; }
      const cur = [L.hip.rotation.x, L.hip.rotation.z, L.knee.rotation.x, L.foot.rotation.x];
      this._legIK(L, t[0], t[1], t[2]);
      L.hip.rotation.x = lerp(cur[0], L.hip.rotation.x, a.push);
      L.hip.rotation.z = lerp(cur[1], L.hip.rotation.z, a.push);
      L.knee.rotation.x = lerp(cur[2], L.knee.rotation.x, a.push);
      L.foot.rotation.x = lerp(cur[3], L.foot.rotation.x, a.push);
    }
    if (a.tuck > 0.01) for (const L of this.legs) { L.knee.rotation.x += a.tuck * 0.35; L.hip.rotation.x -= a.tuck * 0.15; }

    // torso, head, arms
    this.torso.rotation.x = 0.15 + a.crouch * 0.35 + a.grab * 0.5 + a.lean * 0.25 + a.dip * 0.3 + a.push * 0.25;
    this.torso.rotation.z = (-a.manual * 0.9 + a.slide * 0.1) * s;
    this.head.rotation.y = s * (-1.25 + a.lean * 0.15) * (1 - a.push * 0.3);
    this.head.rotation.x = -0.1 - a.crouch * 0.2;
    const t = performance.now() / 1000;
    for (const A of this.arms) {
      const wobble = (mode === 'manual' || mode === 'grind') ? Math.sin(t * 7 + A.sgn) * 0.15 : 0;
      const swing = a.push * Math.sin((st.pushPhase || 0) * Math.PI * 2 + A.sgn) * 0.5;
      A.sh.rotation.set(0.1 + a.dip * 0.3 + swing, 0, A.sgn * (0.2 + a.armsOut * 0.75 + wobble + a.dip * 0.4) * (1 - a.push * 0.6));
      A.el.rotation.set(-0.4 - a.push * 0.3, 0, 0);
    }
    if (a.grab > 0.01) {
      const A = this.arms[st.grabHand === 'back' ? 1 : 0];
      A.sh.rotation.x = lerp(A.sh.rotation.x, 0.9, a.grab);
      A.sh.rotation.z = lerp(A.sh.rotation.z, A.sgn * 0.1, a.grab);
      A.el.rotation.x = lerp(A.el.rotation.x, -0.2, a.grab);
    }

    // ---------------- walk mode
    if (a.walk > 0.01) {
      this.walkPhase += dt * (st.walkSpeed || 0) * 3.2;
      const sw0 = Math.sin(this.walkPhase);
      this.body.rotation.y = lerp(s * Math.PI / 2, 0, a.walk);
      this.bodyBase.position.y = lerp(DECK_Y, 0.04, a.walk);
      this.hips.position.y = lerp(hipH, 0.84, a.walk);
      for (let i = 0; i < 2; i++) {
        const L = this.legs[i], sw = (i === 0 ? sw0 : -sw0) * 0.55 * Math.min(1, (st.walkSpeed || 0) / 2);
        L.hip.rotation.set(lerp(L.hip.rotation.x, sw, a.walk), 0, lerp(L.hip.rotation.z, 0, a.walk));
        L.knee.rotation.x = lerp(L.knee.rotation.x, Math.max(0, -sw) * 0.8, a.walk);
        L.foot.rotation.set(0, 0, 0);
      }
      this.torso.rotation.x = lerp(this.torso.rotation.x, 0.05, a.walk);
      this.torso.rotation.z = 0;
      this.head.rotation.y = lerp(this.head.rotation.y, 0, a.walk);
      this.arms[0].sh.rotation.set(-sw0 * 0.4, 0, -0.15);
      this.arms[1].sh.rotation.set(-0.3, 0, 0.35);
      this.arms[1].el.rotation.set(-1.2, 0, 0);
      this.boardHolder.position.set(lerp(0, 0.33, a.walk), lerp(0, 0.75, a.walk), lerp(0, -0.05, a.walk));
      this.boardHolder.rotation.set(0, 0, lerp(0, Math.PI / 2, a.walk));
    }

    // ---------------- bail tumble (roll angle from Player physics)
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
