// game.js - Panel de Pon ("パネポン") style engine.
// Mechanics: a rising stack of mecha panels, a two-wide cursor that swaps
// adjacent panels, gravity, 3+ matches, chains/combos, a panic state near the
// top, and an INSTANT game over the moment the topmost panel touches the line.

import { COLORS, drawPanel } from "./render.js";

export const COLS = 6;
export const ROWS = 12;
export const CELL = 46;

const FALL_SPEED = 900;     // px/s panels fall
const CLEAR_TIME = 0.55;    // s a matched group flashes before popping
const SWAP_TIME = 0.12;     // s swap animation
const DANGER_ROW = 2;       // topmost panel at/above this row => panic
const BASE_RISE = 7;        // px/s baseline rise, scales with level
const FAST_RISE = 240;      // px/s while RAISE held
const NUM_COLORS = 5;

const IDLE = "idle", FALL = "fall", SWAP = "swap", CLEAR = "clear";

let UID = 0;
function makePanel(color) {
  return { id: ++UID, color, state: IDLE, offsetY: 0, swapT: 0, swapDir: 0,
           clearT: 0, popIndex: 0, chainable: false };
}

export class Game {
  constructor(audio) {
    this.audio = audio;
    this.reset();
  }

  reset() {
    this.grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    this.cursor = { col: Math.floor(COLS / 2) - 1, row: ROWS - 4 };
    this.riseOffset = 0;
    this.nextRow = this._genRow();
    this.clearing = [];        // active clear groups {cells, t}
    this.score = 0;
    this.chainLevel = 0;
    this.maxChain = 0;
    this.pendingChain = false;
    this.danger = false;
    this.over = false;
    this.paused = false;
    this.time = 0;
    this.raising = false;
    this.shakeT = 0;
    this._seedBoard();
  }

  // Fill the lower portion of the board without creating instant matches.
  _seedBoard() {
    for (let r = ROWS - 6; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.grid[r][c] = makePanel(this._safeColor(r, c));
      }
    }
  }

  _safeColor(r, c) {
    let color;
    let guard = 0;
    do {
      color = Math.floor(Math.random() * NUM_COLORS);
      guard++;
    } while (guard < 30 && (
      (c >= 2 && this._col(r, c - 1) === color && this._col(r, c - 2) === color) ||
      (r >= 2 && this._col(r - 1, c) === color && this._col(r - 2, c) === color)
    ));
    return color;
  }

  _col(r, c) {
    const p = this.grid[r] && this.grid[r][c];
    return p ? p.color : -1;
  }

  // The next emerging row (preview at the bottom).
  _genRow() {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      let color;
      let guard = 0;
      do {
        color = Math.floor(Math.random() * NUM_COLORS);
        guard++;
      } while (guard < 30 && c >= 2 && row[c - 1] === color && row[c - 2] === color);
      row.push(color);
    }
    return row;
  }

  // ---- input actions -----------------------------------------------------

  moveCursor(dx, dy) {
    if (this.over || this.paused) return;
    const nc = Math.max(0, Math.min(COLS - 2, this.cursor.col + dx));
    const nr = Math.max(0, Math.min(ROWS - 1, this.cursor.row + dy));
    if (nc !== this.cursor.col || nr !== this.cursor.row) {
      this.cursor.col = nc;
      this.cursor.row = nr;
      this.audio.cursorMove();
    }
  }

  swap() {
    if (this.over || this.paused) return;
    const { row, col } = this.cursor;
    const a = this.grid[row][col];
    const b = this.grid[row][col + 1];
    // Can't swap panels that are busy clearing or mid-fall.
    if ((a && a.state !== IDLE) || (b && b.state !== IDLE)) return;
    if (!a && !b) return;
    this.grid[row][col] = b;
    this.grid[row][col + 1] = a;
    if (b) { b.state = SWAP; b.swapT = SWAP_TIME; b.swapDir = -1; }
    if (a) { a.state = SWAP; a.swapT = SWAP_TIME; a.swapDir = +1; }
    this.pendingChain = false; // a manual swap breaks the chain context
    this.audio.swap();
  }

  setRaising(on) {
    this.raising = on;
    if (on && !this.over && !this.paused) this.audio.raise();
  }

  togglePause() {
    if (this.over) return;
    this.paused = !this.paused;
  }

  // ---- main update -------------------------------------------------------

  update(dt) {
    if (this.over || this.paused) return;
    this.time += dt;

    this._updateSwaps(dt);
    this._updateClears(dt);
    this._stepGravity(dt);

    // Detect matches only when the board is settled (nothing busy).
    if (this._settled()) this._detectMatches();

    this._updateRise(dt);
    this._updateDanger(dt);
    this._checkGameOver();
  }

  _updateSwaps(dt) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = this.grid[r][c];
        if (p && p.state === SWAP) {
          p.swapT -= dt;
          if (p.swapT <= 0) { p.swapT = 0; p.state = IDLE; }
        }
      }
    }
  }

  _updateClears(dt) {
    for (let i = this.clearing.length - 1; i >= 0; i--) {
      const grp = this.clearing[i];
      grp.t -= dt;
      if (grp.t <= 0) {
        for (const { r, c } of grp.cells) {
          if (this.grid[r][c]) this.grid[r][c] = null;
        }
        // Panels that fall into the freshly cleared space can extend a chain.
        this.pendingChain = true;
        this.clearing.splice(i, 1);
        this.audio.land();
      }
    }
  }

  // Column compaction with smooth fall offsets.
  _stepGravity(dt) {
    // animate active falls
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = this.grid[r][c];
        if (p && p.state === FALL) {
          p.offsetY += FALL_SPEED * dt;
          if (p.offsetY >= 0) {
            p.offsetY = 0;
            p.state = IDLE;
          }
        }
      }
    }
    // compact each column downward, spawning new falls for floating panels
    for (let c = 0; c < COLS; c++) {
      let writeRow = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const p = this.grid[r][c];
        if (!p) continue;
        if (p.state === CLEAR) { writeRow = r - 1; continue; }
        if (p.state === SWAP) { writeRow = r - 1; continue; }
        if (p.state === FALL) { writeRow = r - 1; continue; }
        // IDLE panel
        if (r === writeRow) { writeRow--; continue; }
        // floating: drop to writeRow
        this.grid[writeRow][c] = p;
        this.grid[r][c] = null;
        p.offsetY += (r - writeRow) * CELL; // negative -> appears above target
        p.state = FALL;
        writeRow--;
      }
    }
  }

  _settled() {
    if (this.clearing.length) return false;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = this.grid[r][c];
        if (p && p.state !== IDLE) return false;
      }
    }
    return true;
  }

  _detectMatches() {
    const toClear = new Set();
    const key = (r, c) => r * COLS + c;
    // horizontal runs
    for (let r = 0; r < ROWS; r++) {
      let run = 1;
      for (let c = 1; c <= COLS; c++) {
        const same = c < COLS && this._col(r, c) !== -1 && this._col(r, c) === this._col(r, c - 1);
        if (same) run++;
        else {
          if (run >= 3) for (let k = 0; k < run; k++) toClear.add(key(r, c - 1 - k));
          run = 1;
        }
      }
    }
    // vertical runs
    for (let c = 0; c < COLS; c++) {
      let run = 1;
      for (let r = 1; r <= ROWS; r++) {
        const same = r < ROWS && this._col(r, c) !== -1 && this._col(r, c) === this._col(r - 1, c);
        if (same) run++;
        else {
          if (run >= 3) for (let k = 0; k < run; k++) toClear.add(key(r - 1 - k, c));
          run = 1;
        }
      }
    }
    if (toClear.size === 0) {
      // board settled with no matches -> chain is finished
      this.chainLevel = 0;
      this.pendingChain = false;
      return;
    }

    this.chainLevel = this.pendingChain ? this.chainLevel + 1 : 1;
    this.maxChain = Math.max(this.maxChain, this.chainLevel);
    this.pendingChain = false;

    const cells = [];
    let i = 0;
    for (const k of toClear) {
      const r = Math.floor(k / COLS);
      const c = k % COLS;
      const p = this.grid[r][c];
      if (p) { p.state = CLEAR; p.clearT = CLEAR_TIME; p.popIndex = i++; cells.push({ r, c }); }
    }
    this.clearing.push({ cells, t: CLEAR_TIME });

    // scoring: bigger groups & deeper chains pay more
    const groupBonus = cells.length * 10;
    const chainBonus = this.chainLevel > 1 ? this.chainLevel * this.chainLevel * 50 : 0;
    this.score += groupBonus + chainBonus;

    this.audio.clear(this.chainLevel);
    if (this.chainLevel > 1) this.audio.chain(this.chainLevel);
  }

  _updateRise(dt) {
    if (this.clearing.length) return;          // rising pauses during clears
    if (!this._settled()) return;              // and while panels fall
    const level = 1 + Math.floor(this.time / 30);
    const speed = this.raising ? FAST_RISE : BASE_RISE * level;
    this.riseOffset += speed * dt;
    if (this.riseOffset >= CELL) {
      this.riseOffset -= CELL;
      this._shiftUp();
    }
  }

  _shiftUp() {
    for (let r = 0; r < ROWS - 1; r++) this.grid[r] = this.grid[r + 1];
    this.grid[ROWS - 1] = this.nextRow.map((color) => makePanel(color));
    this.nextRow = this._genRow();
    // keep the cursor anchored to the same screen position
    this.cursor.row = Math.max(0, this.cursor.row);
  }

  _topRow() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.grid[r][c]) return r;
      }
    }
    return ROWS;
  }

  _updateDanger(dt) {
    const wasDanger = this.danger;
    this.danger = this._topRow() <= DANGER_ROW;
    this.audio.setPanic(this.danger);
    if (this.danger && !wasDanger) this.audio.warn();
    this.shakeT += dt;
  }

  // INSTANT game over: the moment the topmost panel's top edge reaches the
  // top line (y = 0). With rising, a row-1 panel crosses exactly as it would
  // shift into row 0 -- i.e. the instant it touches the line.
  _checkGameOver() {
    const top = this._topRow();
    if (top >= ROWS) return;
    const topEdge = top * CELL - this.riseOffset;
    if (topEdge <= 0) {
      this.over = true;
      this.audio.setPanic(false);
      this.audio.gameover();
    }
  }

  // ---- rendering ---------------------------------------------------------

  draw(ctx) {
    const W = COLS * CELL;
    const H = ROWS * CELL;

    // board shake while in danger
    let sx = 0, sy = 0;
    if (this.danger && !this.over) {
      sx = Math.sin(this.shakeT * 47) * 2;
      sy = Math.cos(this.shakeT * 53) * 2;
    }
    ctx.save();
    ctx.translate(sx, sy);

    // board background (metal bay)
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#1b2230");
    bg.addColorStop(1, "#0c1018");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // grid guide lines
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke();
    }

    const riseShift = -this.riseOffset;

    // panels
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = this.grid[r][c];
        if (!p) continue;
        const color = COLORS[p.color];
        let x = c * CELL;
        let y = r * CELL + riseShift + p.offsetY;
        const opts = { glow: this.chainLevel > 1 && p.state === CLEAR };

        // swap lifts the panel off the board for real 3D depth
        if (p.state === SWAP) {
          const prog = 1 - p.swapT / SWAP_TIME;          // 0..1
          const arc = Math.sin(prog * Math.PI);          // up then down
          // start at the old column and slide to the new one
          x -= p.swapDir * CELL * (1 - prog);
          opts.lift = arc * 14;                          // float above board
          opts.scale = 1 + arc * 0.12;                   // pop toward viewer
        }

        // panic: worried faces + vertical shaking on the whole stack
        if (this.danger && !this.over && p.state === IDLE) {
          opts.face = true;
          y += Math.sin(this.shakeT * 18 + c * 0.9 + r * 0.4) * 3;
        }

        if (p.state === CLEAR) {
          const f = Math.min(1, p.clearT / CLEAR_TIME);
          opts.flash = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 30));
          opts.scale = 0.6 + 0.4 * f;
        }

        drawPanel(ctx, color, x, y, CELL, CELL, opts);
      }
    }

    // emerging next row at the bottom (dimmed, locked preview)
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let c = 0; c < COLS; c++) {
      const color = COLORS[this.nextRow[c]];
      drawPanel(ctx, color, c * CELL, ROWS * CELL + riseShift, CELL, CELL, {});
    }
    ctx.restore();

    this._drawCursor(ctx, riseShift);

    // the top line that ends the game
    ctx.strokeStyle = this.danger ? "#ff3b3b" : "#ff9d3b";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    if (this.danger && !this.over) ctx.lineWidth = 3 + Math.sin(this.time * 20) * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 1.5);
    ctx.lineTo(W, 1.5);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    if (this.over) this._drawOverlay(ctx, W, H, "GAME OVER", "#ff5b5b");
    else if (this.paused) this._drawOverlay(ctx, W, H, "PAUSE", "#ffd34d");
  }

  _drawCursor(ctx, riseShift) {
    const x = this.cursor.col * CELL;
    const y = this.cursor.row * CELL + riseShift;
    const w = CELL * 2;
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.time * 6));
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
    ctx.lineWidth = 3;
    const corner = 12;
    const drawBracket = (cx, cy, dirx, diry) => {
      ctx.beginPath();
      ctx.moveTo(cx + dirx * corner, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + diry * corner);
      ctx.stroke();
    };
    const pad = -3;
    drawBracket(x + pad, y + pad, 1, 1);
    drawBracket(x + w - pad, y + pad, -1, 1);
    drawBracket(x + pad, y + CELL - pad, 1, -1);
    drawBracket(x + w - pad, y + CELL - pad, -1, -1);
    ctx.restore();
  }

  _drawOverlay(ctx, W, H, text, color) {
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, H / 2 - 10);
    if (text === "GAME OVER") {
      ctx.fillStyle = "#fff";
      ctx.font = "16px system-ui, sans-serif";
      ctx.fillText(`SCORE ${this.score}  /  MAX CHAIN ${this.maxChain}`, W / 2, H / 2 + 28);
    }
  }
}
