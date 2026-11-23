-Jew Board 🛹🔔

A chill, physics-based, free-roam 3D skateboarding game that runs in the browser.
Flick-style trick input, momentum riding, grinds, manuals, combos, 10 challenges and a
2-minute **Board Session** score-attack mode. Everything (city, skater, sounds) is generated
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
| **Z / X / V / B** | One-key tricks: Kickflip / Heelflip / 360 Flip / Pop Shuvit (tap just after an ollie for a late flip). **Hold** to keep flipping → Double / Triple |
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
Title screen or Pause → **Closet**: body type, 9 hairstyles (real modelled short, crop, skater flow, long,
ponytail and afro hair, plus buzz, mohawk, bald), hats fitted to the head (beanie, cap, backwards cap,
bucket hat, helmet, kippah), a padded backpack with fitted straps (8 colours), facial hair (stubble, mustache, goatee, beard), hats, glasses / sunglasses,
9 tops (tee, oversized tee, tank, long sleeve, hoodie, flannel, jacket, jersey, shirtless),
7 bottoms (jeans, baggy, skinny, cargos, cropped chinos, shorts, board shorts), colours for everything, skin tone,
hair colour, backpack, shirt prints, socks (crew / high / ankle) and sock colour, deck graphics,
wheel size (52–60 mm) and colour, board colour, **stance (Regular / Goofy)** and **push style (Normal / Mongo)**.
Saved in your browser.

Clothes and hair are real layers cut from the body surface along smooth lines (necklines, sleeves,
hems, hairlines), loosened where fabric hangs and skinned to the same bones, so they move with the body.

### 🆕 More tricks, reverts, flips & first person
- New flick tricks (hold Space, then the arrows): **Hardflip** → ↓ ←, **Inward Heelflip** ← ↓ →,
  **360 Shuvit** ← ← (FS: → →), **Impossible** ↑ ↑, **Nollie Flip / Heelflip** ↑ ← / ↑ →.
- **Q = Revert** (the board spins 180° on its wheels; hold Q as you land to revert straight out of it).
- **F in the air = Backflip**, hold **W** for a **Frontflip**. The rider tucks tighter to rotate faster,
  but needs real air (big kickers, mega ramp, Titan Park); land short of a full rotation and you slam.
- **Glitches (Skate-style):** hold **G** for the speed glitch (rapid tap-pushes past the normal push
  speed, up to the board's max); **N** = pop glitch (the board clips and fires you 4–7 m into the sky
  tumbling — sort the board out before you land).
- **More grinds:** **Shift + K** + ↑ Crooked, ↓ Feeble, ← Bluntslide, → Noseblunt.
- **Backflip / frontflip** now rotate nose-over-tail (a real backflip), not sideways.
- **Off the board** you carry it by the truck in your hand; E drops it and you hop on.
- **Wallrides:** hold **K** in the air while travelling along a tall wall (buildings, the Tel Aviv
  apartment lobbies, big walls): wall friction holds you up at first, then gravity takes over. **Space**
  wallies off. One wallride per jump.
- **Camera:** pulls in in front of walls and buildings instead of clipping into them, and pulls back /
  up on big airs to keep the landing in frame.
- **C** now cycles follow → filmer → fisheye → **first person** (you see through the rider's eyes, with
  every push, crouch and landing).
- Rolling back down a ramp (fakie) no longer whips the camera round — it glides round smoothly.

### 👟 Character & board detail
- **Skate shoes** are lofted through foot-shaped cross-sections (narrow heel, wide ball, rounded toe box,
  padded collar) with a vulcanised sole, foxing band, tongue, criss-cross laces through eyelets, suede
  toe & heel panels with stitching and an original side stripe.
- **Relaxed hands:** fingers curl naturally into the palm (MakeHuman's finger joints, forward kinematics).
- **Fabric folds:** jeans stack in ripples over the shoes, crease behind the knees and whisker at the
  hips; shirts and hoodies drape in folds toward the hem and bunch at the sleeves.
- **Board wear:** nose & tail scraped to the maple, rail burn along the edges, slide scuffs; lacquered
  deck graphic, urethane wheels with a soft sheen, metal trucks & bolts.

### ⚙️ Performance
Collision queries use a 10 m spatial grid (≈13× faster ground checks, verified identical to the old
linear scan on 40,000 random points); rails are bucketed the same way.

### 🎬 Replay & sound
Press **Y** for a cinematic replay of the last 12 seconds (tracking, orbit and tripod shots). Wheels
sound different on smooth ramps, concrete (with the clack of paving joints), rough street and sand;
metal grinds and wood/concrete slides sound different; footsteps off the board; city hum and waves
at the beach.

### 🏖️ Tel Aviv Beach (teleport: "Tel Aviv Beach Promenade")
A Mediterranean beachfront on the west side of the city: open sea, a sand beach (sand slows you down)
with umbrellas, loungers and a lifeguard tower, a raised tiled promenade with a grindable sea-wall edge,
three stair sets with handrails down to the sand, banks up from the street, palm trees, granite benches
and white Bauhaus-style apartment blocks on pilotis across the beach road. Israeli flags line the promenade
and rooftops, Stars of David are set into the promenade, on the buildings and as a big beach sculpture,
with a golden menorah monument, a synagogue, blue-and-white bunting and Hebrew signs.

### 🛹 How the physics feels
- **Drop in** by rolling off any deck or coping into a ramp — you stay on the ramp and pick up speed.
- **Land a bit crooked?** Up to ~60° off you ride it out ("Sketchy!") and roll the way your **board** points,
  losing some speed. Further than that and you bail into a full physics ragdoll.
- **Landing assist** (Settings, on by default) straightens a slightly crooked board just before touchdown
  and nudges you onto a nearby landing ramp when you transfer.
- **Off the board (E):** the board stays where you stepped off. **A / D or right-mouse drag turn you and the
  camera together**, W runs (breaking into a sprint), S backs up, Space jumps (with a little grace after running
  off a ledge). Press E — even running or mid-jump — to throw the board down and hop onto it with your speed.
- **Right-mouse drag while skating** swings the camera around you; it springs back when you let go.
- **Carving grip:** turn rate is limited by sideways grip (~0.75 g), so the faster you go, the wider you carve.
- **Weight shift:** you lean into a carve over a fraction of a second — tap A / D for small line corrections,
  hold for a full carve. The trucks can't turn tighter than about 1 m; nearly stopped, you **kick turn**
  (pivot on the back wheels) instead.
- **Balance:** after landings, curbs and bumps your centre of mass is a real inverted pendulum —
  your reflexes pull it back (stronger crouched), leaning A / D against the fall helps, and past
  ~35° you go down. Crooked or hard landings throw your weight more.
- **Knees** are a spring-damper that soaks up every landing; popping while still compressed gives a
  weaker ollie.
- **Two-truck contact:** the board sits on its front and back wheels, so it pitches across ramp
  bottoms, lips and curbs instead of floating on one point.
- **Wheels matter:** bigger wheels (Closet) roll over rough ground more easily and chatter less.
- **Wheel chatter & speed wobbles:** rough asphalt and sand buzz through the board; bombing faster than
  ~47 km/h standing tall starts speed wobbles — crouch (hold Space) to settle them.
- **Grass & dirt** stop you within a couple of metres; roll onto a lawn too fast and you get thrown off.
- **Ollie on a halfpipe / quarter / bowl wall** and you go up the ramp and come back down onto it.
- **Footplant:** feet sit across the deck (toes hang a little over the edge), lift clear while the board flips
  and come back down to catch it; the front foot slides up toward the nose on an ollie; ankles roll with the
  deck in a carve.
- **Mid-air board adjust:** coming down onto a ramp, the board tilts to match it so air drop-ins land.

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

- **Far east – Mega Park** – a 12 m drop-in tower into a giant roll-in, a big kicker gap to a long landing,
  a 6 m vert quarter, a 6 m bank with a 30 m down-rail and hubba, a 4 m deep bowl, a giant spine, a big pyramid,
  quarter-pipe walls, bleachers and floodlights
- **Far south – Titan Park** – the biggest area, built around long lines that start from drop-in towers:
  - *Mega Air line*: 22 m tower → 40 m roll-in → two huge gaps (≈23 m and ≈16 m) → 7 m vert quarter
  - *Rail line*: 12 m tower → roll-in onto a 3 m-high deck of ledges and rails → 17-stair with long handrails → street section
  - *Drop line*: roll off a 10 m deck onto a 30 m landing → designed gap → quarter
  - a funbox section, a 5 m-deep giant bowl, a big spine, a mega hip and an 8 m quarter-pipe wall
  Every big jump is **designed by physics** (`World._designJump` in `js/world.js`): it works out the speed you'll
  have at the kicker, the flight path, matches the landing angle to it and sizes the gap so an 8 %-slower rider still
  clears it and a 6 %-faster rider still lands on the slope (no overshoot). Each line was then ridden in-game to check.
 an avenue with lane lines, crosswalk and rideable curbs, a road out to the Mega Park, lawns
  with trees and bushes, parked cars, hydrants, a bus shelter, shopfronts with awnings and rooftop details;
  rolling hills on the horizon

Teleport spots (Pause → Teleport): Plaza, Stair Plaza, Mega-Ramp Roll-in, Downhill Street, Southside Skatepark,
Mega Park – The Drop, Mega Park – Big Bank & Rail, Mega Park – Mega Bowl, Titan Park – Mega Air Line,
Titan Park – Rail Line, Titan Park – Drop Line, Titan Park – Giant Bowl & Wall.

## 🏆 Modes

- **Play** – free skate with challenges and best-combo tracking.
- **Board Session** – 2 minutes, score as much as you can before the bell.
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
| `js/foliage.js` | Instanced trees (bark trunks + real-leaf cluster cards with wind sway), bushes and grass tufts |
| `js/props.js` | Photo-scanned street props (glTF), GPU-instanced |
| `js/human.js` + `js/humanData.js` | The realistic MakeHuman body fitted to the skater's skeleton (`tools/convert-human.py` makes the data) |
| `js/body.js` | Fallback hand-built body (used only if the human data can't load) |
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
| Skater body: base human mesh + body-shape targets (male athletic, flat chest, ideal proportions; female athletic) | [MakeHuman](http://www.makehumancommunity.org) (`base.obj`, macrodetails / breast / proportions targets) | CC0 |
| Photo skin (young light-skinned male), eye texture, hair meshes (short02, short04, bob02, long01, ponytail01, afro01), eyebrow001, eyelashes01 — fitted to the body by `tools/convert-human.py` | [MakeHuman 1.1 assets](http://download.tuxfamily.org/makehuman/assets/1.1/base/) | CC0 |
| Photo textures: concrete floor 02, concrete tiles, asphalt 02, brushed concrete 2, plywood, brick wall 001, denim fabric, cotton jersey, bark brown 02 | [Poly Haven](https://polyhaven.com) | CC0 |
| Street props: metal trash can, utility box 01, barrel 03, old tyre, trash bag, wooden crate 02 (glTF, textures reduced to 256 px) | [Poly Haven](https://polyhaven.com) | CC0 |
| Leaves (LeafSet024), grass blades (Foliage001) and lawn (Grass004) — made into tree / bush / grass-tuft textures by `tools/make-foliage.py` | [ambientCG](https://ambientcg.com) | CC0 |
| Sky: Kloofendal 48d Partly Cloudy (Pure Sky) | [Poly Haven](https://polyhaven.com) | CC0 |

Textures were resized to 512×512 (and the concrete ones colour-neutralised) to stay light on Chromebooks;
they live in `assets/`. The skater, the park and the sounds are all made in code.

## Originality

Jew Board is an original game: its name, park layout, skater ("Pip") and every
asset are made from scratch in code. It doesn't use names, logos, maps, characters, music or
assets from any existing game.
