// Chapter 2 — The Bathroom. Mechanic: soap bubbles. Touching a bubble encases the fish: it stays
// moist and floats up, MOVE drifts it sideways, JUMP pops it into a boosted jump (with foam).
// See ch2/logic.js for the shared bubble rules, ch2/entities.js, ch2/reach.js (validator), ch2/art.js.
import { P, drawBackground, drawSolidTile, drawOneWayTile, drawHazard, drawDecor, drawForeground } from './ch2/art.js';
import { Bubble, Maker, Shower, Wind, TubTap, Duck } from './ch2/entities.js';
import { reach } from './ch2/reach.js';
import { levels } from './ch2/levels.js';

export default {
  id: 'bathroom', number: 2,
  title: 'The Bathroom', subtitle: 'Bubbles and suds',
  mechanic: { name: 'Soap bubbles', hint: 'Touch a bubble to float up and steer it. JUMP pops it into a big boost!' },
  palette: P,
  drawBackground, drawSolidTile, drawOneWayTile, drawHazard, drawDecor, drawForeground,
  entities: { B: Bubble, M: Maker, H: Shower, W: Wind, D: TubTap, K: Duck },
  reach,
  sfx: {
    // soap-bubble pop: wet click + airy fizz
    pop: (a, o) => {
      const v = o.vol ?? 1, p = o.pitch || 1;
      a.tone({ freq: 1400 * p, to: 320 * p, dur: 0.07, type: 'sine', vol: 0.22 * v, attack: 0.001, pan: o.pan });
      a.noise({ dur: 0.12, vol: 0.2 * v, filter: 'highpass', freq: 3500, pan: o.pan });
      a.tone({ freq: 2200 * p, to: 3400 * p, dur: 0.05, type: 'triangle', vol: 0.08 * v, delay: 0.03, pan: o.pan });
    },
    // being wrapped in a bubble: soft rising bloop
    bloop: (a, o) => {
      a.tone({ freq: 300, to: 760, dur: 0.14, type: 'sine', vol: 0.2 * (o.vol ?? 1), attack: 0.004, pan: o.pan });
      a.tone({ freq: 900, to: 1500, dur: 0.1, type: 'sine', vol: 0.08, delay: 0.07, pan: o.pan });
    },
    // a soap dish blowing a bubble
    blow: (a, o) => {
      const v = o.vol ?? 1;
      a.noise({ dur: 0.18, vol: 0.06 * v, filter: 'bandpass', freq: 2200, to: 3400, q: 2, pan: o.pan });
      a.tone({ freq: 520, to: 880, dur: 0.1, type: 'sine', vol: 0.07 * v, pan: o.pan });
    },
    plink: (a, o) => a.tone({ freq: 1500 * (o.pitch || 1), to: 900 * (o.pitch || 1), dur: 0.12, type: 'sine', vol: 0.3 * (o.vol ?? 1), attack: 0.002 }),
  },
  music: {
    bpm: 78, key: 'A', scale: 'lydian', progression: [1, 2, 1, 5], swing: 0.08, reverb: 0.55,
    pad: { wave: 'sine', vol: 0.5, octave: 3, cutoff: 1800, attack: 1.5 },
    bass: { wave: 'sine', vol: 0.45, octave: 2, pattern: 'x...x...' },
    arp: { wave: 'triangle', vol: 0.26, octave: 5, pattern: [0, 2, 1, 3, 2, 1], rate: 2, decay: 0.45 },
    lead: { wave: 'sine', vol: 0.2, octave: 5, density: 0.2, decay: 0.9 },
    drips: { vol: 0.35, density: 0.35 },
  },
  levels,
};
