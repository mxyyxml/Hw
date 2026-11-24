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

### 🎮 Controller
Plug in any standard gamepad. **Left stick** steers (analog) and pushes / brakes; the **right stick is flick-it**:
pull down to crouch and flick up to pop. Flick up-left / up-right for kickflip / heelflip, or down → left → up for a 360 flip.
A push, B step off/on, X grind, Y manual, RB/RT grab, LB revert, LT shift, L3 backflip, R3 respawn, Back camera,
Start pause. Menus work with the D-pad and A / B.

### 🧭 Career
30 missions across the 10 areas of the city (stairs, gaps, rails, air, combos). Each one pays XP; discovering an area
pays XP too. Levelling up unlocks gear in the Locker (crewneck, zip hoodie, windbreaker, high-tops, chunky shoes,
chains, deck graphics, 60 mm wheels...). The HUD shows the missions for the area you're in, and the Missions
screen can drop you straight at any spot.

### 📱 Phones & tablets
Touch controls turn on automatically on touch-screen devices (Settings → Touch controls: Auto / On / Off).
Hold your phone sideways.

| Touch | Action |
| --- | --- |
| **Left joystick** | Steer / spin. Up = push & pump, down = brake |
| **POP pad** (right) | Works like a flick stick: pull ↓ then flick ↑ = Ollie, ↖ = Kickflip, ↗ = Heelflip, ↓ ← ↑ = 360 Flip, ↑ ↓ = Nollie. Tap = plain ollie |
| **GRAB / GRIND / MANUAL / SHUV** | Same as J / K / L / Shift+arrow (the joystick picks the direction) |
| **? · CAM · WALK · ↺ · ❚❚** | Help, camera, walk, respawn, pause |

### 👕 Locker (character & board customisation)
Main menu or Pause → **Locker**, with tabs:
- **Skater**: body type, skin tone, 9 hairstyles (modelled short, crop, skater flow, long, ponytail and afro, plus buzz,
  mohawk and bald), hair colour, facial hair, eyewear, stance (**Regular / Goofy**) and push style (**Normal / Mongo**).
- **Tops**: tee, oversized tee, tank, long sleeve, **crewneck**, hoodie, **zip hoodie** (metal zip), flannel, jacket,
  **windbreaker** (loose nylon shell with a two-tone yoke), jersey or shirtless; colours and chest graphics.
- **Bottoms**: jeans, baggy jeans, skinny, cargos, cropped chinos, shorts, board shorts; socks and sock colour.
- **Shoes**: three silhouettes, each its own model (**vulc low-top**, **high-top**, **chunky cupsole**), plus upper and sole colours.
- **Accessories**: beanie, cap, backwards cap, bucket hat, helmet, kippah, a padded backpack, and a **wallet chain** and/or
  **necklace** (real links lying on the clothes).
- **Board**: deck graphic and colour, **grip tape colour**, **truck colour**, wheel size (52–60 mm) and colour.

The camera turns around your skater beside the panel while you shop. Everything is saved in your browser.

Clothes and hair are real layers cut from the body surface along smooth lines (necklines, sleeves,
hems, hairlines), loosened where fabric hangs and skinned to the same bones, so they move with the body.

### 🆕 More tricks, reverts, flips & first person
- New flick tricks (hold Space, then the arrows): **Hardflip** → ↓ ←, **Inward Heelflip** ← ↓ →,
  **360 Shuvit** ← ← (FS: → →), **Impossible** ↑ ↑, **Nollie Flip / Heelflip** ↑ ← / ↑ →.
- **Q = Revert** (the board spins 180° on its wheels; hold Q as you land to revert straight out of it).
- **F in the air = Backflip**, hold **W** for a **Frontflip**. The rider tucks tighter to rotate faster,
  but needs real air (mega ramp, container gap, garage roof, vert); land short of a full rotation and you slam.
- **Glitches (Skate-style):** hold **G** for the speed glitch (rapid tap-pushes past the normal push
  speed, up to the board's max); **N** = pop glitch (an extra-big pop, about 1.4 m — enough air to time a
  flip with Z / X / V / B).
- **More grinds:** **Shift + K** + ↑ Crooked, ↓ Feeble, ← Bluntslide, → Noseblunt.
- **Backflip / frontflip:** press **F** in the air for a backflip, hold **W** + **F** for a frontflip — they rotate
  nose-over-tail. Needs real air: the mega ramp, the container gap, the garage roof or vert.
- **Off the board** you carry it by the truck in your hand; E drops it and you hop on.
- **Wallrides:** hold **K** in the air while travelling along a tall wall (buildings, the Tel Aviv
  apartment lobbies, big walls): wall friction holds you up at first, then gravity takes over. **Space**
  wallies off. One wallride per jump.
- **Camera:** pulls in in front of walls and buildings instead of clipping into them, and pulls back /
  up on big airs to keep the landing in frame.
- **C** now cycles follow → filmer → fisheye → **first person** (you see through the rider's eyes, with
  every push, crouch and landing).
- Rolling back down a ramp (fakie) no longer whips the camera round — it glides round smoothly.

### 🎨 Remastered graphics (High & Ultra)
A full post-processing pipeline on every PC preset: ground-truth ambient occlusion (contact shadows in
corners, under ledges and the board; half resolution on High), bloom only on real highlights, ACES tone
mapping, a filmic colour grade (split toning, light contrast, soft vignette) and SMAA anti-aliasing.
City blocks have real facade relief: a stone band at every floor, deep cornices and corner pilasters.
Use **Low** on very weak machines (no post-processing).

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
- **Wheels matter:** bigger wheels (Locker) roll over rough ground more easily and chatter less.
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

## 🗺️ Jew Board City (the map, rebuilt from scratch)

The old map was wiped and replaced (the original game is preserved on the `original-v1` branch).
Everything is laid out in `js/map.js`; world bounds 300 × 320 m, north is up.

- **Kikar Plaza (centre, spawn)** – granite fountain-ring ledges around a tree planter, a stair terrace with a
  3-stair and a 5-stair (handrails, hubbas), a terrace ledge, the 32 m long rail, manual pads, benches, a kicker,
  the Plaza Gap and a Star of David inlaid in the paving
- **Park HaYarkon (east skatepark)** – halfpipe, mini ramp, spine, pyramid with hips and a top rail, a 3 m-deep
  bowl, quarter pipes with decks, flat bar, hubba ledge and floodlights, fenced
- **Mega ramp (north-east)** – 14 m roll-in tower → kicker → designed gap → landing → vert quarter
- **Beit Sefer schoolyard (north-west)** – raised yard with a 10-stair and two handrails, picnic tables you can
  grind, a basketball court and the school building
- **Hill street (north)** – a long downhill road with curbs, two kickers and a down-rail
- **Parking garage (south-east)** – two decks joined by ramps, roof ledges, a roof rail, a roof quarter pipe
  and a drop back to the lower deck
- **Industrial yard** – a 7 m roll-in into the **Container Gap**, a loading dock with a bank, drums and crates
- **Secret backyard pool** – an empty pool behind a fence (find the gap on the east side)
- **Tayelet beachfront (south)** – the sea, a sand beach (sand slows you down) with umbrellas, loungers,
  palms, a lifeguard tower and a big Star of David sculpture; a raised promenade with a grindable sea wall,
  three stair sets with handrails down to the sand, benches, palm planters, Israeli flags, a golden menorah,
  white Bauhaus blocks on pilotis and a synagogue on the avenue
- **Streets** – an east–west avenue with parked cars, a north–south avenue, parks with trees, city blocks with
  real facade relief all round, rolling hills on the horizon

Every big jump is **designed by physics** (`World._designJump`): it works out the speed you'll have at the
kicker from the roll-in height, the flight path, matches the landing slope and sizes the gap; both jump lines
were then ridden in-game (Mega Gap and Container Gap land on their landings).

Teleport spots (Pause → Teleport): Kikar Plaza, Stair Terrace, Mega Ramp, Hill Street, Park HaYarkon,
Beit Sefer 10-Stair, Parking Garage Roof, Container Gap, Tayelet Beach Promenade, Secret Backyard Pool.

## 🏆 Modes

- **Play** – free skate with challenges and best-combo tracking.
- **Board Session** – 2 minutes, score as much as you can before the bell.
  Best scores and completed challenges are saved in your browser (localStorage).

## 🧭 Menus

A rebuilt menu system: a loading screen with real asset progress and tips; a main menu (Free Skate, Board Session,
Challenges, Locker, Career, Settings) with your level and XP card; a pause menu; **Career** stats (tricks, flips,
grinds, bails, air time, distance, time skated; banked combo points are XP for your level); Challenges with
progress; and Teleport to every spot. Arrow keys and Enter work in every menu.

## ⚙️ Settings

Tabs:
- **Graphics**: preset **Low**, **High** (shadows, PBR, photo sky, ambient occlusion, bloom, SMAA) or **Ultra**
  (High + full-resolution AO and 4K shadows), and **weather**: Clear, Overcast, Golden hour or Rain (falling rain,
  rain sound, low cloud and fog).
- **Audio**: master volume.
- **Controls**: **rebind every key** (click, then press the key; saved), the full controls reference, reset to defaults.
- **Camera**: Follow, Filmer, Fisheye or First person, and mouse sensitivity.
- **Gameplay**: landing assist and touch controls.

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
