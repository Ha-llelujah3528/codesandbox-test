// Shared enums for the deterministic core. Plain integer constants so they
// map cleanly onto Swift enums later.

export const Color = {
  NONE: 0,
  WHITE: 1, // RX-78 white
  BLUE: 2, // RX-78 blue
  RED: 3, // RX-78 red
  YELLOW: 4, // RX-78 yellow
  GREEN: 5, // Zeon green
};

export const State = {
  EMPTY: 0,
  IDLE: 1,
  SWAPPING: 2,
  MATCHED: 3, // brief hold right after detection
  FLASHING: 4,
  FACE: 5,
  POPPING: 6,
  FALLING: 7,
  LANDING: 8,
};

// Garbage-block lifecycle (vs mode). Garbage lives in board.garbages, not in
// the normal cell grid.
export const GState = {
  FALLING: 0, // dropping in from above
  IDLE: 1, // resting on the stack
  FLASHING: 2, // triggered by an adjacent clear, about to convert
  CONVERTING: 3, // bottom row turning into normal blocks
};

// Event type tags emitted by engine.tick — consumed by render/audio only.
export const Ev = {
  CURSOR_MOVE: "CURSOR_MOVE",
  SWAP: "SWAP",
  MATCH: "MATCH", // {count, chain, x, y}
  POP: "POP", // {color, x, y, index, total}
  CHAIN_LINK: "CHAIN_LINK", // {chain, x, y}
  CHAIN_END: "CHAIN_END", // {chain}
  COMBO: "COMBO", // {count, x, y}
  RAISE: "RAISE",
  LAND: "LAND", // {x, y}
  DANGER: "DANGER", // {on}
  TOP_OUT: "TOP_OUT",
  LEVEL_UP: "LEVEL_UP", // {level}
  SEND_GARBAGE: "SEND_GARBAGE", // {w, h} — outgoing garbage for the opponent
  GARBAGE_LAND: "GARBAGE_LAND", // {x, y, w}
  GARBAGE_CONVERT: "GARBAGE_CONVERT", // {x, y, w}
};
