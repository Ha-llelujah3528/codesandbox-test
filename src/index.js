import "./styles.css";
import { InputManager } from "./input/inputManager.js";
import { ControlConfig } from "./input/controlConfig.js";
import { AudioEngine } from "./audio/audioEngine.js";
import { initSettings } from "./ui/settings.js";
import { initMenus } from "./ui/menus.js";
import { SingleSession, VsSession, DemoSession } from "./session.js";

// ---- bootstrap (the ONLY place that touches the browser clock) ----------
const canvas = document.getElementById("game");
const hint = document.getElementById("boot-hint");
if (hint) hint.style.display = "none"; // the title screen is the start gate now

const config = new ControlConfig();
const input = new InputManager(config);
const audio = new AudioEngine();

let scene = "title"; // 'title' | 'modeselect' | 'play' | 'result'
let mode = "endless";
let session = null; // active play session
let demo = null; // attract-mode demo behind the menus
let paused = false;
let settingsActive = false;
let resultShown = false;

// ---- pause -------------------------------------------------------------
function setPaused(p) {
  paused = p;
  if (session) session.setPaused(p);
  const btn = document.getElementById("pause-btn");
  if (btn) btn.textContent = p ? "▶" : "❚❚";
}

// ---- menus + scenes ----------------------------------------------------
const menus = initMenus({
  onBoot: () => audio.start(),
  onSelectMode: (m) => startMode(m),
  onRetry: () => startMode(mode),
  onScene: (s) => {
    scene = s;
    if (s === "title" || s === "modeselect") {
      disposeSession();
      ensureDemo();
    }
  },
});

function ensureDemo() {
  if (!demo) demo = new DemoSession({ canvas });
}
function disposeDemo() {
  demo = null;
}
function disposeSession() {
  if (session && session.dispose) session.dispose();
  session = null;
}

function startMode(m) {
  mode = m;
  disposeDemo();
  disposeSession();
  audio.start();
  if (m === "vs") session = new VsSession({ canvas, audio, input });
  else session = new SingleSession({ canvas, audio, input, mode: m, target: m === "sprint" ? 3000 : 0 });
  resultShown = false;
  scene = "play";
  paused = false;
  menus.hideAll();
  menus.setHud(session.hudHtml());
}

function finishToResult() {
  resultShown = true;
  scene = "result";
  menus.setHud("");
  menus.setCountdown(null);
  menus.showResult(mode, session.result);
}

// ---- settings (pauses only while playing) ------------------------------
initSettings({
  config,
  input,
  onOpen: () => {
    settingsActive = true;
    if (scene === "play") setPaused(true);
  },
  onClose: () => {
    settingsActive = false;
    if (scene === "play" && session && !session.finished) setPaused(false);
  },
});

// ---- pause button + keys ----------------------------------------------
const pauseBtn = document.getElementById("pause-btn");
if (pauseBtn) {
  pauseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (scene === "play" && session && !session.finished) setPaused(!paused);
  });
}
canvas.addEventListener("pointerdown", () => {
  if (scene === "play" && paused && !settingsActive) setPaused(false);
});

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyM") audio.toggleMute();
  if (e.code === "KeyR" && scene === "play") startMode(mode);
  if (e.code === "KeyP" && scene === "play" && session && !session.finished) {
    e.preventDefault();
    setPaused(!paused);
  }
  // Enter/Space starts from the title
  if ((e.code === "Enter" || e.code === "Space") && scene === "title") {
    audio.start();
    menus.showModeSelect();
  }
});

// ---- fixed-timestep loop ----------------------------------------------
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();

function frame(now) {
  acc += Math.min(now - last, 250);
  last = now;
  while (acc >= STEP) {
    if (scene === "play" && session) {
      session.stepFrame(paused);
      menus.setCountdown(session.countdownLabel());
      if (mode === "sprint" && !paused) menus.setHud(session.hudHtml());
      // hold on the stone/defeat for a beat before showing the result screen
      if (session.readyForResult() && !resultShown) finishToResult();
    } else if (scene === "result" && session) {
      input.drainFrameCommands(); // freeze, just flush input
    } else {
      if (demo) demo.stepFrame();
      else input.drainFrameCommands();
    }
    acc -= STEP;
  }

  if ((scene === "play" || scene === "result") && session) session.render();
  else if (demo) demo.render();

  requestAnimationFrame(frame);
}

// open on the title screen with the attract demo running behind it
ensureDemo();
menus.showTitle();
requestAnimationFrame(frame);
