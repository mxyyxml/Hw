// =============================================================================
//  main.js — boots Lunch Break Skate and runs the game loop.
//  Fixed-step physics (config.PHYSICS.fixedStep) + one render per frame.
//  Modes: 'title' (menu backdrop), 'free' (free skate), 'lunch' (2-min session)
// =============================================================================
import * as THREE from 'three';
import { PHYSICS, GRAPHICS, SCORING, DEFAULT_SETTINGS } from './config.js';
import { World } from './world.js';
import { Input } from './input.js';
import { Skater } from './skater.js';
import { Player } from './player.js';
import { CameraRig } from './camera.js';
import { ComboSystem } from './tricks.js';
import { Challenges } from './challenges.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Storage } from './storage.js';

class Game {
  constructor() {
    // ---------------------------------------------------------------- settings & saves
    this.settings = { ...DEFAULT_SETTINGS, ...Storage.get('settings', {}) };
    this.best = { combo: Storage.get('bestCombo', 0), lunch: Storage.get('bestLunch', 0) };
    this.comboWindow = SCORING.comboWindow;

    // ---------------------------------------------------------------- renderer & scene
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd3f0);
    this.scene.fog = new THREE.Fog(0x9fd3f0, 60, GRAPHICS.low.fogFar);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, GRAPHICS.low.drawDistance);

    // simple, cheap lighting: sky/ground hemisphere + one sun
    this.hemi = new THREE.HemisphereLight(0xdff3ff, 0x8a7f6a, 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.0);
    this.sun.position.set(30, 60, 20);
    this.scene.add(this.sun, this.sun.target);

    // ---------------------------------------------------------------- game objects
    this.world = new World(this.scene);
    this.world.col.vertSlope = PHYSICS.vertSlope;
    this.input = new Input();
    this.skater = new Skater(this.scene);
    this.player = new Player(this.world, this.input, this.skater);
    this.rig = new CameraRig(this.camera);
    this.audio = new Audio();
    this.combo = new ComboSystem();
    this.challenges = new Challenges((c) => this.onChallenge(c));
    this.ui = new UI(this);

    this.mode = 'title';
    this.paused = false;
    this.score = 0;
    this.lunch = { score: 0, time: 0, bestCombo: 0, over: false };
    this.acc = 0;
    this.last = performance.now();
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;
    this.titleAngle = 0;

    // ---------------------------------------------------------------- wiring
    this.player.on((type, data) => this.onPlayerEvent(type, data));
    this.combo.on((type, data) => this.onComboEvent(type, data));
    this.applySetting('graphics', this.settings.graphics);
    this.applySetting('volume', this.settings.volume);
    this.applySetting('camSensitivity', this.settings.camSensitivity);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.ui.refreshChallenges();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ================================================================ settings
  applySetting(key, value) {
    if (key === 'graphics') this.applyGraphics(value);
    else if (key === 'volume') this.audio.setVolume(value);
    else if (key === 'camSensitivity') this.rig.sensitivity = value;
    else if (key === 'camera') { this.rig.mode = value; return; }
    this.settings[key] = value;
    Storage.set('settings', this.settings);
  }

  applyGraphics(level) {
    const g = GRAPHICS[level] || GRAPHICS.low;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, g.pixelRatio));
    this.renderer.shadowMap.enabled = g.shadows;
    this.sun.castShadow = g.shadows;
    if (g.shadows) {
      this.sun.shadow.mapSize.set(g.shadowMapSize, g.shadowMapSize);
      const c = this.sun.shadow.camera;
      c.left = -25; c.right = 25; c.top = 25; c.bottom = -25; c.near = 1; c.far = 150;
      c.updateProjectionMatrix();
      this.sun.shadow.bias = -0.0008;
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.skater.blob.visible = !g.shadows;
    this.scene.fog.far = g.fogFar;
    this.camera.far = g.drawDistance;
    this.camera.updateProjectionMatrix();
    // materials must recompile when shadows are toggled
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ================================================================ modes
  startFree() {
    this._blur();
    const fromTitle = this.mode === 'title';
    this.mode = 'free'; this.paused = false;
    this.ui.showTitle(false); this.ui.closeMenu(); this.ui.showHUD(true);
    if (fromTitle || this.lunch.over) this.player.teleport(this.world.spots[0]);
    this.lunch.over = false;
    this.rig.snap();
    this.ui.toast('Free skate — press H for controls');
  }

  startLunch() {
    this._blur();
    this.mode = 'lunch'; this.paused = false;
    this.combo.tricks = []; this.ui.showCombo(this.combo);
    this.lunch = { score: 0, time: SCORING.lunchSessionSeconds, bestCombo: 0, over: false };
    this.ui.showTitle(false); this.ui.closeMenu(); this.ui.showHUD(true);
    this.player.teleport(this.world.spots[0]);
    this.rig.snap();
    this.ui.toast('🔔 Lunch Session! Score as much as you can in 2 minutes', '', 3000);
  }

  endLunch() {
    if (this.player.state !== 'bail') this.combo.bank();
    const score = this.lunch.score;
    const newBest = score > this.best.lunch;
    if (newBest) { this.best.lunch = score; Storage.set('bestLunch', score); }
    this.lunch.over = true;
    this.paused = true;
    this.audio.silence();
    this.audio.challenge();
    this.ui.openMenu('results', false, { score, best: this.best.lunch, newBest, bestCombo: this.lunch.bestCombo });
  }

  quitToTitle() {
    this.mode = 'title'; this.paused = false;
    this.combo.tricks = [];
    this.ui.showHUD(false); this.ui.toggleHelp(false); this.ui.showTitle(true);
    this.player.teleport(this.world.spots[0]);
    this.audio.silence();
  }

  pause() {
    if (this.mode === 'title' || this.paused) return;
    this.paused = true;
    this.audio.silence();
    this.ui.openMenu('pause');
  }
  resume() {
    if (this.lunch.over && this.mode === 'lunch') return;
    this.paused = false;
    this.ui.closeMenu();
    this._blur();
    this.last = performance.now();
  }
  // drop keyboard focus from menu buttons so Space can't "click" them mid-game
  _blur() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
  teleport(i) {
    this.player.teleport(this.world.spots[i]);
    this.rig.snap();
    this.resume();
  }

  // ================================================================ events
  onPlayerEvent(type, d) {
    const ui = this.ui, au = this.audio;
    switch (type) {
      case 'push': au.push(); break;
      case 'pop': au.pop(); break;
      case 'trick': ui.popup(d.name, d.grab ? 'small' : ''); au.trick(); break;
      case 'grabStart': break;
      case 'land':
        for (const t of d.tricks) this.combo.add(t);
        for (const gp of d.gaps) { this.combo.add(gp); ui.popup(gp.name + '!', 'good'); }
        if (d.spinName) ui.popup(d.spinName, 'small');
        if (!d.onRail) au.land(d.impact);
        this.challenges.onLand(d);
        break;
      case 'grindStart': ui.popup(d.name); break;
      case 'grindEnd':
        this.combo.add(d);
        this.challenges.onGrind(d);
        break;
      case 'manualStart': ui.popup(d.name); break;
      case 'manualEnd':
        if (d.counts) this.combo.add(d);
        this.challenges.onManual(d);
        break;
      case 'powerslide': this.combo.add({ name: d.name, base: d.name, points: d.points }); break;
      case 'bail':
        ui.popup('BAIL! ' + d.reason, 'bail');
        au.bail();
        this.combo.drop();
        break;
      case 'wall': if (d.speed > 2) au.wall(); break;
      case 'spotSet': ui.toast(d.ok ? 'Drop spot set — press R to come back here' : 'Can\'t set a spot right now'); break;
      case 'respawn': this.rig.snap(); break;
      case 'walk': ui.toast(d.on ? 'Walking — E to get back on your board' : 'Back on the board'); break;
    }
  }

  onComboEvent(type, d) {
    if (type === 'change') { this.ui.showCombo(this.combo); return; }
    if (type === 'bank') {
      const pts = d.total;
      if (this.mode === 'lunch' && !this.lunch.over) {
        this.lunch.score += pts;
        this.lunch.bestCombo = Math.max(this.lunch.bestCombo, pts);
      } else this.score += pts;
      if (pts > this.best.combo) {
        this.best.combo = pts; Storage.set('bestCombo', pts);
        if (d.mult > 1) this.ui.popup('New best combo!', 'good');
      }
      this.ui.showCombo(this.combo, 'banked', pts);
      this.audio.bank(d.mult);
      this.challenges.onCombo(pts);
    } else if (type === 'drop') {
      this.ui.showCombo(this.combo, 'dropped', d.lost);
      this.audio.drop();
    }
  }

  onChallenge(c) {
    this.ui.toast('✔ Challenge complete: ' + c.text, 'challenge', 3500);
    this.audio.challenge();
    this.ui.refreshChallenges();
  }

  // ================================================================ loop
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const realDt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this._fpsAcc += realDt; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }

    const inp = this.input;
    if (this.mode === 'title') {
      this.titleCam(realDt);
    } else {
      // menu keys work even while paused
      if (inp.pressed.pause) {
        if (!this.paused) this.pause();
        else if (!this.lunch.over || this.mode !== 'lunch') {
          const top = this.ui.menuStack[this.ui.menuStack.length - 1];
          if (!top || top.name === 'pause') this.resume(); else this.ui.back();
        }
      }
      if (inp.pressed.help) this.ui.toggleHelp();
      if (!this.paused) this.step(realDt);
    }
    inp.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  step(realDt) {
    const p = this.player, inp = this.input;
    const now = performance.now() / 1000;
    if (inp.pressed.camera) this.ui.toast('Camera: ' + (this.rig.toggle() === 'follow' ? 'Follow' : 'Filmer'), '', 1200);
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
    this.combo.update(dt, p.isHoldingCombo());
    this.rig.update(realDt, p, this.world.col);
    this.audio.update(p.state, p.displaySpeed());
    this.ui.updateHUD(realDt);

    if (this.mode === 'lunch' && !this.lunch.over) {
      this.lunch.time -= realDt;
      if (this.lunch.time <= 0) this.endLunch();
    }
    // keep the shadow camera centred on the player
    this.sun.position.set(p.pos.x + 30, p.pos.y + 60, p.pos.z + 20);
    this.sun.target.position.copy(p.pos);
  }

  // slow orbit over the plaza behind the title screen
  titleCam(dt) {
    this.titleAngle += dt * 0.06;
    const a = this.titleAngle;
    this.camera.position.set(8 + Math.cos(a) * 34, 13, 4 + Math.sin(a) * 34);
    this.camera.lookAt(8, 0, 2);
    this.player.sync(dt);
  }
}

window.LBS = new Game();
