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
import { TouchControls, isTouchDevice } from './touch.js';
import { FlickGesture } from './gesture.js';
import { DEFAULT_OUTFIT } from './config.js';
import { Storage } from './storage.js';

// Gradient sky dome (vertex colours, no texture) that follows the camera.
function makeSky(horizonHex) {
  const geo = new THREE.SphereGeometry(380, 24, 12);
  const zenith = new THREE.Color(0x3f7fc4), horizon = new THREE.Color(horizonHex), ground = new THREE.Color(0xb8b0a0);
  const pos = geo.attributes.position, cols = [], c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 380;
    if (h >= 0) c.copy(horizon).lerp(zenith, Math.pow(h, 0.6));
    else c.copy(horizon).lerp(ground, Math.min(1, -h * 4));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(geo, mat);
  sky.renderOrder = -1;
  // a soft sun glow
  const sunGeo = new THREE.CircleGeometry(14, 20);
  const sun = new THREE.Mesh(sunGeo, new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
  sun.position.set(150, 260, 100).setLength(360);
  sun.lookAt(0, 0, 0);
  sky.add(sun);
  // soft clouds: one procedural canvas texture on a handful of sprites
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const ctx = cv.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 20 + Math.random() * 88, y = 22 + Math.random() * 20, r = 10 + Math.random() * 16;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  for (let i = 0; i < 14; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true, opacity: 0.75 + Math.random() * 0.25 }));
    const a = (i / 14) * Math.PI * 2 + Math.random() * 0.3, el = 0.12 + Math.random() * 0.35;
    sp.position.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).multiplyScalar(340);
    const sc = 70 + Math.random() * 70;
    sp.scale.set(sc * 2, sc, 1);
    sky.add(sp);
  }
  return sky;
}

class Game {
  constructor() {
    // ---------------------------------------------------------------- settings & saves
    this.settings = { ...DEFAULT_SETTINGS, ...Storage.get('settings', {}) };
    this.best = { combo: Storage.get('bestCombo', 0), lunch: Storage.get('bestLunch', 0) };
    this.comboWindow = SCORING.comboWindow;

    // ---------------------------------------------------------------- renderer & scene
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    // filmic tone mapping = softer highlights, more natural colour
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    const HORIZON = 0xcfe0ea;
    this.scene.background = new THREE.Color(HORIZON);
    this.scene.fog = new THREE.Fog(HORIZON, 70, GRAPHICS.low.fogFar);
    this.sky = makeSky(HORIZON);
    this.scene.add(this.sky);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, GRAPHICS.low.drawDistance);

    // simple, cheap lighting: sky/ground hemisphere + one sun
    this.hemi = new THREE.HemisphereLight(0xd6ebff, 0x7d7260, 1.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe9c9, 2.6);
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
    // outfit (Closet)
    this.outfit = { ...DEFAULT_OUTFIT, ...Storage.get('outfit', {}) };
    this.skater.applyOutfit(this.outfit);
    // touch controls for phones / tablets
    this.touch = new TouchControls(this.input, this);
    this.isTouch = isTouchDevice();
    this.updateTouch();
    // mouse flick: hold the left button on the game view and drag (pull ↓, flick ↑)
    this.mouseFlick = new FlickGesture(this.input);
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || this.mode === 'title' || this.paused) return;
      this.audio.init();
      this.mouseFlick.start(e.clientX, e.clientY);
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    this.canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') this.mouseFlick.move(e.clientX, e.clientY); });
    const endFlick = (e) => { if (e.pointerType === 'mouse') this.mouseFlick.end(); };
    this.canvas.addEventListener('pointerup', endFlick);
    this.canvas.addEventListener('pointercancel', endFlick);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

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
    else if (key === 'touch') { this.settings.touch = value; this.updateTouch(); }
    this.settings[key] = value;
    Storage.set('settings', this.settings);
  }

  applyGraphics(level) {
    const g = GRAPHICS[level] || GRAPHICS.low;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, g.pixelRatio));
    this.renderer.shadowMap.enabled = g.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.world.setQuality(level);
    // High: reflections / ambient light from the sky (image-based lighting)
    if (level === 'high') {
      if (!this.envMap) {
        const pm = new THREE.PMREMGenerator(this.renderer);
        const envScene = new THREE.Scene();
        envScene.add(makeSky(0xcfe0ea));
        const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8f8a80 }));
        ground.position.y = -2; envScene.add(ground);
        this.envMap = pm.fromScene(envScene, 0.04).texture;
        pm.dispose();
      }
      this.scene.environment = this.envMap;
      this.hemi.intensity = 1.1;
    } else {
      this.scene.environment = null;
      this.hemi.intensity = 1.9;
    }
    this.sun.castShadow = g.shadows;
    if (g.shadows) {
      this.sun.shadow.mapSize.set(g.shadowMapSize, g.shadowMapSize);
      const c = this.sun.shadow.camera;
      c.left = -35; c.right = 35; c.top = 35; c.bottom = -35; c.near = 1; c.far = 160;
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

  updateTouch() {
    if (!this.touch) return;
    const m = this.settings.touch || 'auto';
    this.touch.setEnabled(m === 'on' || (m === 'auto' && this.isTouch));
  }
  get touchOn() { return this.touch && this.touch.enabled; }

  setOutfit(key, value) {
    this.outfit[key] = value;
    this.skater.applyOutfit(this.outfit);
    Storage.set('outfit', this.outfit);
  }

  // phones: go fullscreen when the game starts (ignored if the browser refuses)
  _fullscreen() {
    if (!this.touchOn) return;
    try {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req && !document.fullscreenElement) { const p = req.call(el); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { /* not allowed here */ }
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
    this._fullscreen();
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
    this._fullscreen();
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
        if (d.impact > 5.5) this.rig.addShake((d.impact - 5.5) * 0.03);
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
      if (this.ui.topMenu === 'closet') this.closetCam(realDt);
      else this.titleCam(realDt);
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
      else if (this.ui.topMenu === 'closet') this.closetCam(realDt);
    }
    if (this.touch) this.touch.setVisible(this.mode !== 'title' && !this.paused);
    inp.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  step(realDt) {
    const p = this.player, inp = this.input;
    const now = performance.now() / 1000;
    if (inp.pressed.camera) this.ui.toast('Camera: ' + { follow: 'Follow', filmer: 'Filmer', fisheye: 'Fisheye filmer' }[this.rig.toggle()], '', 1200);
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
    this.sky.position.copy(this.camera.position);
  }

  // slow orbit over the plaza behind the title screen
  // close-up turntable of the skater while the Closet is open
  closetCam(dt) {
    this.closetAngle = (this.closetAngle || 0) + dt * 0.5;
    const p = this.player.pos, a = this.closetAngle;
    this.camera.position.set(p.x + Math.cos(a) * 2.6, p.y + 1.35, p.z + Math.sin(a) * 2.6);
    this.camera.lookAt(p.x, p.y + 0.9, p.z);
    if (this.camera.fov !== 50) { this.camera.fov = 50; this.camera.updateProjectionMatrix(); }
    this.sky.position.copy(this.camera.position);
    this.player.sync(dt);
  }

  titleCam(dt) {
    if (this.camera.fov !== 62) { this.camera.fov = 62; this.camera.updateProjectionMatrix(); }
    this.titleAngle += dt * 0.06;
    const a = this.titleAngle;
    this.camera.position.set(8 + Math.cos(a) * 34, 13, 4 + Math.sin(a) * 34);
    this.camera.lookAt(8, 0, 2);
    this.sky.position.copy(this.camera.position);
    this.player.sync(dt);
  }
}

window.LBS = new Game();
