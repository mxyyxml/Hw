// =============================================================================
//  challenges.js — checks the 10 challenges from config.CHALLENGES against
//  player events. Completed challenges are saved in localStorage.
// =============================================================================
import { CHALLENGES } from './config.js';
import { Storage } from './storage.js';

export class Challenges {
  constructor(onComplete) {
    this.list = CHALLENGES;
    this.done = new Set(Storage.get('challenges', []));
    this.onComplete = onComplete;
  }

  get count() { return this.done.size; }
  isDone(id) { return this.done.has(id); }
  next(n = 2) { return this.list.filter((c) => !this.done.has(c.id)).slice(0, n); }

  complete(c) {
    if (this.done.has(c.id)) return;
    this.done.add(c.id);
    Storage.set('challenges', [...this.done]);
    this.onComplete(c);
  }
  reset() { this.done.clear(); Storage.set('challenges', []); }

  // ---- event hooks ----------------------------------------------------------
  onLand(info) {
    const bases = info.tricks.map((t) => t.base);
    const gaps = info.gaps.map((g) => g.name);
    for (const c of this.list) {
      if (this.done.has(c.id)) continue;
      if (c.type === 'gapTrick' && gaps.includes(c.gap) && bases.includes(c.trick)) this.complete(c);
      else if (c.type === 'gap' && gaps.includes(c.gap)) this.complete(c);
      else if (c.type === 'takeoffTrick' && info.takeoffTag === c.takeoff && bases.includes(c.trick)) this.complete(c);
      else if (c.type === 'air' && info.takeoffTag && info.takeoffTag.startsWith(c.takeoff) && info.height >= c.height) this.complete(c);
      else if (c.type === 'trick' && bases.includes(c.trick)) this.complete(c);
    }
  }
  onGrind(info) {
    for (const c of this.list) {
      if (this.done.has(c.id) || c.type !== 'grind') continue;
      if (info.tag.startsWith(c.rail) && info.time >= c.seconds && (!c.grind || info.name === c.grind)) this.complete(c);
    }
  }
  onManual(info) {
    for (const c of this.list) {
      if (!this.done.has(c.id) && c.type === 'manual' && info.time >= c.seconds) this.complete(c);
    }
  }
  onCombo(total) {
    for (const c of this.list) {
      if (!this.done.has(c.id) && c.type === 'combo' && total >= c.points) this.complete(c);
    }
  }
}
