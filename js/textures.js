// =============================================================================
//  textures.js — small procedural textures drawn on <canvas> at startup.
//  They are near-white "detail" maps that get multiplied by each surface's
//  vertex colour, so one texture works for many tints. No image files needed.
//  Each is 256×256 so they are cheap on low-end GPUs.
// =============================================================================
import * as THREE from 'three';

const SIZE = 256;

// deterministic random so the park looks the same every time
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  return [c, c.getContext('2d')];
}

// fine grain + soft blotches (concrete / asphalt / grass)
function grain(ctx, r, base, amount, blotches, blotchDark, speck = 1) {
  ctx.fillStyle = `rgb(${base},${base},${base})`;
  ctx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < blotches; i++) {
    const x = r() * SIZE, y = r() * SIZE, rad = 10 + r() * 50;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.05 + r() * blotchDark;
    g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    // draw wrapped so the texture tiles seamlessly
    for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) {
      ctx.save(); ctx.translate(ox, oy); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); ctx.restore();
    }
  }
  const img = ctx.getImageData(0, 0, SIZE, SIZE), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount + (r() < 0.02 * speck ? -amount : 0);
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

const MAKERS = {
  concrete(ctx, r) {
    grain(ctx, r, 236, 22, 8, 0.06);
    // expansion joint along two edges (one slab per texture tile)
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(0, 0, SIZE, 2); ctx.fillRect(0, 0, 2, SIZE);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, 2, SIZE, 1); ctx.fillRect(2, 0, 1, SIZE);
  },
  tiles(ctx, r) {
    grain(ctx, r, 238, 14, 4, 0.06);
    const n = 4, s = SIZE / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = (r() - 0.5) * 0.12;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(i * s, j * s, s, s);
    }
    ctx.fillStyle = 'rgba(60,50,40,0.45)';
    for (let i = 0; i < n; i++) { ctx.fillRect(i * s, 0, 3, SIZE); ctx.fillRect(0, i * s, SIZE, 3); }
  },
  asphalt(ctx, r) {
    grain(ctx, r, 225, 60, 10, 0.15, 3);
    // a couple of tar-patched cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath(); let x = r() * SIZE, y = r() * SIZE; ctx.moveTo(x, y);
      for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
  wood(ctx, r) {
    ctx.fillStyle = '#f2f2f2'; ctx.fillRect(0, 0, SIZE, SIZE);
    const planks = 8, h = SIZE / planks;
    for (let p = 0; p < planks; p++) {
      const v = (r() - 0.5) * 0.18;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      ctx.fillRect(0, p * h, SIZE, h);
      ctx.strokeStyle = 'rgba(90,60,30,0.18)'; ctx.lineWidth = 1;
      for (let g = 0; g < 5; g++) {
        const y0 = p * h + r() * h;
        ctx.beginPath(); ctx.moveTo(0, y0);
        for (let x = 0; x <= SIZE; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.03 + g) * 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,25,10,0.45)'; ctx.fillRect(0, p * h, SIZE, 2);
      const joint = r() * SIZE; ctx.fillRect(joint, p * h, 2, h);
    }
  },
  ramp(ctx, r) {
    // smooth skatelite-style sheets with seams and a little wear
    grain(ctx, r, 240, 10, 8, 0.1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(0, 0, SIZE, 2); ctx.fillRect(0, 0, 2, SIZE);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (const [x, y] of [[8, 8], [SIZE / 2, 8], [8, SIZE / 2], [SIZE / 2, SIZE / 2]]) ctx.fillRect(x, y, 3, 3);
  },
  grass(ctx, r) {
    grain(ctx, r, 225, 50, 20, 0.2, 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 400; i++) {
      const x = r() * SIZE, y = r() * SIZE;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 3, y - 4); ctx.stroke();
    }
  },
  building(ctx, r) {
    // one floor tall, two windows wide
    ctx.fillStyle = '#efefef'; ctx.fillRect(0, 0, SIZE, SIZE);
    grain(ctx, r, 238, 12, 3, 0.05);
    for (let i = 0; i < 2; i++) {
      const x = 22 + i * 128, y = 50, w = 84, h = 120;
      const lit = r() < 0.25;
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, lit ? '#e9d9a6' : '#45566b'); g.addColorStop(1, lit ? '#c9b27a' : '#26313f');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x + 6, y + 6, w * 0.35, h - 12);   // reflection
      ctx.fillStyle = '#d8d8d8'; ctx.fillRect(x - 6, y + h, w + 12, 8);                          // sill
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + w / 2 - 2, y, 4, h);                  // mullion
    }
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, SIZE - 6, SIZE, 6);                     // floor line
  },
  foliage(ctx, r) { MAKERS.grass(ctx, r); },
  plain(ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE); },
};

// world units (metres) covered by one texture repeat, per category
export const TEX_SCALE = {
  concrete: 2.6, tiles: 2.2, asphalt: 3.2, wood: 2.4, ramp: 2.6, grass: 3.5, building: 4, plain: 10, foliage: 1.5,
};

// -----------------------------------------------------------------------------
//  Real photo-scanned textures (CC0, from Poly Haven — see README credits).
//  They load in the background; until then the procedural canvas above is used.
//  play.html embeds them as data URIs (window.__LBS_ASSETS) so it works offline.
// -----------------------------------------------------------------------------
export function assetURL(path) {
  return (typeof window !== 'undefined' && window.__LBS_ASSETS && window.__LBS_ASSETS[path]) || path;
}
const PHOTO = {
  concrete: 'assets/textures/concrete.jpg', tiles: 'assets/textures/tiles.jpg', asphalt: 'assets/textures/asphalt.jpg',
  ramp: 'assets/textures/ramp.jpg', wood: 'assets/textures/wood.jpg', grass: 'assets/textures/grass.jpg',
  building: 'assets/textures/brick.jpg', denim: 'assets/textures/denim.jpg', cotton: 'assets/textures/cotton.jpg',
};
const NORMALS = {
  concrete: 'assets/textures/concrete_n.jpg', tiles: 'assets/textures/tiles_n.jpg', asphalt: 'assets/textures/asphalt_n.jpg',
  ramp: 'assets/textures/ramp_n.jpg', wood: 'assets/textures/wood_n.jpg', building: 'assets/textures/brick_n.jpg',
};
// average colour of each photo (used to tint the procedural fallback the same way)
const PHOTO_AVG = { concrete: '#969590', tiles: '#96938c', asphalt: '#5f5f5f', ramp: '#9b9b98', wood: '#7e6141', grass: '#978359', building: '#644a3c' };

function loadImage(url, ok) {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => { /* keep the procedural texture */ };
  img.src = assetURL(url);
}

// building facade = brick photo + windows painted on top (one floor, two windows)
function facade(brick) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const ctx = c.getContext('2d');
  ctx.drawImage(brick, 0, 0, 512, 512);
  const r = rng(42);
  for (let i = 0; i < 2; i++) {
    const x = 44 + i * 256, y = 100, w = 168, h = 240, lit = r() < 0.25;
    ctx.fillStyle = 'rgba(30,30,30,0.55)'; ctx.fillRect(x - 10, y - 10, w + 20, h + 26);           // frame shadow
    ctx.fillStyle = '#d9d4c8'; ctx.fillRect(x - 8, y - 8, w + 16, h + 16);                          // frame
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, lit ? '#f1dfa8' : '#5d7389'); g.addColorStop(0.55, lit ? '#d6b878' : '#2e3b4b'); g.addColorStop(1, lit ? '#b89656' : '#1c2531');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w * 0.5, y); ctx.lineTo(x, y + h * 0.6); ctx.fill();       // sky reflection
    ctx.fillStyle = '#d9d4c8'; ctx.fillRect(x + w / 2 - 4, y, 8, h); ctx.fillRect(x, y + h * 0.45, w, 7);      // mullions
    ctx.fillStyle = '#bdb6a6'; ctx.fillRect(x - 16, y + h + 8, w + 32, 14);                                     // sill
  }
  return c;
}

const cache = {};
export function getTexture(cat, anisotropy = 1) {
  if (cache[cat]) { cache[cat].anisotropy = anisotropy; cache[cat].needsUpdate = true; return cache[cat]; }
  const [c, ctx] = canvas();
  (MAKERS[cat] || MAKERS.plain)(ctx, rng(cat.length * 7919 + cat.charCodeAt(0)));
  if (PHOTO_AVG[cat]) { // tint the fallback like the photo so colours match either way
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = PHOTO_AVG[cat]; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalCompositeOperation = 'source-over';
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  cache[cat] = t;
  // (dispose first: the photo is bigger than the canvas, so the GPU copy must be re-allocated)
  if (PHOTO[cat]) loadImage(PHOTO[cat], (img) => { t.dispose(); t.image = cat === 'building' ? facade(img) : img; t.needsUpdate = true; });
  return t;
}

// photo normal map for a category (High graphics). Calls back once loaded.
const nCache = {};
export function getNormal(cat, cb) {
  if (!NORMALS[cat]) return;
  if (nCache[cat]) { if (nCache[cat].image) cb(nCache[cat]); else nCache[cat].waiting.push(cb); return; }
  const t = new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.waiting = [cb];
  nCache[cat] = t;
  loadImage(NORMALS[cat], (img) => {
    t.image = img; t.needsUpdate = true;
    for (const f of t.waiting) f(t);
    t.waiting = [];
  });
}

// fabric detail maps for the skater's clothes (greyscale, tinted by outfit colour)
export function getFabric(name) {
  if (cache['fabric_' + name]) return cache['fabric_' + name];
  const t = new THREE.Texture();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  // a 1×1 white placeholder until the photo arrives
  const c = document.createElement('canvas'); c.width = c.height = 2;
  const x = c.getContext('2d'); x.fillStyle = '#dcdcdc'; x.fillRect(0, 0, 2, 2);
  t.image = c; t.needsUpdate = true;
  loadImage(PHOTO[name], (img) => { t.dispose(); t.image = img; t.needsUpdate = true; });
  cache['fabric_' + name] = t;
  return t;
}
export const CATEGORIES = Object.keys(MAKERS);
