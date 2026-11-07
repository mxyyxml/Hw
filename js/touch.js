// =============================================================================
//  touch.js — on-screen controls for phones & tablets.
//  Everything is translated into the same virtual key presses the keyboard
//  makes (Input.simulate), so the game logic doesn't care where input came from.
//
//   LEFT THUMB  : joystick  (left/right = steer & spin, up = push/pump, down = brake)
//   RIGHT THUMB : POP pad   (touch = crouch, release = ollie; while holding,
//                            SWIPE in a direction to "flick": ↓ then ← = kickflip…)
//   Buttons     : GRAB (J), GRIND (K), MANUAL (L), SHUV (Shift+←/→), plus
//                 pause, camera, walk, respawn and help in the top corner.
// =============================================================================

// Is this a touch-first device (phone / tablet)?
export function isTouchDevice() {
  // A touchscreen laptop/Chromebook also has a trackpad ("fine" pointer) → keyboard.
  try {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const fine = window.matchMedia('(any-pointer: fine)').matches;
    return coarse || (navigator.maxTouchPoints > 0 && !fine);
  } catch (e) { return false; }
}

import { FlickGesture } from './gesture.js';

const KEY = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };

export class TouchControls {
  constructor(input, game) {
    this.input = input;
    this.game = game;
    this.enabled = false;
    this.held = {};               // code -> true (keys we are holding down)
    this.stick = null;            // { id, x0, y0 }
    this.pad = null;              // { id, x, y, lastDir }
    this.stickDirs = {};          // which directions the joystick currently wants
    this.gesture = new FlickGesture(input);
    this._build();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'touch';
    root.className = 'hidden';
    root.innerHTML = `
      <div id="t-stick-zone"><div id="t-stick-base"><div id="t-stick-knob"></div></div><span class="t-hint">steer · push</span></div>
      <div id="t-pad"><span>POP</span><small>pull ↓ · flick ↑</small></div>
      <div id="t-buttons">
        <button class="t-btn" data-key="KeyJ">GRAB</button>
        <button class="t-btn" data-key="KeyK">GRIND</button>
        <button class="t-btn" data-key="KeyL">MANUAL</button>
        <button class="t-btn" data-act="shuv">SHUV</button>
        <button class="t-btn t-flip" data-key="KeyZ">KICK<small>flip</small></button>
        <button class="t-btn t-flip" data-key="KeyX">HEEL<small>flip</small></button>
      </div>
      <div id="t-top">
        <button class="t-sm" data-key="KeyH" aria-label="Help">?</button>
        <button class="t-sm" data-key="KeyC" aria-label="Camera">CAM</button>
        <button class="t-sm" data-key="KeyE" aria-label="Walk">WALK</button>
        <button class="t-sm" data-key="KeyR" aria-label="Respawn">↺</button>
        <button class="t-sm" data-key="KeyP" aria-label="Pause">❚❚</button>
      </div>
      <div id="t-rotate">Turn your phone sideways for the best view ↻</div>`;
    document.body.appendChild(root);
    this.root = root;
    this.knob = root.querySelector('#t-stick-knob');
    this.base = root.querySelector('#t-stick-base');
    const opts = { passive: false };

    // ---- joystick (left half)
    const zone = root.querySelector('#t-stick-zone');
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY };
      const r = zone.getBoundingClientRect();
      this.base.style.left = (t.clientX - r.left) + 'px';
      this.base.style.top = (t.clientY - r.top) + 'px';
      this.base.classList.add('active');
      this._stickMove(t.clientX, t.clientY);
    }, opts);

    // ---- pop pad (right side)
    const pad = root.querySelector('#t-pad');
    pad.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.pad = { id: t.identifier };
      pad.classList.add('active');
      this.gesture.start(t.clientX, t.clientY);
    }, opts);

    // shared move / end handlers (multi-touch aware)
    window.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) { e.preventDefault(); this._stickMove(t.clientX, t.clientY); }
        if (this.pad && t.identifier === this.pad.id) { e.preventDefault(); this.gesture.move(t.clientX, t.clientY); }
      }
    }, opts);
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) {
          this.stick = null; this.base.classList.remove('active');
          this.knob.style.transform = 'translate(-50%, -50%)';
          for (const k of Object.values(KEY)) { this.stickDirs[k] = false; this._up(k); }
        }
        if (this.pad && t.identifier === this.pad.id) {
          this.pad = null; pad.classList.remove('active');
          this.gesture.end();
        }
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    // ---- buttons: hold = key held
    for (const b of root.querySelectorAll('[data-key]')) {
      const code = b.dataset.key;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('active'); this._down(code); }, opts);
      const up = (e) => { e.preventDefault(); b.classList.remove('active'); this._up(code); };
      b.addEventListener('touchend', up, opts);
      b.addEventListener('touchcancel', up, opts);
      b.addEventListener('click', (e) => { e.preventDefault(); this._tap(code); }); // mouse fallback
    }
    // SHUV = Shift + left/right (direction from the joystick, default left)
    const shuv = root.querySelector('[data-act="shuv"]');
    shuv.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation();
      const dir = this.held[KEY.right] ? KEY.right : KEY.left;
      const wasHeld = !!this.held[dir];
      this._down('ShiftLeft');
      if (wasHeld) this._up(dir);
      this._down(dir);
      setTimeout(() => { this._up(dir); this._up('ShiftLeft'); if (wasHeld && this.stick) this._down(dir); }, 60);
    }, opts);
  }

  _down(code) { if (this.held[code]) return; this.held[code] = true; this.input.simulate(code, true); }
  _up(code) { if (!this.held[code]) return; this.held[code] = false; this.input.simulate(code, false); }
  _tap(code) { this._down(code); setTimeout(() => this._up(code), 60); }

  _stickMove(x, y) {
    const R = 55;
    let dx = x - this.stick.x0, dy = y - this.stick.y0;
    const len = Math.hypot(dx, dy);
    if (len > R) { dx *= R / len; dy *= R / len; }
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const nx = dx / R, ny = dy / R;
    const set = (code, on) => { this.stickDirs[code] = on; on ? this._down(code) : this._up(code); };
    set(KEY.left, nx < -0.35);
    set(KEY.right, nx > 0.35);
    set(KEY.up, ny < -0.45);
    set(KEY.down, ny > 0.55);
  }

  setEnabled(on) {
    this.enabled = on;
    this.root.classList.toggle('hidden', !on);
    document.body.classList.toggle('touch', on);
    if (!on) for (const k of Object.keys(this.held)) this._up(k);
  }
  // show the controls only while actually playing
  setVisible(v) { this.root.classList.toggle('hidden', !(v && this.enabled)); }
}

// Help text for the touch layout (shown on the help overlay on touch devices)
export const TOUCH_HELP = [
  ['Moving'],
  ['Left thumb – joystick', 'Left / right = steer (spin in the air). Up = push (and pump on ramps). Down = brake / powerslide'],
  ['Right thumb – POP pad (like a flick stick)'],
  ['Pull ↓ then flick ↑', 'Ollie — pops the moment you flick'],
  ['Pull ↓ then flick ↖ / ↗', 'Kickflip / Heelflip'],
  ['Pull ↓, swipe ←, flick ↑', '360 Flip  (→ then ↑ = Laser Flip)'],
  ['Pull ↓, swipe ←, flick ↖', 'Double Kickflip (→ ↗ = Double Heelflip)'],
  ['Push ↑ then flick ↓', 'Nollie'],
  ['Touch & let go', 'Plain ollie (hold longer = higher)'],
  ['Buttons'],
  ['KICK / HEEL', 'Kickflip / Heelflip straight away (tap just after an ollie = late flip)'],
  ['SHUV (in the air)', 'Shuvit (hold joystick right for FS)'],
  ['GRAB (hold, in the air)', 'Grab — joystick direction picks Indy / Nosegrab / Tailgrab / Melon / Stalefish'],
  ['GRIND (hold as you land on a rail)', 'Joystick ↑ Nosegrind · ↓ 5-0 · ← Boardslide · → Lipslide'],
  ['MANUAL', 'Manual — balance with the joystick up / down'],
  ['Top corner', '? help · CAM camera · WALK off board · ↺ respawn · ❚❚ pause'],
];
