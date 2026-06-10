// Mulberry32 — a tiny, fast, fully deterministic PRNG.
// Pure integer ops so it can be transliterated to Swift (UInt32 with &* / &+).
// State is a single 32-bit unsigned integer; serialize it for replays/netcode.

export function createRng(seed) {
  let state = seed >>> 0;
  return {
    // returns float in [0, 1)
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    // integer in [0, n)
    int(n) {
      return Math.floor(this.next() * n);
    },
    getState() {
      return state >>> 0;
    },
    setState(s) {
      state = s >>> 0;
    },
  };
}
