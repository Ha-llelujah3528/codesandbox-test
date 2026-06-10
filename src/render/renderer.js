import * as C from "../core/constants.js";
import { Color, State, GState, Ev } from "../core/types.js";
import { idx } from "../core/board.js";
import { PALETTE, UI } from "./palette.js";

// Reads engine state + event stream and paints the neon/Gundam playfield.
// Owns no game logic — purely visual (particles, shake, HUD).
export class Renderer {
  constructor(canvas, engine, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.engine = engine;
    this.particles = [];
    this.shake = 0;
    this.chainFlash = 0;
    this.bannerText = "";
    this.bannerLife = 0;
    this.paused = false;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    // multi-board support: render into a sub-rectangle of the canvas.
    this.area = opts.area || null; // {x,y,w,h} in CSS px; null = full window
    this.primary = opts.primary !== false; // primary clears the full background
    this.showOverlays = opts.showOverlays !== false; // pause/gameover overlays
    this.useTouchInset = opts.useTouchInset !== false; // reserve bottom for pad
    this.label = opts.label || ""; // small board title (e.g. "YOU" / "CPU")
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setArea(area) {
    this.area = area;
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // the canvas always spans the whole window; areas carve it up
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.W = w;
    this.H = h;

    const area = this.area || { x: 0, y: 0, w, h };
    const topInset = this.label ? 64 : 76;
    let bottomInset = 28;
    if (this.useTouchInset) {
      const tc = document.getElementById("touch-controls");
      if (tc && getComputedStyle(tc).display !== "none") {
        const m = tc.getBoundingClientRect().height;
        bottomInset = (m > 20 ? m : 168) + 10;
      }
    }
    const availH = area.h - topInset - bottomInset;
    const widthFrac = this.area ? 0.96 : 0.9;
    const cell = Math.floor(
      Math.min((area.w * widthFrac) / C.GRID_W, availH / C.GRID_H)
    );
    this.cell = cell;
    this.boardW = cell * C.GRID_W;
    this.boardH = cell * C.GRID_H;
    this.originX = area.x + Math.floor((area.w - this.boardW) / 2);
    this.originY = area.y + Math.floor(topInset + Math.max(0, (availH - this.boardH) / 2));
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
          // always show it; a CHAIN_LINK later this tick will override it
          this.banner(`COMBO ${e.count}`);
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

    // background — only the primary renderer paints the full window
    if (this.primary) {
      const g = ctx.createLinearGradient(0, 0, 0, this.H);
      g.addColorStop(0, UI.bg1);
      g.addColorStop(1, UI.bg0);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
      this.drawScanlines(ctx);
    }

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
    this.drawGarbage(ctx);
    this.drawNextRow(ctx);
    this.drawCursor(ctx);
    this.drawParticles(ctx);

    ctx.restore(); // shake

    if (this.label) this.drawLabel(ctx);
    this.drawHud(ctx);
    this.drawBanner(ctx);
    if (this.engine.danger && !this.engine.gameOver) this.drawDanger(ctx);
    // game-over is shown via the DOM result screen; the canvas only owns the
    // pause overlay (shown whenever paused, on any board).
    if (this.showOverlays && this.engine.gameOver) this.drawGameOver(ctx);
    else if (this.paused) this.drawPauseOverlay(ctx);

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
    // deadline line at the very top of the field: the moment a panel touches
    // this line it's game over. Pulses red while in the danger zone.
    const inDanger = this.engine.danger && !this.engine.gameOver;
    const pulse = inDanger ? 0.55 + 0.45 * Math.abs(Math.sin(this.engine.frame * 0.25)) : 0.5;
    ctx.strokeStyle = inDanger
      ? `rgba(255,60,90,${pulse})`
      : "rgba(255,150,60,0.5)";
    ctx.lineWidth = inDanger ? 2.5 : 1.6;
    ctx.shadowColor = inDanger ? "#ff3b5c" : "transparent";
    ctx.shadowBlur = inDanger ? 12 : 0;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.lineTo(x + w, y + 1);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // clip playfield so rising blocks don't spill out the top
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y - 2, w, h + 2);
    ctx.clip();
    this._clipped = true;
  }

  drawBoardCells(ctx) {
    const panic = this.engine.danger && !this.engine.gameOver;
    for (let gy = 0; gy < C.GRID_H; gy++) {
      for (let gx = 0; gx < C.GRID_W; gx++) {
        const b = this.engine.board.cells[idx(gx, gy)];
        if (b.color === Color.NONE) continue;
        if (b.state === State.SWAPPING) continue; // drawn by drawSwap
        const px = this.originX + gx * this.cell;
        let py = this.cellScreenY(gx, gy);
        // PANIC: settled blocks get the jitters and bob up/down (パネポン風)
        if (panic && b.state === State.IDLE) {
          py += Math.sin(this.engine.frame * 0.5 + gx * 0.8 + gy * 0.35) * (this.cell * 0.07);
        }
        this.drawBlock(ctx, px, py, b, false, panic);
      }
    }
    this.drawSwap(ctx);
  }

  // Animated swap: instead of a flat card-flip (which looked paper-thin), the
  // two plates LIFT off the board — rising on a hydraulic arc with a cast
  // shadow and a slight pop in scale — then settle into their new slots. This
  // sells real 3D depth ("立体感").
  drawSwap(ctx) {
    const sw = this.engine.activeSwap;
    if (!sw) return;
    const { x, y, timer } = sw;
    const cell = this.cell;
    const a = this.engine.board.cells[idx(x, y)];
    const b = this.engine.board.cells[idx(x + 1, y)];
    const raw = 1 - Math.max(0, timer) / C.SWAP_TIME; // 0..1
    const p = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2; // ease
    const py = this.cellScreenY(x, y);
    const pxL = this.originX + x * cell;
    const arc = Math.sin(raw * Math.PI); // 0 -> 1 -> 0 lift envelope

    const sides = [
      { blk: a, sx: pxL + p * cell, lead: raw < 0.5 },
      { blk: b, sx: pxL + cell - p * cell, lead: raw >= 0.5 },
    ];
    // draw the trailing piece first so the leading one rides on top mid-cross
    sides.sort((m, n) => (m.lead ? 1 : 0) - (n.lead ? 1 : 0));
    for (const sd of sides) {
      if (sd.blk.color === Color.NONE) continue;
      const lift = arc * cell * 0.3; // height the plate rises off the board
      const scale = 1 + arc * 0.14; // pops toward the viewer at the apex

      // cast shadow on the board — offset/softened as the plate rises higher
      ctx.save();
      ctx.globalAlpha = 0.45 - arc * 0.18;
      ctx.fillStyle = "#01030a";
      const sIn = cell * 0.12 + arc * cell * 0.06;
      this.chamferRect(
        ctx, sd.sx + sIn, py + sIn + lift * 0.45 + 3,
        cell - sIn * 2, cell - sIn * 2, cell * 0.16
      );
      ctx.fill();
      ctx.restore();

      // the lifted plate itself
      ctx.save();
      ctx.translate(sd.sx + cell / 2, py + cell / 2 - lift);
      ctx.scale(scale, scale);
      ctx.translate(-(cell / 2), -(cell / 2));
      this.drawBlock(ctx, 0, 0, { color: sd.blk.color, state: State.IDLE, timer: 0 }, false, false);
      ctx.restore();
    }
  }

  drawNextRow(ctx) {
    const row = this.engine.board.nextRow;
    const cell = this.cell;
    const baseY = this.originY + C.GRID_H * cell - this.riseFrac() * cell;
    ctx.save();
    for (let gx = 0; gx < C.GRID_W; gx++) {
      if (row[gx] === Color.NONE) continue;
      const ramp = PALETTE[row[gx]] || PALETTE[Color.WHITE];
      const px = this.originX + gx * cell;
      const inset = cell * 0.07;
      const x = px + inset,
        y = baseY + inset,
        s = cell - inset * 2;
      // greyed "not yet active" armor plate: desaturated body, faint color hint
      ctx.globalAlpha = 0.85;
      const g = ctx.createLinearGradient(x, y, x, y + s);
      g.addColorStop(0, "#2a3346");
      g.addColorStop(1, "#161c28");
      ctx.fillStyle = g;
      this.chamferRect(ctx, x, y, s, s, cell * 0.18);
      ctx.fill();
      // dim color tint so you can still tell what's coming
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = ramp.core;
      ctx.fill();
      // locked outline + hazard hatch
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#516482";
      this.chamferRect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, cell * 0.16);
      ctx.stroke();
      ctx.globalAlpha = 0.18;
      ctx.beginPath();
      for (let i = -s; i < s; i += 7) {
        ctx.moveTo(x + i, y + s);
        ctx.lineTo(x + i + s, y);
      }
      ctx.strokeStyle = "#8fb0d8";
      ctx.stroke();
      // faint glyph
      ctx.globalAlpha = 0.5;
      this.drawGlyph(ctx, ramp.glyph, x + s / 2, y + s * 0.5, s * 0.15, "#9fb6d6");
    }
    ctx.restore();
    if (this._clipped) {
      ctx.restore();
      this._clipped = false;
    }
  }

  // Each garbage is ONE big armored slab (sized by the chain/combo that sent
  // it). As it unzips, the bottom panels are revealed as normal panels while
  // the remaining slab shrinks from the bottom.
  drawGarbage(ctx) {
    const cell = this.cell;
    for (const g of this.engine.board.garbages) {
      const riseY = -this.riseFrac() * cell + (g.fallOff / C.FALL_UNIT) * cell;
      const flash =
        (g.state === GState.FLASHING || g.state === GState.HOLD) &&
        (this.engine.frame >> 2) % 2 === 0;
      const fullRows = Math.floor((g.revealed || 0) / g.w);
      const slabRows = g.h - fullRows; // remaining slab (incl. partial row)
      if (slabRows > 0) {
        this.drawGarbageSlab(
          ctx,
          this.originX + g.x * cell,
          this.originY + g.y * cell + riseY,
          g.w * cell,
          slabRows * cell,
          flash
        );
      }
      // already-unzipped panels, drawn on top as their revealed colours
      for (let order = 0; order < (g.revealed || 0); order++) {
        const cx = g.x + (order % g.w);
        const cy = g.y + g.h - 1 - Math.floor(order / g.w);
        this.drawBlock(
          ctx,
          this.originX + cx * cell,
          this.originY + cy * cell + riseY,
          { color: g.colors[order], state: State.IDLE, timer: 0 },
          false,
          false
        );
      }
    }
  }

  drawGarbageSlab(ctx, px, py, w, h, flash) {
    const pad = 2.5;
    const x = px + pad, y = py + pad, bw = w - pad * 2, bh = h - pad * 2;
    ctx.save();
    ctx.shadowColor = flash ? "#ffffff" : "rgba(0,0,0,0.6)";
    ctx.shadowBlur = flash ? 26 : 10;
    const grad = ctx.createLinearGradient(x, y, x, y + bh);
    if (flash) {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#d6e6ff");
    } else {
      grad.addColorStop(0, "#6b7790");
      grad.addColorStop(0.5, "#3c465f");
      grad.addColorStop(1, "#212838");
    }
    ctx.fillStyle = grad;
    this.roundRect(ctx, x, y, bw, bh, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    // interior detailing clipped to the slab: hazard stripes + rivets
    ctx.save();
    this.roundRect(ctx, x, y, bw, bh, 8);
    ctx.clip();
    ctx.globalAlpha = flash ? 0.16 : 0.3;
    ctx.strokeStyle = "#f5c451";
    ctx.lineWidth = 6;
    for (let i = -bh; i < bw + bh; i += 24) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i - bh, y + bh);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "rgba(8,14,28,0.8)";
    for (const [fx, fy] of [[0.07, 0.09], [0.93, 0.09], [0.07, 0.91], [0.93, 0.91]]) {
      ctx.beginPath();
      ctx.arc(x + bw * fx, y + bh * fy, Math.max(1.4, this.cell * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }

    // one big grumpy face centered on the slab
    const fs = Math.min(bw, bh) * 0.6;
    this.drawGarbageFace(ctx, x + bw / 2 - fs / 2, y + bh / 2 - fs / 2, fs, flash);

    ctx.strokeStyle = flash ? "#ffffff" : "rgba(150,190,255,0.5)";
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, x + 0.8, y + 0.8, bw - 1.6, bh - 1.6, 7);
    ctx.stroke();
    ctx.restore();
  }

  // A grumpy little face so garbage panels read as menacing "enemies".
  drawGarbageFace(ctx, x, y, s, flash) {
    ctx.save();
    ctx.strokeStyle = flash ? "#3a4a66" : "#0c1424";
    ctx.fillStyle = flash ? "#3a4a66" : "#0c1424";
    ctx.lineWidth = Math.max(1.4, s * 0.045);
    ctx.lineCap = "round";
    const ey = y + s * 0.42;
    // angry slanted brows
    ctx.beginPath();
    ctx.moveTo(x + s * 0.26, ey - s * 0.12);
    ctx.lineTo(x + s * 0.42, ey - s * 0.02);
    ctx.moveTo(x + s * 0.74, ey - s * 0.12);
    ctx.lineTo(x + s * 0.58, ey - s * 0.02);
    ctx.stroke();
    // eyes
    ctx.beginPath();
    ctx.arc(x + s * 0.36, ey + s * 0.06, Math.max(1.2, s * 0.05), 0, Math.PI * 2);
    ctx.arc(x + s * 0.64, ey + s * 0.06, Math.max(1.2, s * 0.05), 0, Math.PI * 2);
    ctx.fill();
    // flat grimace
    ctx.beginPath();
    ctx.moveTo(x + s * 0.36, y + s * 0.72);
    ctx.lineTo(x + s * 0.64, y + s * 0.72);
    ctx.stroke();
    ctx.restore();
  }

  // Small board title used in versus mode ("YOU" / "CPU").
  drawLabel(ctx) {
    ctx.save();
    ctx.fillStyle = UI.hud;
    ctx.font = "bold 14px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.shadowColor = UI.frameLit;
    ctx.shadowBlur = 8;
    ctx.fillText(this.label, this.originX + this.boardW / 2, this.originY - this.cell * 1.9);
    ctx.restore();
  }

  drawBlock(ctx, px, py, b, dim, panic) {
    const cell = this.cell;
    const ramp = PALETTE[b.color] || PALETTE[Color.WHITE];
    const inset = cell * 0.06;
    const x = px + inset;
    const y = py + inset;
    const s = cell - inset * 2;
    const c = s * 0.2; // chamfer (cut corner) size
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

    // --- extruded side: a darker plate offset downward so the block reads as
    // a solid, thick part rather than a flat sticker (depth on every panel) ---
    if (!flash && !dim) {
      const dz = Math.max(2.5, s * 0.1);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
      const side = ctx.createLinearGradient(x, y, x, y + s + dz);
      side.addColorStop(0, ramp.dark);
      side.addColorStop(1, "#02040a");
      ctx.fillStyle = side;
      this.chamferRect(ctx, x, y + dz, s, s, c);
      ctx.fill();
      ctx.restore();
    }

    // --- armor plate body (chamfered) with metallic vertical gradient ---
    ctx.shadowColor = ramp.glow;
    ctx.shadowBlur = dim ? 3 : flash ? 26 : 13;
    const grad = ctx.createLinearGradient(x, y, x, y + s);
    if (flash) {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(0.5, ramp.edge);
      grad.addColorStop(1, "#ffffff");
    } else {
      grad.addColorStop(0, ramp.edge);
      grad.addColorStop(0.18, ramp.core);
      grad.addColorStop(0.55, ramp.core);
      grad.addColorStop(1, ramp.dark);
    }
    ctx.fillStyle = grad;
    this.chamferRect(ctx, x, y, s, s, c);
    ctx.fill();
    ctx.shadowBlur = 0;

    // specular highlight band near the top edge
    ctx.globalAlpha = alpha * (flash ? 0.2 : 0.4);
    ctx.fillStyle = "#ffffff";
    this.chamferRect(ctx, x + s * 0.12, y + s * 0.08, s * 0.76, s * 0.16, s * 0.06);
    ctx.fill();
    ctx.globalAlpha = alpha;

    // bevel: bright top/left rim + dark bottom/right
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = flash ? "#ffffff" : ramp.edge;
    this.chamferRect(ctx, x + 0.8, y + 0.8, s - 1.6, s - 1.6, c);
    ctx.stroke();

    if (!flash) {
      // --- mecha panel detailing ---
      ctx.strokeStyle = ramp.dark;
      ctx.globalAlpha = alpha * 0.55;
      ctx.lineWidth = 1;
      // main horizontal seam + short vertical seam (panel split)
      ctx.beginPath();
      ctx.moveTo(x + c * 0.6, y + s * 0.6);
      ctx.lineTo(x + s - c * 0.6, y + s * 0.6);
      ctx.moveTo(x + s * 0.5, y + s * 0.6);
      ctx.lineTo(x + s * 0.5, y + s - c * 0.5);
      ctx.stroke();
      // vents / louvers (lower-left)
      ctx.globalAlpha = alpha * 0.5;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const vy = y + s * 0.7 + i * s * 0.09;
        ctx.beginPath();
        ctx.moveTo(x + s * 0.16, vy);
        ctx.lineTo(x + s * 0.4, vy);
        ctx.stroke();
      }
      // corner rivets
      ctx.globalAlpha = alpha * 0.7;
      ctx.fillStyle = ramp.dark;
      const rv = [
        [x + c * 0.7, y + c * 0.7],
        [x + s - c * 0.7, y + c * 0.7],
        [x + c * 0.7, y + s - c * 0.7],
        [x + s - c * 0.7, y + s - c * 0.7],
      ];
      for (const [rx, ry] of rv) {
        ctx.beginPath();
        ctx.arc(rx, ry, Math.max(1, s * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
      // glowing sensor light (camera eye), upper-right
      ctx.globalAlpha = alpha;
      ctx.shadowColor = ramp.glow;
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x + s * 0.74, y + s * 0.26, Math.max(1.3, s * 0.05), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // --- unit insignia / colorblind glyph, surprised face on clear, or the
    //     worried "panic" face while the stack is in the danger zone ---
    ctx.globalAlpha = alpha * 0.92;
    if (b.state === State.FACE) {
      this.drawFace(ctx, x, y, s);
    } else if (panic && !flash) {
      this.drawPanicFace(ctx, x, y, s);
    } else {
      this.drawGlyph(
        ctx,
        ramp.glyph,
        x + s * 0.32,
        y + s * 0.34,
        s * 0.13,
        flash ? "#0a1430" : "#0c1424"
      );
    }

    ctx.restore();
  }

  // Worried face shown on every settled block when the stack is dangerously
  // high — slanted anxious eyes, a wavering frown and a sweat bead. Paired
  // with the per-block bob in drawBoardCells for the classic Panel de Pon panic.
  drawPanicFace(ctx, x, y, s) {
    ctx.save();
    ctx.strokeStyle = "#0a1430";
    ctx.lineWidth = Math.max(1.6, s * 0.05);
    ctx.lineCap = "round";
    // anxious slanted eyes (>  <)
    const ey = y + s * 0.4;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.28, ey - s * 0.07);
    ctx.lineTo(x + s * 0.42, ey + s * 0.04);
    ctx.moveTo(x + s * 0.72, ey - s * 0.07);
    ctx.lineTo(x + s * 0.58, ey + s * 0.04);
    ctx.stroke();
    // wavering frown
    ctx.beginPath();
    ctx.moveTo(x + s * 0.34, y + s * 0.68);
    ctx.quadraticCurveTo(x + s * 0.43, y + s * 0.58, x + s * 0.5, y + s * 0.66);
    ctx.quadraticCurveTo(x + s * 0.57, y + s * 0.74, x + s * 0.66, y + s * 0.64);
    ctx.stroke();
    // sweat bead (upper right), jittering with the frame
    const j = Math.sin(this.engine.frame * 0.6 + x) * s * 0.02;
    ctx.fillStyle = "#bfe9ff";
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.8, y + s * 0.22 + j);
    ctx.quadraticCurveTo(x + s * 0.9, y + s * 0.38 + j, x + s * 0.8, y + s * 0.42 + j);
    ctx.quadraticCurveTo(x + s * 0.7, y + s * 0.38 + j, x + s * 0.8, y + s * 0.22 + j);
    ctx.fill();
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
    if (this.bannerLife <= 0) {
      this.bannerText = ""; // clear so the next COMBO/CHAIN always shows
      return;
    }
    this.bannerLife--;
    const t = this.bannerLife / 70;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const scale = 1 + (1 - t) * 0.4;
    // center on THIS board (not the whole screen) so vs banners don't spill
    // onto the opponent's side; size the font to the board width so it fits.
    ctx.translate(this.originX + this.boardW / 2, this.originY + this.boardH * 0.4);
    ctx.scale(scale, scale);
    const fs = Math.max(18, Math.min(40, this.boardW / Math.max(6, this.bannerText.length) * 1.5));
    ctx.font = `bold ${fs}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = UI.accent;
    ctx.shadowBlur = 24;
    ctx.fillText(this.bannerText, 0, 0);
    ctx.restore();
  }

  drawDanger(ctx) {
    const a = (Math.sin(this.engine.frame * 0.3) + 1) * 0.5 * 0.18;
    const r = this.area || { x: 0, y: 0, w: this.W, h: this.H };
    ctx.save();
    ctx.fillStyle = `rgba(255,40,70,${a})`;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = (Math.sin(this.engine.frame * 0.3) + 1) * 0.5;
    ctx.fillStyle = UI.accent;
    ctx.font = "bold 16px ui-monospace, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText("! WARNING !", this.originX + this.boardW / 2, this.originY - this.cell * 0.4);
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

  // Octagonal "cut corner" plate used for the mecha blocks.
  chamferRect(ctx, x, y, w, h, c) {
    c = Math.min(c, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + c, y);
    ctx.lineTo(x + w - c, y);
    ctx.lineTo(x + w, y + c);
    ctx.lineTo(x + w, y + h - c);
    ctx.lineTo(x + w - c, y + h);
    ctx.lineTo(x + c, y + h);
    ctx.lineTo(x, y + h - c);
    ctx.lineTo(x, y + c);
    ctx.closePath();
  }

  drawPauseOverlay(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(2,6,16,0.66)";
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = UI.frameLit;
    ctx.shadowBlur = 24;
    ctx.font = "bold 34px ui-monospace, Menlo, monospace";
    ctx.fillText("PAUSED", this.W / 2, this.H / 2 - 10);
    ctx.shadowBlur = 0;
    ctx.font = "14px ui-monospace, Menlo, monospace";
    ctx.fillStyle = UI.hud;
    ctx.fillText("タップ / P で再開", this.W / 2, this.H / 2 + 26);
    ctx.restore();
  }
}
