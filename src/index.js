import "./styles.css";
import { AudioEngine } from "./audio.js";
import { Controls, ACTIONS } from "./controls.js";
import { Game, COLS, ROWS, CELL } from "./game.js";

const app = document.getElementById("app");
app.innerHTML = `
  <div class="machine">
    <div class="title">MECHA<span>PANEL</span></div>
    <div class="stage">
      <div class="hud">
        <div class="hud-box"><label>SCORE</label><span id="score">0</span></div>
        <div class="hud-box"><label>CHAIN</label><span id="chain">0</span></div>
        <div class="hud-box danger-box" id="dangerBox"><label>STATUS</label><span id="status">OK</span></div>
      </div>
      <canvas id="board" width="${COLS * CELL}" height="${ROWS * CELL}"></canvas>
    </div>

    <div class="controls">
      <div class="dpad">
        <button class="ctl up"    data-act="up">▲</button>
        <button class="ctl left"  data-act="left">◀</button>
        <button class="ctl right" data-act="right">▶</button>
        <button class="ctl down"  data-act="down">▼</button>
      </div>
      <div class="actions">
        <button class="ctl swap"  data-act="swap"><span class="ctl-label">SWAP</span></button>
        <button class="ctl raise" data-act="raise"><span class="ctl-label">RAISE</span></button>
      </div>
    </div>

    <div class="menu-row">
      <button id="btnRestart" class="menu-btn">RESTART</button>
      <button id="btnPause" class="menu-btn">PAUSE</button>
      <button id="btnBgm" class="menu-btn">BGM: ON</button>
      <button id="btnConfig" class="menu-btn">CONFIG</button>
    </div>
  </div>

  <div id="configOverlay" class="config-overlay hidden">
    <div class="config-panel">
      <h2>コントローラー設定 / CONTROLS</h2>
      <p class="hint">割り当てたい項目をクリックして、新しいキーを押してください。</p>
      <div id="bindingList" class="binding-list"></div>
      <div class="config-buttons">
        <button id="btnResetKeys" class="menu-btn">デフォルトに戻す</button>
        <button id="btnCloseConfig" class="menu-btn primary">閉じる</button>
      </div>
    </div>
  </div>
`;

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const audio = new AudioEngine();
const controls = new Controls();
const game = new Game(audio);

const scoreEl = document.getElementById("score");
const chainEl = document.getElementById("chain");
const statusEl = document.getElementById("status");
const dangerBox = document.getElementById("dangerBox");

// ---- input: keyboard edges + held state -> game ---------------------------

function pump() {
  for (const act of controls.consumeEdges()) {
    audio.resume();
    switch (act) {
      case "up": game.moveCursor(0, -1); break;
      case "down": game.moveCursor(0, 1); break;
      case "left": game.moveCursor(-1, 0); break;
      case "right": game.moveCursor(1, 0); break;
      case "swap": game.swap(); break;
      case "pause": game.togglePause(); break;
      case "raise": /* held state handled below */ break;
    }
  }
  game.setRaising(controls.isDown("raise"));
}

// ---- on-screen touch buttons ---------------------------------------------

document.querySelectorAll(".ctl").forEach((btn) => {
  const act = btn.dataset.act;
  const down = (e) => {
    e.preventDefault();
    audio.resume();
    controls.press(act);
    btn.classList.add("pressed");
  };
  const up = (e) => {
    e.preventDefault();
    controls.release(act);
    btn.classList.remove("pressed");
  };
  btn.addEventListener("touchstart", down, { passive: false });
  btn.addEventListener("touchend", up, { passive: false });
  btn.addEventListener("mousedown", down);
  btn.addEventListener("mouseup", up);
  btn.addEventListener("mouseleave", up);
});

// ---- menu buttons ---------------------------------------------------------

document.getElementById("btnRestart").onclick = () => { audio.resume(); game.reset(); };
document.getElementById("btnPause").onclick = () => { audio.resume(); game.togglePause(); };

const btnBgm = document.getElementById("btnBgm");
btnBgm.onclick = () => {
  audio.resume();
  const on = !audio.bgmOn;
  audio.toggleBgm(on);
  btnBgm.textContent = `BGM: ${on ? "ON" : "OFF"}`;
};

// ---- controller config screen --------------------------------------------

const overlay = document.getElementById("configOverlay");
const bindingList = document.getElementById("bindingList");

function renderBindings(capturingId = null) {
  bindingList.innerHTML = "";
  for (const a of ACTIONS) {
    const row = document.createElement("div");
    row.className = "binding-row";
    const name = document.createElement("span");
    name.className = "binding-name";
    name.textContent = a.label;
    const key = document.createElement("button");
    key.className = "binding-key" + (capturingId === a.id ? " capturing" : "");
    key.textContent = capturingId === a.id ? "キー入力..." : controls.labelFor(a.id);
    key.onclick = () => {
      renderBindings(a.id);
      controls.beginCapture(a.id, () => renderBindings(null));
    };
    row.appendChild(name);
    row.appendChild(key);
    bindingList.appendChild(row);
  }
}

document.getElementById("btnConfig").onclick = () => {
  audio.resume();
  game.paused = true;
  renderBindings(null);
  overlay.classList.remove("hidden");
};
document.getElementById("btnCloseConfig").onclick = () => {
  overlay.classList.add("hidden");
  game.paused = false;
};
document.getElementById("btnResetKeys").onclick = () => {
  controls.resetDefaults();
  renderBindings(null);
};

// ---- game loop ------------------------------------------------------------

let last = performance.now();
function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp after tab switches / long frames

  pump();
  game.update(dt);
  game.draw(ctx);

  scoreEl.textContent = game.score;
  chainEl.textContent = game.chainLevel > 1 ? `x${game.chainLevel}` : "0";
  if (game.over) { statusEl.textContent = "OVER"; dangerBox.className = "hud-box danger-box over"; }
  else if (game.danger) { statusEl.textContent = "DANGER!"; dangerBox.className = "hud-box danger-box active"; }
  else { statusEl.textContent = "OK"; dangerBox.className = "hud-box danger-box"; }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
