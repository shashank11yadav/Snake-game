/**
 * Mulberry32: a 32-bit seeded PRNG. The whole generator state is one uint32,
 * so it can live inside the immutable game state and a game replays exactly
 * from (seed, inputs).
 */
export function nextRandom(seed: number): [value: number, nextSeed: number] {
  const s = (seed + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, s];
}

/** Integer in [0, n) plus the advanced seed. */
export function randomInt(seed: number, n: number): [value: number, nextSeed: number] {
  const [r, next] = nextRandom(seed);
  return [Math.floor(r * n), next];
}

/** Turns any number into a valid uint32 seed (NaN and floats included). */
export function normalizeSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}
