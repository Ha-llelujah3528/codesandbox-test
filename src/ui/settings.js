// settings.js - The controller configuration screen.
// Two halves: (1) remap any keyboard key to any action, and (2) freely
// arrange the on-screen controller — handedness, size, and drag-to-place each
// cluster anywhere on the screen. Everything persists via ControlConfig.

import { ACTION_ORDER, ACTION_LABELS } from "../input/controlConfig.js";

// Pretty-print a KeyboardEvent.code for display.
function keyLabel(code) {
  if (!code) return "—";
  return code
    .replace(/^Key/, "")
    .replace(/^Digit/, "")
    .replace("ArrowUp", "↑")
    .replace("ArrowDown", "↓")
    .replace("ArrowLeft", "←")
    .replace("ArrowRight", "→")
    .replace("Space", "SPACE")
    .replace("ShiftLeft", "SHIFT-L")
    .replace("ShiftRight", "SHIFT-R")
    .replace("ControlLeft", "CTRL-L")
    .replace("ControlRight", "CTRL-R");
}

// Position the two on-screen control clusters from the saved layout.
export function applyTouchLayout(config) {
  const L = config.layout;
  const tc = document.getElementById("touch-controls");
  const dpad = document.querySelector("#touch-controls .dpad");
  const actions = document.querySelector("#touch-controls .actions");
  if (!tc || !dpad || !actions) return;
  tc.style.flexDirection = L.swapped ? "row-reverse" : "row";
  for (const [el, key, origin] of [
    [dpad, "dpad", "left bottom"],
    [actions, "actions", "right bottom"],
  ]) {
    const pos = L[key];
    if (pos) {
      el.style.position = "fixed";
      el.style.left = pos.xPct + "%";
      el.style.top = pos.yPct + "%";
      el.style.right = "auto";
      el.style.bottom = "auto";
      el.style.transform = `translate(-50%,-50%) scale(${L.scale})`;
      el.style.transformOrigin = "center";
    } else {
      el.style.position = "";
      el.style.left = el.style.top = el.style.right = el.style.bottom = "";
      el.style.transform = `scale(${L.scale})`;
      el.style.transformOrigin = origin;
    }
  }
}

export function initSettings({ config, input, onOpen, onClose }) {
  let editMode = false;

  // ---- build the button + overlay -------------------------------------
  const btn = document.createElement("button");
  btn.id = "settings-btn";
  btn.setAttribute("aria-label", "settings");
  btn.textContent = "⚙";
  document.body.appendChild(btn);

  const overlay = document.createElement("div");
  overlay.id = "settings-overlay";
  overlay.className = "hidden";
  overlay.innerHTML = `
    <div class="settings-panel">
      <h2>コントローラー設定</h2>

      <h3>キー割り当て</h3>
      <div class="key-list"></div>

      <h3>画面コントローラー</h3>
      <div class="opt-row">
        <span>利き手</span>
        <div class="seg" data-group="hand">
          <button data-hand="right">右手</button>
          <button data-hand="left">左手</button>
        </div>
      </div>
      <div class="opt-row">
        <span>サイズ</span>
        <div class="seg" data-group="size">
          <button data-size="0.85">小</button>
          <button data-size="1">中</button>
          <button data-size="1.2">大</button>
        </div>
      </div>
      <div class="opt-row">
        <span>ボタン配置</span>
        <div class="seg">
          <button id="layout-edit">ドラッグで配置</button>
          <button id="layout-reset">配置リセット</button>
        </div>
      </div>

      <div class="settings-footer">
        <button id="settings-reset" class="ghost">すべて初期化</button>
        <button id="settings-close" class="primary">閉じる</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // floating bar shown while dragging the layout
  const editBar = document.createElement("div");
  editBar.id = "layout-edit-bar";
  editBar.className = "hidden";
  editBar.innerHTML = `<span>コントローラーをドラッグして配置</span><button id="layout-done">完了</button>`;
  document.body.appendChild(editBar);

  const keyList = overlay.querySelector(".key-list");

  // ---- keyboard remap list --------------------------------------------
  function renderKeys() {
    keyList.innerHTML = "";
    for (const act of ACTION_ORDER) {
      const row = document.createElement("div");
      row.className = "key-row";
      const codes = config.keys[act] || [];
      row.innerHTML = `
        <span class="key-name">${ACTION_LABELS[act]}</span>
        <span class="key-codes">${codes.map(keyLabel).join(" / ") || "—"}</span>
        <button class="key-set" data-act="${act}">変更</button>`;
      keyList.appendChild(row);
    }
  }
  keyList.addEventListener("click", (e) => {
    const b = e.target.closest(".key-set");
    if (!b) return;
    const act = b.dataset.act;
    b.textContent = "キー入力…";
    b.classList.add("listening");
    input.captureNextKey((code) => {
      if (code) config.bindKey(act, code);
      renderKeys();
    });
  });

  // ---- segmented option buttons ---------------------------------------
  function syncSegments() {
    overlay.querySelectorAll("[data-hand]").forEach((b) =>
      b.classList.toggle("on", (b.dataset.hand === "left") === !!config.layout.swapped)
    );
    overlay.querySelectorAll("[data-size]").forEach((b) =>
      b.classList.toggle("on", parseFloat(b.dataset.size) === config.layout.scale)
    );
  }
  overlay.querySelectorAll("[data-hand]").forEach((b) =>
    b.addEventListener("click", () => {
      config.setSwapped(b.dataset.hand === "left");
      applyTouchLayout(config);
      syncSegments();
    })
  );
  overlay.querySelectorAll("[data-size]").forEach((b) =>
    b.addEventListener("click", () => {
      config.setScale(parseFloat(b.dataset.size));
      applyTouchLayout(config);
      syncSegments();
    })
  );

  overlay.querySelector("#layout-reset").addEventListener("click", () => {
    config.resetLayout();
    applyTouchLayout(config);
    syncSegments();
  });

  // ---- open / close ----------------------------------------------------
  function open() {
    renderKeys();
    syncSegments();
    overlay.classList.remove("hidden");
    document.body.classList.add("show-touch");
    if (onOpen) onOpen();
  }
  function close() {
    overlay.classList.add("hidden");
    document.body.classList.remove("show-touch");
    if (onClose) onClose();
  }
  btn.addEventListener("click", open);
  overlay.querySelector("#settings-close").addEventListener("click", close);
  overlay.querySelector("#settings-reset").addEventListener("click", () => {
    config.resetKeys();
    config.resetLayout();
    applyTouchLayout(config);
    renderKeys();
    syncSegments();
  });

  // ---- drag-to-place layout editing -----------------------------------
  function setEditMode(on) {
    editMode = on;
    document.body.classList.toggle("layout-edit", on);
    editBar.classList.toggle("hidden", !on);
    if (on) {
      overlay.classList.add("hidden");
      document.body.classList.add("show-touch");
    } else {
      document.body.classList.remove("show-touch");
      open(); // back to the settings panel
    }
  }
  overlay.querySelector("#layout-edit").addEventListener("click", () => setEditMode(true));
  editBar.querySelector("#layout-done").addEventListener("click", () => {
    config.save();
    setEditMode(false);
  });

  let drag = null;
  const pointOf = (e) => {
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX, y: p.clientY };
  };
  function startDrag(el, which, e) {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    drag = { el, which };
    moveDrag(e);
  }
  function moveDrag(e) {
    if (!drag) return;
    e.preventDefault();
    const { x, y } = pointOf(e);
    const xPct = Math.max(8, Math.min(92, (x / window.innerWidth) * 100));
    const yPct = Math.max(12, Math.min(92, (y / window.innerHeight) * 100));
    config.layout[drag.which] = { xPct, yPct }; // mutate live; persist on release
    applyTouchLayout(config);
  }
  function endDrag() {
    if (!drag) return;
    drag = null;
    config.save();
  }

  for (const [sel, which] of [[".dpad", "dpad"], [".actions", "actions"]]) {
    const el = document.querySelector("#touch-controls " + sel);
    if (!el) continue;
    const down = (e) => startDrag(el, which, e);
    // capture phase so the buttons' own press handlers don't fire while editing
    el.addEventListener("mousedown", down, true);
    el.addEventListener("touchstart", down, { capture: true, passive: false });
  }
  window.addEventListener("mousemove", moveDrag);
  window.addEventListener("touchmove", moveDrag, { passive: false });
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("touchend", endDrag);

  // apply saved layout on boot
  applyTouchLayout(config);

  return { open, close, isEditing: () => editMode };
}
