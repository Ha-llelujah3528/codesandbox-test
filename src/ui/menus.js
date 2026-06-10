// menus.js - Front-end scenes: title screen, mode select, and the result
// screen, plus a small in-play mode HUD (target/time for Time Attack, etc.).
// Built as DOM overlays so the canvas behind can show an attract-mode demo.

import { fmtTime } from "../session.js";

export function initMenus(cb) {
  const root = document.createElement("div");
  root.id = "menus";
  root.innerHTML = `
    <div id="title-screen" class="menu-screen hidden">
      <div class="title-logo">PANEL<span>ASSAULT</span></div>
      <div class="title-sub">MECHA × NEON PUZZLE BATTLE</div>
      <button id="title-start" class="big-btn">GAME START</button>
      <div class="title-hint">パネルでポン プロトタイプ</div>
    </div>

    <div id="mode-select" class="menu-screen hidden">
      <h2 class="menu-title">モード選択</h2>
      <div class="mode-grid">
        <button class="mode-card" data-mode="endless">
          <b>ENDLESS</b><span>エンドレス / スコアアタック</span>
        </button>
        <button class="mode-card" data-mode="sprint">
          <b>TIME ATTACK</b><span>目標スコアまでの最速タイム</span>
        </button>
        <button class="mode-card" data-mode="vs">
          <b>VS CPU</b><span>CPUとおじゃま送り合い対戦</span>
        </button>
      </div>
      <button id="mode-back" class="menu-btn-sm">← タイトルへ</button>
    </div>

    <div id="result-screen" class="menu-screen hidden">
      <div class="result-headline" id="result-headline"></div>
      <div class="result-stats" id="result-stats"></div>
      <div class="result-actions">
        <button id="result-retry" class="big-btn">もう一度</button>
        <div class="result-sub-actions">
          <button id="result-modes" class="menu-btn-sm">モード選択</button>
          <button id="result-title" class="menu-btn-sm">タイトル</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  const hud = document.createElement("div");
  hud.id = "mode-hud";
  hud.className = "hidden";
  document.body.appendChild(hud);

  const $ = (id) => root.querySelector(id);
  const titleScreen = $("#title-screen");
  const modeSelect = $("#mode-select");
  const resultScreen = $("#result-screen");

  function hideAll() {
    titleScreen.classList.add("hidden");
    modeSelect.classList.add("hidden");
    resultScreen.classList.add("hidden");
    document.body.classList.remove("in-menu");
  }
  function showTitle() {
    hideAll();
    titleScreen.classList.remove("hidden");
    document.body.classList.add("in-menu");
    hud.classList.add("hidden");
    cb.onScene && cb.onScene("title");
  }
  function showModeSelect() {
    hideAll();
    modeSelect.classList.remove("hidden");
    document.body.classList.add("in-menu");
    hud.classList.add("hidden");
    cb.onScene && cb.onScene("modeselect");
  }
  function showResult(mode, result) {
    hideAll();
    const head = $("#result-headline");
    const stats = $("#result-stats");
    let title = "RESULT";
    let cls = "neutral";
    if (result.outcome === "win") { title = "YOU WIN!"; cls = "win"; }
    else if (result.outcome === "lose") { title = "YOU LOSE"; cls = "lose"; }
    else if (result.outcome === "clear") { title = "CLEAR!"; cls = "win"; }
    else if (result.outcome === "over") { title = "GAME OVER"; cls = "lose"; }
    head.textContent = title;
    head.className = "result-headline " + cls;

    const rows = [];
    if (mode === "sprint") {
      rows.push(["TIME", result.outcome === "clear" ? fmtTime(result.frames) : "—"]);
      rows.push(["SCORE", String(result.score)]);
    } else if (mode === "vs") {
      rows.push(["SCORE", String(result.score)]);
      rows.push(["TIME", fmtTime(result.frames)]);
    } else {
      rows.push(["SCORE", String(result.score)]);
    }
    stats.innerHTML = rows
      .map(([k, v]) => `<div class="stat"><label>${k}</label><span>${v}</span></div>`)
      .join("");

    resultScreen.classList.remove("hidden");
    document.body.classList.add("in-menu");
    hud.classList.add("hidden");
    cb.onScene && cb.onScene("result");
  }

  function setHud(html) {
    if (!html) {
      hud.classList.add("hidden");
      return;
    }
    hud.innerHTML = html;
    hud.classList.remove("hidden");
  }

  // wire buttons
  $("#title-start").addEventListener("click", () => {
    cb.onBoot && cb.onBoot();
    showModeSelect();
  });
  root.querySelectorAll(".mode-card").forEach((b) =>
    b.addEventListener("click", () => cb.onSelectMode(b.dataset.mode))
  );
  $("#mode-back").addEventListener("click", () => showTitle());
  $("#result-retry").addEventListener("click", () => cb.onRetry());
  $("#result-modes").addEventListener("click", () => showModeSelect());
  $("#result-title").addEventListener("click", () => showTitle());

  return { showTitle, showModeSelect, showResult, hideAll, setHud };
}
