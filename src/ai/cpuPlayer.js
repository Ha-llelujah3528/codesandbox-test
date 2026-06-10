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

  // Pick the best swap. Each candidate is simulated INCLUDING the resulting
  // fall (gravity collapse), so the CPU can deliberately drop a block into a
  // gap to complete a line. Scoring prefers clears, then building same-colour
  // adjacency, then flattening the tallest column — so it never just idles
  // when a column is clumped (it keeps spreading panels out).
  _think() {
    const base = this._colorGrid(); // -1 empty, -2 wall, >=0 colour
    const swappable = (x, y) => {
      const a = this.e.board.cells[idx(x, y)];
      const b = this.e.board.cells[idx(x + 1, y)];
      const okA = a.state === State.IDLE || a.state === State.EMPTY;
      const okB = b.state === State.IDLE || b.state === State.EMPTY;
      if (!okA || !okB) return false;
      if (a.state === State.EMPTY && b.state === State.EMPTY) return false;
      return a.color !== b.color;
    };

    let best = null;
    let bestScore = -Infinity;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W - 1; x++) {
        if (!swappable(x, y)) continue;
        const g = base.slice();
        const i = idx(x, y), j = idx(x + 1, y);
        [g[i], g[j]] = [g[j], g[i]];
        this._collapse(g);
        const clears = this._countMatches(g);
        const adj = this._adjScore(g);
        const maxH = this._maxHeight(g);
        let score = clears * 1000 + adj * 5 - maxH * 2;
        if (this._last && this._last.x === x && this._last.y === y) score -= 8; // anti-thrash
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    this._last = best;
    return best;
  }

  // -1 empty, -2 immovable (garbage / clearing / swapping), >=0 idle colour
  _colorGrid() {
    const cells = this.e.board.cells;
    const g = new Array(GRID_W * GRID_H);
    for (let i = 0; i < g.length; i++) {
      const b = cells[i];
      if (b.state === State.IDLE && b.color !== 0) g[i] = b.color;
      else if (b.state === State.EMPTY || b.color === 0) g[i] = -1;
      else g[i] = -2; // wall
    }
    // mark garbage cells as walls
    for (const gar of this.e.board.garbages) {
      for (let yy = gar.y; yy < gar.y + gar.h; yy++) {
        for (let xx = gar.x; xx < gar.x + gar.w; xx++) {
          if (yy >= 0 && yy < GRID_H) g[idx(xx, yy)] = -2;
        }
      }
    }
    return g;
  }

  // Collapse each column so movable colours fall over walls/floor. Walls
  // (-2, e.g. garbage) partition the column into segments; colours compact to
  // the bottom of their own segment, preserving vertical order.
  _collapse(g) {
    for (let x = 0; x < GRID_W; x++) {
      let segBottom = GRID_H - 1;
      for (let y = GRID_H - 1; y >= -1; y--) {
        const isWall = y < 0 || g[idx(x, y)] === -2;
        if (!isWall) continue;
        const colors = [];
        for (let k = y + 1; k <= segBottom; k++) {
          if (g[idx(x, k)] >= 0) colors.push(g[idx(x, k)]);
        }
        let yy = segBottom;
        for (let c = colors.length - 1; c >= 0; c--) g[idx(x, yy--)] = colors[c];
        for (; yy >= y + 1; yy--) g[idx(x, yy)] = -1;
        segBottom = y - 1;
      }
    }
  }

  _maxHeight(g) {
    let max = 0;
    for (let x = 0; x < GRID_W; x++) {
      for (let y = 0; y < GRID_H; y++) {
        if (g[idx(x, y)] !== -1) {
          max = Math.max(max, GRID_H - y);
          break;
        }
      }
    }
    return max;
  }

  _countMatches(g) {
    const set = new Set();
    for (let y = 0; y < GRID_H; y++) {
      let run = 1;
      for (let x = 1; x <= GRID_W; x++) {
        const same = x < GRID_W && g[idx(x, y)] >= 0 && g[idx(x, y)] === g[idx(x - 1, y)];
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
        const same = y < GRID_H && g[idx(x, y)] >= 0 && g[idx(x, y)] === g[idx(x, y - 1)];
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
        if (c < 0) continue; // skip empty (-1) and walls (-2)
        if (x + 1 < GRID_W && g[idx(x + 1, y)] === c) s++;
        if (y + 1 < GRID_H && g[idx(x, y + 1)] === c) s++;
      }
    }
    return s;
  }
}
