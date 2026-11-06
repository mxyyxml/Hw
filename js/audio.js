// =============================================================================
//  audio.js — every sound is synthesized with the Web Audio API.
//  No audio files. The AudioContext starts on the first click (browser rule).
// =============================================================================

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.grinding = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(c.destination);

    // shared white-noise buffer
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // continuous rolling sound: noise → lowpass → gain (set by speed)
    this.roll = this._loop(400, 'lowpass', 0.7);
    // continuous grind sound: noise → bandpass + buzzy oscillator
    this.grind = this._loop(2600, 'bandpass', 4);
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 95;
    const og = c.createGain(); og.gain.value = 0.08; osc.connect(og); og.connect(this.grind.gain);
    osc.start();
  }

  _loop(freq, type, q) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    return { src, filter: f, gain: g };
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  // short filtered noise burst
  _burst(dur, freq, type = 'lowpass', vol = 0.5, q = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  // pitched blip (sine/triangle) with a pitch slide
  _tone(f0, f1, dur, vol = 0.3, type = 'sine', delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---- game sounds ------------------------------------------------------------
  push()  { this._burst(0.18, 700, 'bandpass', 0.35, 1.2); }
  pop()   { this._burst(0.06, 3000, 'highpass', 0.6); this._tone(180, 70, 0.12, 0.35); }
  land(impact = 4) {
    const v = Math.min(1, impact / 10);
    this._burst(0.22, 350, 'lowpass', 0.4 + v * 0.5); this._tone(110, 45, 0.18, 0.3 + v * 0.3);
  }
  bail()  { this._burst(0.5, 260, 'lowpass', 0.9); this._tone(90, 35, 0.4, 0.5); this._burst(0.3, 1800, 'bandpass', 0.3, 2); }
  wall()  { this._burst(0.15, 500, 'lowpass', 0.4); }
  trick() { this._tone(660, 880, 0.12, 0.12, 'triangle'); }
  bank(mult = 1) {
    const notes = [523, 659, 784, 1047];
    for (let i = 0; i < Math.min(4, 1 + mult); i++) this._tone(notes[i], notes[i] * 1.01, 0.18, 0.15, 'triangle', i * 0.07);
  }
  drop()  { this._tone(300, 120, 0.35, 0.15, 'square'); }
  ui()    { this._tone(900, 1100, 0.06, 0.1, 'triangle'); }
  challenge() { [784, 988, 1175, 1568].forEach((f, i) => this._tone(f, f, 0.22, 0.16, 'triangle', i * 0.09)); }

  // called every frame with the player's state
  update(state, speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rolling = state === 'ride' ? Math.min(1, speed / 10) : 0;
    this.roll.gain.gain.setTargetAtTime(rolling * 0.35, t, 0.05);
    this.roll.filter.frequency.setTargetAtTime(250 + speed * 90, t, 0.1);
    const g = state === 'grind' ? 0.22 : 0;
    this.grind.gain.gain.setTargetAtTime(g, t, 0.03);
  }
  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.roll.gain.gain.setTargetAtTime(0, t, 0.05);
    this.grind.gain.gain.setTargetAtTime(0, t, 0.05);
  }
}
