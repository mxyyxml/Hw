// =============================================================================
//  skater.js — the original skater, outfits (Closet), stance and procedural
//  animation. Limbs are low-poly capsules, the head is a sphere. Player.js feeds
//  an animation state each frame (crouch, push stroke, flips, grab, grind,
//  manual, bail, walk...) and this file turns it into joint rotations.
// =============================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DEFAULT_OUTFIT, PUSH } from './config.js';
import { buildBody } from './body.js';
import { fitSkeleton, buildHuman, hairTextures, humanTex } from './human.js';
import { getFabric } from './textures.js';

const THIGH = 0.42, SHIN = 0.42;          // leg bone lengths
const DECK_Y = 0.105;                     // height of the deck top above the ground
const FOOT_H = 0.066;                     // ankle height above the shoe sole (keeps shoes ON the deck, not in it)
const FRONT_FOOT = 0.19, BACK_FOOT = 0.29; // footplant: front foot over the front bolts, back foot on the tail

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const smooth = (t) => t * t * (3 - 2 * t);

function joint(parent, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}

function hemi(r, sy = 1) { return new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, sy, 1); }

// sneaker canvas: fine cross weave (greyscale, tinted by the shoe colour)
function canvasWeave() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) { x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(i, 0, 1, 64); x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(0, i, 64, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// knitted cap texture (beanie, kippah): fine rib stitches
function knitTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#e6e6e6'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 4) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(i, 0, 1, 64); x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(i + 2, 0, 1, 64); }
  for (let j = 0; j < 64; j += 3) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(0, j, 64, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8, 4); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// skateboard textures: grip tape (fine black grit) and original deck graphics
let _grip = null;
function gripTexture() {
  if (_grip) return _grip;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); x.fillStyle = '#2a2a2a'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) { const g = 20 + Math.random() * 70; x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
  _grip = new THREE.CanvasTexture(c); _grip.wrapS = _grip.wrapT = THREE.RepeatWrapping; _grip.colorSpace = THREE.SRGBColorSpace;
  return _grip;
}
let _ply = null;
function plyTexture() {
  if (_ply) return _ply;
  const c = document.createElement('canvas'); c.width = 64; c.height = 16;
  const x = c.getContext('2d');
  const cols = ['#e7d3a8', '#c9a46c', '#e7d3a8', '#3d6fa8', '#e7d3a8', '#b0393e', '#e7d3a8'];
  cols.forEach((col, i) => { x.fillStyle = col; x.fillRect(0, i * 16 / 7, 64, 16 / 7 + 0.5); });
  _ply = new THREE.CanvasTexture(c); _ply.wrapS = THREE.RepeatWrapping; _ply.colorSpace = THREE.SRGBColorSpace;
  return _ply;
}
const _decks = {};
export function deckTexture(design, colorHex) {
  const key = design + colorHex;
  if (_decks[key]) return _decks[key];
  const c = document.createElement('canvas'); c.width = 256; c.height = 1024;
  const x = c.getContext('2d'), col = '#' + colorHex.toString(16).padStart(6, '0'), W = 256, H = 1024;
  x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, W, H);                     // bare maple
  if (design === 'stripes') { x.fillStyle = col; for (let i = 0; i < 9; i++) x.fillRect(0, i * 120 + 20, W, 55); }
  else if (design === 'sunset') {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1d1d3d'); g.addColorStop(0.5, col); g.addColorStop(1, '#f2c14e'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#ffe9a8'; x.beginPath(); x.arc(W / 2, H * 0.55, 80, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#1d1d1d'; for (let i = 0; i < 6; i++) x.fillRect(0, H * 0.55 + i * 18, W, 6 + i);
  } else if (design === 'checker') { for (let j = 0; j < 16; j++) for (let i = 0; i < 4; i++) { x.fillStyle = (i + j) % 2 ? col : '#111'; x.fillRect(i * 64, j * 64, 64, 64); } }
  else if (design === 'bolt') { x.fillStyle = col; x.fillRect(0, 0, W, H); x.fillStyle = '#111'; x.beginPath(); x.moveTo(150, 120); x.lineTo(60, 540); x.lineTo(130, 540); x.lineTo(90, 900); x.lineTo(200, 430); x.lineTo(130, 430); x.closePath(); x.fill(); }
  else if (design === 'star') {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); x.fillStyle = '#0038b8'; x.fillRect(0, 90, W, 70); x.fillRect(0, H - 160, W, 70);
    x.strokeStyle = '#0038b8'; x.lineWidth = 14;
    for (const rot of [0, Math.PI]) { x.beginPath(); for (let k = 0; k < 3; k++) { const a = rot + k * 2 * Math.PI / 3; x[k ? 'lineTo' : 'moveTo'](W / 2 + Math.sin(a) * 95, H / 2 - Math.cos(a) * 95); } x.closePath(); x.stroke(); }
  } else if (design === 'plain') { x.fillStyle = col; x.fillRect(0, 0, W, H); }
  // a little wear on the nose & tail (scraped graphics show the wood)
  for (let i = 0; i < 260; i++) { const yy = Math.random() < 0.5 ? Math.random() * 90 : H - Math.random() * 90; x.fillStyle = 'rgba(232,220,192,0.7)'; x.fillRect(Math.random() * W, yy, 3 + Math.random() * 14, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (_decks[key] = t);
}

// flannel: woven plaid (greyscale, tinted by the top colour)
let _plaid = null;
function plaidTexture() {
  if (_plaid) return _plaid;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(30,30,30,0.55)'; x.fillRect(0, 40, 128, 34); x.fillRect(40, 0, 34, 128);
  x.fillStyle = 'rgba(30,30,30,0.3)'; x.fillRect(0, 100, 128, 6); x.fillRect(100, 0, 6, 128);
  x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(0, 86, 128, 2); x.fillRect(86, 0, 2, 128);
  for (let i = 0; i < 128; i += 2) { x.fillStyle = 'rgba(0,0,0,0.05)'; x.fillRect(i, 0, 1, 128); }
  _plaid = new THREE.CanvasTexture(c);
  _plaid.wrapS = _plaid.wrapT = THREE.RepeatWrapping; _plaid.repeat.set(3, 2.5); _plaid.colorSpace = THREE.SRGBColorSpace;
  return _plaid;
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
      sock: M(0xf2f2f2), bolt: M(0x6f747b), bushing: M(0xe9c46a), wheelCore: M(0xdedede), bearing: M(0x2b2f36),
      eyeball: M(0xffffff), brow: M(0x2b1d14), hairCard: M(0x2b1d14), stubble: M(0x2b1d14), lens: M(0x111111), frame: M(0x1d1d1d),
    };
    // hair: strand textures; cards are alpha-cut ribbons, stubble is a faint shadow
    { const ht = hairTextures(); this.mat.hair.map = ht.shell; this.mat.hairCard.map = ht.card; }
    Object.assign(this.mat.hairCard, { alphaTest: 0.35, side: THREE.DoubleSide });
    Object.assign(this.mat.stubble, { transparent: true, opacity: 0.2, depthWrite: false });
    Object.assign(this.mat.lens, { transparent: true, opacity: 0.75 });
    for (const k of ['top', 'pants', 'hair']) this.mat[k].side = THREE.DoubleSide;
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
    // A skeleton of bones drives ONE smooth skinned body mesh (see body.js).
    // Built facing its own +Z, then turned ±90° to stand sideways (regular/goofy).
    const bone = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); parent.add(b); return b; };
    this.bodyBase = joint(this.manualInner, 0, DECK_Y, 0);
    this.body = joint(this.bodyBase, 0, 0, 0);
    this.hips = bone(this.body, 0, 0.8, 0);
    const m = this.mat;
    m.top.map = this._cotton = getFabric('cotton');
    m.shoe.map = canvasWeave();
    m.eyeball.map = humanTex('eye.jpg');
    m.pack.map = canvasWeave(); m.hat.map = knitTexture(); m.sock.map = knitTexture();
    m.grip.map = gripTexture(); m.deckSide.map = plyTexture(); m.grip.color.setHex(0xffffff); m.deckSide.color.setHex(0xffffff);
    m.pants.map = getFabric('denim');
    this.belt = mesh(this.hips, new THREE.CylinderGeometry(0.168, 0.168, 0.035, 16).scale(1, 1, 0.64), m.sole, 0, 0.075, 0); // belt
    this.torso = bone(this.hips, 0, 0.08, 0);
    this.parts = {
      hood: mesh(this.torso, new THREE.SphereGeometry(0.12, 12, 8).scale(1.25, 0.6, 0.85), m.topDark, 0, 0.47, -0.095),
      pocket: box(this.torso, 0.22, 0.1, 0.02, m.topDark, 0, 0.15, 0.106),
      strings: [box(this.torso, 0.01, 0.12, 0.01, m.lace, -0.045, 0.39, 0.124), box(this.torso, 0.01, 0.12, 0.01, m.lace, 0.045, 0.39, 0.124)],
      jacketOpen: box(this.torso, 0.08, 0.3, 0.012, m.topTrim, 0, 0.3, 0.122),
      collar: mesh(this.torso, new THREE.TorusGeometry(0.075, 0.022, 6, 14).rotateX(Math.PI / 2), m.topDark, 0, 0.5, 0.005),
      flannel: [],
      pack: mesh(this.torso, new THREE.CapsuleGeometry(0.11, 0.14, 3, 10).scale(1.2, 1, 0.55), m.pack, 0, 0.28, -0.17),
      packStraps: [box(this.torso, 0.035, 0.34, 0.015, m.packDark, -0.1, 0.28, 0.126), box(this.torso, 0.035, 0.34, 0.015, m.packDark, 0.1, 0.28, 0.126)],
      cargo: [],
    };
    // flannel check stripes follow the torso's shape
    for (const [y, rx, rz] of [[0.12, 0.158, 0.106], [0.25, 0.176, 0.121], [0.37, 0.192, 0.127]]) {
      this.parts.flannel.push(mesh(this.torso, new THREE.CylinderGeometry(1, 1, 0.022, 18).scale(rx, 1, rz), m.topDark, 0, y, 0.006));
    }

    // head
    this.head = bone(this.torso, 0, 0.5, 0);
    mesh(this.head, new THREE.SphereGeometry(0.122, 18, 14).scale(0.98, 1.14, 1.04), m.skin, 0, 0.2, 0.004);
    mesh(this.head, new THREE.SphereGeometry(0.075, 12, 8).scale(1, 0.75, 0.9), m.skin, 0, 0.12, 0.04);              // jaw / chin
    mesh(this.head, new THREE.ConeGeometry(0.022, 0.05, 6).rotateX(Math.PI / 2 - 0.35), m.skinDark, 0, 0.185, 0.13);  // nose
    for (const sx of [-1, 1]) {
      mesh(this.head, new THREE.SphereGeometry(0.021, 10, 8).scale(1.15, 0.8, 0.55), m.topTrim, sx * 0.045, 0.218, 0.111); // eye white
      mesh(this.head, new THREE.SphereGeometry(0.0115, 8, 6).scale(1, 1, 0.5), m.eye, sx * 0.045, 0.218, 0.12);         // iris
      mesh(this.head, new THREE.BoxGeometry(0.05, 0.011, 0.012).rotateZ(-sx * 0.12), m.hair, sx * 0.047, 0.25, 0.115);   // eyebrow
      mesh(this.head, new THREE.SphereGeometry(0.03, 8, 6).scale(0.5, 1, 0.8), m.skinDark, sx * 0.122, 0.2, -0.005);     // ear
    }
    mesh(this.head, new THREE.BoxGeometry(0.045, 0.008, 0.01), m.lipColor || m.skinDark, 0, 0.14, 0.113);                // mouth
    this.faceParts = [...this.head.children];   // the simple face (replaced by the human head)
    this.hair = [
      mesh(this.head, hemi(0.13, 1.05), m.hair, 0, 0.225, -0.006),                                       // top
      mesh(this.head, new THREE.SphereGeometry(0.128, 14, 10).scale(1, 0.8, 0.62), m.hair, 0, 0.2, -0.048), // back
    ];
    // hats
    const H = () => joint(this.head, 0, 0, 0);
    this.hats = { beanie: H(), cap: H(), capBack: H(), helmet: H(), bucket: H() };
    mesh(this.hats.beanie, hemi(0.14, 1.25), m.hat, 0, 0.235, 0);
    mesh(this.hats.beanie, new THREE.CylinderGeometry(0.143, 0.143, 0.055, 16), m.hatDark, 0, 0.245, 0);
    mesh(this.hats.beanie, new THREE.SphereGeometry(0.04, 8, 6), m.hatDark, 0, 0.415, 0);
    for (const [g, dir] of [[this.hats.cap, 1], [this.hats.capBack, -1]]) {
      mesh(g, hemi(0.136, 0.9), m.hat, 0, 0.25, 0);
      mesh(g, new THREE.CylinderGeometry(0.11, 0.11, 0.012, 12, 1, false, -Math.PI / 2, Math.PI).scale(1, 1, 1.25), m.hatDark, 0, 0.255, dir * 0.11);
      mesh(g, new THREE.SphereGeometry(0.018, 6, 4), m.hatDark, 0, 0.375, 0);
    }
    mesh(this.hats.helmet, hemi(0.158, 1.0), m.hat, 0, 0.22, 0);
    mesh(this.hats.helmet, new THREE.CylinderGeometry(0.16, 0.16, 0.03, 16), m.hatDark, 0, 0.225, 0);
    mesh(this.hats.bucket, new THREE.CylinderGeometry(0.12, 0.138, 0.12, 16), m.hat, 0, 0.33, 0);
    mesh(this.hats.bucket, new THREE.CylinderGeometry(0.2, 0.2, 0.012, 18), m.hatDark, 0, 0.275, 0);

    // arms: shoulder → elbow (+ hand). Upper/fore arms are part of the skinned body.
    this.arms = [];
    for (const sgn of [-1, 1]) {
      const sh = bone(this.torso, sgn * 0.21, 0.42, 0);
      const el = bone(sh, 0, -0.3, 0);
      const cuff = mesh(el, new THREE.CylinderGeometry(0.036, 0.036, 0.035, 10), m.topDark, sgn * 0.018, -0.255, 0);
      const hand = joint(el, sgn * 0.018, -0.3, 0);
      mesh(hand, new THREE.BoxGeometry(0.028, 0.075, 0.075).translate(0, -0.03, 0), m.skin, 0, 0, 0);            // palm
      for (let f = 0; f < 4; f++) {                                                                                     // fingers, slightly curled
        const fz = -0.026 + f * 0.0175, len = [0.055, 0.062, 0.058, 0.047][f];
        const fg = mesh(hand, new THREE.CapsuleGeometry(0.0078, len - 0.016, 2, 6).translate(0, -len / 2, 0), m.skin, 0, -0.066, fz);
        fg.rotation.z = -sgn * 0.35;
      }
      const th = mesh(hand, new THREE.CapsuleGeometry(0.0095, 0.03, 2, 6).translate(0, -0.02, 0), m.skin, -sgn * 0.004, -0.02, 0.04); // thumb
      th.rotation.x = -0.6;
      this.arms.push({ sh, el, sgn, cuff, hand });
    }
    // legs: hip → knee → foot. Thighs and shins are part of the skinned body.
    this.legs = [];
    for (const sgn of [-1, 1]) {
      const hip = bone(this.hips, sgn * 0.09, 0, 0);
      hip.rotation.order = 'ZXY';
      this.parts.cargo.push(box(hip, 0.03, 0.11, 0.1, m.pantsDark, sgn * 0.088, -0.25, 0));
      const knee = bone(hip, 0, -THIGH, 0);
      const sock = mesh(knee, new THREE.CylinderGeometry(0.044, 0.042, 0.07, 10), m.lace, 0, -SHIN + 0.05, 0);
      const foot = bone(knee, 0, -SHIN, 0);
      mesh(foot, new THREE.CapsuleGeometry(0.052, 0.18, 4, 10).rotateX(Math.PI / 2).scale(1.1, 0.72, 1), m.shoe, 0, -0.012, 0.035);
      mesh(foot, new THREE.CapsuleGeometry(0.057, 0.19, 2, 10).rotateX(Math.PI / 2).scale(1.08, 0.25, 1), m.sole, 0, -0.045, 0.035);
      box(foot, 0.045, 0.01, 0.09, m.lace, 0, 0.026, 0.075);
      this.legs.push({ hip, knee, foot, sgn, sock });
    }
    // the smooth body itself, skinned to these bones
    this.bones = [this.hips, this.torso, this.head, this.arms[0].sh, this.arms[0].el, this.arms[1].sh, this.arms[1].el,
      this.legs[0].hip, this.legs[0].knee, this.legs[0].foot, this.legs[1].hip, this.legs[1].knee, this.legs[1].foot];
    this.root.updateMatrixWorld(true);
    // leg measurements used by the animation (replaced by the human's own proportions)
    this.thigh = THIGH; this.shin = SHIN; this.footH = FOOT_H; this.hipX = 0.09;
    try {
      this._useHuman();
    } catch (e) {
      console.warn('Human body unavailable, using the simple body', e);
      this.human = false;
      this.bodyMesh = buildBody(this.bones, { skin: m.skin, top: m.top, pants: m.pants }, this.body);
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

  // Swap in the realistic MakeHuman body (human.js): reshape the skeleton to its
  // proportions, hide the simple face / hands / shoes, add eyes and brows, and
  // fit hats and hair to the real head.
  _useHuman() {
    const m = this.mat;
    const fit = fitSkeleton(this);
    this.human = true;
    for (const p of this.faceParts) p.visible = false;
    for (const A of this.arms) { A.hand.visible = false; A.cuff.visible = false; }
    for (const L of this.legs) { for (const c of L.foot.children) c.visible = false; L.sock.visible = false; }
    // eyeballs with a photo iris (MakeHuman CC0 eye texture, projected from the front)
    this._eyes = [0, 1].map(() => {
      const eg = new THREE.SphereGeometry(0.0118, 20, 14), ep = eg.attributes.position, euv = eg.attributes.uv;
      for (let k = 0; k < ep.count; k++) euv.setXY(k, ep.getX(k) / 0.0118 * 0.5 + 0.5, ep.getY(k) / 0.0118 * 0.5 + 0.5);
      const eye = new THREE.Mesh(eg, m.eyeball); this.head.add(eye); return eye;
    });
    this.headWear = new THREE.Group();
    this.head.add(this.headWear);
    for (const g of [...Object.values(this.hats), ...this.hair]) this.headWear.add(g);
    // clothing extras that only fit the simple body
    const P = this.parts;
    for (const x of [P.pocket, ...P.strings, P.jacketOpen, P.collar, ...P.flannel]) x.visible = false;
    this._hideExtras = true;
    for (const h of this.hair) h.visible = false;      // real hair meshes / scalp layers instead
    this._hairless = true;
    m.skin.map = humanTex('skin.jpg');                 // photo skin (MakeHuman CC0), tinted by skin tone
    this.onRefit = (f) => this._fitBody(f);            // the woman's body re-fits the skeleton
    this._fitBody(fit);
    this.bodyMesh = buildHuman(this);
    if (this.belt) this.belt.visible = false;
    // proper sneakers on the real feet
    for (const L of this.legs) this._makeSneaker(L.foot);
  }

  // everything that depends on the body's proportions: leg lengths for the IK,
  // eyes, hats, glasses, hood and backpack
  _fitBody(fit) {
    this.thigh = fit.thigh; this.shin = fit.shin; this.footH = fit.footH; this.hipX = fit.hipX;
    const J = fit.joints, neck = J.neck;
    ['l', 'r'].forEach((side, i) => this._eyes[i].position.copy(J[side + '-eye']).sub(neck));
    // fit hats (designed for the old head) onto the real head
    const top = J['head-2'].y, eyeY = J['l-eye'].y;
    const ry = (top - eyeY) * 1.149, rx = 0.082 * Math.abs(J['l-eye'].x) / 0.0298, rz = 0.1;
    const oldC = new THREE.Vector3(0, 0.2, 0.004), oldR = new THREE.Vector3(0.1196, 0.139, 0.127);
    const scale = new THREE.Vector3(rx / oldR.x, ry / oldR.y, rz / oldR.z);
    const newC = new THREE.Vector3(0, top - ry, J['l-eye'].z - 0.088).sub(neck);
    this.headWear.scale.copy(scale);
    this.headWear.position.copy(newC).sub(oldC.clone().multiply(scale));
    const P = this.parts;
    const chestY = J['l-shoulder'].y - J['spine-4'].y - 0.14;
    P.pack.position.set(0, chestY, -0.16);
    P.packStraps.forEach((st, i) => st.position.set(i ? 0.08 : -0.08, chestY, 0.11));
    P.hood.position.set(0, J.neck.y - J['spine-4'].y - 0.01, -0.085);
    P.hood.scale.set(0.85, 0.85, 0.85);
    if (this.belt) this.belt.position.y = J['spine-4'].y - (J['l-upper-leg'].y) - 0.02;
    if (this.glasses) { this.head.remove(this.glasses); this.glasses = null; }
    this._makeGlasses(J);
    if (this.outfit) this.glasses.visible = !!this.outfit.glasses && this.outfit.glasses !== 'none';
  }

  // glasses on the real face (clear frames or shades)
  _makeGlasses(J) {
    const m = this.mat, g = new THREE.Group();
    const neck = new THREE.Vector3(...[J.neck.x, J.neck.y, J.neck.z]);
    for (const side of ['l', 'r']) {
      const e = J[side + '-eye'].clone().sub(neck);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0205, 18).scale(1.12, 0.86, 1), m.lens);
      lens.position.set(e.x * 1.04, e.y - 0.002, e.z + 0.02); g.add(lens);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0023, 5, 20).scale(1.12, 0.86, 1), m.frame);
      rim.position.copy(lens.position); g.add(rim);
      const sx = Math.sign(e.x);
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.004, 0.105), m.frame);
      temple.position.set(sx * 0.071, e.y + 0.002, e.z - 0.032); temple.rotation.y = -sx * 0.06; g.add(temple);
    }
    const e = J['l-eye'].clone().sub(neck);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0035, 0.004), m.frame);
    bridge.position.set(0, e.y + 0.004, e.z + 0.021); g.add(bridge);
    g.traverse((o) => { o.castShadow = false; });
    g.visible = false;
    this.head.add(g);
    this.glasses = g;
  }

  // A low-poly sneaker built from a foot-shaped outline: contoured rubber sole,
  // rounded upper that slopes down into the toe box, heel collar, tongue, laces.
  _makeSneaker(foot) {
    const m = this.mat;
    if (!m.soleW) m.soleW = new THREE.MeshLambertMaterial({ color: 0xf2efe8 });
    const outline = (inset) => {
      // half-widths along the foot (z: heel -0.075 → toe +0.215)
      const pts = [[-0.075, 0.03], [-0.06, 0.04], [-0.02, 0.041], [0.05, 0.043], [0.12, 0.052], [0.17, 0.05], [0.2, 0.038], [0.215, 0.018]];
      const sh = new THREE.Shape();
      const R = pts.map(([z, w]) => [Math.max(0.004, w - inset), z + (z > 0 ? -inset : inset)]);
      sh.moveTo(0, R[0][1] - 0.006 + inset);
      for (const [w, z] of R) sh.lineTo(w, z);
      sh.lineTo(0, 0.218 - inset);
      for (let i = R.length - 1; i >= 0; i--) sh.lineTo(-R[i][0], R[i][1]);
      sh.closePath();
      return sh;
    };
    const fh = this.footH;
    // sole: thick rubber, slightly flared
    const sole = new THREE.ExtrudeGeometry(outline(0), { depth: 0.015, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 4 });
    sole.rotateX(Math.PI / 2); sole.translate(0, -fh + 0.019, 0);           // thin vulcanised sole, bottom at -fh
    const soleM = new THREE.Mesh(sole, m.soleW); soleM.castShadow = true; foot.add(soleM);
    // upper: rounded, lower over the toes
    const up = new THREE.ExtrudeGeometry(outline(0.007), { depth: 0.058, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.012, bevelSegments: 3, curveSegments: 6 });
    up.rotateX(Math.PI / 2); up.translate(0, -fh + 0.021 + 0.074, 0);
    const pa = up.attributes.position, base = -fh + 0.019;
    for (let i = 0; i < pa.count; i++) {
      const z = pa.getZ(i), y = pa.getY(i);
      const t = Math.min(1, Math.max(0, (z - 0.06) / 0.155));
      pa.setY(i, base + (y - base) * (1 - 0.5 * t * t));
    }
    up.computeVertexNormals();
    const upM = new THREE.Mesh(up, m.shoe); upM.castShadow = true; foot.add(upM);
    // heel collar, tongue, laces
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 6, 14).rotateX(Math.PI / 2).scale(0.95, 1, 1.15), m.shoe);
    collar.position.set(0, -fh + 0.103, -0.022); foot.add(collar);
    const tongue = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.01, 0.075), m.shoe);
    tongue.position.set(0, -fh + 0.109, 0.04); tongue.rotation.x = -0.45; foot.add(tongue);
    for (let i = 0; i < 4; i++) {
      const lace = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.006, 0.007), m.lace);
      lace.position.set(0, -fh + 0.094 - i * 0.008, 0.045 + i * 0.022); foot.add(lace);
    }
    // rubber toe cap and a plain side stripe (classic skate-shoe look, no logos)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 0.55, 0.9), m.soleW);
    cap.position.set(0, -fh + 0.026, 0.172); foot.add(cap);
    for (const sx of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.011, 0.1), m.soleW);
      st.position.set(sx * 0.05, -fh + 0.052, 0.035); st.rotation.x = 0.32; st.rotation.y = sx * 0.08; foot.add(st);
    }
  }

  // A real skateboard (all procedural):
  //  * deck: popsicle outline, 8.25" wide, concave across the width and kicked-up
  //    nose & tail, 7-ply edge, grip tape on top, a printed graphic underneath
  //  * trucks: baseplate with 4 bolts (heads on the grip), kingpin, bushings,
  //    pivot, tapered hanger and axle
  //  * wheels: lathe-turned urethane with a rounded lip, a core and a bearing
  //    shield + axle nut. Size & colour come from the Closet.
  _makeBoard(parent) {
    const m = this.mat;
    const L = 0.81, W = 0.21, T = 0.012, KICK = 0.33, NOSE_Z = 0.265;
    const hw = (z) => {                                   // half width along the deck
      const c = L / 2 - W / 2, az = Math.abs(z);
      return az <= c ? W / 2 : Math.sqrt(Math.max(0, (W / 2) ** 2 - (az - c) ** 2)) * 0.98 + 0.002;
    };
    const lift = (x, z) => {                              // concave + kicks
      const az = Math.abs(z);
      return 0.0055 * (x / (W / 2)) ** 2 + (az > NOSE_Z ? Math.pow(az - NOSE_Z, 1.15) * Math.tan(KICK) * 1.25 : 0);
    };
    const NX = 10, NZ = 48;
    const deckGeo = (yOff, top, uvMode) => {
      const P = [], U = [], I = [];
      for (let j = 0; j <= NZ; j++) {
        const z = -L / 2 + L * j / NZ, h = hw(z);
        for (let i = 0; i <= NX; i++) {
          const x = -h + 2 * h * i / NX;
          P.push(x, lift(x, z) + yOff, z);
          U.push(uvMode === 'grip' ? (x + W / 2) * 6 : (x / W + 0.5), uvMode === 'grip' ? (z + L / 2) * 6 : (z / L + 0.5));
        }
      }
      for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
        const q = j * (NX + 1) + i, r = q + NX + 1;
        if (top) I.push(q, r, q + 1, q + 1, r, r + 1); else I.push(q, q + 1, r, q + 1, r + 1, r);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.setIndex(I); g.computeVertexNormals();
      return g;
    };
    const edgeGeo = () => {                               // 7-ply side wall all the way round
      const P = [], U = [], I = [];
      const ring = [];
      for (let j = 0; j <= NZ; j++) { const z = -L / 2 + L * j / NZ; ring.push([hw(z), z]); }
      for (let j = NZ; j >= 0; j--) { const z = -L / 2 + L * j / NZ; ring.push([-hw(z), z]); }
      ring.forEach(([x, z], k) => { const y = lift(x, z); P.push(x, y + T / 2, z, x, y - T / 2, z); U.push(k / ring.length * 8, 1, k / ring.length * 8, 0); });
      for (let k = 0; k < ring.length - 1; k++) { const q = k * 2; I.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      g.setIndex(I); g.computeVertexNormals();
      return g;
    };
    // static parts are merged per material at the end (a handful of draw calls per board)
    const buckets = new Map();
    const add = (geo, mat, x = 0, y = 0, z = 0, shadow = true, rotX = 0) => {
      if (rotX) geo.rotateX(rotX);
      geo.translate(x, y, z);
      if (!buckets.has(mat)) buckets.set(mat, []);
      buckets.get(mat).push(geo.index ? geo.toNonIndexed() : geo);
    };
    const Y0 = 0.006;                                     // deck centre height (grip top ≈ board origin + 0.012)
    add(deckGeo(Y0 + T / 2 + 0.0008, true, 'grip'), m.grip);
    add(deckGeo(Y0 - T / 2, false, 'graphic'), m.deck);
    add(edgeGeo().translate(0, Y0, 0), m.deckSide);
    const wheels = [];
    const R = this.wheelRadius || 0.027;
    for (const z of [-0.205, 0.205]) {
      const by = Y0 - T / 2 + lift(0, z);
      // baseplate + riser-less mount, 4 bolts through the deck (heads on the grip)
      add(new THREE.BoxGeometry(0.058, 0.009, 0.074), m.truck, 0, by - 0.0045, z);
      for (const [bx, bz] of [[-0.02, -0.027], [0.02, -0.027], [-0.02, 0.027], [0.02, 0.027]]) {
        add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 6), m.bolt, bx, Y0 + T / 2 + lift(bx, z + bz) + 0.0015, z + bz, false);
        add(new THREE.CylinderGeometry(0.0028, 0.0028, 0.006, 6), m.bolt, bx, by - 0.011, z + bz, false);   // nut
      }
      const toC = Math.sign(z);                           // kingpin leans toward the board centre
      add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.04, 8), m.bolt, 0, by - 0.022, z - toC * 0.012, false, toC * 0.6);
      for (const [dy, r] of [[-0.016, 0.011], [-0.03, 0.0105]]) {                                   // bushings
        add(new THREE.CylinderGeometry(r, r * 0.92, 0.011, 12), m.bushing, 0, by + dy, z - toC * (0.012 - dy * 0.35), false, toC * 0.6);
      }
      // hanger: tapered body + axle
      const hg = new THREE.CylinderGeometry(0.016, 0.009, 0.15, 10, 1).rotateZ(Math.PI / 2);
      const hp = hg.attributes.position;
      for (let i = 0; i < hp.count; i++) { const x = hp.getX(i); hp.setY(i, hp.getY(i) * (1 - 0.35 * Math.abs(x) / 0.075)); }
      hg.computeVertexNormals();
      const ay = -0.094 + R;                              // wheels sit on the ground plane of the board
      add(hg, m.truck, 0, ay + 0.008, z);
      add(new THREE.CylinderGeometry(0.004, 0.004, 0.215, 8).rotateZ(Math.PI / 2), m.bolt, 0, ay, z, false);
      add(new THREE.SphereGeometry(0.014, 10, 6).scale(1, 1.1, 1.3), m.truck, 0, ay + 0.02, z - toC * 0.02);   // pivot
      // wheels: lathe profile with a rounded lip
      const prof = [];
      const wW = 0.033;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10, a = t * Math.PI;
        prof.push(new THREE.Vector2(R * 0.62 + (R * 0.38) * Math.sin(a) ** 0.35, -wW / 2 + wW * t));
      }
      const wheelGeo = new THREE.LatheGeometry(prof.reverse(), 24).rotateZ(Math.PI / 2);   // (order sets the outward normals)
      for (const x of [-0.088, 0.088]) {
        const spin = joint(parent, x, ay, z);
        const w = new THREE.Mesh(wheelGeo, m.wheel); w.castShadow = true; spin.add(w);
        const coreParts = [new THREE.CylinderGeometry(R * 0.62, R * 0.62, wW * 0.98, 16, 1, true).rotateZ(Math.PI / 2)], shieldParts = [];
        for (const sx of [-1, 1]) {
          coreParts.push(new THREE.CircleGeometry(R * 0.62, 16).rotateY(sx * Math.PI / 2).translate(sx * wW * 0.49, 0, 0));
          shieldParts.push(new THREE.RingGeometry(0.0045, 0.011, 14).rotateY(sx * Math.PI / 2).translate(sx * wW * 0.495, 0, 0));
        }
        spin.add(new THREE.Mesh(mergeGeometries(coreParts.map((g2) => g2.toNonIndexed())), m.wheelCore));
        spin.add(new THREE.Mesh(mergeGeometries(shieldParts.map((g2) => g2.toNonIndexed())), m.bearing));
        add(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 6).rotateZ(Math.PI / 2), m.bolt, x + Math.sign(x) * 0.02, ay, z, false);   // axle nut
        wheels.push(spin);
      }
    }
    for (const [mat, list] of buckets) {
      const o = new THREE.Mesh(mergeGeometries(list), mat);
      o.castShadow = mat !== m.bolt; o.receiveShadow = true;
      parent.add(o);
    }
    return wheels;
  }


  // ---------------------------------------------------------------- outfits
  applyOutfit(o) {
    o = { ...DEFAULT_OUTFIT, ...o };
    const m = this.mat, dark = (hex, f = 0.78) => new THREE.Color(hex).multiplyScalar(f);
    m.skin.color.setHex(o.skin); m.skinDark.color.copy(dark(o.skin, 0.86));
    m.hair.color.setHex(o.hairColor);
    for (const k of ['brow', 'hairCard', 'stubble']) m[k].color.setHex(o.hairColor);
    m.brow.color.multiplyScalar(0.8);
    // hair textures are mid-grey: lift the colour so the tint matches the swatch
    m.hair.color.multiplyScalar(1.25); m.hairCard.color.multiplyScalar(1.25);
    if (this.glasses) {
      this.glasses.visible = !!o.glasses && o.glasses !== 'none';
      const shades = o.glasses === 'shades';
      m.lens.color.setHex(shades ? 0x101418 : 0xdfe8ee); m.lens.opacity = shades ? 0.82 : 0.14;
      m.frame.color.setHex(shades ? 0x111111 : o.glasses === 'round' ? 0xb08d57 : 0x222222);
    }
    m.top.color.setHex(o.topColor); m.topDark.color.copy(dark(o.topColor, o.top === 'flannel' ? 0.55 : 0.78));
    m.pants.color.setHex(o.pantsColor); m.pantsDark.color.copy(dark(o.pantsColor));
    m.shoe.color.setHex(o.shoeColor);
    m.sock.color.setHex(o.sockColor ?? 0xf2f2f2);
    m.hat.color.setHex(o.hatColor); m.hatDark.color.copy(dark(o.hatColor));
    m.deck.map = deckTexture(o.deckGraphic || 'stripes', o.deckColor); m.deck.color.setHex(0xffffff); m.deck.needsUpdate = true;
    m.deckSide.color.setHex(0xffffff);
    m.wheel.color.setHex(o.wheelColor ?? 0xf8f4e3); m.wheelCore.color.copy(dark(o.wheelColor ?? 0xf8f4e3, 0.8));
    const wr = { 52: 0.026, 54: 0.027, 56: 0.028, 60: 0.03 }[o.wheelSize || 54] || 0.027;
    if (wr !== this.wheelRadius) {                       // bigger / smaller wheels: rebuild the boards
      this.wheelRadius = wr;
      for (const [holder, key] of [[this.board, 'wheels'], [this.looseBoard, 'looseWheels']]) {
        for (const c of [...holder.children]) { holder.remove(c); c.traverse((o2) => o2.geometry && o2.geometry.dispose()); }
        this[key] = this._makeBoard(holder);
      }
    }
    const P = this.parts, show = (x, v) => (Array.isArray(x) ? x : [x]).forEach((p) => { p.visible = v; });
    const simple = !this._hideExtras;
    show(P.hood, o.top === 'hoodie'); show(P.pocket, simple && o.top === 'hoodie'); show(P.strings, simple && o.top === 'hoodie');
    show(P.jacketOpen, simple && o.top === 'jacket'); show(P.collar, simple && (o.top === 'jacket' || o.top === 'flannel'));
    show(P.flannel, simple && o.top === 'flannel');
    show(P.pack, simple && !!o.backpack); show(P.packStraps, simple && !!o.backpack);
    show(P.hood, simple && o.top === 'hoodie');
    m.pack.color.setHex(o.packColor ?? 0x264653); m.packDark.color.copy(dark(o.packColor ?? 0x264653, 0.6));
    show(P.cargo, simple && o.pants === 'cargo');
    m.top.map = o.top === 'flannel' ? plaidTexture() : this._cotton || m.top.map;
    for (const A of this.arms) A.cuff.visible = !this.human && o.top !== 'tee' && o.top !== 'tank';
    for (const L of this.legs) L.sock.visible = !this.human && o.pants === 'shorts';
    if (this.seams) for (const r of this.seams) if (r && r.userData.hem) r.visible = o.pants !== 'shorts';
    if (this.bodyMesh) this.bodyMesh.setOutfit(o);   // tee = bare forearms, shorts = bare shins
    for (const [k, g] of Object.entries(this.hats)) g.visible = !this.human && o.hat === k;   // the real body gets fitted hats
    this.hair[0].visible = !this._hairless && o.hat === 'none';
    if (this._hairless) this.hair[1].visible = false;
    this.stance = o.stance === 'goofy' ? -1 : 1;
    this.mongo = o.pushStyle === 'mongo';
    this.outfit = o;
  }

  // High/Ultra: physically based materials (skin, cloth, rubber and metal react to
  // light and sky reflections differently). Low: cheap Lambert shading.
  setQuality(level) {
    const pbr = level === 'high' || level === 'ultra';
    if (!this._lambert) this._lambert = { ...this.mat };
    if (!this._pbr) {
      const R = { skin: 0.5, skinDark: 0.55, eye: 0.15, topTrim: 0.3, truck: 0.35, wheel: 0.5, grip: 0.95, deck: 0.6, deckSide: 0.6, sole: 0.8, shoe: 0.75, hair: 0.55, hairCard: 0.55, brow: 0.7, stubble: 0.9, lens: 0.05, frame: 0.35 };
      const metal = { truck: 0.75, frame: 0.2, bolt: 0.85, bearing: 0.6 };
      this._pbr = {};
      for (const [k, m] of Object.entries(this._lambert)) {
        const props = { color: m.color, map: m.map || null, roughness: R[k] ?? 0.92, metalness: metal[k] ?? 0,
          side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, depthWrite: m.depthWrite };
        if (k === 'skin' || k === 'skinDark') {
          // skin: a soft reddish sheen at grazing angles fakes light scattering under the skin
          this._pbr[k] = new THREE.MeshPhysicalMaterial({ ...props, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xff8c6e), clearcoat: 0.06, clearcoatRoughness: 0.6 });
        } else if (k === 'hair' || k === 'hairCard') {
          this._pbr[k] = new THREE.MeshPhysicalMaterial({ ...props, sheen: 0.5, sheenRoughness: 0.35, sheenColor: new THREE.Color(0x8a7560) });
        } else this._pbr[k] = new THREE.MeshStandardMaterial(props);
      }
    }
    const from = pbr ? this._lambert : this._pbr, to = pbr ? this._pbr : this._lambert;
    const swap = new Map(Object.keys(from).map((k) => [from[k], to[k]]));
    const fix = (o) => {
      if (!o.material) return;
      if (Array.isArray(o.material)) o.material = o.material.map((m) => swap.get(m) || m);
      else if (swap.has(o.material)) o.material = swap.get(o.material);
    };
    this.root.traverse(fix); this.looseBoard.traverse(fix);
    this.mat = to;
    this.applyOutfit(this.outfit || DEFAULT_OUTFIT);   // re-apply colours to the new set
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
    // targets are given in body space; the legs hang from the (tilted) pelvis
    const th = this._tilt || 0;
    if (th) { const c = Math.cos(th), sn = Math.sin(th), y = ty, z = tz; ty = y * c + z * sn; tz = -y * sn + z * c; }
    const T = this.thigh, Sh = this.shin;
    const len = Math.min(Math.hypot(tx, ty, tz), T + Sh - 0.001);
    // knee angle from the law of cosines (works for unequal thigh / shin)
    const cosK = (T * T + Sh * Sh - len * len) / (2 * T * Sh);
    const kneeBend = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosK)));
    const k = Math.acos(Math.max(-1, Math.min(1, (T * T + len * len - Sh * Sh) / (2 * T * len))));
    const splay = Math.atan2(tx, -ty);
    const fwd = Math.atan2(tz, Math.hypot(tx, ty));
    L.hip.rotation.set(-(k + fwd), 0, splay);
    L.knee.rotation.set(kneeBend, 0, 0);   // knees only hinge (clears any twist left from the bind pose)
    L.foot.rotation.set(k + fwd - kneeBend - th, 0, -splay);   // keep the foot flat: cancels pelvis + hip + knee pitch
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
    // knee compression comes straight from the physics (spring-damper); walking landings still dip
    a.dip = damp(a.dip, 0, 6, dt);
    if (st.landDip) a.dip = Math.max(a.dip, st.landDip);
    if (st.comp !== undefined && mode !== 'walk') a.dip = Math.max(st.comp, mode === 'air' ? 0 : a.dip * 0);
    const pushing = st.pushPhase >= 0 && mode === 'ride';
    a.push = damp(a.push, pushing ? 1 : 0, 12, dt);

    // wheels
    this.wheelAngle += (st.wheelSpeed || 0) * dt / 0.03;
    for (const w of this.wheels) w.rotation.x = this.wheelAngle;

    // board flip / shuv / pop lift
    this.board.rotation.y = st.shuvAngle || 0;
    // the deck tilts on its trucks when you lean into a turn, and shakes on a sketchy landing
    a.deckRoll = damp(a.deckRoll || 0, mode === 'ride' ? -st.lean * 0.13 : 0, 8, dt);
    // the deck tips toward the side the rider's weight is falling (balance physics)
    a.bal = damp(a.bal || 0, st.balance || 0, 30, dt);
    const shake = -a.bal * this.stance * 0.35;
    // wheel chatter (rough ground) and speed wobbles shake the deck on its trucks
    const now = performance.now() / 1000, ch = st.chatter || 0, wb = st.wobble || 0;
    const buzz = ch * 0.012 * Math.sin(now * 83) + ch * 0.008 * Math.sin(now * 131);
    this.board.rotation.z = (st.flipAngle || 0) + a.deckRoll + shake + buzz + wb * 0.09 * Math.sin(now * 11);
    this.board.rotation.x = ch * 0.006 * Math.sin(now * 97) + (st.pitchAngle || 0);
    this.board.position.y = DECK_Y - 0.012 + (st.boardLift || 0);

    // manual pivot (tail wheels for manual, nose wheels for nose manual)
    const piv = a.manual >= 0 ? -0.3 : 0.3;
    this.manualPivot.position.z = piv; this.manualInner.position.z = -piv;
    this.manualPivot.rotation.x = -a.manual;

    // ---------------- base pose
    const legL = this.thigh + this.shin;
    // athletic skate stance: knees always a little bent
    const stand = 0.84 * legL + this.footH, low = 0.47 * legL + this.footH;
    const bend = Math.min(1, Math.max(a.crouch, a.tuck * 0.55, a.grab * 0.95) + a.dip * 0.6);
    let hipH = lerp(stand, low, bend);
    hipH -= a.push * 0.08;                    // bend the standing knee (a little) so the push foot reaches the floor
    this.hips.position.set(0, hipH, 0);
    // real crouches hinge at the hips too: the pelvis tips forward as you go down
    // (the legs' IK and the torso compensate, so feet and shoulders stay put)
    this._tilt = 0.1 + bend * 0.5 + a.push * 0.05 - Math.abs(a.manual) * 0.25;
    this.hips.rotation.set(this._tilt, 0, 0);
    this.bodyBase.position.set(0, DECK_Y + (st.boardLift || 0), 0);
    this.bodyBase.rotation.set(0, 0, 0);
    // open the shoulders toward the nose while pushing
    // pushing: hips & shoulders turn to face the nose (like a real push), upright torso
    const pushTurn = -s * Math.PI / 2 * a.push * 0.7;
    this.body.rotation.set(0, s * Math.PI / 2 + pushTurn, 0);
    // foot targets are worked out in the sideways (riding) frame; this maps them into the turned body
    const cT = Math.cos(-pushTurn), sT = Math.sin(-pushTurn);
    const rx = (x, z) => x * cT + z * sT, rz = (x, z) => -x * sT + z * cT;
    this.boardHolder.position.set(0, 0, 0);
    this.boardHolder.rotation.set(0, 0, 0);

    // legs stand on the deck: leg 0 at body -X, leg 1 at body +X.
    // Regular: body -X is the board nose. Goofy turns the body the other way, so
    // body +X is the nose and the right foot leads.
    // leg 0 is at body -X: the front foot when regular, the back foot when goofy
    const frontIdx = s > 0 ? 0 : 1;
    const footPos = (i) => (i === 0 ? -1 : 1) * (i === frontIdx ? FRONT_FOOT : BACK_FOOT);
    // FOOTPLANT
    //  * feet sit centred across the deck: heels just over the heel edge, toes
    //    hanging a little over the toe edge (shoes are longer than a deck is wide)
    //  * while a flip / shuvit spins under you, both feet lift clear of the
    //    board (front foot flicks off toward the toe side) and come back down
    //    onto it as it finishes — the catch
    //  * on the ollie the front foot slides up toward the nose
    //  * ankles roll with the deck when it tilts on its trucks in a carve
    const fa = st.flipAngle || 0, sa = st.shuvAngle || 0;
    const spin = Math.min(1, 2.6 * (Math.abs(Math.sin(fa / 2)) + Math.abs(Math.sin(sa / 2))));
    a.clear = damp(a.clear || 0, mode === 'air' ? spin : 0, 22, dt);
    a.slideUp = damp(a.slideUp || 0, mode === 'air' && (st.airTime || 0) < 0.35 ? 1 : 0, 10, dt);
    for (let i = 0; i < 2; i++) {
      const L = this.legs[i], front = i === frontIdx;
      const nose = s > 0 ? -1 : 1;                                  // body-X direction of the nose
      const x = footPos(i) + (front ? nose * 0.07 * a.slideUp * (1 - a.clear) : 0);
      const lift = a.clear * (front ? 0.2 : 0.15);
      const zOff = -0.045 + (front ? a.clear * 0.09 : a.clear * 0.02);
      this._legIK(L, rx(x, zOff) - L.sgn * this.hipX, -hipH + this.footH + lift, rz(x, zOff));
      // real footplant: front foot angled toward the nose, back foot across the tail
      L.foot.rotation.y = (front ? -s * 0.42 : s * 0.12) - pushTurn * 0.6;
      // ankle follows the deck's roll (toe / heel edge pressure in a carve)
      L.foot.rotation.x += s * (a.deckRoll || 0) * 0.9;
      // pointed toes while flicking
      L.foot.rotation.x += a.clear * (front ? 0.35 : 0.15);
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
      const ground = -hipH - DECK_Y + this.footH;
      const P3 = (x, y, z) => [rx(x, z) - L.sgn * this.hipX, y, rz(x, z)];
      const onDeck = P3(footPos(idx), -hipH + this.footH, -0.045);
      const start = P3(dirTail * -0.12, ground, 0.22);
      const end = P3(dirTail * 0.42, ground, 0.18);
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
    // (air tuck comes from the lower hips; the IK keeps the feet on the board)

    // torso, head, arms
    // upper body: lean (minus what the pelvis already tilts), shoulders opened toward the nose
    this.torso.rotation.x = 0.15 + a.crouch * 0.35 + a.grab * 0.5 + a.lean * 0.25 + a.dip * 0.3 + a.push * 0.1 - this._tilt * 0.8;
    this.torso.rotation.y = -s * 0.32 * (1 - a.push);
    this.torso.rotation.z = (-a.manual * 0.9 + a.slide * 0.1) * s;
    // balance: the upper body leans with the centre of mass (toe / heel side), head stays level
    this.torso.rotation.x += a.bal * s * 1.1;
    this.head.rotation.y = s * (-0.95 + a.lean * 0.15) * (1 - a.push * 0.8);
    this.head.rotation.x = -0.1 - a.crouch * 0.2 - (a.bal || 0) * s * 0.5;
    const t = performance.now() / 1000;
    for (const A of this.arms) {
      const wobble = (mode === 'manual' || mode === 'grind') ? Math.sin(t * 7 + A.sgn) * 0.15 : 0;
      const swing = a.push * Math.sin((st.pushPhase || 0) * Math.PI * 2 + A.sgn) * 0.5;
      // relaxed arms: hang near the body with soft elbows, spread for balance on rails / manuals
      A.sh.rotation.set(0.12 + a.dip * 0.3 + swing + a.crouch * 0.25, 0, A.sgn * (0.1 + a.armsOut * 0.55 + wobble + a.dip * 0.35 + Math.min(0.9, Math.abs(a.bal) * 2.2)) * (1 - a.push * 0.6));
      A.el.rotation.set(-0.45 - a.push * 0.3 - a.crouch * 0.3, 0, 0);
    }
    if (a.grab > 0.01) {
      const A = this.arms[st.grabHand === 'back' ? 1 : 0];
      A.sh.rotation.x = lerp(A.sh.rotation.x, 0.9, a.grab);
      A.sh.rotation.z = lerp(A.sh.rotation.z, A.sgn * 0.1, a.grab);
      A.el.rotation.x = lerp(A.el.rotation.x, -0.2, a.grab);
    }

    // ---------------- walk / run mode (the board is left on the ground)
    // A proper gait cycle: each thigh swings forward and back, the knee folds as
    // the leg swings through and straightens to land on the heel, the foot rolls
    // and pushes off, arms swing opposite to the legs, the body bobs each step
    // and leans into a run.
    if (a.walk > 0.01) {
      const spd = st.walkSpeed || 0, run = Math.min(1, Math.max(0, (spd - 2.6) / 2.6));
      const move = Math.min(1, spd / 1.2);
      this.walkPhase += dt * spd * (2.7 - run * 0.7);            // steps per metre (runs take longer strides)
      const ph = this.walkPhase;
      this.body.rotation.y = lerp(s * Math.PI / 2, 0, a.walk);
      const bob = Math.abs(Math.cos(ph)) * (0.025 + run * 0.05) * move;
      this.bodyBase.position.y = lerp(DECK_Y, 0.02 + bob, a.walk);
      const legH = this.thigh + this.shin + this.footH;
      this.hips.position.y = lerp(hipH, legH - 0.035 - run * 0.06 - (1 - move) * 0.0, a.walk);
      const hipAmp = (0.42 + run * 0.4) * move, kneeAmp = (0.95 + run * 0.9) * move;
      for (let i = 0; i < 2; i++) {
        const L = this.legs[i], p = ph + (i === 0 ? 0 : Math.PI);
        const thigh = Math.sin(p) * hipAmp;                          // + = thigh forward
        const kneeBendW = 0.08 + Math.max(0, Math.cos(p - 0.5)) * kneeAmp; // fold while swinging through
        L.hip.rotation.set(lerp(L.hip.rotation.x, -thigh, a.walk), 0, lerp(L.hip.rotation.z, 0, a.walk));
        L.hip.rotation.y = 0;
        L.knee.rotation.set(lerp(L.knee.rotation.x, kneeBendW, a.walk), 0, 0);
        // foot: flat-ish, toe pushes off at the back of the stride, toes up before heel strike
        const footPitch = thigh - kneeBendW - this.hips.rotation.x + Math.max(0, -Math.sin(p)) * 0.35 * move - Math.max(0, Math.sin(p)) * 0.15 * move;
        L.foot.rotation.set(lerp(L.foot.rotation.x, footPitch, a.walk), 0, 0);
      }
      this.hips.rotation.x = lerp(this._tilt, 0.04 + run * 0.12, a.walk);
      this.torso.rotation.x = lerp(this.torso.rotation.x, 0.02 + run * 0.14, a.walk);
      this.torso.rotation.z = 0;
      this.torso.rotation.y = Math.sin(ph) * 0.1 * move;               // shoulders counter-rotate
      this.head.rotation.y = lerp(this.head.rotation.y, -Math.sin(ph) * 0.06 * move, a.walk);
      this.head.rotation.x = -run * 0.12;
      for (let i = 0; i < 2; i++) {                                     // arms swing opposite to the legs
        const A = this.arms[i], p = ph + (i === 0 ? Math.PI : 0);
        const sw = Math.sin(p) * (0.38 + run * 0.55) * move;
        A.sh.rotation.set(-sw + run * 0.1, 0, A.sgn * (0.08 + run * 0.06));
        A.el.rotation.set(-(0.25 + run * 1.15) - Math.max(0, -sw) * 0.3, 0, 0);
      }
      if (st.walkAir) {                                                 // jumping: knees up, arms up and out
        for (const L of this.legs) { L.hip.rotation.x -= 0.55; L.knee.rotation.x += 0.85; L.foot.rotation.x -= 0.3; }
        for (const A of this.arms) { A.sh.rotation.x -= 0.6; A.sh.rotation.z += A.sgn * 0.45; }
      }
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
