// =============================================================================
//  gesture.js — analog-style "flick" tricks with the mouse or a thumb.
//  Hold the left mouse button (or the touch POP pad) and drag:
//     pull DOWN  → crouch / wind up
//     flick UP          → Ollie        (pops the moment you flick)
//     flick UP-LEFT     → Kickflip     UP-RIGHT → Heelflip
//     DOWN, LEFT, UP    → 360 Flip     DOWN, RIGHT, UP → Laser Flip
//     DOWN, LEFT, UP-LEFT → Double Kickflip (and the heel version)
//     UP then DOWN      → Nollie
//  Letting go without a flick does a normal ollie (hold time = pop height).
//  The gesture is turned into the same key presses the keyboard uses, so all
//  trick names / points still come from FLIP_TRICKS in config.js.
// =============================================================================
import { GESTURE } from './config.js';

const KEY = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };

// Direction of a drag segment (screen y grows downward). Upward drags have
// diagonals (for kickflip / heelflip flicks); downward drags are either "down"
// or a sideways swipe, so a slightly crooked pull-down still reads as "down".
function dirOf(dx, dy) {
  const a = Math.atan2(-dy, dx) * 180 / Math.PI; // 0 = right, 90 = up, -90 = down
  if (a >= 0) {
    if (a < 22.5) return 'right';
    if (a < 67.5) return 'upright';
    if (a < 112.5) return 'up';
    if (a < 157.5) return 'upleft';
    return 'left';
  }
  if (a > -40) return 'right';
  if (a < -140) return 'left';
  return 'down';
}

export class FlickGesture {
  constructor(input) {
    this.input = input;
    this.active = false;
  }

  start(x, y) {
    this.active = true;
    this.x = x; this.y = y;
    this.seq = [];
    this.popped = false;
    this.input.simulate('Space', true);
  }

  move(x, y) {
    if (!this.active || this.popped) return;
    const dx = x - this.x, dy = y - this.y;
    if (Math.hypot(dx, dy) < GESTURE.segment) return;
    this.x = x; this.y = y;
    const d = dirOf(dx, dy);
    if (this.seq[this.seq.length - 1] === d) return;
    this.seq.push(d);
    const keys = this._resolve();
    if (keys) this._pop(keys);
  }

  // returns the key sequence to fire, or null if the gesture isn't finished
  _resolve() {
    const s = this.seq, last = s[s.length - 1];
    const di = s.indexOf('down');
    // nollie: up first, then down
    if (s[0] === 'up' && last === 'down') return ['up', 'down'];
    if (di < 0 || !GESTURE.finals[last] || s.length - 1 <= di) return null;
    const middle = s.slice(di + 1, -1).filter((d) => d === 'left' || d === 'right');
    if (last === 'up') return middle.length ? ['down', 'up', middle[0]] : ['down', 'up'];
    return ['down', ...middle, ...GESTURE.finals[last]];
  }

  _pop(keys) {
    this.popped = true;
    for (const k of keys) {
      // re-press even if the joystick / keyboard is already holding that direction
      const was = !!this.input.held[k];
      if (was) this.input.simulate(KEY[k], false);
      this.input.simulate(KEY[k], true); this.input.simulate(KEY[k], false);
      if (was) this.input.simulate(KEY[k], true);
    }
    this.input.simulate('Space', false);
  }

  end() {
    if (!this.active) return;
    this.active = false;
    if (!this.popped) this.input.simulate('Space', false); // plain ollie
  }
}
