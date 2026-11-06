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
  plain(ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, SIZE, SIZE); },
};

// world units (metres) covered by one texture repeat, per category
export const TEX_SCALE = {
  concrete: 3, tiles: 2, asphalt: 5, wood: 2.4, ramp: 2.4, grass: 6, building: 4, plain: 10,
};

const cache = {};
export function getTexture(cat, anisotropy = 1) {
  if (cache[cat]) { cache[cat].anisotropy = anisotropy; cache[cat].needsUpdate = true; return cache[cat]; }
  const [c, ctx] = canvas();
  (MAKERS[cat] || MAKERS.plain)(ctx, rng(cat.length * 7919 + cat.charCodeAt(0)));
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  cache[cat] = t;
  return t;
}
export const CATEGORIES = Object.keys(MAKERS);
