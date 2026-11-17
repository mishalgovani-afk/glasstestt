// Chapter 5 — Finale: the storm drain boss + ending (STUB by the core engine; the finale agent
// replaces this). Boss hooks: see DESIGN.md "Boss & finale hooks". The last level's exit leads to
// the ending scene; `ending` below customises it.
import { grad, cached, ctxScale, blit } from '../core/draw.js';

const P = {
  sky: '#1b2a3d', wallA: '#2b3d52', wallB: '#141e2b', solid: '#5b6573', solidEdge: '#8994a3',
  water: '#5fb7d1', waterDeep: '#103550', accent: '#ffd166', shelf: '#6e6250', hazard: '#ff6b6b',
};

function paintSky(c, w, h) {
  c.fillStyle = grad(c, 0, 0, 0, h, ['#0f1a2a', '#2b3d52', '#3d5468']);
  c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(255,255,255,.08)';
  for (let i = 0; i < 40; i++) c.fillRect((i * 97) % w, (i * 53) % (h * 0.6), 2, 2);
}

export default {
  id: 'finale', number: 5,
  title: 'The Storm Drain', subtitle: 'The last leap',
  mechanic: { name: 'Everything', hint: 'Use all you have learned.' },
  palette: P,
  drawBackground(ctx, view, cam) {
    const img = cached('f-sky', 480, 360, ctxScale(ctx), paintSky);
    const off = -((cam.x * 0.2) % 480 + 480) % 480;
    for (let x = Math.floor(off); x < view.w; x += 480) blit(ctx, img, x, 0);
  },
  entities: {},
  music: {
    bpm: 104, key: 'E', scale: 'minor', progression: [1, 6, 3, 7], swing: 0, reverb: 0.35,
    pad: { wave: 'sawtooth', vol: 0.3, octave: 3, cutoff: 900, attack: 0.6 },
    bass: { wave: 'triangle', vol: 0.6, octave: 2, pattern: 'x.x.x.x.' },
    arp: { wave: 'square', vol: 0.12, octave: 4, pattern: [0, 1, 2, 1], rate: 4, decay: 0.15 },
    noise: { vol: 0.12, cutoff: 1500 },
  },
  levels: [
    {
      id: '5-1', name: 'The Storm Drain', budget: 60,
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
        '..S.........-.................',
        '.......................~~~E~..',
        '#######################~~~~~##',
        '##############################',
      ],
    },
  ],
  // ending: { draw(ctx, view, t, stats) {}, credits: ['...'] }  // optional, see DESIGN.md
};
