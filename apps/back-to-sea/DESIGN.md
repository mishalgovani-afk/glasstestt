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
