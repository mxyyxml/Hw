// =============================================================================
//  ui.js — HUD, trick pop-ups, help overlay and all menus (DOM based).
//  The game object passed in provides: startFree(), startLunch(), resume(),
//  quitToTitle(), teleport(i), applySetting(key, value), settings, challenges...
// =============================================================================
import { CHALLENGES } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// The controls table (shown on the H overlay and in the Controls menu)
const CONTROLS = [
  ['Riding'],
  ['<kbd>W</kbd> / <kbd>↑</kbd>', 'Push (tap repeatedly). On a ramp: pump for speed'],
  ['<kbd>S</kbd> / <kbd>↓</kbd>', 'Brake — at speed it\'s a powerslide'],
  ['<kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd>', 'Steer on the ground, spin in the air'],
  ['<kbd>Space</kbd> hold → release', 'Crouch, then ollie (longer hold = higher)'],
  ['Flick tricks (hold Space, press keys, release)'],
  ['<kbd>↓</kbd> <kbd>↑</kbd>', 'Ollie'],
  ['<kbd>↓</kbd> <kbd>←</kbd>', 'Kickflip'],
  ['<kbd>↓</kbd> <kbd>→</kbd>', 'Heelflip'],
  ['<kbd>↓</kbd> <kbd>↑</kbd> <kbd>←</kbd>', '360 Flip'],
  ['<kbd>↓</kbd> <kbd>↑</kbd> <kbd>→</kbd>', 'Laser Flip'],
  ['<kbd>↓</kbd> <kbd>←</kbd> <kbd>←</kbd> / <kbd>↓</kbd> <kbd>→</kbd> <kbd>→</kbd>', 'Double Kickflip / Double Heelflip'],
  ['<kbd>←</kbd> <kbd>↓</kbd> <kbd>←</kbd> / <kbd>→</kbd> <kbd>↓</kbd> <kbd>→</kbd>', 'Varial Kickflip / Varial Heelflip'],
  ['<kbd>↑</kbd> <kbd>↓</kbd>', 'Nollie'],
  ['In the air'],
  ['<kbd>Shift</kbd> + <kbd>←</kbd> / <kbd>→</kbd>', 'BS / FS Shuvit'],
  ['<kbd>J</kbd> (hold) + direction', 'Grab: Indy · ↑ Nosegrab · ↓ Tailgrab · ← Melon · → Stalefish'],
  ['Rails &amp; ledges'],
  ['Get close &amp; line up', 'Auto-snap into a 50-50'],
  ['<kbd>K</kbd> + direction as you land', '↑ Nosegrind · ↓ 5-0 · ← Boardslide · → Lipslide · K alone Smith'],
  ['<kbd>Space</kbd> on a rail', 'Pop out (flick tricks work too)'],
  ['<kbd>L</kbd>', 'Manual (L + ↑ = Nose Manual). Balance with W / S. Tap L in the air to land in one'],
  ['Other'],
  ['<kbd>E</kbd>', 'Step off / on the board (walk with WASD, Shift to run)'],
  ['<kbd>R</kbd> / <kbd>T</kbd>', 'Respawn at your spot / set a custom drop spot'],
  ['<kbd>C</kbd>', 'Switch camera (follow / filmer)'],
  ['<kbd>H</kbd>', 'Show / hide this help'],
  ['<kbd>P</kbd> / <kbd>Esc</kbd>', 'Pause menu'],
];

export function controlsHTML() {
  let h = '<div class="controls">';
  for (const row of CONTROLS) {
    if (row.length === 1) h += `<div class="ctl-section">${row[0]}</div>`;
    else h += `<div class="ctl-row"><span>${row[0]}</span><span>${row[1]}</span></div>`;
  }
  return h + '</div>';
}

export class UI {
  constructor(game) {
    this.game = game;
    this.menuStack = [];
    $('help-body').innerHTML = controlsHTML();
    // title screen buttons
    $('title').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.game.audio.init(); this.game.audio.ui();
      const act = b.dataset.act;
      if (act === 'play') this.game.startFree();
      else if (act === 'lunch') this.game.startLunch();
      else this.openMenu(act, true);
    });
    this._toastTimer = 0;
    this._lastCombo = '';
    this.refreshTitle();
  }

  // ---------------------------------------------------------------- screens
  showTitle(on) { $('title').classList.toggle('hidden', !on); if (on) this.refreshTitle(); }
  showHUD(on) { $('hud').classList.toggle('hidden', !on); }
  refreshTitle() {
    const g = this.game;
    $('title-best').textContent = `Best Lunch Session: ${fmt(g.best.lunch)} · Best combo: ${fmt(g.best.combo)} · Challenges ${g.challenges.count}/10`;
  }
  toggleHelp(force) {
    const el = $('help');
    const show = force !== undefined ? force : el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);
  }
  get menuOpen() { return !$('menu').classList.contains('hidden'); }

  // name: pause | settings | controls | challenges | teleport | results
  openMenu(name, fromTitle = false, data) {
    this.menuStack.push({ name, fromTitle, data });
    this._renderMenu();
  }
  back() {
    this.menuStack.pop();
    if (this.menuStack.length) this._renderMenu();
    else this.closeMenu();
  }
  closeMenu() {
    this.menuStack = [];
    $('menu').classList.add('hidden');
  }

  _renderMenu() {
    const top = this.menuStack[this.menuStack.length - 1];
    const g = this.game, card = $('menu-card');
    $('menu').classList.remove('hidden');
    const backBtn = `<div class="menu-buttons"><button data-act="back">Back</button></div>`;
    let h = '';
    switch (top.name) {
      case 'pause':
        h = `<h2>Paused</h2><div class="menu-buttons">
          <button class="primary" data-act="resume">Resume</button>
          <button data-act="teleport">Teleport to a spot</button>
          <button data-act="challenges">Challenges (${g.challenges.count}/10)</button>
          <button data-act="settings">Settings</button>
          <button data-act="controls">Controls</button>
          ${g.mode === 'lunch' ? '<button data-act="lunch">Restart Lunch Session</button>' : '<button data-act="lunch">Start a Lunch Session</button>'}
          <button data-act="title">Quit to title</button></div>`;
        break;
      case 'controls':
        h = `<h2>Controls</h2>${controlsHTML()}${backBtn}`;
        break;
      case 'settings': {
        const s = g.settings;
        h = `<h2>Settings</h2>
          <div class="setting"><span>Graphics</span><span class="row-buttons">
            <button data-set="graphics" data-val="low" class="${s.graphics === 'low' ? 'sel' : ''}">Low</button>
            <button data-set="graphics" data-val="high" class="${s.graphics === 'high' ? 'sel' : ''}">High</button></span></div>
          <p class="muted">Low = fast on Chromebooks (no shadows, 1x resolution). High = real shadows, sharper.</p>
          <div class="setting"><span>Volume <b id="vol-val">${Math.round(s.volume * 100)}%</b></span>
            <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-range="volume"></div>
          <div class="setting"><span>Camera sensitivity <b id="sens-val">${s.camSensitivity.toFixed(1)}</b></span>
            <input type="range" min="0.3" max="2" step="0.1" value="${s.camSensitivity}" data-range="camSensitivity"></div>
          <div class="setting"><span>Camera</span><span class="row-buttons">
            <button data-set="camera" data-val="follow" class="${g.rig.mode === 'follow' ? 'sel' : ''}">Follow</button>
            <button data-set="camera" data-val="filmer" class="${g.rig.mode === 'filmer' ? 'sel' : ''}">Filmer</button></span></div>
          ${backBtn}`;
        break;
      }
      case 'challenges': {
        h = `<h2>Challenges ${g.challenges.count}/10</h2><ul class="challenge-list">`;
        for (const c of CHALLENGES) {
          const d = g.challenges.isDone(c.id);
          h += `<li class="${d ? 'done' : ''}"><span class="tick">${d ? '✔' : '○'}</span>${c.text}</li>`;
        }
        h += `</ul><p class="muted center">Tip: the Pause menu can teleport you to the Stair Plaza and Mega-Ramp.</p>
          <div class="menu-buttons"><button data-act="resetch">Reset progress</button></div>${backBtn}`;
        break;
      }
      case 'teleport':
        h = `<h2>Teleport</h2><div class="menu-buttons">` +
          g.world.spots.map((s, i) => `<button data-tp="${i}">${s.name}</button>`).join('') +
          (g.player.customSpot ? `<button data-act="custom">My drop spot (T)</button>` : '') +
          `</div>${backBtn}`;
        break;
      case 'results': {
        const r = top.data;
        h = `<h2>Lunch's over! 🔔</h2>
          <div class="big-score">${fmt(r.score)}</div>
          <p class="center">${r.newBest ? '<b style="color:#7ae582">NEW BEST!</b>' : `Best: ${fmt(r.best)}`} · Biggest combo: ${fmt(r.bestCombo)}</p>
          <div class="menu-buttons"><button class="primary" data-act="lunch">Go again</button>
          <button data-act="play">Free skate</button><button data-act="title">Title screen</button></div>`;
        break;
      }
    }
    card.innerHTML = h;
    card.onclick = (e) => this._menuClick(e, top);
    card.oninput = (e) => {
      const k = e.target.dataset.range; if (!k) return;
      const v = parseFloat(e.target.value);
      g.applySetting(k, v);
      if (k === 'volume') $('vol-val').textContent = Math.round(v * 100) + '%';
      if (k === 'camSensitivity') $('sens-val').textContent = v.toFixed(1);
    };
    const first = card.querySelector('button'); if (first) first.focus({ preventScroll: true });
  }

  _menuClick(e, top) {
    const b = e.target.closest('button'); if (!b) return;
    const g = this.game;
    g.audio.init(); g.audio.ui();
    if (b.dataset.set) {
      g.applySetting(b.dataset.set, b.dataset.val);
      this._renderMenu();
      return;
    }
    if (b.dataset.tp !== undefined) { this.closeMenu(); g.teleport(+b.dataset.tp); return; }
    switch (b.dataset.act) {
      case 'back':
        this.back();
        if (!this.menuStack.length && top.fromTitle) this.showTitle(true);
        else if (!this.menuStack.length) g.resume();
        break;
      case 'resume': this.closeMenu(); g.resume(); break;
      case 'custom': this.closeMenu(); g.player.respawnLast(); g.resume(); break;
      case 'lunch': this.closeMenu(); g.startLunch(); break;
      case 'play': this.closeMenu(); g.startFree(); break;
      case 'title': this.closeMenu(); g.quitToTitle(); break;
      case 'resetch': g.challenges.reset(); this.refreshChallenges(); this._renderMenu(); break;
      default: this.openMenu(b.dataset.act, top.fromTitle);
    }
  }

  // ---------------------------------------------------------------- HUD bits
  popup(text, cls = '') {
    const el = document.createElement('div');
    el.className = 'popup ' + cls;
    el.textContent = text;
    const box = $('popups');
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => el.remove(), 1150);
  }
  toast(text, cls = '', ms = 2200) {
    const el = $('toast');
    el.textContent = text; el.className = cls;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  refreshChallenges() {
    const ch = this.game.challenges;
    $('ch-count').textContent = `${ch.count}/10`;
    const next = ch.next(2);
    $('ch-next').innerHTML = next.length ? next.map((c) => `<li>${c.text}</li>`).join('') : '<li>All done — legend! 🏆</li>';
  }

  // combo display. state: 'live' | 'banked' | 'dropped'
  showCombo(combo, state = 'live', total) {
    const el = $('combo');
    if (state === 'live') {
      if (!combo.active) { if (!el.classList.contains('banked') && !el.classList.contains('dropped')) el.classList.add('hidden'); return; }
      el.className = '';
      $('combo-chain').textContent = combo.chainText();
      $('combo-sum').textContent = fmt(combo.sum);
      $('combo-mult').textContent = combo.mult;
    } else {
      el.className = state;
      $('combo-sum').textContent = (state === 'banked' ? '+' : '') + fmt(total);
      $('combo-mult').textContent = '';
      clearTimeout(this._comboHide);
      this._comboHide = setTimeout(() => { if (el.classList.contains(state)) el.className = 'hidden'; }, 1400);
    }
  }

  updateHUD(dt) {
    const g = this.game, p = g.player;
    const v = p.displaySpeed();
    $('speed-num').textContent = Math.round(v * 3.6);
    $('speed-fill').style.width = Math.min(100, (v / 14) * 100) + '%';
    $('score').textContent = fmt(g.mode === 'lunch' ? g.lunch.score : g.score);
    $('best-combo').textContent = fmt(g.best.combo);
    const c = g.combo;
    if (c.active) $('combo-timer-fill').style.width = (p.isHoldingCombo() ? 100 : Math.max(0, c.timer / g.comboWindow) * 100) + '%';
    // manual balance meter
    const bal = $('balance');
    if (p.manual) { bal.classList.remove('hidden'); $('balance-mark').style.left = (50 + p.manual.b * 50) + '%'; }
    else bal.classList.add('hidden');
    // lunch timer
    const lt = $('lunch-timer');
    if (g.mode === 'lunch') {
      lt.classList.remove('hidden');
      const t = Math.max(0, g.lunch.time);
      lt.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
      lt.classList.toggle('low', t < 10);
    } else lt.classList.add('hidden');
  }
}
