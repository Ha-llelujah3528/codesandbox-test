// garbage.js - Versus-mode "おじゃまブロック" (garbage). A garbage block is ONE
// big armored panel (sized by the chain/combo that sent it). When a match
// clears next to it, the whole slab flashes, then "unzips" panel-by-panel from
// the BOTTOM — but only as many rows as the clear was strong:
//   clear of 3 -> 2 rows, 4 -> 3, 5 -> 4, 6 -> 5  (rows = clearSize - 1).
// Rows beyond that flash but stay garbage. After the last panel unzips the
// converted panels hold position briefly, then drop (become normal, chainable).

import {
  GRID_W,
  GRID_H,
  NUM_COLORS,
  FALL_UNIT,
  GARBAGE_FLASH,
  GARBAGE_CONVERT_STEP,
  GARBAGE_HOLD,
} from "./constants.js";
import { GState, Ev } from "./types.js";
import { idx, cellOccupied } from "./board.js";
import { makeBlock } from "./block.js";

const GARBAGE_FALL_INC = 3;

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
    revealed: 0, // panels unzipped so far
    convertCells: 0, // how many panels will unzip this trigger (rows*w)
    colors: [], // revealed panel colours, in reveal order
  });
}

export function advanceGarbageGravity(engine) {
  const board = engine.board;
  const sorted = board.garbages.slice().sort((a, b) => b.y - a.y);
  for (const g of sorted) {
    if (g.state === GState.FLASHING || g.state === GState.CONVERTING || g.state === GState.HOLD) continue;
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

// Trigger settled garbage adjacent to a just-cleared cell, flooding across
// connected garbage so a stacked mass reacts together. `power` = number of
// panels in the clear; it decides how many rows of each piece convert.
export function triggerGarbage(engine, clearedIdx, power) {
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
    g.power = power;
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

function _rectsAdjacent(a, b) {
  const ax2 = a.x + a.w, ay2 = a.y + a.h;
  const bx2 = b.x + b.w, by2 = b.y + b.h;
  const xOverlap = a.x < bx2 && b.x < ax2;
  const yOverlap = a.y < by2 && b.y < ay2;
  const xAdj = ax2 === b.x || bx2 === a.x;
  const yAdj = ay2 === b.y || by2 === a.y;
  return (xOverlap && yOverlap) || (xOverlap && yAdj) || (yOverlap && xAdj);
}

export function advanceGarbageTransform(engine) {
  const board = engine.board;
  for (let k = board.garbages.length - 1; k >= 0; k--) {
    const g = board.garbages[k];
    if (g.state === GState.FLASHING) {
      g.timer--;
      if (g.timer <= 0) {
        const rows = Math.min(Math.max(0, (g.power || 3) - 1), g.h); // clearSize-1 rows
        g.convertCells = rows * g.w;
        g.revealed = 0;
        g.colors = [];
        if (g.convertCells <= 0) {
          g.state = GState.IDLE; // nothing to convert, stays garbage
        } else {
          g.state = GState.CONVERTING;
          g.timer = GARBAGE_CONVERT_STEP;
        }
      }
    } else if (g.state === GState.CONVERTING) {
      g.timer--;
      if (g.timer > 0) continue;
      g.timer = GARBAGE_CONVERT_STEP;
      // reveal the next panel (bottom row first, left-to-right, going up)
      const order = g.revealed;
      const cx = g.x + (order % g.w);
      const cy = g.y + g.h - 1 - Math.floor(order / g.w);
      g.colors[order] = 1 + engine.rng.int(NUM_COLORS);
      engine.emit(Ev.GARBAGE_CONVERT, { x: cx, y: cy });
      g.revealed++;
      if (g.revealed >= g.convertCells) {
        g.state = GState.HOLD;
        g.timer = GARBAGE_HOLD;
      }
    } else if (g.state === GState.HOLD) {
      g.timer--;
      if (g.timer > 0) continue;
      // commit: write the unzipped panels into the grid, shrink the slab
      const rows = g.convertCells / g.w;
      for (let order = 0; order < g.convertCells; order++) {
        const cx = g.x + (order % g.w);
        const cy = g.y + g.h - 1 - Math.floor(order / g.w);
        const b = makeBlock(g.colors[order] || 1 + engine.rng.int(NUM_COLORS));
        b.chaining = true; // newly revealed panels can extend a chain
        board.cells[idx(cx, cy)] = b;
      }
      if (rows >= g.h) {
        board.garbages.splice(k, 1); // whole slab consumed
      } else {
        g.h -= rows; // keep the un-converted top rows as a smaller slab
        g.revealed = 0;
        g.convertCells = 0;
        g.colors = [];
        g.state = GState.IDLE;
      }
    }
  }
}

export function garbageBusy(board) {
  for (const g of board.garbages) {
    if (g.state !== GState.IDLE) return true; // FALLING/FLASHING/CONVERTING/HOLD
  }
  return false;
}
