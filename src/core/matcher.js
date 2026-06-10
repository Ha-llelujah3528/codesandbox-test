import { GRID_W, GRID_H } from "./constants.js";
import { idx } from "./board.js";
import { State } from "./types.js";

// Only fully-settled (IDLE) blocks can match. Returns an array of matched
// cell indices (deduped). Horizontal and vertical runs of length >= 3.
export function findMatches(board) {
  const matched = new Set();
  const cells = board.cells;

  const canMatch = (i) => cells[i].state === State.IDLE && cells[i].color !== 0;

  // horizontal
  for (let y = 0; y < GRID_H; y++) {
    let run = 1;
    for (let x = 1; x <= GRID_W; x++) {
      const same =
        x < GRID_W &&
        canMatch(idx(x, y)) &&
        canMatch(idx(x - 1, y)) &&
        cells[idx(x, y)].color === cells[idx(x - 1, y)].color;
      if (same) {
        run++;
      } else {
        if (run >= 3) for (let k = x - run; k < x; k++) matched.add(idx(k, y));
        run = 1;
      }
    }
  }

  // vertical
  for (let x = 0; x < GRID_W; x++) {
    let run = 1;
    for (let y = 1; y <= GRID_H; y++) {
      const same =
        y < GRID_H &&
        canMatch(idx(x, y)) &&
        canMatch(idx(x, y - 1)) &&
        cells[idx(x, y)].color === cells[idx(x, y - 1)].color;
      if (same) {
        run++;
      } else {
        if (run >= 3) for (let k = y - run; k < y; k++) matched.add(idx(x, k));
        run = 1;
      }
    }
  }

  return [...matched];
}
