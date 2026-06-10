import { Color } from "../core/types.js";

// Each block color is a neon ramp tuned toward a Gundam / mobile-suit palette
// (RX-78 tricolor + Zeon green). `glyph` gives a colorblind-safe shape.
export const PALETTE = {
  [Color.WHITE]: {
    core: "#e9f4ff",
    edge: "#ffffff",
    glow: "#9fd0ff",
    dark: "#7d93b5",
    glyph: "circle",
  },
  [Color.BLUE]: {
    core: "#1f6bff",
    edge: "#6fb0ff",
    glow: "#2e7bff",
    dark: "#103a8c",
    glyph: "triangle",
  },
  [Color.RED]: {
    core: "#ff2f4e",
    edge: "#ff8597",
    glow: "#ff3b5c",
    dark: "#8c1022",
    glyph: "diamond",
  },
  [Color.YELLOW]: {
    core: "#ffca1f",
    edge: "#fff08a",
    glow: "#ffd23b",
    dark: "#8c6a10",
    glyph: "square",
  },
  [Color.GREEN]: {
    core: "#1fd47a",
    edge: "#86ffc0",
    glow: "#2bff95",
    dark: "#0c6a3c",
    glyph: "cross",
  },
};

export const UI = {
  bg0: "#04060f",
  bg1: "#0a1430",
  frame: "#2b4f8a",
  frameLit: "#5ea0ff",
  hud: "#9fd9ff",
  accent: "#ff3b6b",
  scan: "rgba(120,200,255,0.04)",
};
