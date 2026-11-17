// Back to Sea: every tunable number lives here. DOM-free: the game AND the level validator
// (js/core/validate.js, run by `node --test`) import this file, so levels are checked against
// the exact physics the player feels. Units: pixels and seconds. Frozen once chapters ship.

export const TILE = 24;

// View: logical height is fixed; logical width adapts to the screen's aspect ratio.
export const VIEW_H = 360;          // 15 tiles
export const VIEW_W_MIN = 480;
export const VIEW_W_MAX = 800;
export const MAX_DPR = 2;           // cap backing-store density (perf + iOS canvas limits)

// Simulation runs at a fixed step. The validator uses the same step.
export const STEP = 1 / 120;
export const MAX_FRAME = 0.1;       // longest real frame we simulate (s); longer frames are dropped

// Player hitbox (the drawn fish is larger; the box sits at its belly).
export const PLAYER_W = 18;
export const PLAYER_H = 14;

// Air
export const GRAVITY = 1500;
export const MAX_FALL = 900;
export const AIR_SPEED = 180;       // max horizontal speed you can steer to in the air
export const AIR_ACCEL = 900;       // how fast air control reaches AIR_SPEED
export const AIR_DECEL = 450;       // horizontal slow-down in the air with no input

// Land (a fish on a surface can only wriggle)
export const WRIGGLE_SPEED = 70;
export const GROUND_ACCEL = 700;
export const GROUND_DECEL = 1100;
export const HOP_VY = -480;         // ~3.2 tiles high
export const SPLASH_HOP_VY = -580;  // from a puddle: ~4.7 tiles high

// Water
export const SWIM_SPEED = 170;
export const SWIM_ACCEL = 900;
export const SWIM_DECEL = 500;
export const WATER_DRAG = 4;        // linear drag (1/s) on vertical speed in water
export const WATER_GRAVITY = 160;   // so idle sink speed = WATER_GRAVITY / WATER_DRAG = 40 px/s
export const WATER_ENTRY_DAMP = 0.35; // vy multiplier when plunging into water from above
export const STROKE_VY = -260;      // JUMP underwater: upward stroke impulse
export const STROKE_COOLDOWN = 0.22;
export const LEAP_VY = -680;        // JUMP at the surface: leap out (~6.4 tiles of rise; clears a 5-tile ledge)
export const LEAP_ZONE = 20;        // leap allowed when body centre is within this many px below the surface
export const LEAP_BALLISTIC = 0.12; // seconds after a leap during which water drag is ignored

// Forgiveness
export const COYOTE_TIME = 0.1;
export const JUMP_BUFFER = 0.12;

// Moisture
export const MOISTURE_MAX = 100;
export const DRY_TIME = 6;          // seconds from full to faint out of water
export const DRY_RATE = MOISTURE_MAX / DRY_TIME;
export const REFILL_RATE = 400;     // per second in puddles / wet things (water = instantly full)
export const DROPLET_MOISTURE = 35;
export const LOW_MOISTURE = 35;     // below this the fish looks parched and the HUD warns

// Hitboxes of core tiles, as insets inside the 24x24 tile (game and validator share these).
export const HAZARD_BOX = { x: 3, y: 10, w: 18, h: 14 };
export const DROPLET_BOX = { x: 6, y: 5, w: 12, h: 15 };
export const EXIT_BOX = { x: 3, y: 3, w: 18, h: 18 };
export const CHECKPOINT_BOX = { x: 2, y: 2, w: 20, h: 22 };
export const PUDDLE_BOX = { x: 0, y: 14, w: 24, h: 10 };

// Validator
export const VALIDATOR_MARGIN = 0.5;    // seconds of reaction slack subtracted from DRY_TIME
export const VALIDATOR_MAX_FLIGHT = 4;  // longest simulated trajectory (s)
export const WALK_TIME_FACTOR = 1.2;    // walking one tile counts as TILE/WRIGGLE_SPEED * this
export const MAX_TRACKED_DROPLETS = 16; // droplets beyond this give no credit in the validator

// Camera
export const CAM_LOOK_AHEAD = 56;
export const CAM_FOLLOW_X = 5;
export const CAM_FOLLOW_Y = 4;
export const SHAKE_MAX = 10;        // px at full trauma

// Particles
export const MAX_PARTICLES = 420;
