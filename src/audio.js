// audio.js - Rich, realistic synthesized sound engine (Web Audio API)
// Provides layered SFX (reverb + filters) and a looping BGM that shifts into
// a faster, tenser "panic" arrangement when the stack climbs dangerously high.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.bgmGain = null;
    this.reverb = null;
    this.enabled = true;
    this.bgmOn = true;
    this.panic = false;
    this._bgmTimer = null;
    this._bgmStep = 0;
    this._nextNoteTime = 0;
  }

  // Must be called from a user gesture to satisfy autoplay policies.
  resume() {
    if (!this.ctx) this._init();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  _init() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    // Convolution reverb gives the effects a real, spatial body.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._impulse(1.6, 2.2);
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.22;
    this.reverb.connect(reverbGain);
    reverbGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);
    this.sfxGain.connect(this.reverb);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.32;
    this.bgmGain.connect(this.master);

    if (this.bgmOn) this._startBgm();
  }

  // Generate a decaying-noise impulse response for the convolver.
  _impulse(seconds, decay) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ---- low-level voice helpers -------------------------------------------

  _tone({ type = "sine", freq, freq2, dur = 0.2, gain = 0.3, attack = 0.005,
          to = this.sfxGain, detune = 0 }) {
    const t = this._now();
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freq2) osc.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    if (detune) osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(to);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  _noise({ dur = 0.15, gain = 0.3, type = "bandpass", freq = 1200, q = 1,
           sweepTo = null, to = this.sfxGain }) {
    const t = this._now();
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(to);
    src.start(t);
    src.stop(t + dur);
  }

  // ---- public SFX --------------------------------------------------------

  cursorMove() {
    if (!this._ok()) return;
    this._tone({ type: "square", freq: 520, freq2: 640, dur: 0.06, gain: 0.12 });
  }

  // Mechanical clack: a filtered noise impact layered with a short metallic blip.
  swap() {
    if (!this._ok()) return;
    this._noise({ dur: 0.07, gain: 0.35, type: "highpass", freq: 2600 });
    this._tone({ type: "square", freq: 300, freq2: 180, dur: 0.09, gain: 0.18 });
    this._tone({ type: "triangle", freq: 900, freq2: 700, dur: 0.05, gain: 0.1 });
  }

  // Heavy mechanical thunk when a panel lands / locks into the stack.
  land() {
    if (!this._ok()) return;
    this._tone({ type: "sine", freq: 160, freq2: 70, dur: 0.18, gain: 0.4 });
    this._noise({ dur: 0.1, gain: 0.25, type: "lowpass", freq: 800 });
  }

  // Bright FM-ish chime; pitch climbs with chain depth for satisfying combos.
  clear(chain = 1) {
    if (!this._ok()) return;
    const base = 520 * Math.pow(1.18, Math.min(chain - 1, 10));
    this._tone({ type: "triangle", freq: base, freq2: base * 2, dur: 0.32, gain: 0.3 });
    this._tone({ type: "sine", freq: base * 2.01, dur: 0.32, gain: 0.18 });
    this._tone({ type: "sine", freq: base * 3.0, dur: 0.22, gain: 0.1 });
    this._noise({ dur: 0.25, gain: 0.12, type: "bandpass", freq: base * 3, q: 6 });
  }

  // Extra fanfare layered on top of clear() for chains of 2+.
  chain(level) {
    if (!this._ok()) return;
    const base = 660 * Math.pow(1.12, level);
    for (let i = 0; i < 3; i++) {
      const f = base * (1 + i * 0.5);
      setTimeout(() => this._tone({
        type: "triangle", freq: f, freq2: f * 1.5, dur: 0.18, gain: 0.16,
      }), i * 55);
    }
  }

  // Rising hydraulic whoosh for the manual RAISE action.
  raise() {
    if (!this._ok()) return;
    this._noise({ dur: 0.3, gain: 0.22, type: "bandpass", freq: 400, sweepTo: 2400, q: 2 });
    this._tone({ type: "sawtooth", freq: 110, freq2: 330, dur: 0.3, gain: 0.12 });
  }

  warn() {
    if (!this._ok()) return;
    this._tone({ type: "square", freq: 880, freq2: 740, dur: 0.12, gain: 0.2 });
  }

  gameover() {
    if (!this._ok()) return;
    this._tone({ type: "sawtooth", freq: 440, freq2: 70, dur: 1.2, gain: 0.35 });
    this._tone({ type: "sawtooth", freq: 437, freq2: 68, dur: 1.2, gain: 0.25, detune: -12 });
    this._noise({ dur: 0.9, gain: 0.18, type: "lowpass", freq: 1200, sweepTo: 200 });
  }

  // ---- BGM ---------------------------------------------------------------

  setPanic(on) {
    if (this.panic === on) return;
    this.panic = on;
  }

  toggleBgm(on) {
    this.bgmOn = on;
    if (!this.ctx) return;
    if (on) this._startBgm();
    else this._stopBgm();
  }

  _startBgm() {
    if (this._bgmTimer) return;
    this._bgmStep = 0;
    this._nextNoteTime = this._now() + 0.1;
    this._bgmTimer = setInterval(() => this._scheduleBgm(), 25);
  }

  _stopBgm() {
    if (this._bgmTimer) {
      clearInterval(this._bgmTimer);
      this._bgmTimer = null;
    }
  }

  // Look-ahead scheduler. The panic flag transposes the line up and speeds it
  // up, recreating the Panel de Pon "the stack is too high!" tension.
  _scheduleBgm() {
    if (!this.ctx) return;
    const bass = [0, 0, 7, 7, 5, 5, 3, 3];
    const lead = [12, 16, 19, 16, 14, 17, 19, 22, 12, 16, 19, 24, 17, 14, 12, 7];
    const rootHz = 130.81; // C3
    const tempo = this.panic ? 0.115 : 0.16;
    while (this._nextNoteTime < this._now() + 0.2) {
      const i = this._bgmStep;
      const transpose = this.panic ? 5 : 0;
      const leadSemi = lead[i % lead.length] + transpose;
      const bassSemi = bass[i % bass.length] + transpose;
      this._bgmNote(rootHz * Math.pow(2, leadSemi / 12), this._nextNoteTime,
        tempo * 0.9, this.panic ? "sawtooth" : "triangle", 0.16);
      if (i % 2 === 0) {
        this._bgmNote(rootHz * 0.5 * Math.pow(2, bassSemi / 12), this._nextNoteTime,
          tempo * 1.8, "square", 0.13);
      }
      this._nextNoteTime += tempo;
      this._bgmStep = (this._bgmStep + 1) % 64;
    }
  }

  _bgmNote(freq, when, dur, type, gain) {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(this.bgmGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  _ok() {
    return this.enabled && this.ctx;
  }
}
