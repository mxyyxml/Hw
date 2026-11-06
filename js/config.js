// =============================================================================
//  Lunch Break Skate — config.js
//  Every number and name you might want to tweak lives in this one file.
//  Units: metres, seconds, radians (unless a comment says degrees).
// =============================================================================

export const GAME_TITLE = 'Lunch Break Skate';

// -----------------------------------------------------------------------------
//  PHYSICS — how the board rolls, pushes, turns and flies
// -----------------------------------------------------------------------------
export const PHYSICS = {
  gravity: 13,              // m/s². A bit stronger than Earth (9.8) = snappier air
  fixedStep: 1 / 120,       // physics sub-step (seconds). Smaller = more stable
  maxSubSteps: 6,           // safety cap per rendered frame

  // Pushing (W / ↑)
  pushImpulse: 1.7,         // m/s added per push
  pushCooldown: 0.38,       // min seconds between pushes when tapping
  pushHoldInterval: 0.75,   // seconds between pushes when W is HELD
  pushMaxSpeed: 8.5,        // pushing cannot take you above this speed
  pumpAccel: 10.0,          // m/s² gained holding W while dropping down a ramp (pumping)
  maxSpeed: 24,             // absolute cap (gravity can take you past pushMaxSpeed)

  // Rolling resistance
  rollFriction: 0.045,      // fraction of speed lost per second
  rollDrag: 0.18,           // constant deceleration (m/s²)
  airDrag: 0.01,            // fraction of air speed lost per second

  // Braking (S / ↓)
  brakeDecel: 5,            // foot-brake deceleration at low speed
  powerslideMinSpeed: 4,    // above this speed, braking = powerslide
  powerslideDecel: 8.5,

  // Steering (A D / ← →)
  turnRateLow: 2.6,         // rad/s when slow
  turnRateHigh: 1.25,       // rad/s at pushMaxSpeed and above
  airSpinRate: 6.8,         // rad/s spin in the air
  crouchTurnBonus: 1.15,    // carve a little tighter while crouched

  // Terrain handling
  stepUp: 0.12,             // highest curb you can roll up without an ollie
  walkStepUp: 0.36,         // highest step you can walk up
  launchTolerance: 0.035,   // how far the ground can drop away before you go airborne
  lipLaunchSpeed: 1.6,      // speed (m/s) away from the ground at a sharp edge that launches you
  vertSlope: 2.6,           // ground steepness (rise/run) that counts as "vert" (≈69°)
  vertInwardSpeed: 0.55,    // on a vert launch, drift this fast back over the ramp
  landSpeedKeep: 0.96,      // fraction of speed kept on a clean landing

  // Bails
  maxLandingImpact: 12.5,   // m/s into the ground — harder than this = bail
  wallBailSpeed: 8.5,       // m/s straight into a wall = bail
  landAngleTolerance: 32,   // DEGREES board may be off the travel direction
  flipCompleteThreshold: 0.82, // flip must be this % done when you land
  bailIfGrabbingOnLand: false,
  bailRespawnDelay: 1.5,    // seconds (real time) before respawn after a bail
  bailSlowMo: 0.35,         // time scale during the bail slow-mo
  bailSlowMoDuration: 0.6,  // real seconds of slow-mo

  // Ollie / pop (Space)
  popMin: 3.0,              // m/s upward on a quick tap
  popMax: 4.6,              // m/s upward on a full charge
  popChargeTime: 0.55,      // seconds of holding Space for full pop
  flickWindow: 0.6,         // seconds before release that flick keys count

  // Walking (E)
  walkSpeed: 2.4,
  runSpeed: 4.2,            // walking with Shift held
  walkTurnRate: 3.0,
};

// -----------------------------------------------------------------------------
//  FLIP TRICKS — performed by holding Space, pressing a direction combo, releasing.
//  seq   : direction keys pressed (in order) while Space is held
//  flips : rotations around the board's long axis (+ kickflip way, - heelflip way)
//  shuv  : half-turns of the board around the vertical axis
//  time  : seconds the board takes to do the rotation
//  The resolver picks the LONGEST sequence that matches the end of what you pressed.
// -----------------------------------------------------------------------------
export const FLIP_TRICKS = [
  { seq: ['down', 'up', 'left'],    name: '360 Flip',        flips: 1,  shuv: 2,  time: 0.6,  points: 900 },
  { seq: ['down', 'up', 'right'],   name: 'Laser Flip',      flips: -1, shuv: -2, time: 0.6,  points: 950 },
  { seq: ['down', 'left', 'left'],  name: 'Double Kickflip', flips: 2,  shuv: 0,  time: 0.62, points: 750 },
  { seq: ['down', 'right', 'right'],name: 'Double Heelflip', flips: -2, shuv: 0,  time: 0.62, points: 750 },
  { seq: ['left', 'down', 'left'],  name: 'Varial Kickflip', flips: 1,  shuv: 1,  time: 0.5,  points: 600 },
  { seq: ['right', 'down', 'right'],name: 'Varial Heelflip', flips: -1, shuv: -1, time: 0.5,  points: 600 },
  { seq: ['down', 'left'],          name: 'Kickflip',        flips: 1,  shuv: 0,  time: 0.42, points: 400 },
  { seq: ['down', 'right'],         name: 'Heelflip',        flips: -1, shuv: 0,  time: 0.42, points: 400 },
  { seq: ['down', 'up'],            name: 'Ollie',           flips: 0,  shuv: 0,  time: 0,    points: 100 },
  { seq: ['up', 'down'],            name: 'Nollie',          flips: 0,  shuv: 0,  time: 0,    points: 150 },
];
// What you get when nothing matches (plain release of Space)
export const DEFAULT_POP = { name: 'Ollie', flips: 0, shuv: 0, time: 0, points: 100 };

// Shift + ← / → in the air
export const SHUVITS = {
  left:  { name: 'BS Shuvit', flips: 0, shuv: 1,  time: 0.34, points: 250 },
  right: { name: 'FS Shuvit', flips: 0, shuv: -1, time: 0.34, points: 250 },
};

// J (+ direction held when you press J) in the air
export const GRABS = {
  none:  { name: 'Indy' },
  up:    { name: 'Nosegrab' },
  down:  { name: 'Tailgrab' },
  left:  { name: 'Melon' },
  right: { name: 'Stalefish' },
};
export const GRAB_POINTS = { base: 150, perSecond: 400, minTime: 0.15 };

// Grinds — chosen at the moment you snap onto a rail/ledge.
// "auto" = no K held.  K + direction picks the others.
export const GRINDS = {
  auto:  { name: '50-50',        sideways: false, pitch: 0 },
  none:  { name: 'Smith Grind',  sideways: false, pitch: -0.12 }, // K alone
  up:    { name: 'Nosegrind',    sideways: false, pitch: 0.22 },
  down:  { name: '5-0',          sideways: false, pitch: -0.22 },
  left:  { name: 'Boardslide',   sideways: true,  pitch: 0 },
  right: { name: 'Lipslide',     sideways: true,  pitch: 0 },
};
export const GRIND_POINTS = { base: 200, perSecond: 450 };
export const GRIND = {
  snapRadius: 0.5,          // horizontal distance to rail to snap on
  snapAbove: 0.65,          // board may be this far above the rail to snap
  snapBelow: 0.25,          // ...or this far below
  alignDegrees: 50,         // travel must be within this many degrees of the rail
  friction: 0.05,           // fraction of speed lost per second
  minSpeed: 0.8,            // drop off below this
  exitPop: 1.2,             // small upward kick when you roll off the end
  reSnapDelay: 0.3,         // seconds before you can snap the same rail again
};

// L on the ground (L + ↑ = nose manual)
export const MANUALS = {
  normal: { name: 'Manual' },
  nose:   { name: 'Nose Manual' },
};
export const MANUAL_POINTS = { base: 100, perSecond: 300, minTime: 0.3 };
export const MANUAL_BALANCE = {
  instability: 2.6,         // how fast the balance falls away from centre
  drift: 1.4,               // random wobble strength
  control: 4.2,             // how strongly W / S push the balance
  damping: 1.6,
  growth: 0.12,             // instability grows by this per second of manual
};

// Air spins (A/D in the air) — name prefix and bonus per 180°
export const SPIN_POINTS_PER_180 = 250;
export const POWERSLIDE = { name: 'Powerslide', points: 120, minTime: 0.35 };
export const BIG_AIR = { name: 'Big Air', minAirTime: 1.1, points: 300 };

// -----------------------------------------------------------------------------
//  GAPS — bonus for taking off from one tagged spot and landing in a zone
// -----------------------------------------------------------------------------
export const GAPS = [
  { name: '3-Stair',       from: 'stair3_top',  to: 'stair3_land',  points: 200 },
  { name: '5-Stair',       from: 'stair5_top',  to: 'stair5_land',  points: 400 },
  { name: '10-Stair',      from: 'stair10_top', to: 'stair10_land', points: 1000 },
  { name: 'Plaza Gap',     from: 'gapA',        to: 'gapB',         points: 600 },
  { name: 'Mega Gap',      from: 'mega_kicker', to: 'mega_land',    points: 1500 },
  { name: 'Funbox Clear',  from: 'funbox_s',    to: 'funbox_n_land', points: 250 },
  { name: 'Funbox Clear',  from: 'funbox_n',    to: 'funbox_s_land', points: 250 },
];

// -----------------------------------------------------------------------------
//  SCORING / COMBOS
// -----------------------------------------------------------------------------
export const SCORING = {
  comboWindow: 1.6,         // seconds on the ground before the combo is banked
  repeatPenalty: 0.5,       // repeated trick in the same combo is worth this much
  lunchSessionSeconds: 120, // length of "Lunch Session" mode
};

// -----------------------------------------------------------------------------
//  CHALLENGES — 10 goals shown in the Challenges menu
//  type: gapTrick | grind | takeoffTrick | manual | gap | air | combo | trick
// -----------------------------------------------------------------------------
export const CHALLENGES = [
  { id: 'c1',  text: 'Ollie the 3-stair',                    type: 'gapTrick', gap: '3-Stair',  trick: 'Ollie' },
  { id: 'c2',  text: 'Kickflip the 5-stair',                 type: 'gapTrick', gap: '5-Stair',  trick: 'Kickflip' },
  { id: 'c3',  text: 'Kickflip the 10-stair',                type: 'gapTrick', gap: '10-Stair', trick: 'Kickflip' },
  { id: 'c4',  text: 'Grind the long rail for 3 seconds',    type: 'grind', rail: 'longrail', seconds: 3 },
  { id: 'c5',  text: 'Land a 360 Flip off the mega-ramp',    type: 'takeoffTrick', takeoff: 'mega_kicker', trick: '360 Flip' },
  { id: 'c6',  text: 'Boardslide a handrail',                type: 'grind', rail: 'handrail', grind: 'Boardslide', seconds: 0.4 },
  { id: 'c7',  text: 'Hold a manual for 4 seconds',          type: 'manual', seconds: 4 },
  { id: 'c8',  text: 'Clear the plaza gap',                  type: 'gap', gap: 'Plaza Gap' },
  { id: 'c9',  text: 'Get 1.5m of air out of the halfpipe',  type: 'air', takeoff: 'halfpipe', height: 1.5 },
  { id: 'c10', text: 'Land a 5,000 point combo',             type: 'combo', points: 5000 },
];

// -----------------------------------------------------------------------------
//  CAMERA
// -----------------------------------------------------------------------------
export const CAMERA = {
  follow: { distance: 4.6, height: 1.9, lookHeight: 1.0, fov: 62, lag: 5.5 },
  filmer: { distance: 7.5, height: 1.2, side: 3.2, lookHeight: 0.8, fov: 74, lag: 2.6 },
  minAboveGround: 0.6,
};

// -----------------------------------------------------------------------------
//  GRAPHICS presets (toggle in Settings)
// -----------------------------------------------------------------------------
export const GRAPHICS = {
  low:  { pixelRatio: 1,   shadows: false, fogFar: 200, drawDistance: 420 },
  high: { pixelRatio: 2,   shadows: true,  fogFar: 300, drawDistance: 420, shadowMapSize: 2048 },
};

// -----------------------------------------------------------------------------
//  KEY BINDINGS (KeyboardEvent.code values)
// -----------------------------------------------------------------------------
export const KEYS = {
  up:     ['KeyW', 'ArrowUp'],
  down:   ['KeyS', 'ArrowDown'],
  left:   ['KeyA', 'ArrowLeft'],
  right:  ['KeyD', 'ArrowRight'],
  pop:    ['Space'],
  shift:  ['ShiftLeft', 'ShiftRight'],
  grab:   ['KeyJ'],
  grind:  ['KeyK'],
  manual: ['KeyL'],
  walk:   ['KeyE'],
  respawn:['KeyR'],
  setSpot:['KeyT'],
  camera: ['KeyC'],
  pause:  ['KeyP', 'Escape'],
  help:   ['KeyH'],
};

// -----------------------------------------------------------------------------
//  DEFAULT SETTINGS (saved to localStorage once changed)
// -----------------------------------------------------------------------------
export const DEFAULT_SETTINGS = {
  graphics: 'low',          // 'low' | 'high'
  volume: 0.7,              // 0..1
  camSensitivity: 1.0,      // 0.3..2 — how fast the camera swings behind you
};
