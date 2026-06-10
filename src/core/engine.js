import * as C from "./constants.js";
import { Color, State, Ev } from "./types.js";
import { createRng } from "./rng.js";
import {
  createBoard,
  idx,
  get,
  fillStartStack,
  shiftUp,
  stackTopRow,
} from "./board.js";
import { isEmpty, isClearing, clearBlock } from "./block.js";
import { cellOccupied, garbageAt } from "./board.js";
import { findMatches } from "./matcher.js";
import { Cmd } from "./commands.js";
import {
  spawnGarbage,
  advanceGarbageGravity,
  advanceGarbageTransform,
  triggerGarbage,
  garbageBusy,
} from "./garbage.js";

// The deterministic game core. Advances only via tick(commands). No browser,
// no wall clock, no Math.random — all randomness flows through the seeded RNG.
export class Engine {
  constructor(seed = 0x1234, opts = {}) {
    this.rng = createRng(seed);
    this.board = createBoard();
    this.cursor = { x: 2, y: C.GRID_H - 4 };
    this.activeSwap = null; // {x, y, timer}
    this.chainCounter = 0;
    this.chainActive = false;
    this.combo = 0;
    this.score = 0;
    this.level = 1;
    this.frame = 0;
    this.levelTimer = 0;
    this.raiseHeld = false;
    this.gameOver = false;
    this.danger = false;
    this.events = [];

    // versus garbage
    this.incoming = []; // queued garbage specs waiting to drop
    this.nextGid = 1;
    this.pendingOut = []; // garbage to send, released ~2s after the chain ends
    this.sendTimer = 0;

    const startRows = opts.startRows || 6;
    fillStartStack(this.board, this.rng, startRows);
  }

  emit(type, data) {
    this.events.push({ type, ...data });
  }

  // ---- main step -------------------------------------------------------
  tick(commands) {
    this.events.length = 0;
    if (this.gameOver) return;
    this.frame++;

    this.applyCommands(commands);
    this.advanceSwap();
    this.advanceClearTimeline();
    advanceGarbageTransform(this);
    const settled = this.advanceGravity();
    advanceGarbageGravity(this);
    this.detectMatches(settled);
    spawnGarbage(this);
    this.advanceRising();
    if (this.checkTopOut()) return; // instant game over the moment we touch the line
    this.resolveChainAndDanger();
    this.advanceSend();
    this.advanceLevel();
  }

  // Game over the INSTANT the topmost panel touches the top line (row 0).
  // The line sits at the very top of the playfield, so a panel "touches" it
  // the moment it occupies row 0 — whether pushed there by rising or dropped
  // there by gravity. Checked every tick (not just on a full rise-shift).
  checkTopOut() {
    if (this.gameOver) return false;
    const top = stackTopRow(this.board);
    if (top === 0) {
      this.gameOver = true;
      this.danger = true;
      this.emit(Ev.TOP_OUT, {});
      return true;
    }
    return false;
  }

  // 1. input ------------------------------------------------------------
  applyCommands(commands) {
    for (const cmd of commands) {
      switch (cmd.type) {
        case Cmd.MOVE:
          this.moveCursor(cmd.dx, cmd.dy);
          break;
        case Cmd.SWAP:
          this.trySwap();
          break;
        case Cmd.RAISE_DOWN:
          this.raiseHeld = true;
          break;
        case Cmd.RAISE_UP:
          this.raiseHeld = false;
          break;
      }
    }
  }

  moveCursor(dx, dy) {
    const nx = this.cursor.x + dx;
    const ny = this.cursor.y + dy;
    if (nx >= 0 && nx <= C.GRID_W - 2) this.cursor.x = nx;
    if (ny >= 0 && ny <= C.GRID_H - 1) this.cursor.y = ny;
    this.emit(Ev.CURSOR_MOVE, { x: this.cursor.x, y: this.cursor.y });
  }

  swappable(b) {
    return b.state === State.IDLE || b.state === State.EMPTY;
  }

  trySwap() {
    if (this.activeSwap) return;
    const { x, y } = this.cursor;
    const a = get(this.board, x, y);
    const b = get(this.board, x + 1, y);
    if (!this.swappable(a) || !this.swappable(b)) return;
    // don't allow swapping two empties (no-op)
    if (isEmpty(a) && isEmpty(b)) return;
    a.state = State.SWAPPING;
    b.state = State.SWAPPING;
    a.timer = C.SWAP_TIME;
    b.timer = C.SWAP_TIME;
    this.activeSwap = { x, y, timer: C.SWAP_TIME };
    this.emit(Ev.SWAP, { x, y });
  }

  // 2. swap -------------------------------------------------------------
  advanceSwap() {
    if (!this.activeSwap) return;
    this.activeSwap.timer--;
    if (this.activeSwap.timer > 0) return;
    const { x, y } = this.activeSwap;
    const a = get(this.board, x, y);
    const b = get(this.board, x + 1, y);
    const ca = a.color;
    const cb = b.color;
    setCell(a, cb);
    setCell(b, ca);
    this.activeSwap = null;
  }

  // 3. clear timeline ---------------------------------------------------
  advanceClearTimeline() {
    const cells = this.board.cells;
    for (let i = 0; i < cells.length; i++) {
      const b = cells[i];
      if (b.timer > 0 && b.state !== State.SWAPPING) b.timer--;
      switch (b.state) {
        case State.FLASHING:
          if (b.timer <= 0) {
            b.state = State.FACE;
            b.timer = C.FACE_TIME;
          }
          break;
        case State.FACE:
          if (b.timer <= 0) {
            b.state = State.POPPING;
            b.timer = b.popIndex * C.POP_TIME;
          }
          break;
        case State.POPPING:
          if (b.timer <= 0) {
            this.emit(Ev.POP, {
              color: b.color,
              x: i % C.GRID_W,
              y: Math.floor(i / C.GRID_W),
              index: b.popIndex,
              total: b.popCount,
            });
            clearBlock(b);
          }
          break;
        case State.LANDING:
          if (b.timer <= 0) {
            b.state = State.IDLE;
            b._justSettled = true;
          }
          break;
      }
    }
  }

  // 4. gravity ----------------------------------------------------------
  // Column-based gravity: a contiguous stack of unsupported blocks falls in
  // UNISON (shared per-column offset), so e.g. a 2-tall drop onto a matching
  // 2-tall stack lands all four on the same tick and registers as one clear.
  // Returns true if anything is still falling (for chain bookkeeping).
  advanceGravity() {
    const board = this.board;
    let anyFalling = false;
    const chainContext = this.chainActive;
    if (!board.colFall) board.colFall = new Array(C.GRID_W).fill(0);

    for (let x = 0; x < C.GRID_W; x++) {
      // settle destination of each movable block; walls = garbage / clearing /
      // swapping blocks; floor sits just below row GRID_H-1.
      const dest = new Array(C.GRID_H).fill(-1);
      let floorY = C.GRID_H;
      let hasFaller = false;
      for (let y = C.GRID_H - 1; y >= 0; y--) {
        if (garbageAt(board, x, y)) { floorY = y; continue; }
        const b = get(board, x, y);
        if (isEmpty(b)) continue;
        if (isClearing(b) || b.state === State.SWAPPING) { floorY = y; continue; }
        const d = floorY - 1;
        dest[y] = d;
        if (d > y) hasFaller = true;
        floorY = d;
      }

      if (!hasFaller) {
        board.colFall[x] = 0;
        // nothing left to fall: anything still flagged FALLING has landed
        for (let y = 0; y < C.GRID_H; y++) {
          const b = get(board, x, y);
          if (b.state === State.FALLING) {
            b.state = State.LANDING;
            b.timer = C.LAND_TIME;
            b.fallOffset = 0;
          }
        }
        continue;
      }

      anyFalling = true;
      // mark the whole faller set FALLING up front so they animate together
      for (let y = 0; y < C.GRID_H; y++) {
        if (dest[y] > y) {
          const b = get(board, x, y);
          if (b.state === State.IDLE || b.state === State.LANDING) {
            b.state = State.FALLING;
            if (chainContext) b.chaining = true;
          }
        }
      }

      let off = board.colFall[x] + C.FALL_INC;
      if (off >= C.FALL_UNIT) {
        off -= C.FALL_UNIT;
        // shift every faller down one row, bottom-to-top so cells vacate first
        for (let y = C.GRID_H - 1; y >= 0; y--) {
          if (dest[y] > y) {
            const b = get(board, x, y);
            if (isEmpty(get(board, x, y + 1)) && !garbageAt(board, x, y + 1)) {
              copyCell(get(board, x, y + 1), b);
              clearBlock(b);
            }
          }
        }
      }
      board.colFall[x] = off;
      for (let y = 0; y < C.GRID_H; y++) {
        const b = get(board, x, y);
        if (b.state === State.FALLING) b.fallOffset = off;
      }
    }
    return anyFalling;
  }

  // 5. matches + chain detection ---------------------------------------
  detectMatches(stillFalling) {
    const matches = findMatches(this.board);
    if (matches.length > 0) {
      // is this a chain link? (any matched block carries the chain flag)
      let isChain = false;
      for (const i of matches) if (this.board.cells[i].chaining) isChain = true;

      if (isChain) {
        this.chainCounter++;
      } else {
        this.chainCounter = 1;
      }
      this.chainActive = true;

      // order pops in reading order (top-to-bottom, left-to-right)
      matches.sort((p, q) => p - q);
      const total = matches.length;
      matches.forEach((i, k) => {
        const b = this.board.cells[i];
        b.state = State.FLASHING;
        b.timer = C.FLASH_TIME;
        b.popIndex = k;
        b.popCount = total;
      });

      // an adjacent match detonates resting garbage; clear size decides how
      // many rows of each piece unzip (rows = total - 1)
      triggerGarbage(this, matches, total);

      // scoring
      this.score += total * C.BLOCK_CLEAR_SCORE;
      if (total >= 4) {
        this.combo = total;
        this.score += C.COMBO_BONUS[Math.min(total, C.COMBO_BONUS.length - 1)];
        this.emit(Ev.COMBO, {
          count: total,
          x: matches[0] % C.GRID_W,
          y: Math.floor(matches[0] / C.GRID_W),
        });
        // a big simultaneous clear sends a wide, 1-row garbage slab
        this.pendingOut.push({ w: Math.min(total - 1, C.GRID_W), h: 1 });
      }
      if (this.chainCounter >= 2) {
        this.score +=
          C.CHAIN_BONUS[Math.min(this.chainCounter, C.CHAIN_BONUS.length - 1)];
        this.emit(Ev.CHAIN_LINK, {
          chain: this.chainCounter,
          x: matches[0] % C.GRID_W,
          y: Math.floor(matches[0] / C.GRID_W),
        });
        // deeper chains send taller full-width garbage
        this.pendingOut.push({ w: C.GRID_W, h: Math.min(this.chainCounter - 1, 6) });
      }
      this.emit(Ev.MATCH, {
        count: total,
        chain: this.chainCounter,
        x: matches[0] % C.GRID_W,
        y: Math.floor(matches[0] / C.GRID_W),
      });

      // big clears extend the rise stop time
      this.board.riseStopTimer = Math.max(
        this.board.riseStopTimer,
        C.FLASH_TIME + C.FACE_TIME + total * C.POP_TIME + C.CLEAR_STOP_GRACE
      );

      // breathing room: a combo (4+) or a chain grants EXTRA rise-stop time
      // scaled by its size — most valuable when the stack is near the top.
      let bonus = 0;
      if (this.chainCounter >= 2) bonus += this.chainCounter * C.CHAIN_STOP_BONUS;
      if (total >= 4) bonus += (total - 3) * C.COMBO_STOP_BONUS;
      if (this.danger) bonus = Math.floor(bonus * C.DANGER_STOP_MULT); // panic relief
      this.board.riseStopTimer += bonus;
    }

    // clear chain flags on blocks that settled this tick without matching
    const matchSet = new Set(matches);
    for (let i = 0; i < this.board.cells.length; i++) {
      const b = this.board.cells[i];
      if (b._justSettled) {
        b._justSettled = false;
        if (!matchSet.has(i)) b.chaining = false;
      }
    }
  }

  // 7. rising -----------------------------------------------------------
  advanceRising() {
    const board = this.board;
    if (board.riseStopTimer > 0) board.riseStopTimer--;

    const blocked =
      board.riseStopTimer > 0 ||
      this.anyClearing() ||
      this.activeSwap != null ||
      garbageBusy(board);
    if (blocked) return;

    let rate = C.RISE_BASE + (this.level - 1) * C.RISE_PER_LEVEL;
    if (this.raiseHeld) rate += C.MANUAL_RISE_INC;
    board.riseSub += rate;

    if (board.riseSub >= C.RISE_UNIT) {
      board.riseSub -= C.RISE_UNIT;
      const topOut = shiftUp(board, this.rng);
      // the whole field rose one row, so keep the cursor on the same panels
      // (follow the stack up) instead of letting it drift down a row.
      if (this.cursor.y > 0) this.cursor.y -= 1;
      if (topOut) {
        this.gameOver = true;
        this.emit(Ev.TOP_OUT, {});
      }
      if (this.raiseHeld) this.emit(Ev.RAISE, {});
    }
  }

  // 8. chain end / danger ----------------------------------------------
  resolveChainAndDanger() {
    const live = this.chainLive();
    if (this.chainActive && !live) {
      this.emit(Ev.CHAIN_END, { chain: this.chainCounter });
      this.chainActive = false;
      this.chainCounter = 0;
      this.combo = 0;
      // hold the garbage we built up, then drop it on the opponent ~2s later
      if (this.pendingOut.length > 0) this.sendTimer = C.GARBAGE_SEND_DELAY;
    }
    const top = stackTopRow(this.board);
    const danger = top <= C.DANGER_TOP_ROW && top < C.GRID_H;
    if (danger !== this.danger) {
      this.danger = danger;
      this.emit(Ev.DANGER, { on: danger });
    }
  }

  // release queued garbage to the opponent once the post-chain delay elapses
  advanceSend() {
    if (this.sendTimer > 0) {
      this.sendTimer--;
      if (this.sendTimer === 0 && this.pendingOut.length > 0) {
        for (const spec of this.pendingOut) this.emit(Ev.SEND_GARBAGE, spec);
        this.pendingOut.length = 0;
      }
    }
  }

  advanceLevel() {
    this.levelTimer++;
    if (this.levelTimer >= C.SPEED_LEVEL_FRAMES) {
      this.levelTimer = 0;
      this.level++;
      this.emit(Ev.LEVEL_UP, { level: this.level });
    }
  }

  // ---- helpers --------------------------------------------------------
  anyClearing() {
    const cells = this.board.cells;
    for (let i = 0; i < cells.length; i++) if (isClearing(cells[i])) return true;
    return false;
  }

  anyChainFlag() {
    const cells = this.board.cells;
    for (let i = 0; i < cells.length; i++) if (cells[i].chaining) return true;
    return false;
  }

  chainLive() {
    return this.anyClearing() || this.anyChainFlag() || garbageBusy(this.board);
  }
}

// ---- low-level cell ops (kept as free functions for portability) -------
function setCell(cell, color) {
  cell.color = color;
  cell.state = color === Color.NONE ? State.EMPTY : State.IDLE;
  cell.timer = 0;
  cell.chaining = false;
  cell.fallOffset = 0;
}

function copyCell(dst, src) {
  dst.color = src.color;
  dst.state = src.state;
  dst.timer = src.timer;
  dst.chaining = src.chaining;
  dst.fallOffset = src.fallOffset;
  dst.popIndex = src.popIndex;
  dst.popCount = src.popCount;
}
