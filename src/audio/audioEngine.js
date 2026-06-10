import { Ev } from "../core/types.js";

// All sound is synthesized with WebAudio (no external/copyrighted assets).
// BGM: a laid-back, swung acid-jazz groove. SFX: mecha/mobile-suit flavored
// one-shots driven by the engine's event stream.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this.lookahead = 0.1;
    this.step16 = 0;
    this.nextNoteTime = 0;
    this.bpm = 92; // relaxed groove
  }

  start() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;

    // master glue compressor -> destination
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    // warm master lowpass for the mellow jazz tone
    this.warm = ctx.createBiquadFilter();
    this.warm.type = "lowpass";
    this.warm.frequency.value = 5200;
    this.warm.connect(this.master);

    // music dry bus
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.3;
    this.musicGain.connect(this.warm);

    // reverb send (generated impulse) for space/richness
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(2.4, 2.6);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.28;
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.master);

    // tempo-synced feedback delay send (jazzy echoes)
    this.delay = ctx.createDelay(1.0);
    this.delay.delayTime.value = 60 / this.bpm / 2; // dotted-ish 8th feel
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.32;
    this.delayReturn = ctx.createGain();
    this.delayReturn.gain.value = 0.2;
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.delayReturn);
    this.delayReturn.connect(this.warm);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);

    // dedicated short, bright plate reverb for SFX so the mecha one-shots have
    // real body/space (separate from the long musical reverb).
    this.sfxVerb = ctx.createConvolver();
    this.sfxVerb.buffer = this._makeImpulse(0.7, 3.4);
    this.sfxVerbReturn = ctx.createGain();
    this.sfxVerbReturn.gain.value = 0.22;
    this.sfxGain.connect(this.sfxVerb);
    this.sfxVerb.connect(this.sfxVerbReturn);
    this.sfxVerbReturn.connect(this.master);

    this.started = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this._timer = setInterval(() => this._scheduler(), 25);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
  }

  setPaused(p) {
    if (!this.ctx) return;
    if (p) this.ctx.suspend();
    else this.ctx.resume();
  }

  // Generated exponential-decay noise impulse for the reverb convolver.
  _makeImpulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  setDanger(on) {
    // brighten the filter + nudge tempo feel when in danger
    if (!this.warm) return;
    this.warm.frequency.setTargetAtTime(on ? 8500 : 5200, this.ctx.currentTime, 0.3);
    this.bpm = on ? 104 : 92;
  }

  consumeEvents(events) {
    if (!this.started) return;
    for (const e of events) {
      switch (e.type) {
        case Ev.CURSOR_MOVE:
          this.sfx("cursor");
          break;
        case Ev.SWAP:
          this.sfx("swap");
          break;
        case Ev.POP:
          // staggered shatter — pitch rises through the group for a tinkle
          this.sfx("pop", e.index);
          break;
        case Ev.MATCH:
          this.sfx("beam", e.count);
          break;
        case Ev.CHAIN_LINK:
          this.sfx("chain", e.chain);
          break;
        case Ev.COMBO:
          this.sfx("lockon", e.count);
          break;
        case Ev.RAISE:
          this.sfx("raise");
          break;
        case Ev.LEVEL_UP:
          this.sfx("levelup");
          break;
        case Ev.DANGER:
          this.setDanger(e.on);
          if (e.on) this.sfx("alarm");
          break;
        case Ev.TOP_OUT:
          this.sfx("down");
          break;
      }
    }
  }

  // ---- SFX synthesis --------------------------------------------------
  sfx(kind, n = 1) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime;
    switch (kind) {
      case "cursor":
        // soft electronic tick with a tiny metallic ring
        this._blip(t, 920, 0.035, 0.1, "square");
        this._partial(t, 1840, 0.05, 0.04, "sine");
        break;
      case "swap": {
        // heavy servo/relay clack: noisy transient + detuned metal body + thunk
        this._noise(t, 0.045, 0.28, 2600, "highpass", 0.4);
        this._partial(t, 300, 0.09, 0.16, "sawtooth", 0.5);
        this._partial(t, 452, 0.08, 0.1, "square", 0.5);
        this._sweep(t + 0.01, 620, 360, 0.07, 0.12, "triangle");
        break;
      }
      case "pop": {
        // crisp shatter of one armor plate: bright metallic ping + debris
        const f = 720 + Math.min(n, 12) * 70;
        this._partial(t, f, 0.09, 0.12, "triangle", 0.5);
        this._partial(t, f * 1.5, 0.07, 0.06, "sine", 0.5);
        this._noise(t, 0.06, 0.12, 4200, "highpass", 0.3);
        break;
      }
      case "beam": {
        // mobile-suit beam discharge: bright detuned saw zap + air burst,
        // brighter & longer for bigger clears, with a metallic ring tail
        const f0 = 1500 + n * 130;
        this._sweep(t, f0, f0 * 0.32, 0.22, 0.26, "sawtooth", 0.5);
        this._sweep(t, f0 * 1.005, f0 * 0.33, 0.22, 0.16, "square", 0.5);
        this._noise(t, 0.1, 0.16, 3400, "bandpass", 0.4);
        this._partial(t + 0.04, 2400 + n * 80, 0.28, 0.06, "sine", 0.7);
        break;
      }
      case "chain": {
        // rising power-up charge that climbs with chain depth (wet tail)
        const base = 300 + Math.min(n, 12) * 95;
        this._sweep(t, base, base * 2.5, 0.26, 0.3, "square", 0.4);
        this._sweep(t, base * 0.5, base * 1.25, 0.26, 0.16, "sawtooth", 0.4);
        this._partial(t + 0.05, base * 3, 0.3, 0.07, "sine", 0.8);
        break;
      }
      case "lockon":
        // triple targeting beep, each layered with its octave
        for (let i = 0; i < 3; i++) {
          this._blip(t + i * 0.06, 1200 + i * 220, 0.04, 0.16, "square");
          this._partial(t + i * 0.06, 2400 + i * 440, 0.05, 0.05, "sine");
        }
        break;
      case "raise":
        // hydraulic armor slide: filtered noise whoosh + low ramp
        this._noise(t, 0.16, 0.14, 700, "bandpass", 0.2, 900);
        this._sweep(t, 180, 360, 0.14, 0.16, "triangle");
        break;
      case "levelup":
        [0, 0.08, 0.16].forEach((d, i) => {
          this._blip(t + d, 600 + i * 300, 0.1, 0.18, "triangle");
          this._partial(t + d, 1200 + i * 600, 0.12, 0.05, "sine", 0.6);
        });
        break;
      case "alarm":
        // two-tone klaxon with a buzzy edge
        for (const d of [0, 0.16]) {
          this._partial(t + d, 760, 0.13, 0.16, "square", 0.3);
          this._partial(t + d, 764, 0.13, 0.1, "sawtooth", 0.3);
        }
        break;
      case "down":
        // system shutdown: long detuned descend + debris noise + low boom
        this._sweep(t, 620, 58, 0.8, 0.4, "sawtooth", 0.45);
        this._sweep(t, 610, 52, 0.8, 0.26, "square", 0.45);
        this._noise(t, 0.6, 0.2, 1100, "lowpass", 0.5);
        this._partial(t, 90, 0.7, 0.3, "sine");
        break;
    }
  }

  // `send` (0..1) routes a copy of the voice to the SFX reverb for space.
  _env(node, t, attack, dur, peak, send = 0) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    node.connect(g);
    g.connect(this.sfxGain);
    if (send > 0 && this.sfxVerb) {
      const sg = this.ctx.createGain();
      sg.gain.value = send;
      g.connect(sg);
      sg.connect(this.sfxVerb);
    }
    return g;
  }

  _blip(t, freq, dur, peak, type = "square", send = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    this._env(o, t, 0.005, dur, peak, send);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // A single sustained partial (used to stack metallic overtones / rings).
  _partial(t, freq, dur, peak, type = "sine", send = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    this._env(o, t, 0.004, dur, peak, send);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _sweep(t, f0, f1, dur, peak, type = "sawtooth", send = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this._env(o, t, 0.006, dur, peak, send);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(t, dur, peak, cutoff, type = "bandpass", send = 0, sweepTo = null) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(cutoff, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = 1.2;
    src.connect(f);
    this._env(f, t, 0.005, dur, peak, send);
    src.start(t);
    src.stop(t + dur);
  }

  // ---- BGM: swung acid-jazz groove -----------------------------------
  // A ii–V–I–vi turnaround in C, one chord per bar, with a walking-ish bass,
  // Rhodes-y stabs and swung closed hats.
  _scheduler() {
    if (!this.started) return;
    while (this.nextNoteTime < this.ctx.currentTime + this.lookahead) {
      this._scheduleStep(this.step16, this.nextNoteTime);
      const secPer16 = 60 / this.bpm / 4;
      // swing: lengthen on-beats, shorten off-beats
      const swing = this.step16 % 2 === 0 ? 1.12 : 0.88;
      this.nextNoteTime += secPer16 * swing;
      this.step16 = (this.step16 + 1) % 64; // 4 bars of 16
    }
  }

  _scheduleStep(step, time) {
    if (this.muted) return;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const sec16 = 60 / this.bpm / 4;
    // ii–V–I–vi in C with 9th/13th color tones
    const roots = [50, 43, 48, 45];
    const chords = [
      [50, 53, 57, 60, 64], // Dm9
      [43, 47, 53, 57, 62], // G13
      [48, 52, 55, 59, 62], // Cmaj9
      [45, 48, 52, 55, 59], // Am9
    ];
    const root = roots[bar];
    const chord = chords[bar];

    // lush sustained pad at the top of each bar (through reverb)
    if (s === 0) this._pad(chord, time, sec16 * 16);

    // walking-ish bass
    if (s === 0) this._bass(this._m2f(root - 12), time, 0.42);
    else if (s === 4) this._bass(this._m2f(root - 12 + 3), time, 0.24);
    else if (s === 8) this._bass(this._m2f(root - 12 + 7), time, 0.3);
    else if (s === 11) this._bass(this._m2f(root - 12 + 10), time, 0.22);
    else if (s === 14) this._bass(this._m2f(root - 12 + 5), time, 0.2);

    // Rhodes comping stabs on the off-beats
    if (s === 2 || s === 7 || s === 10 || s === 13) {
      for (const m of chord) this._rhodes(this._m2f(m), time, 0.09);
    }

    // sparse arpeggio lead in the upper octave (every other bar), through delay
    if (s % 2 === 1 && bar % 2 === 1) {
      const note = chord[(s >> 1) % chord.length] + 12;
      this._arp(this._m2f(note), time, 0.07);
    }

    // swung closed hats + backbeat snare + kick
    if (s % 2 === 0) this._hat(time, s % 4 === 0 ? 0.1 : 0.06);
    if (s === 4 || s === 12) this._snare(time);
    if (s === 0 || s === 6 || s === 10) this._kick(time);
  }

  _pad(chordMidi, t, dur) {
    for (const m of chordMidi) {
      for (const det of [-0.08, 0.08]) {
        const o = this.ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = this._m2f(m - 12) * (1 + det / 12);
        const f = this.ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 1400;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.018, t + 0.4);
        g.gain.setValueAtTime(0.018, t + dur - 0.4);
        g.gain.linearRampToValueAtTime(0.0008, t + dur);
        o.connect(f);
        f.connect(g);
        g.connect(this.musicGain);
        g.connect(this.reverb);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  _arp(freq, t, peak) {
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g);
    g.connect(this.musicGain);
    g.connect(this.delay);
    o.start(t);
    o.stop(t + 0.3);
  }

  _snare(t) {
    const len = Math.floor(this.ctx.sampleRate * 0.18);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    g.connect(this.reverb);
    src.start(t);
    src.stop(t + 0.18);
  }

  _m2f(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  _bass(freq, t, peak) {
    const o = this.ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.34);
  }

  _rhodes(freq, t, peak) {
    // simple 2-op FM for an electric-piano timbre
    const carrier = this.ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = freq;
    const mod = this.ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = freq * 2;
    const modGain = this.ctx.createGain();
    modGain.gain.value = freq * 1.2;
    mod.connect(modGain);
    modGain.connect(carrier.frequency);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    carrier.connect(g);
    g.connect(this.musicGain);
    g.connect(this.reverb);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + 0.52);
    mod.stop(t + 0.52);
  }

  _hat(t, peak) {
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.value = peak;
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(t);
    src.stop(t + 0.05);
  }

  _kick(t) {
    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.2);
  }
}
