import "./styles.css";
import { Engine } from "./core/engine.js";
import { InputManager } from "./input/inputManager.js";
import { Renderer } from "./render/renderer.js";
import { AudioEngine } from "./audio/audioEngine.js";

// ---- bootstrap (the ONLY place that touches the browser clock) ----------
const canvas = document.getElementById("game");
const hint = document.getElementById("boot-hint");

let seed = (Date.now() & 0xffffffff) >>> 0;
let engine = new Engine(seed, { startRows: 6 });
const input = new InputManager();
const renderer = new Renderer(canvas, engine);
const audio = new AudioEngine();

// First interaction boots audio (autoplay policy) and hides the hint.
input.onFirstInput = () => {
  audio.start();
  if (hint) hint.style.display = "none";
};

// Restart on R.
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyR") {
    seed = (seed * 1103515245 + 12345) >>> 0;
    engine = new Engine(seed, { startRows: 6 });
    renderer.engine = engine;
  }
  if (e.code === "KeyM") audio.toggleMute();
});

// Fixed-timestep loop with accumulator: logic runs at exactly 60Hz regardless
// of display refresh, keeping the simulation deterministic.
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();

function frame(now) {
  acc += Math.min(now - last, 250); // clamp to avoid spiral-of-death
  last = now;
  while (acc >= STEP) {
    const commands = input.drainFrameCommands();
    engine.tick(commands);
    renderer.consumeEvents(engine.events);
    audio.consumeEvents(engine.events);
    acc -= STEP;
  }
  renderer.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
