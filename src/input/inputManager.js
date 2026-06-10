import { move, swap, raiseDown, raiseUp } from "../core/commands.js";

// Translates keyboard + on-screen buttons into abstract commands, sampled once
// per logic frame so input timing stays deterministic and replay-safe.
const DAS_DELAY = 14; // frames before auto-repeat kicks in
const DAS_REPEAT = 5; // frames between repeats while held

const DIRS = {
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
};

export class InputManager {
  constructor() {
    this.dir = {
      left: { held: false, timer: 0 },
      right: { held: false, timer: 0 },
      up: { held: false, timer: 0 },
      down: { held: false, timer: 0 },
    };
    this.swapQueued = false;
    this.raiseHeld = false;
    this.lastRaise = false;
    this.onFirstInput = null;
    this._booted = false;
    this._bindKeyboard();
    this._bindTouch();
  }

  _boot() {
    if (this._booted) return;
    this._booted = true;
    if (this.onFirstInput) this.onFirstInput();
  }

  press(act) {
    this._boot();
    if (DIRS[act]) {
      const d = this.dir[act];
      if (!d.held) {
        d.held = true;
        d.timer = 0; // emit on next drain
      }
    } else if (act === "swap") {
      this.swapQueued = true;
    } else if (act === "raise") {
      this.raiseHeld = true;
    }
  }

  release(act) {
    if (DIRS[act]) this.dir[act].held = false;
    else if (act === "raise") this.raiseHeld = false;
  }

  // Called once per logic frame.
  drainFrameCommands() {
    const cmds = [];
    for (const name of Object.keys(DIRS)) {
      const d = this.dir[name];
      if (!d.held) continue;
      if (d.timer <= 0) {
        const { dx, dy } = DIRS[name];
        cmds.push(move(dx, dy));
        d.timer = d._started ? DAS_REPEAT : DAS_DELAY;
        d._started = true;
      } else {
        d.timer--;
      }
      if (!d.held) d._started = false;
    }
    // reset _started for released keys
    for (const name of Object.keys(DIRS)) {
      if (!this.dir[name].held) this.dir[name]._started = false;
    }
    if (this.swapQueued) {
      cmds.push(swap());
      this.swapQueued = false;
    }
    if (this.raiseHeld !== this.lastRaise) {
      cmds.push(this.raiseHeld ? raiseDown() : raiseUp());
      this.lastRaise = this.raiseHeld;
    }
    return cmds;
  }

  _bindKeyboard() {
    const map = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      KeyA: "left",
      KeyD: "right",
      KeyW: "up",
      KeyS: "down",
      Space: "swap",
      KeyZ: "swap",
      KeyJ: "swap",
      ShiftLeft: "raise",
      ShiftRight: "raise",
      KeyK: "raise",
    };
    window.addEventListener("keydown", (e) => {
      const act = map[e.code];
      if (!act) return;
      e.preventDefault();
      if (!e.repeat) this.press(act);
    });
    window.addEventListener("keyup", (e) => {
      const act = map[e.code];
      if (!act) return;
      this.release(act);
    });
  }

  _bindTouch() {
    const root = document.getElementById("touch-controls");
    if (!root) return;
    root.querySelectorAll("button").forEach((btn) => {
      const act = btn.dataset.act;
      const down = (e) => {
        e.preventDefault();
        this.press(act);
      };
      const up = (e) => {
        e.preventDefault();
        this.release(act);
      };
      btn.addEventListener("touchstart", down, { passive: false });
      btn.addEventListener("touchend", up, { passive: false });
      btn.addEventListener("touchcancel", up, { passive: false });
      btn.addEventListener("mousedown", down);
      window.addEventListener("mouseup", up);
    });
  }
}
