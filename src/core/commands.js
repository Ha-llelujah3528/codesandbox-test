// Abstract input commands. Render/input layers construct these; the engine
// consumes them. Maps onto a Swift `enum Command`.
export const Cmd = {
  MOVE: "MOVE", // {dx, dy}
  SWAP: "SWAP",
  RAISE_DOWN: "RAISE_DOWN",
  RAISE_UP: "RAISE_UP",
};

export const move = (dx, dy) => ({ type: Cmd.MOVE, dx, dy });
export const swap = () => ({ type: Cmd.SWAP });
export const raiseDown = () => ({ type: Cmd.RAISE_DOWN });
export const raiseUp = () => ({ type: Cmd.RAISE_UP });
