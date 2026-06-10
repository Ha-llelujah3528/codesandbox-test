// render.js - Canvas rendering of the mecha panels.
// Every panel is drawn as an extruded, beveled metal block with a unique
// emblem so it reads as a chunky Gundam-style part rather than a flat tile.
// During a swap the panel is lifted off the board (scale + cast shadow) to
// kill the "paper thin" look.

// Each color is a distinct mecha "part type": base metal + accent + emblem.
export const COLORS = [
  { id: "red",    base: "#c0392b", light: "#ff7b6b", dark: "#6e1810", accent: "#ffd0c0", emblem: "blade" },
  { id: "blue",   base: "#2471c4", light: "#74b9ff", dark: "#0e3566", accent: "#cfe6ff", emblem: "core" },
  { id: "green",  base: "#27a85a", light: "#7dffb0", dark: "#0d5128", accent: "#d2ffe0", emblem: "vent" },
  { id: "yellow", base: "#e2b007", light: "#ffe066", dark: "#6e5400", accent: "#fff4c0", emblem: "bolt" },
  { id: "purple", base: "#8e44ad", light: "#d18bff", dark: "#451752", accent: "#eed4ff", emblem: "eye" },
];

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bolt(ctx, x, y, r, light, dark) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = light;
  ctx.fill();
  // cross slot
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, r * 0.22);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y);
  ctx.lineTo(x + r * 0.5, y);
  ctx.moveTo(x, y - r * 0.5);
  ctx.lineTo(x, y + r * 0.5);
  ctx.stroke();
}

function emblem(ctx, cx, cy, s, color, glow) {
  ctx.save();
  ctx.translate(cx, cy);
  if (glow) {
    ctx.shadowColor = color.light;
    ctx.shadowBlur = s * 0.9;
  }
  ctx.fillStyle = color.accent;
  ctx.strokeStyle = color.dark;
  ctx.lineWidth = Math.max(1.5, s * 0.08);
  switch (color.emblem) {
    case "blade": // angular chevron
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s * 0.7, s * 0.6);
      ctx.lineTo(0, s * 0.25);
      ctx.lineTo(-s * 0.7, s * 0.6);
      ctx.closePath();
      break;
    case "core": // reactor ring
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
      ctx.moveTo(s * 0.4, 0);
      ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2);
      break;
    case "vent": // stacked slats
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        ctx.rect(-s * 0.7, i * s * 0.5 - s * 0.16, s * 1.4, s * 0.3);
      }
      break;
    case "bolt": // diamond hazard
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.lineTo(s, 0);
      ctx.lineTo(0, s);
      ctx.lineTo(-s, 0);
      ctx.closePath();
      break;
    case "eye": // mono-eye
      ctx.beginPath();
      ctx.ellipse(0, 0, s, s * 0.62, 0, 0, Math.PI * 2);
      break;
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Worried "panic" face used when the panel is in the danger zone, matching
// the Panel de Pon look. Eyes + sweat + frown.
function panicFace(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "#10131a";
  ctx.strokeStyle = "#10131a";
  ctx.lineWidth = Math.max(2, s * 0.12);
  ctx.lineCap = "round";
  // eyes (slanted, anxious)
  ctx.beginPath();
  ctx.moveTo(-s * 0.85, -s * 0.55);
  ctx.lineTo(-s * 0.25, -s * 0.25);
  ctx.moveTo(s * 0.85, -s * 0.55);
  ctx.lineTo(s * 0.25, -s * 0.25);
  ctx.stroke();
  // wavering frown
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, s * 0.55);
  ctx.quadraticCurveTo(-s * 0.2, s * 0.2, 0, s * 0.5);
  ctx.quadraticCurveTo(s * 0.2, s * 0.8, s * 0.55, s * 0.45);
  ctx.stroke();
  // sweat drop
  ctx.fillStyle = "#bfe9ff";
  ctx.beginPath();
  ctx.moveTo(s * 0.95, -s * 0.1);
  ctx.quadraticCurveTo(s * 1.15, s * 0.25, s * 0.95, s * 0.35);
  ctx.quadraticCurveTo(s * 0.75, s * 0.25, s * 0.95, -s * 0.1);
  ctx.fill();
  ctx.restore();
}

// Draw one panel. opts: { lift, scale, flash, face, glow }
//  - lift:  pixels to raise off the board (swap animation) -> drop shadow
//  - scale: 1.0 normal; >1 pops the panel toward the viewer during swap
//  - flash: 0..1 white flash while clearing
//  - face:  draw the worried panic face
//  - glow:  emblem glows (chain/active)
export function drawPanel(ctx, color, x, y, w, h, opts = {}) {
  const { lift = 0, scale = 1, flash = 0, face = false, glow = false } = opts;
  const cx = x + w / 2;
  const cy = y + h / 2 - lift;

  ctx.save();

  // Cast shadow grows with lift so a swapped panel clearly floats above board.
  if (lift > 0.5) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.5, 0.18 + lift / 40);
    ctx.fillStyle = "#000";
    rr(ctx, x + 3, y + 4 + lift * 0.4, w, h, 8);
    ctx.fill();
    ctx.restore();
  }

  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);

  const pad = 2.5;
  const bw = w - pad * 2;
  const bh = h - pad * 2;
  const depth = Math.max(4, bh * 0.12); // extruded side thickness

  // --- extruded dark base (the "side" of the block) for real 3D depth ---
  ctx.fillStyle = color.dark;
  rr(ctx, pad, pad + depth, bw, bh, 9);
  ctx.fill();

  // --- top face with metallic gradient ---
  const grad = ctx.createLinearGradient(pad, pad, pad + bw, pad + bh);
  grad.addColorStop(0, color.light);
  grad.addColorStop(0.45, color.base);
  grad.addColorStop(1, color.dark);
  ctx.fillStyle = grad;
  rr(ctx, pad, pad, bw, bh, 9);
  ctx.fill();

  // beveled highlight (top-left) + shade (bottom-right)
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.moveTo(pad + 4, pad + bh - 6);
  ctx.lineTo(pad + 4, pad + 6);
  ctx.lineTo(pad + bw - 6, pad + 4);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.moveTo(pad + bw - 4, pad + 6);
  ctx.lineTo(pad + bw - 4, pad + bh - 4);
  ctx.lineTo(pad + 6, pad + bh - 4);
  ctx.stroke();

  // panel-line seams (mecha paneling)
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad + bw * 0.22, pad + 5);
  ctx.lineTo(pad + bw * 0.22, pad + bh - 5);
  ctx.moveTo(pad + 5, pad + bh * 0.72);
  ctx.lineTo(pad + bw - 5, pad + bh * 0.72);
  ctx.stroke();

  // corner bolts
  const br = Math.max(2.4, bw * 0.06);
  bolt(ctx, pad + br + 3, pad + br + 3, br, color.light, color.dark);
  bolt(ctx, pad + bw - br - 3, pad + br + 3, br, color.light, color.dark);
  bolt(ctx, pad + br + 3, pad + bh - br - 3, br, color.light, color.dark);
  bolt(ctx, pad + bw - br - 3, pad + bh - br - 3, br, color.light, color.dark);

  // specular sheen
  ctx.save();
  rr(ctx, pad, pad, bw, bh, 9);
  ctx.clip();
  const sheen = ctx.createLinearGradient(pad, pad, pad + bw * 0.6, pad + bh * 0.6);
  sheen.addColorStop(0, "rgba(255,255,255,0.35)");
  sheen.addColorStop(0.3, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(pad, pad, bw, bh);
  ctx.restore();

  // emblem or panic face in the center
  if (face) {
    panicFace(ctx, w / 2, h / 2, bh * 0.2);
  } else {
    emblem(ctx, w / 2, h / 2, bh * 0.2, color, glow);
  }

  // clearing flash
  if (flash > 0) {
    ctx.globalAlpha = flash;
    ctx.fillStyle = "#fff";
    rr(ctx, pad, pad, bw, bh, 9);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
