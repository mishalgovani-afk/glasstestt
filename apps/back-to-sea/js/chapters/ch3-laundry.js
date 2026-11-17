// Chapter 3 — The Laundry Room (STUB by the core engine; the chapter-3 agent replaces this).
// Mechanic to build: currents & spin. See ch1-kitchen.js for the reference patterns.
import { grad, cached, ctxScale, roundRect, blit } from '../core/draw.js';

const P = {
  sky: '#eee8f7', wallA: '#e9e3f4', wallB: '#cfc4e6', solid: '#9b8fbf', solidEdge: '#d9d1f0',
  water: '#8fc9f0', waterDeep: '#3d68a8', accent: '#ffcc4d', shelf: '#b8a98a', hazard: '#ff6b6b',
};

function paintWall(c, w, h) {
  c.fillStyle = grad(c, 0, 0, 0, h, [P.wallA, P.wallB]);
  c.fillRect(0, 0, w, h);
  // washing machine silhouette
  c.fillStyle = '#f7f6fb'; roundRect(c, 120, 120, 150, 170, 12); c.fill();
  c.fillStyle = '#c9c3dc'; c.beginPath(); c.arc(195, 215, 52, 0, 7); c.fill();
  c.fillStyle = '#9fc6e8'; c.beginPath(); c.arc(195, 215, 40, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,.4)'; c.beginPath(); c.arc(180, 200, 14, 0, 7); c.fill();
}

export default {
  id: 'laundry', number: 3,
  title: 'The Laundry Room', subtitle: 'Round and round',
  mechanic: { name: 'Currents & spin', hint: 'Currents push you — JUMP inside one to dash along the flow.' },
  palette: P,
  drawBackground(ctx, view, cam) {
    const img = cached('l-wall', 480, 360, ctxScale(ctx), paintWall);
    const off = -((cam.x * 0.3) % 480 + 480) % 480;
    for (let x = Math.floor(off); x < view.w; x += 480) blit(ctx, img, x, -cam.y * 0.2);
  },
  entities: {},
  music: {
    bpm: 96, key: 'D', scale: 'dorian', progression: [1, 4, 1, 7], swing: 0.18, reverb: 0.3,
    pad: { wave: 'triangle', vol: 0.4, octave: 3, cutoff: 1200, attack: 0.8 },
    bass: { wave: 'triangle', vol: 0.5, octave: 2, pattern: 'x..x..x.' },
    arp: { wave: 'sine', vol: 0.28, octave: 4, pattern: [0, 1, 2, 1, 0, 2], rate: 3, decay: 0.25 },
  },
  levels: [
    {
      id: '3-1', name: 'Spin Cycle', budget: 40,
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
        '..............................',
        '..S.......-......###..........',
        '......###........###......E...',
        '##############################',
        '##############################',
      ],
    },
  ],
};
