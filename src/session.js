// session.js - A "session" wraps a running mode: it owns the engine(s) and
// renderer(s), advances them one 60Hz step at a time, and reports a result.
// The app loop just calls stepFrame()/render() and reads .finished/.result.

import { Engine } from "./core/engine.js";
import { Renderer } from "./render/renderer.js";
import { CpuPlayer } from "./ai/cpuPlayer.js";
import { queueGarbage } from "./core/garbage.js";
import { Ev } from "./core/types.js";

const seed32 = () => (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;

// Endless or Time-Attack (sprint to a target score).
export class SingleSession {
  constructor({ canvas, audio, input, mode, target = 0 }) {
    this.mode = mode;
    this.target = target;
    this.audio = audio;
    this.input = input;
    this.engine = new Engine(seed32(), { startRows: 6 });
    this.renderer = new Renderer(canvas, this.engine, {
      primary: true,
      showOverlays: false, // result is shown via the DOM result screen
      useTouchInset: true,
    });
    this.frames = 0;
    this.finished = false;
    this.result = null;
  }

  setPaused(p) {
    this.renderer.paused = p;
    this.audio.setPaused(p);
  }

  stepFrame(paused) {
    const cmds = this.input.drainFrameCommands();
    if (paused || this.finished) return;
    this.engine.tick(cmds);
    this.renderer.consumeEvents(this.engine.events);
    this.audio.consumeEvents(this.engine.events);
    this.frames++;

    if (this.mode === "sprint" && !this.engine.gameOver && this.engine.score >= this.target) {
      this.finished = true;
      this.result = { outcome: "clear", score: this.engine.score, frames: this.frames };
    } else if (this.engine.gameOver) {
      this.finished = true;
      this.result = { outcome: "over", score: this.engine.score, frames: this.frames };
    }
  }

  render() {
    this.renderer.draw();
  }

  hudHtml() {
    if (this.mode === "sprint") {
      return `<span>TARGET <b>${this.target}</b></span><span>TIME <b>${fmtTime(this.frames)}</b></span>`;
    }
    return "";
  }
}

// Versus CPU with garbage exchange. P1 = human, P2 = CPU.
export class VsSession {
  constructor({ canvas, audio, input, cpuReaction = 7 }) {
    this.audio = audio;
    this.input = input;
    const seed = seed32();
    this.p1 = new Engine(seed, { startRows: 6 });
    this.p2 = new Engine((seed ^ 0x9e3779b9) >>> 0, { startRows: 6 });
    this.cpu = new CpuPlayer(this.p2, { reaction: cpuReaction });
    const a = this._areas();
    this.rendP1 = new Renderer(canvas, this.p1, {
      primary: true, showOverlays: false, useTouchInset: true, label: "YOU", area: a.left,
    });
    this.rendP2 = new Renderer(canvas, this.p2, {
      primary: false, showOverlays: false, useTouchInset: true, label: "CPU", area: a.right,
    });
    this.frames = 0;
    this.finished = false;
    this.result = null;
    this._onResize = () => this._layout();
    window.addEventListener("resize", this._onResize);
  }

  _areas() {
    const W = window.innerWidth, H = window.innerHeight;
    return { left: { x: 0, y: 0, w: W / 2, h: H }, right: { x: W / 2, y: 0, w: W / 2, h: H } };
  }
  _layout() {
    const a = this._areas();
    this.rendP1.setArea(a.left);
    this.rendP2.setArea(a.right);
  }

  setPaused(p) {
    this.rendP1.paused = p;
    this.rendP2.paused = p;
    this.audio.setPaused(p);
  }

  stepFrame(paused) {
    const c1 = this.input.drainFrameCommands();
    if (paused || this.finished) return;
    const c2 = this.cpu.frame();
    this.p1.tick(c1);
    this.p2.tick(c2);
    // route outgoing garbage to the opponent
    this._route(this.p1, this.p2);
    this._route(this.p2, this.p1);
    this.rendP1.consumeEvents(this.p1.events);
    this.rendP2.consumeEvents(this.p2.events);
    this.audio.consumeEvents(this.p1.events); // only the human side drives SFX
    this.frames++;

    if (this.p1.gameOver || this.p2.gameOver) {
      this.finished = true;
      const win = this.p2.gameOver && !this.p1.gameOver;
      this.result = { outcome: win ? "win" : "lose", score: this.p1.score, frames: this.frames };
    }
  }

  _route(from, to) {
    for (const ev of from.events) {
      if (ev.type === Ev.SEND_GARBAGE) queueGarbage(to, ev.w, ev.h);
    }
  }

  render() {
    this.rendP1.draw();
    this.rendP2.draw();
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
  }

  hudHtml() {
    return `<span>VS CPU</span>`;
  }
}

// Attract-mode demo: a CPU plays itself behind the title/menu overlays.
export class DemoSession {
  constructor({ canvas }) {
    this.engine = new Engine(seed32(), { startRows: 7 });
    this.cpu = new CpuPlayer(this.engine, { reaction: 5 });
    this.renderer = new Renderer(canvas, this.engine, {
      primary: true, showOverlays: false, useTouchInset: false,
    });
  }
  stepFrame() {
    if (this.engine.gameOver) {
      // restart the demo on a fresh board
      this.engine = new Engine(seed32(), { startRows: 7 });
      this.cpu = new CpuPlayer(this.engine, { reaction: 5 });
      this.renderer.engine = this.engine;
      return;
    }
    const cmds = this.cpu.frame();
    this.engine.tick(cmds);
    this.renderer.consumeEvents(this.engine.events);
  }
  render() {
    this.renderer.draw();
  }
}

export function fmtTime(frames) {
  const totalMs = (frames / 60) * 1000;
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const cs = Math.floor((totalMs % 1000) / 10);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
