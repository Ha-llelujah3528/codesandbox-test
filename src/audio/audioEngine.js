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
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.34;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);

    // gentle master lowpass for a warm, mellow tone
    this.warm = this.ctx.createBiquadFilter();
    this.warm.type = "lowpass";
    this.warm.frequency.value = 5200;
    this.musicGain.disconnect();
    this.musicGain.connect(this.warm);
    this.warm.connect(this.master);

    this.started = true;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this._timer = setInterval(() => this._scheduler(), 25);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.85;
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
        this._blip(t, 880, 0.04, 0.12, "square");
        break;
      case "swap":
        this._blip(t, 320, 0.05, 0.2, "sawtooth");
        this._blip(t + 0.02, 520, 0.05, 0.15, "square");
        break;
      case "beam": {
        // beam-saber-ish descending zap, brighter for bigger clears
        const f0 = 1400 + n * 120;
        this._sweep(t, f0, f0 * 0.4, 0.18, 0.28, "sawtooth");
        this._noise(t, 0.08, 0.12, 3000);
        break;
      }
      case "chain": {
        // rising charge whose pitch climbs with chain depth
        const base = 300 + Math.min(n, 10) * 90;
        this._sweep(t, base, base * 2.4, 0.22, 0.32, "square");
        break;
      }
      case "lockon":
        for (let i = 0; i < 3; i++)
          this._blip(t + i * 0.06, 1200 + i * 200, 0.04, 0.18, "square");
        break;
      case "raise":
        this._sweep(t, 200, 380, 0.12, 0.18, "triangle");
        break;
      case "levelup":
        [0, 0.08, 0.16].forEach((d, i) =>
          this._blip(t + d, 600 + i * 300, 0.1, 0.2, "triangle")
        );
        break;
      case "alarm":
        this._blip(t, 760, 0.12, 0.16, "square");
        this._blip(t + 0.16, 760, 0.12, 0.16, "square");
        break;
      case "down":
        this._sweep(t, 600, 60, 0.7, 0.4, "sawtooth");
        this._noise(t, 0.5, 0.18, 1200);
        break;
    }
  }

  _env(node, t, attack, dur, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    node.connect(g);
    g.connect(this.sfxGain);
    return g;
  }

  _blip(t, freq, dur, peak, type = "square") {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    this._env(o, t, 0.005, dur, peak);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _sweep(t, f0, f1, dur, peak, type = "sawtooth") {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this._env(o, t, 0.006, dur, peak);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(t, dur, peak, cutoff) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = cutoff;
    src.connect(f);
    this._env(f, t, 0.005, dur, peak);
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
    // chord roots (MIDI): Dm7, G7, Cmaj7, Am7
    const roots = [50, 43, 48, 45];
    const chords = [
      [50, 53, 57, 60], // Dm7
      [43, 47, 50, 53], // G7
      [48, 52, 55, 59], // Cmaj7
      [45, 48, 52, 55], // Am7
    ];
    const root = roots[bar];
    const chord = chords[bar];

    // bass: root on 1, fifth/approach on 3 and the "and" of 4
    if (s === 0) this._bass(this._m2f(root - 12), time, 0.42);
    else if (s === 6) this._bass(this._m2f(root - 12 + 7), time, 0.3);
    else if (s === 11) this._bass(this._m2f(root - 12 + 5), time, 0.26);

    // Rhodes chord stabs on off-beats (jazzy comping)
    if (s === 2 || s === 7 || s === 10) {
      for (const m of chord) this._rhodes(this._m2f(m), time, 0.12);
    }

    // closed hats every 8th, swung
    if (s % 2 === 0) this._hat(time, s % 4 === 0 ? 0.1 : 0.06);
    // soft kick on 1 and the "and" of 2
    if (s === 0 || s === 6) this._kick(time);
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
