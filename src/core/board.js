import { GRID_W, GRID_H, NUM_COLORS } from "./constants.js";
import { Color, State } from "./types.js";
import { makeBlock, isEmpty } from "./block.js";

// Row 0 is the top, row GRID_H-1 is the bottom of the visible playfield.
// `nextRow` is the row currently scrolling in from below.

export function idx(x, y) {
  return y * GRID_W + x;
}

export function createBoard() {
  const cells = new Array(GRID_W * GRID_H);
  for (let i = 0; i < cells.length; i++) cells[i] = makeBlock(Color.NONE);
  return {
    cells,
    nextRow: new Array(GRID_W).fill(Color.NONE),
    riseSub: 0, // 0..RISE_UNIT
    riseStopTimer: 0,
  };
}

export function get(board, x, y) {
  return board.cells[idx(x, y)];
}

// Random color avoiding an immediate horizontal/vertical 3-match at (x,y).
export function pickColor(rng, board, x, y, nextRow) {
  for (let attempt = 0; attempt < 16; attempt++) {
    const c = 1 + rng.int(NUM_COLORS);
    // horizontal: two same to the left
    const l1 = x >= 1 ? colorAt(board, x - 1, y, nextRow) : -1;
    const l2 = x >= 2 ? colorAt(board, x - 2, y, nextRow) : -1;
    if (c === l1 && c === l2) continue;
    // vertical: two same below (only meaningful for stack cells)
    if (y < GRID_H) {
      const d1 = colorAt(board, x, y + 1, nextRow);
      const d2 = colorAt(board, x, y + 2, nextRow);
      if (c === d1 && c === d2) continue;
    }
    return c;
  }
  return 1 + rng.int(NUM_COLORS);
}

function colorAt(board, x, y, nextRow) {
  if (y === GRID_H) return nextRow ? nextRow[x] : Color.NONE;
  if (y < 0 || y >= GRID_H) return Color.NONE;
  return board.cells[idx(x, y)].color;
}

// Fill the bottom `rows` rows with a valid (no instant match) starting stack.
export function fillStartStack(board, rng, rows) {
  for (let y = GRID_H - 1; y >= GRID_H - rows; y--) {
    for (let x = 0; x < GRID_W; x++) {
      const c = pickColor(rng, board, x, y, board.nextRow);
      board.cells[idx(x, y)] = makeBlock(c);
    }
  }
  regenNextRow(board, rng);
}

export function regenNextRow(board, rng) {
  for (let x = 0; x < GRID_W; x++) board.nextRow[x] = Color.NONE;
  for (let x = 0; x < GRID_W; x++) {
    board.nextRow[x] = pickColor(rng, board, x, GRID_H, board.nextRow);
  }
}

// Shift the whole stack up by one row; pull nextRow into the bottom.
// Returns true if this caused a top-out (a block pushed past the top).
export function shiftUp(board, rng) {
  // anything occupying the top row will be pushed out -> top-out
  let topOut = false;
  for (let x = 0; x < GRID_W; x++) {
    if (!isEmpty(board.cells[idx(x, 0)])) topOut = true;
  }
  for (let y = 0; y < GRID_H - 1; y++) {
    for (let x = 0; x < GRID_W; x++) {
      board.cells[idx(x, y)] = board.cells[idx(x, y + 1)];
    }
  }
  for (let x = 0; x < GRID_W; x++) {
    board.cells[idx(x, GRID_H - 1)] = makeBlock(board.nextRow[x]);
  }
  regenNextRow(board, rng);
  return topOut;
}

// Highest occupied row (smallest y). GRID_H means empty board.
export function stackTopRow(board) {
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!isEmpty(board.cells[idx(x, y)])) return y;
    }
  }
  return GRID_H;
}
