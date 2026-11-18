// Entity base class (DOM-free at import time). Chapter entities extend this.
//
//   import { Entity } from '../core/entity.js';
//   export class Tap extends Entity {
//     static tile = '.';            // underlying tile of the cell ('.', '~', '#', '='); optional
//     solid = false;                // class fields are assigned AFTER super() returns —
//     init(world) { ... }           // so do setup that needs them in init(), not the constructor
//     update(dt, world) { ... }
//     draw(ctx, world) { ... }      // ctx already translated by the camera (world px)
//   }
//
// Lifecycle: constructor(world, x, y, props) -> init(world) (once, after fields are set) ->
// update/draw every frame. onRespawn(world) is called after the player faints and respawns.

import { TILE } from './constants.js';

export class Entity {
  /**
   * @param world  the World (null when constructed by tools/tests)
   * @param x,y    top-left px of the tile the entity was placed on
   * @param props  per-instance props from level.props['tx,ty'] (or {})
   */
  constructor(world, x, y, props = {}) {
    this.world = world;
    this.x = x; this.y = y;
    this.w = TILE; this.h = TILE;
    this.tx = Math.floor(x / TILE); this.ty = Math.floor(y / TILE);
    this.props = props || {};
    this.time = 0;
  }

  // --- flags read by the engine every frame (override as class fields) ---
  solid = false;        // acts as a solid box (player collides with this.x/y/w/h)
  oneWay = false;       // acts as a one-way platform (stand on top, jump up through)
  wet = false;          // overlapping refills moisture (like a puddle)
  water = false;        // the box is a swimmable water volume (surface = this.y)
  hazard = false;       // overlapping makes the player faint
  dead = false;         // set true to remove the entity
  jumpPriority = 0;     // higher gets onJump first
  layer = 0;            // draw order: < 0 behind tiles' front pass, 0 normal, > 0 above the player

  /** Called once after construction (class fields are ready here). */
  init(world) {}
  update(dt, world) {}
  draw(ctx, world) {}
  /** Every frame while the player's hitbox overlaps this box. */
  onPlayerOverlap(player, world) {}
  /** JUMP pressed while overlapping (or standing on) this. Return true to consume the jump. */
  onJump(player, world) { return false; }
  /** After a faint, when the player respawns at the checkpoint. Reset puzzle state here if needed. */
  onRespawn(world) {}

  // --- helpers ---
  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  overlaps(o) {
    return this.x < o.x + o.w && this.x + this.w > o.x && this.y < o.y + o.h && this.y + this.h > o.y;
  }
  /** Set the box to an inset of the placed tile: setBox(4, 8, 16, 16). */
  setBox(ix, iy, w, h) { this.x = this.tx * TILE + ix; this.y = this.ty * TILE + iy; this.w = w; this.h = h; return this; }
}
