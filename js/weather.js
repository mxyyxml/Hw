// =============================================================================
//  weather.js — time-of-day / weather presets (clear, overcast, golden hour,
//  rain) and a small pooled particle system for sparks and dust.
//  Presets only nudge the lights, fog, exposure and sky that main.js already
//  built, so every graphics level keeps working.
// =============================================================================
import * as THREE from 'three';

const PRESETS = {
  clear:    { sun: 1, sunCol: null, hemi: 1, hemiSky: null, hemiGround: null, fog: null, fogNear: 1, fogFar: 1, exposure: 1, sky: true },
  overcast: { sun: 0.3, sunCol: 0xdfe6ee, hemi: 1.15, hemiSky: 0xc9d3de, hemiGround: 0x6e6a62, fog: 0xa3aab3, fogNear: 0.45, fogFar: 0.75, exposure: 1.0, sky: false },
  golden:   { sun: 1.0, sunCol: 0xffb878, hemi: 0.85, hemiSky: 0xffe4cc, hemiGround: 0x6a5a4a, fog: 0xe3c2a4, fogNear: 0.7, fogFar: 0.9, exposure: 0.98, sky: true, skyDim: 0.75 },
  rain:     { sun: 0.12, sunCol: 0xc8d2dc, hemi: 0.95, hemiSky: 0xa9b4c0, hemiGround: 0x4d4b48, fog: 0x7f8891, fogNear: 0.3, fogFar: 0.55, exposure: 0.92, sky: false, rain: true },
};
export const WEATHER_OPTIONS = [['clear', 'Clear'], ['overcast', 'Overcast'], ['golden', 'Golden hour'], ['rain', 'Rain']];

export class Weather {
  constructor(game) {
    this.g = game;
    this.mode = 'clear';
    const s = game.sun, h = game.hemi;
    this.base = { sunI: s.intensity, sunC: s.color.clone(), hemiI: h.intensity, hemiS: h.color.clone(), hemiG: h.groundColor.clone(), fogC: game.scene.fog.color.clone(), fogNear: game.scene.fog.near, exposure: game.renderer.toneMappingExposure };
    // rain: streaks that live in a box around the camera
    const N = 2600, pos = new Float32Array(N * 6);
    this.drops = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { this.drops[i * 3] = (Math.random() - 0.5) * 50; this.drops[i * 3 + 1] = Math.random() * 26; this.drops[i * 3 + 2] = (Math.random() - 0.5) * 50; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xb4bec9, transparent: true, opacity: 0.42, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    game.scene.add(this.rain);
  }

  // re-apply after any graphics change (main.js resets lights / fog there)
  set(mode) {
    const P = PRESETS[mode] || PRESETS.clear, B = this.base, g = this.g, sc = g.scene;
    this.mode = mode in PRESETS ? mode : 'clear';
    B.hemiI = g.hemi.intensity === this._hemiSet ? B.hemiI : g.hemi.intensity;   // graphics level may have changed it
    g.sun.intensity = B.sunI * P.sun; g.sun.color.copy(P.sunCol ? new THREE.Color(P.sunCol) : B.sunC);
    g.hemi.intensity = this._hemiSet = B.hemiI * P.hemi;
    g.hemi.color.copy(P.hemiSky ? new THREE.Color(P.hemiSky) : B.hemiS); g.hemi.groundColor.copy(P.hemiGround ? new THREE.Color(P.hemiGround) : B.hemiG);
    sc.fog.color.copy(P.fog ? new THREE.Color(P.fog) : B.fogC);
    sc.fog.near = B.fogNear * P.fogNear;
    this._fogFar = P.fogFar;
    sc.fog.far = (g._fogFarBase || sc.fog.far) * P.fogFar;
    g.renderer.toneMappingExposure = B.exposure * P.exposure;
    // sky: the photo / dome for clear skies, a flat cloud deck (fog colour) otherwise
    if (P.sky) { sc.background = g.skyTex || null; g.sky.visible = !g.skyTex; sc.backgroundIntensity = P.skyDim || 1; }
    else { sc.background = sc.fog.color.clone(); g.sky.visible = false; }
    this.rain.visible = !!P.rain;
    if (g.audio && g.audio.setRain) g.audio.setRain(!!P.rain);
  }

  update(dt, cam) {
    if (!this.rain.visible) return;
    const d = this.drops, p = this.rain.geometry.attributes.position.array, N = d.length / 3;
    const fall = 15 * dt, wind = 1.6;
    for (let i = 0; i < N; i++) {
      let y = d[i * 3 + 1] - fall;
      if (y < 0) { y += 26; d[i * 3] = (Math.random() - 0.5) * 50; d[i * 3 + 2] = (Math.random() - 0.5) * 50; }
      d[i * 3 + 1] = y;
      const x = cam.x + d[i * 3], z = cam.z + d[i * 3 + 2], yy = cam.y - 8 + y;
      p[i * 6] = x; p[i * 6 + 1] = yy; p[i * 6 + 2] = z;
      p[i * 6 + 3] = x - wind * 0.035; p[i * 6 + 4] = yy - 0.45; p[i * 6 + 5] = z;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
  }
}

// ---- pooled particles: grind sparks, landing / powerslide dust
export class Particles {
  constructor(scene, N = 700) {
    this.N = N; this.i = 0;
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.max = new Float32Array(N);
    this.col = new Float32Array(N * 3); this.grav = new Float32Array(N); this.drag = new Float32Array(N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false }));
    this.points.frustumCulled = this.dust.frustumCulled = false;
    // sparks are additive (glow), dust is normal blended: split the pool in two halves
    this.half = N >> 1;
    geo.setDrawRange(0, this.half);
    const geo2 = geo.clone(); geo2.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); geo2.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo2.setDrawRange(this.half, N - this.half); this.dust.geometry = geo2;
    this.i2 = this.half;
    for (let k = 0; k < N; k++) this.pos[k * 3 + 1] = -1e4;
    scene.add(this.points, this.dust);
  }
  _slot(spark) {
    if (spark) { const k = this.i; this.i = (this.i + 1) % this.half; return k; }
    const k = this.i2; this.i2 = this.i2 + 1 >= this.N ? this.half : this.i2 + 1; return k;
  }
  emit(x, y, z, n, kind, vx = 0, vz = 0) {
    const spark = kind === 'spark';
    for (let j = 0; j < n; j++) {
      const k = this._slot(spark), r = Math.random;
      this.pos.set([x + (r() - 0.5) * 0.1, y + 0.02, z + (r() - 0.5) * 0.1], k * 3);
      if (spark) {
        this.vel.set([vx * 0.6 + (r() - 0.5) * 3, 0.8 + r() * 2.2, vz * 0.6 + (r() - 0.5) * 3], k * 3);
        this.col.set([1, 0.75 + r() * 0.2, 0.35], k * 3); this.grav[k] = 9; this.drag[k] = 1.5; this.max[k] = this.life[k] = 0.25 + r() * 0.3;
      } else {
        this.vel.set([vx * 0.3 + (r() - 0.5) * 1.4, 0.3 + r() * 0.6, vz * 0.3 + (r() - 0.5) * 1.4], k * 3);
        const c = 0.62 + r() * 0.1; this.col.set([c, c * 0.96, c * 0.9], k * 3); this.grav[k] = -0.1; this.drag[k] = 3; this.max[k] = this.life[k] = 0.6 + r() * 0.6;
      }
    }
  }
  update(dt) {
    const P = this.pos, V = this.vel, C = this.col;
    for (let k = 0; k < this.N; k++) {
      if (this.life[k] <= 0) continue;
      this.life[k] -= dt;
      if (this.life[k] <= 0) { P[k * 3 + 1] = -1e4; continue; }
      const f = Math.exp(-this.drag[k] * dt);
      V[k * 3] *= f; V[k * 3 + 2] *= f; V[k * 3 + 1] = V[k * 3 + 1] * f - this.grav[k] * dt;
      P[k * 3] += V[k * 3] * dt; P[k * 3 + 1] += V[k * 3 + 1] * dt; P[k * 3 + 2] += V[k * 3 + 2] * dt;
      if (k < this.half) { const a = this.life[k] / this.max[k]; C[k * 3 + 1] = 0.45 + 0.5 * a; C[k * 3 + 2] = 0.15 + 0.3 * a; }
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
    this.dust.geometry.attributes.position.needsUpdate = true; this.dust.geometry.attributes.color.needsUpdate = true;
  }
}
