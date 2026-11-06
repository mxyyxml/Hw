# Lunch Break Skate 🛹🔔

A chill, physics-based, free-roam 3D skateboarding game that runs in the browser.
Flick-style trick input, momentum riding, grinds, manuals, combos, 10 challenges and a
2-minute **Lunch Session** score-attack mode. Everything (city, skater, sounds) is generated
in code — no image or audio files.

Built with plain HTML + JavaScript modules and [three.js](https://threejs.org) **0.160.0**
loaded from a CDN. No build step, no install.

---

## ▶️ Play it on GitHub Pages

1. Push this repository to GitHub (the files must be on the `main` branch).
2. On GitHub open the repo → **Settings** → **Pages**.
3. Under **Build and deployment** → **Source** choose **Deploy from a branch**.
4. Pick branch **`main`** and folder **`/ (root)`**, then click **Save**.
5. Wait ~1 minute. Your game will be live at
   `https://<your-username>.github.io/<repo-name>/`

> Opening `index.html` straight from your hard drive (`file://`) won't work in most browsers
> because ES modules need a web server. GitHub Pages is the easiest option; locally you can
> run `python3 -m http.server` in this folder and open <http://localhost:8000>.

---

## 🎮 Controls

| Key | Action |
| --- | --- |
| **W / ↑** | Push (tap repeatedly). On a ramp: pump for speed |
| **S / ↓** | Brake — at speed it's a powerslide |
| **A D / ← →** | Steer on the ground, spin in the air |
| **Space** (hold → release) | Crouch, then ollie. Longer hold = higher pop |
| **Hold Space + flick + release** | ↓↑ Ollie · ↓← Kickflip · ↓→ Heelflip · ↓↑← 360 Flip · ↓↑→ Laser Flip · ↓←← / ↓→→ Double flips · ←↓← / →↓→ Varials · ↑↓ Nollie |
| **Shift + ← / →** (air) | BS / FS Shuvit |
| **J** (+ direction, air) | Grab: Indy · ↑ Nosegrab · ↓ Tailgrab · ← Melon · → Stalefish |
| **K** + direction (landing on a rail) | ↑ Nosegrind · ↓ 5-0 · ← Boardslide · → Lipslide · K alone Smith. No K = 50-50 |
| **L** | Manual (L + ↑ = Nose Manual). Balance with W / S. Tap L in the air to land into one |
| **E** | Step off / on the board (walk with WASD, Shift to run) |
| **R** / **T** | Respawn at your spot / set a custom drop spot |
| **C** | Switch camera (close follow / wide filmer) |
| **H** | Help overlay |
| **P / Esc** | Pause menu (teleport, challenges, settings) |

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

Teleport spots (Pause → Teleport): Plaza, Stair Plaza, Mega-Ramp Roll-in, Downhill Street.

## 🏆 Modes

- **Play** – free skate with challenges and best-combo tracking.
- **Lunch Session** – 2 minutes, score as much as you can before the bell.
  Best scores and completed challenges are saved in your browser (localStorage).

## ⚙️ Settings

Graphics **Low** (default — no shadows, 1× resolution, made for school Chromebooks) or
**High** (real shadows, sharper), volume and camera sensitivity.

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

## Originality

Lunch Break Skate is an original game: its name, park layout, skater ("Pip") and every
asset are made from scratch in code. It doesn't use names, logos, maps, characters, music or
assets from any existing game.
