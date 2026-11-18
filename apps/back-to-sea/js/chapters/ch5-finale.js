// Chapter 5 — The Storm Drain: a short, rainy approach through the garage (5-1), then the boss,
// Smudge the garage cat, guarding the storm-drain grate (5-2), then the ending at sea.
//
//   ch5/levels.js    maps                ch5/art.js     garage art (background, tiles, decor, rain)
//   ch5/cat.js       procedural cat      ch5/entities.js leaks, can, bubbles, current, valves, boss
//   ch5/fight.js     pure phase logic    ch5/ending.js  drain ride + sunset sea + credits
//
// The boss fight uses only MOVE + JUMP, each phase leaning on an earlier chapter's mechanic:
//   1. puddles & drips: splash-hop up to the watering can and land on it to soak Smudge's head;
//   2. bubbles & currents: ride a bubble over him and pop onto his nose, or dash through the
//      gutter stream into him;
//   3. valves: turn the hose valve (floods the floor), leap from the flood to the water-main valve.
// A faint resets only the current phase. The exit is locked (props) until Smudge is beaten.
// Debug: ?level=5-2&phase=2|3.

import { levels } from './ch5/levels.js';
import { P, drawBackground, drawSolidTile, drawOneWayTile, drawDecor, drawHazard, drawForeground } from './ch5/art.js';
import { Leak, CatEyes, CatBoss, WateringCan, SoapBottle, GutterCurrent, Valve, reach } from './ch5/entities.js';
import { ending } from './ch5/ending.js';

const v = (o, k = 1) => (o.vol ?? 1) * k;
const pt = (o) => o.pitch || 1;

export default {
  id: 'finale', number: 5,
  title: 'The Storm Drain', subtitle: 'Rain, a grate, and a cat',
  mechanic: { name: 'Everything you learned', hint: 'Puddles, bubbles, currents and valves: use them all to get past the cat.' },
  palette: P,
  drawBackground, drawSolidTile, drawOneWayTile, drawDecor, drawHazard, drawForeground,
  entities: { L: Leak, Y: CatEyes, K: CatBoss, W: WateringCan, B: SoapBottle, G: GutterCurrent, V: Valve },
  reach,
  sfx: {
    plink5: (a, o) => a.tone({ freq: 1400 * pt(o), to: 850 * pt(o), dur: 0.1, type: 'sine', vol: 0.25 * v(o), attack: 0.002, pan: o.pan }),
    hiss: (a, o) => a.noise({ dur: 0.55, vol: 0.32 * v(o), filter: 'highpass', freq: 3200, attack: 0.03, pan: o.pan }),
    growl: (a, o) => {
      a.tone({ freq: 70, to: 58, dur: 0.7, type: 'sawtooth', vol: 0.16 * v(o), attack: 0.08, filter: 'lowpass', cutoff: 380, pan: o.pan });
      a.tone({ freq: 74, to: 62, dur: 0.7, type: 'sawtooth', vol: 0.12 * v(o), attack: 0.1, filter: 'lowpass', cutoff: 300, detune: 18, pan: o.pan });
    },
    yowl: (a, o) => {
      const p = pt(o);
      a.tone({ freq: 420 * p, to: 880 * p, dur: 0.22, type: 'sawtooth', vol: 0.18 * v(o), attack: 0.02, filter: 'lowpass', cutoff: 2400, pan: o.pan });
      a.tone({ freq: 880 * p, to: 360 * p, dur: 0.5, type: 'sawtooth', vol: 0.16 * v(o), delay: 0.2, filter: 'lowpass', cutoff: 2000, pan: o.pan });
      a.noise({ dur: 0.4, vol: 0.12 * v(o), filter: 'bandpass', freq: 2500, q: 2, delay: 0.1, pan: o.pan });
    },
    swipe: (a, o) => a.noise({ dur: 0.18, vol: 0.35 * v(o), filter: 'bandpass', freq: 900 * pt(o), to: 3200 * pt(o), q: 1.4, pan: o.pan }),
    thud: (a, o) => { a.tone({ freq: 90, to: 40, dur: 0.3, type: 'sine', vol: 0.5 * v(o), pan: o.pan }); a.noise({ dur: 0.15, vol: 0.2 * v(o), filter: 'lowpass', freq: 500, pan: o.pan }); },
    pour: (a, o) => a.noise({ dur: 0.9, vol: 0.22 * v(o), filter: 'bandpass', freq: 1400, to: 700, q: 0.8, attack: 0.05, pan: o.pan }),
    clank: (a, o) => { a.tone({ freq: 620 * pt(o), dur: 0.18, type: 'square', vol: 0.08 * v(o), filter: 'bandpass', cutoff: 1500, pan: o.pan }); a.tone({ freq: 930 * pt(o), dur: 0.12, type: 'triangle', vol: 0.1 * v(o), pan: o.pan }); },
    pop5: (a, o) => a.tone({ freq: 700 * pt(o), to: 1700 * pt(o), dur: 0.07, type: 'sine', vol: 0.35 * v(o), attack: 0.002, pan: o.pan }),
    dash5: (a, o) => { a.noise({ dur: 0.35, vol: 0.3 * v(o), filter: 'bandpass', freq: 600, to: 2400, q: 1.2, pan: o.pan }); a.tone({ freq: 300, to: 700, dur: 0.2, type: 'triangle', vol: 0.15 * v(o), pan: o.pan }); },
    boing: (a, o) => a.tone({ freq: 240, to: 520, dur: 0.25, type: 'triangle', vol: 0.3 * v(o), pan: o.pan }),
    valve5: (a, o) => { for (let i = 0; i < 4; i++) a.tone({ freq: 300 + i * 40, dur: 0.08, type: 'square', vol: 0.06 * v(o), delay: i * 0.09, filter: 'bandpass', cutoff: 1200, pan: o.pan }); },
    gush: (a, o) => a.noise({ dur: 2.2, vol: 0.35 * v(o), filter: 'lowpass', freq: 1800, to: 900, attack: 0.08, pan: o.pan }),
    thunder: (a, o) => { a.noise({ dur: 2.4, vol: 0.4 * v(o), filter: 'lowpass', freq: 400, to: 120, attack: 0.01 }); a.noise({ dur: 0.3, vol: 0.25 * v(o), filter: 'highpass', freq: 2000 }); },
    sneeze: (a, o) => { a.noise({ dur: 0.25, vol: 0.2 * v(o), filter: 'bandpass', freq: 1800, q: 1, pan: o.pan }); a.noise({ dur: 0.12, vol: 0.4 * v(o), filter: 'highpass', freq: 2500, delay: 0.28, pan: o.pan }); },
  },
  music: {
    bpm: 92, key: 'E', scale: 'minor', progression: [1, 6, 4, 5], swing: 0.05, reverb: 0.45,
    pad: { wave: 'triangle', vol: 0.36, octave: 3, cutoff: 1000, attack: 1.2 },
    bass: { wave: 'sine', vol: 0.5, octave: 2, pattern: 'x...x.x.' },
    arp: { wave: 'sine', vol: 0.18, octave: 4, pattern: [0, 2, 1, 2], rate: 2, decay: 0.3 },
    drips: { vol: 0.4, density: 0.4 },
    noise: { vol: 0.22, cutoff: 1100 },
  },
  levels,
  ending,
};
