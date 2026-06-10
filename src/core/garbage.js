// garbage.js - Versus-mode "おじゃまブロック" (garbage). Garbage blocks are
// rigid rectangles that drop from above onto the stack. They cannot be matched,
// but when a normal match clears next to one it flashes and then "unzips" —
// converting one panel at a time into normal (chain-flagged) panels. Connected
// garbage masses are triggered together so big combos/chains clear more.
//
// Garbage lives in board.garbages (separate from the normal cell grid).

import { GRID_W, GRID_H, NUM_COLORS, FALL_UNIT } from "./constants.js";
import { GState, Ev } from "./types.js";
import { idx, cellOccupied } from "./board.js";
import { makeBlock } from "./block.js";

const GARBAGE_FALL_INC = 3; // sub-units / frame
const GARBAGE_FLASH = 42; // frames a triggered garbage flashes before unzipping
const GARBAGE_CONVERT_STEP = 4; // frames between each panel reveal

// Queue incoming garbage (spawned later, when the board is calm).
export function queueGarbage(engine, w, h) {
  engine.incoming.push({
    w: Math.max(1, Math.min(GRID_W, w | 0)),
    h: Math.max(1, h | 0),
  });
}

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
    y: -spec.h,
    w: spec.w,
    h: spec.h,
    state: GState.FALLING,
    timer: 0,
    fallOff: 0,
    revealed: 0, // panels converted so far (during CONVERTING)
  });
}

// Rigid gravity: each garbage falls as one unit until its bottom row rests.
export function advanceGarbageGravity(engine) {
  const board = engine.board;
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

// Trigger settled garbage adjacent to a just-cleared cell, then flood the
// trigger across connected (touching) garbage so stacked masses go together.
export function triggerGarbage(engine, clearedIdx) {
  const board = engine.board;
  const triggered = new Set();
  const queue = [];
  for (const g of board.garbages) {
    if (g.state === GState.IDLE && _adjacentToCells(g, clearedIdx)) {
      triggered.add(g);
      queue.push(g);
    }
  }
  while (queue.length) {
    const g = queue.pop();
    for (const o of board.garbages) {
      if (o.state === GState.IDLE && !triggered.has(o) && _rectsAdjacent(g, o)) {
        triggered.add(o);
        queue.push(o);
      }
    }
  }
  for (const g of triggered) {
    g.state = GState.FLASHING;
    g.timer = GARBAGE_FLASH;
  }
}

function _adjacentToCells(g, clearedIdx) {
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

// Two garbage rectangles are "connected" if they overlap or share an edge.
function _rectsAdjacent(a, b) {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const xOverlap = a.x < bx2 && b.x < ax2;
  const yOverlap = a.y < by2 && b.y < ay2;
  const xAdj = ax2 === b.x || bx2 === a.x;
  const yAdj = ay2 === b.y || by2 === a.y;
  return (xOverlap && yOverlap) || (xOverlap && yAdj) || (yOverlap && xAdj);
}

// Flash, then reveal panels one at a time (bottom row first, left-to-right,
// going up). When the last panel is revealed the garbage is gone and the new
// panels — now ordinary, chain-flagged blocks — are free to fall and chain.
export function advanceGarbageTransform(engine) {
  const board = engine.board;
  for (let k = board.garbages.length - 1; k >= 0; k--) {
    const g = board.garbages[k];
    if (g.state === GState.FLASHING) {
      g.timer--;
      if (g.timer <= 0) {
        g.state = GState.CONVERTING;
        g.revealed = 0;
        g.timer = GARBAGE_CONVERT_STEP;
      }
    } else if (g.state === GState.CONVERTING) {
      g.timer--;
      if (g.timer > 0) continue;
      g.timer = GARBAGE_CONVERT_STEP;
      const total = g.w * g.h;
      const order = g.revealed;
      const rowFromBottom = Math.floor(order / g.w);
      const col = order % g.w;
      const cx = g.x + col;
      const cy = g.y + g.h - 1 - rowFromBottom;
      if (cy >= 0 && cy < GRID_H) {
        const b = makeBlock(1 + engine.rng.int(NUM_COLORS));
        b.chaining = true;
        board.cells[idx(cx, cy)] = b;
        engine.emit(Ev.GARBAGE_CONVERT, { x: cx, y: cy });
      }
      g.revealed++;
      if (g.revealed >= total) board.garbages.splice(k, 1);
    }
  }
}

// True if any garbage is dropping in or mid-transform (chain/rise bookkeeping).
export function garbageBusy(board) {
  for (const g of board.garbages) {
    if (g.state === GState.FALLING || g.state === GState.FLASHING || g.state === GState.CONVERTING) {
      return true;
    }
  }
  return false;
}
