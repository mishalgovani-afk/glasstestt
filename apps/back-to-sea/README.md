# Back to Sea

A fish escapes its kitchen fishbowl and hops from water source to water source through the house:
sink, bathtub, washing machine, basement pipes. It finally reaches the garage storm drain, beats the
house cat that has followed it all game, and swims out to sea. It is a small, mobile-first
platformer with two actions, move and jump, and a new mechanic in each chapter. Everything is drawn
on canvas and synthesized with WebAudio, so there are no images, sound files or dependencies.

The game is about 30 minutes long. That is a design estimate from per-level time budgets (about
7 minutes per chapter, plus the boss and ending), not a measured playtime.

## Controls

Only two player actions exist: **move** (left/right) and **jump**. Objects in the world change what
jump does: it pops a bubble, dashes in a current, turns a valve, and so on.

| Input | Action |
|---|---|
| Left half of the screen (touch) | Move. Left or right of the divider between the two arrow buttons. Slide across to change direction. |
| Right half of the screen (touch) | Jump. Multi-touch works: hold move with one thumb and tap jump with the other. |
| ← / → or A / D | Move |
| Space, ↑, W or Z | Jump |
| P or Esc | Pause |
| M | Mute |

The pause and mute buttons on screen do the same as P and M.

## Chapters & mechanics

| Chapter | Room | Mechanic | ~Minutes |
|---|---|---|---|
| 1 | Kitchen | Puddles & drips: jump from a puddle for a big splash-hop | 0–7 |
| 2 | Bathroom | Soap bubbles: touch one to float, then jump to pop it for a boosted jump | 7–14 |
| 3 | Laundry room | Currents & spin: jump inside a current to dash along its flow | 14–21 |
| 4 | Basement | Valves & rising water: stop at a valve wheel and jump to turn it (a JUMP prompt shows on the wheel) | 21–28 |
| 5 | Garage storm drain | Finale: the cat boss, fought with mechanics from all chapters, then the swim to sea and credits | 28–30+ |

Each chapter opens with a title card that names its mechanic. The first level of a chapter
introduces that mechanic safely, and later levels combine it with earlier ones.

The fish has a moisture meter. It is full in water and drains out of water in 6 seconds. Puddles,
droplets and checkpoints refill it. At zero the fish faints and respawns at the last checkpoint or
level start. There are no lives. Hot burners and the cat's paw also cause a faint.

## Saving

Progress is stored in `localStorage` under the key `back-to-sea:v1`. It holds cleared levels, best
times per level, total play time, the mute setting and the last level played. Every access is
wrapped in try/catch, so the game still runs when storage is blocked (private mode, for example),
but progress is then lost when the page closes.

- **Level select** lists all 26 levels (6 + 6 + 6 + 6 + 2) by chapter. A level unlocks when it is
  the first level, it has been cleared, or the level before it has been cleared.
- **Continue** on the title screen starts the first level you have not cleared, with its chapter
  card if it opens a chapter. Finishing a chapter's last level goes straight to the next chapter's
  card and first level.
- The HUD timer counts the current level; the total play time adds up every level you play
  (retries included) and is shown on the level select and on the ending card, which also offers
  **Play again**.

## Run locally

The game is static: plain ES modules, no build step, no npm install. Serve the folder with any
static server, for example:

```sh
python3 -m http.server -d apps/back-to-sea 8123
```

Then open `http://localhost:8123/`. To test the published site layout, run `./scripts/build-site.sh`
from the repo root and serve `_site/` instead. Use an HTTP server rather than opening `index.html`
directly, because the game loads ES modules.

## Debug

- `?level=2-3` jumps straight to a level, skipping the title and card. Level IDs are `chapter-level`.
- `?debug=1` shows hitboxes, fps and player state, and unlocks every level in level select.
- `?level=5-2&phase=2` (or `3`) starts the boss fight at that phase.
- `window.__bts` is a test hook for automated checks: state, virtual input, `hold()`/`step(n)` to
  run faster than real time, and `perf.samples()` frame costs (see DESIGN.md).

## Tests

```sh
node --test apps/back-to-sea/tests/*.test.mjs
```

The tests use only Node's built-in runner, so CI needs no install. `tests/chN.test.mjs` cover each
chapter's logic and `tests/core.test.mjs` the tile re-render rules. `tests/levels.test.mjs` runs the
level validator on every level. The validator searches from the start to the exit using the game's
own physics, with the real jump heights and the dry-time limit. A level passes only if the fish can
reach the exit without staying out of water longer than the dry time, with refills at puddles and
droplets resetting the clock. This proves each level is reachable in time; it does not prove that
the level is fun.

## Code layout

```
apps/back-to-sea/
├── index.html
├── styles.css
├── DESIGN.md              design and engineering contract
├── js/
│   ├── main.js            startup and game loop
│   ├── player.js          the fish: movement, moisture, faint and win states
│   ├── core/              DOM-free where possible: constants, physics, level parsing,
│   │                      validate.js, world, entity base class, input, save, audio, draw
│   ├── chapters/          index.js registry plus ch1-kitchen.js through ch5-finale.js
│   └── scenes/            title, card, levels, game, hud, ui, ending
└── tests/
    ├── levels.test.mjs   every level through the validator
    ├── core.test.mjs     engine logic (tile dirty rows)
    └── ch1–ch5.test.mjs  chapter logic
```

Tunable numbers live in `js/core/constants.js`. Chapter rules and level maps are in
`DESIGN.md` and the `js/chapters/` modules.
