// Input: only MOVE (left/right) and JUMP, from keyboard and on-screen touch controls.
// Touch: any finger on the left half of the screen is MOVE (left or right of the divider between
// the two arrow buttons; sliding across switches direction), any finger on the right half is JUMP.
// Multi-touch: hold move with one thumb and tap jump with the other.

const KEYS_LEFT = new Set(['ArrowLeft', 'KeyA']);
const KEYS_RIGHT = new Set(['ArrowRight', 'KeyD']);
const KEYS_JUMP = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.pointers = new Map(); // pointerId -> 'left' | 'right' | 'jump'
    this.jumpPresses = 0;      // presses since last takeJump()
    this.enabled = true;
    this.onPause = null; this.onMute = null; this.onAny = null;
    this.virtual = { dir: 0, jump: false }; // for scripted tests (?debug=1 exposes it)
    this.touchSeen = false;
  }

  attach(touchLayer, buttons) {
    this.touchLayer = touchLayer; this.buttons = buttons;
    addEventListener('keydown', (e) => this._key(e, true));
    addEventListener('keyup', (e) => this._key(e, false));
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
    const opt = { passive: false };
    touchLayer.addEventListener('pointerdown', (e) => this._pdown(e), opt);
    touchLayer.addEventListener('pointermove', (e) => this._pmove(e), opt);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) touchLayer.addEventListener(ev, (e) => this._pup(e), opt);
    touchLayer.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS: stop double-tap zoom / scroll on the layer
    touchLayer.addEventListener('touchstart', (e) => e.preventDefault(), opt);
    touchLayer.addEventListener('touchmove', (e) => e.preventDefault(), opt);
  }

  clear() {
    this.keys.clear(); this.pointers.clear(); this.jumpPresses = 0;
    this.virtual.dir = 0; this.virtual.jump = false;
    this._render();
  }

  _key(e, down) {
    if (e.repeat && down) { if (this._isGameKey(e.code)) e.preventDefault(); return; }
    if (down && this.onAny) this.onAny(e);
    const inMenu = e.target && e.target.closest && e.target.closest('button, a, input');
    if (down && (e.code === 'KeyP' || e.code === 'Escape')) { this.onPause && this.onPause(); e.preventDefault(); return; }
    if (down && e.code === 'KeyM') { this.onMute && this.onMute(); return; }
    if (!this.enabled) return;
    if (inMenu && (e.code === 'Space' || e.code === 'Enter')) return; // let buttons click
    if (this._isGameKey(e.code)) {
      e.preventDefault();
      if (down) {
        if (KEYS_JUMP.has(e.code) && !this.keys.has(e.code)) this.jumpPresses++;
        this.keys.add(e.code);
      } else this.keys.delete(e.code);
    }
  }
  _isGameKey(c) { return KEYS_LEFT.has(c) || KEYS_RIGHT.has(c) || KEYS_JUMP.has(c); }

  _zone(e) {
    const r = this.touchLayer.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (x > r.width * 0.5) return 'jump';
    const bl = this.buttons.left.getBoundingClientRect(), br = this.buttons.right.getBoundingClientRect();
    const divider = (bl.right + br.left) / 2;
    return e.clientX < divider ? 'left' : 'right';
  }
  _pdown(e) {
    e.preventDefault();
    this.touchSeen = true;
    document.body.classList.add('touch');
    if (this.onAny) this.onAny(e);
    try { this.touchLayer.setPointerCapture(e.pointerId); } catch {}
    const z = this._zone(e);
    this.pointers.set(e.pointerId, z);
    if (z === 'jump' && this.enabled) this.jumpPresses++;
    this._render();
  }
  _pmove(e) {
    if (!this.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const cur = this.pointers.get(e.pointerId);
    if (cur === 'jump') return; // a jump finger stays a jump finger
    const z = this._zone(e);
    if (z !== 'jump' && z !== cur) { this.pointers.set(e.pointerId, z); this._render(); }
  }
  _pup(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this._render();
  }
  _render() {
    if (!this.buttons) return;
    const z = new Set(this.pointers.values());
    this.buttons.left.classList.toggle('pressed', z.has('left') || this._k(KEYS_LEFT));
    this.buttons.right.classList.toggle('pressed', z.has('right') || this._k(KEYS_RIGHT));
    this.buttons.jump.classList.toggle('pressed', z.has('jump'));
  }
  _k(set) { for (const k of set) if (this.keys.has(k)) return true; return false; }

  /** -1, 0 or 1 */
  dir() {
    if (!this.enabled) return 0;
    let l = this._k(KEYS_LEFT), r = this._k(KEYS_RIGHT);
    for (const z of this.pointers.values()) { if (z === 'left') l = true; if (z === 'right') r = true; }
    if (this.virtual.dir < 0) l = true; if (this.virtual.dir > 0) r = true;
    return l === r ? 0 : l ? -1 : 1;
  }
  jumpHeld() {
    if (!this.enabled) return false;
    if (this._k(KEYS_JUMP) || this.virtual.jump) return true;
    for (const z of this.pointers.values()) if (z === 'jump') return true;
    return false;
  }
  /** True once per JUMP press. */
  takeJump() {
    if (this.jumpPresses > 0) { this.jumpPresses = 0; return this.enabled; }
    return false;
  }
  pressVirtualJump() { this.jumpPresses++; }
}
