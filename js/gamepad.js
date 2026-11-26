// =============================================================================
//  gamepad.js — controller support (standard mapping: Xbox / PlayStation).
//    Left stick   steer (analog) · up = push · down = brake
//    Right stick  FLICK-IT: pull down to crouch, flick up to pop; the flick's
//                 direction picks the trick (same gestures as the mouse flick)
//    A push · B step off/on · X grind · Y manual · RB/RT grab · LB revert
//    LT shift (shuvits / shift-grinds) · D-pad directions · L3 bodyflip
//    R3 respawn · Back camera · Start pause.   In menus: D-pad / stick move, A select.
// =============================================================================
import { KEYS } from './config.js';
import { Storage } from './storage.js';
import { FlickGesture } from './gesture.js';

const DEFAULT_BTN = { 0: 'up', 1: 'walk', 2: 'grind', 3: 'manual', 4: 'revert', 5: 'grab', 6: 'shift', 7: 'grab', 8: 'camera', 9: 'pause',
  10: 'bodyflip', 11: 'respawn', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const DEAD = 0.28;
export const BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3', 'R3', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →'];
// actions a controller button can be remapped to (Settings → Controls)
export const PAD_ACTIONS = ['up', 'walk', 'grind', 'manual', 'revert', 'grab', 'shift', 'bodyflip', 'respawn', 'camera', 'pause', 'speedGlitch', 'popGlitch', 'replay', 'kickflip', 'heelflip', 'treflip', 'popshuv'];

export class Gamepads {
  constructor(input, menuActive, onTitle) {
    this.input = input; this.menuActive = menuActive; this.onTitle = onTitle;
    this.flick = new FlickGesture(input);
    this.prev = {};          // action → held last frame (from the pad)
    this.connected = false;
    this.map = { ...DEFAULT_BTN, ...Storage.get('padmap', {}) };   // button index → action
    window.addEventListener('gamepadconnected', () => { this.connected = true; });
  }
  _set(action, down) {
    if (!!this.prev[action] === down) return;
    this.prev[action] = down;
    this.input.simulate(KEYS[action][0], down);
  }
  // synthetic key tap for the DOM menus (keyup too, or the game's Input would think it's still held)
  _menuKey(code) { for (const t of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(t, { code, key: code })); }

  buttonsFor(action) { return Object.entries(this.map).filter(([, a]) => a === action).map(([i]) => BUTTON_NAMES[i]); }
  rebind(action, i) { this.map[i] = action; Storage.set('padmap', Object.fromEntries(Object.entries(this.map).filter(([k, a]) => DEFAULT_BTN[k] !== a))); }
  reset() { this.map = { ...DEFAULT_BTN }; Storage.set('padmap', {}); }

  update() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    if (!gp) { this.input.steerAxis = null; return; }
    this.connected = true;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0, rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    // menus: stick / d-pad move focus, A clicks, B goes back
    // remapping (Settings → Controls): the next button pressed goes to the waiting action
    if (this.capture) {
      const i = gp.buttons.findIndex((x) => x && x.pressed);
      if (i >= 0 && i < 16 && !this._capHeld) { const cb = this.capture; this.capture = null; this._capHeld = true; cb(i); }
      if (i < 0) this._capHeld = false;
      return;
    }
    if (this._capHeld) { if (gp.buttons.some((x) => x && x.pressed)) return; this._capHeld = false; }
    if (this.menuActive()) {
      this._wasMenu = true;
      const dir = b(12) || ly < -0.6 ? 'ArrowUp' : b(13) || ly > 0.6 ? 'ArrowDown' : null;
      if (dir && dir !== this._menuDir) this._menuKey(dir);
      this._menuDir = dir;
      if (b(0) && !this._a && document.activeElement && document.activeElement.click) document.activeElement.click();
      this._a = b(0);
      if (this.onTitle()) { if (b(9) && !this._start) this._menuKey('Enter'); }   // Start on the title = skate
      else this._set('pause', b(1) || b(9));                                     // B / Start: back / resume
      this._start = b(9);
      return;
    }
    // buttons held while leaving a menu (Start, A) only count once released
    if (this._wasMenu) { this._stale = new Set(Object.keys(this.map).filter((i) => b(+i))); this._wasMenu = false; }
    for (const i of this._stale || []) if (!b(+i)) this._stale.delete(i);
    // buttons → actions (several buttons can share an action)
    const want = {};
    for (const [i, a] of Object.entries(this.map)) if (b(+i) && !(this._stale && this._stale.has(i))) want[a] = true;
    if (ly < -0.55) want.up = true;
    if (ly > 0.55) want.down = true;
    // analog steering; the d-pad / keys still work when the stick is centred
    this.input.steerAxis = Math.abs(lx) > 0.15 ? Math.max(-1, Math.min(1, (lx - Math.sign(lx) * 0.15) / 0.85)) : null;
    for (const a of new Set([...Object.values(this.map), ...Object.keys(this.prev), 'up', 'down'])) this._set(a, !!want[a]);
    // right stick flick-it (scaled to pixels for the gesture recogniser)
    const mag = Math.hypot(rx, ry);
    if (!this.flick.active && mag > DEAD) this.flick.start(0, 0);
    if (this.flick.active) {
      if (mag < DEAD * 0.7) this.flick.end();
      else { this.flick.x = 0; this.flick.y = 0; this.flick.move(rx * 80, ry * 80); }   // stick: direction = where it points from centre
    }
  }
}
