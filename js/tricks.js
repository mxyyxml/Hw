// =============================================================================
//  tricks.js — flick-input trick resolver + the combo / scoring system.
// =============================================================================
import { FLIP_TRICKS, DEFAULT_POP, SCORING } from './config.js';

// Longest sequences first so "↓ ↑ ←" (360 Flip) wins over "↑ ←" etc.
const SORTED = [...FLIP_TRICKS].sort((a, b) => b.seq.length - a.seq.length);

// dirs: direction keys pressed while Space was held, oldest first.
// Returns the matching trick definition (or the plain Ollie).
export function resolveFlick(dirs) {
  for (const t of SORTED) {
    if (dirs.length < t.seq.length) continue;
    const tail = dirs.slice(dirs.length - t.seq.length);
    if (tail.every((d, i) => d === t.seq[i])) return t;
  }
  return DEFAULT_POP;
}

// "BS 360" style spin label from a signed spin angle (radians). '' if < 180°.
export function spinLabel(spin) {
  const halfTurns = Math.round(Math.abs(spin) / Math.PI);
  if (halfTurns < 1) return { label: '', halfTurns: 0 };
  return { label: (spin > 0 ? 'BS ' : 'FS ') + halfTurns * 180, halfTurns };
}

// =============================================================================
//  ComboSystem — chains tricks while you keep landing.
//  Each trick adds its points; the chain total is multiplied by the number of
//  tricks in it ("Kickflip → 50-50 → Heelflip" = (400+..+..) x3).
//  The combo stays open while you're in the air / grinding / manualling and for
//  SCORING.comboWindow seconds after landing. Bail = combo lost.
// =============================================================================
export class ComboSystem {
  constructor() {
    this.tricks = [];
    this.timer = 0;
    this.listeners = [];
  }
  on(fn) { this.listeners.push(fn); }
  emit(t, d) { for (const fn of this.listeners) fn(t, d); }

  get active() { return this.tricks.length > 0; }
  get sum() { return this.tricks.reduce((a, t) => a + t.points, 0); }
  get mult() { return this.tricks.length; }
  get total() { return this.sum * this.mult; }

  add(trick) {
    // repeating the same trick in one combo is worth less each time
    const repeats = this.tricks.filter((t) => t.base === trick.base).length;
    const points = Math.round(trick.points * Math.pow(SCORING.repeatPenalty, repeats));
    this.tricks.push({ name: trick.name, base: trick.base || trick.name, points });
    this.timer = SCORING.comboWindow;
    this.emit('change', this);
  }

  // holding = player is in the air / grinding / manualling
  update(dt, holding) {
    if (!this.active) return;
    if (holding) { this.timer = SCORING.comboWindow; return; }
    this.timer -= dt;
    if (this.timer <= 0) this.bank();
  }

  bank() {
    if (!this.active) return;
    const result = { total: this.total, tricks: this.tricks.slice(), mult: this.mult };
    this.tricks = [];
    this.emit('bank', result);
    this.emit('change', this);
  }

  drop() {
    if (!this.active) return;
    const lost = this.total;
    this.tricks = [];
    this.emit('drop', { lost });
    this.emit('change', this);
  }

  chainText(max = 6) {
    const names = this.tricks.map((t) => t.name);
    const shown = names.length > max ? ['…', ...names.slice(-max)] : names;
    return shown.join(' → ');
  }
}
