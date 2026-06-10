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

const DEFAULT_LAYOUT = {
  scale: 1,
  swapped: false, // false: D-pad left / actions right (right-handed)
  dpad: null, // {xPct,yPct} free position, or null for CSS default
  actions: null,
};

function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

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
      if (data.layout) this.layout = { ...clone(DEFAULT_LAYOUT), ...data.layout };
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
    this.layout = clone(DEFAULT_LAYOUT);
    this.save();
  }

  setScale(scale) {
    this.layout.scale = scale;
    this.save();
  }

  setSwapped(swapped) {
    this.layout.swapped = swapped;
    this.save();
  }

  setPosition(which, xPct, yPct) {
    this.layout[which] = { xPct, yPct };
    this.save();
  }
}
