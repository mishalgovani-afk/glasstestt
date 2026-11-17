// Chapter 2 — The Bathroom (STUB by the core engine; the chapter-2 agent replaces this).
// Mechanic to build: soap bubbles. See ch1-kitchen.js for the reference patterns.
import { grad, cached, ctxScale, roundRect, blit } from '../core/draw.js';

const P = {
  sky: '#e6f6f7', wallA: '#dff1f2', wallB: '#bfe0e3', solid: '#f4f7f8', solidEdge: '#ffffff',
  water: '#7fd6ea', waterDeep: '#2a7fa3', accent: '#ff9ccf', shelf: '#c9d6db', hazard: '#ff6b6b',
};

function paintWall(c, w, h) {
  c.fillStyle = grad(c, 0, 0, 0, h, [P.wallA, P.wallB]);
  c.fillRect(0, 0, w, h);
  // square wall tiles
  for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) {
    c.fillStyle = (x + y) % 64 ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.2)';
    roundRect(c, x + 1, y + 1, 30, 30, 3); c.fill();
  }
  // mirror
  c.fillStyle = grad(c, 0, 60, 0, 200, ['#f8feff', '#cfe9ef']);
  roundRect(c, 200, 50, 160, 130, 16); c.fill();
  c.strokeStyle = '#b5ccd3'; c.lineWidth = 6; c.stroke();
}

export default {
  id: 'bathroom', number: 2,
  title: 'The Bathroom', subtitle: 'Bubbles and suds',
  mechanic: { name: 'Soap bubbles', hint: 'Touch a bubble to float up — JUMP to pop it for a boost.' },
  palette: P,
  drawBackground(ctx, view, cam) {
    const img = cached('b-wall', 512, 360, ctxScale(ctx), paintWall);
    const off = -((cam.x * 0.3) % 512 + 512) % 512;
    for (let x = Math.floor(off); x < view.w; x += 512) blit(ctx, img, x, -cam.y * 0.2);
  },
  entities: {},
  music: {
    bpm: 76, key: 'A', scale: 'lydian', progression: [1, 2, 1, 5], swing: 0, reverb: 0.5,
    pad: { wave: 'sine', vol: 0.5, octave: 3, cutoff: 1800, attack: 1.5 },
    bass: { wave: 'sine', vol: 0.45, octave: 2, pattern: 'x.......' },
    arp: { wave: 'triangle', vol: 0.25, octave: 5, pattern: [0, 1, 2, 3], rate: 2, decay: 0.4 },
    drips: { vol: 0.35, density: 0.35 },
  },
  levels: [
    {
      id: '2-1', name: 'Tub Time', budget: 40,
      hint: 'Leap from the tub to the drain.',
      map: [
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '.#~~~~~~#.....................',
        '.#~~S~~~#........====.........',
        '.#~~~~~~#..-..............E...',
        '##############################',
        '##############################',
      ],
    },
  ],
};
