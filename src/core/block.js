import { Color, State } from "./types.js";

// A Block is plain value data (no behavior). color === Color.NONE means empty,
// so the grid is a fixed-length array with no nulls — friendly to the Swift port.
export function makeBlock(color = Color.NONE) {
  return {
    color,
    state: color === Color.NONE ? State.EMPTY : State.IDLE,
    timer: 0, // frames remaining in current phase
    chaining: false, // THE chain flag
    fallOffset: 0, // sub-cell fall progress (0..FALL_UNIT)
    popIndex: 0, // order within a clear group
    popCount: 0, // size of the clear group
  };
}

export function isEmpty(b) {
  return b.color === Color.NONE || b.state === State.EMPTY;
}

// "Settled" = part of the standing stack (can be matched / can support others).
export function isIdle(b) {
  return b.state === State.IDLE;
}

// In the middle of the clear timeline (frozen, rise must stop).
export function isClearing(b) {
  return (
    b.state === State.MATCHED ||
    b.state === State.FLASHING ||
    b.state === State.FACE ||
    b.state === State.POPPING
  );
}

export function clearBlock(b) {
  b.color = Color.NONE;
  b.state = State.EMPTY;
  b.timer = 0;
  b.chaining = false;
  b.fallOffset = 0;
  b.popIndex = 0;
  b.popCount = 0;
}
