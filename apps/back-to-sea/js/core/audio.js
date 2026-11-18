// WebAudio: synthesized SFX + a small generative music engine. DOM-free at import time; the
// AudioContext is created by unlock(), which main.js calls from the first user gesture.
//
// SFX:   audio.sfx(name, { vol, pitch, pan, delay })
//        audio.register(name, (a, opts) => { a.tone({...}); a.noise({...}); })
//        Chapters list theirs in `sfx: { name: fn }` on the chapter module (registered on load).
// Synth helper `a` passed to SFX functions:
//   a.tone({ freq, to?, dur, type='sine', vol=0.3, attack=0.005, release?, delay=0, pan=0,
//            filter?, cutoff?, q?, detune? })      one oscillator with an envelope (+pitch slide)
//   a.noise({ dur, vol=0.2, filter='bandpass', freq=1200, to?, q=1, delay=0, attack=0.005, pan=0 })
//   a.chord([f1,f2,...], opts)                    several tones at once
//   a.ctx, a.now, a.out                           raw access for anything fancier
// Music: audio.setMusic(schema) — see DESIGN.md "Music schema". audio.tick() is called each frame.

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9], minorPentatonic: [0, 3, 5, 7, 10],
};
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.registry = new Map(Object.entries(BUILTIN_SFX));
    this.music = null;
    this._lastPlay = new Map();
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  /** Create/resume the AudioContext. Call from a user gesture. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
        this.master.connect(comp); comp.connect(ctx.destination);
        this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.8; this.sfxBus.connect(this.master);
        this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.42; this.musicBus.connect(this.master);
        this.reverb = ctx.createConvolver(); this.reverb.buffer = makeImpulse(ctx, 2.4, 2.6);
        this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.3;
        this.reverbSend.connect(this.reverb); this.reverb.connect(this.master);
        this.noiseBuf = makeNoise(ctx, 2);
        this.helper = makeHelper(this);
        if (this._pendingMusic) { const m = this._pendingMusic; this._pendingMusic = null; this.setMusic(m); }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch { /* no audio */ }
  }

  suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch {} }
  resume() { try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch {} }

  setMuted(m) {
    this.muted = !!m;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, t, 0.05);
    }
  }

  register(name, fn) { this.registry.set(name, fn); }
  registerAll(map) { if (map) for (const [k, fn] of Object.entries(map)) this.register(k, fn); }

  sfx(name, opts = {}) {
    if (!this.ready || this.muted) return;
    const fn = this.registry.get(name);
    if (!fn) return;
    // rate-limit identical sounds (e.g. 20 drips landing in one frame)
    const now = this.ctx.currentTime, last = this._lastPlay.get(name) || 0;
    if (now - last < 0.03 && !opts.force) return;
    this._lastPlay.set(name, now);
    try { fn(this.helper, opts); } catch (e) { console.warn('sfx failed', name, e); }
  }

  // ------------------------------------------------------------------ music
  setMusic(schema) {
    if (!this.ctx) { this._pendingMusic = schema; return; }
    if (this.music && this.music.schema === schema) return;
    const t = this.ctx.currentTime;
    if (this.music) {
      const old = this.music;
      old.gain.gain.setTargetAtTime(0, t, 0.5);
      if (old.noiseSrc) try { old.noiseSrc.stop(t + 3); } catch {}
      setTimeout(() => { try { old.gain.disconnect(); } catch {} }, 4000);
    }
    this.music = null;
    if (!schema) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, t + 0.1, 0.8);
    gain.connect(this.musicBus);
    const send = this.ctx.createGain(); send.gain.value = schema.reverb ?? 0.35;
    gain.connect(send); send.connect(this.reverbSend);
    const m = { schema, gain, step: 0, next: t + 0.15, bar: 0 };
    if (schema.noise && schema.noise.vol) {
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = schema.noise.cutoff || 600;
      const g = this.ctx.createGain(); g.gain.value = 0.12 * schema.noise.vol;
      src.connect(f); f.connect(g); g.connect(gain); src.start();
      m.noiseSrc = src;
    }
    this.music = m;
  }

  /** Schedule upcoming music notes. Called every animation frame. */
  tick() {
    const m = this.music;
    if (!m || !this.ready) return;
    const S = m.schema;
    const spb = 60 / (S.bpm || 80);
    const stepDur = spb / 4; // 16th notes
    const horizon = this.ctx.currentTime + 0.35;
    if (m.next < this.ctx.currentTime - 1) m.next = this.ctx.currentTime + 0.05; // after a suspend
    while (m.next < horizon) {
      this._scheduleStep(m, m.step, m.next, stepDur);
      m.step++;
      m.next += stepDur;
    }
  }

  _scheduleStep(m, step, time, stepDur) {
    const S = m.schema;
    const scale = SCALES[S.scale] || SCALES.major;
    const root = 12 * 4 + (NOTE[S.key] ?? 0); // C4-based midi offset (48 = C3)
    const prog = S.progression && S.progression.length ? S.progression : [1];
    const inBar = step % 16;
    const bar = Math.floor(step / 16);
    const degree = (prog[bar % prog.length] || 1) - 1;
    const noteOf = (deg, oct) => {
      const n = scale.length;
      const d = ((deg % n) + n) % n, o = Math.floor(deg / n);
      return root + scale[d] + 12 * (o + oct - 3);
    };
    const chord = [noteOf(degree, 0), noteOf(degree + 2, 0), noteOf(degree + 4, 0)];
    const swing = (S.swing || 0) * stepDur * ((step % 4 === 2) ? 1 : 0);
    const t = time + swing;
    const H = this.helper, out = m.gain;
    if (inBar === 0 && S.pad) {
      const p = S.pad, oct = (p.octave ?? 3) - 3;
      const barDur = stepDur * 16;
      for (const n of chord) {
        for (const det of [-6, 6]) H.tone({ out, delay: t - this.ctx.currentTime, freq: midiHz(n + 12 * oct), dur: barDur * 1.05, type: p.wave || 'triangle', vol: 0.05 * (p.vol ?? 0.5), attack: p.attack ?? 1, release: 1.2, filter: 'lowpass', cutoff: p.cutoff || 1400, detune: det });
      }
    }
    if (S.bass) {
      const b = S.bass, pat = b.pattern || 'x.......';
      const per = 16 / pat.length;
      if (inBar % per === 0 && pat[(inBar / per) | 0] === 'x') {
        H.tone({ out, delay: t - this.ctx.currentTime, freq: midiHz(chord[0] + 12 * ((b.octave ?? 2) - 3)), dur: stepDur * 3, type: b.wave || 'sine', vol: 0.22 * (b.vol ?? 0.5), attack: 0.01, filter: 'lowpass', cutoff: 500 });
      }
    }
    if (S.arp) {
      const a = S.arp, rate = a.rate || 2, every = Math.max(1, Math.round(4 / rate));
      if (inBar % every === 0) {
        const pat = a.pattern || [0, 1, 2, 1];
        const i = pat[Math.floor(step / every) % pat.length];
        const n = i >= 3 ? chord[0] + 12 : chord[i] ?? chord[0];
        H.tone({ out, delay: t - this.ctx.currentTime, freq: midiHz(n + 12 * ((a.octave ?? 4) - 3)), dur: a.decay ?? 0.3, type: a.wave || 'sine', vol: 0.09 * (a.vol ?? 0.3), attack: 0.004, filter: 'lowpass', cutoff: a.cutoff || 3500 });
      }
    }
    if (S.lead && inBar % 4 === 0 && Math.random() < (S.lead.density ?? 0.2)) {
      const l = S.lead;
      const penta = [0, 1, 2, 4, 5].map((d) => d + degree);
      const n = noteOf(penta[(Math.random() * penta.length) | 0], (l.octave ?? 5) - 3);
      H.tone({ out, delay: t - this.ctx.currentTime, freq: midiHz(n), dur: l.decay ?? 0.8, type: l.wave || 'sine', vol: 0.07 * (l.vol ?? 0.25), attack: 0.01 });
      H.tone({ out, delay: t - this.ctx.currentTime, freq: midiHz(n) * 2.01, dur: (l.decay ?? 0.8) * 0.5, type: 'sine', vol: 0.02 * (l.vol ?? 0.25), attack: 0.01 });
    }
    if (S.drips && inBar % 2 === 0 && Math.random() < (S.drips.density ?? 0.2) * 0.5) {
      const f = 1400 + Math.random() * 1600;
      H.tone({ out, delay: t - this.ctx.currentTime + Math.random() * stepDur, freq: f, to: f * 0.6, dur: 0.09, type: 'sine', vol: 0.05 * (S.drips.vol ?? 0.3), attack: 0.002, pan: Math.random() * 1.6 - 0.8 });
    }
  }
}

function makeNoise(ctx, seconds) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function makeImpulse(ctx, seconds, decay) {
  const len = ctx.sampleRate * seconds;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

function makeHelper(audio) {
  const ctx = audio.ctx;
  const pan = (node, p) => {
    if (!p || !ctx.createStereoPanner) return node;
    const s = ctx.createStereoPanner(); s.pan.value = Math.max(-1, Math.min(1, p));
    node.connect(s); return s;
  };
  const H = {
    ctx,
    get now() { return ctx.currentTime; },
    get out() { return audio.sfxBus; },
    tone(o) {
      const t0 = ctx.currentTime + Math.max(0, o.delay || 0);
      const dur = o.dur ?? 0.2, att = o.attack ?? 0.005, rel = o.release ?? dur * 0.8;
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.freq || 440, t0);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
      if (o.detune) osc.detune.value = o.detune;
      const g = ctx.createGain();
      const v = Math.max(0.0001, o.vol ?? 0.3);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(v, t0 + att);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + att + Math.max(dur, 0.01) + rel * 0.2);
      let node = osc;
      if (o.filter) {
        const f = ctx.createBiquadFilter(); f.type = o.filter; f.frequency.value = o.cutoff || 1500; f.Q.value = o.q ?? 0.7;
        osc.connect(f); node = f;
      }
      node.connect(g);
      pan(g, o.pan).connect(o.out || audio.sfxBus);
      if (!o.out) { const s = ctx.createGain(); s.gain.value = 0.25; g.connect(s); s.connect(audio.reverbSend); }
      osc.start(t0); osc.stop(t0 + att + dur + rel * 0.2 + 0.05);
      return osc;
    },
    noise(o) {
      const t0 = ctx.currentTime + Math.max(0, o.delay || 0);
      const dur = o.dur ?? 0.2;
      const src = ctx.createBufferSource(); src.buffer = audio.noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = o.filter || 'bandpass'; f.Q.value = o.q ?? 1;
      f.frequency.setValueAtTime(o.freq || 1200, t0);
      if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + dur);
      const g = ctx.createGain();
      const v = Math.max(0.0001, o.vol ?? 0.2);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(v, t0 + (o.attack ?? 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g);
      pan(g, o.pan).connect(o.out || audio.sfxBus);
      if (!o.out) { const s = ctx.createGain(); s.gain.value = 0.2; g.connect(s); s.connect(audio.reverbSend); }
      src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.05);
      return src;
    },
    chord(freqs, o) { for (const f of freqs) H.tone({ ...o, freq: f }); },
  };
  return H;
}

// Built-in SFX. opts: { vol=1, pitch=1, pan=0 }
const BUILTIN_SFX = {
  splash(a, o) {
    const v = o.vol ?? 1, p = o.pitch || 1, pan = o.pan || 0;
    a.noise({ dur: 0.35, vol: 0.28 * v, filter: 'bandpass', freq: 1800 * p, to: 500, q: 0.8, pan });
    a.noise({ dur: 0.18, vol: 0.18 * v, filter: 'highpass', freq: 4000, pan });
    for (let i = 0; i < 3; i++) a.tone({ freq: (500 + Math.random() * 500) * p, to: (900 + Math.random() * 600) * p, dur: 0.06, vol: 0.08 * v, delay: 0.04 + i * 0.05 + Math.random() * 0.03, pan });
  },
  leap(a, o) {
    const v = o.vol ?? 1, p = o.pitch || 1;
    a.tone({ freq: 300 * p, to: 900 * p, dur: 0.16, type: 'sine', vol: 0.18 * v, pan: o.pan });
    a.noise({ dur: 0.2, vol: 0.14 * v, filter: 'bandpass', freq: 1200, to: 3000, pan: o.pan });
  },
  stroke(a, o) {
    a.noise({ dur: 0.16, vol: 0.12 * (o.vol ?? 1), filter: 'lowpass', freq: 700, to: 300, pan: o.pan });
    a.tone({ freq: 380 * (o.pitch || 1), to: 520, dur: 0.05, vol: 0.05 * (o.vol ?? 1), delay: 0.03 });
  },
  hop(a, o) {
    const p = o.pitch || 1;
    a.tone({ freq: 420 * p, to: 640 * p, dur: 0.07, type: 'triangle', vol: 0.15 * (o.vol ?? 1), pan: o.pan });
  },
  splashhop(a, o) {
    BUILTIN_SFX.hop(a, { ...o, pitch: 1.2 });
    a.noise({ dur: 0.22, vol: 0.18 * (o.vol ?? 1), filter: 'bandpass', freq: 2500, to: 900, pan: o.pan });
  },
  flop(a, o) {
    const v = o.vol ?? 1;
    a.tone({ freq: 160 * (o.pitch || 1), to: 80, dur: 0.08, type: 'sine', vol: 0.22 * v, pan: o.pan });
    a.noise({ dur: 0.06, vol: 0.1 * v, filter: 'lowpass', freq: 900, pan: o.pan });
  },
  drip(a, o) {
    const p = o.pitch || 1;
    a.tone({ freq: 1200 * p, to: 2400 * p, dur: 0.08, vol: 0.2 * (o.vol ?? 1), attack: 0.002 });
    a.tone({ freq: 1800 * p, to: 3200 * p, dur: 0.1, vol: 0.12 * (o.vol ?? 1), delay: 0.06, attack: 0.002 });
  },
  faint(a, o) {
    const v = o.vol ?? 1;
    [660, 520, 400, 300].forEach((f, i) => a.tone({ freq: f, to: f * 0.94, dur: 0.22, type: 'triangle', vol: 0.12 * v, delay: i * 0.13 }));
  },
  checkpoint(a, o) {
    const v = o.vol ?? 1;
    [784, 988, 1175, 1568].forEach((f, i) => a.tone({ freq: f, dur: 0.5, type: 'sine', vol: 0.09 * v, delay: i * 0.07, attack: 0.004 }));
  },
  exit(a, o) {
    const v = o.vol ?? 1;
    a.noise({ dur: 0.9, vol: 0.12 * v, filter: 'bandpass', freq: 400, to: 2400, q: 2 });
    [523, 659, 784, 1047, 1319].forEach((f, i) => a.tone({ freq: f, dur: 0.7, type: 'sine', vol: 0.09 * v, delay: 0.1 + i * 0.09 }));
  },
  ui(a, o) { a.tone({ freq: 880 * (o.pitch || 1), to: 1100 * (o.pitch || 1), dur: 0.04, type: 'sine', vol: 0.1 * (o.vol ?? 1) }); },
  bonk(a, o) { a.tone({ freq: 220, to: 140, dur: 0.06, type: 'square', vol: 0.05 * (o.vol ?? 1), filter: 'lowpass', cutoff: 800 }); },
  burn(a, o) {
    a.noise({ dur: 0.5, vol: 0.25 * (o.vol ?? 1), filter: 'highpass', freq: 2500 });
    a.tone({ freq: 500, to: 200, dur: 0.3, type: 'sawtooth', vol: 0.06, filter: 'lowpass', cutoff: 1200 });
  },
  gasp(a, o) { a.tone({ freq: 700, to: 560, dur: 0.07, type: 'triangle', vol: 0.06 * (o.vol ?? 1) }); },
  bubble(a, o) { const f = 600 + Math.random() * 500; a.tone({ freq: f, to: f * 1.8, dur: 0.05, vol: 0.06 * (o.vol ?? 1) }); },
};
