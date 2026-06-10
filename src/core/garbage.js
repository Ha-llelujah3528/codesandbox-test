// garbage.js - Versus-mode "おじゃまブロック" (garbage). Garbage blocks are
// rigid rectangles that drop from above onto the stack. They cannot be matched,
// but when a normal match clears next to one it flashes and transforms wholesale
// into normal panels (which carry the chain flag, so they can extend combos).
//
// Garbage lives in board.garbages (separate from the normal cell grid) which
// keeps the matcher/gravity for normal blocks simple.

import { GRID_W, GRID_H, NUM_COLORS, FALL_UNIT } from "./constants.js";
import { GState, Ev } from "./types.js";
import { idx, cellOccupied } from "./board.js";
import { makeBlock } from "./block.js";

const GARBAGE_FALL_INC = 3; // sub-units / frame (FALL_UNIT = one cell)
const GARBAGE_FLASH = 42; // frames a triggered garbage flashes before converting

// Queue incoming garbage (spawned later, when the board is calm).
export function queueGarbage(engine, w, h) {
  engine.incoming.push({
    w: Math.max(1, Math.min(GRID_W, w | 0)),
    h: Math.max(1, h | 0),
  });
}

// Spawn one queued garbage above the stack, but only while nothing is mid-clear
// and no other garbage is still dropping (keeps drops readable + deterministic).
export function spawnGarbage(engine) {
  if (engine.incoming.length === 0) return;
  if (engine.anyClearing()) return;
  for (const g of engine.board.garbages) if (g.state === GState.FALLING) return;
  const spec = engine.incoming.shift();
  const maxX = GRID_W - spec.w;
  const x = engine.rng.int(maxX + 1);
  engine.board.garbages.push({
    id: engine.nextGid++,
    x,
    y: -spec.h, // starts fully above the field, then falls in
    w: spec.w,
    h: spec.h,
    state: GState.FALLING,
    timer: 0,
    fallOff: 0,
  });
}

// Rigid gravity: each garbage falls as one unit until its bottom row rests on a
// block, another garbage, or the floor.
export function advanceGarbageGravity(engine) {
  const board = engine.board;
  // settle the lowest garbage first
  const sorted = board.garbages.slice().sort((a, b) => b.y - a.y);
  for (const g of sorted) {
    if (g.state === GState.FLASHING || g.state === GState.CONVERTING) continue;
    const below = g.y + g.h;
    let supported = false;
    for (let x = g.x; x < g.x + g.w; x++) {
      if (cellOccupied(board, x, below, g)) {
        supported = true;
        break;
      }
    }
    if (supported) {
      if (g.state === GState.FALLING) {
        g.state = GState.IDLE;
        g.fallOff = 0;
        engine.emit(Ev.GARBAGE_LAND, { x: g.x, y: g.y, w: g.w });
      }
    } else {
      g.state = GState.FALLING;
      g.fallOff += GARBAGE_FALL_INC;
      if (g.fallOff >= FALL_UNIT) {
        g.fallOff -= FALL_UNIT;
        g.y += 1;
      }
    }
  }
}

// Trigger any settled garbage orthogonally adjacent to a just-cleared cell.
export function triggerGarbage(engine, clearedIdx) {
  const board = engine.board;
  for (const g of board.garbages) {
    if (g.state !== GState.IDLE) continue;
    if (_adjacent(g, clearedIdx)) {
      g.state = GState.FLASHING;
      g.timer = GARBAGE_FLASH;
    }
  }
}

function _adjacent(g, clearedIdx) {
  for (const i of clearedIdx) {
    const cx = i % GRID_W;
    const cy = Math.floor(i / GRID_W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= g.x && nx < g.x + g.w && ny >= g.y && ny < g.y + g.h) return true;
    }
  }
  return false;
}

// Advance flashing/converting garbage. A converted garbage turns its whole
// rectangle into normal (chain-flagged) panels and is removed.
export function advanceGarbageTransform(engine) {
  const board = engine.board;
  for (let k = board.garbages.length - 1; k >= 0; k--) {
    const g = board.garbages[k];
    if (g.state === GState.FLASHING) {
      g.timer--;
      if (g.timer <= 0) g.state = GState.CONVERTING;
    } else if (g.state === GState.CONVERTING) {
      for (let yy = g.y; yy < g.y + g.h; yy++) {
        if (yy < 0 || yy >= GRID_H) continue;
        for (let x = g.x; x < g.x + g.w; x++) {
          const b = makeBlock(1 + engine.rng.int(NUM_COLORS));
          b.chaining = true; // let the freshly revealed panels extend a chain
          board.cells[idx(x, yy)] = b;
        }
      }
      engine.emit(Ev.GARBAGE_CONVERT, { x: g.x, y: Math.max(0, g.y), w: g.w });
      board.garbages.splice(k, 1);
    }
  }
}

// True if any garbage is still dropping or mid-transform (chain bookkeeping).
export function garbageBusy(board) {
  for (const g of board.garbages) {
    if (g.state === GState.FALLING || g.state === GState.FLASHING || g.state === GState.CONVERTING) {
      return true;
    }
  }
  return false;
}
