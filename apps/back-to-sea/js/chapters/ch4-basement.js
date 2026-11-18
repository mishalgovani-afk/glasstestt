// Chapter 4 — The Basement. Mechanic: valves & rising water.
//
//  - V valve wheels: JUMP while touching one to turn it. It toggles a named link; tanks (T) and
//    gates (G) watching that link move smoothly (water rises row by row, doors slide). Some valves
//    are on timers and drift back; every valve toggles both ways, and a faint restores the valve
//    state saved at the last checkpoint, so the fish can never get permanently stuck.
//  - D leaking pipes (refill spot), Y steam vents (timed hazard), `^` scalding pipes, `=` shelves.
//  - Validator: levels show the initial state; each valve declares which stand cells it opens
//    (props.opens -> trusted `from` edges, see ch4/entities.js). tests/ch4.test.mjs re-verifies
//    every claim in the valves-ON map, so the claims are physically real.
//
// Art lives in ch4/art.js, entities in ch4/entities.js, pure logic in ch4/logic.js.
import { Valve, Tank, Gate, DripPipe, Vent, reach } from './ch4/entities.js';
import { P, drawBackground, drawSolidTile, drawOneWayTile, drawHazard, drawDecor, drawForeground } from './ch4/art.js';
import { levels } from './ch4/levels.js';

export default {
  id: 'basement', number: 4,
  title: 'The Basement', subtitle: 'Down in the pipes',
  mechanic: { name: 'Valves & rising water', hint: 'Stop at a valve wheel and JUMP to turn it: the water rises or falls.' },
  palette: P,
  drawBackground, drawSolidTile, drawOneWayTile, drawHazard, drawDecor, drawForeground,
  entities: { V: Valve, T: Tank, G: Gate, D: DripPipe, Y: Vent },
  reach,
  sfx: {
    clank: (a, o) => {
      const p = o.pitch || 1;
      a.tone({ freq: 210 * p, to: 120 * p, dur: 0.28, type: 'square', vol: 0.16 * (o.vol ?? 1), attack: 0.002, filter: 'lowpass', cutoff: 1400 });
      a.tone({ freq: 880 * p, to: 640 * p, dur: 0.18, type: 'triangle', vol: 0.14 * (o.vol ?? 1), attack: 0.001 });
      a.tone({ freq: 1320 * p, dur: 0.1, type: 'sine', vol: 0.06, attack: 0.001, delay: 0.03 });
    },
    creak: (a, o) => { a.tone({ freq: 300, to: 180, dur: 0.5, type: 'sawtooth', vol: 0.07 * (o.vol ?? 1), attack: 0.05, filter: 'bandpass', cutoff: 700, q: 6 }); },
    rumble: (a, o) => { a.noise({ dur: 0.7, vol: 0.2 * (o.vol ?? 1), filter: 'lowpass', freq: 160, to: 90, attack: 0.1 }); a.tone({ freq: 52, to: 44, dur: 0.7, type: 'sine', vol: 0.12 * (o.vol ?? 1), attack: 0.1 }); },
    hiss: (a, o) => { a.noise({ dur: 0.55, vol: 0.16 * (o.vol ?? 1), filter: 'highpass', freq: 3200, attack: 0.04 }); },
    tick: (a) => { a.tone({ freq: 1500, dur: 0.05, type: 'square', vol: 0.06, attack: 0.001 }); },
    plink: (a, o) => a.tone({ freq: 1100 * (o.pitch || 1), to: 700 * (o.pitch || 1), dur: 0.14, type: 'sine', vol: 0.28 * (o.vol ?? 1), attack: 0.002 }),
  },
  music: {
    bpm: 66, key: 'D', scale: 'minor', progression: [1, 6, 4, 5], swing: 0, reverb: 0.65,
    pad: { wave: 'sawtooth', vol: 0.22, octave: 2, cutoff: 520, attack: 2.2 },
    bass: { wave: 'sine', vol: 0.5, octave: 1, pattern: 'x.....x.' },
    arp: { wave: 'triangle', vol: 0.12, octave: 4, pattern: [0, 2, 1, 2], rate: 1, decay: 0.8, cutoff: 1800 },
    lead: { wave: 'sine', vol: 0.14, octave: 5, density: 0.1, decay: 1.4 },
    drips: { vol: 0.4, density: 0.4 },
    noise: { vol: 0.1, cutoff: 380 },
  },
  levels,
};
