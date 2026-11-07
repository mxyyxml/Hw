# Lunch Break Skate 🛹🔔

A chill, physics-based, free-roam 3D skateboarding game that runs in the browser.
Flick-style trick input, momentum riding, grinds, manuals, combos, 10 challenges and a
2-minute **Lunch Session** score-attack mode. Everything (city, skater, sounds) is generated
in code — no image or audio files.

Built with plain HTML + JavaScript modules and [three.js](https://threejs.org) **0.160.0**
loaded from a CDN. No build step, no install.

---

## ▶️ Easiest way: double-click `play.html`

`play.html` is the whole game in **one file** (three.js and all the code are inside it).
Download the repo (**Code → Download ZIP**), unzip it, and double-click `play.html`.
It works offline and on school networks that block CDNs. Chrome is recommended.

(`play.html` is generated from the source in `js/` by `node tools/build-play.mjs` —
re-run that after editing the code, see the script for the two npm packages it needs.)

## ▶️ Play it on GitHub Pages
 `https://<your-username>.github.io/<repo-name>/` (or `/play.html` for the single-file version)
> Opening `index.html` straight from your hard drive (`file://`) won't work in most browsers
> because ES modules need a web server. GitHub Pages is the easiest option; locally you can
> run `python3 -m http.server` in this folder and open <http://localhost:8000>.

---

## 🎮 Controls

**Mouse flick (stick-style):** hold the left mouse button on the game and drag —
pull **down** to wind up, then flick **up** to pop. Flick **up-left** = Kickflip, **up-right** = Heelflip,
down → left → up = 360 Flip, down → right → up = Laser Flip, up → down = Nollie.
Letting go without a flick does a plain ollie.


| Key | Action |
| --- | --- |
| **W / ↑** | Push — tap for one stroke, hold to keep pushing. On a ramp: pump for speed |
| **S / ↓** | Brake — at speed it's a powerslide |
| **A D / ← →** | Steer on the ground, spin in the air |
| **Z / X / V / B** | One-key tricks: Kickflip / Heelflip / 360 Flip / Pop Shuvit (tap just after an ollie for a late flip) |
| **Space** (hold → release) | Crouch, then ollie. Longer hold = higher pop |
| **Hold Space + flick + release** | ↓↑ Ollie · ↓← Kickflip · ↓→ Heelflip · ↓↑← 360 Flip · ↓↑→ Laser Flip · ↓←← / ↓→→ Double flips · ←↓← / →↓→ Varials · ↑↓ Nollie |
| **Shift + ← / →** (air) | BS / FS Shuvit |
| **J** (+ direction, air) | Grab: Indy · ↑ Nosegrab · ↓ Tailgrab · ← Melon · → Stalefish |
| **Grinds** | Line up = 50-50. Hold ↑ / ↓ as you land on it = Nosegrind / 5-0. Board sideways (spin onto it) = Boardslide. While grinding tap ↑ ↓ ← → to switch grinds (each switch adds to the combo). K + direction picks any grind, K alone = Smith |
| **L** | Manual (L + ↑ = Nose Manual). Balance with W / S. Tap L in the air to land into one |
| **E** | Step off / on the board (walk with WASD, Shift to run) |
| **R** / **T** | Respawn at your spot / set a custom drop spot |
| **C** | Switch camera (close follow / wide filmer / low fisheye filmer) |
| **H** | Help overlay |
| **P / Esc** | Pause menu (teleport, challenges, settings) |

### 📱 Phones & tablets
Touch controls turn on automatically on touch-screen devices (Settings → Touch controls: Auto / On / Off).
Hold your phone sideways.

| Touch | Action |
| --- | --- |
| **Left joystick** | Steer / spin. Up = push & pump, down = brake |
| **POP pad** (right) | Works like a flick stick: pull ↓ then flick ↑ = Ollie, ↖ = Kickflip, ↗ = Heelflip, ↓ ← ↑ = 360 Flip, ↑ ↓ = Nollie. Tap = plain ollie |
| **GRAB / GRIND / MANUAL / SHUV** | Same as J / K / L / Shift+arrow (the joystick picks the direction) |
| **? · CAM · WALK · ↺ · ❚❚** | Help, camera, walk, respawn, pause |

### 👕 Closet
Title screen or Pause → **Closet**: hats, tops (hoodie, tee, jacket, flannel), jeans / cargos / shorts,
colours for everything, skin tone, hair, backpack, board colour, **stance (Regular / Goofy)** and
**push style (Normal / Mongo)**. Saved in your browser.

### 🛹 How the physics feels
- **Drop in** by rolling off any deck or coping into a ramp — you stay on the ramp and pick up speed.
- **Land a bit crooked?** Up to ~60° off you ride it out ("Sketchy!") and roll the way your **board** points,
  losing some speed. Further than that and you bail into a full physics ragdoll.
- **Landing assist** (Settings, on by default) straightens a slightly crooked board just before touchdown
  and nudges you onto a nearby landing ramp when you transfer.
- **Off the board (E):** WASD walks relative to the camera, Shift runs, Space jumps, you slide along walls.

**How it works:** you get onto rails and ledges automatically when you're close and lined up
in the air. Land with the board straight (forward or fakie) and your flip finished, or you
bail. Tricks chain into a combo while you keep landing within ~1.5 s — the combo total is
multiplied by the number of tricks in it. A bail loses the combo.

## 🗺️ The park

- **Centre plaza** – ledges, manual pads, a 30 m long rail, funbox, benches, kickers, the Plaza Gap
- **Stair plaza (north)** – 3-, 5- and 10-stair sets with handrails and hubbas
- **East** – halfpipe and mini-ramp (hold W while dropping in to pump)
- **West** – the bowl
- **Far west** – the mega-ramp (roll-in tower → kicker → gap → landing → quarter)
- **South** – a long downhill street with kickers and a rail

- **South-east – Southside Skatepark** – a fenced concrete park: quarter-pipe lines with coping, a spine,
  a pyramid with hip corners and a top rail, a 3-step-3 with a kinked rail, a funbox with an A-frame rail,
  manual pads, a flat bar, a euro gap, rollers, a big quarter-pipe and a flow bowl

Teleport spots (Pause → Teleport): Plaza, Stair Plaza, Mega-Ramp Roll-in, Downhill Street, Southside Skatepark.

## 🏆 Modes

- **Play** – free skate with challenges and best-combo tracking.
- **Lunch Session** – 2 minutes, score as much as you can before the bell.
  Best scores and completed challenges are saved in your browser (localStorage).

## ⚙️ Settings

Graphics **Auto** (High on PCs, Low on phones), **Low**, **High** (shadows, photo-texture surface relief,
sky reflections) or **Ultra** (High + ambient occlusion, SMAA anti-aliasing and 4K shadows — for PCs with a
decent graphics card). Also volume, camera sensitivity, camera style, landing assist and touch controls.

## 🛠️ Tweaking the game

Almost every number and name lives in **`js/config.js`**: gravity, push speed, friction,
pop height, trick names / flick sequences / points, grab & grind names, manual balance,
combo window, gaps, the 10 challenges, camera distances and key bindings.

| File | What it does |
| --- | --- |
| `index.html` | Page, HUD and menu markup, import map for three.js |
| `css/style.css` | HUD and menu styles |
| `js/config.js` | **All tunables** |
| `js/main.js` | Boot, game loop, modes, event wiring |
| `js/physics.js` | Collision shapes (box, wedge, quarter-pipe, bowl), rails, zones |
| `js/world.js` | Builds the park (visuals merged into one mesh) |
| `js/player.js` | Skater physics + state machine (ride, air, grind, manual, bail, walk) |
| `js/skater.js` | The low-poly skater and procedural animation |
| `js/tricks.js` | Flick resolver and combo scoring |
| `js/challenges.js` | Challenge checks |
| `js/camera.js` | Follow + filmer cameras |
| `js/audio.js` | Web Audio sound effects |
| `js/ui.js` | HUD, pop-ups, menus |
| `js/storage.js` | Safe localStorage helper |
| `js/body.js` | The skater's smooth skinned human body (one mesh, bones bend it) |
| `js/ragdoll.js` | Rapier physics ragdoll for bails + the flying board |
| `js/gesture.js` | Mouse / thumb flick-stick gestures |
| `js/touch.js` | Phone / tablet touch controls and device detection |
| `js/textures.js` | Procedural canvas textures (concrete, tiles, asphalt, wood, windows…) |
| `play.html` | Built single-file version of the whole game |
| `tools/build-play.mjs` | Builds `play.html` |

## 🧱 Open-source assets & libraries used

| What | Source | Licence |
| --- | --- | --- |
| 3D engine | [three.js](https://github.com/mrdoob/three.js) 0.160.0 | MIT |
| Ragdoll / board physics | [Rapier](https://github.com/dimforge/rapier) (`@dimforge/rapier3d-compat` 0.12.0) | Apache-2.0 |
| Photo textures: concrete floor 02, concrete tiles, asphalt 02, brushed concrete 2, plywood, leafy grass, brick wall 001, denim fabric, cotton jersey | [Poly Haven](https://polyhaven.com) | CC0 |
| Sky: Kloofendal 48d Partly Cloudy (Pure Sky) | [Poly Haven](https://polyhaven.com) | CC0 |

Textures were resized to 512×512 (and the concrete ones colour-neutralised) to stay light on Chromebooks;
they live in `assets/`. The skater, the park and the sounds are all made in code.

## Originality

Lunch Break Skate is an original game: its name, park layout, skater ("Pip") and every
asset are made from scratch in code. It doesn't use names, logos, maps, characters, music or
assets from any existing game.
