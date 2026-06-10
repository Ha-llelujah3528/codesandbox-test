import * as C from "../core/constants.js";
import { Color, State, Ev } from "../core/types.js";
import { idx } from "../core/board.js";
import { PALETTE, UI } from "./palette.js";

// Reads engine state + event stream and paints the neon/Gundam playfield.
// Owns no game logic — purely visual (particles, shake, HUD).
export class Renderer {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.engine = engine;
    this.particles = [];
    this.shake = 0;
    this.chainFlash = 0;
    this.bannerText = "";
    this.bannerLife = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.W = w;
    this.H = h;
    const cell = Math.floor(
      Math.min((w * 0.86) / C.GRID_W, (h * 0.78) / C.GRID_H)
    );
    this.cell = cell;
    this.boardW = cell * C.GRID_W;
    this.boardH = cell * C.GRID_H;
    this.originX = Math.floor((w - this.boardW) / 2);
    this.originY = Math.floor((h - this.boardH) / 2) + cell * 0.4;
  }

  // ---- event-driven visuals ------------------------------------------
  consumeEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case Ev.POP:
          this.spawnPop(e.x, e.y, e.color);
          break;
        case Ev.CHAIN_LINK:
          this.shake = Math.min(this.shake + 4 + e.chain, 22);
          this.chainFlash = 1;
          this.banner(`CHAIN x${e.chain}`);
          this.spawnBurst(e.x, e.y, e.chain);
          break;
        case Ev.COMBO:
          this.shake = Math.min(this.shake + 3, 16);
          if (!this.bannerText) this.banner(`COMBO ${e.count}`);
          break;
        case Ev.TOP_OUT:
          this.shake = 26;
          this.banner("SYSTEM DOWN");
          break;
      }
    }
  }

  banner(text) {
    this.bannerText = text;
    this.bannerLife = 70;
  }

  spawnPop(gx, gy, color) {
    const ramp = PALETTE[color] || PALETTE[Color.WHITE];
    const cx = this.originX + (gx + 0.5) * this.cell;
    const cy = this.cellScreenY(gx, gy) + 0.5 * this.cell;
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12 + Math.random();
      const sp = 2 + Math.random() * 4;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 1,
        decay: 0.025 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        color: ramp.glow,
      });
    }
  }

  spawnBurst(gx, gy, chain) {
    const cx = this.originX + (gx + 0.5) * this.cell;
    const cy = this.cellScreenY(gx, gy) + 0.5 * this.cell;
    const n = 14 + chain * 4;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const sp = 4 + Math.random() * 5;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        decay: 0.018,
        size: 3 + Math.random() * 3,
        color: i % 2 ? "#9fd9ff" : "#ff5c8a",
      });
    }
  }

  // ---- geometry -------------------------------------------------------
  riseFrac() {
    return this.engine.board.riseSub / C.RISE_UNIT;
  }

  cellScreenY(gx, gy) {
    const b = this.engine.board.cells[idx(gx, gy)];
    const fall = b ? (b.fallOffset / C.FALL_UNIT) * this.cell : 0;
    return this.originY + gy * this.cell - this.riseFrac() * this.cell + fall;
  }

  // ---- main draw ------------------------------------------------------
  draw() {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // background
    const g = ctx.createLinearGradient(0, 0, 0, this.H);
    g.addColorStop(0, UI.bg1);
    g.addColorStop(1, UI.bg0);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
    this.drawScanlines(ctx);

    // screen shake
    let sx = 0,
      sy = 0;
    if (this.shake > 0.2) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
      this.shake *= 0.86;
    }
    ctx.save();
    ctx.translate(sx, sy);

    this.drawFrame(ctx);
    this.drawBoardCells(ctx);
    this.drawNextRow(ctx);
    this.drawCursor(ctx);
    this.drawParticles(ctx);

    ctx.restore(); // shake

    this.drawHud(ctx);
    this.drawBanner(ctx);
    if (this.engine.danger) this.drawDanger(ctx);
    if (this.engine.gameOver) this.drawGameOver(ctx);

    if (this.chainFlash > 0) this.chainFlash *= 0.85;
    ctx.restore();
  }

  drawScanlines(ctx) {
    ctx.fillStyle = UI.scan;
    for (let y = 0; y < this.H; y += 3) ctx.fillRect(0, y, this.W, 1);
  }

  drawFrame(ctx) {
    const x = this.originX,
      y = this.originY,
      w = this.boardW,
      h = this.boardH;
    const pad = 10;
    // armored outer frame
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = UI.frame;
    ctx.shadowColor = UI.frameLit;
    ctx.shadowBlur = 16;
    this.roundRect(ctx, x - pad, y - pad, w + pad * 2, h + pad * 2, 8);
    ctx.stroke();
    // inner playfield backdrop
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(8,16,36,0.72)";
    ctx.fillRect(x, y, w, h);
    // grid lines
    ctx.strokeStyle = "rgba(90,160,255,0.08)";
    ctx.lineWidth = 1;
    for (let gx = 1; gx < C.GRID_W; gx++) {
      ctx.beginPath();
      ctx.moveTo(x + gx * this.cell, y);
      ctx.lineTo(x + gx * this.cell, y + h);
      ctx.stroke();
    }
    // corner bolts (mecha detail)
    ctx.fillStyle = UI.frameLit;
    const bolts = [
      [x - pad, y - pad],
      [x + w + pad, y - pad],
      [x - pad, y + h + pad],
      [x + w + pad, y + h + pad],
    ];
    for (const [bx, by] of bolts) {
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // clip playfield so rising blocks don't spill out the top
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y - 2, w, h + 2);
    ctx.clip();
    this._clipped = true;
  }

  drawBoardCells(ctx) {
    for (let gy = 0; gy < C.GRID_H; gy++) {
      for (let gx = 0; gx < C.GRID_W; gx++) {
        const b = this.engine.board.cells[idx(gx, gy)];
        if (b.color === Color.NONE) continue;
        const px = this.originX + gx * this.cell;
        const py = this.cellScreenY(gx, gy);
        this.drawBlock(ctx, px, py, b, false);
      }
    }
  }

  drawNextRow(ctx) {
    const row = this.engine.board.nextRow;
    const baseY =
      this.originY + C.GRID_H * this.cell - this.riseFrac() * this.cell;
    ctx.save();
    ctx.globalAlpha = 0.45;
    for (let gx = 0; gx < C.GRID_W; gx++) {
      if (row[gx] === Color.NONE) continue;
      const px = this.originX + gx * this.cell;
      this.drawBlock(
        ctx,
        px,
        baseY,
        { color: row[gx], state: State.IDLE, timer: 0 },
        true
      );
    }
    ctx.restore();
    if (this._clipped) {
      ctx.restore();
      this._clipped = false;
    }
  }

  drawBlock(ctx, px, py, b, dim) {
    const cell = this.cell;
    const ramp = PALETTE[b.color] || PALETTE[Color.WHITE];
    const inset = cell * 0.07;
    let x = px + inset;
    let y = py + inset;
    let s = cell - inset * 2;
    let alpha = 1;
    let flash = false;

    if (b.state === State.FLASHING) {
      flash = (this.engine.frame >> 1) % 2 === 0;
    } else if (b.state === State.POPPING) {
      alpha = 0.85;
      flash = true;
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // glow
    ctx.shadowColor = ramp.glow;
    ctx.shadowBlur = dim ? 4 : flash ? 24 : 12;

    // body gradient
    const grad = ctx.createLinearGradient(x, y, x, y + s);
    if (flash) {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, ramp.edge);
    } else {
      grad.addColorStop(0, ramp.core);
      grad.addColorStop(1, ramp.dark);
    }
    ctx.fillStyle = grad;
    this.roundRect(ctx, x, y, s, s, cell * 0.16);
    ctx.fill();

    // bright rim
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = flash ? "#ffffff" : ramp.edge;
    this.roundRect(ctx, x + 0.75, y + 0.75, s - 1.5, s - 1.5, cell * 0.14);
    ctx.stroke();

    // mecha panel detail: a divider line + rivet + corner notch
    ctx.globalAlpha = alpha * 0.5;
    ctx.strokeStyle = ramp.dark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.18, y + s * 0.62);
    ctx.lineTo(x + s * 0.82, y + s * 0.62);
    ctx.stroke();
    ctx.fillStyle = ramp.edge;
    ctx.beginPath();
    ctx.arc(x + s * 0.2, y + s * 0.22, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // colorblind-safe glyph / face
    ctx.globalAlpha = alpha * 0.9;
    if (b.state === State.FACE) this.drawFace(ctx, x, y, s);
    else this.drawGlyph(ctx, ramp.glyph, x + s / 2, y + s * 0.38, s * 0.16, flash ? "#0a1430" : "#ffffff");

    ctx.restore();
  }

  drawGlyph(ctx, kind, cx, cy, r, col) {
    ctx.save();
    ctx.fillStyle = col;
    ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    switch (kind) {
      case "circle":
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        break;
      case "triangle":
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy + r);
        ctx.lineTo(cx - r, cy + r);
        break;
      case "diamond":
        ctx.moveTo(cx, cy - r);
        ctx.lineTo(cx + r, cy);
        ctx.lineTo(cx, cy + r);
        ctx.lineTo(cx - r, cy);
        break;
      case "square":
        ctx.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
        break;
      case "cross":
        ctx.rect(cx - r * 0.35, cy - r, r * 0.7, r * 2);
        ctx.rect(cx - r, cy - r * 0.35, r * 2, r * 0.7);
        break;
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawFace(ctx, x, y, s) {
    ctx.save();
    ctx.strokeStyle = "#0a1430";
    ctx.lineWidth = 2;
    const ey = y + s * 0.42;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.32, ey);
    ctx.lineTo(x + s * 0.38, ey);
    ctx.moveTo(x + s * 0.62, ey);
    ctx.lineTo(x + s * 0.68, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + s * 0.5, y + s * 0.62, s * 0.12, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.restore();
  }

  drawCursor(ctx) {
    const { x: cx, y: cy } = this.engine.cursor;
    const px = this.originX + cx * this.cell;
    const py = this.originY + cy * this.cell - this.riseFrac() * this.cell;
    const cell = this.cell;
    const w = cell * 2;
    const t = (Math.sin(this.engine.frame * 0.18) + 1) * 0.5;
    ctx.save();
    ctx.strokeStyle = `rgba(255,${120 + t * 80},${150 + t * 60},0.95)`;
    ctx.shadowColor = UI.accent;
    ctx.shadowBlur = 14;
    ctx.lineWidth = 2.5;
    // targeting brackets at four corners
    const m = 3;
    const len = cell * 0.34;
    const corners = [
      [px - m, py - m, 1, 1],
      [px + w + m, py - m, -1, 1],
      [px - m, py + cell + m, 1, -1],
      [px + w + m, py + cell + m, -1, -1],
    ];
    for (const [bx, by, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(bx, by + dy * len);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + dx * len, by);
      ctx.stroke();
    }
    // center reticle line between the two cells
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(px + cell, py + cell * 0.2);
    ctx.lineTo(px + cell, py + cell * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  drawParticles(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- HUD ------------------------------------------------------------
  drawHud(ctx) {
    ctx.save();
    ctx.fillStyle = UI.hud;
    ctx.textBaseline = "top";

    const topY = Math.max(12, this.originY - this.cell * 1.7);
    // SCORE panel
    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.globalAlpha = 0.7;
    ctx.fillText("SCORE", this.originX, topY);
    ctx.globalAlpha = 1;
    ctx.font = "bold 26px ui-monospace, Menlo, monospace";
    ctx.shadowColor = UI.frameLit;
    ctx.shadowBlur = 10;
    ctx.fillText(String(this.engine.score).padStart(7, "0"), this.originX, topY + 14);
    ctx.shadowBlur = 0;

    // LEVEL panel (right)
    ctx.textAlign = "right";
    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.globalAlpha = 0.7;
    const rx = this.originX + this.boardW;
    ctx.fillText("SPD LV", rx, topY);
    ctx.globalAlpha = 1;
    ctx.font = "bold 26px ui-monospace, Menlo, monospace";
    ctx.fillText(String(this.engine.level), rx, topY + 14);
    ctx.textAlign = "left";

    // live chain readout (cockpit ticker)
    if (this.engine.chainActive && this.engine.chainCounter >= 2) {
      ctx.font = "bold 14px ui-monospace, Menlo, monospace";
      ctx.fillStyle = UI.accent;
      ctx.shadowColor = UI.accent;
      ctx.shadowBlur = 12;
      ctx.fillText(
        `▲ CHAIN x${this.engine.chainCounter}`,
        this.originX,
        this.originY + this.boardH + 12
      );
    }
    ctx.restore();
  }

  drawBanner(ctx) {
    if (this.bannerLife <= 0) return;
    this.bannerLife--;
    const t = this.bannerLife / 70;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const scale = 1 + (1 - t) * 0.4;
    ctx.translate(this.W / 2, this.originY + this.boardH * 0.4);
    ctx.scale(scale, scale);
    ctx.font = "bold 40px ui-monospace, Menlo, monospace";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = UI.accent;
    ctx.shadowBlur = 24;
    ctx.fillText(this.bannerText, 0, 0);
    ctx.restore();
  }

  drawDanger(ctx) {
    const a = (Math.sin(this.engine.frame * 0.3) + 1) * 0.5 * 0.18;
    ctx.save();
    ctx.fillStyle = `rgba(255,40,70,${a})`;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.globalAlpha = (Math.sin(this.engine.frame * 0.3) + 1) * 0.5;
    ctx.fillStyle = UI.accent;
    ctx.font = "bold 16px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("! WARNING !", this.W / 2, this.originY - this.cell * 0.4);
    ctx.restore();
  }

  drawGameOver(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(2,4,12,0.72)";
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = UI.accent;
    ctx.shadowBlur = 24;
    ctx.font = "bold 38px ui-monospace, Menlo, monospace";
    ctx.fillText("SYSTEM DOWN", this.W / 2, this.H / 2 - 30);
    ctx.font = "16px ui-monospace, Menlo, monospace";
    ctx.shadowBlur = 0;
    ctx.fillStyle = UI.hud;
    ctx.fillText(
      `SCORE ${String(this.engine.score).padStart(7, "0")}`,
      this.W / 2,
      this.H / 2 + 12
    );
    ctx.fillText("R / RESTART", this.W / 2, this.H / 2 + 44);
    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
