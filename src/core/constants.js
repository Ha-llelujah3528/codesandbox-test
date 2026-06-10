// All gameplay timing is measured in integer frames at 60Hz.
// This file is the single tuning surface shared with the future Swift port.

export const FPS = 60;

// Playfield dimensions (visible). A separate "next row" is staged below.
export const GRID_W = 6;
export const GRID_H = 12;

// Number of distinct block colors in play.
export const NUM_COLORS = 5;

// --- Garbage / おじゃま (vs) ---
export const GARBAGE_FLASH = 30; // frames a triggered garbage flashes first
export const GARBAGE_CONVERT_STEP = 12; // frames per panel unzip (a bit slower than a normal pop, POP_TIME=9)
export const GARBAGE_HOLD = 30; // 0.5s hold after the last panel unzips, before falling
export const GARBAGE_SEND_DELAY = 120; // 2s after a chain ends before garbage lands on the opponent

// Topmost occupied row at/above which the stack is in "panic" (worried faces,
// shaking, tense BGM). row 0 is the deadline: a block reaching it tops out.
export const DANGER_TOP_ROW = 2;

// --- Swap ---
export const SWAP_TIME = 11; // frames a swap animation takes (visible "flip")

// --- Clear timeline (matched -> flash -> face -> staggered pop -> empty) ---
export const FLASH_TIME = 44; // flashing duration before faces
export const FACE_TIME = 16; // shared "face" hold before popping starts
export const POP_TIME = 9; // frames between each block popping (stagger)
// stop-time (rise pauses) lasts the whole clear + this grace, scaled by size/chain
export const CLEAR_STOP_GRACE = 12;
// extra rise-stop frames granted per chain link / per combo block over 3,
// with a multiplier while in the danger zone (gives you a chance to dig out).
export const CHAIN_STOP_BONUS = 45; // frames per chain link (0.75s each)
export const COMBO_STOP_BONUS = 24; // frames per block beyond 3 in a combo
export const DANGER_STOP_MULT = 2; // doubled while panicking near the top

// --- Gravity / falling (sub-cell fixed point, 16 = one full cell) ---
export const FALL_UNIT = 16;
export const FALL_INC = 2; // sub-units per frame -> 8 frames per cell (slower fall)
export const LAND_TIME = 3; // landing lag before a fallen block becomes idle

// --- Rising (sub-cell fixed point, RISE_UNIT = one full cell) ---
export const RISE_UNIT = 3000;
// base sub-units added per frame; grows with speed level
export const RISE_BASE = 4;
export const RISE_PER_LEVEL = 2;
export const MANUAL_RISE_INC = 90; // while RAISE held
export const SPEED_LEVEL_FRAMES = 60 * 25; // seconds between auto speed-ups

// --- Scoring (chain bonus curve approximates the original) ---
export const CHAIN_BONUS = [
  0, 0, 50, 80, 150, 300, 400, 500, 700, 900, 1100, 1300, 1500, 1800,
];
export const COMBO_BONUS = [0, 0, 0, 0, 20, 30, 50, 60, 70, 80, 100, 140, 170, 210];
export const BLOCK_CLEAR_SCORE = 10;
