// =============================================================================
//  main.js — boots the game and runs the loop.
//  Fixed-step physics (config.PHYSICS.fixedStep) + one render per frame.
// =============================================================================
import * as THREE from 'three';
import { PHYSICS, GRAPHICS } from './config.js';
import { World } from './world.js';
import { Input } from './input.js';
import { Skater } from './skater.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd3f0);
    this.scene.fog = new THREE.Fog(0x9fd3f0, 60, GRAPHICS.low.fogFar);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, GRAPHICS.low.drawDistance);

    // simple, cheap lighting
    this.hemi = new THREE.HemisphereLight(0xdff3ff, 0x8a7f6a, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
    this.sun.position.set(30, 60, 20);
    this.scene.add(this.sun, this.sun.target);

    this.world = new World(this.scene);
    this.world.col.vertSlope = PHYSICS.vertSlope;
    this.input = new Input();
    this.skater = new Skater(this.scene);
    this.player = new Player(this.world, this.input, this.skater);
    this.rig = new CameraRig(this.camera);

    this.paused = false;
    this.acc = 0;
    this.last = performance.now();
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;

    this.applyGraphics('low');
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.player.on((type, data) => this.onPlayerEvent(type, data));
    requestAnimationFrame((t) => this.frame(t));
  }

  applyGraphics(level) {
    const g = GRAPHICS[level] || GRAPHICS.low;
    this.graphics = level;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, g.pixelRatio));
    this.renderer.shadowMap.enabled = g.shadows;
    this.sun.castShadow = g.shadows;
    if (g.shadows) {
      this.sun.shadow.mapSize.set(g.shadowMapSize, g.shadowMapSize);
      const c = this.sun.shadow.camera;
      c.left = -25; c.right = 25; c.top = 25; c.bottom = -25; c.near = 1; c.far = 150;
      c.updateProjectionMatrix();
      this.sun.shadow.bias = -0.0008;
    }
    this.skater.blob.visible = !g.shadows;
    this.scene.fog.far = g.fogFar;
    this.camera.far = g.drawDistance;
    this.camera.updateProjectionMatrix();
    // materials must recompile when shadows toggle
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onPlayerEvent(type, data) {
    // hooked up to UI / audio / scoring in later stages
  }

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    let realDt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this._fpsAcc += realDt; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }

    if (!this.paused) this.step(realDt);
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  step(realDt) {
    const p = this.player;
    const now = performance.now() / 1000;
    p.frameInput(now);
    // slow-mo during bails
    let scale = 1;
    if (p.state === 'bail' && now - p.bailInfo.start < PHYSICS.bailSlowMoDuration) scale = PHYSICS.bailSlowMo;
    const dt = realDt * scale;
    this.acc += dt;
    let n = 0;
    while (this.acc >= PHYSICS.fixedStep && n < PHYSICS.maxSubSteps) {
      p.update(PHYSICS.fixedStep);
      this.acc -= PHYSICS.fixedStep; n++;
    }
    if (n === PHYSICS.maxSubSteps) this.acc = 0;
    p.sync(dt);
    this.rig.update(realDt, p, this.world.col);
    // keep the shadow camera around the player
    this.sun.position.set(p.pos.x + 30, p.pos.y + 60, p.pos.z + 20);
    this.sun.target.position.copy(p.pos);
    if (this.input.pressed.camera) this.rig.toggle();
  }
}

window.LBS = new Game();
