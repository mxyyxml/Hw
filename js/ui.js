// =============================================================================
//  ui.js — loading screen, main menu, panel menus (pause, settings with key
//  rebinding, Locker, Career, Challenges), HUD, pop-ups and the help overlay.
//  The game object passed in provides: startFree(), startLunch(), resume(),
//  quitToTitle(), teleport(i), applySetting(key, value), settings, challenges...
// =============================================================================
import { CHALLENGES, OUTFIT_OPTIONS, OUTFIT_COLORS, KEYS, UNLOCKS } from './config.js';
import { LOAD } from './textures.js';
import { Storage } from './storage.js';
import { WEATHER_OPTIONS } from './weather.js';
import { TOUCH_HELP } from './touch.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

// The controls table (shown on the H overlay and in the Controls menu)
const CONTROLS = [
  ['Riding'],
  ['<kbd>W</kbd> / <kbd>↑</kbd>', 'Push — tap for one stroke, hold to keep pushing. On a ramp: pump. (Regular / Goofy / Mongo in the Locker)'],
  ['<kbd>S</kbd> / <kbd>↓</kbd>', 'Brake — at speed it\'s a powerslide'],
  ['<kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd>', 'Steer on the ground, spin in the air'],
  ['<kbd>Space</kbd> hold → release', 'Crouch, then ollie (longer hold = higher)'],
  ['One-key tricks (easiest!)'],
  ['<kbd>Z</kbd> / <kbd>X</kbd>', 'Kickflip / Heelflip — pops right away (or a late flip just after you take off)'],
  ['<kbd>V</kbd> / <kbd>B</kbd>', '360 Flip / Pop Shuvit'],
  ['HOLD <kbd>Z</kbd> / <kbd>X</kbd> / <kbd>V</kbd> in the air', 'Keep flipping: Double, then Triple (if you have the air). After a flick, hold <kbd>↓</kbd> instead'],
  ['Mouse flick (hold left button on the game & drag)'],
  ['Pull ↓ then flick ↑', 'Ollie — pops the moment you flick'],
  ['Pull ↓ then flick ↖ / ↗', 'Kickflip / Heelflip'],
  ['Pull ↓, drag ←, flick ↑', '360 Flip  (→ then ↑ = Laser Flip)'],
  ['Push ↑ then flick ↓', 'Nollie'],
  ['Keyboard flick tricks (hold Space, press keys, release)'],
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
  ['Hold <kbd>↑</kbd> / <kbd>↓</kbd> as you land on it', 'Nosegrind / 5-0'],
  ['Spin the board sideways onto it', 'Boardslide (hold → for Lipslide)'],
  ['While grinding: tap <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd>', 'Switch to Nosegrind / 5-0 / Boardslide / Lipslide (each switch adds to your combo)'],
  ['<kbd>K</kbd> (+ direction)', 'Pick a grind any time: K alone = Smith'],
  ['<kbd>Shift</kbd> + <kbd>K</kbd> (+ direction)', 'Crooked (↑) / Feeble (↓) / Bluntslide (←) / Noseblunt (→)'],
  ['<kbd>Space</kbd> on a rail', 'Pop out (flick tricks work too)'],
  ['<kbd>L</kbd>', 'Manual (L + ↑ = Nose Manual). Balance with W / S. Tap L in the air to land in one'],
  ['Controller (Xbox / PlayStation)'],
  ['Left stick', 'Steer (analog) · up = push · down = brake'],
  ['Right stick FLICK-IT', 'Pull ↓ to crouch, flick ↑ = Ollie, ↖ / ↗ = Kickflip / Heelflip, ↓ ← ↑ = 360 Flip'],
  ['A · B · X · Y', 'Push · step off / on · grind · manual'],
  ['RB / RT · LB · LT', 'Grab · revert · shift (shuvits, shift-grinds)'],
  ['L3 · R3 · Back · Start', 'Backflip · respawn · camera · pause'],
  ['Other'],
  ['<kbd>E</kbd>', 'Step off (the board stays on the ground) / jump back on — works while running and mid-jump'],
  ['Off the board', 'A / D (or hold the RIGHT mouse button and drag) turn you and the camera together. W runs (keeps speeding up into a sprint, or hold Shift), S backs up, Space jumps. E hops back on the board'],
  ['Right mouse + drag (skating)', 'Look around — the camera swings back behind you when you let go'],
  ['<kbd>R</kbd> / <kbd>T</kbd>', 'Respawn at your spot / set a custom drop spot'],
  ['<kbd>C</kbd>', 'Switch camera (follow / filmer / fisheye / first person)'],
  ['<kbd>Q</kbd>', 'Revert: spin the board 180° on its wheels and roll away (hold Q when landing to revert out of it)'],
  ['<kbd>K</kbd> (air, along a wall)', 'Wallride — the board sticks to a tall wall; Space to wallie off'],
  ['<kbd>F</kbd> (air)', 'Backflip — hold W for a frontflip. Needs big air (mega ramp / big kickers)'],
  ['<kbd>G</kbd> (hold)', 'Speed glitch — rapid tap-pushes that go past the normal push speed'],
  ['<kbd>N</kbd>', 'Pop glitch — an extra-big pop (~1.4 m): hit Z / X / V / B while you\'re up there to flip it'],
  ['<kbd>Y</kbd>', 'Cinematic replay of the last 12 seconds (Y again to go back)'],
  ['<kbd>H</kbd>', 'Show / hide this help'],
  ['<kbd>P</kbd> / <kbd>Esc</kbd>', 'Pause menu'],
];

export function controlsHTML(rows = CONTROLS) {
  let h = '<div class="controls">';
  for (const row of rows) {
    if (row.length === 1) h += `<div class="ctl-section">${row[0]}</div>`;
    else h += `<div class="ctl-row"><span>${row[0]}</span><span>${row[1]}</span></div>`;
  }
  return h + '</div>';
}


// ---------------------------------------------------------------- menu data
const TIPS = [
  'Hold Space longer for a higher ollie.',
  'Tap N for a pop glitch, then flip it with Z / X / V / B.',
  'Hold G to speed-glitch past the push cap.',
  'Line up with a rail and it snaps into a 50-50.',
  'F in big air: backflip. Hold W for a frontflip.',
  'Q on the ground reverts — hold it when landing to revert out.',
  'Every banked combo is XP for your Career level.',
  'The Mega Gap is at the end of Park HaYarkon. Bring speed.',
  'Rebind any key in Settings → Controls.',
];
const LOCKER = [
  ['skater', 'Skater', ['body', 'skin', 'hairStyle', 'hairColor', 'facialHair', 'glasses', 'stance', 'pushStyle']],
  ['tops', 'Tops', ['top', 'topColor', 'print']],
  ['bottoms', 'Bottoms', ['pants', 'pantsColor', 'socks', 'sockColor']],
  ['shoes', 'Shoes', ['shoeStyle', 'shoeColor', 'soleColor']],
  ['acc', 'Accessories', ['hat', 'hatColor', 'backpack', 'packColor', 'chain']],
  ['board', 'Board', ['deckGraphic', 'deckColor', 'gripColor', 'truckColor', 'wheelSize', 'wheelColor']],
];
const LABELS = { hat: 'Headwear', top: 'Top', pants: 'Bottoms', backpack: 'Backpack', hatColor: 'Headwear colour', topColor: 'Top colour', pantsColor: 'Bottoms colour',
  shoeColor: 'Upper colour', soleColor: 'Sole colour', shoeStyle: 'Silhouette', skin: 'Skin tone', hairColor: 'Hair colour', deckColor: 'Deck colour', stance: 'Stance', pushStyle: 'Pushing',
  body: 'Body', hairStyle: 'Hairstyle', facialHair: 'Facial hair', glasses: 'Eyewear', packColor: 'Backpack colour', deckGraphic: 'Deck graphic', wheelSize: 'Wheel size',
  wheelColor: 'Wheel colour', print: 'Graphic', socks: 'Socks', sockColor: 'Sock colour', chain: 'Chain', gripColor: 'Grip tape', truckColor: 'Trucks' };
const SETTINGS_TABS = [['graphics', 'Graphics'], ['audio', 'Audio'], ['controls', 'Controls'], ['camera', 'Camera'], ['gameplay', 'Gameplay']];
const BIND_NAMES = { up: 'Push / forward', down: 'Brake / back', left: 'Steer left', right: 'Steer right', pop: 'Ollie (hold)', shift: 'Shuvit modifier',
  grab: 'Grab', grind: 'Grind / wallride', manual: 'Manual', walk: 'Step off / on', respawn: 'Respawn', setSpot: 'Set drop spot', camera: 'Camera',
  kickflip: 'Kickflip', heelflip: 'Heelflip', treflip: '360 Flip', popshuv: 'Pop Shuvit', pause: 'Pause', help: 'Help', replay: 'Replay',
  bodyflip: 'Back / frontflip', revert: 'Revert', speedGlitch: 'Speed glitch', popGlitch: 'Pop glitch' };
const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
const keyName = (c) => ARROWS[c] || (c || '—').replace(/^Key|^Digit/, '').replace(/(Left|Right)$/, ' $1');
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// XP → career level: level n starts at 1500·(n−1)² XP
export const levelOf = (xp) => { const l = Math.floor(Math.sqrt(xp / 1500)) + 1, a = 1500 * (l - 1) ** 2, b = 1500 * l * l; return { level: l, frac: (xp - a) / (b - a), next: b - xp }; };

export class UI {
  constructor(game) {
    this.game = game;
    this.menuStack = [];
    this.tab = { closet: 'skater', settings: 'graphics' };
    $('help-body').innerHTML = controlsHTML();
    $('title').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this._go(b.dataset.act, true);
    });
    // menu keyboard: ↑/↓ move between buttons, Enter starts from the title
    window.addEventListener('keydown', (e) => {
      if (this._binding) return;
      const onTitle = !$('title').classList.contains('hidden');
      if (!onTitle && !this.menuOpen) return;
      if (e.code === 'Enter' && onTitle && !e.target.closest?.('button')) { this._go('play', true); return; }
      if (e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
      const root = onTitle ? $('title') : $('menu-card');
      const items = [...root.querySelectorAll('button.nav-item, button.btn')];
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      items[(i + (e.code === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    });
    this._toastTimer = 0;
    this._loading(performance.now());
  }

  _go(act, fromTitle) {
    const g = this.game;
    g.audio.init(); g.audio.ui();
    if (act === 'play') g.startFree();
    else if (act === 'lunch') g.startLunch();
    else { this.showTitle(false); this.openMenu(act, fromTitle); }
  }

  // ---------------------------------------------------------------- loading screen
  _loading(t0) {
    const el = $('loading');
    $('load-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      const frac = LOAD.total ? LOAD.done / LOAD.total : 0;
      const shown = Math.min(frac, t / 1.2);                     // never jump to 100% instantly
      $('load-fill').style.width = (shown * 100).toFixed(1) + '%';
      $('load-pct').textContent = Math.round(shown * 100) + '%';
      if ((frac >= 1 && t > 1.2) || t > 12) {                    // shortcut: 12 s cap so a dead asset never blocks the menu
        el.classList.add('done');
        setTimeout(() => el.remove(), 700);
        if (this.game.mode === 'title' && !this.menuOpen) this.showTitle(true);
        return;
      }
      if (Math.floor(t / 3.5) !== this._tipN) { this._tipN = Math.floor(t / 3.5); $('load-tip').textContent = TIPS[(this._tipN * 5 + 3) % TIPS.length]; }
      requestAnimationFrame(tick);
    };
    tick();
  }
  get loaded() { return !document.getElementById('loading') || $('loading').classList.contains('done'); }

  // ---------------------------------------------------------------- screens
  showTitle(on) {
    if (on && !this.loaded) return;
    $('title').classList.toggle('hidden', !on);
    if (on) { this.refreshTitle(); $('title').querySelector('.nav-item').focus({ preventScroll: true }); }
  }
  showHUD(on) { $('hud').classList.toggle('hidden', !on); }
  refreshTitle() {
    const g = this.game, L = levelOf(g.stats.xp);
    $('nav-ch').textContent = `${g.challenges.count}/${CHALLENGES.length} missions`;
    $('player-card').innerHTML = `<div class="pc-top"><span class="pc-lvl">LEVEL <b>${L.level}</b></span><span class="muted">${fmt(L.next)} XP to next</span></div>
      <div class="xp"><i style="width:${(L.frac * 100).toFixed(1)}%"></i></div>
      <div class="pc-stats"><span><b>${fmt(g.best.lunch)}</b>Best session</span><span><b>${fmt(g.best.combo)}</b>Best combo</span><span><b>${g.challenges.count}/${CHALLENGES.length}</b>Missions</span></div>`;
  }
  toggleHelp(force) {
    const el = $('help');
    $('help-body').innerHTML = controlsHTML(this.game.touchOn ? TOUCH_HELP : CONTROLS);
    el.querySelector('.muted').innerHTML = this.game.touchOn ? 'Tap <b>?</b> to close' : 'Press <kbd>H</kbd> to close';
    const show = force !== undefined ? force : el.classList.contains('hidden');
    el.classList.toggle('hidden', !show);
  }
  get menuOpen() { return !$('menu').classList.contains('hidden'); }
  get topMenu() { const t = this.menuStack[this.menuStack.length - 1]; return t && this.menuOpen ? t.name : null; }

  // name: pause | settings | controls | closet | stats | challenges | teleport | results
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
    this._binding = null;
    $('menu').classList.add('hidden');
  }

  // ---------------------------------------------------------------- panel builders
  _head(crumb, title) { return `<div class="crumb">${crumb}</div><h1>${title}</h1>`; }
  _tabs(menu, tabs) { return `<div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${this.tab[menu] === k ? 'sel' : ''}" data-tab="${menu}" data-val="${k}">${n}</button>`).join('')}</div>`; }
  _seg(key, opts, cur) { return `<span class="seg">${opts.map(([v, n]) => `<button data-set="${key}" data-val="${v}" class="${cur === v ? 'sel' : ''}">${n}</button>`).join('')}</span>`; }
  _back() { return `<button class="back" data-act="back">← Back <kbd>Esc</kbd></button>`; }

  _pause(g) {
    return this._head(g.mode === 'lunch' ? 'Board Session' : 'Free Skate', 'Paused') + `<div class="list">
      <button class="btn primary" data-act="resume">Resume <small>P</small></button>
      <button class="btn" data-act="teleport">Teleport <small>${g.world.spots.length} spots</small></button>
      <button class="btn" data-act="closet">Locker <small>Skater · fits · board</small></button>
      <button class="btn" data-act="challenges">Missions <small>${g.challenges.count}/${CHALLENGES.length}</small></button>
      <button class="btn" data-act="stats">Career <small>Level ${levelOf(g.stats.xp).level}</small></button>
      <button class="btn" data-act="settings">Settings</button>
      <button class="btn" data-act="lunch">${g.mode === 'lunch' ? 'Restart Board Session' : 'Start a Board Session'}</button>
      <button class="btn danger" data-act="title">Quit to main menu</button></div>`;
  }

  _closet(g) {
    const o = g.outfit, tab = LOCKER.find((t) => t[0] === this.tab.closet);
    let h = this._head('Locker', tab[1]) + this._tabs('closet', LOCKER.map(([k, n]) => [k, n]));
    for (const k of tab[2]) {
      if (OUTFIT_OPTIONS[k]) h += `<h3>${LABELS[k]}</h3><div class="tiles">` + OUTFIT_OPTIONS[k].map(([v, name]) => {
        const need = UNLOCKS[k + ':' + v], locked = need && levelOf(g.stats.xp).level < need && o[k] !== v;
        return locked ? `<button class="tile locked" disabled>${name}<small>🔒 Level ${need}</small></button>`
          : `<button class="tile ${o[k] === v ? 'sel' : ''}" data-outfit="${k}" data-val="${v}">${name}</button>`;
      }).join('') + '</div>';
      else if (OUTFIT_COLORS[k]) h += `<h3>${LABELS[k]}</h3><div class="swatches">` + OUTFIT_COLORS[k].map((c) =>
        `<button class="swatch ${o[k] === c ? 'sel' : ''}" style="background:${hex(c)}" data-outfit="${k}" data-color="${c}" aria-label="${LABELS[k]} ${hex(c)}"></button>`).join('') + '</div>';
    }
    return `<div class="locker">${h}${this._back()}</div>`;
  }

  _settings(g) {
    const s = g.settings, t = this.tab.settings;
    let h = this._head('Options', 'Settings') + this._tabs('settings', SETTINGS_TABS);
    const row = (name, desc, ctl) => `<div class="set-row"><span>${name}${desc ? `<span class="desc">${desc}</span>` : ''}</span>${ctl}</div>`;
    if (t === 'graphics') {
      const cards = [['low', 'Low', 'Fastest. Phones and old laptops.'], ['high', 'High', 'Shadows, PBR, photo sky, AO, bloom, SMAA.'], ['ultra', 'Ultra', 'High + full-res AO and 4K shadows.']];
      h += `<h3>Preset</h3><div class="cards3">${cards.map(([v, n, d]) => `<button class="card-opt ${g.graphicsLevel === v ? 'sel' : ''}" data-set="graphics" data-val="${v}"><b>${n}</b><span>${d}</span></button>`).join('')}</div>`;
      h += row('Weather', 'Sky, light, fog and rain', this._seg('weather', WEATHER_OPTIONS, s.weather || 'clear'));
      h += row('Frame rate', 'Live measurement', `<b>${Math.round(g.fps)} fps</b>`);
    } else if (t === 'audio') {
      h += row(`Master volume <b id="vol-val">${Math.round(s.volume * 100)}%</b>`, 'Wheels, pops, grinds, the city and the sea', `<input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-range="volume">`);
    } else if (t === 'controls') {
      h += `<p class="muted">Click a binding, then press the new key. <kbd>Esc</kbd> cancels. Arrow keys stay as a second binding for movement.</p>`;
      for (const [a, n] of Object.entries(BIND_NAMES)) if (KEYS[a]) h += `<div class="bind"><span>${n}</span><button data-bind="${a}" class="${this._binding === a ? 'wait' : ''}">${this._binding === a ? 'Press a key…' : keyName(KEYS[a][0])}</button></div>`;
      h += `<div class="list"><button class="btn" data-act="controls">Full controls reference</button><button class="btn danger" data-act="resetkeys">Reset to defaults</button></div>`;
    } else if (t === 'camera') {
      h += row('Camera', 'Also C while skating', this._seg('camera', [['follow', 'Follow'], ['filmer', 'Filmer'], ['fisheye', 'Fisheye'], ['first', 'First person']], g.rig.mode));
      h += row(`Mouse sensitivity <b id="sens-val">${s.camSensitivity.toFixed(1)}</b>`, 'Right-mouse drag look', `<input type="range" min="0.3" max="2" step="0.1" value="${s.camSensitivity}" data-range="camSensitivity">`);
    } else {
      h += row('Landing assist', 'Small corrections so near-misses land', this._seg('assist', [['on', 'On'], ['off', 'Off']], s.assist !== false ? 'on' : 'off'));
      h += row('Touch controls', 'On-screen pads for phones and tablets', this._seg('touch', [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], s.touch || 'auto'));
    }
    return h + this._back();
  }

  _stats(g) {
    const S = g.stats, L = levelOf(S.xp), m = (x) => (x >= 1000 ? (x / 1000).toFixed(1) + ' km' : Math.round(x) + ' m');
    const t = (x) => (x >= 3600 ? (x / 3600).toFixed(1) + ' h' : Math.round(x / 60) + ' min');
    const cells = [[fmt(S.tricks), 'Tricks landed'], [fmt(S.flips), 'Flip tricks'], [fmt(S.grinds), 'Grinds'], [fmt(S.combos), 'Combos banked'], [fmt(S.bails), 'Bails'],
      [S.grindTime.toFixed(1) + ' s', 'Time grinding'], [S.airTime.toFixed(0) + ' s', 'Air time'], [S.bestAir.toFixed(2) + ' m', 'Highest air'], [m(S.distance), 'Distance'],
      [t(S.playTime), 'Time skated'], [fmt(g.best.lunch), 'Best session'], [fmt(g.best.combo), 'Best combo']];
    return this._head('Career', 'Stats') + `<div class="level-hero"><span class="big">${L.level}</span><div style="flex:1"><b>LEVEL ${L.level}</b> · ${fmt(S.xp)} XP
      <div class="xp"><i style="width:${(L.frac * 100).toFixed(1)}%"></i></div><span class="muted">${fmt(L.next)} XP to level ${L.level + 1} — bank combos to earn XP</span></div></div>
      <div class="stat-grid">${cells.map(([v, n]) => `<div class="stat"><b>${v}</b><span>${n}</span></div>`).join('')}</div>` + this._back();
  }

  _challenges(g) {
    const N = CHALLENGES.length, seen = Storage.get('areas', []);
    let h = this._head('Career', `Missions ${g.challenges.count}/${N}`) + `<div class="xp" style="margin:16px 0"><i style="width:${g.challenges.count / N * 100}%"></i></div>`;
    g.world.spots.forEach((s, a) => {
      const list = CHALLENGES.filter((c) => c.area === a); if (!list.length) return;
      const done = list.filter((c) => g.challenges.isDone(c.id)).length;
      h += `<h3>${seen.includes(a) ? s.name.replace(/ \(.*\)$/, '') : '??? — undiscovered'} <span class="muted">${done}/${list.length}</span>` +
        `<button class="tp-mini" data-tp="${a}">Go</button></h3>`;
      for (const c of list) { const d = g.challenges.isDone(c.id); h += `<div class="ch ${d ? 'done' : ''}"><span class="dot"></span><span>${c.text}</span><small>${d ? 'DONE' : '+' + fmt(c.xp) + ' XP'}</small></div>`; }
    });
    return h + `<div class="list"><button class="btn danger" data-act="resetch">Reset progress</button></div>` + this._back();
  }

  _renderMenu() {
    const top = this.menuStack[this.menuStack.length - 1];
    const g = this.game, card = $('menu-card');
    $('menu').classList.remove('hidden');
    let h = '';
    switch (top.name) {
      case 'pause': h = this._pause(g); break;
      case 'closet': h = this._closet(g); break;
      case 'settings': h = this._settings(g); break;
      case 'stats': h = this._stats(g); break;
      case 'challenges': h = this._challenges(g); break;
      case 'controls':
        h = this._head('Settings', 'Controls') + (g.touchOn ? controlsHTML(TOUCH_HELP) : '') + controlsHTML() + this._back(); break;
      case 'teleport':
        h = this._head('Map', 'Teleport') + '<div class="list">' + g.world.spots.map((s, i) => `<button class="btn" data-tp="${i}">${s.name}<small>${String(i + 1).padStart(2, '0')}</small></button>`).join('') +
          (g.player.customSpot ? `<button class="btn" data-act="custom">My drop spot <small>T</small></button>` : '') + '</div>' + this._back(); break;
      case 'results': {
        const r = top.data;
        h = this._head('Board Session', 'Time!') + `<div class="results-score">${fmt(r.score)}</div>
          <p>${r.newBest ? '<b style="color:var(--good)">NEW PERSONAL BEST</b>' : `Best: ${fmt(r.best)}`} · Biggest combo: ${fmt(r.bestCombo)}</p>
          <div class="list"><button class="btn primary" data-act="lunch">Go again</button><button class="btn" data-act="play">Free skate</button><button class="btn" data-act="title">Main menu</button></div>`;
        break;
      }
    }
    card.innerHTML = h;
    if (this._lastTop !== top) { card.scrollTop = 0; this._lastTop = top; }
    card.onclick = (e) => this._menuClick(e, top);
    card.oninput = (e) => {
      const k = e.target.dataset.range; if (!k) return;
      const v = parseFloat(e.target.value);
      g.applySetting(k, v);
      if (k === 'volume') $('vol-val').textContent = Math.round(v * 100) + '%';
      if (k === 'camSensitivity') $('sens-val').textContent = v.toFixed(1);
    };
  }

  _rerender() { const c = $('menu-card'), s = c.scrollTop; this._renderMenu(); c.scrollTop = s; }

  // wait for one key press and bind it (capture phase so the game never sees it)
  _startBind(action) {
    this._binding = action; this._rerender();
    const onKey = (e) => {
      e.preventDefault(); e.stopImmediatePropagation();
      window.removeEventListener('keydown', onKey, true);
      if (e.code !== 'Escape' && this._binding === action) {
        this.game.input.rebind(action, e.code);
        const saved = Storage.get('keys', {}); saved[action] = e.code;
        for (const [a, c] of Object.entries(saved)) if (a !== action && c === e.code) delete saved[a];
        Storage.set('keys', saved);
      }
      this._binding = null; if (this.menuOpen) this._rerender();
    };
    window.addEventListener('keydown', onKey, true);
  }

  _menuClick(e, top) {
    const b = e.target.closest('button'); if (!b) return;
    const g = this.game;
    g.audio.init(); g.audio.ui();
    if (b.dataset.tab) { this.tab[b.dataset.tab] = b.dataset.val; this._renderMenu(); $('menu-card').scrollTop = 0; return; }
    if (b.dataset.bind) { if (!this._binding) this._startBind(b.dataset.bind); return; }
    if (b.dataset.set) { g.applySetting(b.dataset.set, b.dataset.val); this._rerender(); return; }
    if (b.dataset.outfit) {
      const k = b.dataset.outfit;
      let v = b.dataset.color !== undefined ? parseInt(b.dataset.color, 10) : b.dataset.val;
      if (v === 'true') v = true; else if (v === 'false') v = false; else if (/^\d+$/.test(v)) v = Number(v);
      g.setOutfit(k, v);
      this._rerender();
      return;
    }
    if (b.dataset.tp !== undefined) { this.closeMenu(); if (g.mode === 'title') g.startFree(); g.teleport(+b.dataset.tp); return; }
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
      case 'resetkeys': Storage.set('keys', {}); location.reload(); break;
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
    $('ch-count').textContent = `${ch.count}/${CHALLENGES.length}`;
    const a = this.game.area ?? -1, spot = this.game.world.spots[a];
    $('ch-area').textContent = spot ? spot.name.replace(/ \(.*\)$/, '') : 'Missions';
    const next = ch.next(2, a);
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
