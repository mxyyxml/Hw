// =============================================================================
//  decals.js — makes the city look lived-in: original graffiti pieces on walls,
//  and cracks, oil stains, gum spots and wheel scuffs on the ground.
//  Everything is drawn once into a single texture atlas and every decal is a
//  quad in ONE merged mesh (a single draw call for the whole city).
// =============================================================================
import * as THREE from 'three';

const rngOf = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// atlas layout (1024 × 1024): top half = 4 graffiti pieces (512 × 256 each),
// bottom half = 8 ground marks (256 × 256 each)
function buildAtlas() {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d'), r = rngOf(17);
  x.clearRect(0, 0, 1024, 1024);
  // ---- graffiti: chunky outlined letters with a fill gradient, drips and a 3D drop shadow
  const words = ['SK8', 'RAD', 'NOLLIE', 'LUNCH'];
  const fills = [['#f2c14e', '#e63946'], ['#2a9d8f', '#9be7ff'], ['#9b5de5', '#f15bb5'], ['#f4a261', '#ffe066']];
  words.forEach((w, i) => {
    const ox = (i % 2) * 512, oy = Math.floor(i / 2) * 256;
    x.save(); x.translate(ox + 256, oy + 128); x.rotate((r() - 0.5) * 0.12);
    const size = Math.min(150, 900 / w.length);
    x.font = `900 ${size}px Impact, 'Arial Black', sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.lineWidth = 26; x.strokeStyle = '#111'; x.strokeText(w, 10, 10);         // drop shadow
    x.lineWidth = 18; x.strokeStyle = '#ffffff'; x.strokeText(w, 0, 0);        // outline
    const g = x.createLinearGradient(0, -size / 2, 0, size / 2); g.addColorStop(0, fills[i][0]); g.addColorStop(1, fills[i][1]);
    x.fillStyle = g; x.fillText(w, 0, 0);
    x.fillStyle = fills[i][1];                                                   // drips
    for (let d = 0; d < 7; d++) { const dx = (r() - 0.5) * size * w.length * 0.5; x.fillRect(dx, size * 0.3, 4, 20 + r() * 40); }
    x.restore();
  });
  // ---- ground marks
  const cell = (k) => [(k % 4) * 256, 512 + Math.floor(k / 4) * 256];
  const crack = (k, seed) => {
    const [ox, oy] = cell(k), rr = rngOf(seed);
    x.strokeStyle = 'rgba(25,22,20,0.85)'; x.lineCap = 'round';
    const branch = (px, py, a, len, w) => {
      if (len < 12 || w < 0.6) return;
      x.lineWidth = w; x.beginPath(); x.moveTo(px, py);
      const nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len;
      x.lineTo(nx, ny); x.stroke();
      branch(nx, ny, a + (rr() - 0.5) * 0.9, len * 0.8, w * 0.8);
      if (rr() < 0.4) branch(nx, ny, a + (rr() < 0.5 ? 1 : -1) * (0.6 + rr() * 0.6), len * 0.55, w * 0.6);
    };
    branch(ox + 20, oy + 128 + (rr() - 0.5) * 60, (rr() - 0.5) * 0.4, 40, 4);
  };
  crack(0, 3); crack(1, 11); crack(2, 29);
  { // oil stain
    const [ox, oy] = cell(3);
    for (let i = 0; i < 6; i++) {
      const g = x.createRadialGradient(ox + 128 + (r() - 0.5) * 40, oy + 128 + (r() - 0.5) * 40, 4, ox + 128, oy + 128, 110);
      g.addColorStop(0, 'rgba(15,15,18,0.35)'); g.addColorStop(1, 'rgba(15,15,18,0)');
      x.fillStyle = g; x.fillRect(ox, oy, 256, 256);
    }
  }
  { // gum spots
    const [ox, oy] = cell(4);
    for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(${40 + r() * 30},${40 + r() * 30},${45 + r() * 30},0.8)`; x.beginPath(); x.arc(ox + 20 + r() * 216, oy + 20 + r() * 216, 3 + r() * 7, 0, Math.PI * 2); x.fill(); }
  }
  { // black wheel / powerslide scuffs
    const [ox, oy] = cell(5);
    x.strokeStyle = 'rgba(10,10,10,0.55)'; x.lineCap = 'round';
    for (let i = 0; i < 5; i++) { x.lineWidth = 6 + r() * 10; x.beginPath(); const y0 = oy + 40 + r() * 170; x.moveTo(ox + 10, y0); x.quadraticCurveTo(ox + 128, y0 + (r() - 0.5) * 80, ox + 246, y0 + (r() - 0.5) * 40); x.stroke(); }
  }
  { // grime / dirt patch
    const [ox, oy] = cell(6);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(60,50,40,${0.05 + r() * 0.12})`; const rr2 = 4 + r() * 18; x.beginPath(); x.arc(ox + 128 + (r() - 0.5) * 200 * r(), oy + 128 + (r() - 0.5) * 200 * r(), rr2, 0, Math.PI * 2); x.fill(); }
  }
  { // painted manhole-ish drain cover
    const [ox, oy] = cell(7);
    x.fillStyle = 'rgba(55,58,62,0.95)'; x.beginPath(); x.arc(ox + 128, oy + 128, 100, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(30,30,32,1)'; x.lineWidth = 6;
    for (let k = -80; k <= 80; k += 20) { x.beginPath(); x.moveTo(ox + 128 + k, oy + 128 - Math.sqrt(100 * 100 - k * k) + 6); x.lineTo(ox + 128 + k, oy + 128 + Math.sqrt(100 * 100 - k * k) - 6); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export class Decals {
  constructor(scene) { this.scene = scene; this.P = []; this.N = []; this.U = []; }

  // a quad centred at p, spanning unit vectors a (width) & b (height), atlas cell rect [u0,v0,u1,v1]
  _quad(p, a, b, w, h, n, uv) {
    const [u0, v0, u1, v1] = uv;
    const c = (sa, sb) => [p[0] + a[0] * w / 2 * sa + b[0] * h / 2 * sb, p[1] + a[1] * w / 2 * sa + b[1] * h / 2 * sb, p[2] + a[2] * w / 2 * sa + b[2] * h / 2 * sb];
    const v = [c(-1, -1), c(1, -1), c(1, 1), c(-1, -1), c(1, 1), c(-1, 1)];
    const t = [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]];
    for (let i = 0; i < 6; i++) { this.P.push(...v[i]); this.N.push(...n); this.U.push(...t[i]); }
  }
  // graffiti piece k (0..3) on a wall: centre p, wall normal n (horizontal), width w
  graffiti(p, n, w, k) {
    const a = [n[2], 0, -n[0]];                         // along the wall
    const u0 = (k % 2) * 0.5, vTop = 1 - Math.floor(k / 2) * 0.25;
    this._quad([p[0] + n[0] * 0.02, p[1], p[2] + n[2] * 0.02], a, [0, 1, 0], w, w / 2, n, [u0, vTop - 0.25, u0 + 0.5, vTop]);
  }
  // ground mark k (0..7): 0-2 cracks, 3 oil, 4 gum, 5 scuffs, 6 grime, 7 drain
  ground(x, y, z, size, k, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const u0 = (k % 4) * 0.25, v1 = 0.5 - Math.floor(k / 4) * 0.25;
    this._quad([x, y + 0.006, z], [c, 0, s], [s, 0, -c], size, size, [0, 1, 0], [u0, v1 - 0.25, u0 + 0.25, v1]);
  }

  build() {
    if (!this.P.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
    const mat = new THREE.MeshLambertMaterial({ map: buildAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true; m.renderOrder = 1;
    this.scene.add(m);
    this.mesh = m;
  }
}
