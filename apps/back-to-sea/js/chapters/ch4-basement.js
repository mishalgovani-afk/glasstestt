// Chapter 4 — The Basement (STUB by the core engine; the chapter-4 agent replaces this).
// Mechanic to build: valves & rising water. See ch1-kitchen.js for the reference patterns.
import { grad, cached, ctxScale, glow, blit } from '../core/draw.js';

const P = {
  sky: '#1c2230', wallA: '#2a3242', wallB: '#161b26', solid: '#4d5566', solidEdge: '#7a8496',
  water: '#4fa3b8', waterDeep: '#123a4d', accent: '#ffb347', shelf: '#6b5a48', hazard: '#ff7a3a',
};

function paintWall(c, w, h) {
  c.fillStyle = grad(c, 0, 0, 0, h, [P.wallA, P.wallB]);
  c.fillRect(0, 0, w, h);
  // concrete blocks
  c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 1;
  for (let y = 0; y < h; y += 30) for (let x = (y / 30) % 2 ? 0 : 30; x < w; x += 60) c.strokeRect(x, y, 60, 30);
  // pipes
  c.fillStyle = '#6d5a4a'; c.fillRect(0, 70, w, 10); c.fillRect(300, 70, 10, h);
  glow(c, 120, 40, 80, '#ffcf7a', 0.25);
}

export default {
  id: 'basement', number: 4,
  title: 'The Basement', subtitle: 'Down in the pipes',
  mechanic: { name: 'Valves & rising water', hint: 'JUMP at a valve wheel to turn it and move the water.' },
  palette: P,
  drawBackground(ctx, view, cam) {
    const img = cached('m-wall', 480, 360, ctxScale(ctx), paintWall);
    const off = -((cam.x * 0.3) % 480 + 480) % 480;
    for (let x = Math.floor(off); x < view.w; x += 480) blit(ctx, img, x, -cam.y * 0.2);
  },
  entities: {},
  music: {
    bpm: 68, key: 'C', scale: 'minor', progression: [1, 6, 4, 5], swing: 0, reverb: 0.6,
    pad: { wave: 'sawtooth', vol: 0.25, octave: 2, cutoff: 600, attack: 2 },
    bass: { wave: 'sine', vol: 0.55, octave: 1, pattern: 'x.......' },
    lead: { wave: 'sine', vol: 0.15, octave: 5, density: 0.12, decay: 1.2 },
    drips: { vol: 0.4, density: 0.4 },
    noise: { vol: 0.08, cutoff: 400 },
  },
  levels: [
    {
      id: '4-1', name: 'Pipe Dream', budget: 40,
      map: [
        '..............................',
        '##############################',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..............................',
        '..S...........................',
        '#######~~~~~#######.....E.....',
        '#######~~~~~##################',
        '##############################',
      ],
    },
  ],
};
