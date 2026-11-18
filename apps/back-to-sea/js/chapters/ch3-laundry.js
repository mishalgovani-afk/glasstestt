// Chapter 3 — The Laundry Room: Currents & spin.
//
// Mechanic: patches of water carry a current (animated chevrons, drift ~80 px/s, always swimmable
// upstream). JUMP inside a current is a DASH along its flow: a fast burst that can shoot you out of
// the water across a gap. The washing-machine drum's current ROTATES through 8 directions (one per
// second, arrow on the hub): time your jump.
//
// Honest reach rules (ch3/reach.js): every non-surface water cell of a current gets a simulated
// dash launch, built from the same dashLaunch() the game uses. Currents never cover surface cells,
// so the plain leap stays available at the top of every pool, and no current is ever stronger
// than your swim speed, so swimming upstream always works.
import { ENTITIES } from './ch3/entities.js';
import { reach } from './ch3/reach.js';
import { levels } from './ch3/levels.js';
import { P, drawBackground, drawSolidTile, drawHazard, drawDecor } from './ch3/art.js';

export default {
  id: 'laundry', number: 3,
  title: 'The Laundry Room', subtitle: 'Round and round',
  mechanic: { name: 'Currents & spin', hint: 'Currents push you. JUMP inside one to dash along the flow.' },
  palette: P,
  drawBackground, drawSolidTile, drawHazard, drawDecor,
  entities: ENTITIES,
  reach,
  sfx: {
    dash: (a, o) => {
      a.noise({ dur: 0.22, vol: 0.22 * (o.vol ?? 1), filter: 'bandpass', freq: 600, to: 2600, q: 1.2, attack: 0.01 });
      a.tone({ freq: 260, to: 720, dur: 0.16, type: 'triangle', vol: 0.18 * (o.vol ?? 1), attack: 0.005 });
    },
    tick: (a, o) => a.tone({ freq: 880, to: 700, dur: 0.05, type: 'square', vol: 0.05 * (o.vol ?? 1), attack: 0.002 }),
    plink: (a, o) => a.tone({ freq: 1500 * (o.pitch || 1), to: 900 * (o.pitch || 1), dur: 0.12, type: 'sine', vol: 0.3 * (o.vol ?? 1), attack: 0.002 }),
  },
  music: {
    bpm: 100, key: 'D', scale: 'dorian', progression: [1, 4, 1, 7], swing: 0.18, reverb: 0.32,
    pad: { wave: 'triangle', vol: 0.4, octave: 3, cutoff: 1200, attack: 0.8 },
    bass: { wave: 'triangle', vol: 0.5, octave: 2, pattern: 'x..x..x.' },
    arp: { wave: 'sine', vol: 0.28, octave: 4, pattern: [0, 1, 2, 1, 0, 2], rate: 3, decay: 0.25 },
    lead: { wave: 'triangle', vol: 0.14, octave: 5, density: 0.2, decay: 0.7 },
    drips: { vol: 0.22, density: 0.2 },
    noise: { vol: 0.05, cutoff: 500 },
  },
  levels,
};
