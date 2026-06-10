// controls.js - Keyboard input with a fully remappable layout plus a settings
// screen so the player can reassign every control. Bindings persist in
// localStorage. Also exposes on-screen touch buttons for mobile.

export const ACTIONS = [
  { id: "up",    label: "上 (UP)" },
  { id: "down",  label: "下 (DOWN)" },
  { id: "left",  label: "左 (LEFT)" },
  { id: "right", label: "右 (RIGHT)" },
  { id: "swap",  label: "入れ替え (SWAP)" },
  { id: "raise", label: "せり上げ (RAISE)" },
  { id: "pause", label: "ポーズ (PAUSE)" },
];

const DEFAULTS = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  swap: "Space",
  raise: "ShiftLeft",
  pause: "Escape",
};

const STORAGE_KEY = "mechapanel.bindings.v1";

function keyLabel(code) {
  if (!code) return "—";
  return code
    .replace("Arrow", "")
    .replace("Key", "")
    .replace("Digit", "")
    .replace("Left", " L")
    .replace("Right", " R")
    .replace("Space", "SPACE")
    .replace("Escape", "ESC");
}

export class Controls {
  constructor() {
    this.bindings = this._load();
    this.pressed = new Set();      // action ids currently held
    this._edgeQueue = [];          // actions newly pressed this frame
    this._codeToAction = {};
    this._rebuildMap();
    this._capturing = null;        // action id awaiting a new key

    window.addEventListener("keydown", (e) => this._onKey(e, true));
    window.addEventListener("keyup", (e) => this._onKey(e, false));
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) { /* ignore */ }
    return { ...DEFAULTS };
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bindings));
    } catch (e) { /* ignore */ }
  }

  _rebuildMap() {
    this._codeToAction = {};
    for (const a of ACTIONS) this._codeToAction[this.bindings[a.id]] = a.id;
  }

  _onKey(e, down) {
    // Rebinding mode: capture the next key for the chosen action.
    if (down && this._capturing) {
      e.preventDefault();
      if (e.code !== "Escape") {
        // free the code from any other action, then assign
        for (const a of ACTIONS) {
          if (this.bindings[a.id] === e.code) this.bindings[a.id] = null;
        }
        this.bindings[this._capturing] = e.code;
        this._save();
        this._rebuildMap();
      }
      const id = this._capturing;
      this._capturing = null;
      if (this._onCaptureDone) this._onCaptureDone(id);
      return;
    }

    const action = this._codeToAction[e.code];
    if (!action) return;
    e.preventDefault();
    if (down) {
      if (!this.pressed.has(action)) this._edgeQueue.push(action);
      this.pressed.add(action);
    } else {
      this.pressed.delete(action);
    }
  }

  isDown(action) {
    return this.pressed.has(action);
  }

  // Returns and clears edge (just-pressed) events for this frame.
  consumeEdges() {
    const q = this._edgeQueue;
    this._edgeQueue = [];
    return q;
  }

  // Programmatic press (touch buttons).
  press(action) {
    if (!this.pressed.has(action)) this._edgeQueue.push(action);
    this.pressed.add(action);
  }

  release(action) {
    this.pressed.delete(action);
  }

  beginCapture(actionId, onDone) {
    this._capturing = actionId;
    this._onCaptureDone = onDone;
  }

  resetDefaults() {
    this.bindings = { ...DEFAULTS };
    this._save();
    this._rebuildMap();
  }

  labelFor(actionId) {
    return keyLabel(this.bindings[actionId]);
  }
}
