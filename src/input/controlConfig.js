// controlConfig.js - User-customizable controls, persisted to localStorage.
// Covers BOTH keyboard key bindings AND the on-screen controller layout
// (free placement, size, handedness) so the player can arrange the pad freely.

const STORE = "panelassault.controls.v1";

export const ACTION_LABELS = {
  up: "上 / UP",
  down: "下 / DOWN",
  left: "左 / LEFT",
  right: "右 / RIGHT",
  swap: "入替 / SWAP",
  raise: "せり上げ / RAISE",
};
export const ACTION_ORDER = ["up", "down", "left", "right", "swap", "raise"];

const DEFAULT_KEYS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  swap: ["Space", "KeyZ", "KeyJ"],
  raise: ["ShiftLeft", "ShiftRight", "KeyK"],
};

// Every on-screen button is freely placeable (incl. each D-pad arrow). Default
// positions are viewport percentages; left-handed mirrors them horizontally.
const RIGHT_DEFAULTS = {
  up: { xPct: 16, yPct: 66 },
  down: { xPct: 16, yPct: 88 },
  left: { xPct: 7, yPct: 77 },
  right: { xPct: 25, yPct: 77 },
  raise: { xPct: 86, yPct: 64 },
  swap: { xPct: 86, yPct: 84 },
};

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

function mirror(set) {
  const m = {};
  for (const k of Object.keys(set)) m[k] = { xPct: 100 - set[k].xPct, yPct: set[k].yPct };
  return m;
}

export function defaultButtons(swapped) {
  return swapped ? mirror(RIGHT_DEFAULTS) : clone(RIGHT_DEFAULTS);
}

const DEFAULT_LAYOUT = {
  scale: 1,
  swapped: false, // false: D-pad left / actions right (right-handed)
  buttons: clone(RIGHT_DEFAULTS), // per-button {xPct,yPct}
};

export class ControlConfig {
  constructor() {
    this.keys = clone(DEFAULT_KEYS);
    this.layout = clone(DEFAULT_LAYOUT);
    this.onChange = null;
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.keys) this.keys = { ...clone(DEFAULT_KEYS), ...data.keys };
      if (data.layout) {
        this.layout = { ...clone(DEFAULT_LAYOUT), ...data.layout };
        // ensure every button has a position (fill any missing from defaults)
        this.layout.buttons = { ...defaultButtons(this.layout.swapped), ...(data.layout.buttons || {}) };
      }
    } catch (e) {
      /* ignore corrupt storage */
    }
  }

  save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({ keys: this.keys, layout: this.layout }));
    } catch (e) {
      /* ignore */
    }
    if (this.onChange) this.onChange();
  }

  // code -> action lookup for the InputManager.
  actionForCode(code) {
    for (const act of ACTION_ORDER) {
      if (this.keys[act] && this.keys[act].includes(code)) return act;
    }
    return null;
  }

  // Bind `code` to `action`, removing it from any other action first.
  bindKey(action, code) {
    for (const act of ACTION_ORDER) {
      this.keys[act] = (this.keys[act] || []).filter((c) => c !== code);
    }
    this.keys[action] = [code];
    this.save();
  }

  resetKeys() {
    this.keys = clone(DEFAULT_KEYS);
    this.save();
  }

  resetLayout() {
    this.layout.buttons = defaultButtons(this.layout.swapped);
    this.save();
  }

  setScale(scale) {
    this.layout.scale = scale;
    this.save();
  }

  setSwapped(swapped) {
    this.layout.swapped = swapped;
    this.layout.buttons = defaultButtons(swapped); // re-seat to that hand's defaults
    this.save();
  }

  // Free placement of a single button (D-pad arrow or action).
  setButtonPos(act, xPct, yPct) {
    this.layout.buttons[act] = { xPct, yPct };
    this.save();
  }
}
