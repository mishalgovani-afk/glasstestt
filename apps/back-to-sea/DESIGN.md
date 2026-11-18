# Back to Sea — design & engineering contract

A fish escapes its kitchen fishbowl and hops from water source to water source through a house,
down the drains, and finally out to sea. ~30 min of play: 4 chapters × ~7 min, each built around
one new mechanic, then a ~2–3 min boss and an ending.

This file is the contract every contributor (human or agent) codes against. If you need to change
the contract, say so in your final report — don't silently diverge.

## Hard rules

- Static site. Plain ES modules (`<script type="module">`), no build step, no npm deps, no external
  assets (all art procedural on canvas, all audio synthesized with WebAudio). Relative paths only.
- App lives in `apps/back-to-sea/`. Game code lives in `js/` (NOT `src/`, `scripts/` or `tests/`,
  which the site build drops). Tests live in `tests/*.test.mjs`, run with plain `node --test` in CI
  (Node 22, no npm install), so tests may only import DOM-free modules.
- Keep pure logic (constants, physics, level parsing, validation) DOM-free so tests can import it.
- **Only two player actions: MOVE (left/right) and JUMP.** No third action key. Objects in the world
  change what JUMP does (pop a bubble, dash in a current, turn a valve…). Pause/mute are UI buttons.
- Mobile first: landscape, multi-touch (hold move + tap jump simultaneously), `touch-action:none`,
  no scroll/zoom, DPR-scaled canvas, safe-area insets, rotate-to-landscape hint in portrait, audio
  unlocked on first tap. Keyboard too: ←/→ or A/D, Space/↑/W/Z to jump, P/Esc pause, M mute.
- 60 fps on a mid phone: pre-render static level tiles to an offscreen canvas per level; keep
  per-frame particle counts bounded.
- Original content only. No recreations of existing games' characters/levels/look.

## Coordinates, view, constants

- Units: pixels and seconds. `TILE = 24`. Logical view height is 360 px (15 tiles); logical width
  adapts to aspect ratio, clamped to 480–800 px. Canvas backing store = logical × scale × DPR.
- All tunable constants live in `js/core/constants.js` (DOM-free) and are imported by both the game
  and the level validator. Starting values (core agent may tune, then they're frozen):
  - gravity (air) 1500; max fall 900
  - land: wriggle speed 70 (fish on a surface can only wriggle slowly), hop velocity −480,
    air control speed 180
  - water: buoyancy/drag so the fish sinks slowly when idle (~40 px/s), swim speed 170 horizontal,
    JUMP underwater = an upward stroke impulse (−260, short cooldown ~0.22 s);
    JUMP at/near the surface = leap out at −640 (~6 tiles high)
  - coyote time 0.1 s, jump buffer 0.12 s
- **Moisture meter** 0–100. Full in water. Out of water it drains to 0 in `DRY_TIME = 6` s.
  Puddles/drips/wet surfaces refill. At 0 the fish faints → respawn at last checkpoint (level start
  or `C` tile). Hazards (hot burner, cat paw…) also cause a faint. No lives; failure is cheap.

## Level format

Levels are arrays of equal-length strings, one char per tile, row 0 at the top.

Core legend (reserved — chapters must not redefine these):

| char | meaning |
|---|---|
| `.` or space | empty air |
| `#` | solid (counters, walls, tiles) — chapter theme decides how it looks |
| `=` | one-way platform (shelf): stand on top, jump up through |
| `~` | water (full tile). The top `~` of a column is a surface |
| `-` | puddle: shallow water on top of the solid below; refills moisture, JUMP from it = splash-hop (higher than a normal hop) |
| `^` | hazard (hot/sharp; theme decides look) — touching = faint |
| `o` | droplet: pickup, +35 moisture |
| `S` | spawn (exactly one) |
| `E` | exit (exactly one): drain / water source that ends the level |
| `C` | checkpoint |

Any other char is a chapter entity, looked up in the chapter's `entities` map
(char → entity class). Chapter entity chars should be letters other than `S`, `E`, `C`, `o`.
A level may also give per-instance props: `props: { 'x,y': {...} }` keyed by tile coords.

## Chapter module API (`js/chapters/<file>.js`, default export)

```js
export default {
  id: 'kitchen', number: 1,
  title: 'The Kitchen', subtitle: 'Out of the bowl',
  mechanic: { name: 'Puddles & drips', hint: 'Puddles keep you wet — jump from one for a big splash-hop' },
  palette: { sky, wallA, wallB, solid, solidEdge, water, waterDeep, accent }, // CSS colors
  drawBackground(ctx, view, cam, time) {},   // parallax room art, behind tiles
  drawSolidTile?(ctx, x, y, mask, rng) {},   // optional custom tile art (mask = neighbor bits)
  entities: { B: BubbleEntity, ... },
  music: { bpm, key, ... },                  // fed to the synth music engine (see js/core/audio.js)
  levels: [ { id: '1-1', name: 'Out of the Bowl', budget: 70, hint?: '…', map: [...], props?: {} } ],
  reach?: { /* validator edge rules for this chapter's entities, see below */ },
};
```

Six-ish levels per chapter with `budget` (designed seconds for a first-time player) summing to
~420 s. The first level of a chapter introduces its mechanic safely; later ones combine it with
earlier mechanics. Chapter order: 1 Kitchen, 2 Bathroom, 3 Laundry room, 4 Basement, 5 Finale (boss).

## Entity API (`js/core/entity.js` base class)

```js
class Entity {
  constructor(world, x, y, props)  // x,y = top-left in px of the tile it was placed on
  // box: this.x, this.y, this.w, this.h
  update(dt, world) {}
  draw(ctx, world) {}               // world.cam already applied
  solid = false                     // acts as a solid box for collision
  oneWay = false                    // acts as a one-way platform
  wet = false                       // overlapping refills moisture
  onPlayerOverlap(player, world) {} // every frame while overlapping
  onJump(player, world) { return false } // return true to CONSUME the jump (replace default jump)
  dead = false                      // set true to remove
}
```

Player jump resolution: on a JUMP press, entities overlapping (or the one stood on) get `onJump`
in priority order; the first that returns `true` consumes it; otherwise the default jump for the
current state (stroke / leap / hop / splash-hop) happens.

World services entities may use: `world.player`, `world.tileAt(tx,ty)`, `world.setTile(tx,ty,c)`,
`world.particles.emit(...)`, `world.audio.sfx(name)`, `world.shake(amount)`, `world.spawn(entity)`,
`world.findEntities(predicate)`, `world.time`, `world.say(text, seconds)` (on-screen hint),
`world.faint(reason)`, `world.win()`.

## Level validation (`tests/levels.test.mjs` + `js/core/validate.js`)

Every level of every chapter must pass, in CI:
- rectangular map, exactly one `S` and one `E`, only known chars;
- **reachable**: a BFS from `S` to `E` over standing/water cells, with moves derived from the real
  constants (hop envelope from land, splash-hop from puddles, leap envelope from water surfaces,
  swimming within connected water), and the **dry budget**: total time out of water along each
  out-of-water stretch must be < `DRY_TIME` (refills at puddles/droplets reset it);
- chapters with mechanic objects export `reach` rules adding edges for those objects (e.g. a bubble
  at (x,y) lets you rise to y−k and pops into a leap) so the BFS stays honest.

## Files & ownership

| path | owner |
|---|---|
| `index.html`, `styles.css`, `js/main.js`, `js/core/*`, `js/player.js`, `js/scenes/*` (title, map, hud, pause) | core engine |
| `js/chapters/index.js` (registry of all 5 chapter modules) | core engine (creates all 5 imports up front) |
| `js/chapters/ch1-kitchen.js` (+ optional `js/chapters/ch1/`) | chapter 1 |
| `js/chapters/ch2-bathroom.js` (+ `ch2/`) | chapter 2 |
| `js/chapters/ch3-laundry.js` (+ `ch3/`) | chapter 3 |
| `js/chapters/ch4-basement.js` (+ `ch4/`) | chapter 4 |
| `js/chapters/ch5-finale.js` (+ `ch5/`) — boss + ending | finale |
| `tests/levels.test.mjs` | core engine; chapter-specific tests in `tests/chN.test.mjs` |

## Chapters & mechanics

1. **Kitchen — Puddles & drips** (0–7 min). Fishbowl → sink → glasses, dripping tap, kettle-steam,
   hot burners as hazards. Teaches: swim, leap, flop/hop, the dry meter, puddles (splash-hop), drips.
2. **Bathroom — Soap bubbles** (7–14). Touching a bubble encases you: you stay moist and float
   upward, MOVE drifts you; JUMP pops it with a boosted jump. Bathtub, sink, toilet, shower.
3. **Laundry room — Currents & spin** (14–21). Water bodies with flow (arrows/streamlines) that push
   you; JUMP inside a current = a dash along the flow. Washing-machine drum whose current rotates.
4. **Basement — Valves & rising water** (21–28). JUMP while touching a valve wheel turns it,
   raising/lowering linked water levels and opening/closing pipe flows. Dark, pipes, boiler.
5. **Finale — The Storm Drain boss + ending** (28–30+). An original boss (a house cat that has
   followed the fish all game) at the garage storm drain, fought with move+jump using mechanics from
   all chapters, three phases; then a short swim-to-sea ending + credits with total play time.

## Persistence

`localStorage` key `back-to-sea:v1` (wrap every access in try/catch): unlocked level, best times,
total play time, mute. Level select shows unlocked levels. Debug: `?level=2-3` jumps straight
to a level; `?debug=1` shows hitboxes/fps.

---

# Core engine notes (added by the core engine)

## Contract additions & changes

- **`LEAP_VY = -680`** (was -640). With the real start position (body centre 10 px under the
  surface), -640 couldn't clear a 5-tile ledge. All other starting values are as listed above.
  Every number lives in `js/core/constants.js`.
- **Submerged rule** (in `js/core/level.js`). `S`, `E`, `C`, `o` and entity cells have no tile of
  their own. Their underlying tile is water if the cell above is water, or if at least one
  horizontal neighbour is water and neither horizontal neighbour is open air. Otherwise it is air.
  So `S` in a bowl and `E` at the bottom of a sink are underwater. An entity class can force its
  tile with `static tile = '~' | '.' | '#' | '='`.
- **Checkpoints refill moisture to full** when touched, in both the game and the validator. Use
  them as mid-level water stops.
- **Droplets reset on respawn.** After a faint every droplet comes back, and every entity's
  `onRespawn(world)` is called.
- **Outside the map**, left, right and top count as solid, so a leap bonks an invisible ceiling,
  and falling below the map faints you.
- **Level size.** Levels must be at least 15 rows (the view height) and 20 columns; the tests
  check this. Keep the bottom 2 rows solid: on phones the touch buttons sit over roughly the
  bottom 2.5 tiles (they are translucent).
- **Air momentum.** Horizontal speed above AIR_SPEED, from launches or dashes, bleeds off at
  AIR_DECEL (450 px/s²) while the player steers the same way. Steering against it, or letting go,
  uses the normal air control.
- **No jump-cut.** Releasing JUMP early does not shorten a jump. Holding JUMP underwater keeps
  stroking, and at the surface it leaps.
- **Extra entity flags/hooks:** `init`, `onRespawn`, `water`, `hazard`, `layer`, `jumpPriority`,
  and `static tile`. See the Entity section below.
- **Extra optional fields:**
  - levels: `decor`, `says`;
  - chapters: `drawDecor`, `drawHazard`, `drawOneWayTile`, `drawForeground`, `sfx`, `ending`.
    `drawSolidTile` also gets a 6th `info` argument, and `drawBackground` a 5th `world` argument.

### Movement envelopes

These are measured by the validator's own simulation; the numbers are tiles.

| from | jump | clears a gap of | climbs a ledge of |
|---|---|---|---|
| land | hop (-480) | 4 | 3 |
| puddle `-` | splash-hop (-580) | 5 | 4 |
| water surface | leap (-680) | 6 | 5 |

- Flat dry range is about 32 tiles of hopping in DRY_TIME (minus the 0.5 s margin). Each
  droplet adds about 11 tiles. Every landing is charged the wriggle back to the cell centre.
- Underwater: idle sink 40 px/s, swim 170 px/s. Holding JUMP rises about 160 px/s.

## How to build a chapter

Files: `js/chapters/chN-name.js` (default export), plus optional helpers in `js/chapters/chN/`.
The registry `js/chapters/index.js` already imports all five. Copy the patterns in
**`ch1-kitchen.js`**, the reference chapter.

```js
import { Entity } from '../core/entity.js';                       // base class
import { TILE, DRY_TIME, DROPLET_MOISTURE } from '../core/constants.js';
import { grad, radial, rgba, mix, lighten, darken, roundRect, glow, contactShadow,
         cached, ctxScale, seeded } from '../core/draw.js';      // DOM-free art helpers

export default {
  id: 'bathroom', number: 2, title: 'The Bathroom', subtitle: '…',
  mechanic: { name: 'Soap bubbles', hint: '…' },                 // shown on the chapter title card
  palette: { sky, wallA, wallB, solid, solidEdge, water, waterDeep, accent, shelf?, hazard? },
  drawBackground(ctx, view, cam, time, world) {},  // SCREEN space; parallax with cam.x/cam.y.
                                                   // world is null on title/card screens.
  drawSolidTile?(ctx, x, y, mask, rng, info) {},   // world px; mask bits 1=up 2=right 4=down 8=left
                                                   // are '#' neighbours; info = { tx, ty, level, palette }
  drawOneWayTile?(ctx, x, y, leftIsShelf, rightIsShelf, info) {},
  drawDecor?(ctx, decor, info) {},                 // pre-rendered set pieces, info.layer 'back' | 'front'
  drawHazard?(ctx, x, y, time, world) {},          // animated look of '^' tiles, every frame
  drawForeground?(ctx, view, cam, time, world) {}, // SCREEN space, over the world (darkness, rain…)
  entities: { B: Bubble },
  reach: { B: { … } },                             // validator rules, see "Reach rules"
  sfx: { pop: (a, opts) => { a.tone({ freq: 900, to: 1600, dur: 0.08 }); } },
  music: { … },                                    // see "Music schema"
  levels: [ … ],
};
```

### Rules

- **Import hygiene.** Nothing may touch `window`, `document`, `localStorage`, `AudioContext`,
  `Path2D` or `OffscreenCanvas` at import time; CI imports every chapter under Node. Art code runs
  only when the game calls it.
- **Expensive art:** cache it with
  `cached(key, w, h, ctxScale(ctx), (c, w, h) => { … })` and blit the result. Cached layers are
  rendered once per resolution.
- **`decor`** is drawn once per level into pre-rendered canvases.
  - Use it for big static props (sinks, tubs, machines).
  - Format: `{ type, x, y, w, h (tiles), hideTiles?: true, …any }`.
  - `hideTiles` stops `drawSolidTile` drawing the `#` cells under the decor rect. The tiles stay
    solid; only their drawing is skipped.
  - `drawDecor` is called twice per decor, with `info.layer` set to `'back'` (behind the player)
    and then `'front'` (over the player and water).
- **Level fields:**
  `{ id: '2-1', name, budget, hint?, map: [...], props?: { 'x,y': {...} }, decor?: [...], says?: [{ x, y?, text, seconds? }] }`
  - `hint` is shown at level start.
  - Each `says` entry is shown once, when the fish first reaches column `x` (and is within 3 rows
    of `y` if `y` is given).

### Entity base class (`js/core/entity.js`)

```js
export class Bubble extends Entity {
  static tile = '~';          // optional: underlying tile of the placed cell
  // class fields run AFTER super(), so set up in init(), not in the constructor
  wet = true;                 // overlapping refills moisture
  jumpPriority = 10;          // higher gets onJump first
  init(world) { this.setBox(2, 2, 20, 20); this.y0 = this.y; }   // box = inset inside the placed tile
  update(dt, world) { this.time += dt; }
  draw(ctx, world) { /* world px, camera already applied */ }
  onPlayerOverlap(player, world) { player.launch(null, -60); }    // every frame while overlapping
  onJump(player, world) { player.launch(null, -760); world.audio.sfx('pop'); this.dead = true; return true; }
  onRespawn(world) { this.dead = false; }                         // reset puzzle state after a faint
}
```

- **Fields:**
  - box: `x, y, w, h`; spawn tile: `tx, ty`; `props`; `time`;
  - `solid`, `oneWay`: colliders. Moving solids carry a player standing on them.
  - `wet`, `hazard`;
  - `water`: the box is swimmable water with its surface at `this.y`. Draw it with
    `world.drawWaterRect(ctx, x, y, w, h)`.
  - `dead`;
  - `layer`: < 0 draws behind other entities, > 0 draws above the player.
- **Helpers:** `cx`, `cy`, `overlaps(o)`, `setBox(ix, iy, w, h)`.
- **Removing an entity:** set `dead = true` and it is removed after the frame. To bring it back on
  respawn, `world.spawn()` a new one instead.
- **Jump resolution:** on a JUMP press, `onJump` is called once on every entity the player overlaps
  or stands on, highest `jumpPriority` first. The first to return `true` consumes the press.
  Otherwise the default runs: stroke underwater, leap within `LEAP_ZONE` px of the surface, hop on
  land, splash-hop in a puddle. Presses are buffered for 0.12 s, and there is 0.1 s of coyote time.

### Player API (`world.player`)

- **Position and velocity:** `x y w h cx cy`, `vx vy` (settable), `inWater`, `onGround`, `facing`.
- **State:** `state` is `'swim' | 'air' | 'land' | 'faint' | 'win'`. `alive` is false while fainting
  or winning.
- **Moisture:** `moisture` (0–100). `addMoisture(n)` adds to it; `refill()` fills it.
- **Movement:**
  - `launch(vx | null, vy | null)` sets velocity, leaves the ground and squashes the sprite. Use it
    for boosted jumps.
  - `place(cx, bottom)` teleports.
  - `squash(sx, sy)` is visual only.

### World services (`world.*`)

- **Tiles:**
  - `tileAt(tx, ty)` returns `. # = ~ - ^`.
  - `setTile(tx, ty, c)` queues a re-render of only the rows it can change (water: the row above
    down through the depth shading, `WATER_DEPTH_ROWS`; back layer: ±1 row, and only when a `#` or
    `=` appears or goes), flushed once per step, and rebuilds the water surfaces. Use it for rising
    water and opening walls; flooding a whole hall row by row is cheap.
  - `isSolid(tx, ty)`, `isWater(tx, ty)`, `waterAtPx(px, py)`, `solidAtPx(px, py)`.
- **Entities:** `spawn(entity)` (runs `init`), `findEntities(pred)`.
- **Effects:**
  - `particles.emit({...})` and the presets `particles.splash(x, y, power, color)`,
    `bubbles(x, y, n)`, `sparkle(x, y, n, color)`, `steam(x, y, n)`, `dust(x, y, n)`.
  - `splash(x, y, power)` combines particles, a surface ripple and the splash sound.
  - `rippleAt(x, y, power)`.
- **Feedback:**
  - `audio.sfx(name, { vol, pitch, x })`: passing `x` (world px) pans the sound. Also
    `audio.register(name, fn)`.
  - `shake(0..1)` (off under reduced motion), `flash(color, s)`.
  - `say(text, seconds)` shows a hint.
- **Flow:** `faint(reason)`, `win()`, `setCheckpoint(tx, ty)`.
- **Events:** `on(name, fn)` returns an unsubscribe function, and `emit(name, data)`. Built-in
  events: `jump {kind}`, `land`, `enterWater`, `exitWater`, `faint`, `respawn`, `checkpoint`, `win`.
- **Read-only:** `time` (simulated, follows `timeScale`), `levelTime` (wall-clock seconds in the
  level: the HUD timer and best times), `level` (parsed: `w h tile raw spawn exit entities`), `def`,
  `chapter`, `palette`, `exit` (the Exit entity; `exit.locked = true` hides the way out),
  `dryScale` (multiplier on drying speed, default 1).

### SFX

- **Built-in names:** `splash`, `leap`, `stroke`, `hop`, `splashhop`, `flop`, `drip`, `faint`,
  `checkpoint`, `exit`, `ui`, `bonk`, `burn`, `gasp`, `bubble`.
- **Chapter SFX:** add `sfx: { name: (a, opts) => {…} }` to the chapter module. They are registered
  when the chapter's card or level loads.
- **Synth helper `a`:**
  - `a.tone({ freq, to?, dur, type, vol, attack, release?, delay, pan, filter?, cutoff?, q?, detune? })`
  - `a.noise({ dur, vol, filter, freq, to?, q, delay, attack, pan })`
  - `a.chord([f…], opts)`
  - `a.ctx` and `a.now` for raw WebAudio.
- **Options:** `opts` carries `vol`, `pitch` and `pan` from the caller.

## Music schema

`music` on a chapter module drives the generative engine in `js/core/audio.js`. It changes with a
crossfade when the chapter changes. All parts are optional, and every `vol` is 0..1.

```js
music: {
  bpm: 84, key: 'F',            // key: C C# Db D … B
  scale: 'major',               // major minor dorian mixolydian lydian phrygian pentatonic minorPentatonic
  progression: [1, 5, 6, 4],    // chord root per bar as a scale degree (triads built in the scale)
  swing: 0.12,                  // 0..0.3, delays the off-beat 8ths
  reverb: 0.4,                  // send level
  pad:   { wave: 'triangle', vol: 0.45, octave: 3, cutoff: 1300, attack: 1.2 },  // held chord each bar
  bass:  { wave: 'sine', vol: 0.55, octave: 2, pattern: 'x.....x.' },          // 8 (8ths) or 16 (16ths) chars per bar
  arp:   { wave: 'sine', vol: 0.3, octave: 4, pattern: [0, 2, 1, 2], rate: 2, decay: 0.35, cutoff },
                                // pattern = chord-tone indices (0..2, 3 = root an octave up); rate 1|2|4 notes per beat
  lead:  { wave: 'triangle', vol: 0.18, octave: 5, density: 0.22, decay: 0.7 }, // random pentatonic bell notes
  drips: { vol: 0.3, density: 0.25 },     // ambient water plinks
  noise: { vol: 0.1, cutoff: 600 },       // filtered noise bed (rain, boiler hum)
}
```

For a boss phase change, call `world.game.audio.setMusic(otherSchema)` from the boss entity.

## Reach rules (validator)

`js/core/validate.js` searches from S to E. It uses **simulated** trajectories from the game's own
`stepBody()`, and states are tracked with their dry time. Chapter entities are invisible to it
unless the chapter adds a rule. `reach` maps an entity char to a rule with these fields:

```js
reach: {
  X: {
    as: 'air' | 'solid' | 'oneway' | 'water' | 'hazard',   // how the entity's own cell counts (default: its tile)
    mark(ctx) { return [{ x, y, refill?, hazard?, as?, noSwim?: ['L','R','U','D'] }]; },  // annotate cells
    trigger: true,              // touching the entity's cell (box: rule.box or the full tile) captures
                                // the player into a node "X@x,y"
    box: { x, y, w, h },        // optional trigger hitbox inside the tile
    refill: true,               // arriving at the trigger node resets the dry clock
    edges(ctx) { return [ … ]; },
  },
}
```

- **`ctx`:** `{ x, y, props, level, env, K, TILE }`. `env` has `isSolid`, `isOneWay`, `isWater`,
  `isStand` and `isOpen` (taking tile coords), plus `w` and `h`.
- **Edge forms.** Without `from`, an edge leaves the trigger node; with `from: {x, y}`, it leaves
  that stand or water cell.
  - `{ launch: { cx, cy, vx?, vy?, leapT? }, refill?, time?, steer?: false }`:
    **preferred, because it is honest.** It places the body centre at `(cx, cy)` px with that
    velocity and simulates the real physics with every steering strategy (or none, if
    `steer: false`). Only landings the simulation reaches become edges. A launch from a trigger
    ignores that trigger until the body leaves it.
  - `{ to: { x, y }, time, refill? }`: a **trusted teleport** to a stand, water or trigger cell,
    with `time` seconds of dry time. It is an escape hatch for scripted things (a valve flooding a
    room). Use it sparingly; the validator cannot check it.
  - `refill: true` on an edge resets the dry clock before the edge (you were kept wet).
- **Entity flags.** An entity whose class fields default to `hazard = true` is treated as a hazard
  cell automatically. One that defaults to `solid`, `oneWay` or `water` is a validation error until
  `reach[ch].as` declares how to treat it. Declare these flags as class fields, not in `init()`, so
  the validator can see them.
- **Keep rules conservative.** Only claim what a first-time player can actually do. Mark a cell
  `refill` only if standing there really refills you over time.

**Worked example: the dripping tap `T` (ch1).**

```js
T: { mark({ x, y, env, props }) {
  if ((props.period || 1.2) > 2) return [];          // too slow to beat DRY_RATE: no credit
  for (let yy = y + 1; yy < env.h; yy++) {           // follow the drips down
    if (env.isSolid(x, yy) || env.isOneWay(x, yy) || env.isWater(x, yy)) return [];
    if (env.isStand(x, yy)) return [{ x, y: yy, refill: true }];   // where they land refills you
  }
  return [];
} }
```

**Sketch for a bubble (ch2):** touching it captures you; you float up and pop into a boosted jump.

```js
B: { trigger: true, refill: true, edges: ({ x, y, env, TILE }) => {
  const out = [];
  for (let yy = y; yy >= 0 && !env.isSolid(x, yy); yy--)          // you can pop at any height it rises to
    out.push({ launch: { cx: (x + 0.5) * TILE, cy: (yy + 0.5) * TILE, vy: -760 }, time: (y - yy) * 0.25, refill: true });
  return out;
} }
```

`validateLevel(def, chapter)` returns `{ ok, errors, stats: { path } }`. `stats.path` is a node
route, which is useful while designing. `tests/levels.test.mjs` runs every level plus control
fixtures. Add chapter-specific tests in `tests/chN.test.mjs`.

## Chapter hooks (added by integration)

Chapter code talks to the game only through the World. Never reach for `window.__bts`,
`location`, `world.game.input` or ad-hoc `world._something` fields.

- **`world.input`**: read-only `{ dir(), jumpHeld() }` (−1/0/1 and bool; both read 0/false while
  fainting or winning). For entities that care what is held, e.g. a bubble you steer, or a valve
  that ignores presses while a direction is held. JUMP presses still arrive only through
  `onJump`; there is deliberately no way to take a press outside that protocol.
- **`world.vars`**: a per-level scratch object (a fresh `Object.create(null)` per World) for
  chapter state shared between entities: `vars.bubbles = { carrier, lastPopT, hinted }` (ch2),
  `vars.plumb` (ch4 Plumbing), `vars.skid` (ch3), `vars.boss`, `vars.flash`, `vars.catchers`,
  `vars.dashT`, `vars.bubbleCD` (ch5). Namespace your keys by purpose.
- **`world.params`**: the page's URL query (`get(name)`, `has(name)`), e.g. `?phase=` for the boss.
- **Slow motion**: `world.slowMo(scale, seconds)` scales simulated time by `scale` for `seconds` of
  real time (0 = until changed); `world.timeScale` is the current factor. It resets to 1 on faint
  and on respawn. `levelTime`, hints and the save's play time stay on real time.
- **`world.setMusic(schema)`** switches the music (boss phases). **`world.view`** is the logical
  view `{ w, h, scale, safe }`.
- **Hints**: `world.say(text, s)` shows at once (replacing the current hint). The level `hint` and
  `says` lines are queued instead: none show under the level-name banner (`LEVEL_BANNER_T` = 2.6 s,
  `world.bannerOn`), they never stack on each other, and a queued line may cut the previous queued
  one short once it has been up for 2.5 s. Nothing is drawn in the hint pill while the banner shows.

## Boss & finale hooks

- `world.setBoss({ name, hp, max })` shows a boss bar. The HUD reads the object every frame, so
  mutating `hp` updates the bar. `setBoss(null)` hides it.
- `world.lockCamera({ x, y, w, h })` (world px) keeps the camera inside an arena;
  `lockCamera(null)` releases it.
- `world.exit.locked = true` keeps the level's `E` closed and drawn dim until you unlock it. Or call
  `world.win()` yourself.
- **Ending.** Completing the last level of the last chapter goes to the ending scene. So does
  calling `world.finishGame()` (it also records the level as cleared). The ending card shows
  credits, the total play time from the save, and **Play again** (chapter 1 card, 1-1) / Levels /
  Title, which share one row at any width. Customise it on the finale module:
  `ending: { draw(ctx, view, t, stats) {}, credits: [...] | (stats) => [...], cardAt?, skipTo?, music? }`.
  - `draw` replaces the default sunrise-sea backdrop, in screen space.
  - `stats` is `{ total, cleared, best: { id: s }, levels: LEVELS }`; `credits` may be a function of it.
  - `cardAt`: seconds before the card fades in (default 0). A tap before `skipTo` (default `cardAt`)
    jumps the scene clock `t` to `skipTo`.
- **Boss entity tips:**
  - Run phases from the entity's `update`.
  - Use `world.shake`, `world.flash`, `world.say` and `world.particles`.
  - Hurt the player with `world.faint('hazard')` or a `hazard = true` box.
  - Set `onRespawn(world)` to reset the phase or HP rules after a faint.

## Testing a level

- Run `cd <repo> && node --test apps/back-to-sea/tests/levels.test.mjs`. It must pass.
- Build and serve: `./scripts/build-site.sh && python3 -m http.server 8123 -d _site`.
- Open these URLs:
  - `http://localhost:8123/apps/back-to-sea/?level=2-3` starts a level directly, skipping the
    title and card.
  - `?debug=1` adds hitboxes, fps, player state and unlocks every level in level select.
- `window.__bts` is a test hook (automation only; game code must not use it):
  - `state()` returns player and level info, and `world` is the live World.
  - `input.virtual = { dir, jump }` and `input.pressVirtualJump()` drive the fish without devices.
  - `hold(true)` stops the real-time loop from stepping the scene (it still renders) and `step(n)`
    advances n fixed steps, so bots can run faster than real time.
  - `perf.samples()` returns `[updateMs, renderMs]` for the last 1024 frames (`perf.reset()`).
- `validateLevel()` also returns `stats.steps`: the route as `[{ to, how }]`, where `how` is
  `{ mode: 'swim' | 'walk' | 'jump' | 'rule', start?, strat?, dir?, rule? | ed? }`. Replaying it
  with virtual input drives a bot through the level.
- **Save** is stored in `localStorage['back-to-sea:v1']`:
  `{ cleared: {id: true}, best: {id: s}, total: s, mute, last }`. A level is unlocked if it is the
  first level, it was cleared, or the previous level was cleared.

## Integration changes (contract updates)

- **`levelTime` is wall-clock.** Under `slowMo` the simulation slows but the HUD timer, best times
  and total play time do not.
- **Valves (ch4)** turn only on a JUMP with no direction held (`valveAcceptsPress` in
  `ch4/logic.js`). Holding a direction means hop/swim on, so waiting at a wheel and then hopping
  away never turns it straight back, and stroking past a submerged wheel never toggles it.
  Accepting presses that point toward the wheel was rejected: whether a press points toward the
  wheel depends on which side of its centre you are on, so a hop on toward the far side would
  still turn it. To make the rule discoverable instead:
  - while the fish touches a wheel, an on-wheel prompt shows the JUMP button's glyph and "JUMP"
    ("STOP + JUMP" while a direction is held, dimmed during the cooldown);
  - the first press made with a direction held at a wheel you have never turned says "Let go of
    MOVE, then JUMP to turn the wheel".
- **Drums (ch3)** are more forgiving. `DRUM_GRACE` (0.22 s): a press just after the arrow ticks
  round still dashes the way it pointed. `DRUM_PULL`: the eddy pulls you toward the centre, so a
  passive rider circles about 2 tiles out instead of pinned to the wall. Exit portholes are at
  least 4 tiles tall (`tests/ch3.test.mjs` checks it). In 3-5 and 3-6 the spin steps are a little
  slower (1.0–1.1 s).
- **Tile layers.** A chunk's front layer is dropped when its decor paints nothing in front, so
  it isn't composited every frame.
- **Exit / Checkpoint detection** in chapter art uses `e === world.exit` and
  `e instanceof Checkpoint` (from `core/builtins.js`), never `constructor.name`.
