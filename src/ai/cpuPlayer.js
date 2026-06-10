// cpuPlayer.js - A lightweight heuristic AI for versus mode. It reads the
// engine state and returns the same abstract commands a human would, so the
// engine stays oblivious to who is driving it. Acts on a reaction delay so the
// play feels human rather than frame-perfect.

import { move, swap } from "../core/commands.js";
import { GRID_W, GRID_H } from "../core/constants.js";
import { State } from "../core/types.js";
import { idx } from "../core/board.js";

export class CpuPlayer {
  constructor(engine, opts = {}) {
    this.e = engine;
    this.reaction = opts.reaction ?? 7; // frames between deliberate actions
    this.cooldown = 24; // small grace before the CPU starts
    this.plan = null; // {x, y} cursor slot to swap at
  }

  // Returns commands for this frame.
  frame() {
    const e = this.e;
    if (e.gameOver) return [];
    if (this.cooldown > 0) {
      this.cooldown--;
      return [];
    }
    if (!this.plan) this.plan = this._think();
    if (!this.plan) {
      this.cooldown = this.reaction;
      return [];
    }
    const cur = e.cursor;
    if (cur.x !== this.plan.x) {
      this.cooldown = Math.max(2, this.reaction - 3);
      return [move(Math.sign(this.plan.x - cur.x), 0)];
    }
    if (cur.y !== this.plan.y) {
      this.cooldown = Math.max(2, this.reaction - 3);
      return [move(0, Math.sign(this.plan.y - cur.y))];
    }
    this.plan = null;
    this.cooldown = this.reaction + 2;
    return [swap()];
  }

  // Pick the best horizontal swap of two settled blocks: maximise immediate
  // clears, else nudge same colours closer together.
  _think() {
    const g = this._colorGrid();
    const swappable = (x, y) => {
      const a = this.e.board.cells[idx(x, y)];
      const b = this.e.board.cells[idx(x + 1, y)];
      return a.state === State.IDLE && b.state === State.IDLE && a.color !== b.color;
    };

    let best = null;
    let bestClear = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W - 1; x++) {
        if (!swappable(x, y)) continue;
        const i = idx(x, y), j = idx(x + 1, y);
        [g[i], g[j]] = [g[j], g[i]];
        const c = this._countMatches(g);
        [g[i], g[j]] = [g[j], g[i]];
        if (c > bestClear) {
          bestClear = c;
          best = { x, y };
        }
      }
    }
    if (best) return best;

    // no clear available — make the most "constructive" tidy swap
    let bestAdj = -1;
    let tidy = null;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W - 1; x++) {
        if (!swappable(x, y)) continue;
        const i = idx(x, y), j = idx(x + 1, y);
        const base = this._adjScore(g);
        [g[i], g[j]] = [g[j], g[i]];
        const s = this._adjScore(g) - base;
        [g[i], g[j]] = [g[j], g[i]];
        if (s > bestAdj) {
          bestAdj = s;
          tidy = { x, y };
        }
      }
    }
    return bestAdj > 0 ? tidy : null;
  }

  _colorGrid() {
    const cells = this.e.board.cells;
    const g = new Array(GRID_W * GRID_H);
    for (let i = 0; i < g.length; i++) {
      const b = cells[i];
      g[i] = b.state === State.IDLE && b.color !== 0 ? b.color : -1;
    }
    return g;
  }

  _countMatches(g) {
    const set = new Set();
    for (let y = 0; y < GRID_H; y++) {
      let run = 1;
      for (let x = 1; x <= GRID_W; x++) {
        const same = x < GRID_W && g[idx(x, y)] !== -1 && g[idx(x, y)] === g[idx(x - 1, y)];
        if (same) run++;
        else {
          if (run >= 3) for (let k = x - run; k < x; k++) set.add(idx(k, y));
          run = 1;
        }
      }
    }
    for (let x = 0; x < GRID_W; x++) {
      let run = 1;
      for (let y = 1; y <= GRID_H; y++) {
        const same = y < GRID_H && g[idx(x, y)] !== -1 && g[idx(x, y)] === g[idx(x, y - 1)];
        if (same) run++;
        else {
          if (run >= 3) for (let k = y - run; k < y; k++) set.add(idx(x, k));
          run = 1;
        }
      }
    }
    return set.size;
  }

  // Count orthogonal same-colour neighbours (a proxy for "close to matching").
  _adjScore(g) {
    let s = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const c = g[idx(x, y)];
        if (c === -1) continue;
        if (x + 1 < GRID_W && g[idx(x + 1, y)] === c) s++;
        if (y + 1 < GRID_H && g[idx(x, y + 1)] === c) s++;
      }
    }
    return s;
  }
}
