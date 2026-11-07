// =============================================================================
//  input.js — keyboard state, "just pressed" edges and the flick buffer.
//  Actions (up, down, pop, grab...) are mapped from key codes in config.KEYS.
// =============================================================================
import { KEYS } from './config.js';

const DIRS = ['up', 'down', 'left', 'right'];

export class Input {
  constructor() {
    this.codeToAction = {};
    for (const [action, codes] of Object.entries(KEYS)) for (const c of codes) this.codeToAction[c] = action;
    this.held = {};        // action -> bool
    this.pressed = {};     // action -> true for the frame it went down
    this.released = {};    // action -> true for the frame it went up
    this.dirEvents = [];   // [{dir, t}] — direction presses, used for flick tricks
    this.releasedAt = {};  // action -> time (s) it was last let go
    this.enabled = true;
    this.now = 0;          // seconds, updated by main loop

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('blur', () => { this.held = {}; });
  }

  _onKey(e, down) {
    const action = this.codeToAction[e.code];
    if (!action) return;
    // stop arrows/space from scrolling the page
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (down) {
      if (e.repeat) return;
      if (!this.held[action]) {
        this.pressed[action] = true;
        if (DIRS.includes(action)) this.dirEvents.push({ dir: action, t: performance.now() / 1000 });
        if (this.dirEvents.length > 16) this.dirEvents.shift();
      }
      this.held[action] = true;
    } else {
      // if both keys of an action exist (W and ↑), only release when none is held
      this.held[action] = false;
      this.released[action] = true;
      this.releasedAt[action] = performance.now() / 1000;
    }
  }

  // call once at the end of each rendered frame
  endFrame() { this.pressed = {}; this.released = {}; }

  // direction presses since time t (seconds, performance.now based)
  dirsSince(t) { return this.dirEvents.filter((e) => e.t >= t).map((e) => e.dir); }

  // which single direction is held right now ('none' if none)
  heldDir() {
    if (this.held.up) return 'up';
    if (this.held.down) return 'down';
    if (this.held.left) return 'left';
    if (this.held.right) return 'right';
    return 'none';
  }

  // For tests / automation: simulate a key
  simulate(code, down) { this._onKey({ code, repeat: false, preventDefault() {} }, down); }
}
